import {z} from 'zod'
import {places,quests,legacyQuests} from './content.js'

export const ANSWER_MAX_LENGTH = 1000
export const actionAnswerSchema = z.object({
  actionId:z.string().min(1).max(100),
  text:z.string().trim().min(1).max(ANSWER_MAX_LENGTH),
  mode:z.enum(['observed','uncertain']),
  submittedAt:z.string().datetime(),
}).strict()
const ids = (length,max) => z.array(z.string().min(1).max(length)).max(max)
const common = {
  name:z.string().trim().min(1).max(60),
  startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s),
  days:z.number().int().min(1).max(30),
  selectedPlaceIds:ids(80,80),skippedPlaceIds:ids(80,80),completedActionIds:ids(100,500),
  notes:z.array(z.object({id:z.string().uuid(),placeId:z.string().min(1).max(80),text:z.string().max(3000),createdAt:z.string().datetime()}).strict()).max(200),
  activeQuestId:z.string().min(1).max(100).nullable(),ended:z.boolean(),updatedAt:z.string().datetime(),
}
const placeIds = new Set(places.map(p=>p.id))
const questIds = new Set(quests.map(q=>q.id))
const legacyQuestIds = new Set(legacyQuests.map(q=>q.id))
const legacyActionIds = new Set(legacyQuests.flatMap(q=>q.actions.map(a=>a.id)))
const actionsByPlace = new Map(places.map(p=>[p.id,quests.filter(q=>q.placeId===p.id).flatMap(q=>q.actions.map(a=>a.id))]))
const actionPlaces = new Map(quests.flatMap(q=>q.actions.map(a=>[a.id,q.placeId])))
function checkReferences(s,ctx,legacy=false) {
  const issue=(path,message)=>ctx.addIssue({code:z.ZodIssueCode.custom,path,message})
  for(const key of ['selectedPlaceIds','skippedPlaceIds']) {
    if(s[key].some(id=>!placeIds.has(id)))issue([key],'存档含有不支持的地点')
    if(!legacy&&new Set(s[key]).size!==s[key].length)issue([key],'地点不可重复')
  }
  if(s.notes.some(n=>n.placeId!=='legacy'&&!placeIds.has(n.placeId)))issue(['notes'],'笔记地点无效')
  if(s.activeQuestId&&!(legacy?legacyQuestIds:questIds).has(s.activeQuestId))issue(['activeQuestId'],'当前任务无效')
  const oldIds=legacy?s.completedActionIds:s.legacyCompletedActionIds
  if(oldIds.some(id=>!legacyActionIds.has(id)))issue([legacy?'completedActionIds':'legacyCompletedActionIds'],'旧任务编号无效')
  if(!legacy&&new Set(oldIds).size!==oldIds.length)issue(['legacyCompletedActionIds'],'旧行动不可重复')
}
const v1 = z.object({...common,schemaVersion:z.literal(1),contentVersion:z.literal('shanhe-2026-v1')}).strict().superRefine((s,ctx)=>checkReferences(s,ctx,true)).transform(s=>({
  ...s,schemaVersion:2,contentVersion:'shanhe-2026-v2',actionAnswers:[],
  selectedPlaceIds:[...new Set(s.selectedPlaceIds)],skippedPlaceIds:[...new Set(s.skippedPlaceIds)],
  legacyCompletedActionIds:[...new Set(s.completedActionIds)],completedActionIds:[],
  activeQuestId:s.activeQuestId?(quests.find(q=>q.placeId===legacyQuests.find(old=>old.id===s.activeQuestId)?.placeId)?.id??null):null,
}))
const v2 = z.object({...common,schemaVersion:z.literal(2),contentVersion:z.literal('shanhe-2026-v2'),actionAnswers:z.array(actionAnswerSchema).max(500),legacyCompletedActionIds:ids(100,500)}).strict().superRefine((s,ctx)=>{
  checkReferences(s,ctx)
  const issue=(path,message)=>ctx.addIssue({code:z.ZodIssueCode.custom,path,message})
  const answered=new Set(),counts=new Map()
  for(const [index,answer] of s.actionAnswers.entries()) {
    const place=actionPlaces.get(answer.actionId),count=counts.get(place)||0
    if(!place||answered.has(answer.actionId)||actionsByPlace.get(place)?.[count]!==answer.actionId)issue(['actionAnswers',index,'actionId'],'行动必须按地点章节顺序回答且不可重复')
    answered.add(answer.actionId);counts.set(place,count+1)
  }
  if(s.completedActionIds.length!==answered.size||new Set(s.completedActionIds).size!==answered.size||s.completedActionIds.some(id=>!answered.has(id)))issue(['completedActionIds'],'完成进度必须与已保存答案一致')
}).transform(s=>({...s,completedActionIds:s.actionAnswers.map(a=>a.actionId)}))
export const journeyStateSchema = z.union([v1,v2]).pipe(v2)
export const STATE_MAX_BYTES = 850_000
export const journeyStateWriteSchema = journeyStateSchema.refine(s=>new TextEncoder().encode(JSON.stringify(s)).length<=STATE_MAX_BYTES,{message:'旅程记录已接近容量上限，请先导出并整理笔记或新建旅程'})
export const journalExportSchema = z.object({format:z.literal('shanhe-journal'),version:z.literal(1),exportedAt:z.string().datetime(),state:journeyStateSchema}).strict()
export const usernameSchema=z.string().trim().regex(/^[a-zA-Z0-9_\u4e00-\u9fff-]{2,30}$/)
export const passwordSchema=z.string().min(12).max(128)
export const mutationSchema=z.object({operationId:z.string().uuid(),intendedUserId:z.string().uuid(),storageEpoch:z.string().uuid(),baseRevision:z.number().int().nonnegative()}).strict()

import {places,quests,legacyQuests} from './content.js'
import {journeyStateSchema,journeyStateWriteSchema,actionAnswerSchema,ANSWER_MAX_LENGTH} from './schema.js'

export const MAX_ANSWER_LENGTH = ANSWER_MAX_LENGTH
/** @param {import('zod').infer<typeof journeyStateSchema>} state @param {string} questId */
export function isQuestComplete(state,questId) {
  const quest=quests.find(q=>q.id===questId)
  const answered=new Set(state.actionAnswers.map(a=>a.actionId))
  return !!quest&&quest.actions.every(a=>answered.has(a.id))
}
/** @param {import('zod').infer<typeof journeyStateSchema>} state @param {string} questId */
export function canOpenQuest(state,questId) {
  const quest=quests.find(q=>q.id===questId)
  if(!quest)return false
  const group=quests.filter(q=>q.placeId===quest.placeId),index=group.findIndex(q=>q.id===questId)
  return group.slice(0,index).every(q=>isQuestComplete(state,q.id))
}
/** @param {import('zod').infer<typeof journeyStateSchema>} state @param {string} placeId */
export function nextQuestForPlace(state,placeId) {
  return quests.find(q=>q.placeId===placeId&&!isQuestComplete(state,q.id)&&canOpenQuest(state,q.id))||null
}
/** @param {unknown} input @param {string} actionId @param {string} text @param {'observed'|'uncertain'} mode */
export function submitAnswer(input,actionId,text,mode) {
  const state=journeyStateSchema.parse(input)
  if(state.ended)throw new Error('旅程已收束，请重新翻开路书后继续')
  const parsed=actionAnswerSchema.safeParse({actionId,text,mode,submittedAt:new Date().toISOString()})
  if(!parsed.success)throw new Error(`请留下1至${MAX_ANSWER_LENGTH}字的记录并选择记录类型`)
  const quest=quests.find(q=>q.actions.some(a=>a.id===actionId))
  if(!quest||!canOpenQuest(state,quest.id))throw new Error('请先完成当前地点的前置调查')
  const answered=new Set(state.actionAnswers.map(a=>a.actionId))
  if(quest.actions.find(a=>!answered.has(a.id))?.id!==actionId)throw new Error('这项行动已提交或尚未解锁')
  const actionAnswers=[...state.actionAnswers,parsed.data]
  return journeyStateWriteSchema.parse({...state,actionAnswers,completedActionIds:actionAnswers.map(a=>a.actionId),activeQuestId:quest.id,updatedAt:parsed.data.submittedAt})
}
/** @param {unknown} input */
export function exploredPlaceIds(input) {
  const state=journeyStateSchema.parse(input),answered=new Set(state.actionAnswers.map(a=>a.actionId)),legacy=new Set(state.legacyCompletedActionIds)
  return new Set(places.filter(p=>quests.some(q=>q.placeId===p.id&&q.actions.some(a=>answered.has(a.id)))||legacyQuests.some(q=>q.placeId===p.id&&q.actions.some(a=>legacy.has(a.id)))).map(p=>p.id))
}

import test from 'node:test'
import assert from 'node:assert/strict'
import {places,quests,days,adventures,legacyQuests,guanzhongStoryIds} from '../shared/content.js'
import {journeyStateSchema,journalExportSchema} from '../shared/schema.js'
import {submitAnswer,canOpenQuest,nextQuestForPlace} from '../shared/progress.js'
test('11天内容引用完整，任务行动唯一，剧情不依赖秦直道',()=>{
 assert.equal(days.length,11);const placeIds=new Set(places.map(p=>p.id));assert.equal(placeIds.size,places.length)
 const actions=quests.flatMap(q=>q.actions.map(a=>a.id));assert.equal(new Set(actions).size,actions.length)
 for(const day of days)for(const id of day.placeIds)assert.ok(placeIds.has(id))
 for(const q of quests){assert.ok(placeIds.has(q.placeId));assert.ok(q.actions.length>=3&&q.actions.length<=5);if(q.nextQuestId)assert.equal(quests.find(n=>n.id===q.nextQuestId)?.placeId,q.placeId)}
 assert.ok(quests.filter(q=>!['fuxian','ordos-road'].includes(q.placeId)).length>=8)
 for(const p of places){if(p.sourceUrl)assert.ok(['http:','https:'].includes(new URL(p.sourceUrl).protocol));if(!p.verified)assert.equal(p.address,'')}
})
test('全部地点有独立主线、路线与三章递进，旧ID不被复用',()=>{
 assert.equal(places.length,28)
 assert.equal(quests.length,84)
 assert.equal(quests.flatMap(q=>q.actions).length,261)
 assert.deepEqual(new Set(Object.keys(adventures)),new Set(places.map(p=>p.id)))
 assert.equal(new Set(Object.values(adventures).map(a=>a.title)).size,places.length)
 const oldIds=new Set(legacyQuests.flatMap(q=>q.actions.map(a=>a.id)))
 assert.equal(oldIds.size,45)
 for(const place of places){
   const adventure=adventures[place.id]
   for(const field of ['title','premise','goal','scope','route','duration','interests','safety','ending','uncertainEnding'])assert.ok(typeof adventure[field]==='string'&&adventure[field].trim().length>3,`${place.id}.${field}`)
   assert.equal(place.questIds.length,3)
   for(const [index,id] of place.questIds.entries()){
     const chapter=quests.find(q=>q.id===id)
     assert.equal(chapter.placeId,place.id)
     assert.equal(chapter.nextQuestId,place.questIds[index+1]||null)
     assert.ok(chapter.npc.includes('虚构'),`${id} NPC必须标注虚构`)
     for(const field of ['scene','location','clue'])assert.ok(chapter[field].trim().length>8,`${id}.${field}`)
     assert.ok(chapter.actions.length>=3&&chapter.actions.length<=5)
     for(const action of chapter.actions){
       assert.equal(oldIds.has(action.id),false)
       for(const field of ['text','prompt','response','uncertainResponse'])assert.ok(action[field].trim().length>5,`${action.id}.${field}`)
       assert.notEqual(action.response,action.uncertainResponse)
     }
   }
 }
})
test('关中四地单独可发现，三个新增点有导航来源与十二行动，不重复茂陵',()=>{
 assert.deepEqual(guanzhongStoryIds,['famensi','qianling','maoling','yide'])
 assert.equal(places.filter(p=>p.id==='maoling').length,1)
 const expectedNames={famensi:'法门寺',qianling:'乾陵',maoling:'茂陵博物馆',yide:'懿德太子墓'}
 for(const id of guanzhongStoryIds){
   const place=places.find(p=>p.id===id)
   assert.equal(place.name,expectedNames[id]);assert.equal(place.region,'关中')
   assert.ok(place.address.includes('陕西省'));assert.ok(place.address.includes(place.name))
   assert.ok(place.sourceUrl);assert.equal(place.sourceCheckedAt,'2026-09-28')
   assert.ok(days[0].placeIds.includes(id))
   assert.match(place.status,/核验|核实|公告/)
   const chapters=quests.filter(q=>q.placeId===id)
   assert.deepEqual(chapters.map(q=>q.actions.length),id==='maoling'?[3,3,3]:[4,4,4])
 }
 assert.notEqual(places.find(p=>p.id==='yide').address,places.find(p=>p.id==='qianling').address)
 assert.ok(!places.find(p=>p.id==='yide').address.includes('永泰'))
 assert.match(days[0].note,/独立半日/);assert.match(days[0].note,/二选一/)
 assert.match(adventures.famensi.safety,/馆藏不等于今天在展/)
 assert.match(adventures.yide.safety,/原件、复制和图版/)
 assert.match(adventures.qianling.scope,/不设地宫探访/)
})
test('原25地点225行动ID及次序冻结，新增故事只追加不占用原编号',()=>{
 const originalOrder=['yaozhou','maoling','xianling','yaowang','chenlu','jianling','liugongquan','huangling','loess','fuxian','wanfo','xuankong','shuofang','shimao','erlang','hongjiannao','ordos-road','yellowriver','yangshan','tanyaokou','gaoque','dajianhu','jilusai','aguimiao','canyon']
 const expected=originalOrder.flatMap(id=>[1,2,3].flatMap(chapter=>[1,2,3].map(action=>`${id}-v2-${chapter}-a${action}`)))
 assert.deepEqual(quests.slice(0,75).flatMap(q=>q.actions.map(a=>a.id)),expected)
 assert.deepEqual([...new Set(quests.slice(75).map(q=>q.placeId))],['famensi','qianling','yide'])
})
test('茂陵既有零至九条回答均可读取导出并从原位置继续，新地点不成为前置条件',()=>{
 const texts=['展牌名称已记在册','前缘的石形容易被裁去','伏地的轮廓显得沉稳','换角度后腿与身体连在一起','大片石面旁有细刻线','说明给了造型线索，侧面还不清楚','侧看改变了第一印象','背面未观察到','先看整体，再看细节']
 const ids=[1,2,3].flatMap(chapter=>[1,2,3].map(action=>`maoling-v2-${chapter}-a${action}`))
 const timestamp='2026-09-27T12:00:00.000Z'
 for(let count=0;count<=9;count++){
   const answers=ids.slice(0,count).map((actionId,index)=>({actionId,text:texts[index],mode:index===7?'uncertain':'observed',submittedAt:timestamp}))
   const old={schemaVersion:2,contentVersion:'shanhe-2026-v2',name:'原茂陵旅程',startDate:'2026-09-27',days:11,selectedPlaceIds:['maoling'],skippedPlaceIds:[],completedActionIds:ids.slice(0,count),actionAnswers:answers,legacyCompletedActionIds:['maoling-1-a1'],notes:[],activeQuestId:`maoling-v2-${Math.min(3,Math.floor(count/3)+1)}`,ended:false,updatedAt:timestamp}
   const parsed=journeyStateSchema.parse(old)
   assert.deepEqual(parsed,old)
   assert.deepEqual(journalExportSchema.parse(JSON.parse(JSON.stringify({format:'shanhe-journal',version:1,exportedAt:timestamp,state:old}))).state,old)
   assert.equal(canOpenQuest(parsed,'maoling-v2-2'),count>=3)
   assert.equal(canOpenQuest(parsed,'maoling-v2-3'),count>=6)
   for(const id of ['famensi','qianling','yide']){
     assert.equal(canOpenQuest(parsed,`${id}-v2-1`),true)
     assert.equal(canOpenQuest(parsed,`${id}-v2-2`),false)
   }
   if(count===9)assert.equal(nextQuestForPlace(parsed,'maoling'),null)
   else{
     assert.equal(nextQuestForPlace(parsed,'maoling').id,`maoling-v2-${Math.floor(count/3)+1}`)
     const resumed=submitAnswer(parsed,ids[count],'继续本来的观察','observed')
     assert.deepEqual(resumed.actionAnswers.slice(0,count),answers)
     assert.equal(resumed.actionAnswers.at(-1).actionId,ids[count])
   }
   const other=submitAnswer(parsed,'famensi-v2-1-a1','博物馆未确认，先用资料','uncertain')
   assert.deepEqual(other.actionAnswers.slice(0,count),answers)
   assert.equal(other.actionAnswers.at(-1).actionId,'famensi-v2-1-a1')
 }
})
test('拒绝未知结构字段、无效日期和超长旅程',()=>{
 const valid={schemaVersion:1,contentVersion:'shanhe-2026-v1',name:'旅程',startDate:'2026-09-27',days:11,selectedPlaceIds:[],skippedPlaceIds:[],completedActionIds:[],notes:[],activeQuestId:null,ended:false,updatedAt:new Date().toISOString()}
 assert.equal(journeyStateSchema.safeParse(valid).success,true)
 for(const patch of [{owner:'other'},{startDate:'2026-02-30'},{days:31},{notes:[{id:'bad'}]}])assert.equal(journeyStateSchema.safeParse({...valid,...patch}).success,false)
})

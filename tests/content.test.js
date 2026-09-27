import test from 'node:test'
import assert from 'node:assert/strict'
import {places,quests,days,adventures,legacyQuests} from '../shared/content.js'
import {journeyStateSchema} from '../shared/schema.js'
test('11天内容引用完整，任务行动唯一，剧情不依赖秦直道',()=>{
 assert.equal(days.length,11);const placeIds=new Set(places.map(p=>p.id));assert.equal(placeIds.size,places.length)
 const actions=quests.flatMap(q=>q.actions.map(a=>a.id));assert.equal(new Set(actions).size,actions.length)
 for(const day of days)for(const id of day.placeIds)assert.ok(placeIds.has(id))
 for(const q of quests){assert.ok(placeIds.has(q.placeId));assert.ok(q.actions.length>=3&&q.actions.length<=5);if(q.nextQuestId)assert.equal(quests.find(n=>n.id===q.nextQuestId)?.placeId,q.placeId)}
 assert.ok(quests.filter(q=>!['fuxian','ordos-road'].includes(q.placeId)).length>=8)
 for(const p of places){if(p.sourceUrl)assert.ok(['http:','https:'].includes(new URL(p.sourceUrl).protocol));if(!p.verified)assert.equal(p.address,'')}
})
test('全部地点有独立主线、路线与三章递进，旧ID不被复用',()=>{
 assert.equal(places.length,25)
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
test('拒绝未知结构字段、无效日期和超长旅程',()=>{
 const valid={schemaVersion:1,contentVersion:'shanhe-2026-v1',name:'旅程',startDate:'2026-09-27',days:11,selectedPlaceIds:[],skippedPlaceIds:[],completedActionIds:[],notes:[],activeQuestId:null,ended:false,updatedAt:new Date().toISOString()}
 assert.equal(journeyStateSchema.safeParse(valid).success,true)
 for(const patch of [{owner:'other'},{startDate:'2026-02-30'},{days:31},{notes:[{id:'bad'}]}])assert.equal(journeyStateSchema.safeParse({...valid,...patch}).success,false)
})

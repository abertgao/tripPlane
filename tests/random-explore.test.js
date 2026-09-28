import test from 'node:test'
import assert from 'node:assert/strict'
import {places, quests, regions, themes} from '../shared/content.js'
import {journeyStateSchema, STATE_MAX_BYTES} from '../shared/schema.js'
import {filterExplorationPlaces, randomCandidates, drawRandomPlaces, appendRandomPlaces} from '../src/shanhe/random-explore.js'

const at = '2026-09-28T12:00:00.000Z'
const filters = {theme:'全部', region:'全部', query:''}
const state = (patch = {}) => journeyStateSchema.parse({schemaVersion:2, contentVersion:'shanhe-2026-v2', name:'随机追加验证', startDate:'2026-09-27', days:11, selectedPlaceIds:['yaozhou'], skippedPlaceIds:['xianling'], completedActionIds:[], actionAnswers:[], legacyCompletedActionIds:['yaozhou-1-a1'], notes:[], activeQuestId:quests[0].id, ended:false, updatedAt:at, ...patch})

test('随机探索：主题、地区与关键词严格取交集，且复用故事兴趣搜索', () => {
  assert.deepEqual(filterExplorationPlaces({theme:'寺窟与建筑', region:'关中', query:'壁画'}).map(p=>p.id), ['yide'])
  assert.deepEqual(filterExplorationPlaces({theme:'全部', region:'关中', query:'  迟了一千年的茶会  '}).map(p=>p.id), ['famensi'])
  assert.equal(filterExplorationPlaces({theme:'全部', region:'铜川', query:'壁画'}).length, 0)
  for (const region of regions) for (const theme of themes) {
    const expected = places.filter(p=>p.region===region && (theme==='全部'||p.theme===theme))
    assert.deepEqual(filterExplorationPlaces({region,theme,query:''}), expected)
  }
})

test('随机探索：排除收藏、跳过；保留待核验候选，不改输入', () => {
  const input = state(), before = structuredClone(input), catalog = structuredClone(places)
  const pool = randomCandidates(input, filters)
  assert.equal(pool.length, places.length - 2)
  assert.ok(pool.some(p=>!p.verified))
  assert.ok(pool.every(p=>!['yaozhou','xianling'].includes(p.id)))
  const choice = drawRandomPlaces(input, filters, pool.length)
  assert.equal(new Set(choice.placeIds).size, pool.length)
  assert.deepEqual([...choice.placeIds].sort(), pool.map(p=>p.id).sort())
  assert.deepEqual(input, before)
  assert.deepEqual(places, catalog)
})

test('随机探索：1处、全部及每个数量无重复且不越界', () => {
  const input = state(), scope = {...filters,region:'河套·阴山'}
  const pool = randomCandidates(input, scope)
  for (let count=1; count<=pool.length; count++) {
    const result = drawRandomPlaces(input, scope, count)
    assert.equal(result.placeIds.length, count)
    assert.equal(new Set(result.placeIds).size, count)
    assert.ok(result.placeIds.every(id=>pool.some(p=>p.id===id)))
  }
  assert.deepEqual(drawRandomPlaces(input, {...filters,query:'懿德'}, 1).placeIds, ['yide'])
})

test('随机探索：拒绝非法数量、空池、已收束、伪造筛选和额外字段', () => {
  for (const count of [0,-1,1.5,places.length+1,NaN,Infinity,'2']) assert.throws(()=>drawRandomPlaces(state(),filters,count))
  assert.throws(()=>drawRandomPlaces(state(),{...filters,query:'不存在的地点'},1))
  assert.throws(()=>drawRandomPlaces(state({ended:true}),filters,1))
  for (const invalid of [{...filters,region:'伪造地区'},{...filters,theme:'伪造主题'},{...filters,query:'a'.repeat(201)},{...filters,extra:true}]) assert.throws(()=>filterExplorationPlaces(invalid))
})

test('随机探索：CSPRNG拒绝有偏尾部再抽取，不使用随机排序', context => {
  let calls = 0
  context.mock.method(globalThis.crypto, 'getRandomValues', array => {array[0] = calls++ === 0 ? 0xffffffff : 0; return array})
  const scope = {...filters,region:'铜川'}, input = state({selectedPlaceIds:[],skippedPlaceIds:[]})
  const pool = randomCandidates(input,scope)
  assert.ok(pool.length>=3)
  const three = state({selectedPlaceIds:pool.slice(3).map(p=>p.id),skippedPlaceIds:[]})
  assert.equal(randomCandidates(three,scope).length,3)
  assert.equal(drawRandomPlaces(three,scope,1).placeIds[0],pool[0].id)
  assert.equal(calls,2)
})

test('随机探索：只追加且保留顺序、答案、旧勾选、手记、日期和任务', () => {
  const answer = {actionId:quests[0].actions[0].id,text:'真实记录',mode:'uncertain',submittedAt:at}
  const input = state({completedActionIds:[answer.actionId], actionAnswers:[answer], notes:[{id:crypto.randomUUID(),placeId:'yaozhou',text:'保留我的手记',createdAt:at}]})
  const before = structuredClone(input), selection = {filters,placeIds:['yide','famensi']}
  const result = appendRandomPlaces(input,selection,'2026-09-28T13:00:00.000Z')
  assert.equal(result.addedCount,2)
  assert.deepEqual(result.state.selectedPlaceIds,['yaozhou','yide','famensi'])
  for (const key of Object.keys(input).filter(key=>!['selectedPlaceIds','updatedAt'].includes(key))) assert.deepEqual(result.state[key],input[key])
  assert.deepEqual(input,before)
})

test('随机探索：基于最新记录追加、重复确认幂等、并发跳过拒绝整批', () => {
  const selection = {filters,placeIds:['yide','famensi']}
  const latest = state({selectedPlaceIds:['yaozhou','chenlu','yide']})
  const first = appendRandomPlaces(latest,selection,at)
  assert.equal(first.addedCount,1)
  assert.deepEqual(first.state.selectedPlaceIds,['yaozhou','chenlu','yide','famensi'])
  const again = appendRandomPlaces(first.state,selection,'2026-09-28T14:00:00.000Z')
  assert.equal(again.addedCount,0)
  assert.deepEqual(again.state,first.state)
  assert.throws(()=>appendRandomPlaces(state({skippedPlaceIds:['yide']}),selection,at),/重新抽选/)
})

test('随机探索：拒绝跨范围、未知或重复地点和不合法状态', () => {
  for (const selection of [{filters:{...filters,region:'铜川'},placeIds:['yide']},{filters,placeIds:['unknown']},{filters,placeIds:['yide','yide']},{filters,placeIds:[]},{filters,placeIds:['yide'],ended:true}]) assert.throws(()=>appendRandomPlaces(state(),selection,at))
  assert.throws(()=>appendRandomPlaces(state({ended:true}),{filters,placeIds:['yide']},at),/收束/)
  assert.throws(()=>appendRandomPlaces({...state(),actionAnswers:[{}]},{filters,placeIds:['yide']},at))
})

test('随机探索：旧大档可读取但不能追加超过写入容量，不破坏原档', () => {
  const notes = Array.from({length:110},()=>({id:crypto.randomUUID(),placeId:'yaozhou',text:'记'.repeat(3000),createdAt:at}))
  const input = state({notes}), before = JSON.stringify(input)
  assert.ok(Buffer.byteLength(before)>STATE_MAX_BYTES)
  assert.throws(()=>appendRandomPlaces(input,{filters,placeIds:['yide']},at))
  assert.equal(JSON.stringify(input),before)
})

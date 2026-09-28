import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdtempSync,rmSync} from 'node:fs'
import {resolve} from 'node:path'
import {openDb} from '../server/db.js'
import {createAIBudget} from '../server/ai-budget.js'
import {buildProviderRequest,parseProviderResponse,validateProposal,isAllowedProviderAddress} from '../server/provider.js'
import {journeyStateSchema,journeyStateWriteSchema,journalExportSchema,STATE_MAX_BYTES} from '../shared/schema.js'
import {submitAnswer,canOpenQuest,nextQuestForPlace,isQuestComplete,exploredPlaceIds,MAX_ANSWER_LENGTH} from '../shared/progress.js'
import {quests,places,legacyQuests} from '../shared/content.js'
const state=()=>({schemaVersion:1,contentVersion:'shanhe-2026-v1',name:'不传给模型的私人旅程名',startDate:'2026-09-27',days:11,selectedPlaceIds:['maoling','yaozhou','fuxian'],skippedPlaceIds:[],completedActionIds:[],notes:[{id:randomUUID(),placeId:'yaozhou',text:'PRIVATE_NOTE_DO_NOT_SEND',createdAt:new Date().toISOString()}],activeQuestId:'yaozhou-1',ended:false,updatedAt:new Date().toISOString()})
test('全部地点各自逐行动逐章推进，完成可回看且从不依赖旧勾选解锁',()=>{
 const source=state(),before=JSON.stringify(source)
 let progress=journeyStateSchema.parse(source)
 assert.equal(MAX_ANSWER_LENGTH,1000)
 assert.equal(canOpenQuest(progress,'unknown'),false);assert.equal(nextQuestForPlace(progress,'unknown'),null)
 for(const place of places){
  const chapters=quests.filter(q=>q.placeId===place.id)
  assert.equal(chapters.length,3);assert.equal(canOpenQuest(progress,chapters[0].id),true);assert.equal(canOpenQuest(progress,chapters[1].id),false)
  assert.throws(()=>submitAnswer(progress,chapters[1].actions[0].id,'越章','observed'))
  for(const quest of chapters){
   assert.equal(nextQuestForPlace(progress,place.id).id,quest.id)
   for(const [index,action] of quest.actions.entries()){
    if(index+1<quest.actions.length)assert.throws(()=>submitAnswer(progress,quest.actions[index+1].id,'越级','observed'))
    const previous=progress
    progress=submitAnswer(progress,action.id,'  真实记录  ',index%2?'uncertain':'observed')
    assert.equal(previous.actionAnswers.length+1,progress.actionAnswers.length)
    assert.equal(progress.actionAnswers.at(-1).text,'真实记录')
    assert.equal(progress.completedActionIds.at(-1),action.id)
    assert.throws(()=>submitAnswer(progress,action.id,'重复','observed'))
   }
   assert.equal(isQuestComplete(progress,quest.id),true);assert.equal(canOpenQuest(progress,quest.id),true)
  }
  assert.equal(nextQuestForPlace(progress,place.id),null)
 }
 assert.equal(progress.actionAnswers.length,quests.reduce((total,q)=>total+q.actions.length,0))
 assert.equal(exploredPlaceIds(progress).size,places.length)
 assert.deepEqual(journeyStateSchema.parse(JSON.parse(JSON.stringify(progress))),progress)
 assert.equal(JSON.stringify(source),before)
})
test('旧存档与导出迁移保留笔记和已探索记录，所有未知引用及混合版本被拒绝',()=>{
 const old={...state(),completedActionIds:legacyQuests.flatMap(q=>q.actions.map(a=>a.id))}
 const migrated=journeyStateSchema.parse(old)
 assert.equal(migrated.schemaVersion,2);assert.equal(migrated.contentVersion,'shanhe-2026-v2')
 assert.deepEqual(migrated.notes,old.notes);assert.deepEqual(migrated.legacyCompletedActionIds,old.completedActionIds)
 assert.deepEqual(migrated.actionAnswers,[]);assert.deepEqual(migrated.completedActionIds,[])
 assert.equal(migrated.activeQuestId,quests.find(q=>q.placeId==='yaozhou').id)
 assert.equal(canOpenQuest(migrated,quests.filter(q=>q.placeId==='yaozhou')[1].id),false)
 const wrapped={format:'shanhe-journal',version:1,exportedAt:new Date().toISOString(),state:old}
 assert.deepEqual(journalExportSchema.parse(wrapped).state,migrated)
 assert.deepEqual(journalExportSchema.parse({...wrapped,state:migrated}).state,migrated)
 const bad=[{...old,actionAnswers:[]},{...old,contentVersion:'shanhe-2026-v2'},{...old,selectedPlaceIds:['unknown']},{...old,skippedPlaceIds:['unknown']},{...old,completedActionIds:['unknown']},{...old,activeQuestId:'unknown'},{...old,notes:[{...old.notes[0],placeId:'unknown'}]},{...migrated,legacyCompletedActionIds:['unknown']},{...migrated,activeQuestId:'yaozhou-1'}]
 for(const value of bad)assert.equal(journeyStateSchema.safeParse(value).success,false)
})
test('空白、超长、非法模式、未知行动、伪造勾选与结束旅程不能产生答案',()=>{
 const initial=journeyStateSchema.parse(state()),action=quests.find(q=>q.placeId==='yaozhou').actions[0].id
 for(const text of ['', '   ', '\n\t', '字'.repeat(MAX_ANSWER_LENGTH+1)])assert.throws(()=>submitAnswer(initial,action,text,'observed'))
 for(const mode of ['invalid',null,{},undefined])assert.throws(()=>submitAnswer(initial,action,'记录',mode))
 assert.throws(()=>submitAnswer(initial,'unknown','记录','observed'))
 assert.throws(()=>submitAnswer({...initial,ended:true},action,'记录','observed'))
 assert.equal(journeyStateSchema.safeParse({...initial,completedActionIds:[action]}).success,false)
 const valid=submitAnswer(initial,action,'字'.repeat(MAX_ANSWER_LENGTH),'uncertain')
 assert.equal(valid.actionAnswers[0].text.length,MAX_ANSWER_LENGTH)
 assert.equal(journeyStateSchema.safeParse({...valid,actionAnswers:[{...valid.actionAnswers[0],submittedAt:'invalid'}]}).success,false)
 assert.equal(journeyStateSchema.safeParse({...valid,actionAnswers:[{...valid.actionAnswers[0],extra:'forged'}]}).success,false)
 assert.equal(journeyStateSchema.safeParse({...valid,actionAnswers:[...valid.actionAnswers,...valid.actionAnswers]}).success,false)
})
test('总容量限制新写入但不隐藏合法旧存档读取',()=>{
 const large=journeyStateSchema.parse({...state(),notes:Array.from({length:100},()=>({id:randomUUID(),placeId:'yaozhou',text:'字'.repeat(3000),createdAt:new Date().toISOString()}))})
 assert.ok(new TextEncoder().encode(JSON.stringify(large)).length>STATE_MAX_BYTES)
 assert.equal(journeyStateSchema.safeParse(large).success,true)
 assert.equal(journeyStateWriteSchema.safeParse(large).success,false)
 assert.throws(()=>submitAnswer(large,quests.find(q=>q.placeId==='yaozhou').actions[0].id,'记录','observed'))
})
test('DeepSeek请求使用低费用JSON非思考模式且不发送笔记和账户数据',()=>{
 const body=buildProviderRequest('请把旅程调整为十天',state())
 assert.equal(body.max_tokens,1200);assert.deepEqual(body.thinking,{type:'disabled'});assert.deepEqual(body.response_format,{type:'json_object'});assert.equal(body.stream,false)
 assert.ok(!JSON.stringify(body).includes('PRIVATE_NOTE_DO_NOT_SEND'));assert.ok(!JSON.stringify(body).includes('不传给模型的私人旅程名'))
})
test('新版回答与迁移旧勾选都保护探索，回答原文不进入AI请求',()=>{
 const quest=quests.find(q=>q.placeId==='yaozhou')
 const answered=submitAnswer(journeyStateSchema.parse(state()),quest.actions[0].id,'PRIVATE_ANSWER_DO_NOT_SEND','uncertain')
 const request=buildProviderRequest('减少一天',answered),serialized=JSON.stringify(request)
 assert.ok(!serialized.includes('PRIVATE_ANSWER_DO_NOT_SEND'));assert.ok(!serialized.includes('PRIVATE_NOTE_DO_NOT_SEND'))
 assert.ok(!serialized.includes('actionAnswers'));assert.ok(!serialized.includes('submittedAt'))
 const details=JSON.parse(request.messages[1].content)
 assert.ok(details.alreadyExplored.includes('yaozhou'));assert.ok(!details.candidates.some(p=>p.id==='yaozhou'))
 assert.throws(()=>validateProposal({summary:'跳过',changes:[{type:'skip_place',placeId:'yaozhou'}]},answered),{code:'INVALID_PROPOSAL'})
 const migrated=journeyStateSchema.parse({...state(),completedActionIds:['yaozhou-1-a1']})
 assert.deepEqual(migrated.actionAnswers,[])
 assert.throws(()=>validateProposal({summary:'跳过',changes:[{type:'skip_place',placeId:'yaozhou'}]},migrated),{code:'INVALID_PROPOSAL'})
 assert.ok(JSON.parse(buildProviderRequest('减少一天',migrated).messages[1].content).alreadyExplored.includes('yaozhou'))
})
test('拒绝SSRF特殊地址、IPv6映射和非法地址',()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','9.1.1.1','11.1.1.1','21.1.1.1','30.1.1.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','224.0.0.1','garbage'])assert.equal(isAllowedProviderAddress(ip),false,ip)
 assert.equal(isAllowedProviderAddress('8.8.8.8'),true)
})
test('提案仅改允许字段，支持无修改回答，拒绝已探索、未知和矛盾操作',()=>{
 assert.equal(validateProposal({summary:'建议改为十天',changes:[{type:'set_days',days:10}]},state()).changes.length,1)
 assert.equal(validateProposal({summary:'目前信息不足，先保留原计划',changes:[]},state()).changes.length,0)
 assert.equal(validateProposal({summary:'跳过待核点',changes:[{type:'skip_place',placeId:'fuxian'}]},state()).changes.length,1)
 for(const changes of [[{type:'choose_place',placeId:'missing'}],[{type:'choose_place',placeId:'fuxian'}],[{type:'skip_place',placeId:'maoling'},{type:'choose_place',placeId:'maoling'}],[{type:'patch',path:'/owner',value:'evil'}],[{type:'set_days',days:11}]])assert.throws(()=>validateProposal({summary:'建议',changes},state()))
 assert.throws(()=>validateProposal({summary:'建议',changes:[{type:'skip_place',placeId:'yaozhou'}]},{...state(),completedActionIds:['yaozhou-1-a1']}))
 assert.throws(()=>validateProposal({summary:'建议',changes:[{type:'set_days',days:2}]},{...state(),completedActionIds:['yaozhou-1-a1']}))
 assert.throws(()=>validateProposal({summary:'建议',changes:[{type:'set_days',days:10}],owner:'evil'},state()))
 const valid=JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({summary:'建议十天',changes:[{type:'set_days',days:10}]})}}]})
 assert.equal(parseProviderResponse(valid,state()).changes[0].days,10)
 assert.throws(()=>parseProviderResponse(valid.replace('"stop"','"length"'),state()),{code:'INVALID_PROPOSAL'})
 assert.throws(()=>parseProviderResponse('not json',state()),{code:'INVALID_PROPOSAL'})
})
test('调用额度持久化、失败也计数、每用户最多一个在途请求',async()=>{
 const dir=mkdtempSync(resolve('.runtime/ai-budget-test-'));let db=openDb(resolve(dir,'test.sqlite'))
 try{
  const uid=randomUUID(),clock=()=>Date.UTC(2026,8,27),budget=createAIBudget(db,{clock})
  await assert.rejects(budget(uid,async()=>{throw new Error('provider unavailable')}))
  let release;const inflight=budget(uid,()=>new Promise(r=>{release=r}))
  await assert.rejects(budget(uid,async()=>{}),{code:'AI_LIMIT'});release();await inflight
  for(let i=0;i<18;i++)await budget(uid,async()=>{})
  await assert.rejects(budget(uid,async()=>{}),{code:'AI_LIMIT'})
  db.close();db=openDb(resolve(dir,'test.sqlite'));await assert.rejects(createAIBudget(db,{clock})(uid,async()=>{}),{code:'AI_LIMIT'})
  await createAIBudget(db,{clock:()=>clock()+86400000})(uid,async()=>{})
  db.prepare('INSERT OR REPLACE INTO ai_usage VALUES (?,?,?)').run('2026-09-27','*',100)
  await assert.rejects(createAIBudget(db,{clock})(randomUUID(),async()=>{}),{code:'AI_LIMIT'})
 }finally{db.close();rmSync(dir,{recursive:true,force:true})}
})

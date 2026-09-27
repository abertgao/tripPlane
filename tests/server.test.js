import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomBytes,randomUUID} from 'node:crypto'
import {createApp,hash} from '../server/app.js'
import {journeyStateSchema} from '../shared/schema.js'
import {submitAnswer} from '../shared/progress.js'
import {quests} from '../shared/content.js'
const origin='https://62.234.178.115'
test('账号隔离、CSRF、版本冲突、检查点、恢复及邀请单次消费',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'shanhe-test-')), {app,db}=createApp({dbPath:join(dir,'test.sqlite'),origin});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api/v1`
 async function request(path,{method='GET',body,session,headers={}}={}){const res=await fetch(base+path,{method,headers:{'X-Forwarded-Proto':'https',Origin:origin,...body?{'Content-Type':'application/json'}:{},...session?{Cookie:session.cookie,'X-CSRF-Token':session.csrfToken}:{},...headers},body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')}}
 async function register(username,role='user'){const invite=randomBytes(32).toString('base64url'),password=randomBytes(24).toString('base64url');db.prepare('INSERT INTO invites VALUES (?,?,?,?,0,?)').run(randomUUID(),hash(invite),role,Date.now()+60000,new Date().toISOString());const r=await request('/auth/register',{method:'POST',body:{username,password,invite}});assert.equal(r.status,201);assert.match(r.cookie,/HttpOnly/);assert.match(r.cookie,/Secure/);assert.match(r.cookie,/SameSite=Lax/);assert.equal((await request('/auth/register',{method:'POST',body:{username:username+'2',password,invite}})).status,400);return {...r.data,cookie:r.cookie.split(';')[0],password}}
 try{
  assert.equal((await request('/auth/session',{headers:{'X-Forwarded-Proto':'http'}})).status,403)
  const a=await register('alice','admin'),b=await register('bob')
  const state={schemaVersion:1,contentVersion:'shanhe-2026-v1',name:'独立旅程',startDate:'2026-09-27',days:11,selectedPlaceIds:['yaozhou'],skippedPlaceIds:[],completedActionIds:[],notes:[],activeQuestId:'yaozhou-1',ended:false,updatedAt:new Date().toISOString()}
  const create={state,operationId:randomUUID(),intendedUserId:a.user.id,storageEpoch:a.storageEpoch}
  const r=await request('/journeys',{method:'POST',body:create,session:a});assert.equal(r.status,201);const id=r.data.journey.id
  assert.equal((await request('/journeys',{method:'POST',body:create,session:a})).data.journey.id,id)
  assert.equal((await request(`/journeys/${id}`,{session:b})).status,404)
  assert.deepEqual((await request('/journeys',{session:b})).data.journeys,[])
  assert.equal((await request('/admin/users',{session:b})).status,403)
  const meta={baseRevision:1,operationId:randomUUID(),intendedUserId:a.user.id,storageEpoch:a.storageEpoch}
  assert.equal((await request(`/journeys/${id}`,{method:'PUT',body:{...meta,state},session:a,headers:{Origin:'https://attacker.example'}})).status,403)
  assert.equal((await request(`/journeys/${id}`,{method:'PUT',body:{...meta,state},session:a,headers:{'X-CSRF-Token':'bad'}})).status,403)
  assert.equal((await request(`/journeys/${id}`,{method:'PUT',body:{...meta,state,intendedUserId:b.user.id},session:a})).status,403)
  const cp=await request(`/journeys/${id}/checkpoints`,{method:'POST',body:{...meta,name:'原点'},session:a});assert.equal(cp.status,200)
  const update={...meta,operationId:randomUUID(),state:{...state,name:'第二个版本'}}
  const changed=await request(`/journeys/${id}`,{method:'PUT',body:update,session:a});assert.equal(changed.status,200);assert.equal(changed.data.journey.revision,2)
  assert.equal((await request(`/journeys/${id}`,{method:'PUT',body:update,session:a})).data.journey.revision,2)
  assert.equal((await request(`/journeys/${id}`,{method:'PUT',body:{...update,state:{...state,name:'不同内容'}},session:a})).status,409)
  assert.equal((await request(`/journeys/${id}`,{method:'PUT',body:{...update,operationId:randomUUID()},session:a})).status,409)
  const restored=await request(`/journeys/${id}/restore`,{method:'POST',body:{...meta,baseRevision:2,operationId:randomUUID(),versionId:cp.data.id},session:a});assert.equal(restored.data.journey.state.name,'独立旅程');assert.equal(restored.data.journey.revision,3)
  assert.equal((await request(`/journeys/${id}/ai/proposals`,{method:'POST',body:{message:'今天休息',baseRevision:3},session:a})).status,503)
  assert.equal((await request(`/journeys/${id}`,{method:'PUT',body:{...update,baseRevision:3,operationId:randomUUID(),storageEpoch:randomUUID()},session:a})).status,409)
  const deletion={...meta,baseRevision:3,operationId:randomUUID()}
  assert.equal((await request(`/journeys/${id}`,{method:'DELETE',body:deletion,session:a})).status,200)
  assert.equal((await request(`/journeys/${id}`,{method:'DELETE',body:deletion,session:a})).status,200)
  const freshInvite=await request('/admin/invites',{method:'POST',body:{password:a.password},session:a});assert.equal(freshInvite.status,200)
  const inviteId=db.prepare('SELECT id FROM invites WHERE hash=?').get(hash(freshInvite.data.invite)).id
  assert.equal((await request(`/admin/invites/${inviteId}/revoke`,{method:'POST',body:{password:a.password},session:a})).status,200)
  assert.equal(db.prepare('SELECT used FROM invites WHERE id=?').get(inviteId).used,1)
  const grant=await request(`/admin/users/${b.user.id}/reset-grant`,{method:'POST',body:{password:a.password},session:a});assert.equal(grant.status,200)
  assert.equal((await request('/journeys',{session:b})).status,401)
  db.prepare('UPDATE users SET recovery_expires=? WHERE id=?').run(Date.now()-1,b.user.id)
  assert.equal((await request('/auth/recover',{method:'POST',body:{username:'bob',code:grant.data.code,newPassword:randomBytes(20).toString('hex')}})).status,400)
  assert.equal((await request(`/journeys/${id}`,{method:'PUT',body:{...update,baseRevision:3,operationId:randomUUID()},session:a})).status,404)
  assert.equal((await request('/auth/logout',{method:'POST',body:{},session:a})).status,200)
  assert.equal((await request('/journeys',{session:a})).status,401)
 }finally{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true})}
})
test('递进答案HTTP校验、旧客户端防覆盖及旧检查点无损迁移',async()=>{
 const {app,db}=createApp({dbPath:':memory:',origin}),server=app.listen(0,'127.0.0.1')
 await new Promise(r=>server.once('listening',r))
 const base=`http://127.0.0.1:${server.address().port}/api/v1`,uid=randomUUID(),other=randomUUID(),token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url'),id=randomUUID(),foreign=randomUUID(),stamp=new Date().toISOString()
 const old={schemaVersion:1,contentVersion:'shanhe-2026-v1',name:'保留旧历史',startDate:'2026-09-27',days:11,selectedPlaceIds:['yaozhou'],skippedPlaceIds:[],completedActionIds:['yaozhou-1-a1'],notes:[{id:randomUUID(),placeId:'yaozhou',text:'旧笔记',createdAt:stamp}],activeQuestId:'yaozhou-1',ended:false,updatedAt:stamp}
 for(const [user,name] of [[uid,'progress-owner'],[other,'progress-other']])db.prepare('INSERT INTO users(id,username,password,role,created) VALUES (?,?,?,?,?)').run(user,name,randomBytes(32).toString('hex'),'user',stamp)
 db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(hash(token),uid,csrf,Date.now()+60000)
 for(const [journey,owner] of [[id,uid],[foreign,other]])db.prepare('INSERT INTO journeys(id,owner,state,updated) VALUES (?,?,?,?)').run(journey,owner,JSON.stringify(old),stamp)
 const meta=revision=>({baseRevision:revision,operationId:randomUUID(),intendedUserId:uid,storageEpoch:db.prepare('SELECT value FROM settings WHERE key=?').get('epoch').value})
 async function request(path,method='GET',body,extra={}){const response=await fetch(base+path,{method,headers:{Origin:origin,'X-Forwarded-Proto':'https','Content-Type':'application/json',Cookie:`__Host-shanhe=${token}`,'X-CSRF-Token':csrf,...extra},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()}}
 try {
  const migrated=(await request(`/journeys/${id}`)).data.journey.state
  assert.equal(migrated.schemaVersion,2);assert.deepEqual(migrated.actionAnswers,[]);assert.deepEqual(migrated.legacyCompletedActionIds,old.completedActionIds);assert.deepEqual(migrated.notes,old.notes)
  assert.equal(JSON.parse(db.prepare('SELECT state FROM journeys WHERE id=?').get(id).state).schemaVersion,1)
  const cp=await request(`/journeys/${id}/checkpoints`,'POST',{...meta(1),name:'旧检查点'});assert.equal(cp.status,200)
  const quest=quests.find(q=>q.placeId==='yaozhou'),answer=submitAnswer(migrated,quest.actions[0].id,'只记录亲见','observed')
  const mutation={...meta(1),state:answer},saved=await request(`/journeys/${id}`,'PUT',mutation)
  assert.equal(saved.status,200);assert.deepEqual(saved.data.journey.state.actionAnswers,answer.actionAnswers)
  assert.equal((await request(`/journeys/${id}`,'PUT',mutation)).data.journey.revision,2)
  const downgrade=await request(`/journeys/${id}`,'PUT',{...meta(2),state:old})
  assert.equal(downgrade.status,409);assert.equal(downgrade.data.code,'CONTENT_VERSION_CONFLICT')
  assert.deepEqual((await request(`/journeys/${id}`)).data.journey.state.actionAnswers,answer.actionAnswers)
  const invalid=[{...answer,completedActionIds:[]},{...answer,actionAnswers:[...answer.actionAnswers,...answer.actionAnswers]}, {...answer,actionAnswers:[{...answer.actionAnswers[0],text:'  '}]}, {...answer,actionAnswers:[{...answer.actionAnswers[0],text:'字'.repeat(1001)}]}, {...answer,actionAnswers:[{...answer.actionAnswers[0],actionId:quest.actions[2].id}],completedActionIds:[quest.actions[2].id]}]
  for(const state of invalid)assert.equal((await request(`/journeys/${id}`,'PUT',{...meta(2),state})).status,400)
  assert.equal((await request(`/journeys/${foreign}`,'PUT',{...meta(1),state:answer})).status,404)
  assert.equal((await request(`/journeys/${id}`,'PUT',{...meta(2),state:answer},{'X-CSRF-Token':'wrong'})).status,403)
  const closed=await request(`/journeys/${id}`,'PUT',{...meta(2),state:{...answer,ended:true}});assert.equal(closed.status,200)
  const extraAnswer=submitAnswer({...answer,ended:false},quest.actions[1].id,'下一步','uncertain')
  assert.equal((await request(`/journeys/${id}`,'PUT',{...meta(3),state:{...extraAnswer,ended:true}})).status,409)
  const reopened=await request(`/journeys/${id}`,'PUT',{...meta(3),state:extraAnswer})
  assert.equal(reopened.status,200);assert.deepEqual(reopened.data.journey.state.actionAnswers,extraAnswer.actionAnswers)
  const restored=await request(`/journeys/${id}/restore`,'POST',{...meta(4),versionId:cp.data.id})
  assert.equal(restored.status,200);assert.deepEqual(restored.data.journey.state,journeyStateSchema.parse(old))
  const backup=db.prepare('SELECT state FROM versions WHERE journey=? AND name=?').get(id,'恢复前自动备份')
  assert.deepEqual(JSON.parse(backup.state).actionAnswers,extraAnswer.actionAnswers)
  const independent=await request('/journeys','POST',{state:old,operationId:randomUUID(),intendedUserId:uid,storageEpoch:meta(1).storageEpoch})
  assert.equal(independent.status,201);assert.deepEqual(independent.data.journey.state.actionAnswers,[])
 } finally {await new Promise(r=>server.close(r));db.close()}
})

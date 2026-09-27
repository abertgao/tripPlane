import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync} from 'node:fs'
import {resolve} from 'node:path'
import {randomUUID,randomBytes} from 'node:crypto'
import {createApp,hash} from '../server/app.js'
test('AI提案仅确认时原子应用，越权、失效版本与重复调用受保护',async()=>{
 const dir=mkdtempSync(resolve('.runtime/ai-api-test-'))
 let calls=0
 const {app,db}=createApp({dbPath:resolve(dir,'db.sqlite'),aiService:{isEnabled:()=>true,generate:async(_message,state)=>{calls++;return {summary:'测试提案，不调用真实模型',changes:[{type:'set_days',days:state.days-1}]}}}})
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api/v1`
 const uid=randomUUID(),other=randomUUID(),value=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url'),sid=hash(value),epoch=db.prepare('SELECT value FROM settings WHERE key=?').get('epoch').value
 const state={schemaVersion:1,contentVersion:'shanhe-2026-v1',name:'AI测试',startDate:'2026-09-27',days:11,selectedPlaceIds:[],skippedPlaceIds:[],completedActionIds:[],notes:[],activeQuestId:null,ended:false,updatedAt:new Date().toISOString()}
 for(const [id,name]of[[uid,'one'],[other,'two']])db.prepare('INSERT INTO users(id,username,password,role,created) VALUES (?,?,?,?,?)').run(id,name,'not-a-login-password','user',new Date().toISOString())
 db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(sid,uid,csrf,Date.now()+60000)
 const journey=randomUUID(),foreign=randomUUID();for(const [id,owner]of[[journey,uid],[foreign,other]])db.prepare('INSERT INTO journeys(id,owner,state,updated) VALUES (?,?,?,?)').run(id,owner,JSON.stringify(state),new Date().toISOString())
 async function request(path,body){const res=await fetch(base+path,{method:'POST',headers:{'X-Forwarded-Proto':'https',Origin:'https://62.234.178.115','Content-Type':'application/json',Cookie:`__Host-shanhe=${value}`,'X-CSRF-Token':csrf},body:JSON.stringify(body)});return {status:res.status,data:await res.json()}}
 try{
  assert.equal((await request(`/journeys/${foreign}/ai/proposals`,{message:'十天',baseRevision:1})).status,404);assert.equal(calls,0)
  const generated=await request(`/journeys/${journey}/ai/proposals`,{message:'十天',baseRevision:1});assert.equal(generated.status,200);assert.equal(calls,1)
  assert.equal(db.prepare('SELECT revision FROM journeys WHERE id=?').get(journey).revision,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM versions').get().n,0)
  const proposalId=generated.data.proposal.id,meta={baseRevision:1,operationId:randomUUID(),intendedUserId:uid,storageEpoch:epoch}
  const applied=await request(`/journeys/${journey}/ai/proposals/${proposalId}/apply`,meta);assert.equal(applied.status,200);assert.equal(applied.data.journey.state.days,10)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM versions WHERE journey=?').get(journey).n,1)
  assert.equal((await request(`/journeys/${journey}/ai/proposals/${proposalId}/apply`,meta)).data.journey.revision,2)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM versions WHERE journey=?').get(journey).n,1)
  const stale=await request(`/journeys/${journey}/ai/proposals`,{message:'九天',baseRevision:2});assert.equal(stale.status,200)
  db.prepare('UPDATE journeys SET revision=revision+1 WHERE id=?').run(journey)
  assert.equal((await request(`/journeys/${journey}/ai/proposals/${stale.data.proposal.id}/apply`,{...meta,baseRevision:2,operationId:randomUUID()})).status,409)
  assert.equal(db.prepare('SELECT applied FROM proposals WHERE id=?').get(stale.data.proposal.id).applied,0)
  assert.equal(db.prepare('SELECT SUM(attempts) n FROM ai_usage WHERE actor=?').get(uid).n,2)
 }finally{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true})}
})

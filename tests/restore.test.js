import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,rmSync,existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {randomUUID} from 'node:crypto'
import {openDb} from '../server/db.js'
import {restoreBackup} from '../server/restore.js'
test('一致备份恢复保留用户归属、版本与墓碑，同时撤销会话和轮换代次',async()=>{
 const dir=mkdtempSync(resolve('.runtime/restore-test-')),file=resolve(dir,'journal.sqlite'),name='journal-2026-09-27T00-00-00-000Z.sqlite';mkdirSync(resolve(dir,'backups'))
 let db=openDb(file)
 try{
  const a=randomUUID(),b=randomUUID(),journey=randomUUID(),deleted=randomUUID(),epoch=db.prepare('SELECT value FROM settings WHERE key=?').get('epoch').value,stamp=new Date().toISOString()
  for(const [id,username]of[[a,'a'],[b,'b']])db.prepare('INSERT INTO users(id,username,password,role,recovery,created) VALUES (?,?,?,?,?,?)').run(id,username,'testhash','user','testrecovery',stamp)
  db.prepare('INSERT INTO journeys(id,owner,state,updated) VALUES (?,?,?,?)').run(journey,a,'{}',stamp)
  db.prepare('INSERT INTO journeys(id,owner,state,updated,deleted) VALUES (?,?,?,?,1)').run(deleted,b,'{}',stamp)
  db.prepare('INSERT INTO versions VALUES (?,?,?,?,?,?)').run(randomUUID(),journey,'checkpoint','{}',1,stamp)
  db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run('testsession',a,'testcsrf',Date.now()+60000)
  db.prepare('INSERT INTO invites VALUES (?,?,?,?,0,?)').run(randomUUID(),'testinvite','user',Date.now()+60000,stamp)
  await db.backup(resolve(dir,'backups',name));db.prepare('UPDATE journeys SET state=? WHERE id=?').run('{"changed":true}',journey);db.close();db=null
  await assert.rejects(restoreBackup(dir,'../journal.sqlite'))
  const result=await restoreBackup(dir,name);assert.ok(existsSync(resolve(result.archive,'journal.sqlite')))
  db=openDb(file);assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.notEqual(db.prepare('SELECT value FROM settings WHERE key=?').get('epoch').value,epoch)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM users WHERE active=1').get().n,0)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM invites WHERE used=0').get().n,0)
  assert.equal(db.prepare('SELECT owner FROM journeys WHERE id=?').get(journey).owner,a);assert.equal(db.prepare('SELECT deleted FROM journeys WHERE id=?').get(deleted).deleted,1)
  assert.equal(db.prepare('SELECT state FROM journeys WHERE id=?').get(journey).state,'{}');assert.equal(db.prepare('SELECT COUNT(*) n FROM versions').get().n,1)
 }finally{db?.close();rmSync(dir,{recursive:true,force:true})}
})

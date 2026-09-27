import {resolve,isAbsolute} from 'node:path'
import {randomBytes,randomUUID,createHash} from 'node:crypto'
import {chmodSync,mkdirSync,readdirSync,unlinkSync} from 'node:fs'
import {openDb} from './db.js'
const dir=process.env.SHANHE_DATA_DIR
if(!dir||!isAbsolute(dir))throw new Error('SHANHE_DATA_DIR required')
const db=openDb(resolve(dir,'journal.sqlite')),command=process.argv[2]
try{
 if(command==='initial-admin-invite'){
  if(db.prepare("SELECT 1 FROM users WHERE role='admin'").get())throw new Error('Administrator already exists')
  const code=randomBytes(32).toString('base64url')
  db.transaction(()=>{db.prepare("UPDATE invites SET used=1 WHERE role='admin'").run();db.prepare('INSERT INTO invites VALUES (?,?,?,?,0,?)').run(randomUUID(),createHash('sha256').update(code).digest('hex'),'admin',Date.now()+48*3600000,new Date().toISOString())})()
  process.stdout.write(code+'\n')
 }else if(command==='reset-user'){
  const username=process.env.SHANHE_RESET_USERNAME,password=process.env.SHANHE_RESET_PASSWORD
  if(!username||!password||password.length<12||password.length>128)throw new Error('SHANHE_RESET_USERNAME and a 12–128 character SHANHE_RESET_PASSWORD are required')
  const {passwordHash}=await import('./app.js');const encoded=await passwordHash(password)
  db.transaction(()=>{const u=db.prepare('SELECT id FROM users WHERE username=?').get(username);if(!u)throw new Error('User not found');db.prepare('UPDATE users SET password=?,active=1,recovery=NULL WHERE id=?').run(encoded,u.id);db.prepare('DELETE FROM sessions WHERE uid=?').run(u.id)})();console.log('User identity restored and sessions revoked')
 }else if(command==='backup'){
  const backupDir=resolve(dir,'backups');mkdirSync(backupDir,{recursive:true,mode:0o700});const name=`journal-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`;const path=resolve(backupDir,name);await db.backup(path);chmodSync(path,0o600)
  const names=readdirSync(backupDir).filter(n=>/^journal-[0-9TZ-]+\.sqlite$/.test(n)).sort();for(const old of names.slice(0,-14))unlinkSync(resolve(backupDir,old));console.log('Consistent local backup created')
 }else if(command==='restore'){
  throw new Error('Use the offline restore entry: node server/restore.js BACKUP_FILENAME. The API must be stopped first.')
 }else if(command==='invalidate-restored-state'){
  db.transaction(()=>{db.prepare('UPDATE settings SET value=? WHERE key=?').run(randomUUID(),'epoch');db.prepare('DELETE FROM sessions').run();db.prepare('UPDATE invites SET used=1').run();db.prepare('UPDATE users SET recovery=NULL').run();db.prepare('DELETE FROM proposals').run();db.prepare('DELETE FROM receipts').run()})();console.log('Restored state invalidated. Review account status before reopening service.')
 }else throw new Error('Supported: initial-admin-invite, backup, invalidate-restored-state')
}finally{db.close()}

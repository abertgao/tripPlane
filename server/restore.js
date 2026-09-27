import Database from 'better-sqlite3'
import {resolve,isAbsolute,sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {existsSync,lstatSync,realpathSync,mkdirSync,renameSync,unlinkSync,chmodSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import net from 'node:net'
export async function restoreBackup(dir,name){
 if(!dir||!isAbsolute(dir)||!/^journal-[0-9TZ-]+\.sqlite$/.test(name||'')||name.includes('..'))throw new Error('Use a journal backup filename from the configured private backups directory')
 const base=realpathSync(resolve(dir,'backups')),source=resolve(base,name)
 if(!source.startsWith(base+sep)||lstatSync(source).isSymbolicLink()||!lstatSync(source).isFile()||realpathSync(source)!==source)throw new Error('Invalid backup path')
 const current=resolve(dir,'journal.sqlite'),stage=resolve(dir,`restore-${randomUUID()}.sqlite`)
 let copy,sourceDb
 try{
  sourceDb=new Database(source,{readonly:true});if(sourceDb.pragma('integrity_check',{simple:true})!=='ok')throw new Error('Backup integrity check failed')
  for(const table of ['users','journeys','versions','settings','sessions','invites','proposals','receipts'])if(!sourceDb.prepare('SELECT 1 FROM sqlite_master WHERE type=? AND name=?').get('table',table))throw new Error('Unsupported backup schema')
  await sourceDb.backup(stage);sourceDb.close();sourceDb=null;chmodSync(stage,0o600)
  copy=new Database(stage);copy.pragma('journal_mode=DELETE');copy.transaction(()=>{copy.prepare('UPDATE settings SET value=? WHERE key=?').run(randomUUID(),'epoch');copy.prepare('DELETE FROM sessions').run();copy.prepare('UPDATE invites SET used=1').run();copy.prepare('UPDATE users SET recovery=NULL,active=0').run();copy.prepare('DELETE FROM proposals').run();copy.prepare('DELETE FROM receipts').run()})();copy.close();copy=null
  const archive=resolve(dir,`before-restore-${randomUUID()}`);mkdirSync(archive,{mode:0o700})
  const moved=[]
  try{for(const suffix of ['','-wal','-shm'])if(existsSync(current+suffix)){renameSync(current+suffix,resolve(archive,`journal.sqlite${suffix}`));moved.push(suffix)}renameSync(stage,current)}
  catch(e){for(const suffix of moved)renameSync(resolve(archive,`journal.sqlite${suffix}`),current+suffix);throw e}
  return {archive}
 }finally{copy?.close();sourceDb?.close();if(existsSync(stage))unlinkSync(stage)}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 await new Promise((yes,no)=>{const s=net.connect(8813,'127.0.0.1');s.setTimeout(3000);s.once('connect',()=>{s.destroy();no(new Error('Stop the API before restoring'))});s.once('timeout',()=>{s.destroy();no(new Error('Cannot verify stopped API'))});s.once('error',e=>{if(e.code==='ECONNREFUSED')yes();else no(e)})})
 await restoreBackup(process.env.SHANHE_DATA_DIR,process.argv[2])
 console.log('Database restored offline. Old sessions/invites revoked; accounts paused. Review identities and use reset-user before restarting the API.')
}

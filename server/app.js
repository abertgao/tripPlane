import express from 'express'
import {randomBytes,randomUUID,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto'
import {promisify} from 'node:util'
import {z} from 'zod'
import {openDb} from './db.js'
import {journeyStateSchema,journeyStateWriteSchema,usernameSchema,passwordSchema,mutationSchema} from '../shared/schema.js'
import {generateProposal,aiConfigured,validateProposal} from './provider.js'
import {createAIBudget} from './ai-budget.js'
const scrypt=promisify(scryptCallback)
export const hash=v=>createHash('sha256').update(v).digest('hex')
const token=()=>randomBytes(32).toString('base64url')
const stamp=()=>new Date().toISOString()
export async function passwordHash(password) { const salt=randomBytes(16).toString('hex');const key=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:67108864});return `scrypt:${salt}:${key.toString('hex')}` }
async function verify(password,encoded) { const [,salt,target]=encoded.split(':');const key=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:67108864});const expected=Buffer.from(target,'hex');return key.length===expected.length&&timingSafeEqual(key,expected) }
function error(status,message,code='REQUEST_FAILED') { return Object.assign(new Error(message),{status,code}) }
export function createApp({dbPath,origin='https://62.234.178.115',aiService={isEnabled:aiConfigured,generate:generateProposal}}) {
  if(new URL(origin).protocol!=='https:')throw new Error('HTTPS origin required')
  const db=openDb(dbPath),app=express(),epoch=()=>db.prepare('SELECT value FROM settings WHERE key=?').get('epoch').value
  const withAIBudget=createAIBudget(db)
  function validateState(input) {return journeyStateSchema.parse(input)}
  app.disable('x-powered-by');app.set('trust proxy','loopback')
  app.use((req,res,next)=>{res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});next()})
  const limits=new Map()
  function rate(key,max,period=60000) {const now=Date.now();if(limits.size>10000)for(const [k,v] of limits)if(v.until<now)limits.delete(k);const v=limits.get(key)||{n:0,until:now+period};if(v.until<now){v.n=0;v.until=now+period}v.n++;limits.set(key,v);if(v.n>max)throw error(429,'请求过于频繁，请稍后再试','RATE_LIMIT')}
  app.use('/api/v1',(req,res,next)=>{try{rate(`all:${req.ip}`,180);if(!req.secure)throw error(403,'请通过HTTPS安全入口访问');if(!['GET','HEAD'].includes(req.method)){if(req.get('origin')!==origin)throw error(403,'请求来源不被允许');if(!req.is('application/json'))throw error(415,'仅接受JSON请求')}next()}catch(e){next(e)}})
  app.use(express.json({limit:'1mb',strict:true}))
  app.use('/api/v1',(req,res,next)=>{try{const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-shanhe='));const value=raw?.slice('__Host-shanhe='.length);req.session=value?db.prepare('SELECT s.*,u.username,u.role,u.active FROM sessions s JOIN users u ON u.id=s.uid WHERE s.hash=? AND s.expires>? AND u.active=1').get(hash(value),Date.now()):null;next()}catch(e){next(e)}})
  const user=s=>s?{id:s.uid||s.id,username:s.username,role:s.role}:null
  const auth=(req,res,next)=>{if(!req.session)return next(error(401,'请先登录'));if(!['GET','HEAD'].includes(req.method)&&req.get('x-csrf-token')!==req.session.csrf)return next(error(403,'会话验证失败，请刷新后重试'));next()}
  const admin=(req,res,next)=>{if(req.session?.role!=='admin')return next(error(403,'需要管理员权限'));next()}
  async function recent(req,password){rate(`admin:${req.session.uid}`,12,900000);if(!passwordSchema.safeParse(password).success||!await verify(password,db.prepare('SELECT password FROM users WHERE id=?').get(req.session.uid).password))throw error(403,'口令验证失败')}
  function session(res,u){const value=token(),csrf=token();db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(hash(value),u.id,csrf,Date.now()+7*86400000);res.cookie('__Host-shanhe',value,{secure:true,httpOnly:true,sameSite:'lax',path:'/',maxAge:7*86400000});return {user:user(u),csrfToken:csrf,storageEpoch:epoch()}}
  function owned(req,id){if(!z.string().uuid().safeParse(id).success)throw error(404,'旅程不存在');const r=db.prepare('SELECT * FROM journeys WHERE id=? AND owner=? AND deleted=0').get(id,req.session.uid);if(!r)throw error(404,'旅程不存在');return r}
  const view=r=>({id:r.id,revision:r.revision,state:validateState(JSON.parse(r.state)),updatedAt:r.updated})
  function metadata(req,body){if(body.intendedUserId!==req.session.uid)throw error(403,'账号已变化，请重新打开旅程');if(body.storageEpoch!==epoch())throw error(409,'服务器已恢复数据，请重新建立同步','EPOCH_CONFLICT')}
  function checkpoint(r,name){const count=db.prepare('SELECT COUNT(*) n FROM versions WHERE journey=?').get(r.id).n;if(count>=50)throw error(409,'检查点已达50个，请先导出并整理旅程');const id=randomUUID();db.prepare('INSERT INTO versions VALUES (?,?,?,?,?,?)').run(id,r.id,name,r.state,r.revision,stamp());return id}
  function mutate(req,body,fn){metadata(req,body);const payload=hash(JSON.stringify({path:req.path,method:req.method,body}));return db.transaction(()=>{if(req.params.id&&!db.prepare('SELECT 1 FROM journeys WHERE id=? AND owner=?').get(req.params.id,req.session.uid))throw error(404,'旅程不存在');const receipt=db.prepare('SELECT * FROM receipts WHERE uid=? AND op=?').get(req.session.uid,body.operationId);if(receipt){if(receipt.payload!==payload)throw error(409,'操作编号重复但内容不同');return JSON.parse(receipt.result)}const result=fn();db.prepare('INSERT INTO receipts VALUES (?,?,?,?)').run(req.session.uid,body.operationId,payload,JSON.stringify(result));return result})()}
  function current(req,revision){const row=owned(req,req.params.id);if(row.revision!==revision)throw error(409,'另一设备已修改此旅程，请处理版本冲突','REVISION_CONFLICT');return row}
  function update(row,state){db.prepare('UPDATE journeys SET state=?,revision=revision+1,updated=? WHERE id=? AND owner=? AND revision=?').run(JSON.stringify(state),stamp(),row.id,row.owner,row.revision);return {journey:view(db.prepare('SELECT * FROM journeys WHERE id=?').get(row.id))}}
  app.get('/api/v1/health',(req,res)=>res.json({ok:true}))
  app.get('/api/v1/capabilities',(req,res)=>res.json({accounts:true,ai:aiService.isEnabled()}))
  app.get('/api/v1/auth/session',(req,res)=>res.json({user:user(req.session),csrfToken:req.session?.csrf||'',storageEpoch:epoch()}))
  app.post('/api/v1/auth/register',async(req,res)=>{rate(`register:${req.ip}`,5,3600000);const b=z.object({username:usernameSchema,password:passwordSchema,invite:z.string().min(20).max(100)}).strict().parse(req.body);const encoded=await passwordHash(b.password),recovery=token();const u=db.transaction(()=>{const invite=db.prepare('SELECT * FROM invites WHERE hash=? AND used=0 AND expires>?').get(hash(b.invite),Date.now());if(!invite)throw error(400,'注册信息或邀请码无效');if(db.prepare('SELECT 1 FROM users WHERE username=?').get(b.username))throw error(400,'注册信息或邀请码无效');const id=randomUUID();db.prepare('INSERT INTO users(id,username,password,role,recovery,created) VALUES (?,?,?,?,?,?)').run(id,b.username,encoded,invite.role,hash(recovery),stamp());db.prepare('UPDATE invites SET used=1 WHERE id=?').run(invite.id);return db.prepare('SELECT * FROM users WHERE id=?').get(id)})();res.status(201).json({...session(res,u),recoveryCode:recovery})})
  app.post('/api/v1/auth/login',async(req,res)=>{rate(`login:${req.ip}`,12,900000);const b=z.object({username:usernameSchema,password:passwordSchema}).strict().parse(req.body);rate(`name:${hash(b.username)}`,10,900000);const u=db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(b.username);if(!u){await passwordHash(b.password);throw error(401,'用户名或口令不正确')}if(!await verify(b.password,u.password))throw error(401,'用户名或口令不正确');if(req.session)db.prepare('DELETE FROM sessions WHERE hash=?').run(req.session.hash);res.json(session(res,u))})
  app.post('/api/v1/auth/logout',auth,(req,res)=>{db.prepare('DELETE FROM sessions WHERE hash=?').run(req.session.hash);res.clearCookie('__Host-shanhe',{secure:true,httpOnly:true,sameSite:'lax',path:'/'});res.json({ok:true})})
  app.post('/api/v1/auth/password',auth,async(req,res)=>{const b=z.object({currentPassword:passwordSchema,newPassword:passwordSchema}).strict().parse(req.body);await recent(req,b.currentPassword);const encoded=await passwordHash(b.newPassword);db.transaction(()=>{db.prepare('UPDATE users SET password=? WHERE id=?').run(encoded,req.session.uid);db.prepare('DELETE FROM sessions WHERE uid=?').run(req.session.uid)})();res.json({ok:true})})
  app.post('/api/v1/auth/recover',async(req,res)=>{rate(`recover:${req.ip}`,5,3600000);const b=z.object({username:usernameSchema,code:z.string().min(20).max(100),newPassword:passwordSchema}).strict().parse(req.body);const u=db.prepare('SELECT * FROM users WHERE username=? AND active=1 AND recovery=? AND (recovery_expires IS NULL OR recovery_expires>?)').get(b.username,hash(b.code),Date.now());if(!u)throw error(400,'恢复信息无效或已过期');const encoded=await passwordHash(b.newPassword),recovery=token();db.transaction(()=>{const result=db.prepare('UPDATE users SET password=?,recovery=?,recovery_expires=NULL WHERE id=? AND recovery=? AND active=1 AND (recovery_expires IS NULL OR recovery_expires>?)').run(encoded,hash(recovery),u.id,hash(b.code),Date.now());if(result.changes!==1)throw error(400,'恢复信息无效');db.prepare('DELETE FROM sessions WHERE uid=?').run(u.id)})();res.json({ok:true,recoveryCode:recovery})})
  app.get('/api/v1/journeys',auth,(req,res)=>res.json({journeys:db.prepare('SELECT * FROM journeys WHERE owner=? AND deleted=0 ORDER BY updated DESC').all(req.session.uid).map(view)}))
  app.get('/api/v1/journeys/:id',auth,(req,res)=>res.json({journey:view(owned(req,req.params.id))}))
  app.post('/api/v1/journeys',auth,(req,res)=>{const b=mutationSchema.omit({baseRevision:true}).extend({state:journeyStateWriteSchema}).strict().parse(req.body);const state=validateState(b.state);res.status(201).json(mutate(req,b,()=>{if(db.prepare('SELECT COUNT(*) n FROM journeys WHERE owner=? AND deleted=0').get(req.session.uid).n>=20)throw error(409,'最多创建20个旅程');const id=randomUUID();db.prepare('INSERT INTO journeys(id,owner,state,updated) VALUES (?,?,?,?)').run(id,req.session.uid,JSON.stringify(state),stamp());return {journey:view(owned(req,id))}}))})
  app.put('/api/v1/journeys/:id',auth,(req,res)=>{
    const b=mutationSchema.extend({state:journeyStateWriteSchema}).strict().parse(req.body),state=validateState(b.state)
    const legacyClient=req.body.state.schemaVersion===1
    res.json(mutate(req,b,()=>{
      const row=current(req,b.baseRevision),previous=validateState(JSON.parse(row.state))
      if(legacyClient&&previous.actionAnswers.length)throw error(409,'此旅程已有新版回答，请升级页面后同步；旧存档可另存为新旅程','CONTENT_VERSION_CONFLICT')
      if(previous.ended&&state.ended&&state.actionAnswers.some(a=>!previous.actionAnswers.some(old=>old.actionId===a.actionId&&old.text===a.text&&old.mode===a.mode&&old.submittedAt===a.submittedAt)))throw error(409,'旅程已收束，请先重新打开后再回答')
      return update(row,state)
    }))
  })
  app.delete('/api/v1/journeys/:id',auth,(req,res)=>{const b=mutationSchema.parse(req.body);res.json(mutate(req,b,()=>{const r=current(req,b.baseRevision);db.prepare('UPDATE journeys SET deleted=1,revision=revision+1,updated=? WHERE id=? AND owner=?').run(stamp(),r.id,req.session.uid);return {ok:true}}))})
  app.get('/api/v1/journeys/:id/versions',auth,(req,res)=>{owned(req,req.params.id);res.json({versions:db.prepare('SELECT id,name,created AS createdAt,revision FROM versions WHERE journey=? ORDER BY created DESC').all(req.params.id)})})
  app.post('/api/v1/journeys/:id/checkpoints',auth,(req,res)=>{const b=mutationSchema.extend({name:z.string().min(1).max(80)}).strict().parse(req.body);res.json(mutate(req,b,()=>({id:checkpoint(current(req,b.baseRevision),b.name)})))})
  app.post('/api/v1/journeys/:id/restore',auth,(req,res)=>{const b=mutationSchema.extend({versionId:z.string().uuid()}).strict().parse(req.body);res.json(mutate(req,b,()=>{const r=current(req,b.baseRevision),v=db.prepare('SELECT * FROM versions WHERE id=? AND journey=?').get(b.versionId,r.id);if(!v)throw error(404,'版本不存在');checkpoint(r,'恢复前自动备份');return update(r,validateState(JSON.parse(v.state)))}))})
  app.get('/api/v1/admin/users',auth,admin,(req,res)=>res.json({users:db.prepare('SELECT id,username,role,active,created FROM users ORDER BY created').all()}))
  app.get('/api/v1/admin/invites',auth,admin,(req,res)=>res.json({invites:db.prepare('SELECT id,role,expires,used,created FROM invites ORDER BY created DESC LIMIT 100').all()}))
  app.post('/api/v1/admin/invites',auth,admin,async(req,res)=>{const b=z.object({password:passwordSchema}).strict().parse(req.body);await recent(req,b.password);const invite=token(),expires=Date.now()+48*3600000;db.prepare('INSERT INTO invites VALUES (?,?,?,?,0,?)').run(randomUUID(),hash(invite),'user',expires,stamp());res.json({invite,expiresAt:new Date(expires).toISOString()})})
  app.post('/api/v1/admin/invites/:id/revoke',auth,admin,async(req,res)=>{const b=z.object({password:passwordSchema}).strict().parse(req.body);await recent(req,b.password);if(!z.string().uuid().safeParse(req.params.id).success)throw error(404,'邀请不存在');db.prepare('UPDATE invites SET used=1 WHERE id=?').run(req.params.id);res.json({ok:true})})
  app.post('/api/v1/admin/users/:id/status',auth,admin,async(req,res)=>{const b=z.object({active:z.boolean(),password:passwordSchema}).strict().parse(req.body);await recent(req,b.password);const target=db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);if(!target)throw error(404,'用户不存在');if(!b.active&&target.role==='admin'&&db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin' AND active=1").get().n<=1)throw error(409,'不能停用最后一位管理员');db.transaction(()=>{db.prepare('UPDATE users SET active=? WHERE id=?').run(b.active?1:0,target.id);db.prepare('DELETE FROM sessions WHERE uid=?').run(target.id)})();res.json({ok:true})})
  app.post('/api/v1/admin/users/:id/reset-grant',auth,admin,async(req,res)=>{const b=z.object({password:passwordSchema}).strict().parse(req.body);await recent(req,b.password);const code=token(),expires=Date.now()+1800000;if(db.prepare('UPDATE users SET recovery=?,recovery_expires=? WHERE id=?').run(hash(code),expires,req.params.id).changes!==1)throw error(404,'用户不存在');db.prepare('DELETE FROM sessions WHERE uid=?').run(req.params.id);res.json({code,expiresAt:new Date(expires).toISOString()})})
  app.post('/api/v1/journeys/:id/ai/proposals',auth,async(req,res)=>{
    const b=z.object({message:z.string().trim().min(1).max(2000),baseRevision:z.number().int().nonnegative()}).strict().parse(req.body)
    const r=current(req,b.baseRevision),state=validateState(JSON.parse(r.state)),initialEpoch=epoch()
    if(!aiService.isEnabled())throw error(503,'AI尚未配置，你可以继续手动调整行程','AI_NOT_CONFIGURED')
    if(state.ended)throw error(409,'旅程已收束，请重新打开后再调整')
    if(db.prepare('SELECT COUNT(*) n FROM versions WHERE journey=?').get(r.id).n>=50)throw error(409,'检查点已满，暂时不能应用AI修改')
    const body=await withAIBudget(req.session.uid,()=>aiService.generate(b.message,state))
    const result=db.transaction(()=>{
      if(!db.prepare('SELECT 1 FROM sessions s JOIN users u ON s.uid=u.id WHERE s.hash=? AND s.expires>? AND u.active=1').get(req.session.hash,Date.now()))throw error(401,'会话已失效，请重新登录')
      if(epoch()!==initialEpoch)throw error(409,'服务器数据已变化，请重新同步')
      const latest=current(req,b.baseRevision)
      const validated=validateProposal(body,validateState(JSON.parse(latest.state)))
      const id=randomUUID(),expires=Date.now()+900000
      db.prepare('DELETE FROM proposals WHERE expires<?').run(Date.now()-86400000)
      db.prepare('INSERT INTO proposals VALUES (?,?,?,?,?,?,?,0)').run(id,req.session.uid,r.id,r.revision,initialEpoch,JSON.stringify(validated),expires)
      return {id,...validated,baseRevision:r.revision,expiresAt:new Date(expires).toISOString()}
    })()
    res.json({proposal:result})
  })
  app.post('/api/v1/journeys/:id/ai/proposals/:proposalId/apply',auth,(req,res)=>{
    const b=mutationSchema.parse(req.body)
    res.json(mutate(req,b,()=>{
      const r=current(req,b.baseRevision),p=db.prepare('SELECT * FROM proposals WHERE id=? AND owner=? AND journey=? AND applied=0').get(req.params.proposalId,req.session.uid,r.id)
      if(!p||p.expires<Date.now()||p.epoch!==epoch()||p.revision!==r.revision)throw error(409,'提案已失效，请重新生成')
      const state=validateState(JSON.parse(r.state)),proposal=validateProposal(JSON.parse(p.body),state)
      if(!proposal.changes.length)throw error(400,'这份建议没有要应用的行程修改')
      for(const c of proposal.changes){
        if(c.type==='set_days')state.days=c.days
        else if(c.type==='choose_place'){state.selectedPlaceIds=[...new Set([...state.selectedPlaceIds,c.placeId])];state.skippedPlaceIds=state.skippedPlaceIds.filter(id=>id!==c.placeId)}
        else{state.selectedPlaceIds=state.selectedPlaceIds.filter(id=>id!==c.placeId);state.skippedPlaceIds=[...new Set([...state.skippedPlaceIds,c.placeId])]}
      }
      state.updatedAt=stamp();checkpoint(r,'应用AI提案前')
      const result=update(r,validateState(state))
      db.prepare('UPDATE proposals SET applied=1 WHERE id=?').run(p.id)
      return result
    }))
  })
  app.use('/api',(req,res)=>res.status(404).json({code:'NOT_FOUND',message:'接口不存在'}))
  app.use((err,req,res,next)=>{const status=err instanceof z.ZodError?400:err.status||500;if(status>=500)console.error(JSON.stringify({event:'request_error',code:err.code||'INTERNAL',requestId:randomUUID()}));res.status(status).json({code:err instanceof z.ZodError?'INVALID_INPUT':err.code||'REQUEST_FAILED',message:err instanceof z.ZodError?'输入格式无效，请检查填写内容':status>=500&&!['AI_NOT_CONFIGURED','PROVIDER_ERROR'].includes(err.code)?'服务暂不可用，请稍后再试':err.message})})
  return {app,db}
}

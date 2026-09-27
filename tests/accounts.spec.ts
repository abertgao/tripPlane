import {test,expect} from '@playwright/test'
import {createApp,hash} from '../server/app.js'
import {randomBytes,randomUUID} from 'node:crypto'
import {mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
const base='http://127.0.0.1:8812',origin='https://62.234.178.115'
let service:any,db:any,dir:string,apiBase:string
const password=randomBytes(24).toString('base64url')
const invite=randomBytes(32).toString('base64url')
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',launchOptions:{chromiumSandbox:true},screenshot:'off'})
test.beforeAll(async()=>{dir=mkdtempSync(join(process.cwd(),'.runtime/account-test-'));const x=createApp({dbPath:join(dir,'journal.sqlite'),origin,aiService:{isEnabled:()=>true,generate:async()=>({summary:'已为测试旅程生成十天方案；不会自动修改行程。',changes:[{type:'set_days',days:10}]})}});db=x.db;db.prepare('INSERT INTO invites VALUES (?,?,?,?,0,?)').run(randomUUID(),hash(invite),'admin',Date.now()+600000,new Date().toISOString());service=x.app.listen(0,'127.0.0.1');await new Promise(r=>service.once('listening',r));apiBase=`http://127.0.0.1:${service.address().port}`})
test.afterAll(async()=>{await new Promise(r=>service.close(r));db.close();rmSync(dir,{recursive:true,force:true})})
test('手机邀请注册、恢复码、服务器同步及重新登录恢复',async({page,context})=>{
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin!==base){await route.abort();return}
  if(!u.pathname.startsWith('/api/')){await route.continue();return}
  const req=route.request(),headers=await req.allHeaders();delete headers.host;delete headers['content-length'];headers.origin=origin;headers['x-forwarded-proto']='https'
  const response=await fetch(apiBase+u.pathname,{method:req.method(),headers,body:req.postData()||undefined,redirect:'error'})
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()})
 })
 await page.goto(base+'/#mine')
 await page.getByRole('button',{name:'登录 / 邀请注册'}).click();await page.getByRole('button',{name:'收到邀请？创建账号'}).click()
 await page.getByLabel('用户名',{exact:true}).fill('mobiletester');await page.getByLabel('一次性邀请码').fill(invite);await page.getByLabel('口令',{exact:true}).fill(password)
 await page.getByRole('button',{name:'创建我的账号'}).click()
 await expect(page.getByRole('heading',{name:'请保存你的恢复码'})).toBeVisible()
 await page.getByRole('button',{name:'我已安全保存'}).click()
 await expect(page.locator('.save-status')).toContainText('已同步到服务器',{timeout:15000})
 expect(db.prepare('SELECT COUNT(*) n FROM users').get().n).toBe(1)
 expect(db.prepare('SELECT COUNT(*) n FROM journeys WHERE deleted=0').get().n).toBe(1)
 const name=page.getByLabel('旅程名称',{exact:true});await name.fill('手机同步测试');await name.blur()
 await expect(page.locator('.save-status')).toContainText('已同步到服务器',{timeout:15000})
 expect(JSON.parse(db.prepare('SELECT state FROM journeys WHERE deleted=0').get().state).name).toBe('手机同步测试')
 page.on('dialog',d=>d.accept())
 await page.getByRole('button',{name:'退出账号',exact:true}).click();await expect(page.getByRole('heading',{name:'还没有登录'})).toBeVisible()
 await page.getByRole('button',{name:'登录 / 邀请注册'}).click();await page.getByLabel('用户名',{exact:true}).fill('mobiletester');await page.getByLabel('口令',{exact:true}).fill(password);await page.getByRole('button',{name:'安全登录'}).click()
 await expect(page.getByLabel('旅程名称',{exact:true})).toHaveValue('手机同步测试',{timeout:15000})
 expect(db.prepare('SELECT COUNT(*) n FROM journeys WHERE deleted=0').get().n).toBe(1)
 await expect(page.locator('.save-status')).toContainText('已同步到服务器',{timeout:15000})
 await page.getByRole('navigation',{name:'移动端导航'}).getByRole('button',{name:'助手',exact:true}).click()
 await expect(page.getByText('AI已连接',{exact:true})).toBeVisible()
 await page.getByLabel('调整需求',{exact:true}).fill('把总天数改为十天，其余不变')
 await page.getByRole('button',{name:'生成调整提案',exact:true}).click()
 await expect(page.getByRole('heading',{name:'先看看，再决定。'})).toBeVisible()
 expect(JSON.parse(db.prepare('SELECT state FROM journeys WHERE deleted=0').get().state).days).toBe(11)
 await page.getByRole('button',{name:'确认应用并保存检查点',exact:true}).click()
 await expect(page.getByRole('heading',{name:'先看看，再决定。'})).toHaveCount(0)
 await expect(page.locator('.save-status')).toContainText('已同步到服务器',{timeout:15000})
 expect(JSON.parse(db.prepare('SELECT state FROM journeys WHERE deleted=0').get().state).days).toBe(10)
 expect(db.prepare('SELECT COUNT(*) n FROM versions').get().n).toBe(1)
 await page.getByRole('navigation',{name:'移动端导航'}).getByRole('button',{name:'我的',exact:true}).click()
 await expect(page.getByLabel('旅程天数',{exact:true})).toHaveValue('10')
})

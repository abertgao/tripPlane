import {test,expect,type BrowserContext,type Route} from '@playwright/test'
const base='http://127.0.0.1:8812'
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',launchOptions:{chromiumSandbox:true}})
async function mock(context:BrowserContext,capabilities:(route:Route)=>Promise<void>,sessionFails=false){
 let calls=0
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url())
  if(u.origin!==base){await route.abort();return}
  if(u.pathname==='/api/v1/capabilities'){calls++;await capabilities(route);return}
  if(u.pathname==='/api/v1/auth/session'){
   await route.fulfill({status:sessionFails?503:200,contentType:'application/json',body:JSON.stringify(sessionFails?{message:'session temporarily unavailable'}:{user:null,csrfToken:'',storageEpoch:'test-epoch'})});return
  }
  if(u.pathname.startsWith('/api/')){await route.fulfill({status:401,contentType:'application/json',body:'{"message":"需要登录"}'});return}
  await route.continue()
 })
 return ()=>calls
}
const enabled=(route:Route)=>route.fulfill({contentType:'application/json',body:'{"accounts":true,"ai":true}'})
test('加载期间不误报未配置，登录接口失败不影响独立AI状态',async({page,context})=>{
 let release!:()=>void
 const gate=new Promise<void>(resolve=>{release=resolve})
 const count=await mock(context,async route=>{await gate;await enabled(route)},true)
 try{
  await page.goto(base+'/#assistant')
  await expect(page.getByText('正在确认AI服务',{exact:true})).toBeVisible()
  await expect(page.getByText(/模型尚未配置/)).toHaveCount(0)
 }finally{release()}
 await expect(page.getByText('AI已连接',{exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'登录后使用AI',exact:true})).toBeVisible()
 await expect(page.getByText(/服务器当前未启用AI/)).toHaveCount(0)
 expect(count()).toBe(1)
})
test('能力检查失败显示连接问题，手动重试恢复且不清理本机旅程',async({page,context})=>{
 let available=false
 const count=await mock(context,async route=>{if(available)await enabled(route);else await route.fulfill({status:503,contentType:'application/json',body:'{"message":"temporarily unavailable"}'})})
 await page.goto(base+'/#assistant')
 await expect(page.getByText('AI状态暂不可确认',{exact:true})).toBeVisible()
 await expect(page.getByText(/模型尚未配置/)).toHaveCount(0)
 await page.evaluate(()=>localStorage.setItem('shanhe-status-regression','keep'))
 available=true
 await page.getByRole('button',{name:'重试连接',exact:true}).click()
 await expect(page.getByText('AI已连接',{exact:true})).toBeVisible()
 expect(await page.evaluate(()=>localStorage.getItem('shanhe-status-regression'))).toBe('keep')
 expect(count()).toBe(2)
 await page.getByRole('navigation',{name:'移动端导航'}).getByRole('button',{name:'我的',exact:true}).click()
 await expect(page.getByRole('button',{name:/关中到河套/})).toBeVisible()
})
test('服务器明确停用后重新检查可更新，离线不是模型未配置',async({page,context})=>{
 let available=false
 const count=await mock(context,route=>route.fulfill({contentType:'application/json',body:JSON.stringify({accounts:true,ai:available})}))
 await page.goto(base+'/#assistant')
 await expect(page.getByText('AI暂未启用',{exact:true})).toBeVisible()
 available=true
 await page.getByRole('button',{name:'重新检查AI状态',exact:true}).click()
 await expect(page.getByText('AI已连接',{exact:true})).toBeVisible()
 await context.setOffline(true)
 await expect(page.getByText('AI状态暂不可确认',{exact:true})).toBeVisible()
 await context.setOffline(false)
 await expect(page.getByText('AI已连接',{exact:true})).toBeVisible()
 expect(count()).toBeGreaterThanOrEqual(3)
})
test('非法能力响应不强制转换为未配置，返回前台会重新检查',async({page,context})=>{
 let valid=false
 const count=await mock(context,route=>route.fulfill({contentType:'application/json',body:valid?' {"accounts":true,"ai":true}':'{"accounts":true,"ai":"true"}'}))
 await page.goto(base+'/#assistant')
 await expect(page.getByText('AI状态暂不可确认',{exact:true})).toBeVisible()
 valid=true
 await page.clock.install()
 await page.clock.fastForward(16000)
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await expect(page.getByText('AI已连接',{exact:true})).toBeVisible()
 expect(count()).toBe(2)
})

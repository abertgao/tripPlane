import {test,expect} from '@playwright/test'
const base='https://62.234.178.115'
test.use({launchOptions:{chromiumSandbox:true},serviceWorkers:'allow'})
test('公网助手显示已连接，游客登录要求不误报模型未配置',async({page,context})=>{
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin===base)await route.continue();else await route.abort()})
 await page.setViewportSize({width:390,height:844})
 await page.goto(base+'/#assistant')
 await expect(page.getByText('AI已连接',{exact:true})).toBeVisible()
 await expect(page.getByText(/模型尚未配置/)).toHaveCount(0)
 await expect(page.getByRole('button',{name:'登录后使用AI',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'重新检查AI状态',exact:true}).click()
 await expect(page.getByText('AI已连接',{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'登录后使用AI',exact:true}).click()
 await expect(page.getByRole('heading',{name:'欢迎回到山河之间'})).toBeVisible()
})
test('旧HTTP入口仅本机导出、原档保留且不伪造任务完成',async({page,context})=>{
 const old='http://62.234.178.115:8802'
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if([old,base].includes(u.origin))await route.continue();else await route.abort()})
 await page.goto(old+'/migration')
 await page.evaluate(()=>localStorage.setItem('qin-route-checks',JSON.stringify({'1':true})))
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出本浏览器旧版存档'}).click();const download=await downloadPromise
 const stream=await download.createReadStream();expect(stream).not.toBeNull();const chunks:Buffer[]=[];for await(const chunk of stream!)chunks.push(Buffer.from(chunk));const result=JSON.parse(Buffer.concat(chunks).toString())
 expect(result.format).toBe('shanhe-journal');expect(result.state.completedActionIds).toEqual([]);expect(result.state.notes[0].text).toContain('第1天')
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('qin-route-checks')||'{}')['1'])).toBe(true)
})
test('公网手机视口无溢出、HTTPS可用、首次访问后离线重开',async({page,context})=>{
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin===base)await route.continue();else await route.abort()})
 await page.setViewportSize({width:375,height:812});await page.goto(base)
 await expect(page.getByRole('heading',{name:'把日常留在身后。'})).toBeVisible()
 await page.evaluate(async()=>{await navigator.serviceWorker.ready})
 await page.reload()
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBeTruthy()
 for(const width of [360,375,390,430]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy()}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/mobile-home.png',fullPage:true})
 await page.getByRole('button',{name:'开启我的探索'}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.waitForTimeout(220);await page.screenshot({path:'test-results/mobile-quest.png'})
 await page.getByRole('button',{name:'返回上一层'}).click()
 const cached=await page.evaluate(async()=>{const out:string[]=[];for(const key of await caches.keys()){for(const request of await (await caches.open(key)).keys())out.push(request.url)}return out})
 expect(cached.some(u=>new URL(u).pathname.startsWith('/api/'))).toBeFalsy()
 expect(cached.some(u=>u.endsWith('.js'))).toBeTruthy()
 await context.setOffline(true);await page.reload();await expect(page.getByRole('heading',{name:'把日常留在身后。'})).toBeVisible();await context.setOffline(false)
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'test-results/desktop-home.png',fullPage:true})
})

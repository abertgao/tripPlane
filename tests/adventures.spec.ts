import {test,expect} from '@playwright/test'
import {adventures,places,quests,guanzhongStoryIds} from '../shared/content.js'

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',launchOptions:{chromiumSandbox:true}})
const base=process.env.SHANHE_TEST_URL||'http://127.0.0.1:8812'
test.beforeEach(async({context})=>{
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url())
    if(url.origin!==new URL(base).origin){await route.abort();return}
    if(url.pathname==='/api/v1/auth/session'){await route.fulfill({json:{user:null,csrfToken:'',storageEpoch:''}});return}
    if(url.pathname==='/api/v1/capabilities'){await route.fulfill({json:{accounts:false,ai:false}});return}
    await route.continue()
  })
})

for(const id of guanzhongStoryIds){
  const place=places.find(p=>p.id===id)!,chapters=quests.filter(q=>q.placeId===id)
  test(`关中四地专题入口、刷新续玩与三章收束：${place.name}`,async({page})=>{
    test.setTimeout(60000)
    await page.goto(base)
    await expect(page.getByRole('button',{name:'开启我的探索'})).toBeEnabled()
    const collection=page.getByRole('region',{name:'关中四地任务卡'})
    await expect(collection.locator('.place-card')).toHaveCount(4)
    await collection.getByRole('button',{name:`查看${place.name}的故事`}).click()
    const dialog=page.getByRole('dialog')
    await expect(dialog.getByText(`资料初核：${place.sourceCheckedAt}`,{exact:false})).toBeVisible()
    await expect(dialog.getByRole('heading',{name:adventures[id].title,exact:true})).toBeVisible()
    await expect(dialog.getByRole('button',{name:new RegExp(chapters[1].title)})).toBeDisabled()
    await dialog.getByRole('button',{name:new RegExp(chapters[0].title)}).click()
    for(const [chapterIndex,chapter] of chapters.entries()){
      await expect(dialog.getByRole('heading',{name:chapter.title,exact:true})).toBeVisible()
      const maps=dialog.getByRole('link',{name:/Google Maps/})
      const address=new URL((await maps.getAttribute('href'))!).searchParams.get('query')
      expect(address).toBe(place.address)
      if(chapterIndex>0)await expect(dialog.locator('.carried-clue')).toContainText(`${place.name}第${chapterIndex}章第${chapters[chapterIndex-1].actions.length}项记录`)
      for(const [index,action] of chapter.actions.entries()){
        await expect(dialog.getByRole('textbox')).toHaveCount(1)
        await expect(dialog.getByText(action.text,{exact:true})).toBeVisible()
        await expect(dialog.getByText(chapter.clue,{exact:true})).toHaveCount(0)
        if(index+1<chapter.actions.length)await expect(dialog.getByText(chapter.actions[index+1].text,{exact:true})).toHaveCount(0)
        await expect(dialog.getByRole('button',{name:/提交记录，/})).toBeDisabled()
        await dialog.getByRole('textbox').fill(`${place.name}第${chapterIndex+1}章第${index+1}项记录`)
        if(chapterIndex===0&&index===0)await dialog.getByLabel('这条记录是',{exact:true}).selectOption('uncertain')
        await dialog.getByRole('button',{name:/提交记录，/}).click()
        await expect(dialog.locator('.answer-record')).toHaveCount(index+1)
        if(chapterIndex===0&&index===0){
          await expect(dialog.getByText(action.uncertainResponse,{exact:true})).toBeVisible()
          await page.reload()
          await page.getByRole('button',{name:'开启我的探索'}).click()
          await expect(dialog.locator('.answer-record')).toHaveCount(1)
        }
      }
      await expect(dialog.getByText(chapter.clue,{exact:true})).toBeVisible()
      if(chapter.nextQuestId)await dialog.getByRole('button',{name:'带着线索，进入下一章'}).click()
    }
    await expect(dialog.locator('.adventure-ending')).toContainText(adventures[id].uncertainEnding)
    await expect(dialog.locator('.ending-evidence')).toHaveCount(3)
    expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBeTruthy()
  })
}

test('关中四地可在候选日、故事标题和主题兴趣搜索中找到',async({page})=>{
  await page.goto(base+'/#route')
  const day=page.locator('#day-1')
  for(const id of guanzhongStoryIds)await expect(day.getByRole('button',{name:new RegExp(places.find(p=>p.id===id)!.name)})).toBeVisible()
  await expect(day).toContainText('不将四地串成一天必走路线')
  const search=page.getByRole('textbox',{name:'搜索地点'})
  await search.fill('  迟了一千年的茶会  ')
  await expect(page.locator('.place-card')).toHaveCount(1)
  await expect(page.getByRole('button',{name:'查看法门寺的故事'})).toBeVisible()
  await search.fill('壁画')
  await page.getByRole('button',{name:'寺窟与建筑',exact:true}).click()
  await expect(page.getByRole('button',{name:'查看懿德太子墓的故事'})).toBeVisible()
  await page.getByRole('button',{name:'全部',exact:true}).click()
  await search.fill('茂陵')
  await expect(page.locator('.place-card')).toHaveCount(1)
  await expect(page.getByRole('button',{name:'查看茂陵博物馆的故事'})).toBeVisible()
})

test('章节锁定、逐项调查、前章承接和独立故事结局',async({page})=>{
  const place=places.find(p=>p.id==='yaozhou')!,chapters=quests.filter(q=>q.placeId===place.id)
  await page.goto(base)
  await page.getByRole('button',{name:'查看耀州窑博物馆的故事'}).click()
  const dialog=page.getByRole('dialog')
  await expect(dialog.getByRole('heading',{name:adventures.yaozhou.title,exact:true})).toBeVisible()
  await expect(dialog.getByText(adventures.yaozhou.route,{exact:true})).toBeVisible()
  await expect(dialog.getByRole('button',{name:new RegExp(chapters[1].title)})).toBeDisabled()
  await expect(dialog.getByRole('button',{name:new RegExp(chapters[2].title)})).toBeDisabled()
  await dialog.getByRole('button',{name:new RegExp(chapters[0].title)}).click()
  for(const [chapterIndex,quest] of chapters.entries()){
    await expect(dialog.getByRole('heading',{name:quest.title,exact:true})).toBeVisible()
    await expect(dialog.getByRole('region',{name:'本任务导航'})).toContainText(place.address)
    if(chapterIndex>0)await expect(dialog.locator('.carried-clue')).toContainText(`第${chapterIndex}章的最后一条个人发现`)
    for(const [actionIndex,action] of quest.actions.entries()){
      await expect(dialog.getByRole('textbox')).toHaveCount(1)
      await expect(dialog.getByText(action.text,{exact:true})).toBeVisible()
      if(actionIndex+1<quest.actions.length)await expect(dialog.getByText(quest.actions[actionIndex+1].text,{exact:true})).toHaveCount(0)
      await expect(dialog.getByText(quest.clue,{exact:true})).toHaveCount(0)
      const answer=actionIndex===quest.actions.length-1?`第${chapterIndex+1}章的最后一条个人发现`:`我记下第${chapterIndex+1}章第${actionIndex+1}步的观察与选择`
      await dialog.getByRole('textbox').fill(answer)
      await dialog.getByRole('button',{name:/提交记录，/}).click()
      await expect(dialog.locator('.answer-record')).toHaveCount(actionIndex+1)
      await expect(dialog.getByText(action.response,{exact:true})).toBeVisible()
    }
    await expect(dialog.getByText(quest.clue,{exact:true})).toBeVisible()
    if(quest.nextQuestId)await dialog.getByRole('button',{name:'带着线索，进入下一章'}).click()
  }
  await expect(dialog.locator('.adventure-ending')).toContainText(adventures.yaozhou.ending)
  await expect(dialog.locator('.ending-evidence')).toHaveCount(3)
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBeTruthy()
  await page.screenshot({path:'test-results/adventure-ending-mobile.png'})
  await dialog.getByRole('button',{name:'收进我的旅行手记'}).click()
  await expect(page.getByRole('heading',{name:'把发现，装订成册。'})).toBeVisible()
})

test('未确认分支不会假装核验，回答作为纯文本，提交失败保留草稿',async({page})=>{
  await page.goto(base);await page.getByRole('button',{name:'开启我的探索'}).click()
  const dialog=page.getByRole('dialog'),first=quests[0].actions[0]
  const text='<img src=x onerror=alert(1)> 暂未到场，尚未确认入口。'
  await expect(page.locator('.save-status')).not.toContainText('正在保存')
  await dialog.getByRole('textbox').fill(text)
  await dialog.getByLabel('这条记录是',{exact:true}).selectOption('uncertain')
  await page.evaluate(()=>{
    const original=IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){
      if(this.name==='journeys'){IDBObjectStore.prototype.put=original;throw new DOMException('Test storage full','QuotaExceededError')}
      return original.apply(this,args)
    }
  })
  await dialog.getByRole('button',{name:'提交记录，展开下一项'}).click()
  await expect(dialog.getByRole('textbox')).toHaveValue(text)
  await expect(dialog.locator('.answer-message')).toContainText('未能保存')
  await expect(dialog.locator('.answer-record')).toHaveCount(0)
  await expect(dialog.getByText(quests[0].actions[1].text,{exact:true})).toHaveCount(0)
  await dialog.getByRole('button',{name:'提交记录，展开下一项'}).click()
  await expect(dialog.locator('.answer-record')).toHaveCount(1)
  await expect(dialog.locator('.answer-record blockquote')).toHaveText(text)
  await expect(dialog.locator('.answer-record img')).toHaveCount(0)
  await expect(dialog.getByText(first.uncertainResponse,{exact:true})).toBeVisible()
  await expect(dialog.getByText(first.response,{exact:true})).toHaveCount(0)
  await page.screenshot({path:'test-results/adventure-answer-mobile.png'})
})

test('旧勾选导入保留为历史，新任务不被提前解锁',async({page})=>{
  await page.goto(base+'/#mine')
  const state={schemaVersion:1,contentVersion:'shanhe-2026-v1',name:'旧记录兼容检查',startDate:'2026-09-27',days:11,selectedPlaceIds:['yaozhou'],skippedPlaceIds:[],completedActionIds:['yaozhou-1-a1','yaozhou-2-a3'],notes:[],activeQuestId:'yaozhou-2',ended:false,updatedAt:new Date().toISOString()}
  page.once('dialog',dialog=>dialog.accept())
  await page.locator('input[type=file]').setInputFiles({name:'legacy-journey.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'shanhe-journal',version:1,exportedAt:new Date().toISOString(),state}))})
  await expect(page.getByRole('button',{name:/旧记录兼容检查/})).toBeVisible()
  await page.getByRole('navigation',{name:'移动端导航'}).getByRole('button',{name:'手记',exact:true}).click()
  await page.getByText('旧版探索记录 · 2 项',{exact:true}).click()
  await expect(page.locator('.legacy-history li')).toHaveCount(2)
  await page.getByRole('button',{name:'去探索第一条线索'}).click()
  await expect(page.getByRole('dialog').locator('.answer-record')).toHaveCount(0)
  await expect(page.getByRole('dialog').getByText(quests[0].actions[0].text,{exact:true})).toBeVisible()
})

test('待消歧地点不输出假导航，离线回答刷新后仍可继续',async({page,context})=>{
  await page.goto(base+'/#route')
  await page.getByRole('textbox',{name:'搜索地点'}).fill('大碱湖')
  await page.getByRole('button',{name:'查看大碱湖（待核验）的故事'}).click()
  const first=quests.find(q=>q.placeId==='dajianhu')!,dialog=page.getByRole('dialog')
  await dialog.getByRole('button',{name:new RegExp(first.title)}).click()
  await expect(dialog.getByRole('region',{name:'本任务导航'})).toContainText('暂不提供导航')
  await expect(dialog.getByRole('link',{name:/Google Maps/})).toHaveCount(0)
  await context.setOffline(true)
  await dialog.getByRole('textbox').fill('仅有名称线索，还没有确认真实地点，不前往湖心。')
  await dialog.getByLabel('这条记录是',{exact:true}).selectOption('uncertain')
  await dialog.getByRole('button',{name:'提交记录，展开下一项'}).click()
  await expect(dialog.locator('.answer-record')).toHaveCount(1)
  await context.setOffline(false)
  await page.goto(base)
  await page.getByRole('button',{name:'开启我的探索'}).click()
  await expect(dialog.locator('.answer-record blockquote')).toContainText('还没有确认真实地点')
})

test('检查点恢复答案和解锁位置，收束旅程只读，新旅程独立',async({page})=>{
  await page.goto(base)
  await page.getByRole('button',{name:'开启我的探索'}).click()
  const dialog=page.getByRole('dialog'),nav=page.getByRole('navigation',{name:'移动端导航'})
  await dialog.getByRole('textbox').fill('原旅程的第一条记录')
  await dialog.getByRole('button',{name:'提交记录，展开下一项'}).click()
  await expect(dialog.locator('.answer-record')).toHaveCount(1)
  await dialog.getByRole('button',{name:'返回上一层'}).click()
  await nav.getByRole('button',{name:'我的',exact:true}).click()
  await page.getByRole('button',{name:'保存当前检查点'}).click()
  await page.getByRole('dialog').getByRole('textbox').fill('第一步留档')
  await page.getByRole('dialog').getByRole('button',{name:'确认'}).click()
  await expect(page.locator('.checkpoint').filter({hasText:'第一步留档'})).toBeVisible()
  await nav.getByRole('button',{name:'探索',exact:true}).click()
  await page.getByRole('button',{name:'开启我的探索'}).click()
  await dialog.getByRole('textbox').fill('原旅程的第二条记录')
  await dialog.getByRole('button',{name:/提交记录，/}).click()
  await expect(dialog.locator('.answer-record')).toHaveCount(2)
  await dialog.getByRole('button',{name:'返回上一层'}).click()
  await nav.getByRole('button',{name:'我的',exact:true}).click()
  page.once('dialog',d=>d.accept())
  await page.locator('.checkpoint').filter({hasText:'第一步留档'}).getByRole('button',{name:'恢复'}).click()
  await expect(page.locator('.save-status')).toContainText('已恢复')
  await nav.getByRole('button',{name:'探索',exact:true}).click()
  await page.getByRole('button',{name:'开启我的探索'}).click()
  await expect(dialog.locator('.answer-record')).toHaveCount(1)
  await expect(dialog.getByText(quests[0].actions[1].text,{exact:true})).toBeVisible()
  await dialog.getByRole('button',{name:'返回上一层'}).click()
  await nav.getByRole('button',{name:'手记',exact:true}).click()
  page.once('dialog',d=>d.accept())
  await page.getByRole('button',{name:'在这里，收束旅程'}).click()
  await expect(page.getByRole('button',{name:'重新翻开这本路书'})).toBeVisible()
  await nav.getByRole('button',{name:'探索',exact:true}).click()
  await page.getByRole('button',{name:'开启我的探索'}).click()
  await expect(dialog.getByText('旅程已收束。可回看记录，或到手记重新翻开路书后继续。')).toBeVisible()
  await expect(dialog.getByRole('textbox')).toHaveCount(0)
  await dialog.getByRole('button',{name:'返回上一层'}).click()
  await nav.getByRole('button',{name:'我的',exact:true}).click()
  await page.getByRole('button',{name:'新建旅程'}).click()
  await dialog.getByRole('textbox').fill('另一本没有答案的路书')
  await dialog.getByRole('button',{name:'确认'}).click()
  await expect(page.getByRole('button',{name:/另一本没有答案的路书/})).toBeVisible()
  await nav.getByRole('button',{name:'探索',exact:true}).click()
  await page.getByRole('button',{name:'开启我的探索'}).click()
  await expect(dialog.locator('.answer-record')).toHaveCount(0)
  await expect(dialog.getByText(quests[0].actions[0].text,{exact:true})).toBeVisible()
})

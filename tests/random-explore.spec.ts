import {test, expect, type Page} from '@playwright/test'
import type {Journey, JourneyState} from '../src/shanhe/store'
import {places} from '../shared/content.js'

const base = process.env.SHANHE_TEST_URL || 'http://127.0.0.1:8817'
if (!['http://127.0.0.1:8817', 'http://127.0.0.1:8816'].includes(base)) throw new Error('Random exploration tests require an explicitly allowed local origin')
test.use({viewport:{width:390,height:844}, isMobile:true, hasTouch:true, serviceWorkers:'block', launchOptions:{chromiumSandbox:true}})
test.beforeEach(async ({context, page}) => {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== base) {await route.abort();return}
    if (url.pathname === '/api/v1/auth/session') {await route.fulfill({json:{user:null,csrfToken:'',storageEpoch:''}});return}
    if (url.pathname === '/api/v1/capabilities') {await route.fulfill({json:{accounts:false,ai:false}});return}
    if (url.pathname.startsWith('/api/')) {await route.abort();return}
    await route.continue()
  })
  await page.goto(base + '/#route')
  await expect(page.locator('.save-status')).toContainText('游客模式')
})

async function readJourney(page: Page): Promise<Journey> {
  return page.evaluate(async () => new Promise<Journey>((resolve,reject) => {
    const request = indexedDB.open('shanhe-journal-v1')
    request.onerror = () => reject(new Error('Cannot open test database'))
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction('journeys'), id = localStorage.getItem('shanhe-active:guest')!
      const row = transaction.objectStore('journeys').get(id)
      row.onsuccess = () => resolve(row.result)
      transaction.oncomplete = () => db.close()
    }
  }))
}
async function editLatest(page: Page, patch: Partial<JourneyState>, deleted = false) {
  await page.evaluate(async ({patch,deleted}) => new Promise<void>((resolve,reject) => {
    const request = indexedDB.open('shanhe-journal-v1')
    request.onerror = () => reject(new Error('Cannot open test database'))
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction('journeys','readwrite'), store = transaction.objectStore('journeys')
      const get = store.get(localStorage.getItem('shanhe-active:guest')!)
      get.onsuccess = () => store.put({...get.result, state:{...get.result.state,...patch}, deleted, operationId:crypto.randomUUID()})
      transaction.oncomplete = () => {db.close();resolve()}
      transaction.onerror = () => {db.close();reject(new Error('Cannot update test database'))}
    }
  }), {patch,deleted})
}
const panel = (page: Page) => page.getByRole('region',{name:'让下一站，留点惊喜。'})

for (const width of [360,390,430,1280]) {
  test(`随机探索：${width}px筛选交集、滑块键盘与预览无写入`, async ({page}) => {
    await page.setViewportSize({width,height:900})
    const before = await readJourney(page)
    await page.getByLabel('筛选地区').selectOption('河套·阴山')
    await page.getByRole('group',{name:'路线主题'}).getByRole('button',{name:'遗址与石刻',exact:true}).click()
    await page.getByRole('textbox',{name:'搜索地点'}).fill('岩画')
    await expect(panel(page).getByRole('slider')).toHaveValue('1')
    await expect(panel(page).getByRole('slider')).toBeDisabled()
    await panel(page).getByRole('button',{name:'随机探索',exact:true}).click()
    await expect(panel(page).locator('.random-results li')).toHaveCount(1)
    await expect(panel(page).locator('.random-results')).toContainText('炭窑口岩画')
    await expect(panel(page).locator('.random-results')).toContainText('入口待核验')
    expect(await readJourney(page)).toEqual(before)
    await page.getByRole('textbox',{name:'搜索地点'}).fill('')
    await expect(panel(page).getByRole('button',{name:/确认追加/})).toHaveCount(0)
    await page.getByRole('group',{name:'路线主题'}).getByRole('button',{name:'全部',exact:true}).click()
    const slider = panel(page).getByRole('slider')
    await slider.focus();await slider.press('Home');await expect(slider).toHaveValue('1')
    await slider.press('ArrowRight');await expect(slider).toHaveValue('2')
    await panel(page).getByRole('button',{name:'随机探索',exact:true}).click()
    await expect(panel(page).locator('.random-results li')).toHaveCount(2)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy()
    const bounds = await panel(page).getByRole('button',{name:'确认追加 2 处'}).boundingBox()
    expect(bounds!.height).toBeGreaterThanOrEqual(48)
    expect(await readJourney(page)).toEqual(before)
    await page.screenshot({path:`test-results/random-explore-${width}.png`,fullPage:true})
    await panel(page).getByRole('button',{name:'暂不加入'}).click()
    expect(await readJourney(page)).toEqual(before)
  })
}

test('随机探索：追加、保留最新手记和收藏、连续确认不重复、刷新保留', async ({page}) => {
  const before = await readJourney(page)
  await page.getByLabel('筛选地区').selectOption('河套·阴山')
  await panel(page).getByRole('button',{name:'随机探索',exact:true}).click()
  const ids = await panel(page).locator('.random-results li').evaluateAll(elements=>elements.map(element=>element.getAttribute('data-place-id')!))
  const selectedPlaceIds = [...before.state.selectedPlaceIds,'chenlu',ids[0]]
  const notes = [{id:crypto.randomUUID(),placeId:'yaozhou',text:'另一个页面刚存下的手记',createdAt:new Date().toISOString()}]
  await editLatest(page,{selectedPlaceIds,notes})
  await panel(page).getByRole('button',{name:'确认追加 3 处'}).evaluate((button: HTMLButtonElement)=>{button.click();button.click()})
  await expect(panel(page).locator('.random-message')).toContainText('已追加 2 处')
  const after = await readJourney(page)
  expect(after.state.selectedPlaceIds).toEqual([...selectedPlaceIds,...ids.slice(1)])
  expect(after.state.notes).toEqual(notes)
  for (const key of ['skippedPlaceIds','actionAnswers','legacyCompletedActionIds','completedActionIds','activeQuestId','days','startDate'] as const) expect(after.state[key]).toEqual(before.state[key])
  await page.reload()
  await expect(page.locator('.save-status')).toContainText('游客模式')
  expect((await readJourney(page)).state).toEqual(after.state)
})

test('随机探索：保存失败保留预览，重试成功，单点耗尽清晰提示', async ({page}) => {
  const before = await readJourney(page)
  await page.getByLabel('筛选地区').selectOption('关中')
  await page.getByRole('textbox',{name:'搜索地点'}).fill('懿德')
  await panel(page).getByRole('button',{name:'随机探索',exact:true}).click()
  await page.evaluate(()=>{
    const original=IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){
      if(this.name==='journeys'){IDBObjectStore.prototype.put=original;throw new DOMException('Test quota full','QuotaExceededError')}
      return original.apply(this,args)
    }
  })
  await panel(page).getByRole('button',{name:'确认追加 1 处'}).click()
  await expect(panel(page).locator('.random-message')).toContainText('未能保存，预览已保留')
  await expect(panel(page).locator('.random-results li')).toHaveCount(1)
  expect(await readJourney(page)).toEqual(before)
  await panel(page).getByRole('button',{name:'确认追加 1 处'}).click()
  await expect(panel(page).locator('.random-message')).toContainText('已追加 1 处')
  await expect(panel(page).getByRole('button',{name:'随机探索',exact:true})).toBeDisabled()
  await expect(panel(page).locator('.random-empty')).toContainText('没有可追加')
})

test('随机探索：最新跳过及删除墓碑不能被旧预览复活', async ({page}) => {
  await page.getByRole('textbox',{name:'搜索地点'}).fill('懿德')
  await panel(page).getByRole('button',{name:'随机探索',exact:true}).click()
  await editLatest(page,{skippedPlaceIds:['yide']})
  const skipped = await readJourney(page)
  await panel(page).getByRole('button',{name:'确认追加 1 处'}).click()
  await expect(panel(page).locator('.random-message')).toContainText('未能保存')
  expect(await readJourney(page)).toEqual(skipped)
  await editLatest(page,{},true)
  const deleted = await readJourney(page)
  await panel(page).getByRole('button',{name:'确认追加 1 处'}).click()
  await expect(panel(page).locator('.random-message')).toContainText('未能保存')
  expect(await readJourney(page)).toEqual(deleted)
})

test('随机探索：切旅程、跨标签会话重验使预览失效，空筛选不随机', async ({page}) => {
  await panel(page).getByRole('button',{name:'随机探索',exact:true}).click()
  await page.evaluate(()=>{const channel=new BroadcastChannel('shanhe-identity');channel.postMessage({type:'identity'});channel.close()})
  await expect(panel(page).getByRole('button',{name:/确认追加/})).toHaveCount(0)
  await page.getByRole('textbox',{name:'搜索地点'}).fill('不存在的地点')
  await expect(panel(page).getByRole('button',{name:'随机探索',exact:true})).toBeDisabled()
  await page.getByRole('textbox',{name:'搜索地点'}).fill('')
  await panel(page).getByRole('button',{name:'随机探索',exact:true}).click()
  await page.getByRole('navigation',{name:'移动端导航'}).getByRole('button',{name:'我的',exact:true}).click()
  await page.getByRole('button',{name:'新建旅程',exact:true}).click()
  await page.getByRole('dialog').getByRole('textbox').fill('独立随机旅程')
  await page.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click()
  await expect(page.getByRole('button',{name:/独立随机旅程/})).toBeVisible()
  await page.getByRole('navigation',{name:'移动端导航'}).getByRole('button',{name:'路线',exact:true}).click()
  await expect(panel(page).getByRole('button',{name:/确认追加/})).toHaveCount(0)
  expect((await readJourney(page)).state.selectedPlaceIds).toEqual(places.filter(p=>p.verified).slice(0,6).map(p=>p.id))
})

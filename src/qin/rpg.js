import { getCustomTasks, saveStored, taskSchema, createTaskId } from './storage.js'

const starterTasks = [
  { id: 101, title: '直道寻迹者', type: '探索', difficulty: '普通', xp: 120, day: 'D2', location: '淳化秦直道', slots: 4, joined: 2, description: '在不踏入文保区的前提下，寻找并记录三处古道地貌特征。', tags: ['摄影', '徒步'], status: '招募中', author: 'Route Master' },
  { id: 102, title: '太白梁斥候', type: '徒步', difficulty: '史诗', xp: 360, day: 'D4', location: '车路梁 → 太白梁', slots: 6, joined: 4, description: '完成10–12km科考原线，提交轨迹并照看队伍中的新手成员。', tags: ['耐力', '协作'], status: '招募中', author: '北地行者' },
  { id: 103, title: '石城解码', type: '考古', difficulty: '稀有', xp: 240, day: 'D6', location: '石峁遗址', slots: 8, joined: 7, description: '跟随讲解辨认皇城台、石雕与城墙结构，完成五题遗址问答。', tags: ['历史', '知识'], status: '即将满员', author: '考古猫' },
  { id: 104, title: '候鸟守望者', type: '摄影', difficulty: '普通', xp: 150, day: 'D7', location: '红碱淖', slots: 5, joined: 1, description: '日落前完成一次文明观鸟记录，不追逐、不投喂、不惊扰。', tags: ['生态', '日落'], status: '招募中', author: '风之镜头' },
  { id: 105, title: '帝国北境终章', type: '探索', difficulty: '传说', xp: 500, day: 'D9', location: '麻池古城', slots: 3, joined: 2, description: '抵达秦九原郡治，以同一构图复刻直道起点与终点两张照片。', tags: ['终章', '仪式'], status: '即将满员', author: 'Route Master' },
  { id: 106, title: '公路补给官', type: '协作', difficulty: '普通', xp: 100, day: '全程', location: '沿途营地', slots: 4, joined: 3, description: '每日出发前完成车辆、饮水、药品和通讯设备四项检查。', tags: ['后勤', '安全'], status: '即将满员', author: '车队领航' }
]

const colors = { '普通': 'bg-emerald-100 text-emerald-800', '稀有': 'bg-blue-100 text-blue-800', '史诗': 'bg-purple-100 text-purple-800', '传说': 'bg-amber-100 text-amber-800' }
const icons = { '探索': 'ri-compass-discover-line', '徒步': 'ri-footprint-line', '考古': 'ri-ancient-pavilion-line', '摄影': 'ri-camera-lens-line', '协作': 'ri-team-line' }
const loadTasks = () => [...starterTasks, ...getCustomTasks()]

function taskCard(task) {
  const full = task.joined >= task.slots
  const card = document.createElement('article')
  card.className = 'task-card group flex h-full flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-seal'
  card.dataset.type = task.type
  card.innerHTML = `<div class="flex items-start justify-between"><span class="grid h-12 w-12 place-items-center rounded-xl bg-ink text-xl text-[#d6b37a]"><i data-field="icon"></i></span><span data-field="difficulty" class="rounded-full px-3 py-1 text-xs font-bold"></span></div>
    <div class="mt-5 flex items-center gap-2 text-xs font-bold tracking-wider text-cinnabar"><span data-field="day"></span><span>·</span><span data-field="location"></span></div><h3 data-field="title" class="mt-2 font-serif text-xl font-bold"></h3><p data-field="description" class="mt-3 flex-1 text-sm leading-6 text-stone-600"></p>
    <div data-field="tags" class="mt-4 flex flex-wrap gap-2"></div>
    <div class="mt-5 border-t border-stone-100 pt-4"><div class="mb-2 flex justify-between text-xs"><span class="font-bold text-bronze"><i class="ri-flashlight-line"></i> <span data-field="xp"></span></span><span data-field="seats" class="text-stone-500"></span></div><div class="h-1.5 overflow-hidden rounded-full bg-stone-100"><div data-field="progress" class="h-full rounded-full bg-cinnabar"></div></div></div>
    <button class="join-task mt-5 w-full rounded-xl py-3 text-sm font-bold transition"></button>`
  const field = name => card.querySelector(`[data-field="${name}"]`)
  for (const name of ['title', 'description', 'location', 'day', 'difficulty']) {
    field(name).textContent = task[name]
  }
  field('icon').className = icons[task.type]
  field('difficulty').classList.add(...colors[task.difficulty].split(' '))
  field('xp').textContent = `${task.xp} XP`
  field('seats').textContent = `${task.joined}/${task.slots} 位远征者`
  field('progress').style.width = `${Math.min(100, task.joined / task.slots * 100)}%`
  for (const tag of task.tags) {
    const label = document.createElement('span')
    label.className = 'rounded-md bg-stone-100 px-2 py-1 text-xs text-stone-600'
    label.textContent = `# ${tag}`
    field('tags').append(label)
  }
  const button = card.querySelector('.join-task')
  button.dataset.id = String(task.id)
  button.disabled = full
  button.textContent = full ? '队伍已满' : '接受任务'
  button.classList.add(...(full ? 'cursor-not-allowed bg-stone-100 text-stone-400' : 'bg-ink text-white hover:bg-moss').split(' '))
  return card
}

export function renderGuild(root) {
  const tasks = loadTasks()
  root.innerHTML = `<section class="relative overflow-hidden bg-ink px-4 py-16 text-white md:px-8"><div class="absolute -right-32 -top-32 h-96 w-96 rounded-full border border-amber-100/10"></div><div class="absolute -right-16 -top-16 h-64 w-64 rounded-full border border-amber-100/10"></div><div class="relative mx-auto max-w-[1600px]"><div class="flex flex-col justify-between gap-8 lg:flex-row lg:items-end"><div><div class="mb-5 inline-flex rounded-full border border-amber-300/20 bg-amber-200/10 px-4 py-2 text-xs tracking-[.2em] text-amber-200">QIN ROAD ADVENTURERS' GUILD</div><h1 class="font-serif text-4xl font-black md:text-6xl">秦直道 · 远征任务公会</h1><p class="mt-4 max-w-2xl leading-7 text-stone-300">把旅途变成共同书写的冒险。发布路书挑战、招募同伴，在八百公里古道上积累你的探索经验。</p></div><button id="publish-open" class="shrink-0 rounded-full bg-cinnabar px-7 py-3.5 font-bold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[#9f3d2c]"><i class="ri-quill-pen-line mr-2"></i>发布新任务</button></div>
    <div class="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-4">${[['任务总数', tasks.length, 'ri-flag-2-line'], ['待招募席位', tasks.reduce((a, t) => a + Math.max(0, t.slots - t.joined), 0), 'ri-user-add-line'], ['远征总经验', tasks.reduce((a, t) => a + Number(t.xp), 0), 'ri-flashlight-line'], ['最高难度', '传说', 'ri-vip-crown-2-line']].map(x => `<div class="bg-ink/80 p-5"><i class="${x[2]} text-xl text-amber-400"></i><strong class="mt-3 block font-serif text-2xl">${x[1]}</strong><span class="text-xs text-stone-400">${x[0]}</span></div>`).join('')}</div></div></section>
    <section class="mx-auto max-w-[1600px] px-4 py-14 md:px-8"><div class="mb-8 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div><p class="text-xs font-bold tracking-[.25em] text-cinnabar">QUEST BOARD</p><h2 class="mt-2 font-serif text-3xl font-black">悬赏任务板</h2></div><div class="flex flex-col gap-3 sm:flex-row"><div class="relative"><i class="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-stone-400"></i><input id="task-search" class="w-full rounded-full border border-stone-300 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-ink sm:w-64" placeholder="搜索任务或地点"></div><select id="task-filter" class="rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-ink"><option value="全部">全部类型</option>${['探索','徒步','考古','摄影','协作'].map(x => `<option>${x}</option>`).join('')}</select></div></div>
    <div id="task-grid" class="grid gap-5 md:grid-cols-2 xl:grid-cols-3"></div><div id="task-empty" class="hidden rounded-2xl border border-dashed border-stone-300 py-16 text-center text-stone-500"><i class="ri-map-pin-time-line text-4xl"></i><p class="mt-3">没有找到匹配的远征任务</p></div></section>
    <section class="bg-[#e7ddca] py-14"><div class="mx-auto grid max-w-[1600px] gap-5 px-4 md:grid-cols-3 md:px-8"><div class="md:col-span-1"><p class="text-xs font-bold tracking-[.25em] text-cinnabar">GUILD CODEX</p><h2 class="mt-2 font-serif text-3xl font-black">公会守则</h2><p class="mt-3 text-sm leading-7 text-stone-600">真正的远征者尊重历史、自然与同行者。</p></div>${[['ri-shield-check-line','文保优先','不攀爬、不刻画、不捡拾任何遗址构件。'],['ri-leaf-line','无痕探索','带走垃圾，只留下可核验的足迹与影像。']].map(x => `<div class="rounded-2xl bg-white p-6"><i class="${x[0]} text-3xl text-moss"></i><h3 class="mt-4 font-serif text-xl font-bold">${x[1]}</h3><p class="mt-2 text-sm leading-6 text-stone-600">${x[2]}</p></div>`).join('')}</div></section>
    ${renderModal()}`
  root.querySelector('#task-grid').replaceChildren(...tasks.map(taskCard))
  bindGuild(root)
}

function renderModal() {
  return `<div id="publish-modal" role="dialog" aria-modal="true" aria-labelledby="publish-heading" class="fixed inset-0 z-[70] hidden items-center justify-center bg-ink/70 p-4 backdrop-blur-sm"><div class="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-paper shadow-2xl"><div class="sticky top-0 flex items-center justify-between border-b border-stone-200 bg-paper/95 px-6 py-5 backdrop-blur"><div><p class="text-xs font-bold tracking-[.2em] text-cinnabar">NEW QUEST</p><h2 id="publish-heading" class="font-serif text-2xl font-black">发布远征任务</h2></div><button id="publish-close" aria-label="关闭发布窗口" class="grid h-10 w-10 place-items-center rounded-full bg-white text-xl hover:bg-stone-100"><i class="ri-close-line"></i></button></div><form id="publish-form" class="grid gap-5 p-6 sm:grid-cols-2">
    <p class="sm:col-span-2 text-sm text-stone-600">静态演示：新任务仅保存在当前浏览器，不会公开发布或同步给其他人。</p>
    <label class="sm:col-span-2"><span class="mb-2 block text-sm font-bold">任务名称</span><input name="title" required maxlength="24" class="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-bronze" placeholder="例如：寻找消失的烽燧"></label>
    <label><span class="mb-2 block text-sm font-bold">任务类型</span><select name="type" class="w-full rounded-xl border border-stone-300 bg-white px-4 py-3">${['探索','徒步','考古','摄影','协作'].map(x => `<option>${x}</option>`).join('')}</select></label><label><span class="mb-2 block text-sm font-bold">难度</span><select name="difficulty" class="w-full rounded-xl border border-stone-300 bg-white px-4 py-3">${['普通','稀有','史诗','传说'].map(x => `<option>${x}</option>`).join('')}</select></label>
    <label><span class="mb-2 block text-sm font-bold">对应日程</span><select name="day" class="w-full rounded-xl border border-stone-300 bg-white px-4 py-3">${Array.from({length:10},(_,i)=>`<option>D${i+1}</option>`).join('')}<option>全程</option></select></label><label><span class="mb-2 block text-sm font-bold">任务地点</span><input name="location" required maxlength="60" class="w-full rounded-xl border border-stone-300 bg-white px-4 py-3" placeholder="遗址或集合点"></label>
    <label><span class="mb-2 block text-sm font-bold">经验奖励 XP</span><input name="xp" required type="number" min="50" max="999" step="1" value="150" class="w-full rounded-xl border border-stone-300 bg-white px-4 py-3"></label><label><span class="mb-2 block text-sm font-bold">队伍人数</span><input name="slots" required type="number" min="1" max="20" step="1" value="4" class="w-full rounded-xl border border-stone-300 bg-white px-4 py-3"></label>
    <label class="sm:col-span-2"><span class="mb-2 block text-sm font-bold">任务说明</span><textarea name="description" required maxlength="120" rows="3" class="w-full resize-none rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-bronze" placeholder="写清楚目标、完成条件与安全要求"></textarea></label><label class="sm:col-span-2"><span class="mb-2 block text-sm font-bold">任务标签</span><input name="tags" maxlength="64" class="w-full rounded-xl border border-stone-300 bg-white px-4 py-3" placeholder="用逗号分隔，最多3个，每个20字"></label>
    <button class="sm:col-span-2 rounded-xl bg-cinnabar py-3.5 font-bold text-white transition hover:bg-[#9f3d2c]" type="submit"><i class="ri-send-plane-fill mr-2"></i>钤印并发布</button></form></div></div>`
}

function bindGuild(root) {
  const modal = root.querySelector('#publish-modal')
  root.querySelector('#publish-open').addEventListener('click', () => { modal.classList.remove('hidden'); modal.classList.add('flex') })
  root.querySelector('#publish-close').addEventListener('click', () => { modal.classList.add('hidden'); modal.classList.remove('flex') })
  modal.addEventListener('click', e => { if (e.target === modal) { modal.classList.add('hidden'); modal.classList.remove('flex') } })
  const applyFilter = () => { const term = root.querySelector('#task-search').value.trim().toLowerCase(); const type = root.querySelector('#task-filter').value; let visible = 0; root.querySelectorAll('.task-card').forEach(card => { const show = (!term || card.textContent.toLowerCase().includes(term)) && (type === '全部' || card.dataset.type === type); card.classList.toggle('hidden', !show); if (show) visible++ }); root.querySelector('#task-empty').classList.toggle('hidden', visible > 0) }
  root.querySelector('#task-search').addEventListener('input', applyFilter); root.querySelector('#task-filter').addEventListener('change', applyFilter)
  root.querySelectorAll('.join-task').forEach(button => button.addEventListener('click', () => { button.innerHTML = '<i class="ri-check-line mr-1"></i>任务已接受'; button.className = 'join-task mt-5 w-full rounded-xl bg-moss py-3 text-sm font-bold text-white'; button.disabled = true; window.showToast('任务已加入你的远征日志') }))
  root.querySelector('#publish-form').addEventListener('submit', event => {
    event.preventDefault()
    if (!event.currentTarget.reportValidity()) return
    const form = new FormData(event.currentTarget)
    const tags = form.get('tags')
    if (typeof tags !== 'string' || tags.length > 64) return
    const result = taskSchema.safeParse({
      id: createTaskId(),
      title: form.get('title'),
      type: form.get('type'),
      difficulty: form.get('difficulty'),
      day: form.get('day'),
      location: form.get('location'),
      description: form.get('description'),
      xp: Number(form.get('xp')),
      slots: Number(form.get('slots')),
      joined: 0,
      tags: tags.split(/[,，]/).map(tag => tag.trim()).filter(Boolean),
      status: '招募中',
      author: '我',
    })
    if (!result.success) {
      window.showToast('请检查填写内容：最多三个标签，每个标签不超过20字')
      return
    }
    const custom = getCustomTasks()
    if (custom.length >= 100) {
      window.showToast('本地任务已达100条上限')
      return
    }
    if (!saveStored('qin-custom-tasks', [result.data, ...custom])) return
    renderGuild(root)
    window.showToast('新任务已保存到当前浏览器')
  })
}

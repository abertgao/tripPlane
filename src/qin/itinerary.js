import { getRouteChecks as getChecks, getPrepChecks, saveStored } from './storage.js'

export const routeDays = [
  { day: 1, date: '9/27', city: '西安', route: '抵达西安 · 休整', drive: '市内', level: '舒缓', type: '遗址', sites: ['秦咸阳宫遗址', '茂陵（顺路）'], tip: '首日不赶路，留足车辆检查与补给时间。', stay: '西安', icon: 'ri-ancient-gate-line' },
  { day: 2, date: '9/28', city: '庆阳', route: '西安 → 淳化 → 庆阳', drive: '约 330 km', level: '适中', type: '徒步', sites: ['秦林光宫遗址', '秦直道淳化段徒步'], tip: '在直道起点完成出征仪式，徒步段建议预留 2 小时。', stay: '庆阳', icon: 'ri-footprint-line' },
  { day: 3, date: '9/29', city: '延安', route: '庆阳 → 延安', drive: '约 260 km', level: '适中', type: '遗址', sites: ['秦直道庆阳段', '黄帝陵'], tip: '黄帝陵务必早到，避开假期前客流高峰。', stay: '延安', icon: 'ri-road-map-line' },
  { day: 4, date: '9/30', city: '延安', route: '延安周边深度探索', drive: '短途接驳', level: '挑战', type: '徒步', sites: ['石泓寺石窟', '富县段徒步 10–12km'], tip: '车路梁至太白梁为科考原线，备登山杖、离线轨迹与足量饮水。', stay: '延安', icon: 'ri-walk-line' },
  { day: 5, date: '10/1', city: '榆林', route: '延安 → 榆林', drive: '约 390 km', level: '充实', type: '石窟', sites: ['甘泉直道段', '钟山石窟', '靖边阳周故城'], tip: '点位较多，钟山石窟开放时间需提前核对。', stay: '榆林', icon: 'ri-landscape-line' },
  { day: 6, date: '10/2', city: '榆林', route: '榆林周边考古日', drive: '约 250 km', level: '充实', type: '遗址', sites: ['石峁遗址', '榆林朔方博物馆', '米脂万佛洞 / 悬空寺'], tip: '下午二选一，切勿贪多；石峁遗址建议跟随讲解。', stay: '榆林', icon: 'ri-building-2-line' },
  { day: 7, date: '10/3', city: '鄂尔多斯', route: '榆林 → 鄂尔多斯', drive: '约 340 km', level: '适中', type: '自然', sites: ['红碱淖', '二郎山'], tip: '把红碱淖安排在傍晚，天气合适可守候湿地日落。', stay: '鄂尔多斯', icon: 'ri-sun-line' },
  { day: 8, date: '10/4', city: '鄂尔多斯', route: '草原直道探索', drive: '约 220 km', level: '舒缓', type: '草原', sites: ['秦直道鄂尔多斯段', '成吉思汗陵'], tip: '草原段风大温差大，避免驶入未开放的遗址路基。', stay: '鄂尔多斯', icon: 'ri-compass-3-line' },
  { day: 9, date: '10/5', city: '包头', route: '鄂尔多斯 → 包头', drive: '约 190 km', level: '适中', type: '遗址', sites: ['秦直道终点段', '麻池古城', '阴山岩画·炭窑口'], tip: '阴山岩画道路条件多变，出发前确认预约和路况。', stay: '包头', icon: 'ri-map-pin-5-line' },
  { day: 10, date: '10/6', city: '返程', route: '包头 → 西安 / 各地', drive: '机动安排', level: '机动', type: '边塞', sites: ['高阙塞 / 鸡鹿塞', '包头返程'], tip: '边塞为体力与时间允许时的加餐，优先保证返程。', stay: '温暖的家', icon: 'ri-flight-takeoff-line' }
]

const images = {
  hero: 'https://assets.with.tencent.com/default/9ceccd1d-fcbc-413d-9fd6-5c36f9cf6865/image_1789887731_1_1.jpg',
  shimao: 'https://assets.with.tencent.com/default/35c943c4-5e06-4f4e-8b8d-512b7548a972/image_1789887733_2_1.jpg',
  lake: 'https://assets.with.tencent.com/default/657400c5-b85b-4afa-9bb0-1e53c548e558/image_1789887734_1_1.jpg',
  grass: 'https://assets.with.tencent.com/default/e6a07770-a7a8-4ddd-9932-d95554a67ecf/image_1789887737_1_1.jpg'
}

const cities = ['西安', '庆阳', '延安', '榆林', '鄂尔多斯', '包头']
let activeFilter = '全部'

function timelineCard(item, checked) {
  const sites = item.sites.map(site => `<span class="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-700">${site}</span>`).join('')
  return `<article class="day-card group relative overflow-hidden rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-seal" data-type="${item.type}" data-day="${item.day}">
    <div class="mb-5 flex items-start justify-between">
      <div class="flex gap-3"><span class="grid h-12 w-12 shrink-0 place-items-center rounded-xl ${checked ? 'bg-moss text-white' : 'bg-[#eee6d5] text-bronze'} text-xl"><i class="${checked ? 'ri-check-line' : item.icon}"></i></span><div><p class="text-xs font-bold uppercase tracking-[.2em] text-cinnabar">D${item.day} · ${item.date}</p><h3 class="mt-1 font-serif text-xl font-bold">${item.route}</h3></div></div>
      <button class="check-day grid h-9 w-9 place-items-center rounded-full border ${checked ? 'border-moss bg-moss text-white' : 'border-stone-200 text-stone-400 hover:border-moss hover:text-moss'}" data-day="${item.day}" aria-pressed="${checked === true}" aria-label="标记第${item.day}天完成"><i class="${checked ? 'ri-checkbox-circle-fill' : 'ri-checkbox-blank-circle-line'}"></i></button>
    </div>
    <div class="mb-5 flex flex-wrap gap-2">${sites}</div>
    <div class="grid grid-cols-3 gap-2 border-y border-stone-100 py-4 text-center text-xs"><div><i class="ri-steering-2-line block text-lg text-bronze"></i><span class="text-stone-500">${item.drive}</span></div><div class="border-x border-stone-100"><i class="ri-speed-up-line block text-lg text-bronze"></i><span class="text-stone-500">${item.level}</span></div><div><i class="ri-hotel-bed-line block text-lg text-bronze"></i><span class="text-stone-500">宿${item.stay}</span></div></div>
    <p class="mt-4 flex gap-2 text-sm leading-6 text-stone-600"><i class="ri-lightbulb-flash-line mt-0.5 text-amber-600"></i><span>${item.tip}</span></p>
  </article>`
}

function renderMapStrip() {
  return cities.map((city, index) => `<div class="relative flex min-w-[108px] flex-1 flex-col items-center text-center"><span class="z-10 grid h-10 w-10 place-items-center rounded-full border-4 border-[#343a31] ${index === 0 || index === cities.length - 1 ? 'bg-cinnabar text-white' : 'bg-[#c49a60] text-ink'} font-serif font-bold">${index + 1}</span><strong class="mt-2 text-sm text-white">${city}</strong><small class="text-[10px] text-stone-400">${index === 0 ? '起点' : index === cities.length - 1 ? '终点' : '驿站'}</small>${index < cities.length - 1 ? '<span class="absolute left-1/2 top-5 h-px w-full bg-gradient-to-r from-[#c49a60] to-stone-600"></span>' : ''}</div>`).join('')
}

export function renderItinerary(root) {
  const checks = getChecks()
  root.innerHTML = `<section class="relative min-h-[620px] overflow-hidden bg-ink">
    <img src="${images.hero}" alt="秦直道遗址" class="absolute inset-0 h-full w-full object-cover opacity-45">
    <div class="absolute inset-0 bg-gradient-to-r from-ink via-ink/80 to-transparent"></div><div class="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-transparent"></div>
    <div class="relative mx-auto flex min-h-[620px] max-w-[1600px] items-end px-4 pb-14 pt-24 md:px-8 lg:items-center lg:pb-10">
      <div class="max-w-3xl"><div class="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-white/10 px-4 py-2 text-xs tracking-[.18em] text-amber-100 backdrop-blur"><i class="ri-roadster-line"></i>国庆 · 单程 · 10天9晚</div>
      <p class="mb-3 font-serif text-lg tracking-[.35em] text-[#d6b37a]">循两千年前的帝国驰道北上</p><h1 class="font-serif text-5xl font-black leading-tight text-white md:text-7xl">八百公里秦直道<br><span class="text-[#d6b37a]">一场公路史诗</span></h1>
      <p class="mt-6 max-w-2xl text-base leading-8 text-stone-300">从秦林光宫启程，穿越黄土高原与毛乌素边缘，最终抵达九原郡。把遗址、石窟、古城与草原，串成一条可亲自丈量的历史轴线。</p>
      <div class="mt-8 flex flex-wrap gap-3"><button data-scroll="plan" class="rounded-full bg-cinnabar px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-[#9f3d2c]"><i class="ri-map-2-line mr-2"></i>展开行程</button><button data-nav="guild" class="rounded-full border border-white/30 bg-white/10 px-6 py-3 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20"><i class="ri-sword-line mr-2"></i>领取远征任务</button></div></div>
    </div></section>
    <section class="bg-ink pb-10"><div class="mx-auto max-w-[1600px] overflow-x-auto px-4 md:px-8"><div class="flex min-w-[720px] rounded-2xl border border-white/10 bg-white/5 px-6 py-6">${renderMapStrip()}</div></div></section>
    <section class="mx-auto max-w-[1600px] px-4 py-16 md:px-8" id="plan">
      <div class="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><p class="text-xs font-bold tracking-[.25em] text-cinnabar">EXPEDITION LOG</p><h2 class="mt-2 font-serif text-3xl font-black md:text-4xl">十日远征手记</h2><p class="mt-3 text-stone-600">按主题筛选日程，完成一日便盖下一枚电子路印。</p></div><div class="flex flex-wrap gap-2" id="filters">${['全部', '遗址', '徒步', '石窟', '自然', '草原', '边塞'].map((x, i) => `<button class="filter-btn rounded-full border px-4 py-2 text-sm transition ${i === 0 ? 'border-ink bg-ink text-white' : 'border-stone-300 bg-white hover:border-ink'}" data-filter="${x}">${x}</button>`).join('')}</div></div>
      <div class="grid gap-5 md:grid-cols-2 xl:grid-cols-3" id="day-grid">${routeDays.map(item => timelineCard(item, checks[item.day])).join('')}</div>
    </section>
    <section class="bg-[#e7ddca] py-16"><div class="mx-auto max-w-[1600px] px-4 md:px-8"><div class="mb-8 flex items-end justify-between"><div><p class="text-xs font-bold tracking-[.25em] text-cinnabar">FIELD NOTES</p><h2 class="mt-2 font-serif text-3xl font-black">沿途三种地貌</h2></div><span class="hidden text-sm text-stone-600 md:block">黄土沟壑 → 荒漠湿地 → 河套草原</span></div><div class="grid gap-5 lg:grid-cols-3">
      <figure class="group overflow-hidden rounded-2xl bg-white shadow-sm"><img src="${images.shimao}" alt="石峁遗址" class="h-64 w-full object-cover transition duration-700 group-hover:scale-105"><figcaption class="p-5"><span class="text-xs text-cinnabar">D6 · 神木</span><h3 class="mt-1 font-serif text-xl font-bold">石峁：石城高踞</h3></figcaption></figure>
      <figure class="group overflow-hidden rounded-2xl bg-white shadow-sm"><img src="${images.lake}" alt="红碱淖日落" class="h-64 w-full object-cover transition duration-700 group-hover:scale-105"><figcaption class="p-5"><span class="text-xs text-cinnabar">D7 · 榆林</span><h3 class="mt-1 font-serif text-xl font-bold">红碱淖：大漠落日</h3></figcaption></figure>
      <figure class="group overflow-hidden rounded-2xl bg-white shadow-sm"><img src="${images.grass}" alt="鄂尔多斯秦直道" class="h-64 w-full object-cover transition duration-700 group-hover:scale-105"><figcaption class="p-5"><span class="text-xs text-cinnabar">D8 · 鄂尔多斯</span><h3 class="mt-1 font-serif text-xl font-bold">直道：草原路脊</h3></figcaption></figure>
    </div></div></section>
    <section class="mx-auto grid max-w-[1600px] gap-6 px-4 py-16 md:px-8 lg:grid-cols-3"><div class="rounded-2xl bg-ink p-7 text-white lg:col-span-2"><p class="text-xs tracking-[.22em] text-amber-400">BEFORE DEPARTURE</p><h2 class="mt-2 font-serif text-2xl font-bold">出发前，别忘了这六件事</h2><div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${['下载全程离线地图', '检查备胎与胎压', '携带登山杖及护膝', '确认遗址开放预约', '准备防风保暖外套', '购买自驾旅行保险'].map((x, i) => `<label class="flex cursor-pointer items-center gap-3 rounded-xl bg-white/5 p-3 text-sm hover:bg-white/10"><input type="checkbox" class="prep-check h-4 w-4 accent-[#b94b35]" data-prep="${i}"><span>${x}</span></label>`).join('')}</div></div><div class="rounded-2xl border border-stone-200 bg-white p-7"><i class="ri-alarm-warning-line text-3xl text-cinnabar"></i><h3 class="mt-4 font-serif text-xl font-bold">道路提示</h3><p class="mt-3 text-sm leading-7 text-stone-600">部分秦直道遗址位于未铺装道路附近。雨后黄土路面湿滑，请勿驶入文保范围或无明确通行标识的便道。</p></div></section>`
  bindItinerary(root)
}

function bindItinerary(root) {
  const applyFilter = () => {
    root.querySelectorAll('.filter-btn').forEach(button => {
      const active = button.dataset.filter === activeFilter
      button.className = `filter-btn rounded-full border px-4 py-2 text-sm transition ${active ? 'border-ink bg-ink text-white' : 'border-stone-300 bg-white hover:border-ink'}`
      button.setAttribute('aria-pressed', String(active))
    })
    root.querySelectorAll('.day-card').forEach(card => card.classList.toggle('hidden', activeFilter !== '全部' && card.dataset.type !== activeFilter))
  }
  root.querySelectorAll('.filter-btn').forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter
    applyFilter()
  }))
  applyFilter()
  root.querySelectorAll('.check-day').forEach(button => button.addEventListener('click', () => {
    const checks = getChecks()
    const day = button.dataset.day
    if (!routeDays.some(item => String(item.day) === day)) return
    checks[day] = !checks[day]
    if (!saveStored('qin-route-checks', checks)) return
    renderItinerary(root)
    window.showToast(checks[day] ? `D${day} 路印已盖下` : `D${day} 已取消完成`)
  }))
  const prep = getPrepChecks()
  root.querySelectorAll('.prep-check').forEach(box => {
    box.checked = prep[box.dataset.prep] === true
    box.addEventListener('change', () => {
      const key = box.dataset.prep
      if (!/^[0-5]$/.test(key)) return
      const next = { ...getPrepChecks(), [key]: box.checked }
      if (!saveStored('qin-prep', next)) box.checked = !box.checked
    })
  })
}

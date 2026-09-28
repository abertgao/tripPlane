import {useEffect, useRef, useState} from 'react'
import {places, adventures} from '../../shared/content.js'
import {useJournal, type ExplorationContext} from './store'
import {drawRandomPlaces, randomCandidates, type ExplorationFilters, type RandomSelection} from './random-explore.js'
import './RandomExplore.css'

type Props = {filters: ExplorationFilters}
type Preview = {selection: RandomSelection; context: ExplorationContext}

export default function RandomExplore({filters}: Props) {
  const journal = useJournal(), state = journal.current?.state
  const [requestedCount, setRequestedCount] = useState(3)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const saving = useRef(false), mounted = useRef(true), drawButton = useRef<HTMLButtonElement>(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const candidates = state ? randomCandidates(state, filters) : []
  const count = Math.min(requestedCount, candidates.length)
  const context = journal.getExplorationContext()
  const boundary = JSON.stringify([context, filters, requestedCount])
  const latestBoundary = useRef(boundary)
  latestBoundary.current = boundary
  useEffect(() => { setPreview(null); setMessage('') }, [boundary])
  const eligible = new Set(candidates.map(place => place.id))
  const validPreview = preview && JSON.stringify(preview.context) === JSON.stringify(context)
    && JSON.stringify(preview.selection.filters) === JSON.stringify(filters)
    && preview.selection.placeIds.length === count && preview.selection.placeIds.every(id => eligible.has(id))
  const shown = validPreview ? preview.selection.placeIds.map(id => places.find(place => place.id === id)!) : []

  function draw() {
    if (!state || !count || saving.current) return
    try {
      const selection = drawRandomPlaces(state, filters, count)
      setPreview({selection, context: journal.getExplorationContext()})
      setMessage(`已抽选 ${selection.placeIds.length} 处，确认前不会改动旅程。${count === candidates.length ? '已选中全部可追加地点，换一组只会改变展示顺序。' : ''}`)
    } catch {
      setMessage('暂时无法抽选，请检查筛选条件后重试。')
    }
  }
  async function confirm() {
    if (!preview || !validPreview || saving.current) return
    const origin = latestBoundary.current
    saving.current = true; setBusy(true); setMessage('正在保存到本机…')
    try {
      const result = await journal.appendExploration(preview.context, preview.selection)
      if (!mounted.current || latestBoundary.current !== origin) return
      if (result.saved) {
        setPreview(null)
        setMessage(result.addedCount ? `已追加 ${result.addedCount} 处，原有收藏和记录保持不变。已保存本机${journal.session.user ? '，服务器同步状态见页顶' : ''}。` : '这些地点已在旅程中，没有重复添加。')
        drawButton.current?.focus({preventScroll: true})
      } else if (latestBoundary.current === origin) {
        setMessage('未能保存，预览已保留。请等待其他保存完成，或检查存储容量后重试；账号或跳过记录变化时请重新抽选。')
      }
    } finally {
      saving.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return <section className="random-explore" aria-labelledby="random-title" aria-busy={busy}>
    <div className="random-intro">
      <div className="random-emblem" aria-hidden="true"><i className="ri-compass-3-line"/></div>
      <div><span className="eyebrow">A LITTLE SERENDIPITY</span><h2 id="random-title">让下一站，留点惊喜。</h2><p>不必逐一挑选。先看看，再把心动的地方收入旅程。</p></div>
      <span className="random-badge">只追加 · 不替换</span>
    </div>
    <div className="random-scope"><span>{filters.region === '全部' ? '全部地区' : filters.region}</span><span>{filters.theme === '全部' ? '全部主题' : filters.theme}</span>{filters.query && <span>搜索：{filters.query}</span>}<small>当前 {candidates.length} 处可追加</small></div>
    <div className="random-controls">
      <div className="random-slider">
        <div className="random-count"><label htmlFor="random-count">这次，遇见几处？</label><output htmlFor="random-count"><strong>{String(count).padStart(2, '0')}</strong> 处</output></div>
        <input id="random-count" type="range" min={candidates.length ? 1 : 0} max={Math.max(1, candidates.length)} step={1} value={count} disabled={busy || candidates.length <= 1} aria-describedby="random-help" aria-valuetext={`${count}处，共${candidates.length}处可追加`} onChange={event => {setRequestedCount(Number(event.target.value));setPreview(null);setMessage('')}}/>
        <div className="random-scale" aria-hidden="true"><span>{candidates.length ? '1处 · 慢慢逛' : '暂无候选'}</span><span>最多 {candidates.length} 处</span></div>
      </div>
      <button ref={drawButton} className="button primary" disabled={busy || !count} onClick={draw}><i className="ri-shuffle-line" aria-hidden="true"/>{shown.length ? '换一组' : '随机探索'}</button>
    </div>
    <p id="random-help" className="random-help">已收藏、已跳过的地点不参与抽选。不自动排日，不代表顺路或当日开放。</p>
    {!count && <p className="random-empty">{!state ? '正在读取旅程…' : state.ended ? '旅程已收束，到手记重新翻开路书后再探索。' : '这个范围没有可追加的地点了。试试其他主题、地区或关键词；原有收藏都还在。'}</p>}
    {shown.length > 0 && <div className="random-preview">
      <div className="random-preview-heading"><h3>这一组，值得停一停</h3><span>预览 · 尚未加入</span></div>
      <ol className="random-results">{shown.map((place, index) => <li key={place.id} data-place-id={place.id}>
        <span className="random-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <div><h4>{place.name}</h4><p>{adventures[place.id].title}</p><small>{place.region} · {place.theme} · {place.duration}</small><span className="random-verification">{place.verified ? '已有场所线索 · 开放仍需确认' : '入口待核验 · 出发前确认'}</span></div>
      </li>)}</ol>
      <div className="random-confirm"><p>只加入收藏，不会完成任务。<br/>选了多处，也不必一天走完。</p><div><button className="button plain" disabled={busy} onClick={() => {setPreview(null);setMessage('已收起预览，旅程没有改变。');drawButton.current?.focus({preventScroll:true})}}>暂不加入</button><button className="button primary" disabled={busy} onClick={() => void confirm()}>{busy ? '正在保存…' : `确认追加 ${shown.length} 处`}<i className="ri-bookmark-line" aria-hidden="true"/></button></div></div>
    </div>}
    <p className="random-message" role="status" aria-live="polite" aria-atomic="true">{message}</p>
  </section>
}

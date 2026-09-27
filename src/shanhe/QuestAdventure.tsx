import React, {useEffect, useRef, useState} from 'react'
import {adventures, places, quests, legacyQuests} from '../../shared/content.js'
import {canOpenQuest, isQuestComplete, MAX_ANSWER_LENGTH} from '../../shared/progress.js'
import type {JourneyState} from './store'
import './quest-adventure.css'

type Quest = typeof quests[number]
type Place = typeof places[number]
type AnswerMode = 'observed' | 'uncertain'
const number = (n:number) => String(n).padStart(2,'0')
const Icon = ({name}:{name:string}) => <i className={`ri-${name}`} aria-hidden="true"/>

export function AdventureOverview({place,state,onOpen}:{place:Place;state:JourneyState;onOpen:(id:string)=>void}) {
  const adventure = adventures[place.id]
  return <section className="adventure-overview" aria-label="本地冒险规划">
    <span className="eyebrow">A STORY TO WALK INTO · 原创虚构冒险</span>
    <h3>{adventure.title}</h3><p className="adventure-premise">{adventure.premise}</p>
    <dl className="adventure-plan">
      <div><dt>最终目标</dt><dd>{adventure.goal}</dd></div>
      <div><dt>探索范围</dt><dd>{adventure.scope}</dd></div>
      <div><dt>顺路走法</dt><dd>{adventure.route}</dd></div>
      <div><dt>时间预算</dt><dd>{adventure.duration}</dd></div>
      <div><dt>这次体验</dt><dd>{adventure.interests}</dd></div>
    </dl>
    <p className="adventure-safety"><Icon name="information-line"/>{adventure.safety}</p>
    <h4>章节地图</h4><p className="form-help">地点之间自由选择；同一故事里，提交当前发现后才展开下一项。不评分，不需要标准答案。</p>
    <div className="adventure-chapters">{place.questIds.map((id,index)=>{
      const quest = quests.find(q=>q.id===id)!
      const unlocked = canOpenQuest(state,id), done = isQuestComplete(state,id)
      return <button key={id} className={`quest-list-item ${done?'chapter-done':''}`} disabled={!unlocked} onClick={()=>onOpen(id)}>
        <span>{number(index+1)}</span><span className="chapter-title"><strong>{quest.title}</strong><small>{done?'已记录 · 可回看':unlocked?'进入调查':`完成第 ${index} 章后开启`}</small></span><Icon name={done?'checkbox-circle-line':unlocked?'arrow-right-line':'lock-line'}/>
      </button>
    })}</div>
  </section>
}

export function LegacyQuestHistory({state}:{state:JourneyState}) {
  const completed = new Set(state.legacyCompletedActionIds)
  const previous = legacyQuests.filter(q=>q.actions.some(a=>completed.has(a.id)))
  if(!previous.length)return null
  return <details className="legacy-history"><summary>旧版探索记录 · {completed.size} 项</summary><p className="form-help">旧勾选原样保留，不会被当成新故事的回答或自动解锁新章节。</p>{previous.map(q=><section key={q.id}><h4>{places.find(p=>p.id===q.placeId)?.name} · {q.title}</h4><ul>{q.actions.filter(a=>completed.has(a.id)).map(a=><li key={a.id}>{a.text}</li>)}</ul>{q.actions.every(a=>completed.has(a.id))&&<p>{q.clue}</p>}</section>)}</details>
}

export default function QuestAdventure({quest,state,onAnswer,onNext,onPlace,onJournal}:{quest:Quest;state:JourneyState;onAnswer:(id:string,text:string,mode:AnswerMode)=>Promise<boolean>;onNext:(id:string)=>void;onPlace:()=>void;onJournal:()=>void}) {
  const place = places.find(p=>p.id===quest.placeId)!, adventure = adventures[place.id]
  const answers = new Map(state.actionAnswers.map(answer=>[answer.actionId,answer]))
  const completedCount = quest.actions.filter(a=>answers.has(a.id)).length
  const currentAction = quest.actions.find(a=>!answers.has(a.id))
  const chapterIndex = place.questIds.indexOf(quest.id)
  const previousQuest = chapterIndex>0?quests.find(q=>q.id===place.questIds[chapterIndex-1]):null
  const previousAnswer = previousQuest?answers.get(previousQuest.actions.at(-1)!.id):null
  const chapterAnswers = quest.actions.map(a=>answers.get(a.id)).filter(Boolean)
  const allPlaceAnswers = quests.filter(q=>q.placeId===place.id).flatMap(q=>q.actions.map(a=>answers.get(a.id))).filter(Boolean)
  const hasUncertain = allPlaceAnswers.some(a=>a!.mode==='uncertain')
  const [draft,setDraft] = useState(''), [mode,setMode] = useState<AnswerMode>('observed'), [saving,setSaving] = useState(false), [message,setMessage] = useState('')
  const textRef = useRef<HTMLTextAreaElement>(null), flowRef = useRef<HTMLDivElement>(null), submitting = useRef(false), mounted = useRef(true), advanceFocus = useRef(false)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  useEffect(()=>{
    if(!advanceFocus.current||saving)return
    advanceFocus.current=false
    textRef.current?.focus({preventScroll:true})
    flowRef.current?.querySelector(currentAction?'.answer-record:last-child':'.unlocked-clue')?.scrollIntoView({block:'start',behavior:'instant'})
  },[currentAction?.id,saving])
  async function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(submitting.current||!currentAction||!draft.trim()||draft.length>MAX_ANSWER_LENGTH)return
    submitting.current=true;setSaving(true);setMessage('')
    try {
      const saved=await onAnswer(currentAction.id,draft.trim(),mode)
      if(!mounted.current)return
      if(saved){setDraft('');setMode('observed');advanceFocus.current=true;setMessage(completedCount+1===quest.actions.length?'记录已保存，本章线索已展开。':'已保存你的记录，下一项已展开。')}
      else setMessage('未能保存，输入仍在。请检查存档提示后重试。')
    } catch {if(mounted.current)setMessage('未能保存，输入仍在。请稍后重试。')}
    finally {submitting.current=false;if(mounted.current)setSaving(false)}
  }
  async function copyAddress() {
    try {await navigator.clipboard.writeText(place.address);if(mounted.current)setMessage('地点已复制，请在地图中核对游客入口。')}
    catch {if(mounted.current)setMessage('未能自动复制，请长按下方地址手动复制。')}
  }
  if(!canOpenQuest(state,quest.id))return <div className="locked-clue"><Icon name="lock-line"/>请先完成这个地点的上一章，再来展开调查。</div>
  return <div className="quest-flow" ref={flowRef}>
    <div className="quest-meta"><span className="tag">QUEST {number(chapterIndex+1)} / {number(place.questIds.length)}</span><span>{adventure.title}</span></div>
    <section className="quest-location" aria-label="本任务导航">
      <span className="tiny-label"><Icon name="map-pin-line"/> 导航 · {place.name}</span>
      {place.address?<><p className="copyable-address">{place.address}</p><div className="quest-map-actions"><button className="link-button" onClick={copyAddress}>复制导航地址</button><a className="link-button" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address)}`} target="_blank" rel="noopener noreferrer">Google Maps <Icon name="external-link-line"/></a><a className="link-button" href={`https://uri.amap.com/search?keyword=${encodeURIComponent(place.address)}&callnative=0`} target="_blank" rel="noopener noreferrer">高德搜索</a></div></>:<p className="navigation-pending">名称或正式入口待核验，暂不提供导航。未确认前不出发、不凭同名搜索结果进入现场；可选择「暂未确认」留下核验记录。</p>}
      <p className="quest-local-route"><strong>本章范围</strong>{quest.location}</p><p className="form-help">{place.status}。地图仅作地点搜索，不代表当日开放。</p>
      <button className="link-button" onClick={onPlace}>查看主线、路线与公开资料 <Icon name="arrow-right-line"/></button>
    </section>
    {chapterIndex===0&&<details className="quest-brief" open={completedCount===0}><summary>冒险卷首 · 先看主线与走法</summary><h3>{adventure.title}</h3><p className="adventure-premise">{adventure.premise}</p><dl className="adventure-plan"><div><dt>最终目标</dt><dd>{adventure.goal}</dd></div><div><dt>合理范围</dt><dd>{adventure.scope}</dd></div><div><dt>路线 / 耗时</dt><dd>{adventure.route}<br/>{adventure.duration}</dd></div><div><dt>章节结构</dt><dd>{adventure.chapters.map(c=>c.title).join(' → ')}</dd></div></dl><p className="adventure-safety">{adventure.safety}</p></details>}
    {previousAnswer&&<aside className="carried-clue"><span className="tiny-label">从上一章带来的记录 · {previousAnswer.mode==='uncertain'?'待核实':'你的发现'}</span><blockquote>{previousAnswer.text}</blockquote><p>NPC 会沿着这条记录推进虚构剧情；尚未确认的内容仍保持待核实。</p></aside>}
    <div className="npc-scene"><span className="tiny-label">{quest.npc}</span><p>{quest.scene}</p></div>
    <h3 className="action-heading">这一章，一步一步来<span>{completedCount} / {quest.actions.length}</span></h3>
    <div className="quest-answer-history">{quest.actions.filter(a=>answers.has(a.id)).map((action,index)=>{
      const answer=answers.get(action.id)!
      return <details className="answer-record" key={action.id} open={index===completedCount-1}>
        <summary><span><Icon name={answer.mode==='uncertain'?'question-line':'check-line'}/> 行动 {number(index+1)} · {answer.mode==='uncertain'?'已记下疑问':'已留下发现'}</span><small>回看</small></summary>
        <p className="record-task">{action.text}</p><blockquote>{answer.text}</blockquote>
        <div className="npc-reply"><span className="tiny-label">{quest.npc} · 剧情回应</span><p>{answer.mode==='uncertain'?action.uncertainResponse:action.response}</p></div>
      </details>
    })}</div>
    {currentAction&&!state.ended&&<form className="quest-answer-form" onSubmit={submit} aria-label="记录当前行动">
      <span className="eyebrow">ACTION {number(completedCount+1)} · 只展开眼前这一步</span><h4>{currentAction.text}</h4>
      <label htmlFor={`answer-${currentAction.id}`}>{currentAction.prompt}</label>
      <textarea ref={textRef} id={`answer-${currentAction.id}`} value={draft} onChange={e=>setDraft(e.target.value)} maxLength={MAX_ANSWER_LENGTH} required disabled={saving} placeholder="留下一条你自己的发现、选择或尚未确认的情况……" aria-describedby="answer-help"/>
      <div className="answer-mode-row"><label htmlFor="answer-mode">这条记录是</label><select id="answer-mode" value={mode} onChange={e=>setMode(e.target.value as AnswerMode)} disabled={saving}><option value="observed">我的发现 / 选择</option><option value="uncertain">暂未确认 / 未能观察</option></select><span>{draft.length}/{MAX_ANSWER_LENGTH}</span></div>
      <p id="answer-help" className="form-help">无需答对或写长文；记录具体细节即可。未开放、未到场或没看清，请如实标为暂未确认。回答仅存入个人旅程，不发送给 AI；剧情回应不是事实鉴定。</p>
      <button className="button primary full" disabled={saving||!draft.trim()||draft.length>MAX_ANSWER_LENGTH}>{saving?'正在保存记录…':completedCount+1===quest.actions.length?'提交记录，揭开本章线索':'提交记录，展开下一项'}<Icon name="arrow-right-line"/></button>
      {quest.actions.length-completedCount-1>0&&<p className="next-action-hint"><Icon name="lock-line"/>还有 {quest.actions.length-completedCount-1} 项行动，随着你的发现逐步展开。</p>}
    </form>}
    {state.ended&&currentAction&&<div className="locked-clue"><Icon name="book-marked-line"/><span>旅程已收束。可回看记录，或到手记重新翻开路书后继续。</span><button className="link-button" onClick={onJournal}>前往手记</button></div>}
    <p className="answer-message" role="status" aria-live="polite">{message}</p>
    {!currentAction&&<section className="unlocked-clue" aria-label="本章线索"><span className="eyebrow"><Icon name="key-2-line"/> CHAPTER RECORDED · 剧情线索</span><h3>一条线索，收入手记。</h3><p>{quest.clue}</p>{chapterAnswers.some(a=>a!.mode==='uncertain')&&<p className="form-help">本章包含待核实记录；故事推进不代表你已亲见或证实了这些内容。</p>}{quest.nextQuestId?<button className="button primary" onClick={()=>onNext(quest.nextQuestId!)}>带着线索，进入下一章 <Icon name="arrow-right-line"/></button>:<><div className="adventure-ending"><span className="eyebrow">YOUR LOCAL EPILOGUE</span><h3>{adventure.title} · {hasUncertain?'带着留白收笔':'故事收束'}</h3><p>{hasUncertain?adventure.uncertainEnding:adventure.ending}</p><h4>让故事成为你的三条记录</h4>{place.questIds.map((id,index)=>{
        const chapter=quests.find(q=>q.id===id)!, last=answers.get(chapter.actions.at(-1)!.id)
        return last?<div className="ending-evidence" key={id}><span>{number(index+1)} · {chapter.title} · {last.mode==='uncertain'?'待核实':'个人记录'}</span><blockquote>{last.text}</blockquote></div>:null
      })}</div><button className="button primary" onClick={onJournal}>收进我的旅行手记 <Icon name="book-open-line"/></button></>}</section>}
  </div>
}

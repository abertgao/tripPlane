import React, {useState} from 'react'
import {getRouteChecks, getPrepChecks, getCustomTasks} from '../qin/storage.js'
import {journeyStateSchema} from '../../shared/schema.js'

export default function Migration() {
  const [message, setMessage] = useState('')
  function exportOld() {
    const route = getRouteChecks(), prep = getPrepChecks(), tasks = getCustomTasks()
    const stamp = new Date().toISOString()
    const notes = [`旧日程完成：${Object.entries(route).filter(([,v])=>v).map(([k])=>`第${k}天`).join('、') || '无'}`, `旧准备项：${Object.entries(prep).filter(([,v])=>v).map(([k])=>Number(k)+1).join('、') || '无'}`, ...tasks.map(t => `${t.title}（${t.location}）：${t.description}`)].join('\n').slice(0,2900)
    const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128
    const h = Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')
    const id = `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`
    const state = journeyStateSchema.parse({schemaVersion:1,contentVersion:'shanhe-2026-v1',name:'旧版秦直道行程 · 迁移',startDate:'2026-09-27',days:11,selectedPlaceIds:[],skippedPlaceIds:[],completedActionIds:[],activeQuestId:null,ended:false,updatedAt:stamp,notes:[{id,placeId:'legacy',text:notes,createdAt:stamp}]})
    const value = {format:'shanhe-journal',version:1,exportedAt:stamp,state}
    const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}))
    const a=document.createElement('a');a.href=url;a.download='shanhe-legacy.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000)
    setMessage('已导出转换后的手记。原始存档仍保留；旧日程不会被当作新故事的已完成证据。')
  }
  return <main style={{maxWidth:680,margin:'10vh auto',padding:28,lineHeight:1.9}}><p>SHANHE JOURNAL / 存档迁移</p><h1>把旧旅程，带到新的一页。</h1><p>HTTP 与 HTTPS 的浏览器存档互不相通。请在原来的设备、原来的浏览器导出，再前往安全网站导入。此页面不接收密码、邀请码或任何账号信息。</p>{location.protocol==='http:' ? <button onClick={exportOld}>导出本浏览器旧版存档</button> : <p>旧档导出需在 <a href="http://62.234.178.115:8802/migration">原 HTTP 入口</a> 操作，仅用于本机数据迁移。</p>}<p role="status">{message}</p><p>旧任务将整理为文字笔记。导出文件未加密，请自行妥善保存，不要通过公共链接分享。</p><a href="https://62.234.178.115/">进入 HTTPS 山河行记 →</a></main>
}

import React from 'react'
export default function AIServiceStatus({state,enabled,checking,authenticated,onRefresh,onLogin,onRoute}:{state:'loading'|'ready'|'error';enabled:boolean;checking:boolean;authenticated:boolean;onRefresh:()=>void;onLogin:()=>void;onRoute:()=>void}) {
 const ready=state==='ready'&&enabled
 return <div className="honest-note" aria-live="polite"><i className={ready?'ri-shield-check-line':'ri-information-line'} aria-hidden="true"/><div>
  {state==='loading'?<p>正在确认服务器AI状态，请稍候；此时还没有发送模型请求。</p>
    :state==='error'?<p>暂时无法确认AI服务状态，请检查网络后重试。这不代表模型未配置，你的本机存档不会被清除。</p>
    :!enabled?<p>服务器当前未启用AI，可以稍后重新检查。你仍可到<button className="link-button" onClick={onRoute}>沿途计划</button>手动调整；账号、任务和存档不受影响。</p>
    :<><p>由 DeepSeek 提供低费用AI支持；每人每日最多20次。发送将包含本次需求、必要行程约束和候选地点，不发送账号资料或私人笔记，请勿输入密钥或隐私信息。没有实时天气、路况和预约工具。</p>{!authenticated&&<p>AI服务已启用，请先登录并同步旅程，再生成调整提案。<button className="link-button" onClick={onLogin}>登录后使用AI</button></p>}</>}
  <button className="link-button" disabled={checking} onClick={onRefresh}>{checking?'正在检查…':state==='error'?'重试连接':'重新检查AI状态'}</button>
 </div></div>
}

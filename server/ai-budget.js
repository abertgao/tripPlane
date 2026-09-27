const fault=(message)=>Object.assign(new Error(message),{status:429,code:'AI_LIMIT'})
export const AI_LIMITS=Object.freeze({perUserPerDay:20,sitePerDay:100,maxConcurrent:2})
export function createAIBudget(db,{clock=Date.now}={}){
  const pending=new Set()
  const reserve=db.transaction((uid,day)=>{
    const count=actor=>db.prepare('SELECT attempts FROM ai_usage WHERE day=? AND actor=?').get(day,actor)?.attempts||0
    if(count(uid)>=AI_LIMITS.perUserPerDay)throw fault('今日AI调用已达20次，请明天再试；手动调整不受影响')
    if(count('*')>=AI_LIMITS.sitePerDay)throw fault('本站今日AI调用额度已用完，请明天再试')
    for(const actor of [uid,'*'])db.prepare('INSERT INTO ai_usage(day,actor,attempts) VALUES (?,?,1) ON CONFLICT(day,actor) DO UPDATE SET attempts=attempts+1').run(day,actor)
    const cutoff=new Date(clock()+8*3600000-35*86400000).toISOString().slice(0,10)
    db.prepare('DELETE FROM ai_usage WHERE day<?').run(cutoff)
  })
  return async function budget(uid,work){
    if(pending.has(uid))throw fault('上一份提案正在生成，请稍候，不要重复发送')
    if(pending.size>=AI_LIMITS.maxConcurrent)throw fault('AI正在处理其他请求，请稍后再试')
    const day=new Date(clock()+8*3600000).toISOString().slice(0,10)
    reserve(uid,day)
    pending.add(uid)
    try{return await work()}finally{pending.delete(uid)}
  }
}

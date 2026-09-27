import React, {useEffect, useId, useRef} from 'react'
let locks = 0
let scroll = 0
export default function Modal({title,children,onClose}:{title:string;children:React.ReactNode;onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null), closeRef=useRef(onClose), heading=useId()
  closeRef.current=onClose
  const dismiss=useRef<()=>void>(()=>{})
  useEffect(()=>{
    const el=ref.current!, token=crypto.randomUUID(), previous=history.state
    history.pushState({...previous,shanheModal:token},'')
    if(locks++===0){scroll=window.scrollY;Object.assign(document.body.style,{position:'fixed',top:`-${scroll}px`,width:'100%'})}
    el.showModal()
    const pop=()=>{if(history.state?.shanheModal!==token)closeRef.current()}
    dismiss.current=()=>{if(history.state?.shanheModal===token)history.back();else closeRef.current()}
    const cancel=(e:Event)=>{e.preventDefault();dismiss.current()}
    window.addEventListener('popstate',pop);el.addEventListener('cancel',cancel)
    return()=>{
      window.removeEventListener('popstate',pop);el.removeEventListener('cancel',cancel);el.close()
      if(history.state?.shanheModal===token)history.replaceState(previous,'')
      if(--locks===0){Object.assign(document.body.style,{position:'',top:'',width:''});window.scrollTo({top:scroll,behavior:'instant'})}
    }
  },[])
  useEffect(()=>{if(ref.current){ref.current.scrollTop=0}},[title])
  return <dialog ref={ref} className="modal" aria-labelledby={heading} onClick={e=>{if(e.target===e.currentTarget)dismiss.current()}}><div className="modal-top"><span className="eyebrow">SHANHE JOURNAL</span><button className="icon-button" aria-label="返回上一层" onClick={()=>dismiss.current()}><i className="ri-arrow-left-line" aria-hidden="true"/><span>返回</span></button></div><h2 id={heading}>{title}</h2>{children}</dialog>
}

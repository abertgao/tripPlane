import React,{useRef,useState} from 'react'
import Modal from './Modal'
type Request={title:string;value:string;password:boolean;resolve:(value:string|null)=>void}
export function usePrompt(){
 const [request,setRequest]=useState<Request|null>(null),input=useRef<HTMLInputElement>(null)
 function ask(title:string,value='',password=false){return new Promise<string|null>(resolve=>setRequest({title,value,password,resolve}))}
 function finish(value:string|null){request?.resolve(value);setRequest(null)}
 const dialog=request?<Modal title={request.title} onClose={()=>finish(null)}><form className="auth-form" onSubmit={e=>{e.preventDefault();finish(input.current?.value||null)}}><label>{request.password?'管理员口令':'填写内容'}<input key={request.title} ref={input} type={request.password?'password':'text'} defaultValue={request.value} autoComplete={request.password?'current-password':'off'} required minLength={request.password?12:1} maxLength={request.password?128:80} autoFocus/></label><button className="button primary full" type="submit">确认</button><button className="button plain" type="button" onClick={()=>finish(null)}>取消</button></form></Modal>:null
 return {ask,dialog}
}

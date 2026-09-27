import {useEffect,useLayoutEffect,useRef,useState} from 'react'
const tabs=new Set(['today','route','journal','assistant','mine'])
function read(){const key=location.hash.slice(1);return tabs.has(key)?key:'today'}
const positions:Record<string,number>={}
export function useNavigation(){
 const [page,setPage]=useState(read),current=useRef(page)
 const save=()=>{positions[current.current]=window.scrollY}
 useLayoutEffect(()=>{current.current=page;const frame=requestAnimationFrame(()=>window.scrollTo({top:positions[page]||0,behavior:'instant'}));return()=>cancelAnimationFrame(frame)},[page])
 useEffect(()=>{
  history.scrollRestoration='manual'
  const pop=()=>{const next=read();if(next!==current.current){save();setPage(next)}}
  window.addEventListener('popstate',pop)
  return()=>window.removeEventListener('popstate',pop)
 },[])
 function go(next:string){if(!tabs.has(next)||next===current.current)return;save();history.pushState({shanhePage:next},'',`#${next}`);setPage(next)}
 return {page,go}
}

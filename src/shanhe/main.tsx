import React from 'react'
import {createRoot} from 'react-dom/client'
import App from './App'
import Migration from './Migration'
import 'remixicon/fonts/remixicon.css'
import './styles.css'

window.addEventListener('unhandledrejection', event => {
  if (event.reason?.name === 'AbortError') event.preventDefault()
})

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {failed: boolean}> {
  state = {failed: false}
  static getDerivedStateFromError() { return {failed: true} }
  render() {
    if (this.state.failed) return <main style={{padding: '10vh 8vw', fontFamily: 'serif'}}><h1>旅程暂时停在了这里</h1><p>页面遇到了异常，本机存档不会被自动删除。</p><button onClick={() => location.reload()}>重新打开</button><p><a href="/migration">旧版存档迁移</a></p></main>
    return this.props.children
  }
}
const root = document.getElementById('app')!
createRoot(root).render(<ErrorBoundary>{location.pathname === '/migration' ? <Migration /> : <App />}</ErrorBoundary>)
if ('serviceWorker' in navigator && location.protocol === 'https:' && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}

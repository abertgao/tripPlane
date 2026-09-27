import 'remixicon/fonts/remixicon.css'
import './styles.css'
import { renderItinerary } from './itinerary.js'
import { renderGuild } from './rpg.js'

const app = document.querySelector('#app')
const toast = document.querySelector('#toast')
let toastTimer

window.showToast = message => {
  window.clearTimeout(toastTimer)
  toast.textContent = message
  toast.classList.remove('translate-y-6', 'opacity-0')
  toastTimer = window.setTimeout(() => toast.classList.add('translate-y-6', 'opacity-0'), 2200)
}

function navigate(page, push = true) {
  const safePage = page === 'guild' ? 'guild' : 'itinerary'
  safePage === 'guild' ? renderGuild(app) : renderItinerary(app)
  document.querySelectorAll('.nav-btn').forEach(button => {
    const active = button.dataset.nav === safePage
    button.classList.toggle('bg-white', active)
    button.classList.toggle('text-ink', active)
    button.classList.toggle('text-stone-300', !active)
    if (active) button.setAttribute('aria-current', 'page')
    else button.removeAttribute('aria-current')
  })
  if (push) history.pushState(null, '', `#${safePage}`)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

document.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return
  const nav = event.target.closest('[data-nav]')
  if (nav) navigate(nav.dataset.nav)
  const scroll = event.target.closest('[data-scroll]')
  if (scroll?.dataset.scroll === 'plan') {
    document.getElementById('plan')?.scrollIntoView({ behavior: 'smooth' })
  }
})

window.addEventListener('popstate', () => navigate(location.hash.slice(1), false))
navigate(location.hash.slice(1), false)

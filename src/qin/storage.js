import { z } from 'zod'

const taskTypes = ['探索', '徒步', '考古', '摄影', '协作']
const difficulties = ['普通', '稀有', '史诗', '传说']
const days = [...Array.from({ length: 10 }, (_, i) => `D${i + 1}`), '全程']
const text = max => z.string().trim().min(1).max(max)

export const taskSchema = z.object({
  id: z.union([z.number().int().positive().safe(), z.string().regex(/^[a-f0-9]{32}$/)]),
  title: text(24),
  type: z.enum(taskTypes),
  difficulty: z.enum(difficulties),
  xp: z.number().int().min(50).max(999),
  day: z.enum(days),
  location: text(60),
  slots: z.number().int().min(1).max(20),
  joined: z.number().int().min(0).max(20),
  description: text(120),
  tags: z.array(text(20)).max(3),
  status: z.enum(['招募中', '即将满员', '已满员']),
  author: text(32),
}).strict().refine(task => task.joined <= task.slots)

const routeSchema = z.record(z.enum(Array.from({ length: 10 }, (_, i) => String(i + 1))), z.boolean())
const prepSchema = z.record(z.enum(Array.from({ length: 6 }, (_, i) => String(i))), z.boolean())
const tasksSchema = z.array(taskSchema).max(100).refine(tasks => new Set(tasks.map(task => task.id)).size === tasks.length)
const schemas = new Map([
  ['qin-route-checks', routeSchema],
  ['qin-prep', prepSchema],
  ['qin-custom-tasks', tasksSchema],
])

function readStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw || raw.length > 100_000) return fallback
    const parsed = schemas.get(key).safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : fallback
  } catch {
    return fallback
  }
}

export const getRouteChecks = () => readStored('qin-route-checks', {})
export const getPrepChecks = () => readStored('qin-prep', {})
export const getCustomTasks = () => readStored('qin-custom-tasks', [])

export function saveStored(key, value) {
  const schema = schemas.get(key)
  if (!schema) return false
  const parsed = schema.safeParse(value)
  if (!parsed.success) return false
  try {
    const serialized = JSON.stringify(parsed.data)
    if (serialized.length > 100_000) return false
    localStorage.setItem(key, serialized)
    return true
  } catch {
    window.showToast('无法保存，请检查浏览器存储权限或可用空间')
    return false
  }
}

export function createTaskId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
}

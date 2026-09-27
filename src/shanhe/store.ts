import {useSyncExternalStore} from 'react'
import Dexie, {type Table} from 'dexie'
import {z} from 'zod'
import {journeyStateSchema, STATE_MAX_BYTES, journalExportSchema} from '../../shared/schema.js'
import {submitAnswer} from '../../shared/progress.js'
import {places, quests} from '../../shared/content.js'
import {api, ApiError, setCsrf} from './api'

export type JourneyState = z.infer<typeof journeyStateSchema>
export type Journey = {id: string; revision: number; state: JourneyState; scope: string; updatedAt: string; remoteId?: string; dirty: boolean; operationId: string; epoch: string; deleted?: boolean}
type Checkpoint = {id: string; journeyId: string; scope: string; name: string; createdAt: string; revision: number; state?: JourneyState}
const db = new Dexie('shanhe-journal-v1') as Dexie & {journeys: Table<Journey>; checkpoints: Table<Checkpoint>}
db.version(1).stores({journeys: 'id,scope,remoteId', checkpoints: 'id,journeyId,scope'})
const sessionSchema = z.object({user: z.object({id: z.string().uuid(), username: z.string().max(80), role: z.enum(['user', 'admin'])}).nullable(), csrfToken: z.string().max(256), storageEpoch: z.string().max(128)})
const remoteJourneySchema = z.object({id: z.string().uuid(), revision: z.number().int().nonnegative(), state: journeyStateSchema, updatedAt: z.string()}).passthrough()
const initialSession = {user: null as null | {id: string; username: string; role: string}, csrfToken: '', storageEpoch: '', accounts: false, ai: false}
const capabilitiesSchema = z.object({accounts: z.boolean(), ai: z.boolean()}).strict()
let capabilityRequest: Promise<void> | null = null
let capabilityLastAttempt = 0
let snapshot = {journeys: [] as Journey[], current: null as Journey | null, session: initialSession, capabilityState: 'loading' as 'loading' | 'ready' | 'error', capabilityChecking: false, checkpoints: [] as Checkpoint[], status: '正在读取本机存档', error: '', conflict: null as null | {local: Journey; remote: any; reason: string}}
const listeners = new Set<() => void>()
let started = false
let identity = 0
let scope = 'guest'
let syncing = false
let operations = Promise.resolve<unknown>(undefined)
const pending = new Map<string, {state: JourneyState; operationId: string; scope: string}>()
const answerSubmissions = new Set<string>()
let autosync: ReturnType<typeof setTimeout> | undefined
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('shanhe-identity') : null
function emit(patch: Partial<typeof snapshot>) { snapshot = {...snapshot, ...patch}; listeners.forEach(fn => fn()) }
function fail(error: unknown) { emit({error: error instanceof z.ZodError ? '记录格式、顺序或容量不符合要求，请检查后重试' : error instanceof Error ? error.message : '操作未完成，请重试', status: '未能完成，请查看提示'}) }
function now() { return new Date().toISOString() }
function uuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128
  const h = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`
}
function newState(name = '关中到河套 · 秋日行记'): JourneyState {
  return journeyStateSchema.parse({schemaVersion: 2, contentVersion: 'shanhe-2026-v2', name, startDate: '2026-09-27', days: 11,
    selectedPlaceIds: places.filter(p => p.verified).slice(0, 6).map(p => p.id), skippedPlaceIds: [], completedActionIds: [], actionAnswers: [], legacyCompletedActionIds: [], notes: [], activeQuestId: quests[0]?.id || null, ended: false, updatedAt: now()})
}
function serialize<T>(work: () => Promise<T>): Promise<T | undefined> {
  const result = operations.then(work)
  operations = result.catch(fail)
  return result.catch(error => { fail(error); return undefined })
}
function actor() { return {identity, scope, userId: snapshot.session.user?.id, epoch: snapshot.session.storageEpoch} }
function valid(a: ReturnType<typeof actor>) { return a.identity === identity && a.scope === scope }
function metadata(journey: Journey) {
  return {baseRevision: journey.revision, operationId: journey.operationId, intendedUserId: snapshot.session.user?.id, storageEpoch: journey.epoch || snapshot.session.storageEpoch}
}
function activeId() { try { return localStorage.getItem(`shanhe-active:${scope}`) } catch { return null } }
function remember(id: string) { try { localStorage.setItem(`shanhe-active:${scope}`, id) } catch { /* IndexedDB is the authoritative local store. */ } }
async function reload(preferred?: string) {
  const a = actor()
  const raw = await db.journeys.where('scope').equals(scope).toArray()
  const rows = raw.flatMap(row => {
    if (row.deleted) return []
    const parsed = journeyStateSchema.safeParse(row.state)
    if (!parsed.success) return []
    const edit = pending.get(row.id)
    return [edit && edit.scope === a.scope ? {...row, state: edit.state, dirty: true, operationId: edit.operationId} : {...row, state: parsed.data}]
  }).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))
  if (!valid(a)) return
  if (rows.length < raw.filter(r => !r.deleted).length) emit({error: '部分本机存档格式异常，未自动覆盖，请保留原浏览器数据'})
  const current = rows.find(r => r.id === (preferred || snapshot.current?.id || activeId())) || rows[0] || null
  emit({journeys: rows, current})
  if (current) remember(current.id)
}
function scheduleSync() {
  clearTimeout(autosync)
  if (snapshot.session.user && navigator.onLine) autosync = setTimeout(() => void sync(), 1000)
}
function refreshCapabilities(force = false): Promise<void> {
  if (capabilityRequest) return capabilityRequest
  if (!force && Date.now() - capabilityLastAttempt < 15000) return Promise.resolve()
  capabilityLastAttempt = Date.now()
  emit({capabilityChecking: true})
  capabilityRequest = (async () => {
    try {
      const cap = capabilitiesSchema.parse(await api('/capabilities'))
      if (!navigator.onLine) throw new Error('Offline')
      emit({session: {...snapshot.session, ...cap}, capabilityState: 'ready'})
    } catch {
      emit({capabilityState: 'error'})
    } finally {
      emit({capabilityChecking: false})
    }
  })().finally(() => { capabilityRequest = null })
  return capabilityRequest
}
async function init() {
  void refreshCapabilities()
  try {
    await db.open()
    await reload()
    if (!snapshot.current) await createJourney('关中到河套 · 秋日行记')
    emit({status: '已保存到本机'})
    await refreshSession(false)
  } catch (error) { fail(new Error('浏览器存储不可用，请关闭隐私限制或更换浏览器；尚未创建存档')) }
}
async function refreshSession(broadcast = true) {
  const generation = ++identity
  clearTimeout(autosync)
  void refreshCapabilities()
  try {
    const next = sessionSchema.parse(await api('/auth/session'))
    if (generation !== identity) return
    const nextScope = next.user?.id || 'guest'
    const previousScope = scope
    const changed = previousScope !== nextScope
    scope = nextScope
    setCsrf(next.csrfToken)
    emit({session: {...snapshot.session, ...next}, ...(changed ? {current: null, journeys: [], checkpoints: [], conflict: null} : {})})
    if (changed && previousScope !== 'guest') {
      await db.transaction('rw', db.journeys, db.checkpoints, async () => {
        const previous = await db.journeys.where('scope').equals(previousScope).toArray()
        for (const row of previous.filter(row => !row.dirty && !pending.has(row.id))) {
          await db.journeys.delete(row.id)
          await db.checkpoints.where('journeyId').equals(row.id).delete()
        }
      })
    }
    await reload()
    if (broadcast) channel?.postMessage({type: 'identity'})
    if (next.user) {
      await sync()
      if (generation === identity && !snapshot.current && snapshot.status === '已同步到服务器') await createJourney('我的山河行记')
    } else {
      if (!snapshot.current) await createJourney('我的山河行记')
      emit({status: '游客模式 · 已保存到本机'})
    }
  } catch {
    if (generation !== identity) return
    if (!snapshot.session.user) emit({status: '暂未验证会话 · 本机保存可用'})
    else emit({status: '暂未验证会话 · 同步已暂停'})
  }
}
async function createJourney(name = '新的山河行记') {
  const a = actor()
  return serialize(async () => {
    if (!valid(a)) throw new Error('账号已变化，请重新创建旅程')
    const state = newState(name)
    if (await db.journeys.where('scope').equals(a.scope).count() >= 20) throw new Error('最多保存20个旅程，请先导出并整理旧存档')
    const row: Journey = {id: uuid(), scope: a.scope, revision: 0, state, updatedAt: now(), dirty: true, operationId: uuid(), epoch: a.epoch}
    await db.journeys.add(row)
    if (valid(a)) { await reload(row.id); emit({status: '已保存到本机'}); scheduleSync() }
    return row
  })
}
async function selectJourney(id: string) { emit({checkpoints: []}); await reload(id) }
async function updateState(patch: Partial<JourneyState> | ((state: JourneyState) => Partial<JourneyState>)) {
  const a = actor(), current = snapshot.current
  if (!current) { fail(new Error('请先创建旅程')); return false }
  if (answerSubmissions.has(current.id)) { fail(new Error('旅程正在保存或恢复，请稍后再调整')); return false }
  let state: JourneyState
  try {
    state = journeyStateSchema.parse({...current.state, ...(typeof patch === 'function' ? patch(current.state) : patch), updatedAt: now()})
    const size = new TextEncoder().encode(JSON.stringify(state)).length
    if (size > STATE_MAX_BYTES && size >= new TextEncoder().encode(JSON.stringify(current.state)).length) throw new Error('旧存档超过同步容量，请先导出备份并逐步删除多余笔记；本机原记录仍保留')
  }
  catch (e) { fail(e); return false }
  const operationId = uuid()
  pending.set(current.id, {state, operationId, scope: a.scope})
  const optimistic = {...current, state, dirty: true, operationId}
  emit({current: optimistic, journeys: snapshot.journeys.map(r => r.id === current.id ? optimistic : r), status: '正在保存到本机'})
  return serialize(async () => {
    try {
      await db.transaction('rw', db.journeys, async () => {
        const row = await db.journeys.get(current.id)
        if (!valid(a) || !row || row.scope !== a.scope || row.deleted) throw new Error('账号已变化或旅程不存在')
        if (row.operationId !== current.operationId) throw new Error('另一个页面已更新这本旅程，已保留新记录，请检查后重试')
        await db.journeys.put({...row, state, updatedAt: now(), dirty: true, operationId})
      })
      if (pending.get(current.id)?.operationId === operationId) pending.delete(current.id)
      if (valid(a)) {
        if (!pending.has(current.id)) emit({status: snapshot.session.user ? '已保存本机 · 待同步' : '已保存到本机'})
        scheduleSync()
      }
      return true
    } catch (error) {
      if (pending.get(current.id)?.operationId === operationId) pending.delete(current.id)
      if (valid(a) && !pending.has(current.id)) {
        emit({current: snapshot.current?.id === current.id ? current : snapshot.current, journeys: snapshot.journeys.map(row => row.id === current.id ? current : row)})
        try { await reload() } catch { /* Preserve the last known state when storage cannot be read. */ }
      }
      throw error
    }
  })
}
export async function submitActionAnswer(actionId: string, text: string, mode: 'observed' | 'uncertain'): Promise<boolean> {
  const a = actor(), current = snapshot.current
  if (!current) { fail(new Error('请先创建旅程')); return false }
  const id = current.id
  if (answerSubmissions.has(id)) return false
  const stillCurrent = () => valid(a) && snapshot.current?.id === id
  try { submitAnswer(current.state, actionId, text, mode) }
  catch (error) { fail(error); return false }
  answerSubmissions.add(id)
  try {
    const saved = await serialize(async () => {
      if (!stillCurrent()) return false
      await db.transaction('rw', db.journeys, async () => {
        const row = await db.journeys.get(id)
        if (!stillCurrent() || !row || row.scope !== a.scope || row.deleted || pending.has(id)) throw new Error('账号或旅程已变化，请重新打开后提交')
        const state = submitAnswer(row.state, actionId, text, mode)
        await db.journeys.put({...row, state, updatedAt: state.updatedAt, dirty: true, operationId: uuid()})
        if (!stillCurrent()) throw new Error('账号或旅程已变化，回答未提交')
      })
      if (!stillCurrent()) return false
      await reload()
      if (!stillCurrent()) return false
      emit({status: a.userId ? '回答已保存本机 · 待同步' : '回答已保存到本机', error: ''})
      scheduleSync()
      return true
    })
    return saved === true && stillCurrent()
  } finally { answerSubmissions.delete(id) }
}
async function sync() {
  const a = actor()
  return serialize(async () => { if (valid(a)) await syncNow() })
}
async function syncNow() {
  if (syncing || !snapshot.session.user || !navigator.onLine) return
  syncing = true
  const a = actor()
  emit({status: '正在同步'})
  let syncingRow: Journey | null = null
  try {
    const remote = await api('/journeys')
    if (!valid(a)) return
    const list = z.array(remoteJourneySchema).max(100).parse(remote.journeys)
    const local = await db.journeys.where('scope').equals(a.scope).toArray()
    for (const row of local.filter(r => r.dirty)) {
      syncingRow = row
      if (!valid(a)) return
      if (row.epoch && row.epoch !== a.epoch) {
        emit({conflict: {local: row, remote: list.find(r => r.id === row.remoteId) || null, reason: '服务器已恢复存档，请另存本机副本后重新建立同步'}, status: '需要处理版本冲突'}); return
      }
      const server = list.find(r => r.id === row.remoteId)
      if (row.remoteId && !server && !row.deleted) {
        emit({conflict: {local: row, remote: null, reason: '服务器旅程已删除，本机内容可另存'}, status: '需要处理版本冲突'}); return
      }
      const meta = {...metadata(row), intendedUserId: a.userId, storageEpoch: a.epoch}
      if (row.deleted) {
        if (row.remoteId) await api(`/journeys/${row.remoteId}`, {method: 'DELETE', body: meta})
        if (valid(a)) await db.journeys.delete(row.id)
        continue
      }
      const result = row.remoteId ? await api(`/journeys/${row.remoteId}`, {method: 'PUT', body: {...meta, state: row.state}}) : await api('/journeys', {method: 'POST', body: {state: row.state, operationId: row.operationId, intendedUserId: a.userId, storageEpoch: a.epoch}})
      if (!valid(a)) return
      const saved = remoteJourneySchema.parse(result.journey)
      await db.transaction('rw', db.journeys, async () => {
        const latest = await db.journeys.get(row.id)
        if (!latest || latest.scope !== a.scope) return
        await db.journeys.put({...latest, remoteId: saved.id, revision: saved.revision, epoch: a.epoch, dirty: latest.operationId !== row.operationId, ...(latest.operationId === row.operationId ? {state: saved.state, updatedAt: saved.updatedAt} : {})})
      })
    }
    if (!valid(a)) return
    const refreshed = z.array(remoteJourneySchema).max(100).parse((await api('/journeys')).journeys)
    if (!valid(a)) return
    await db.transaction('rw', db.journeys, async () => {
      if (!valid(a)) return
      const localNow = await db.journeys.where('scope').equals(a.scope).toArray()
      for (const server of refreshed) {
        const existing = localNow.find(l => l.remoteId === server.id)
        if (existing?.dirty || existing?.deleted || (existing && pending.has(existing.id)) || (existing && existing.revision >= server.revision)) continue
        await db.journeys.put({id: existing?.id || server.id, scope: a.scope, remoteId: server.id, revision: server.revision, state: server.state, updatedAt: server.updatedAt, dirty: false, operationId: uuid(), epoch: a.epoch})
      }
      for (const row of localNow) {
        if (row.remoteId && !row.dirty && !pending.has(row.id) && !refreshed.some(r => r.id === row.remoteId)) await db.journeys.delete(row.id)
      }
      if (!valid(a)) throw new Error('账号已变化，本次同步未覆盖本机记录')
    })
    if (valid(a)) { await reload(); emit({status: [...pending.values()].some(p=>p.scope===a.scope) ? '正在保存到本机' : '已同步到服务器', conflict: null}) }
  } catch (error) {
    if (valid(a)) {
      if (error instanceof ApiError && error.status === 409 && syncingRow) {
        let remote = null
        try { if(syncingRow.remoteId) remote = (await api(`/journeys/${syncingRow.remoteId}`)).journey } catch { /* The local copy remains available. */ }
        if(valid(a)) emit({conflict: {local: syncingRow, remote, reason: '服务器版本已变化，请选择如何保留'}, status: '需要处理版本冲突'})
      } else emit({status: error instanceof ApiError && error.status === 401 ? '请重新登录 · 本机更改已保留' : '同步未完成 · 本机更改已保留', error: error instanceof Error ? error.message : '同步失败'})
    }
  } finally { syncing = false }
}
async function resolveConflict(choice: 'remote' | 'copy') {
  const conflict = snapshot.conflict, a = actor()
  if (!conflict) return
  await serialize(async () => {
    if (!valid(a) || conflict.local.scope !== a.scope) throw new Error('账号已变化，请重新核对冲突')
    await db.transaction('rw', db.journeys, async () => {
      const latest = await db.journeys.get(conflict.local.id)
      if (!valid(a) || !latest || latest.scope !== a.scope || pending.has(latest.id)) throw new Error('本机旅程已变化，请重新检查冲突')
      if (choice === 'copy') {
        if (await db.journeys.where('scope').equals(a.scope).count() >= 20) throw new Error('最多保存20个旅程，请先导出并整理')
        const state = journeyStateSchema.parse({...latest.state, name: `${latest.state.name.slice(0,48)} · 本机分支`, updatedAt: now()})
        await db.journeys.add({...latest, id: uuid(), remoteId: undefined, revision: 0, deleted: false, state, epoch: a.epoch, operationId: uuid(), dirty: true})
      } else if (latest.operationId !== conflict.local.operationId) {
        emit({conflict: {...conflict, local: latest}})
        throw new Error('冲突出现后又保存了新记录，请重新选择；建议保留本机分支')
      }
      if (conflict.remote) {
        const remote = remoteJourneySchema.parse(conflict.remote)
        await db.journeys.put({...latest, state: remote.state, revision: remote.revision, updatedAt: remote.updatedAt, dirty: false, deleted: false, epoch: a.epoch, operationId: uuid()})
      } else await db.journeys.delete(latest.id)
    })
    if (valid(a)) { emit({conflict: null}); await reload(); scheduleSync() }
  })
}
async function deleteJourney(id = snapshot.current?.id) {
  if (!id) return
  await serialize(async () => {
    const row = await db.journeys.get(id)
    if (!row || row.scope !== scope) throw new Error('无法删除其他账号旅程')
    if (row.remoteId) await db.journeys.put({ ...row, deleted: true, dirty: true, operationId: uuid() })
    else await db.transaction('rw', db.journeys, db.checkpoints, async () => { await db.journeys.delete(id); await db.checkpoints.where('journeyId').equals(id).delete() })
    await reload(); emit({checkpoints: [], status: '旅程已移除'}); scheduleSync()
  })
}
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type: 'application/json'}))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 3000)
}
function exportJourney() {
  if (!snapshot.current) return
  download({format: 'shanhe-journal', version: 1, exportedAt: now(), state: snapshot.current.state}, `shanhe-${new Date().toISOString().slice(0,10)}.json`)
}
async function importJourney(file: File) {
  const a = actor()
  try {
    if (file.size > 8_388_608 || !/^[^/\\\0]+\.json$/i.test(file.name) || file.name.includes('..')) throw new Error('请选择不超过8MB的JSON存档')
    const value = journalExportSchema.parse(JSON.parse(await file.text()))
    if (!window.confirm(`将「${value.state.name}」另存为新旅程，不覆盖现有内容。是否继续？`)) return
    await serialize(async () => {
      if (!valid(a)) throw new Error('账号已变化，请在当前账号重新导入')
      if (await db.journeys.where('scope').equals(a.scope).count() >= 20) throw new Error('最多保存20个旅程，请先整理旧存档')
      const row: Journey = {id: uuid(), revision: 0, scope: a.scope, state: value.state, updatedAt: now(), dirty: true, epoch: a.epoch, operationId: uuid()}
      await db.journeys.add(row); await reload(row.id); emit({status: '已导入为独立旅程'}); scheduleSync()
    })
  } catch (error) { fail(error instanceof z.ZodError ? new Error('存档格式或版本不支持，原有数据未改变') : error) }
}
async function loadCheckpoints() {
  const current = snapshot.current, a = actor()
  if (!current) { emit({checkpoints: []}); return }
  try {
    let rows: Checkpoint[] = await db.checkpoints.where('journeyId').equals(current.id).toArray()
    rows = rows.filter(row => row.scope === a.scope)
    if (current.remoteId && navigator.onLine && snapshot.session.user) {
      const response = await api(`/journeys/${current.remoteId}/versions`)
      const versions = z.array(z.object({id: z.string().uuid(), name: z.string().max(80), createdAt: z.string(), revision: z.number().int()})).max(100).parse(response.versions)
      rows = [...versions.map(v => ({...v, journeyId: current.id, scope: a.scope})), ...rows]
    }
    if (valid(a) && snapshot.current?.id === current.id) emit({checkpoints: rows.sort((x,y) => y.createdAt.localeCompare(x.createdAt))})
  } catch (error) { fail(error) }
}
async function createCheckpoint(name = '手动检查点') {
  const a = actor(), id = snapshot.current?.id
  return serialize(async () => {
    if (!valid(a) || !id) return false
    const current = await db.journeys.get(id)
    if (!current || current.scope !== a.scope || pending.has(id)) throw new Error('请等待本机保存完成后再建立检查点')
    if (await db.checkpoints.where('journeyId').equals(current.id).count() >= 50) throw new Error('本机检查点已达50个，请导出旅程后整理')
    await db.checkpoints.add({id: uuid(), journeyId: current.id, scope, name: name.slice(0,80), createdAt: now(), revision: current.revision, state: current.state})
    if (current.remoteId && !current.dirty && snapshot.session.user && navigator.onLine) {
      try { await api(`/journeys/${current.remoteId}/checkpoints`, {method: 'POST', body: {...metadata(current), operationId: uuid(), name: name.slice(0,80)}}) }
      catch { emit({error: '检查点已在本机保存，但服务器检查点暂未建立'}) }
    }
    if (valid(a)) { await loadCheckpoints(); emit({status: '检查点已保存'}) }
    return true
  })
}
async function restoreCheckpoint(id: string) {
  const current = snapshot.current, a = actor()
  if (!current) return
  if (answerSubmissions.has(current.id)) { fail(new Error('请等待保存完成再恢复检查点')); return }
  answerSubmissions.add(current.id)
  try {
    await serialize(async () => {
      const stillCurrent = () => valid(a) && snapshot.current?.id === current.id
      if (!stillCurrent()) throw new Error('账号或旅程已变化，请重新选择检查点')
      const local = await db.checkpoints.get(id)
      const before = await db.journeys.get(current.id)
      if (!stillCurrent() || !before || before.scope !== a.scope || before.deleted || pending.has(current.id)) throw new Error('本机状态已变化，请重新选择检查点')
      let state: JourneyState, remote: z.infer<typeof remoteJourneySchema> | null = null
      if (local && local.scope === a.scope && local.journeyId === current.id && local.state) {
        state = journeyStateSchema.parse(local.state)
      } else if (before.remoteId && a.userId && !local) {
        if (before.dirty) throw new Error('请先同步本机更改再恢复服务器版本')
        const result = await api(`/journeys/${before.remoteId}/restore`, {method: 'POST', body: {...metadata(before), operationId: uuid(), versionId: id}})
        remote = remoteJourneySchema.parse(result.journey)
        state = remote.state
      } else throw new Error('检查点不属于当前旅程')
      await db.transaction('rw', db.journeys, db.checkpoints, async () => {
        const latest = await db.journeys.get(current.id)
        if (!stillCurrent() || !latest || latest.scope !== a.scope || latest.deleted || latest.operationId !== before.operationId || pending.has(current.id)) throw new Error('恢复期间旅程有新记录，已保留本机内容，请重新同步并检查')
        if (await db.checkpoints.where('journeyId').equals(current.id).count() >= 50) throw new Error('本机检查点已满，未覆盖当前记录，请先导出整理')
        await db.checkpoints.add({id: uuid(), journeyId: latest.id, scope: a.scope, name: '恢复前自动备份', createdAt: now(), revision: latest.revision, state: journeyStateSchema.parse(latest.state)})
        await db.journeys.put({...latest, state, revision: remote?.revision ?? latest.revision, updatedAt: remote?.updatedAt ?? now(), dirty: !remote, operationId: uuid()})
        if (!stillCurrent()) throw new Error('账号或旅程已变化，未覆盖本机记录')
      })
      if (!stillCurrent()) return
      await reload(current.id); emit({status: '已恢复，恢复前版本已保留'}); await loadCheckpoints(); scheduleSync()
    })
  } finally { answerSubmissions.delete(current.id) }
}
channel?.addEventListener('message', () => { emit({current: null, journeys: [], checkpoints: []}); void refreshSession(false) })
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void refreshCapabilities(true); void refreshSession(false) })
  window.addEventListener('offline', () => emit({status: '离线模式 · 更改保存在本机', capabilityState: 'error'}))
  window.addEventListener('focus', () => { void refreshCapabilities() })
  window.addEventListener('pageshow', () => { void refreshCapabilities() })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void refreshCapabilities() })
}
const actions = {selectJourney, createJourney, updateState, submitActionAnswer, deleteJourney, exportJourney, importJourney, createCheckpoint, loadCheckpoints, restoreCheckpoint, sync, refreshSession, refreshCapabilities, resolveConflict, clearError: () => emit({error: ''})}
export function useJournal() {
  const state = useSyncExternalStore(fn => {listeners.add(fn); return () => listeners.delete(fn)}, () => snapshot)
  if (!started) { started = true; queueMicrotask(() => void init()) }
  return {...state, ...actions}
}

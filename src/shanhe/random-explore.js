import {z} from 'zod'
import {places, themes, regions, adventures} from '../../shared/content.js'
import {journeyStateSchema, journeyStateWriteSchema} from '../../shared/schema.js'

export const explorationFiltersSchema = z.object({
  theme: z.string().refine(value => themes.includes(value)),
  region: z.string().refine(value => value === '全部' || regions.includes(value)),
  query: z.string().trim().max(200),
}).strict()
const placeIdSchema = z.string().max(80).refine(id => places.some(place => place.id === id))
export const randomSelectionSchema = z.object({
  filters: explorationFiltersSchema,
  placeIds: z.array(placeIdSchema).min(1).max(places.length).refine(ids => new Set(ids).size === ids.length),
}).strict()
/** @typedef {import('zod').infer<typeof explorationFiltersSchema>} ExplorationFilters */
/** @typedef {import('zod').infer<typeof randomSelectionSchema>} RandomSelection */
/** @typedef {import('zod').infer<typeof journeyStateSchema>} JourneyState */

/** @param {ExplorationFilters} input */
export function filterExplorationPlaces(input) {
  const {theme, region, query} = explorationFiltersSchema.parse(input)
  return places.filter(place => (theme === '全部' || place.theme === theme)
    && (region === '全部' || place.region === region)
    && (!query || `${place.name} ${place.region} ${place.theme} ${place.summary} ${adventures[place.id].title} ${adventures[place.id].interests}`.includes(query)))
}

/** @param {JourneyState} state @param {ExplorationFilters} filters */
export function randomCandidates(state, filters) {
  const excluded = new Set([...state.selectedPlaceIds, ...state.skippedPlaceIds])
  return state.ended ? [] : filterExplorationPlaces(filters).filter(place => !excluded.has(place.id))
}

/** @param {number} upper */
function randomIndex(upper) {
  const limit = 0x100000000 - (0x100000000 % upper)
  const bytes = new Uint32Array(1)
  do { globalThis.crypto.getRandomValues(bytes) } while (bytes[0] >= limit)
  return bytes[0] % upper
}

/** @param {JourneyState} input @param {ExplorationFilters} filters @param {number} count */
export function drawRandomPlaces(input, filters, count) {
  const state = journeyStateSchema.parse(input)
  const pool = randomCandidates(state, filters)
  z.number().int().min(1).max(pool.length).parse(count)
  for (let index = 0; index < count; index++) {
    const other = index + randomIndex(pool.length - index)
    ;[pool[index], pool[other]] = [pool[other], pool[index]]
  }
  return randomSelectionSchema.parse({filters, placeIds: pool.slice(0, count).map(place => place.id)})
}

/** @param {JourneyState} input @param {RandomSelection} selection @param {string} updatedAt */
export function appendRandomPlaces(input, selection, updatedAt) {
  const current = journeyStateSchema.parse(input)
  const request = randomSelectionSchema.parse(selection)
  if (current.ended) throw new Error('旅程已收束，请先在手记中重新翻开路书')
  const allowed = new Set(filterExplorationPlaces(request.filters).map(place => place.id))
  if (request.placeIds.some(id => !allowed.has(id) || current.skippedPlaceIds.includes(id))) {
    throw new Error('候选范围或跳过记录已变化，请重新抽选')
  }
  const added = request.placeIds.filter(id => !current.selectedPlaceIds.includes(id))
  if (!added.length) return {state: current, addedCount: 0}
  const state = journeyStateWriteSchema.parse({...current, selectedPlaceIds: [...current.selectedPlaceIds, ...added], updatedAt})
  return {state, addedCount: added.length}
}

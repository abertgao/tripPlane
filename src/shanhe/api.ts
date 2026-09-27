let csrf = ''
export class ApiError extends Error {
  status: number
  data: any
  constructor(status: number, data: any) {
    super(data?.message || (status === 503 ? '服务暂不可用，请稍后再试' : '请求未完成，请重试'))
    this.status = status
    this.data = data
  }
}
export function setCsrf(value: string) { csrf = value || '' }
export async function api(path: string, options: {method?: string; body?: unknown} = {}) {
  if (!/^\/[a-z0-9/_-]*$/i.test(path) || path.includes('..')) throw new Error('无效接口地址')
  const method = options.method || 'GET'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), path.includes('/ai/') ? 65000 : 18000)
  try {
    const response = await fetch(`/api/v1${path}`, {
      method, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: {Accept: 'application/json', ...(options.body !== undefined ? {'Content-Type': 'application/json'} : {}), ...(method !== 'GET' && csrf ? {'X-CSRF-Token': csrf} : {})},
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    })
    if (!response.headers.get('content-type')?.includes('application/json')) throw new ApiError(response.status || 503, {message: '账号服务暂未连接，当前仍可使用本机旅程'})
    const result = await response.json()
    if (!response.ok) throw new ApiError(response.status, result)
    if (typeof result.csrfToken === 'string') setCsrf(result.csrfToken)
    return result
  } finally { clearTimeout(timer) }
}

// Stores the JWT returned by the backend and builds the Authorization header.
const TOKEN_KEY = 'nodus_token'

export const set_token = (token: string) => {
  try { sessionStorage.setItem(TOKEN_KEY, token) } catch {}
}

export const get_token = (): string | null => {
  try { return sessionStorage.getItem(TOKEN_KEY) } catch { return null }
}

export const auth_headers = (json = true): Record<string, string> => {
  const headers: Record<string, string> = {}
  if (json) headers['Content-Type'] = 'application/json'
  const token = get_token()
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

// Uploads a file to the backend, which stores it in the Silo bucket and returns its public URL.
export const upload_file = async (endpoint: string, file: File): Promise<any> => {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(endpoint, { method: 'POST', headers: auth_headers(false), body: form })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Upload failed')
  return data
}

export const clear_token = () => {
  try { sessionStorage.removeItem(TOKEN_KEY) } catch {}
}

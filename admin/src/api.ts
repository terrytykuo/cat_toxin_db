export async function adminFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, init)
}

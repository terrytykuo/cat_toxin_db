const secret = import.meta.env.VITE_ADMIN_SECRET as string | undefined

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { 'x-admin-secret': secret ?? '', ...extra }
}

export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      ...headers(init.headers as Record<string, string>),
    },
  })
}

export const adminFetch = apiFetch

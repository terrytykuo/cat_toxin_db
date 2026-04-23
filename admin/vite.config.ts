import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readAdminSecret(): string {
  const envPath = resolve(__dirname, '.env.local')
  if (!existsSync(envPath)) return ''
  const raw = readFileSync(envPath, 'utf8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const sep = trimmed.indexOf('=')
    if (sep === -1) continue
    if (trimmed.slice(0, sep).trim() === 'ADMIN_SECRET') {
      return trimmed.slice(sep + 1).trim()
    }
  }
  return ''
}

export default defineConfig(() => {
  const adminSecret = readAdminSecret()

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (adminSecret) proxyReq.setHeader('x-admin-secret', adminSecret)
            })
          },
        },
      },
    },
  }
})

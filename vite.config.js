import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

// Read the project .env directly: the football key is needed server-side for
// the proxy below, and loadEnv alone can miss it depending on Vite version.
function readEnvKey (root) {
  try {
    const txt = fs.readFileSync(path.join(root, '.env'), 'utf-8')
    const m = txt.match(/^VITE_FOOTBALL_DATA_KEY=(.*)$/m)
    return (m ? m[1] : '').trim()
  } catch { return '' }
}

export default defineConfig(({ mode }) => {
  const root = process.cwd()
  const env = loadEnv(mode, root, '')
  const fdKey = env.VITE_FOOTBALL_DATA_KEY || readEnvKey(root)

  return {
    plugins: [react()],
    server: {
      // football-data.org's CORS policy only ever echoes "http://localhost"
      // (no port), so the browser blocks every direct call from the app.
      // Proxy it: the app fetches /fdapi/... and the dev server forwards to
      // the real API server-side, where CORS does not apply. The key is
      // injected here so the browser never has to send it.
      proxy: fdKey ? {
        '/fdapi': {
          target: 'https://api.football-data.org',
          changeOrigin: true,
          rewrite: p => p.replace(/^\/fdapi/, ''),
          headers: { 'X-Auth-Token': fdKey }
        }
      } : undefined
    }
  }
})

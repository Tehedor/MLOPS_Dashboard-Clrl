import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '..')
const appConfig = parse(readFileSync(resolve(ROOT, 'config.yaml'), 'utf-8'))

export default defineConfig({
  plugins: [react(), yamlPlugin()],
  resolve: {
    alias: {
      '@appConfig':    resolve(ROOT, 'config.yaml'),
      '@paramsSchema': resolve(ROOT, appConfig.params_file),
      '@phasesRunner': resolve(ROOT, appConfig.phases_runner),

    },
  },
  server: {
    fs: { allow: ['..'] },
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': { target: 'ws://localhost:8000', ws: true },
    },
  },
})

function yamlPlugin() {
  return {
    name: 'vite-plugin-yaml',
    transform(src, id) {
      if (!id.endsWith('.yaml') && !id.endsWith('.yml')) return null
      return `export default ${JSON.stringify(parse(src))}`
    },
  }
}

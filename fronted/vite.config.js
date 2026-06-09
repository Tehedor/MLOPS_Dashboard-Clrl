import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '..')
const appConfig = parse(readFileSync(resolve(ROOT, 'config/config.yaml'), 'utf-8'))

// Resolve the traceability schema from the first pipeline-project defined in pipelines.yaml.
// Mirrors the path derivation logic in backend/app/core/config.py get_pipeline_project().
let paramsFile = appConfig.params_file
if (!paramsFile) {
  const pipelinesPath = resolve(ROOT, 'config/pipelines.yaml')
  if (existsSync(pipelinesPath)) {
    const pipelinesConfig = parse(readFileSync(pipelinesPath, 'utf-8'))
    const first = Object.values(pipelinesConfig?.pipelines ?? {})[0]
    if (first?.traceability_path) {
      paramsFile = first.traceability_path
    } else if (first?.external_base) {
      paramsFile = `${first.external_base}/repo_actions/scripts/traceability_schema.yaml`
    }
  }
}
paramsFile = paramsFile ?? 'external/repo_actions/scripts/traceability_schema.yaml'

export default defineConfig({
  plugins: [react(), yamlPlugin()],
  resolve: {
    alias: {
      '@appConfig':    resolve(ROOT, 'config/config.yaml'),
      '@pipelinesConfig': resolve(ROOT, 'config/pipelines.yaml'),
      '@paramsSchema': resolve(ROOT, paramsFile),
      '@phasesRunner': resolve(ROOT, appConfig.phases_runner),
    },
  },
  server: {
    fs: { allow: ['..'] },
    watch: {
      ignored: [
        '**/.git/**',
        '**/.venv/**',
        '**/node_modules/**',
        '**/external/**',
        '**/repos_backup/**',
        '**/executions/**',
        '**/.dvc/**',
      ],
    },
    proxy: {
      '/api': 'http://localhost:8000',
      '/executions': 'http://localhost:8000',
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

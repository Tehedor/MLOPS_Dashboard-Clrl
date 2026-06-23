// Supabase Edge Function — recibe webhooks de GitHub workflow_run
// y escribe el estado y los logs en las tablas de Supabase.
//
// Secrets requeridos (supabase secrets set ...):
//   GITHUB_TOKEN   — Personal Access Token con permisos repo/actions:read
//   WEBHOOK_SECRET — secreto configurado en el webhook de GitHub (opcional pero recomendado)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const GITHUB_TOKEN   = Deno.env.get('GITHUB_TOKEN') ?? ''
const REPOSITORY_TOKENS: Record<string, string> = {
  'teheorg/mlops4rtedge':    Deno.env.get('GITHUB_TOKEN_EDGE') ?? '',
  'teheorg/mlops4rtedgets':  Deno.env.get('GITHUB_TOKEN_EDGE_TS') ?? '',
  'teheorg/mlops4rtedgeuni': Deno.env.get('GITHUB_TOKEN_EDGE_UNI') ?? '',
}
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? ''

function githubToken(repoFullName: string): string {
  return REPOSITORY_TOKENS[repoFullName.toLowerCase()] || GITHUB_TOKEN
}

function githubHeaders(repoFullName: string): Record<string, string> {
  const token = githubToken(repoFullName)
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'mlops-dashboard',
  }
}

// Extrae el prefijo de fase (f01, f02, …) a partir del número de posición.
// Los consumers (backend/frontend) resuelven f0N → f0N_xxx desde sus YAMLs.
function fasePrefix(n: number): string | null {
  if (n < 1 || n > 99) return null
  return `f${String(n).padStart(2, '0')}`
}

// ── Verificación de firma HMAC ───────────────────────────────────────────────
async function verifySignature(body: string, sigHeader: string | null): Promise<boolean> {
  if (!WEBHOOK_SECRET || !sigHeader) return !WEBHOOK_SECRET
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  const expected = 'sha256=' + Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0')).join('')
  return sigHeader === expected
}

// ── GitHub API helpers ───────────────────────────────────────────────────────
async function fetchJobs(repoFullName: string, runId: number): Promise<any[]> {
  const res = await fetch(
    `https://api.github.com/repos/${repoFullName}/actions/runs/${runId}/jobs`,
    { headers: githubHeaders(repoFullName) }
  )
  if (!res.ok) return []
  const data = await res.json()
  return data.jobs ?? []
}

async function fetchJobLogs(repoFullName: string, jobId: number): Promise<string> {
  const res = await fetch(
    `https://api.github.com/repos/${repoFullName}/actions/jobs/${jobId}/logs`,
    { headers: githubHeaders(repoFullName), redirect: 'follow' }
  )
  if (!res.ok) return ''
  return (await res.text()).slice(0, 150_000)
}

// ── Inferencia de fase desde los jobs ───────────────────────────────────────
// El trigger workflow tiene jobs "trigger-fase1..8"; solo uno no está "skipped".
// Devuelve el prefijo f0N; el backend resuelve el nombre completo desde sus YAMLs.
function inferFaseFromJobs(jobs: any[]): string | null {
  for (const job of jobs) {
    const baseName = job.name.split(' /')[0].trim()
    const m = baseName.match(/^trigger-fase(\d+)$/)
    if (m && job.conclusion !== 'skipped' &&
        (job.status === 'in_progress' || job.status === 'completed')) {
      return fasePrefix(parseInt(m[1], 10))
    }
  }
  return null
}

// Fallback para runs de workflows reusables: "Reusable: Fase 5 (Modeling)" → "f05".
function inferFaseFromWorkflowName(name: string): string | null {
  const m = name.match(/Fase\s+(\d+)/i)
  if (!m) return null
  return fasePrefix(parseInt(m[1], 10))
}

// ── Extracción de variant del log de validar-payload ───────────────────────
// El step escribe "[OK] Payload válido → variant_id=v1_0001"
function extractVariantFromLog(content: string): string | null {
  const match = content.match(/\[OK\].*?variant_id=(v\d_\d{4})/i)
  return match?.[1] ?? null
}

// ── Handler principal ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const rawBody = await req.text()
    const sigHeader = req.headers.get('x-hub-signature-256')

    let signatureOk: boolean
    try {
      signatureOk = await verifySignature(rawBody, sigHeader)
    } catch (sigErr) {
      console.error('signature verification threw:', sigErr)
      return new Response(JSON.stringify({ error: 'signature_error', detail: String(sigErr) }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      })
    }
    if (!signatureOk) {
      return new Response('Invalid signature', { status: 401 })
    }

    let payload: any
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return new Response('Invalid JSON', { status: 400 })
    }

    const action = payload.action as string
    const run    = payload.workflow_run

    if (!run) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const now           = new Date().toISOString()
    const repoFullName  = run.repository?.full_name ?? run.head_repository?.full_name ?? ''
    const updatedAt     = run.updated_at ?? now

    const baseRow = {
      run_id:        run.id,
      repo:          repoFullName,
      branch:        run.head_branch,
      workflow_name: run.name,
      created_at:    run.created_at,
    }

    // ── Completed: upsert completo con fase, variant y conclusion ─────────────
    if (action === 'completed') {
      let fase: string | null = null
      let variant: string | null = null
      let jobs: any[] = []

      if (githubToken(repoFullName)) {
        try {
          jobs = await fetchJobs(repoFullName, run.id)
          fase = inferFaseFromJobs(jobs) ?? inferFaseFromWorkflowName(run.name ?? '')

          const validarJob = jobs.find((j: any) => j.name === 'validar-payload')
          if (validarJob) {
            const logContent = await fetchJobLogs(repoFullName, validarJob.id)
            variant = extractVariantFromLog(logContent)
          }
        } catch (e) {
          console.error('jobs/logs fetch error:', e)
        }
      }

      const { error: runErr } = await supabase.from('workflow_runs').upsert({
        ...baseRow,
        status:     run.conclusion ?? 'failure',
        conclusion: run.conclusion,
        updated_at: updatedAt,
        ...(fase    ? { fase }    : {}),
        ...(variant ? { variant } : {}),
      }, { onConflict: 'run_id' })

      if (runErr) {
        console.error('upsert run error:', runErr)
        return new Response(JSON.stringify({ error: runErr.message }), { status: 500 })
      }

      // Almacenar logs de todos los jobs
      if (githubToken(repoFullName) && jobs.length) {
        try {
          const logRows = (await Promise.all(
            jobs.map(async (job: any) => {
              const content = await fetchJobLogs(repoFullName, job.id)
              if (!content) return null
              return {
                run_id:    run.id,
                step_name: job.name,
                content,
                ts:        job.completed_at ?? now,
              }
            })
          )).filter(Boolean)

          if (logRows.length) {
            const { error: logErr } = await supabase.from('workflow_logs').insert(logRows)
            if (logErr) console.error('insert logs error:', logErr)
          }
        } catch (e) {
          console.error('fetch logs error:', e)
        }
      }

    // ── In-progress / queued: nunca sobreescribir conclusion ya resuelta ──────
    } else {
      const status = action === 'in_progress' ? 'in_progress' : 'queued'

      let fase: string | null = null
      let variant: string | null = null
      if (action === 'in_progress') {
        fase = inferFaseFromWorkflowName(run.name ?? '')
        if (githubToken(repoFullName)) {
          try {
            const jobs = await fetchJobs(repoFullName, run.id)
            if (!fase) fase = inferFaseFromJobs(jobs)
            // validar-payload ya ha terminado en el 2º evento in_progress
            const validarJob = jobs.find((j: any) => j.name === 'validar-payload' && j.status === 'completed')
            if (validarJob) {
              const logContent = await fetchJobLogs(repoFullName, validarJob.id)
              variant = extractVariantFromLog(logContent)
            }
          } catch {}
        }
      }

      // INSERT si el run no existe aún
      const { error: insertErr } = await supabase.from('workflow_runs').insert({
        ...baseRow,
        status,
        updated_at: updatedAt,
        ...(fase    ? { fase }    : {}),
        ...(variant ? { variant } : {}),
      })

      if (insertErr) {
        // Ya existe — actualizar status solo si el run no ha terminado
        // (evita sobreescribir un completed con un in_progress tardío)
        const patch: any = { status, updated_at: updatedAt }
        if (fase)    patch.fase    = fase
        if (variant) patch.variant = variant
        const { error: updateErr } = await supabase.from('workflow_runs')
          .update(patch)
          .eq('run_id', run.id)
          .is('conclusion', null)  // Solo si aún no tiene conclusión
        if (updateErr) console.error('update in_progress error:', updateErr)
      }
    }

    return new Response(JSON.stringify({ ok: true, action, run_id: run.id }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('unhandled error:', err)
    return new Response(JSON.stringify({ error: 'unhandled', detail: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
})

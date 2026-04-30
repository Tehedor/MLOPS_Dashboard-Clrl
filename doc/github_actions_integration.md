# Integración GitHub Actions → Dashboard (vía Webhook)

No es necesario modificar ningún workflow `.yml`.
GitHub envía eventos a la Edge Function de Supabase, que escribe en la
base de datos. Todos los clientes self-hosted reciben los cambios vía
Supabase Realtime WebSocket.

```
GitHub webhook (workflow_run event)
  ↓
Supabase Edge Function  ← URL pública gratuita
  ├─ upsert workflow_runs  (estado en tiempo real)
  └─ si completed → fetch GitHub API logs → inserta workflow_logs
  ↓
Supabase Realtime WebSocket → todas las instancias del dashboard
```

**Limitación de logs:** el texto de logs llega al *completarse* el run,
no durante la ejecución. El estado (queued → in_progress → success/failure)
sí es en tiempo real.

---

## 1. Desplegar la Edge Function

### Instalar Supabase CLI

```bash
npm install -g supabase
# o con brew: brew install supabase/tap/supabase
```

### Vincular el proyecto

```bash
cd app_ctrl
supabase login
supabase link --project-ref <project-ref>
# El project-ref está en: Project settings → General → Reference ID
```

### Desplegar la función

```bash
supabase functions deploy github-webhook
```

La URL pública resultante será:
```
https://<project-ref>.supabase.co/functions/v1/github-webhook
```

---

## 2. Configurar los secrets de la Edge Function

```bash
# Token de GitHub con permisos: repo (o actions:read en repos públicos)
supabase secrets set GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# Secreto para validar la firma del webhook (elige cualquier string aleatorio)
supabase secrets set WEBHOOK_SECRET=mi_secreto_aleatorio_seguro
```

O desde el dashboard: Supabase → Edge Functions → github-webhook → Secrets.

---

## 3. Configurar el Webhook en GitHub

En el repositorio `MLOps_actions_v2`:
**Settings → Webhooks → Add webhook**

| Campo | Valor |
|-------|-------|
| Payload URL | `https://<project-ref>.supabase.co/functions/v1/github-webhook` |
| Content type | `application/json` |
| Secret | el mismo string que pusiste en `WEBHOOK_SECRET` |
| Events | selecciona **"Let me select individual events"** → marca **Workflow runs** |

Guarda. GitHub enviará un ping de prueba; si la función responde 200 estará configurado.

---

## 4. Verificar que funciona

1. Lanza cualquier workflow en el repositorio desde GitHub Actions.
2. Abre la vista **GH Actions** del dashboard.
3. Deberías ver el run aparecer con estado `in_progress` en segundos.
4. Al terminar, el estado cambiará a `success` o `failure` y los logs aparecerán.

Si no aparece nada:
- Comprueba los logs de la Edge Function: Supabase → Edge Functions → github-webhook → Logs
- Comprueba los "Recent Deliveries" del webhook en GitHub (Settings → Webhooks → tu webhook → Recent Deliveries)

---

## 5. `fase` y `variant` (opcional)

El webhook no lleva estos campos en el payload por defecto.
Opciones para rellenarlos:

**A) Por nombre de workflow:** edita la Edge Function para inferirlos del campo `run.name`.
Por ejemplo: si el workflow se llama `"train-baseline"` → `fase="train"`, `variant="baseline"`.

**B) Por workflow_dispatch inputs:** si tus workflows usan `workflow_dispatch`,
añade `inputs.fase` e `inputs.variant` y la Edge Function puede leerlos de
`payload.workflow_run.inputs`.

Sin configurar, los campos quedan `null` y la vista los muestra sin etiqueta de fase.

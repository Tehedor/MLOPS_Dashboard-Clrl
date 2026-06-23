#!/usr/bin/env bash
# Despliega la Edge Function github-webhook en Supabase.
# Se salta si ya está desplegada (centinela .supabase/.deployed).
# Requisito previo manual (solo una vez): supabase login
#
# Variables leídas de backend/.env:
#   SUPABASE_URL      — URL base del proyecto (https://<ref>.supabase.co)
#   GITHUB_TOKEN      — PAT con permisos repo o actions:read
#   WEBHOOK_SECRET    — String secreto para validar la firma del webhook

set -euo pipefail

SENTINEL=".supabase/.deployed"
ENV_FILE="backend/.env"
FUNCTION="github-webhook"

# Leer variables del .env con grep (robusto ante caracteres especiales en otros valores)
_env() {
  local key="$1"
  if [[ -f "$ENV_FILE" ]]; then
    local val
    val=$(grep -m1 "^${key}=" "$ENV_FILE" | cut -d= -f2-)
    # quitar comillas simples o dobles envolventes
    val="${val#\"}" ; val="${val%\"}"
    val="${val#\'}" ; val="${val%\'}"
    printf '%s' "$val"
  fi
}

SUPABASE_URL="${SUPABASE_URL:-$(_env SUPABASE_URL)}"
GITHUB_TOKEN="${GITHUB_TOKEN:-$(_env GITHUB_TOKEN)}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-$(_env WEBHOOK_SECRET)}"
SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:-$(_env SERVICE_ROLE_KEY)}"

# ── Ya desplegado ─────────────────────────────────────────────────────────────
if [[ -f "$SENTINEL" ]]; then
  echo "[supabase] Edge Function ya desplegada ($(cat "$SENTINEL"))"
  echo "[supabase] Borra $SENTINEL para forzar un redeploy."
  exit 0
fi

# ── CLI instalado? (auto-descarga el binario si no está) ─────────────────────
if ! command -v supabase &>/dev/null; then
  echo "[supabase] CLI no encontrado — descargando binario desde GitHub releases..."
  _install_dir="${HOME}/.local/bin"
  mkdir -p "$_install_dir"
  _latest=$(curl -fsSL "https://api.github.com/repos/supabase/cli/releases/latest" \
    | python -c "import json,sys; print(json.load(sys.stdin)['tag_name'])")
  if [[ -z "$_latest" ]]; then
    echo "[supabase] ⚠ No se pudo obtener la versión del CLI (sin conexión?). Omitiendo deploy."
    exit 0
  fi
  _url="https://github.com/supabase/cli/releases/download/${_latest}/supabase_linux_amd64.tar.gz"
  echo "[supabase] Descargando ${_latest}..."
  if curl -fsSL "$_url" | tar xz -C "$_install_dir" supabase 2>/dev/null; then
    export PATH="$_install_dir:$PATH"
    echo "[supabase] CLI instalado en $_install_dir/supabase"
  else
    echo "[supabase] ⚠ Descarga fallida. Omitiendo deploy."
    exit 0
  fi
fi

# ── Variables mínimas ─────────────────────────────────────────────────────────
if [[ -z "$SUPABASE_URL" ]]; then
  echo ""
  echo "[supabase] ⚠ SUPABASE_URL no está en $ENV_FILE — omitiendo deploy."
  echo "   Añade SUPABASE_URL=https://<ref>.supabase.co y vuelve a intentarlo."
  echo ""
  exit 0
fi

# Extraer project-ref de la URL (https://xxxxxx.supabase.co → xxxxxx)
PROJECT_REF=$(echo "$SUPABASE_URL" | sed 's|https://||; s|\.supabase\.co.*||')

# ── Autenticación ─────────────────────────────────────────────────────────────
# Soporta dos modos:
#   - SUPABASE_ACCESS_TOKEN en .env  → sin login interactivo (apto para Docker/CI)
#   - supabase login previo          → modo interactivo (metal)
SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-$(_env SUPABASE_ACCESS_TOKEN)}"

if [[ -n "$SUPABASE_ACCESS_TOKEN" ]]; then
  export SUPABASE_ACCESS_TOKEN
else
  if ! supabase projects list &>/dev/null 2>&1; then
    echo ""
    echo "[supabase] ⚠ No autenticado. Opciones:"
    echo "   Metal:  supabase login  (una vez)"
    echo "   Docker: añade SUPABASE_ACCESS_TOKEN=<token> a backend/.env"
    echo "           (genera el token en: https://supabase.com/dashboard/account/tokens)"
    echo ""
    exit 0
  fi
fi

# ── Deploy ────────────────────────────────────────────────────────────────────
echo "[supabase] Vinculando proyecto $PROJECT_REF..."
supabase link --project-ref "$PROJECT_REF"

echo "[supabase] Desplegando función $FUNCTION..."
supabase functions deploy "$FUNCTION" --no-verify-jwt

# ── Secrets ───────────────────────────────────────────────────────────────────
if [[ -n "$GITHUB_TOKEN" ]]; then
  supabase secrets set GITHUB_TOKEN="$GITHUB_TOKEN"
  echo "[supabase] Secret GITHUB_TOKEN configurado."
else
  echo "[supabase] ⚠ GITHUB_TOKEN no definido — la función no descargará logs de GitHub."
fi

if [[ -n "$WEBHOOK_SECRET" ]]; then
  supabase secrets set WEBHOOK_SECRET="$WEBHOOK_SECRET"
  echo "[supabase] Secret WEBHOOK_SECRET configurado."
else
  echo "[supabase] ⚠ WEBHOOK_SECRET no definido — la función aceptará webhooks sin validar firma."
fi

if [[ -n "$SERVICE_ROLE_KEY" ]]; then
  supabase secrets set SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
  echo "[supabase] Secret SERVICE_ROLE_KEY configurado."
else
  echo "[supabase] ⚠ SERVICE_ROLE_KEY no definido — la función no podrá escribir en la base de datos."
fi

# Generar PHASES_LIST desde config/fases_execution_runners.yaml (vía config.yaml)
_PHASES_RUNNER_FILE=$(python3 -c "
import yaml, sys
try:
    d = yaml.safe_load(open('config.yaml'))
    print(d.get('phases_runner', 'config/fases_execution_runners.yaml'))
except Exception as e:
    print('config/fases_execution_runners.yaml', file=sys.stderr)
    print('config/fases_execution_runners.yaml')
" 2>/dev/null)
if [[ -f "$_PHASES_RUNNER_FILE" ]]; then
  _PHASES_LIST=$(python3 -c "
import yaml, sys
d = yaml.safe_load(open('$_PHASES_RUNNER_FILE'))
print(','.join(f['fase'] for f in d.get('fases', [])))
" 2>/dev/null || echo "")
  if [[ -n "$_PHASES_LIST" ]]; then
    supabase secrets set PHASES_LIST="$_PHASES_LIST"
    echo "[supabase] Secret PHASES_LIST configurado: $_PHASES_LIST"
  fi
fi

# ── Centinela ─────────────────────────────────────────────────────────────────
mkdir -p .supabase
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$SENTINEL"

REPO_URL="https://github.com/Tehedor/MLOps_actions_v2"

echo ""
echo "[supabase] ✓ Edge Function desplegada."
echo "   URL webhook: https://${PROJECT_REF}.supabase.co/functions/v1/$FUNCTION"
echo ""
echo "   Último paso — configura el webhook en GitHub:"
echo "   ${REPO_URL}/settings/hooks"
echo "   → Payload URL: https://${PROJECT_REF}.supabase.co/functions/v1/$FUNCTION"
echo "   → Content type: application/json"
echo "   → Events: Workflow runs"
echo ""

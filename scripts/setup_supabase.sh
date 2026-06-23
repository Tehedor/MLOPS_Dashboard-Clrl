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
FUNCTION="github-webhook"
PIPELINES_FILE="config/pipelines.yaml"

# Leer variables del .env (intenta raíz primero, luego backend/.env)
_env() {
  local key="$1"
  local val=""

  # Buscar en .env de raíz primero
  if [[ -f ".env" ]]; then
    val=$(grep -m1 "^${key}=" ".env" | cut -d= -f2-)
  fi

  # Si no encontró, buscar en backend/.env
  if [[ -z "$val" ]] && [[ -f "backend/.env" ]]; then
    val=$(grep -m1 "^${key}=" "backend/.env" | cut -d= -f2-)
  fi

  # quitar comillas simples o dobles envolventes
  val="${val#\"}" ; val="${val%\"}"
  val="${val#\'}" ; val="${val%\'}"
  printf '%s' "$val"
}

SUPABASE_URL="${SUPABASE_URL:-$(_env SUPABASE_URL)}"
GITHUB_TOKEN="${GITHUB_TOKEN:-$(_env GITHUB_TOKEN)}"
GITHUB_TOKEN_EDGE="${GITHUB_TOKEN_EDGE:-$(_env GITHUB_TOKEN_EDGE)}"
GITHUB_TOKEN_EDGE_TS="${GITHUB_TOKEN_EDGE_TS:-$(_env GITHUB_TOKEN_EDGE_TS)}"
GITHUB_TOKEN_EDGE_UNI="${GITHUB_TOKEN_EDGE_UNI:-$(_env GITHUB_TOKEN_EDGE_UNI)}"
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

for token_name in GITHUB_TOKEN_EDGE GITHUB_TOKEN_EDGE_TS GITHUB_TOKEN_EDGE_UNI; do
  token_value="${!token_name:-}"
  if [[ -n "$token_value" ]]; then
    supabase secrets set "${token_name}=${token_value}"
    echo "[supabase] Secret ${token_name} configurado."
  fi
done

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

# Obtener los repositorios activos desde la misma configuración que usa el backend.
# Varias pipelines pueden compartir repositorio; cada URL de webhook se muestra una sola vez.
mapfile -t GITHUB_REPOSITORIES < <(
  python3 - "$PIPELINES_FILE" <<'PY' 2>/dev/null || true
import sys

import yaml

with open(sys.argv[1], encoding="utf-8") as config_file:
    config = yaml.safe_load(config_file) or {}

repositories = {
    pipeline.get("repo", "").strip()
    for pipeline in config.get("pipelines", {}).values()
    if isinstance(pipeline, dict) and pipeline.get("repo", "").strip()
}

for repository in sorted(repositories, key=str.casefold):
    print(repository)
PY
)

echo ""
echo "[supabase] ✓ Edge Function desplegada."
echo "   URL webhook: https://${PROJECT_REF}.supabase.co/functions/v1/$FUNCTION"
echo ""
echo "   Último paso — configura el webhook en cada repositorio de GitHub:"
if (( ${#GITHUB_REPOSITORIES[@]} > 0 )); then
  for repository in "${GITHUB_REPOSITORIES[@]}"; do
    echo "   https://github.com/${repository}/settings/hooks"
  done
else
  echo "   ⚠ No se encontraron repositorios en $PIPELINES_FILE."
fi
echo "   → Payload URL: https://${PROJECT_REF}.supabase.co/functions/v1/$FUNCTION"
echo "   → Content type: application/json"
echo "   → Events: Workflow runs"
echo ""

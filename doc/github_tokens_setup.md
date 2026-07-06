# Configuración de Tokens de GitHub

Guía completa sobre generación, permisos y configuración de tokens de GitHub para el dashboard MLOps.

---

## Resumen rápido

| Variable | Propósito | Tipo | Permisos | Obligatorio | Nota |
|----------|-----------|------|----------|-------------|------|
| **`GITHUB_TOKEN`** | Token **fallback de emergencia** — se usa si un pipeline no tiene token específico | Classic o Fine-grained | `repo` | ✅ Sí | Red de contención |
| **`GITHUB_TOKEN_EDGE`** | Token **específico** para pipeline `mlops4rtedge` | Repo (específico) | `repo` | ✅ Recomendado | Usar siempre |
| **`GITHUB_TOKEN_EDGE_TS`** | Token **específico** para pipeline `mlops4rtedgeTSI` | Repo (específico) | `repo` | ✅ Recomendado | Usar siempre |
| **`GITHUB_TOKEN_EDGE_UNI`** | Token **específico** para pipeline `mlops4rtedgeUniI` | Repo (específico) | `repo` | ✅ Recomendado | Usar siempre |

**⚠️ Importante:** `GITHUB_TOKEN` es un fallback de emergencia. Todos tus 3 pipelines **deberían tener tokens específicos** configurados. `GITHUB_TOKEN` solo actúa como red de contención si algo falla.

---

## ¿Para qué sirven los tokens?

### `GITHUB_TOKEN` (token fallback de emergencia)

**No es un token principal — es una red de contención.** Se usa automáticamente cuando:

1. **Un pipeline no tiene token específico configurado** — si no existe `GITHUB_TOKEN_EDGE` en `.env`, usa `GITHUB_TOKEN`
2. **Alguna función interna se llama sin pasar token explícitamente** — como medida de seguridad para evitar fallos silenciosos
3. **Nuevo pipeline sin configurar** — permite empezar rápidamente sin esperar a crear token específico

⚠️ **Recomendación:** Todos tus pipelines (`mlops4rtedge`, `mlops4rtedgeTS`, `mlops4rtedgeUni`) **deben tener su propio token** configurado. `GITHUB_TOKEN` es solo para emergencias.

### `GITHUB_TOKEN_EDGE`, `GITHUB_TOKEN_EDGE_TS`, `GITHUB_TOKEN_EDGE_UNI`

Tokens **específicos por pipeline**. Útiles cuando:

- Cada pipeline está en un **repo diferente** → necesita su propio token para autenticar
- Tienes **permisos limitados** en algunos repos → usa un token más restrictivo por pipeline
- Quieres **auditar accesos por repo** → cada repo tiene su propio registro de quién lo usa

**Sin estos tokens específicos, todos los pipelines usan `GITHUB_TOKEN`.**

Configuración en `config/pipelines.yaml`:
```yaml
pipelines:
  mlops4rtedge:
    repo: "TeheORG/mlops4rtedge"
    github_token_env: "GITHUB_TOKEN_EDGE"  # ← busca esta variable de entorno
  mlops4rtedgeTSI:
    repo: "TeheORG/mlops4rtedgeTS"
    github_token_env: "GITHUB_TOKEN_EDGE_TS"
```

---

## Cómo generar tokens de GitHub

### Opción A: Token Classic (recomendado para simplicidad)

**Pasos:**

1. Ve a https://github.com/settings/tokens
2. Haz clic en **"Generate new token"** → **"Generate new token (classic)"**
3. Dale un nombre descriptivo, ej: `MLOps Dashboard - EDGE`
4. Selecciona **vencimiento** (recomendado: 30, 60 ó 90 días)
5. Marca el scope **`repo`** (acceso completo a repos privados y públicos)
6. Haz clic en **"Generate token"**
7. **Cópialo inmediatamente** — no podrás verlo de nuevo

**Permisos desglosados (lo que otorga `repo`):**
```
✅ repo:status          — acceso a commit status
✅ repo_deployment      — acceso a deployment status
✅ public_repo          — acceso a repos públicos
✅ repo:invite          — invitaciones a repos
✅ security_events      — eventos de seguridad
```

**Ventajas:**
- Simple de crear y entender
- Un único scope `repo` otorga todo lo necesario
- Compatible con GitHub CLI (`gh auth login`) y git

**Desventajas:**
- Token monolítico — tiene acceso a TODO si se expone
- No puedes limitar a permisos específicos

---

### Opción B: Token Fine-grained (recomendado para seguridad)

**Pasos:**

1. Ve a https://github.com/settings/tokens?type=beta
2. Haz clic en **"Generate new token"** → **"Generate new fine-grained personal access token"**
3. Dale un nombre descriptivo, ej: `MLOps Dashboard - EDGE (Fine-grained)`
4. En **Resource owner**, selecciona tu organización o usuario personal
5. En **Repository access**, elige:
   - **"Only select repositories"** → selecciona el repo que necesita (ej: `mlops4rtedge`)
   - O **"All repositories"** si quieres acceso a todos
6. En **Permissions**, abre **"Repository permissions"** y busca **"Contents"**:
   - Cambiar a **"Access: Read and write"**
   - (El sistema automáticamente pone "Metadata" en Read — es normal)
7. Haz clic en **"Generate token"**
8. **Cópialo inmediatamente**

**Permisos recomendados (Fine-grained):**
```
Repository permissions:
  Contents          → Read and write  (clonado, push, pull)
  Metadata          → Read-only       (automático, solo lectura)
```

**Ventajas:**
- Granular — acceso limitado a solo lo necesario
- Asignable a repos específicos
- Mejor para seguridad (least privilege)

**Desventajas:**
- Más verboso de configurar
- Algunos servicios antiguos no los soportan

---

## Configuración en `.env`

### Paso 1: Crear el archivo `.env`

```bash
cp .env.example .env
```

### Paso 2: Rellenar los tokens

```bash
# ⚠️ Token fallback de emergencia (solo se usa si falta token específico)
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# ✅ Tokens específicos por pipeline (RECOMENDADO — configura estos)
GITHUB_TOKEN_EDGE=ghp_yyyyyyyyyyyyyyyyyyy         # mlops4rtedge
GITHUB_TOKEN_EDGE_TS=ghp_zzzzzzzzzzzzzzzzzz      # mlops4rtedgeTSI
GITHUB_TOKEN_EDGE_UNI=ghp_wwwwwwwwwwwwwwwwww     # mlops4rtedgeUniI

# Otros tokens necesarios
DAGSHUB_USER=tu_usuario
DAGSHUB_TOKEN=tu_token_dagshub
```

> **Regla de oro:** Siempre configura `GITHUB_TOKEN_EDGE`, `GITHUB_TOKEN_EDGE_TS` y `GITHUB_TOKEN_EDGE_UNI`. El `GITHUB_TOKEN` es solo un fallback si algo falla.

### Paso 3: Verificar que funciona

```bash
# Backend carga las variables automáticamente
make dev

# Ver si el backend conecta a GitHub API
curl http://localhost:8000/docs  # Swagger UI
```

---

## Checklist por tipo de token

### ✅ Token Classic (`ghp_...`)

- [ ] Creado en https://github.com/settings/tokens
- [ ] Scope: `repo` marcado
- [ ] Vencimiento configurado (recomendado: 30-90 días)
- [ ] Copiado correctamente a `.env`
- [ ] Testeado: `curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user`

### ✅ Token Fine-grained (`github_pat_...`)

- [ ] Creado en https://github.com/settings/tokens?type=beta
- [ ] Repository access: repositorio(s) específico(s) seleccionado(s)
- [ ] Contents: Read and write
- [ ] Metadata: Read (automático)
- [ ] Copiado correctamente a `.env`
- [ ] Testeado: `curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/repos/TeheORG/mlops4rtedge`

---

## Permisos detallados por caso de uso

### Dispatch (lanzar workflows desde dashboard)

Necesita permisos de **escritura en Actions y contenido**:

**Classic:**
- Scope `repo` (acceso completo)

**Fine-grained (recomendado):**
- Repository: `Contents: Read and write` (para escribir dispatch)
- Repository: `Actions: Read and write` (para crear runs)
- Repository: `Metadata: Read-only` (automático, requerido)

### Polling (monitorizar ejecuciones — **CRÍTICO para gh_run_id**)

⚠️ **Este es el permiso que faltaba.** Sin él, el backend no puede buscar los workflow runs.

Necesita permisos de **lectura en Actions**:

**Classic:**
- Scope `repo` (acceso completo)

**Fine-grained (RECOMENDADO para seguridad):**
- Repository: `Actions: Read-only` ← **CRÍTICO: necesario para `_find_run_after()`**
- Repository: `Contents: Read` (para verificar rama)
- Repository: `Metadata: Read-only` (automático, requerido)

> **Si falta `Actions: Read-only`, el backend no puede encontrar los workflow runs y `gh_run_id` quedará vacío.**

### Clonado de repos privados

Necesita permisos de **lectura de contenido**:

**Classic:**
- Scope `repo`

**Fine-grained:**
- Repository: `Contents: Read`

### Tabla resumen de permisos por feature

| Feature | Classic | Fine-grained |
|---------|---------|------|
| **Dispatch** (mandar ejecución) | `repo` | `Contents: R+W`, `Actions: R+W`, `Metadata: R` |
| **Polling** (buscar runs) | `repo` | `Actions: R`, `Contents: R`, `Metadata: R` |
| **Clone repos** | `repo` | `Contents: R` |
| **Combinado (recomendado)** | `repo` | `Actions: R+W`, `Contents: R+W`, `Metadata: R` |

---

## Errores comunes

### ❌ "Bad credentials" — token incorrecto o expirado

```
error: invalid_request
message: "Bad credentials"
```

**Solución:**
1. Verifica que copiaste el token completo
2. Comprueba que no tenga espacios o caracteres adicionales
3. Regenera el token si expiró (Settings → Tokens → Regenerate)

### ❌ "API rate limit exceeded"

```
message: "API rate limit exceeded for user."
```

**Significa:** El token se usa frecuentemente y alcanzó el límite de GitHub (60 req/hora para Classic, 15.000/hora para Fine-grained).

**Solución:**
- Aumentar intervalos de polling en `.env` (más adelante)
- Usar Supabase webhooks (notificaciones push, no polling)

### ❌ "Insufficient permissions" — token sin permisos suficientes

```
message: "Resource not accessible by integration"
```

**Solución:**
1. Verifica que el scope incluye `repo`
2. Si usas Fine-grained, comprueba que el repo está en "Repository access"
3. Regenera el token y reinicia el backend

---

## Rotación de tokens (cambiar sin downtime)

1. Genera un token nuevo en GitHub
2. Actualiza `.env` con el token nuevo
3. Backend recarga automáticamente (reinicia si es necesario)
4. Borra el token viejo en Settings → Tokens

**Recomendación:** Rotar tokens cada 30-60 días.

---

## Auditoría y seguridad

### ¿Quién puede ver mis tokens?

- **Nadie** — GitHub no los muestra una vez generados
- Solo tú al momento de crear
- Los devs que accedan a tu `.env` (¡no versionar en git!)

### ¿Qué pasa si se expone un token?

1. Ve a https://github.com/settings/tokens
2. Haz clic en el token comprometido
3. Haz clic en **"Delete"**
4. Genera uno nuevo
5. Actualiza `.env`

### Buenas prácticas

✅ Usar **vencimiento** en los tokens (recomendado: 30 días)  
✅ Usar **Fine-grained** en producción (least privilege)  
✅ Usar **tokens específicos por pipeline** si tienes acceso limitado en algunos repos  
✅ Nunca commitar `.env` en git (ya está en `.gitignore`)  
✅ Usar **GitHub Secrets** en GitHub Actions (no los tokens de `.env`)  

---

## Resumen: ¿Cuál debería usar?

| Escenario | Recomendación | Tipo |
|-----------|---------------|------|
| **Tu caso (3 repos diferentes)** | `GITHUB_TOKEN_EDGE`, `_EDGE_TS`, `_EDGE_UNI` | Fine-grained |
| **Local / desarrollo** | Classic por simplicidad | `ghp_...` |
| **Producción / CI-CD** | Fine-grained por seguridad | `github_pat_...` |
| **Fallback de emergencia** | `GITHUB_TOKEN` (Classic o Fine-grained) | cualquiera |
| **Máxima seguridad** | Fine-grained + vencimiento 30 días | `github_pat_...` |

---

## 🎯 Configuración recomendada para tu setup

```bash
# Fallback (solo para emergencias)
GITHUB_TOKEN=ghp_xxxxx  # Token general organización

# Tokens específicos (ESTOS son los importantes)
GITHUB_TOKEN_EDGE=ghp_xxxxx       # Fine-grained, solo mlops4rtedge
GITHUB_TOKEN_EDGE_TS=ghp_xxxxx    # Fine-grained, solo mlops4rtedgeTS
GITHUB_TOKEN_EDGE_UNI=ghp_xxxxx   # Fine-grained, solo mlops4rtedgeUni
```

**Por qué es así:**
- ✅ Máxima seguridad — cada repo tiene su propio token
- ✅ Auditoría clara — qué token accedió a qué repo
- ✅ Rotación independiente — puedes cambiar un token sin afectar otros
- ✅ Red de contención — si algo falla, `GITHUB_TOKEN` evita un apagón total

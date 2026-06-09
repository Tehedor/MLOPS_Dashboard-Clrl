# Despliegue ARC v4 — Organización

Este archivo deja un bloque listo para copiar y pegar en una máquina.
Solo hace dos cosas:

1. crea los ficheros `runner-24gb-values.yaml` y `runner-8gb-values.yaml`
2. instala los dos runner scale sets con `helm`

A diferencia de la versión de un solo repo, aquí el runner queda registrado
**a nivel de organización**: cualquier repo de `TeheORG` puede usarlo con
`runs-on: runner-8gb` / `runs-on: runner-24gb`.

> [!NOTE]
> 📝 **Cómo crear el token (PAT) para organización**
>
> Los tokens se generan desde tu perfil de usuario, pero asignando la
> **organización como propietaria del recurso**.
>
> Ruta: Perfil (arriba a la derecha) → **Settings** → **Developer settings**
> → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
>
> - En **Resource owner**, despliega el menú y selecciona tu organización **`TeheORG`** (en lugar de tu usuario).
> - En **Repository access**, elige **All repositories** (o solo las que necesites).
>
> Permisos mínimos:
>
> | Ámbito | Permiso | Nivel |
> |---|---|---|
> | **Organization** | **Self-hosted runners** | **Read & Write** ← imprescindible para org |
> | Repository | Administration | Read & Write |
> | Repository | Actions | Read |
> | Repository | Metadata | Read |
>
> El permiso de organización **Self-hosted runners → Read & Write** es el que
> diferencia a un token de org de uno de repo. Sin él, el listener fallará al
> intentar registrar el scale set.

> [!CAUTION]
> 
> En Runner Group al que pertenezca los runners debe tener habilitado la opción de Allow Public Repositories
>
> Direcciones para verificar los runners
> https://github.com/organizations/<ORG>/settings/actions/runner-groups
> https://github.com/organizations/<ORG>/settings/actions/runners


Antes de pegarlo, exporta tus variables:

```bash
export GITHUB_PAT=github_pat_****
export GITHUB_CONFIG_URL="https://github.com/TeheORG"
```

> ⚠️ Fíjate: la URL es **solo la organización** (`https://github.com/TeheORG`),
> **sin** `/nombre-del-repo` al final. Ese es el cambio clave frente a la
> versión de un solo repo.

## 1. Paso 1 — Instalar el Controller

Este paso es **común a todos los modos**. Solo se hace una vez.

```bash
helm install arc \
  --namespace arc-system \
  --create-namespace \
  --version 0.13.1 \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set-controller
```

**Verificar:**

```bash
kubectl get pods -n arc-system -w
# Esperar hasta ver:
# arc-gha-rs-controller-XXXXXXX   1/1   Running   0   Xs
# Ctrl+C para salir
```

> ⚠️ No continuar hasta que el controller esté `1/1 Running`.

## 2. Paso 2 — Instalar el Runner Scale Set

```bash
cat > runner-24gb-values.yaml <<EOF
githubConfigUrl: "${GITHUB_CONFIG_URL}"
githubConfigSecret:
  github_token: "${GITHUB_PAT}"
maxRunners: 3
minRunners: 0
containerMode:
  type: "dind"
template:
  spec:
    containers:
      - name: runner
        image: ghcr.io/actions/actions-runner:latest
        command: ["/home/runner/run.sh"]
        resources:
          requests:
            cpu: "4"
            memory: "24Gi"
          limits:
            cpu: "8"
            memory: "24Gi"
EOF

cat > runner-8gb-values.yaml <<EOF
githubConfigUrl: "${GITHUB_CONFIG_URL}"
githubConfigSecret:
  github_token: "${GITHUB_PAT}"
maxRunners: 5
minRunners: 0
containerMode:
  type: "dind"
template:
  spec:
    containers:
      - name: runner
        image: ghcr.io/actions/actions-runner:latest
        command: ["/home/runner/run.sh"]
        resources:
          requests:
            cpu: "2"
            memory: "8Gi"
          limits:
            cpu: "4"
            memory: "8Gi"
EOF
```

```bash
helm install runner-8gb \
  --namespace arc-runners \
  --create-namespace \
  --version 0.13.1 \
  -f runner-8gb-values.yaml \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set

helm install runner-24gb \
  --namespace arc-runners \
  --create-namespace \
  --version 0.13.1 \
  -f runner-24gb-values.yaml \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set
```

**Verificar en GitHub** (ahora a nivel de organización):

`https://github.com/organizations/TeheORG/settings/actions/runners`

Deben aparecer `runner-8gb` y `runner-24gb` como scale sets con 0 runners activos.

## 3. Desinstalar y no dejar restos

Si quieres quitar solo estos dos runner scale sets y limpiar lo que hayan dejado en Kubernetes, usa esto:

```bash
helm uninstall runner-8gb -n arc-runners
helm uninstall runner-24gb -n arc-runners

kubectl delete namespace arc-runners --timeout=60s
```

Si también instalaste el controller solo para esta prueba, puedes borrarlo aparte:

```bash
helm uninstall arc -n arc-system
kubectl delete namespace arc-system --timeout=60s
```

---

# Arreglar namespaces atascados

```bash
NS="arc-runners"
kubectl get namespace $NS -o json | \
  python3 -c '
import json, sys
o = json.load(sys.stdin)
o["spec"]["finalizers"] = []
print(json.dumps(o))
' | kubectl replace --raw "/api/v1/namespaces/$NS/finalize" -f -
```
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
export MLOPS_JOB_IMAGE="ghcr.io/tehedor/mlops_actions_v2/mlops-env:v1.0.0"
```

> ⚠️ Fíjate: la URL es **solo la organización** (`https://github.com/TeheORG`),
> **sin** `/nombre-del-repo` al final. Ese es el cambio clave frente a la
> versión de un solo repo.
>
> ⚠️ Cambia `MLOPS_JOB_IMAGE` por un tag real e inmutable de tu imagen. Evita
> `latest` para que Kubernetes pueda reutilizar la caché del nodo y para que
> las ejecuciones sean reproducibles.

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

> [!NOTE]
> **Nuevo enfoque: Kubernetes mode en lugar de DinD.**
>
> El error `Recv failure: Connection reset by peer` aparece dentro del
> `container:` del workflow, que en modo DinD corre dentro de una red Docker
> bridge creada por un Docker daemon efímero. En este clúster, bajar el MTU de
> DinD no ha sido suficiente.
>
> Con `containerMode.type: "kubernetes-novolume"`, ARC crea el contenedor del
> job como un pod gestionado por Kubernetes y usa hooks de ciclo de vida para
> mover el workspace entre pods sin crear PVCs. Así se evita la red
> Docker-in-Docker, la imagen del job pasa a usar el runtime/caché del nodo
> Kubernetes y no se aprovisionan volúmenes en Longhorn.
>
> Este modo está pensado para workflows con `container:`. Si un job no define
> `container:`, fallará salvo que cambies explícitamente la política del runner.
> Para estos runners, lo recomendable es que todos los workflows que usen
> `runs-on: runner-8gb` / `runner-24gb` tengan `container:`.

**Paso 2.1 — Crear el namespace**

El namespace `arc-runners` es donde viven los pods de runner, no el controller:

```bash
kubectl create namespace arc-runners
```

**Paso 2.2 — Crear los values**

Este bloque usa `kubernetes-novolume` para no crear PVCs ni consumir la
StorageClass por defecto del clúster. En tu caso, la StorageClass por defecto es
`longhorn`, así que evitar PVCs evita tocar Longhorn.

```bash
cat > runner-24gb-values.yaml <<EOF
githubConfigUrl: "${GITHUB_CONFIG_URL}"
githubConfigSecret:
  github_token: "${GITHUB_PAT}"
maxRunners: 3
minRunners: 0
containerMode:
  type: "kubernetes-novolume"
template:
  spec:
    containers:
      - name: runner
        image: ghcr.io/actions/actions-runner:2.335.1
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
  type: "kubernetes-novolume"
template:
  spec:
    containers:
      - name: runner
        image: ghcr.io/actions/actions-runner:2.335.1
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

**Paso 2.3 — Instalar**

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

**Si ya estaban instalados en modo DinD, usa upgrade:**

```bash
helm upgrade runner-8gb \
  --namespace arc-runners \
  --version 0.13.1 \
  -f runner-8gb-values.yaml \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set

helm upgrade runner-24gb \
  --namespace arc-runners \
  --version 0.13.1 \
  -f runner-24gb-values.yaml \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set
```

En Kubernetes mode no se aplica el patch de MTU de DinD.
Tampoco deberían crearse PVCs con `kubernetes-novolume`.

**Verificar en GitHub** (ahora a nivel de organización):

`https://github.com/organizations/TeheORG/settings/actions/runners`

Deben aparecer `runner-8gb` y `runner-24gb` como scale sets con 0 runners activos.

**Verificar en Kubernetes:**

```bash
kubectl get pods -n arc-runners
kubectl get autoscalingrunnersets.actions.github.com -n arc-runners
kubectl get ephemeralrunners.actions.github.com -n arc-runners
kubectl get pvc -n arc-runners
```

Con `kubernetes-novolume`, `kubectl get pvc -n arc-runners` debería devolver
`No resources found`. Si aparecen PVCs nuevos, revisa que los values aplicados
no sigan usando `containerMode.type: "kubernetes"` con
`kubernetesModeWorkVolumeClaim`.

**Verificar durante un workflow:**

```bash
kubectl get pods -n arc-runners -w
```

En modo Kubernetes deberías ver un pod de runner y, cuando el job entre en el
`container:` del workflow, un pod/contenedor de job gestionado por Kubernetes.

Si ves algo como esto, es esperado en `kubernetes-novolume`:

```text
runner-8gb-XXXXX-runner-YYYYY            1/1   Running
runner-8gb-XXXXX-runner-YYYYY-workflow   0/1   PodInitializing
```

El pod `*-runner-*` ejecuta el runner de GitHub. El pod `*-workflow` ejecuta el
`container:` del workflow. En GitHub Actions, la línea:

```text
Run '/home/runner/k8s-novolume/index.js'
```

es el hook de ARC que crea y prepara ese pod `*-workflow`. Si se queda ahí
varios minutos, el runner está esperando a que Kubernetes inicialice el pod de
workflow.

**Diagnosticar `*-workflow` atascado en `PodInitializing`:**

```bash
WORKFLOW_POD="<pod-runner>-workflow"

kubectl describe pod "$WORKFLOW_POD" -n arc-runners
kubectl get pod "$WORKFLOW_POD" -n arc-runners -o jsonpath='{range .status.initContainerStatuses[*]}{.name}{" state="}{.state}{"\n"}{end}'
kubectl get pod "$WORKFLOW_POD" -n arc-runners -o jsonpath='{range .status.containerStatuses[*]}{.name}{" state="}{.state}{"\n"}{end}'
kubectl logs "$WORKFLOW_POD" -n arc-runners --all-containers=true --prefix=true
kubectl get events -n arc-runners --sort-by=.lastTimestamp | tail -80
```

Las causas habituales son:
- La imagen del job se está descargando y tarda mucho.
- La imagen del job no existe, requiere credenciales o falla el pull.
- El pod no puede montar/preparar el workspace temporal de `kubernetes-novolume`.
- El scheduler no encuentra nodo con CPU/memoria suficiente para el pod de job.

**Verificar logs:**

```bash
POD="<pod-runner>"

kubectl logs "$POD" -n arc-runners -c runner
kubectl describe pod "$POD" -n arc-runners
```

**Workflow esperado:**

```yaml
runs-on: runner-8gb
container:
  image: ghcr.io/tehedor/mlops_actions_v2/mlops-env:v1.0.0
```

Evita `latest` en la imagen del job. Usa un tag fijo o digest para que el
runtime del nodo pueda reutilizar caché y para que las ejecuciones sean
reproducibles.

Si mantienes la variable de GitHub Actions, configura `IMAGE_MLOPS` en el repo
u organización con ese tag fijo:

```yaml
container:
  image: ${{ vars.IMAGE_MLOPS }}
```

**Opcional — precargar la imagen del job en los nodos**

Esto fuerza al runtime del nodo Kubernetes a descargar la imagen antes de que
llegue el workflow. Es útil con `minRunners: 0`, porque los runners son
efímeros pero la caché de imágenes queda en el nodo.

```bash
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: preload-mlops-image
  namespace: arc-runners
spec:
  selector:
    matchLabels:
      app: preload-mlops-image
  template:
    metadata:
      labels:
        app: preload-mlops-image
    spec:
      initContainers:
        - name: pull
          image: ${MLOPS_JOB_IMAGE}
          command: ["sh", "-c", "echo image preloaded"]
      containers:
        - name: pause
          image: registry.k8s.io/pause:3.9
      terminationGracePeriodSeconds: 1
EOF
```

Verifica que el DaemonSet está en todos los nodos:

```bash
kubectl get daemonset preload-mlops-image -n arc-runners
kubectl get pods -n arc-runners -l app=preload-mlops-image -o wide
```

> [!CAUTION]
> **Compatibilidad de workflows**
>
> - Los jobs enviados a estos runners deben definir `container:`.
> - Evita acciones locales tipo `uses: ./.github/actions/...` con
>   `kubernetes-novolume`. El hook ejecuta los pasos dentro del pod
>   `*-workflow`, pero el runner resuelve la metadata de acciones locales desde
>   su propio workspace (`/home/runner/_work/...`). Sin volumen compartido puede
>   fallar con `Can't find action.yml`.
> - Si una fase ejecuta `docker build`, `docker run` o Docker Compose dentro
>   del job, mantenla en un runner DinD separado.
> - No actives `ACTIONS_RUNNER_REQUIRE_JOB_CONTAINER=false` salvo que aceptes
>   que jobs sin contenedor puedan ejecutarse con más acceso al API de
>   Kubernetes desde el runner pod.

Si aparece este error:

```text
Can't find 'action.yml', 'action.yaml' or 'Dockerfile' under
'/home/runner/_work/.../.github/actions/commit-and-pr'
```

el checkout sí se ha hecho, pero dentro del pod `*-workflow`. La acción local
se intenta resolver desde el pod del runner. Para estos runners, sustituye las
acciones locales por pasos `run:` inline, o usa una acción remota versionada
(`owner/repo/path@ref`) que GitHub pueda descargar como acción externa.

## 3. Egress NetworkPolicy (solo si el CNI la enforece)

Solo necesario si el clúster bloquea egress por NetworkPolicy (Calico/Cilium con
políticas activas). Comprueba primero: `kubectl get networkpolicy -n arc-runners`.

```bash
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: runner-allow-egress
  namespace: arc-runners
spec:
  podSelector: {}
  policyTypes:
    - Egress
  egress:
    - ports:
        - protocol: TCP
          port: 443
    - ports:
        - protocol: TCP
          port: 22
    - ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
EOF
```

## 4. Desinstalar y no dejar restos

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

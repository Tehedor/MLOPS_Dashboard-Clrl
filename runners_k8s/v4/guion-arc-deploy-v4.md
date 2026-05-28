# Guión de Despliegue: Actions Runner Controller (ARC) v0.13.1
### Nueva arquitectura `actions.github.com` — Runner Scale Sets
#### Probado en k3s v1.34.6 + Helm v4.1.4

---

## Índice

- [Guión de Despliegue: Actions Runner Controller (ARC) v0.13.1](#guión-de-despliegue-actions-runner-controller-arc-v0131)
    - [Nueva arquitectura `actions.github.com` — Runner Scale Sets](#nueva-arquitectura-actionsgithubcom--runner-scale-sets)
      - [Probado en k3s v1.34.6 + Helm v4.1.4](#probado-en-k3s-v1346--helm-v414)
  - [Índice](#índice)
  - [0. Prerequisitos](#0-prerequisitos)
  - [1. Ceración de token PAT](#1-ceración-de-token-pat)
    - [1.1 Generar el token PAT](#11-generar-el-token-pat)
    - [1.2 Generar el token PAT](#12-generar-el-token-pat)
  - [2. Paso 1 — Instalar el Controller](#2-paso-1--instalar-el-controller)
  - [3. Paso 2 — Instalar el Runner Scale Set](#3-paso-2--instalar-el-runner-scale-set)
    - [Modo A — DinD (recomendado)](#modo-a--dind-recomendado)
    - [Modo B — Sin container mode](#modo-b--sin-container-mode)
    - [Modo C — Kubernetes mode](#modo-c--kubernetes-mode)
  - [4. Paso 3 — Verificar el despliegue](#4-paso-3--verificar-el-despliegue)
  - [5. Paso 4 — Adaptar workflows](#5-paso-4--adaptar-workflows)
  - [6. Troubleshooting](#6-troubleshooting)
    - [Ver el estado general](#ver-el-estado-general)
    - [Runner termina en 1 segundo con Exit Code 0](#runner-termina-en-1-segundo-con-exit-code-0)
    - [Runner termina con Exit Code distinto de 0](#runner-termina-con-exit-code-distinto-de-0)
    - [Listener en crash loop](#listener-en-crash-loop)
    - ["Waiting for a runner to pick up this job..."](#waiting-for-a-runner-to-pick-up-this-job)
    - [Runner legacy huérfano en GitHub](#runner-legacy-huérfano-en-github)
  - [7. Desinstalar completamente](#7-desinstalar-completamente)
  - [8. Cambiar de modo](#8-cambiar-de-modo)
  - [Resumen: por qué esta configuración funciona](#resumen-por-qué-esta-configuración-funciona)
  - [Referencias](#referencias)

---

## 0. Prerequisitos

| Componente | Probado con | Mínimo |
|---|---|---|
| Kubernetes (k3s) | v1.34.6+k3s1 | 1.25+ |
| Helm | v4.1.4 | 3.8+ |
| GitHub PAT | classic token | scopes: `repo` + `workflow` |

```bash
kubectl version
helm version --short
```

> ✅ **Red privada**: no necesita webhooks ni IP pública. El listener mantiene
> una conexión long-poll HTTPS **saliente** hacia GitHub.

**Exportar variables antes de empezar** (se usan en todos los comandos):

```bash
export GITHUB_PAT="ghp_XXXXXXXXXXXXXXXXXX"
export GITHUB_CONFIG_URL="https://github.com/Tehedor/MLOps_actions_v2"
```

---
## 1. Ceración de token PAT

### 1.1 Generar el token PAT

GitHub → Settings → Developer settings → Fine-grained personal access tokens

| Permiso | Nivel |
|---|---|
| Administration | Read & Write |
| Actions | Read |
| Metadata | Read |


---

### 1.2 Generar el token PAT
Los tokens siempre se generan desde el perfil de usuario, asignando la organización como propietaria del recurso.

Ruta: Perfil (arriba a la derecha) → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token

En el apartado *Resource owner*, despliega el menú y selecciona el nombre de tu Organización (en lugar de tu usuario).

En Repository access, selecciona All repositories o Only select repositories según necesites.

| Ámssbito | Permiso | Nivel |
|---|---|---|
| Repository | Administration | Read & Write |
| Repository | Actions | Read |
| Repository | Checks | Read |
| Repository | Metadata | Read |
| Repository | Pull requests | Read |
| Organization | Self-hosted runners | Read & Write |
| Organization | Webhooks | Read & Write |

---


## 2. Paso 1 — Instalar el Controller

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

---

## 3. Paso 2 — Instalar el Runner Scale Set

Elige **UN modo** según tu caso de uso:

| Modo | Usa `container:` en workflow | Docker build | Complejidad |
|---|---|---|---|
| **A — DinD** (recomendado) | ✅ Sí | ✅ Sí | Media |
| B — Sin container mode | ❌ No | ❌ No | Baja |
| C — Kubernetes mode | ✅ Sí | ❌ No | Alta |

---

### Modo A — DinD (recomendado)

**Docker-in-Docker**. El runner pod incluye un sidecar con `dockerd`.
Soporta `container:` en workflows y `docker build`.
**Usar este modo si tus workflows tienen `container: image:`.**

```bash
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
  --version 0.13.1 \
  -f runner-24gb-values.yaml \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set
```


---
```bash
helm install runner-8gb \
  --namespace arc-runners \
  --create-namespace \
  --version 0.13.1 \
  --set githubConfigUrl="${GITHUB_CONFIG_URL}" \
  --set githubConfigSecret.github_token="${GITHUB_PAT}" \
  --set maxRunners=4 \
  --set minRunners=0 \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set
```
helm uninstall runner-8gb -n arc-runners 2>/dev/null
helm uninstall runner-24gb -n arc-runners 2>/dev/null

---
```bash 
helm install runner-24gb \
  --namespace arc-runners \
  --version 0.13.1 \
  --set githubConfigUrl="${GITHUB_CONFIG_URL}" \
  --set githubConfigSecret.github_token="${GITHUB_PAT}" \
  --set maxRunners=1 \
  --set minRunners=0 \
  --set containerMode.type="dind" \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set
```
---



**Qué pasa internamente**: cada runner pod tiene 2 containers:
- `runner` — ejecuta el GitHub Actions runner
- `dind` — ejecuta `dockerd`, que el runner usa para levantar el container del workflow

**Requisito de k3s**: el sidecar dind necesita ejecutarse como privileged.
k3s lo permite por defecto, pero si tienes PodSecurityPolicies restrictivas,
debes permitir containers privilegiados en el namespace `arc-runners`.

---

### Modo B — Sin container mode

**El más simple**. El job se ejecuta directamente en el runner pod.
**NO soporta `container:` en los workflows** — si tu workflow tiene
`container: image:`, el runner terminará en 1 segundo sin ejecutar nada.

```bash
helm install runner-8gb \
  --namespace arc-runners \
  --create-namespace \
  --version 0.13.1 \
  --set githubConfigUrl="${GITHUB_CONFIG_URL}" \
  --set githubConfigSecret.github_token="${GITHUB_PAT}" \
  --set maxRunners=5 \
  --set minRunners=0 \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set
```

**Cuándo usar este modo**: workflows simples que solo ejecutan scripts,
`actions/checkout`, `make`, etc. Sin `container:` ni `docker build`.

**Ejemplo de workflow compatible:**

```yaml
jobs:
  build:
    runs-on: runner-8gb
    # SIN container: — se ejecuta en el runner directamente
    steps:
      - uses: actions/checkout@v4
      - run: make build
```

---

### Modo C — Kubernetes mode

**Cada step del workflow se ejecuta en un pod separado**.
Soporta `container:` pero NO soporta `docker build`.
Requiere configuración adicional de RBAC y volúmenes.

```bash
helm install runner-8gb \
  --namespace arc-runners \
  --create-namespace \
  --version 0.13.1 \
  --set githubConfigUrl="${GITHUB_CONFIG_URL}" \
  --set githubConfigSecret.github_token="${GITHUB_PAT}" \
  --set maxRunners=5 \
  --set minRunners=0 \
  --set containerMode.type="kubernetes" \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set
```

> ⚠️ Este modo puede dar errores de volúmenes en k3s si no tienes un
> StorageClass con soporte para PVC ephemeral. Si ves errores de
> `volumeClaimTemplate`, usa el Modo A (DinD) en su lugar.

---

## 4. Paso 3 — Verificar el despliegue

**Independiente del modo elegido, la verificación es la misma:**

```bash
# Controller y listener (ambos en arc-system)
kubectl get pods -n arc-system
# arc-gha-rs-controller-XXXXXXX    1/1   Running   ← controller
# runner-8gb-XXXXXXXX-listener     1/1   Running   ← listener

# Estado del scale set
kubectl get autoscalingrunnerset -n arc-runners
# NAME         MINIMUM RUNNERS   MAXIMUM RUNNERS   STATE
# runner-8gb   0                 5                 Running
```

**Verificar en GitHub:**

`https://github.com/Tehedor/MLOps_actions_v2/settings/actions/runners`

Debe aparecer `runner-8gb` como scale set con 0 runners activos.

**Job de prueba** — crear `.github/workflows/test-arc.yml`:

```yaml
name: Test ARC Runner
on:
  workflow_dispatch:

jobs:
  test:
    runs-on: runner-8gb
    # Para Modo A (DinD), probar también con container:
    # container:
    #   image: ubuntu:22.04
    steps:
      - name: Info del runner
        run: |
          echo "Hostname: $(hostname)"
          echo "CPU: $(nproc) cores"
          echo "RAM: $(free -h | grep Mem)"
          echo "ARC v0.13.1 funcionando!"
```

Observar en tiempo real:

```bash
# Ver runner pods
kubectl get pods -n arc-runners -w
```

En **Modo A (DinD)**, cada runner pod tendrá 2 containers (`runner` + `dind`).

---

## 5. Paso 4 — Adaptar workflows

```yaml
# ANTES (legacy Summerwind)
runs-on: [self-hosted-k8s, runner-8gb]

# AHORA (nueva ARC)
runs-on: runner-8gb
```

El nombre en `runs-on:` es exactamente el `INSTALLATION_NAME` del `helm install`.

> La nueva ARC no soporta múltiples labels. Para otros tamaños,
> crear más scale sets con nombres distintos (`runner-4gb`, `runner-gpu`...).

---

## 6. Troubleshooting

### Ver el estado general

```bash
# Controller + listener
kubectl get pods -n arc-system

# Runner pods (solo durante jobs)
kubectl get pods -n arc-runners

# Scale set
kubectl get autoscalingrunnerset -n arc-runners

# Logs del controller
kubectl logs -n arc-system deployment/arc-gha-rs-controller --tail=30

# Logs del listener
kubectl logs -n arc-system \
  -l app.kubernetes.io/component=runner-scale-set-listener --tail=30
```

### Runner termina en 1 segundo con Exit Code 0

**Causa**: el workflow tiene `container:` pero el runner no tiene Docker.
**Solución**: reinstalar con Modo A (DinD). Ver sección [Cambiar de modo](#8-cambiar-de-modo).

### Runner termina con Exit Code distinto de 0

```bash
# Ver logs del runner que falló
kubectl logs -n arc-runners <nombre-del-pod> -c runner --previous
```

### Listener en crash loop

```bash
kubectl describe pod -n arc-system \
  -l app.kubernetes.io/component=runner-scale-set-listener

kubectl logs -n arc-system \
  -l app.kubernetes.io/component=runner-scale-set-listener --previous
```

Causas frecuentes:
- PAT inválido o expirado
- URL del repo incorrecta
- El controller no está corriendo

### "Waiting for a runner to pick up this job..."

```bash
# Verificar nombre del scale set
kubectl get autoscalingrunnerset -n arc-runners -o jsonpath='{.items[*].metadata.name}'
```

El nombre debe coincidir EXACTAMENTE con `runs-on:` del workflow.

### Runner legacy huérfano en GitHub

Borrarlo manualmente en:
`https://github.com/Tehedor/MLOps_actions_v2/settings/actions/runners`

Si queda atascado en k8s:

```bash
kubectl patch runner <nombre> -n actions-runner-system \
  --type=json -p='[{"op":"remove","path":"/metadata/finalizers"}]'
```

---

## 7. Desinstalar completamente

**Respetar el orden.**

```bash
# 1. Desinstalar runner scale set
helm uninstall runner-8gb -n arc-runners

# 2. Esperar limpieza
sleep 15

# 3. Desinstalar controller
helm uninstall arc -n arc-system

# 4. Eliminar namespaces
kubectl delete namespace arc-runners --timeout=60s
kubectl delete namespace arc-system --timeout=60s
```

**Si un namespace queda en Terminating:**

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

**Si quedan CRDs huérfanos:**

```bash
for crd in $(kubectl get crd -o name | grep actions.github.com); do
  kubectl patch $crd --type=json \
    -p='[{"op":"remove","path":"/metadata/finalizers"}]' 2>/dev/null
  kubectl delete $crd --force --grace-period=0 2>/dev/null
done
```

**Limpiar legacy Summerwind:**

```bash
for runner in $(kubectl get runners.actions.summerwind.dev -A -o name 2>/dev/null); do
  kubectl patch $runner -n actions-runner-system \
    --type=json -p='[{"op":"remove","path":"/metadata/finalizers"}]' 2>/dev/null
done

for crd in $(kubectl get crd -o name | grep summerwind); do
  kubectl delete $crd --force --grace-period=0 2>/dev/null
done

kubectl delete namespace actions-runner-system 2>/dev/null
```

---

## 8. Cambiar de modo

Para cambiar entre modos (ej: de "sin container mode" a "DinD"):

```bash
# 1. Desinstalar el runner scale set actual
helm uninstall runner-8gb -n arc-runners
sleep 15

# 2. Reinstalar con el nuevo modo (ejemplo: DinD)
helm install runner-8gb \
  --namespace arc-runners \
  --create-namespace \
  --version 0.13.1 \
  --set githubConfigUrl="${GITHUB_CONFIG_URL}" \
  --set githubConfigSecret.github_token="${GITHUB_PAT}" \
  --set maxRunners=5 \
  --set minRunners=0 \
  --set containerMode.type="dind" \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set
```

Si quedan recursos huérfanos del modo anterior:

```bash
kubectl delete serviceaccount,role,rolebinding \
  -n arc-runners -l app.kubernetes.io/instance=runner-8gb
```

> ⚠️ NO hace falta reinstalar el controller (Paso 1). Solo el runner scale set.

---

## Resumen: por qué esta configuración funciona

| Decisión | Motivo |
|---|---|
| v0.13.1 | 5.7M descargas, la más estable sin reescritura experimental |
| PAT inline con `--set` | Helm crea el secret con RBAC correcto automáticamente |
| DinD como modo principal | Soporta `container:` en workflows + `docker build` |
| Sin ficheros YAML | Todo en 2 comandos helm, menos puntos de fallo |
| Sin `controllerServiceAccount` | Auto-descubrimiento por label, evita errores de nombre |
| `minRunners: 0` | Scale-to-zero nativo gracias al listener con long-poll |

---

## Referencias

| Recurso | URL |
|---|---|
| Quick start oficial | https://docs.github.com/en/actions/tutorials/use-actions-runner-controller/get-started |
| Despliegue avanzado | https://docs.github.com/en/actions/tutorials/use-actions-runner-controller/deploy-runner-scale-sets |
| Releases | https://github.com/actions/actions-runner-controller/releases |
| Troubleshooting oficial | https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners-with-actions-runner-controller/troubleshooting-actions-runner-controller-errors |
| values.yaml completo | https://github.com/actions/actions-runner-controller/blob/master/charts/gha-runner-scale-set/values.yaml |


---
Los tres pods que ves en `arc-system`:

| Pod | Qué es | Qué hace | Siempre activo |
|---|---|---|---|
| `arc-gha-rs-controller-*` | **Controller** | Gestiona el ciclo de vida de todos los scale sets. Crea/destruye runners, gestiona secrets JIT, reconcilia estado | ✅ Sí, siempre |
| `runner-8gb-*-listener` | **Listener del scale set 8gb** | Mantiene conexión long-poll con GitHub. Cuando llega un job con `runs-on: runner-8gb`, le dice al controller que cree un runner pod en `arc-runners` | ✅ Sí, siempre |
| `runner-24gb-*-listener` | **Listener del scale set 24gb** | Lo mismo pero para `runs-on: runner-24gb` | ✅ Sí, siempre |

Estos 3 pods son la "infraestructura mínima" que consume muy pocos recursos (~22MB + 13MB + 13MB ≈ 48MB total). Son los que están escuchando constantemente a GitHub.

Cuando un workflow pide `runs-on: runner-8gb`, el flujo es:

```
GitHub → long-poll → runner-8gb-listener → avisa al controller → controller crea runner pod en arc-runners (2-4 CPU, 8Gi) → job se ejecuta → pod se destruye
```

Y con `runs-on: runner-24gb`:

```
GitHub → long-poll → runner-24gb-listener → avisa al controller → controller crea runner pod en arc-runners (4-8 CPU, 24Gi) → job se ejecuta → pod se destruye
```

Los runner pods pesados solo existen mientras dura el job. Fuera de eso, solo estos 3 pods ligeros están corriendo.
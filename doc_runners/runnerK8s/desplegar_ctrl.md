# Despliegue ARC v4

Este archivo deja un bloque listo para copiar y pegar en una máquina.
Solo hace dos cosas:

1. crea los ficheros `runner-24gb-values.yaml` y `runner-8gb-values.yaml`
2. instala los dos runner scale sets con `helm`

Antes de pegarlo, exporta tus variables:

```bash 
export GITHUB_PAT=github_pat_******
export GITHUB_CONFIG_URL="https://github.com/Tehedor/MLOps_actions_v2"
```


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

## 2. Desinstalar y no dejar restos

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

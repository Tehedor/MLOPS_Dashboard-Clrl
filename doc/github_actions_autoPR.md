# Configuración GitHub para merge automático de PRs

El workflow usa `gh pr merge --squash --delete-branch` (merge directo, sin `--auto`).
Para que funcione con `GITHUB_TOKEN` sin intervención manual:

---

## 1. Permisos de Actions (obligatorio)
> [!IMPORTANT]
> **Org repos — empezar aquí:** si las opciones del repo aparecen en gris, es porque
> la organización las bloquea. Hay que cambiarlas **primero en Org Settings**:
> `github.com/<OrgName>` → **Settings → Actions → General → Workflow permissions**
> → "Read and write permissions" + "Allow GitHub Actions to create and approve pull requests".
> Sin permisos de org admin no se puede hacer — pedírselo al owner.

Una vez configurado en la org, ir al repo: **Settings → Actions → General → Workflow permissions**
- Seleccionar **"Read and write permissions"**
- Marcar **"Allow GitHub Actions to create and approve pull requests"**

---

## 2. Branch protection en la rama base (test / test2 / test3 / main)

El `GITHUB_TOKEN` **no puede auto-aprobarse** ni saltarse checks bloqueantes.
Dos opciones:

### Opción A — Sin protección (recomendada para ramas de experimento)
No añadir ninguna regla en esas ramas. El merge pasa directamente.

### Opción B — Con protección mínima
Si quieres trazabilidad via PR (ver historial):
- **Requerir status checks** → SÍ, pero solo si cambias el merge a `--auto`
- **Requerir revisión humana** → NO (bloquea el merge automático)
- **Permitir bypass** → Añadir el rol/usuario que ejecuta Actions si necesitas forzarlo

> Si activas status checks requeridos con merge directo (sin `--auto`), el merge falla
> inmediatamente si los checks aún no han pasado. Cambia a `gh pr merge "$PR" --auto --squash --delete-branch`
> y habilita auto-merge en Settings → General → **Allow auto-merge**.

---

## 3. Permisos declarados en el workflow (ya configurados)

```yaml
permissions:
  contents: write
  pull-requests: write
```

Verificar que estén en el workflow del orquestador (`61_mlops_Orchestator_trigger.yml`)
**y** en cada `reusable_fase*.yml`. Sin `pull-requests: write` el `gh pr create` falla.

---

## 4. Checklist por repo

| Check | Repo personal | Org repo |
|---|---|---|
| Actions → Read & write permissions | Settings repo | Settings repo |
| Actions → Allow create/approve PRs | Settings repo | **Org Settings primero**, luego repo |
| Branch protection sin required reviews | Settings → Branches | igual |
| Auto-merge (solo si usas `--auto`) | Settings → General | igual |

---

## Notas org

- En repos de org con **ruleset heredado** (org-level ruleset), los ajustes del repo pueden quedar anulados. Revisar **Org Settings → Rules → Rulesets**.
- Si la org requiere firma de commits (`Require signed commits`), el `git commit` del runner falla salvo que uses un GPG key o deshabilites la regla para esas ramas.
- Para automatización más robusta en orgs: usar un **GitHub App** en lugar de `GITHUB_TOKEN`. El App puede aprobarse a sí mismo y no está sujeto a las restricciones del token efímero.

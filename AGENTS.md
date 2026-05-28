<claude-mem-context>
# Memory Context

# [app_ctrl] recent context, 2026-05-27 7:08pm GMT+2

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (18,761t read) | 343,846t work | 95% savings

### May 27, 2026
976 6:09a 🔄 RunnerConfigModal Extracted Out of TerminalTabs.jsx
977 6:11a 🔄 Gear Button and onOpenConfig Removed from TabBar — Being Relocated
978 " 🔄 TerminalTabs Fully Reverted to Pre-Modal State — RunnerConfigModal Moved Elsewhere
979 9:48a 🔵 Usuario cuestiona frecuencia de polling a Supabase para detección de runner completado
980 9:53a 🟣 Vista Ejecuciones: Duplicate Variant Guard + Placeholder Input Filtering
981 " 🔄 GitHub Poll Loop: Faster Interval + Concurrent Run Checks via asyncio.gather
982 12:13p 🔵 Ejecuciones fallidas quedan como "running" en SQLite hasta reinicio de la app
983 12:14p 🔵 Estructura del servicio GitHub en el pipeline de ejecuciones
985 12:15p 🔵 Complete Config & Env File Map for dash_ctrl_mlops/app_ctrl
984 " 🔴 Corrección de comparación de timestamps en `_find_run_after` de github.py
986 12:16p 🔵 Four Real .env Files Found Across Three Subsystems
988 " 🔵 Project Dependency File Locations Mapped
987 " 🔴 Retry con backoff para encontrar el `gh_run_id` tras dispatch a GitHub Actions
989 " 🔵 runners_k8s Directory Structure: ARC Runner with Versioned Evolution History
990 12:17p 🚨 GitHub PAT Hardcoded in Plain Text in runners_k8s/v4/env.md
991 " 🔵 Root config.yaml is the Master App Configuration Hub
992 " 🔵 Five Runner Types Defined for MLOps Pipeline Execution
994 12:19p 🟣 README.md Created as Complete Configuration File Registry
993 " 🟣 Vista Ejecuciones: Duplicate Variant Check + Empty Placeholder Guard
1001 3:28p 🔵 Bug in Ejecuciones View — Null fase/variant for Older Runs
1002 3:30p 🔴 Duplicate Execution Guard Now Blocks `running` Status
1037 5:55p 🟣 Makefile Targets for Dockerfile Dependency Installation
1038 " 🔵 Existing Makefile Structure: MLOps Infrastructure Stack
1039 " 🔵 requirements.txt: MLOps4OFP Python Dependency Set
1040 5:57p ✅ Added VENV_DIR Variable to Makefile Mirroring Dockerfile Path
1041 " ✅ Declared Three New .PHONY Targets for Dependency Installation
1042 " ✅ Updated Makefile help Target with Dependency Installation Commands
1043 5:58p 🟣 Implemented install-sys-deps, install-python-deps, and install-deps Makefile Targets
S345 Fix `dvc: command not found` (exit 127) in GitHub Actions self-hosted runner by ensuring the Python `.venv` is on PATH for the runner service (May 27, 5:58 PM)
1044 6:04p 🔴 DVC Command Not Found in GitHub Actions — Missing .venv PATH Activation
1045 6:05p ✅ Added `configure-venv-path` Target to Runner Makefile
1046 6:06p ✅ Makefile Help Text Updated to Document `configure-venv-path` Implementation Strategy
1047 " 🟣 Implemented `configure-venv-path` Makefile Target — Tri-Layer venv PATH Injection
1048 6:07p ✅ `install-runner` Now Calls `configure-venv-path` After systemd Service Registration
S346 Fix `dvc: command not found` CI failure by migrating runner Python dependency installation from virtualenv to system Python (May 27, 6:07 PM)
1051 6:18p 🔵 GitHub Actions CI Fails: `dvc` Not Found in PATH
1052 6:19p 🔵 Runner Dependency Architecture: Venv-Based Python Installation with systemd PATH Injection
1053 " 🔵 `install-runner` Calls `configure-venv-path` But Requires Restart to Apply systemd Environment
1054 6:21p ✅ Makefile Help Text Updated to Reflect Shift from Venv to System Python
1055 6:22p 🔴 `install-python-deps` Refactored to Install Directly into System Python
1056 " ✅ `install-deps` Target Drops `configure-venv-path` Dependency
1057 " ✅ `install-runner` No Longer Calls `configure-venv-path` — Venv Refactor Complete
S347 Fix "dvc: command not found" (exit 127) in GitHub Actions self-hosted runner by aligning the venv PATH between the Makefile server setup and what the workflow expects (May 27, 6:23 PM)
1058 6:27p 🔵 GitHub Actions Runner: DVC Not Found Due to PATH Configuration
1059 6:28p 🔴 Makefile VENV_DIR Fixed to Match GitHub Actions Runner's Actual venv Path
1060 " 🔴 Makefile install-python-deps Now Creates Proper venv Instead of System-wide pip Install
1061 6:29p 🟣 install-runner Now Auto-Applies venv PATH Drop-in After Systemd Service Install
1062 " ✅ configure-venv-path Added to .PHONY Declaration in Makefile
S348 Debugging $HOME and DVC binary location in GitHub Actions Phase 7 workflow (May 27, 6:29 PM)
1063 6:33p 🔵 Debugging $HOME and working directory in GitHub Actions Phase 7 workflow
S349 Exact YAML snippet placement for DVC runner debug step in Phase 7 workflow (May 27, 6:33 PM)
S351 Debugging dvc not found in PATH on self-hosted runner for GitHub Actions Fase 7 workflow (May 27, 6:33 PM)
1064 6:42p 🔵 Self-hosted runner missing venv — dvc not found in PATH on Fase 7 workflow
S352 GitHub Actions self-hosted runner directory isolation investigation — understanding why venv/dependencies may not persist between jobs (May 27, 6:42 PM)
1065 6:48p 🔵 Self-Hosted GitHub Actions Runner Machine Structure (MLOPSRunner1)
S353 Enrich GitHub Actions debug step to diagnose missing DVC in MLOps pipeline runner (May 27, 6:48 PM)
1066 6:52p 🔵 GitHub Actions Runner: DVC Not Found Despite venv Installation
S354 Create enriched GitHub Actions debug step to diagnose missing DVC on ephemeral K8s runner (May 27, 6:52 PM)
1067 6:53p ✅ Enriched Debug Step Saved as Example for GitHub Actions Workflow
S355 Diagnose and fix missing DVC on GitHub Actions runner for MLOps fase 7 pipeline (May 27, 6:55 PM)
**Investigated**: GitHub Actions logs confirmed: hostname=runner-8gb-8ndzd-runner-m95s7, K8s secrets present ("Dentro de K8s pod"), HOME=/home/runner with no .venv directory and no MLOPS_Dashboard-Clrl directory. This definitively proves the job runs on an ephemeral ARC (Actions Runner Controller) Kubernetes pod, completely separate from the physical MLOPSRunner1 host where DVC was installed.

**Learned**: The runner infrastructure uses Kubernetes ARC (Actions Runner Controller). Each GitHub Actions job spawns a fresh ephemeral pod that has no persistent storage from the host node. The venv at /home/runner/.venv on MLOPSRunner1 is physically inaccessible to these pods. Every job starts from a blank container image. The fix must either install DVC at job runtime or bake it into the container image used by the ARC RunnerDeployment.

**Completed**: Root cause definitively confirmed via enriched debug step run in CI. Two fix paths identified and presented to user: Option A (quick fix — install dvc via pip in the workflow step, ~30-60s overhead per run, no infra changes needed) and Option B (production solution — custom Docker image for the ARC runner with venv pre-installed, zero runtime overhead but requires Dockerfile + image build/push + RunnerDeployment edit).

**Next Steps**: User is deciding between Option A (immediate workflow-level fix) and Option B (custom runner Docker image). Once chosen, implementation will follow: Option A modifies the "Activar Entorno Virtual" step in the reusable workflow YAML to create a fresh venv and pip-install dvc; Option B requires creating a Dockerfile and updating the Kubernetes RunnerDeployment manifest.


Access 344k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
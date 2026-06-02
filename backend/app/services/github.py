import asyncio
import json
import re
from datetime import datetime, timezone

import httpx
from app.core.config import settings

_TS_RE = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z ')


def _strip_ts(line: str) -> str:
    return _TS_RE.sub('', line)


def _parse_job_to_steps(job_name: str, raw: str) -> list[dict]:
    """Split a GH job log blob into sub-steps using ##[group] markers."""
    steps: list[dict] = []
    current: str | None = None
    lines: list[str] = []
    has_groups = False

    for raw_line in raw.splitlines():
        line = _strip_ts(raw_line)
        if line.startswith('##[group]'):
            if has_groups and current is not None:
                steps.append({'step_name': current, 'content': '\n'.join(lines)})
            current = line[len('##[group]'):]
            lines = []
            has_groups = True
        elif line.startswith('##[endgroup]'):
            if current is not None:
                steps.append({'step_name': current, 'content': '\n'.join(lines)})
            current = None
            lines = []
        elif current is not None and not line.startswith('##['):
            lines.append(line)

    if current and lines:
        steps.append({'step_name': current, 'content': '\n'.join(lines)})

    if not steps:
        content = '\n'.join(_strip_ts(l) for l in raw.splitlines())
        steps.append({'step_name': job_name, 'content': content})

    return steps


_HEADERS = {
    "Accept": "application/vnd.github.v3+json",
    "X-GitHub-Api-Version": "2022-11-28",
}

# Param keys that don't map to simple .upper() of their schema name
_PARAM_KEY_REMAP = {
    'raw_path':                       'RAW',
    'window_strategy':                'STRATEGY',
    'imbalance_max_majority_samples': 'IMBALANCE_MAX_MAJ',
}


def _normalize_params(params: dict) -> dict:
    return {_PARAM_KEY_REMAP.get(k, k.upper()): v for k, v in params.items()}


def _parse_ts(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def _auth_headers() -> dict:
    return {**_HEADERS, "Authorization": f"Bearer {settings.github_token}"}


def _log_curl(url: str, headers: dict, payload: dict) -> None:
    token = headers.get("Authorization", "")
    masked = token.replace(settings.github_token, "***") if settings.github_token else token
    header_flags = " \\\n  ".join(
        f'-H "{k}: {masked if k == "Authorization" else v}"'
        for k, v in headers.items()
    )
    body = json.dumps(payload, ensure_ascii=False, indent=2)
    print(f"\n[dispatch] curl -X POST '{url}' \\\n  {header_flags} \\\n  -d '{body}'\n")


async def _find_run_after(repo: str, created_after: str) -> str | None:
    if not settings.github_token:
        return None
    try:
        ca_dt = _parse_ts(created_after)
    except ValueError:
        return None
    runs_url = f"https://api.github.com/repos/{repo}/actions/runs"
    params = {"event": "repository_dispatch", "per_page": "10"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(runs_url, headers=_auth_headers(), params=params)
        if resp.status_code != 200:
            return None
        for run in resp.json().get("workflow_runs", []):
            run_ts = run.get("created_at", "")
            if not run_ts:
                continue
            try:
                if _parse_ts(run_ts) >= ca_dt:
                    return str(run["id"])
            except ValueError:
                continue
    except Exception:
        pass
    return None


async def dispatch_phase(
    repo: str,
    fase: str,
    variant: str,
    parent: str | None,
    params: dict,
    runner_json: str | None = None,
    branch: str | None = None,
) -> str | None:
    """Dispatch a workflow to the given repo and return the GH run_id if found."""
    dispatch_url = f"https://api.github.com/repos/{repo}/dispatches"
    payload = {
        "event_type": "ejecutar-fase-api",
        "client_payload": {
            "fase": fase,
            "variant_id": variant,
            **({"parent_variant": parent} if parent else {}),
            "params": _normalize_params(params),
            **({"runner": json.loads(runner_json)} if runner_json else {}),
            **({"checkout_branch": branch} if branch else {}),
        },
    }
    headers = _auth_headers()
    _log_curl(dispatch_url, headers, payload)
    dispatch_ts = datetime.now(timezone.utc).isoformat()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(dispatch_url, json=payload, headers=headers)
        resp.raise_for_status()

    for delay in (3, 5, 8, 12):
        await asyncio.sleep(delay)
        run_id = await _find_run_after(repo, dispatch_ts)
        if run_id:
            return run_id
    return None


async def fetch_run_status(repo: str, gh_run_id: str) -> dict | None:
    if not settings.github_token:
        return None
    run_url = f"https://api.github.com/repos/{repo}/actions/runs/{gh_run_id}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(run_url, headers=_auth_headers())
        if resp.status_code != 200:
            return None
        data = resp.json()
        return {"status": data.get("status"), "conclusion": data.get("conclusion")}
    except Exception:
        return None


async def cancel_run(repo: str, gh_run_id: str) -> bool:
    """Cancel a GitHub Actions run. Returns True if accepted."""
    if not settings.github_token:
        return False
    url = f"https://api.github.com/repos/{repo}/actions/runs/{gh_run_id}/cancel"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, headers=_auth_headers())
        return resp.status_code in (202, 204)
    except Exception:
        return False


async def fetch_run_logs(repo: str, gh_run_id: str) -> list[dict]:
    """Return logs for each job of a GH run."""
    if not settings.github_token:
        return []
    jobs_url = f"https://api.github.com/repos/{repo}/actions/runs/{gh_run_id}/jobs"
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(jobs_url, headers=_auth_headers())
        if resp.status_code != 200:
            return []
        jobs = resp.json().get("jobs", [])
        results = []
        for job in jobs:
            log_url = f"https://api.github.com/repos/{repo}/actions/jobs/{job['id']}/logs"
            log_resp = await client.get(log_url, headers=_auth_headers())
            if log_resp.status_code == 200:
                results.extend(_parse_job_to_steps(job["name"], log_resp.text[:200_000]))
    return results

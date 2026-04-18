import httpx
from app.core.config import settings

_DISPATCH_URL = f"https://api.github.com/repos/{settings.github_repo}/dispatches"
_HEADERS = {
    "Accept": "application/vnd.github.v3+json",
    "X-GitHub-Api-Version": "2022-11-28",
}


async def dispatch_phase(fase: str, variant: str, parent: str | None, params: dict) -> None:
    payload = {
        "event_type": "ejecutar-fase-api",
        "client_payload": {
            "fase": fase,
            "variant_id": variant,
            **({"parent_variant": parent} if parent else {}),
            "params": params,
        },
    }
    headers = {**_HEADERS, "Authorization": f"Bearer {settings.github_token}"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(_DISPATCH_URL, json=payload, headers=headers)
        resp.raise_for_status()

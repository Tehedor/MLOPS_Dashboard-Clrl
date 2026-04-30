from fastapi import APIRouter

from app.core.config import settings

router = APIRouter()


@router.get("")
def get_config():
    return {
        "supabase_url": settings.supabase_url,
        "supabase_anon_key": settings.supabase_publishable_key,
    }

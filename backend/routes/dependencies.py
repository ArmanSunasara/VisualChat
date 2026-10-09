import jwt
from fastapi import HTTPException, Request


def require_database(request: Request):
    if getattr(request.app.state, "database_error", None):
        raise HTTPException(503, "Database unavailable: " + request.app.state.database_error)


def get_current_user(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    user_id = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        try:
            payload = jwt.decode(token, options={"verify_signature": False})
            user_id = payload.get("sub")
        except Exception:
            pass

    if not user_id:
        user_id = request.headers.get("X-User-Id")

    if not user_id:
        raise HTTPException(401, "Authentication required. Please sign in.")
    return user_id


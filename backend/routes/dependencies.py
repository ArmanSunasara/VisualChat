from fastapi import HTTPException, Request


def require_database(request: Request):
    if getattr(request.app.state, "database_error", None):
        raise HTTPException(503, "Database unavailable: " + request.app.state.database_error)

from fastapi import APIRouter, HTTPException, status

from db.setup import SessionDep

from .schema import ImportRequest, ImportResult
from .service import MAX_PER_DAY, ImportFileError, execute_plan, normalize, plan_import

router = APIRouter(prefix="/import", tags=["import"])


@router.post("/notes", response_model=ImportResult)
def import_notes(body: ImportRequest, session: SessionDep):
    """Imports notes (and the decks/tags they name) from a parsed JSON file.

    `dry_run` returns exactly what a real import would do without writing
    anything. Errors are plain-string 400s so the UI can show them as-is.
    """
    if not 0 <= body.per_day <= MAX_PER_DAY:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"New notes per day must be 0-{MAX_PER_DAY}."
        )
    if abs(body.tz_offset_minutes) > 24 * 60:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid timezone offset.")

    try:
        rows, issues, rates = normalize(body.payload)
    except ImportFileError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(error)) from error

    plan = plan_import(
        session,
        rows,
        issues,
        rates,
        per_day=body.per_day,
        default_deck=body.default_deck,
        tz_offset_minutes=body.tz_offset_minutes,
        dry_run=body.dry_run,
    )
    if not body.dry_run and plan.kept:
        execute_plan(session, plan)
    return plan.result

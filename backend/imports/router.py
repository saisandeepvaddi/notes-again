import json

from fastapi import APIRouter, HTTPException, Response, status

from db.models import utcnow
from db.setup import SessionDep

from .export import build_export, count_export
from .schema import ExportCount, ExportRequest, ImportRequest, ImportResult
from .service import MAX_PER_DAY, ImportFileError, execute_plan, normalize, plan_import

router = APIRouter(prefix="/import", tags=["import"])
export_router = APIRouter(prefix="/export", tags=["export"])


@router.post("/notes", response_model=ImportResult)
def import_notes(body: ImportRequest, session: SessionDep):
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
        paused=body.paused,
    )
    if not body.dry_run and plan.kept:
        execute_plan(session, plan)
    return plan.result


@export_router.post("/notes")
def export_notes(body: ExportRequest, session: SessionDep):
    filename = f"note-and-learn-{utcnow():%Y-%m-%d}.json"
    return Response(
        content=json.dumps(build_export(session, body), ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@export_router.post("/count", response_model=ExportCount)
def count_notes_to_export(body: ExportRequest, session: SessionDep):
    return count_export(session, body)

# -*- coding: utf-8 -*-
"""日程 HTTP 路由。

响应壳与其他约定照 qa-workbench：成功 {"ok":true,"data":...}，
失败 {"ok":false,"error":"中文提示"}（异常由 errors.register 统一装壳）。
"""
from fastapi import APIRouter, Body, Path

from .. import db
from ..errors import bad_request, not_found, ok
from . import repo

router = APIRouter(prefix="/api", tags=["schedule"])


@router.get("/health")
def health():
    info = db.ping()
    return ok({"db": True, **info})


@router.get("/schedules")
def list_schedules():
    return ok({"schedules": repo.list_all(), "skipped": 0})


@router.post("/schedules")
def create_schedule(payload: dict = Body(...)):
    cleaned = _require_one(payload)
    return ok(repo.insert(cleaned))


@router.put("/schedules/{sid}")
def update_schedule(payload: dict = Body(...), sid: int = Path(..., ge=1)):
    cleaned = _require_one(payload)
    updated = repo.update(sid, cleaned)
    if updated is None:
        raise not_found("日程不存在")
    return ok(updated)


@router.delete("/schedules/{sid}")
def delete_schedule(sid: int = Path(..., ge=1)):
    # 删不存在不报错：前端 removeSchedule 会先查内存，这里只是兜底
    return ok({"deleted": repo.delete(sid)})


@router.put("/schedules")
def replace_schedules(payload: dict = Body(...)):
    items = _require_list(payload)
    imported, skipped, schedules = repo.replace_all(items)
    return ok({"imported": imported, "skipped": skipped, "schedules": schedules})


@router.post("/schedules/bulk")
def bulk_insert_schedules(payload: dict = Body(...)):
    items = _require_list(payload)
    imported, skipped, schedules = repo.bulk_insert(items)
    return ok({"imported": imported, "skipped": skipped, "schedules": schedules})


def _require_one(payload) -> dict:
    from . import mapper

    cleaned = mapper.clean_schedule(payload)
    if cleaned is None:
        raise bad_request("日程数据不合法：需要非空标题、起始日不晚于结束日、日期在 1900~2200 之间")
    cleaned.pop("id", None)  # id 由路径或数据库决定，请求体里的 id 不采纳
    return cleaned


def _require_list(payload) -> list:
    if not isinstance(payload, dict) or not isinstance(payload.get("schedules"), list):
        raise bad_request("请求体缺少 schedules 数组")
    return payload["schedules"]

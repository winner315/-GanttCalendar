# -*- coding: utf-8 -*-
"""日程数据访问层 —— 只有 SQL，不含任何 HTTP 概念。

所有语句参数化；排序一律交给 SQL 的 ORDER BY start_date, end_date，
不在后端做内存排序（后端不持有缓存）。
"""
from .. import db
from . import mapper

_SELECT = "SELECT id, title, start_date, end_date, color, status, note FROM `schedule`"
_ORDER = " ORDER BY start_date ASC, end_date ASC, id ASC"
_INSERT = (
    "INSERT INTO `schedule` (title, start_date, end_date, color, status, note)"
    " VALUES (%s, %s, %s, %s, %s, %s)"
)
_UPDATE = (
    "UPDATE `schedule` SET title=%s, start_date=%s, end_date=%s, color=%s, status=%s, note=%s WHERE id=%s"
)

# 对外字段清单，避免各处手写 {...} 时漏掉新字段
_FIELDS = ("title", "startDay", "endDay", "color", "status", "note")


def _rows_to_schedules(rows) -> list:
    out = []
    for row in rows:
        out.append(mapper.row_to_schedule(row))
    return out


def list_all() -> list:
    with db.cursor() as cur:
        cur.execute(_SELECT + _ORDER)
        return _rows_to_schedules(cur.fetchall())


def get_by_id(sid: int):
    with db.cursor() as cur:
        cur.execute(_SELECT + " WHERE id=%s", (sid,))
        row = cur.fetchone()
    return mapper.row_to_schedule(row) if row else None


def insert(schedule: dict) -> dict:
    with db.cursor() as cur:
        cur.execute(_INSERT, mapper.schedule_to_params(schedule))
        new_id = cur.lastrowid
    return {"id": int(new_id), **{k: schedule[k] for k in _FIELDS}}


def update(sid: int, schedule: dict):
    """按 id 覆盖。返回更新后的对象；id 不存在返回 None。"""
    with db.cursor() as cur:
        cur.execute(_UPDATE, (*mapper.schedule_to_params(schedule), sid))
        if cur.rowcount == 0:
            return None
    return {"id": sid, **{k: schedule[k] for k in _FIELDS}}


def delete(sid: int) -> bool:
    """删除。删不存在的 id 返回 False，不报错（前端 removeSchedule 期望这个语义）。"""
    with db.cursor() as cur:
        cur.execute("DELETE FROM `schedule` WHERE id=%s", (sid,))
        return cur.rowcount > 0


def replace_all(items: list) -> tuple:
    """清空后整批写入，全程一条连接一个事务。

    这是唯一能造成不可逆数据损失的接口：若 delete 与 insert 不在同一事务里，
    中途失败会留下"库已清空、新数据只写一半"的状态且无法回滚。
    返回 (写入条数, 跳过条数, 提交后的全量列表)。
    """
    valid, skipped = mapper.clean_all(items)
    with db.transaction() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM `schedule`")
            for item in valid:
                cur.execute(_INSERT, mapper.schedule_to_params(item))
            # 同一连接上读出真实状态（含新的自增 id），前端不必猜 id
            cur.execute(_SELECT + _ORDER)
            rows = cur.fetchall()
    return len(valid), skipped, _rows_to_schedules(rows)


def bulk_insert(items: list) -> tuple:
    """只追加，不清空。去重是前端的业务规则，这里不做。

    返回 (写入条数, 跳过条数, 新建的行)。
    """
    valid, skipped = mapper.clean_all(items)
    created = []
    if not valid:
        return 0, skipped, created
    with db.transaction() as conn:
        with conn.cursor() as cur:
            for item in valid:
                cur.execute(_INSERT, mapper.schedule_to_params(item))
                created.append({"id": int(cur.lastrowid), **item})
    return len(created), skipped, created

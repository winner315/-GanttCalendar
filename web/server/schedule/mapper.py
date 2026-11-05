# -*- coding: utf-8 -*-
"""DB 行 ↔ API 对象 的唯一映射点，兼做校验。

纪律（改代码时别破坏）：
  - DB 列用蛇形 start_date / end_date（天数序号）
  - API 与前端用驼峰 startDay / endDay
  - **映射只在本文件里发生**。别的后端文件出现 startDay/endDay 字符串就是漏了映射。

校验口径与前端 web/src/utils/schedule.js 的 sanitizeSchedule 保持一致：
不合法的条目跳过并计数，而不是让整批导入失败。
"""
from datetime import date

# 调色板大小，与前端 COLOR_COUNT、Android 版 ScheduleAdapter.COLOR_RES 一致
COLOR_COUNT = 8

# 天数序号的合理范围：1900-01-01 ~ 2200-01-01，超出基本可判定为脏数据
MIN_DAY = (date(1900, 1, 1) - date(1970, 1, 1)).days        # -25567
MAX_DAY = (date(2200, 1, 1) - date(1970, 1, 1)).days        # 84006

# 与 ScheduleDialog.vue 的 :maxlength="60"、DDL 的 VARCHAR(60) 对齐
TITLE_MAX = 60

# 任务状态四态。前端已提供四态选择（编辑框）并按状态筛选；
# 取值收敛在 `status` / `STATUS_LABELS` 里，以后要加取值只改这两处 + DDL 注释。
STATUS_TODO = "todo"
STATUS_DOING = "doing"
STATUS_DONE = "done"
STATUS_PAUSED = "paused"
STATUSES = (STATUS_TODO, STATUS_DOING, STATUS_DONE, STATUS_PAUSED)
STATUS_LABELS = {
    STATUS_TODO: "待办",
    STATUS_DOING: "进行中",
    STATUS_DONE: "已完成",
    STATUS_PAUSED: "已暂停",
}


# 与 ScheduleDialog.vue 的 :maxlength="500"、DDL 的 VARCHAR(500) 对齐
NOTE_MAX = 500


def clean_status(value) -> str:
    """非法/缺失一律归 'todo'，不判脏 —— 状态是附加信息，不该让整条日程丢掉。"""
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in STATUSES:
            return lowered
    return STATUS_TODO


def clean_note(value) -> str:
    """备注是选填文本：非字符串一律归空串，字符串截断到 NOTE_MAX。

    截断而不是判脏：一条超长备注不该让整批导入的其余条一起失败（同 title 的处理口径）。
    """
    if isinstance(value, str):
        return value.strip()[:NOTE_MAX]
    return ""

# 必填字段缺失 → 抛错（这是请求体本身不合法，不是某一条数据脏）
FIELDS = ("title", "startDay", "endDay", "color")


def is_int_day(value) -> bool:
    # bool 是 int 的子类，这里要挡掉 True/False
    if isinstance(value, bool) or not isinstance(value, int):
        return False
    return MIN_DAY <= value <= MAX_DAY


def row_to_schedule(row: dict) -> dict:
    """DB 行 → API 对象。

    id 的整数防线很重要：前端 store 里有 `typeof id === 'number'` 守卫，
    一旦主键变成字符串，改和删会被**静默跳过**（表现为"改完刷新就回去了"）。
    所以这里宁可显式抛错，也不要让类型漂移悄悄发生。
    """
    raw_id = row["id"]
    try:
        sid = int(raw_id)
    except (TypeError, ValueError):
        raise ValueError(f"主键不是整数：{raw_id!r}（DDL 应用 INT，不要改成 BIGINT）")
    if sid <= 0:
        raise ValueError(f"主键必须为正整数：{raw_id!r}")
    return {
        "id": sid,
        "title": row["title"],
        "startDay": int(row["start_date"]),
        "endDay": int(row["end_date"]),
        "color": int(row["color"]),
        "status": clean_status(row.get("status")),
        "note": clean_note(row.get("note")),
    }


def schedule_to_params(schedule: dict) -> tuple:
    """API 对象 → INSERT/UPDATE 的参数元组（不含 id）。"""
    return (
        schedule["title"],
        schedule["startDay"],
        schedule["endDay"],
        schedule["color"],
        schedule["status"],
        schedule["note"],
    )


def clean_schedule(raw) -> dict | None:
    """规范化一条日程；不合法返回 None，由调用方跳过并计数。"""
    if not isinstance(raw, dict):
        return None

    title = raw.get("title")
    if not isinstance(title, str):
        return None
    title = title.strip()
    if not title:
        return None
    # 截断而不是判脏：前端输入框限 60，但旧 IndexedDB 数据没有长度上限，
    # 一条超长标题不该让整批导入的其余 N 条一起失败。
    title = title[:TITLE_MAX]

    start = raw.get("startDay")
    end = raw.get("endDay")
    if not is_int_day(start) or not is_int_day(end):
        return None
    if end < start:
        return None

    color = raw.get("color")
    if isinstance(color, bool) or not isinstance(color, int):
        color = 0
    color = min(max(color, 0), COLOR_COUNT - 1)

    out = {
        "title": title,
        "startDay": start,
        "endDay": end,
        "color": color,
        "status": clean_status(raw.get("status")),
        "note": clean_note(raw.get("note")),
    }
    rid = raw.get("id")
    if isinstance(rid, int) and not isinstance(rid, bool) and rid > 0:
        out["id"] = rid
    return out


def clean_all(items) -> tuple:
    """批量规范化。返回 (合法列表, 跳过条数)。"""
    if not isinstance(items, list):
        return [], 0
    valid, skipped = [], 0
    for raw in items:
        cleaned = clean_schedule(raw)
        if cleaned is None:
            skipped += 1
        else:
            valid.append(cleaned)
    return valid, skipped

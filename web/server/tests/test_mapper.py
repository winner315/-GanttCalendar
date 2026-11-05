# -*- coding: utf-8 -*-
"""mapper 单测 —— 不需要数据库，永远跑。"""
import pytest

from server.schedule import mapper


def test_往返映射字段不丢():
    row = {"id": 7, "title": "版本迭代", "start_date": 20731, "end_date": 20735, "color": 2, "status": "doing", "note": "迭代说明"}
    s = mapper.row_to_schedule(row)
    assert s == {
        "id": 7, "title": "版本迭代", "startDay": 20731, "endDay": 20735,
        "color": 2, "status": "doing", "note": "迭代说明",
    }
    # 回写参数元组顺序必须与 _INSERT/_UPDATE 的占位符一致（含 note）
    assert mapper.schedule_to_params(s) == ("版本迭代", 20731, 20735, 2, "doing", "迭代说明")


def test_备注缺失或非字符串归空串():
    assert mapper.clean_note(None) == ""
    assert mapper.clean_note(3) == ""
    assert mapper.clean_note("  备注  ") == "备注"
    # row 里没有 note 键也不报错
    row = {"id": 1, "title": "x", "start_date": 1, "end_date": 1, "color": 0, "status": "todo"}
    assert mapper.row_to_schedule(row)["note"] == ""


def test_备注超长截断而不是判脏():
    long_note = "备" * 2000
    got = mapper.clean_schedule({"title": "a", "startDay": 1, "endDay": 1, "color": 0, "note": long_note})
    assert got is not None, "超长备注应被截断保留，而不是整条丢掉"
    assert len(got["note"]) == mapper.NOTE_MAX == 500


def test_状态非法或缺失一律归待办():
    assert mapper.clean_status("doing") == "doing"
    assert mapper.clean_status("  DONE  ") == "done", "大小写与空白应被容错"
    assert mapper.clean_status("canceled") == "todo", "未定义的取值归待办，不判脏"
    assert mapper.clean_status(None) == "todo"
    assert mapper.clean_status(3) == "todo"
    # 整条日程不能因为状态非法而丢掉
    got = mapper.clean_schedule({"title": "a", "startDay": 1, "endDay": 1, "color": 0, "status": "???"})
    assert got is not None and got["status"] == "todo"


def test_状态四态常量():
    assert mapper.STATUSES == ("todo", "doing", "done", "paused")
    assert mapper.STATUS_LABELS["paused"] == "已暂停"


def test_主键为字符串时显式报错而不是静默失效():
    row = {"id": "7", "title": "x", "start_date": 1, "end_date": 1, "color": 0}
    # 能转成整数就放行（PyMySQL 对 INT 返回 int，这里是兜底）
    assert mapper.row_to_schedule(row)["id"] == 7

    bad = {"id": "abc", "title": "x", "start_date": 1, "end_date": 1, "color": 0}
    with pytest.raises(ValueError):
        mapper.row_to_schedule(bad)


def test_主键非正数报错():
    for bad_id in (0, -1):
        with pytest.raises(ValueError):
            mapper.row_to_schedule(
                {"id": bad_id, "title": "x", "start_date": 1, "end_date": 1, "color": 0}
            )


def test_颜色被钳制到_0到7():
    assert mapper.clean_schedule({"title": "a", "startDay": 1, "endDay": 1, "color": 99})["color"] == 7
    assert mapper.clean_schedule({"title": "a", "startDay": 1, "endDay": 1, "color": -3})["color"] == 0
    # 第 0 号色是合法值，不能被当成"未设置"
    assert mapper.clean_schedule({"title": "a", "startDay": 1, "endDay": 1, "color": 0})["color"] == 0
    # 非整数（含 bool）一律归 0
    assert mapper.clean_schedule({"title": "a", "startDay": 1, "endDay": 1, "color": True})["color"] == 0
    assert mapper.clean_schedule({"title": "a", "startDay": 1, "endDay": 1})["color"] == 0


def test_标题去空白且超长截断而不是判脏():
    got = mapper.clean_schedule({"title": "  版本迭代  ", "startDay": 1, "endDay": 1, "color": 0})
    assert got["title"] == "版本迭代"

    long_title = "长" * 200
    got = mapper.clean_schedule({"title": long_title, "startDay": 1, "endDay": 1, "color": 0})
    assert got is not None, "超长标题应被截断保留，而不是整条丢掉"
    assert len(got["title"]) == mapper.TITLE_MAX == 60


def test_缺标题或标题全空白判脏():
    assert mapper.clean_schedule({"title": "", "startDay": 1, "endDay": 1, "color": 0}) is None
    assert mapper.clean_schedule({"title": "   ", "startDay": 1, "endDay": 1, "color": 0}) is None
    assert mapper.clean_schedule({"startDay": 1, "endDay": 1, "color": 0}) is None
    assert mapper.clean_schedule({"title": 123, "startDay": 1, "endDay": 1, "color": 0}) is None


def test_日期越界判脏():
    assert mapper.clean_schedule({"title": "a", "startDay": mapper.MIN_DAY, "endDay": mapper.MIN_DAY, "color": 0})
    assert mapper.clean_schedule({"title": "a", "startDay": mapper.MAX_DAY, "endDay": mapper.MAX_DAY, "color": 0})
    assert mapper.clean_schedule({"title": "a", "startDay": mapper.MIN_DAY - 1, "endDay": 0, "color": 0}) is None
    assert mapper.clean_schedule({"title": "a", "startDay": 0, "endDay": mapper.MAX_DAY + 1, "color": 0}) is None


def test_日期非整数判脏():
    for bad in (1.5, "20731", None, True):
        assert mapper.clean_schedule({"title": "a", "startDay": bad, "endDay": 20731, "color": 0}) is None


def test_结束早于开始判脏_同一天合法():
    assert mapper.clean_schedule({"title": "a", "startDay": 10, "endDay": 9, "color": 0}) is None
    got = mapper.clean_schedule({"title": "a", "startDay": 10, "endDay": 10, "color": 0})
    assert got is not None and got["startDay"] == got["endDay"] == 10


def test_合法正整数_id_才保留():
    got = mapper.clean_schedule({"id": 5, "title": "a", "startDay": 1, "endDay": 1, "color": 0})
    assert got["id"] == 5
    for bad in (0, -2, "5", 1.5, True, None):
        got = mapper.clean_schedule({"id": bad, "title": "a", "startDay": 1, "endDay": 1, "color": 0})
        assert "id" not in got, f"id={bad!r} 不该被保留"


def test_clean_all_跳过脏数据并计数():
    items = [
        {"title": "好", "startDay": 1, "endDay": 2, "color": 1},
        {"title": "", "startDay": 1, "endDay": 2, "color": 1},
        None,
        {"title": "也好", "startDay": 3, "endDay": 4, "color": 2},
        {"title": "倒着的", "startDay": 9, "endDay": 1, "color": 0},
    ]
    valid, skipped = mapper.clean_all(items)
    assert [v["title"] for v in valid] == ["好", "也好"]
    assert skipped == 3


def test_clean_all_非数组返回空而不是抛错():
    assert mapper.clean_all("not a list") == ([], 0)
    assert mapper.clean_all(None) == ([], 0)


def test_日期范围常量与前端一致():
    # 前端 utils/schedule.js 里写死的 MIN_DAY / MAX_DAY
    assert mapper.MIN_DAY == -25567
    assert mapper.MAX_DAY == 84006

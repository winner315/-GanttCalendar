# -*- coding: utf-8 -*-
"""接口集成测试 —— 需要一个测试库，否则整体跳过。

跑法：
    set GC_TEST_DB=gantt_calendar_e2e
    .venv\\Scripts\\python.exe -m pytest server/tests -q

没有测试库时这些用例 skip（不算失败），纯逻辑层照常跑。
"""
import os

import pytest
from fastapi.testclient import TestClient

TEST_DB = os.environ.get("GC_TEST_DB", "")

pytestmark = pytest.mark.skipif(
    not TEST_DB, reason="未设置 GC_TEST_DB，跳过需要数据库的集成测试"
)


@pytest.fixture(scope="module")
def client():
    # GC_TEST_DB 由 config.py 直接认作 DB_NAME（.env 的 override 盖不掉它），
    # 这里不再去改 os.environ —— 那是全局状态，改了会污染同进程里别的用例。
    from fastapi.testclient import TestClient

    from server import main as main_mod

    with TestClient(main_mod.app) as c:
        yield c


@pytest.fixture(autouse=True)
def clean_table(client, guard_test_db):
    """每个用例前清表。库名闸门见 conftest.py 的 guard_test_db（先于本夹具执行）。"""
    from server import db

    with db.cursor() as cur:
        cur.execute("DELETE FROM `schedule`")
        cur.execute("ALTER TABLE `schedule` AUTO_INCREMENT = 1")
    yield


def data(res):
    body = res.json()
    assert body.get("ok") is True, body
    return body["data"]


def test_健康检查(client):
    d = data(client.get("/api/health"))
    assert d["db"] is True
    assert d["database"] == TEST_DB


def test_空库返回空列表(client):
    d = data(client.get("/api/schedules"))
    assert d == {"schedules": [], "skipped": 0}


def test_增删改查往返(client):
    created = data(client.post("/api/schedules", json={
        "title": "版本迭代", "startDay": 20731, "endDay": 20735, "color": 2,
    }))
    assert created["id"] == 1 and isinstance(created["id"], int)
    assert created["startDay"] == 20731

    listed = data(client.get("/api/schedules"))["schedules"]
    assert len(listed) == 1 and listed[0]["title"] == "版本迭代"

    updated = data(client.put(f"/api/schedules/{created['id']}", json={
        "title": "版本迭代改", "startDay": 20740, "endDay": 20745, "color": 3,
    }))
    assert updated["id"] == created["id"] and updated["title"] == "版本迭代改"

    assert data(client.delete(f"/api/schedules/{created['id']}"))["deleted"] is True
    assert data(client.get("/api/schedules"))["schedules"] == []


def test_主键是整数而不是字符串(client):
    """前端 store 里有 typeof id === 'number' 守卫：返回字符串会让改/删静默失效。"""
    created = data(client.post("/api/schedules", json={
        "title": "a", "startDay": 1, "endDay": 1, "color": 0,
    }))
    assert isinstance(created["id"], int)
    listed = data(client.get("/api/schedules"))["schedules"]
    assert isinstance(listed[0]["id"], int)


def test_删除不存在的返回_false_而不是报错(client):
    res = client.delete("/api/schedules/9999")
    assert res.status_code == 200
    assert data(res)["deleted"] is False


def test_更新不存在的返回_404(client):
    res = client.put("/api/schedules/9999", json={
        "title": "a", "startDay": 1, "endDay": 1, "color": 0,
    })
    assert res.status_code == 404
    assert res.json()["ok"] is False
    assert "不存在" in res.json()["error"]


def test_校验失败的请求返回_400_且带中文提示(client):
    for bad in [
        {"title": "", "startDay": 1, "endDay": 1, "color": 0},
        {"title": "a", "startDay": 9, "endDay": 1, "color": 0},
        {"title": "a", "startDay": 1.5, "endDay": 1, "color": 0},
    ]:
        res = client.post("/api/schedules", json=bad)
        assert res.status_code == 400, bad
        assert res.json()["ok"] is False
        assert res.json()["error"]


def test_覆盖导入整批替换(client):
    client.post("/api/schedules", json={"title": "旧的", "startDay": 1, "endDay": 1, "color": 0})
    res = client.put("/api/schedules", json={"schedules": [
        {"title": "新一", "startDay": 10, "endDay": 12, "color": 1},
        {"title": "新二", "startDay": 20, "endDay": 22, "color": 2},
    ]})
    d = data(res)
    assert d["imported"] == 2 and d["skipped"] == 0
    titles = [s["title"] for s in d["schedules"]]
    assert titles == ["新一", "新二"], "响应里应带回提交后的全量，且已按起始日排序"
    assert "旧的" not in titles


def test_覆盖导入跳过脏数据但保留其余(client):
    d = data(client.put("/api/schedules", json={"schedules": [
        {"title": "好", "startDay": 1, "endDay": 2, "color": 1},
        {"title": "", "startDay": 1, "endDay": 2, "color": 1},
        None,
        {"title": "倒着", "startDay": 9, "endDay": 1, "color": 0},
    ]}))
    assert d["imported"] == 1 and d["skipped"] == 3


def test_合并导入只追加不清空(client):
    client.post("/api/schedules", json={"title": "已有", "startDay": 1, "endDay": 1, "color": 0})
    d = data(client.post("/api/schedules/bulk", json={"schedules": [
        {"title": "追加一", "startDay": 5, "endDay": 6, "color": 1},
        {"title": "追加二", "startDay": 7, "endDay": 8, "color": 2},
    ]}))
    assert d["imported"] == 2
    titles = [s["title"] for s in data(client.get("/api/schedules"))["schedules"]]
    assert set(titles) == {"已有", "追加一", "追加二"}


def test_合并导入空数组不报错(client):
    d = data(client.post("/api/schedules/bulk", json={"schedules": []}))
    assert d["imported"] == 0


def test_请求体缺_schedules_数组返回_400(client):
    for bad in [{}, {"schedules": "nope"}, [1, 2, 3]]:
        res = client.request("PUT", "/api/schedules", json=bad)
        assert res.status_code == 400, bad
        assert res.json()["ok"] is False


def test_超长标题被截断而不是整批失败(client):
    d = data(client.put("/api/schedules", json={"schedules": [
        {"title": "长" * 200, "startDay": 1, "endDay": 1, "color": 0},
        {"title": "正常", "startDay": 2, "endDay": 2, "color": 0},
    ]}))
    assert d["imported"] == 2
    # 按内容找，不按下标找：返回的全量表是按 start_date 排序的，
    # 用下标写死会把"顺序"当成契约，改一次排序就红（这里原先就写反了）
    long_one = next(s for s in d["schedules"] if s["title"].startswith("长"))
    short_one = next(s for s in d["schedules"] if s["title"] == "正常")
    assert len(long_one["title"]) == 60
    assert short_one["title"] == "正常"

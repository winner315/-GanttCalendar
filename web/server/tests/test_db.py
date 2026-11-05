# -*- coding: utf-8 -*-
"""db 事务工具测试 —— 需要测试库，否则跳过。

守的是全项目最危险的一条：批量覆盖导入若事务不生效，
中途失败会留下"库已清空、新数据只写一半"且无法回滚的状态。
"""
import os

import pytest

TEST_DB = os.environ.get("GC_TEST_DB", "")

pytestmark = pytest.mark.skipif(
    not TEST_DB, reason="未设置 GC_TEST_DB，跳过需要数据库的测试"
)


@pytest.fixture(autouse=True)
def use_test_db(monkeypatch, guard_test_db):
    # 库名闸门见 conftest.py；它先跑，确认连的确实是 *_e2e 库，才轮到下面的清表。
    # 只 monkeypatch config.DB_NAME 就够了 —— db.connect() 是调用时才读它；
    # 不去改 os.environ（那是全局状态，会污染同进程里别的模块）。
    from server import config

    monkeypatch.setattr(config, "DB_NAME", TEST_DB)
    from server import db

    with db.cursor() as cur:
        cur.execute("DELETE FROM `schedule`")
    yield


def rows():
    from server import db

    with db.cursor() as cur:
        cur.execute("SELECT title FROM `schedule` ORDER BY id")
        return [r["title"] for r in cur.fetchall()]


def test_事务提交后数据可见():
    from server import db

    with db.transaction() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO `schedule` (title, start_date, end_date, color) VALUES (%s, %s, %s, %s)",
                ("提交的", 1, 2, 0),
            )
    assert rows() == ["提交的"]


def test_事务中途抛错要整体回滚():
    from server import db

    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO `schedule` (title, start_date, end_date, color) VALUES (%s, %s, %s, %s)",
            ("旧数据", 1, 2, 0),
        )
    assert rows() == ["旧数据"]

    with pytest.raises(RuntimeError):
        with db.transaction() as conn:
            with conn.cursor() as cur:
                # 先清空（模拟覆盖导入的第一步）
                cur.execute("DELETE FROM `schedule`")
                cur.execute(
                    "INSERT INTO `schedule` (title, start_date, end_date, color) VALUES (%s, %s, %s, %s)",
                    ("写了一半", 3, 4, 0),
                )
                raise RuntimeError("模拟中途失败")

    assert rows() == ["旧数据"], "事务没回滚：旧数据被清掉了"


def test_事务里用同一条连接才能看到未提交的写入():
    from server import db

    with db.transaction() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO `schedule` (title, start_date, end_date, color) VALUES (%s, %s, %s, %s)",
                ("未提交", 5, 6, 0),
            )
            cur.execute("SELECT COUNT(*) AS n FROM `schedule`")
            assert cur.fetchone()["n"] == 1
    assert rows() == ["未提交"]


def test_ping_返回库名与版本():
    from server import db

    info = db.ping()
    assert info["database"] == TEST_DB
    assert info["version"].startswith("8.")


def test_连不上时抛出可识别错误():
    from server import config, db

    cfg = config.db_config()
    bad = dict(cfg, port=1)  # 一个必然没人监听的端口
    import pymysql

    with pytest.raises((pymysql.err.OperationalError, pymysql.err.InterfaceError)):
        pymysql.connect(**bad)

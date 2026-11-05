# -*- coding: utf-8 -*-
"""测试目录共用的夹具。

这里只有一件事：**库名闸门**。集成测试的第一件事就是 `DELETE FROM schedule`，
库名认错就是把真实排期整张删掉，没有第二道防线（tasks/lessons.md 第 12 条）。

闸门必须放在**所有会清表的模块共用的地方**，这是踩出来的：
原先只有 test_api.py 里有一道，于是我"验证闸门"时用真库名跑了一次 ——
test_api 确实拒绝了，但 test_db.py 里的清表照跑不误，把真实库清空了。
一道闸门只护一个模块，等于没护。
"""
import pytest


@pytest.fixture
def guard_test_db():
    """确认当前真的连在 *_e2e 测试库上，否则抛错。

    **任何清表动作之前**都要依赖它（在模块夹具的参数里写上 `guard_test_db`），
    夹具依赖关系会保证它先跑。
    """
    from server import db

    with db.cursor() as cur:
        cur.execute("SELECT DATABASE() AS db")
        actual = cur.fetchone()["db"]

    if not (actual or "").endswith("_e2e"):
        raise RuntimeError(
            f"拒绝执行：集成测试连到了 {actual!r}，不是 *_e2e 测试库。"
            "这些用例会 DELETE 整张 schedule 表，请检查 GC_TEST_DB 与 .env 的 DB_NAME。"
        )
    return actual

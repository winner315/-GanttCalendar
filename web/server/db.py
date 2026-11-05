# -*- coding: utf-8 -*-
"""MySQL 连接与事务工具（PyMySQL，同步）。

单用户本机使用，不做连接池：每次请求开一条连接、用完即关。
好处是事务天然只用一条连接 —— 连接池最阴险的坑就是
"begin 与 commit 之间误用了另一条连接"，事务会静默失效（既不报错也不回滚）。

所有 SQL 一律走 cursor.execute(sql, params) 参数化，不做字符串拼接。
"""
from contextlib import contextmanager

import pymysql
from pymysql.cursors import DictCursor

from . import config

# 连接层错误 → 统一由上层转成 503「数据库连接失败」。这些都是"连不上/连断了"，
# 不是"语句写错了"，所以要和 SQL 语法错误区分开。
CONNECT_ERRORS = (
    pymysql.err.OperationalError,
    pymysql.err.InterfaceError,
)


def connect(database: str = None, autocommit: bool = False, use_default_db: bool = True):
    """开一条连接。注意：createPool 式的惰性连接在这里不存在，调用即真的去连。

    use_default_db=False 时**不指定库**（连到 MySQL 但不 USE 任何 schema）。
    建库（CREATE DATABASE）必须这样连：目标库还不存在，
    指定它就等于拿一个不存在的库去连，直接 1049。
    """
    cfg = config.db_config(database, use_default=use_default_db)
    return pymysql.connect(cursorclass=DictCursor, autocommit=autocommit, **cfg)


@contextmanager
def cursor(database: str = None):
    """只读/单条写操作：用完提交并关闭。"""
    conn = connect(database)
    try:
        with conn.cursor() as cur:
            yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@contextmanager
def transaction(database: str = None):
    """事务：yield 一条连接，让调用方在同一连接上完成 delete + insert。

    这是批量覆盖导入的关键 —— 中途失败必须整体回滚，
    否则会出现"库已清空、新数据只写一半"的不可逆损失。
    """
    conn = connect(database)
    try:
        conn.begin()
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def ping(database: str = None) -> dict:
    """连通性检查，返回 {database, version}；连不上直接抛。"""
    conn = connect(database)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DATABASE() AS db, VERSION() AS ver")
            row = cur.fetchone()
        return {"database": row["db"] or (database or config.DB_NAME), "version": row["ver"]}
    finally:
        conn.close()

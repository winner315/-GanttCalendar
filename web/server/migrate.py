# -*- coding: utf-8 -*-
"""建库（可选）+ 建表。读 sql/schema.sql 并在目标库执行（幂等，可重复跑）。

用法：
    python -m server.migrate                      # 用 .env 里的 DB_NAME
    python -m server.migrate --db gantt_calendar_e2e   # 指定库（e2e 用）
    python -m server.migrate --create-db          # 库不存在就先建

为什么要有 --create-db：MySQL 的 CREATE DATABASE 得先用一个不带库的连接执行，
而密码只存在 .env 里。交给这个脚本做，密码就不必写进命令行、也不必手敲 mysql.exe。
"""
import argparse
import re
import sys
from pathlib import Path

from . import config, db

# Windows 控制台 / 被 e2e 管道接走时默认编码可能是 GBK，会让中文提示变乱码
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

SCHEMA = Path(__file__).resolve().parent.parent / "sql" / "schema.sql"


def split_statements(sql: str):
    """按分号切语句，剔除纯注释行 —— 够用即可，不引 SQL 解析器。"""
    lines = []
    for raw in sql.splitlines():
        if raw.strip().startswith("--"):
            continue
        lines.append(raw)
    text = "\n".join(lines)
    return [s.strip() for s in text.split(";") if s.strip()]


def create_database(database: str) -> bool:
    """建库（已存在则跳过）。库名不能参数化，只能白名单式校验后拼接。"""
    if not re.fullmatch(r"[A-Za-z0-9_]+", database):
        print(f"[失败] 库名 {database!r} 只允许字母数字下划线 —— 库名进 SQL 不能参数化，")
        print("       只能这样白名单校验后再拼接。请改用字母数字下划线的库名。")
        return False
    # 连到 MySQL 但不指定库 —— CREATE DATABASE 必须在库外执行
    conn = db.connect(use_default_db=False)
    try:
        with conn.cursor() as cur:
            cur.execute("SHOW DATABASES LIKE %s", (database,))
            if cur.fetchone():
                print(f"[跳过] 库 {database} 已存在")
            else:
                cur.execute(
                    f"CREATE DATABASE `{database}`"
                    " CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
                )
                print(f"[完成] 已创建库 {database}")
    finally:
        conn.close()
    return True


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="在目标库建 schedule 表")
    parser.add_argument("--db", default=None, help="覆盖 .env 的 DB_NAME")
    parser.add_argument("--create-db", action="store_true", help="库不存在就先建")
    args = parser.parse_args(argv)

    config.require_config()
    database = args.db or config.DB_NAME
    statements = split_statements(SCHEMA.read_text(encoding="utf-8"))

    if args.create_db:
        try:
            if not create_database(database):
                return 1
        except Exception as exc:
            print(f"[失败] 建库 {database} 时连不上 MySQL：{exc}")
            print("       密码从 .env 读；检查 DB_HOST/DB_PORT/DB_USER/DB_PASSWORD 与 MySQL 是否在跑。")
            return 1

    try:
        conn = db.connect(database)
    except Exception as exc:
        print(f"[失败] 连不上数据库 {database}：{exc}")
        print("       检查 .env 的 DB_HOST/DB_PORT/DB_USER/DB_PASSWORD，以及 MySQL 服务是否在跑。")
        print("       库还不存在的话，加 --create-db 让它先建库。")
        return 1
    try:
        with conn.cursor() as cur:
            for stmt in statements:
                cur.execute(stmt)
        conn.commit()
        with conn.cursor() as cur:
            cur.execute("SHOW TABLES LIKE 'schedule'")
            exists = cur.fetchone() is not None
    finally:
        conn.close()

    print(f"[完成] 库 {database}：schedule 表{'已就绪' if exists else '未创建（请检查 schema.sql）'}")
    return 0 if exists else 1


if __name__ == "__main__":
    sys.exit(main())

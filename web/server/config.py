# -*- coding: utf-8 -*-
"""后端配置：从 web/.env 读取 MySQL 连接信息。

沿用 qa-workbench 的 `load_dotenv(override=True)` 约定 —— .env 优先生效，
避免新机器上残留的同名环境变量把配置盖掉。
"""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

WEB_DIR = Path(__file__).resolve().parent.parent

# .env 与 .env.e2e 都在 web/ 下；e2e 通过 GC_ENV_FILE 指定后者
_ENV_FILE = os.environ.get("GC_ENV_FILE", str(WEB_DIR / ".env"))
load_dotenv(_ENV_FILE, override=True)
if _ENV_FILE != str(WEB_DIR / ".env"):
    # 先把 e2e 的值写进 os.environ，再让默认 .env 兜住没写到的项
    load_dotenv(str(WEB_DIR / ".env"), override=False)


def _bool_env(name: str, default: str = "0") -> bool:
    return os.environ.get(name, default).strip() in ("1", "true", "True", "yes", "on")


def _int_env(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        print(f"[配置错误] {name} 不是整数：{raw!r}")
        sys.exit(1)


DB_HOST = os.environ.get("DB_HOST", "").strip()
DB_PORT = _int_env("DB_PORT", 3306)
DB_USER = os.environ.get("DB_USER", "").strip()
# 密码允许为空（本机常见）：空串是"空密码"，不等于"未配置"
DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
# GC_TEST_DB 是集成测试的**显式覆盖**，必须排在前面：
# 上面的 load_dotenv(override=True) 会拿 .env 里的 DB_NAME 盖掉环境变量，
# 只认 DB_NAME 的话，`GC_TEST_DB=gantt_calendar_e2e pytest` 会连到**真实库**上，
# 而集成测试的第一件事就是 DELETE 整张表 —— 那是能清掉真实排期的事故（实测踩过）。
DB_NAME = (os.environ.get("GC_TEST_DB") or os.environ.get("DB_NAME", "")).strip()
DB_SSL = _bool_env("DB_SSL")

API_PORT = _int_env("API_PORT", 8010)

REQUIRED = {"DB_HOST": DB_HOST, "DB_USER": DB_USER, "DB_NAME": DB_NAME}


def missing_required() -> list:
    """返回缺失的必填项名（密码不在此列）。"""
    return [name for name, value in REQUIRED.items() if not value]


def db_config(database: str = None, use_default: bool = True) -> dict:
    """连接参数字典。

    database 显式传入时覆盖 DB_NAME（migrate 建测试库时用）。
    use_default=False 时**不带 database 键** —— 建库时要先连到 MySQL 而不指定库，
    否则会拿一个还不存在的库名去连，直接 1049 Unknown database。
    """
    cfg = {
        "host": DB_HOST,
        "port": DB_PORT,
        "user": DB_USER,
        "password": DB_PASSWORD,
        "charset": "utf8mb4",
    }
    target = database if database is not None else (DB_NAME if use_default else None)
    if target:
        cfg["database"] = target
    # 注：autocommit 不在返回值里 —— 它由 db.connect() 显式传给驱动，
    # 放在这里会和那里的关键字参数撞成 TypeError。
    if DB_SSL:
        cfg["ssl"] = {"ssl": {}}
    return cfg


def require_config() -> None:
    """启动前校验；缺必填项就打印中文指引并退出。"""
    missing = missing_required()
    if missing:
        print("=" * 52)
        print("[配置错误] 未找到数据库配置：" + "、".join(missing))
        print()
        print(f"  请复制 {WEB_DIR / '.env.example'}")
        print(f"       为 {WEB_DIR / '.env'}")
        print("  填写 DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME 后重试。")
        print("=" * 52)
        sys.exit(1)

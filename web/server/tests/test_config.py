# -*- coding: utf-8 -*-
"""config 单测 —— 不需要数据库，永远跑。"""
import pytest

from server import config


def test_密码可以为空():
    """本机 MySQL 常见空密码：空串是"空密码"，不能被当成"未配置"。"""
    monkey = pytest.MonkeyPatch()
    monkey.setattr(config, "REQUIRED", {"DB_HOST": "127.0.0.1", "DB_USER": "root", "DB_NAME": "db"})
    assert config.missing_required() == []
    monkey.undo()


def test_缺必填项会被列出来():
    monkey = pytest.MonkeyPatch()
    monkey.setattr(config, "REQUIRED", {"DB_HOST": "127.0.0.1", "DB_USER": "", "DB_NAME": ""})
    assert config.missing_required() == ["DB_USER", "DB_NAME"]
    monkey.undo()


def test_require_config_缺项时退出并给中文指引(capsys):
    monkey = pytest.MonkeyPatch()
    monkey.setattr(config, "REQUIRED", {"DB_HOST": "", "DB_USER": "root", "DB_NAME": "db"})
    with pytest.raises(SystemExit) as exc:
        config.require_config()
    assert exc.value.code == 1
    out = capsys.readouterr().out
    assert "配置错误" in out
    assert ".env.example" in out
    monkey.undo()


def test_require_config_齐全时不退出():
    monkey = pytest.MonkeyPatch()
    monkey.setattr(config, "REQUIRED", {"DB_HOST": "127.0.0.1", "DB_USER": "root", "DB_NAME": "db"})
    config.require_config()  # 不应抛
    monkey.undo()


def test_db_config_结构正确():
    cfg = config.db_config()
    assert set(["host", "port", "user", "password", "database", "charset"]).issubset(cfg.keys())
    assert cfg["charset"] == "utf8mb4"


def test_db_config_显式库名覆盖默认():
    cfg = config.db_config("gantt_calendar_e2e")
    assert cfg["database"] == "gantt_calendar_e2e"


def test_默认端口():
    assert config.db_config()["port"] == config.DB_PORT
    assert isinstance(config.API_PORT, int)

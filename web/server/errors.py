# -*- coding: utf-8 -*-
"""统一错误处理：响应壳 {ok:false, error:"中文提示"}，与 qa-workbench 一致。

前端只认 error 里的中文文案，所以这里必须把驱动的英文报错包成
"能直接给用户看"的一句话，同时把原文放进 detail 便于排查。

注意 Starlette 的 add_exception_handler 只接受**单个异常类**（给元组会在
建中间件栈时炸 `issubclass() arg 1 must be a class`），所以下面逐个注册。
"""
import pymysql
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .db import CONNECT_ERRORS


class ApiError(Exception):
    """业务错误：带 HTTP 状态码与中文提示。"""

    def __init__(self, status_code: int, message: str, detail: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.detail = detail


def bad_request(message: str) -> ApiError:
    return ApiError(400, message)


def not_found(message: str) -> ApiError:
    return ApiError(404, message)


# 驱动错误码 → 中文说明。只覆盖本机使用最容易撞到的几种。
_DRIVER_HINTS = {
    1045: "账号或密码不对",
    1049: "数据库不存在",
    2003: "MySQL 服务没有启动，或端口不对",
    2005: "主机名解析失败",
    2006: "MySQL 连接已断开",
}


def explain(exc: BaseException) -> str:
    """把驱动异常翻成一句中文；翻不出来就保留原文，绝不吞掉原因。"""
    code = None
    args = getattr(exc, "args", ())
    if args and isinstance(args[0], int):
        code = args[0]
    hint = _DRIVER_HINTS.get(code)
    raw = str(exc)
    return f"{hint}（{raw}）" if hint else raw


async def _api_error(request, exc: ApiError):
    payload = {"ok": False, "error": exc.message}
    if exc.detail:
        payload["detail"] = exc.detail
    return JSONResponse(payload, status_code=exc.status_code)


async def _connect_error(request, exc):
    # 连不上/连断了：这是"后端不可用"，前端要显示「后端未连接」
    return JSONResponse(
        {"ok": False, "error": f"数据库连接失败：{explain(exc)}"},
        status_code=503,
    )


async def _sql_error(request, exc):
    # 能连上但语句出错 —— 后端缺陷，给 500 并把原文带出来
    return JSONResponse(
        {"ok": False, "error": f"数据库操作失败：{explain(exc)}"},
        status_code=500,
    )


async def _validation_error(request, exc: RequestValidationError):
    """请求体不合法。

    FastAPI 默认给 422 + 一长串英文 detail，而本项目的接口契约是
    「校验失败 → 400 + 中文」，前端只认 error 里的中文 —— 所以这里统一改掉。
    """
    errors = exc.errors()
    first = errors[0] if errors else {}
    loc = ".".join(str(p) for p in first.get("loc", ()) if p != "body")
    detail = f"{loc}：{first.get('msg', '')}".strip("：")
    return JSONResponse(
        {"ok": False, "error": "请求参数不合法", "detail": detail},
        status_code=400,
    )


async def _unhandled(request, exc):
    return JSONResponse(
        {"ok": False, "error": f"服务内部错误：{exc}"},
        status_code=500,
    )


def register(app) -> None:
    app.add_exception_handler(ApiError, _api_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    for exc_class in CONNECT_ERRORS:
        app.add_exception_handler(exc_class, _connect_error)
    app.add_exception_handler(pymysql.err.Error, _sql_error)
    app.add_exception_handler(Exception, _unhandled)


def ok(data=None):
    """成功响应壳。"""
    return {"ok": True, "data": data}

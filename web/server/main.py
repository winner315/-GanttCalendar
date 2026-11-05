# -*- coding: utf-8 -*-
"""排期甘特图后端 —— FastAPI + 本机 MySQL 8.0。

启动：.venv\\Scripts\\python.exe -m uvicorn server.main:app --host 127.0.0.1 --port 8010
（或双击 web/start.bat，那里会顺带起 vite）

只监听 127.0.0.1，无鉴权 —— 仅供本机自用。
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config, errors
from .schedule import routes as schedule_routes


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 缺必填项就带着中文指引退出，而不是等第一个请求才报错
    config.require_config()
    yield


app = FastAPI(title="GanttCalendar API", version="0.2.0", lifespan=lifespan)

# 正常路径是同源（vite proxy 转发 /api），不需要 CORS。
# 这里只放开本机来源，方便偶尔直接 curl/浏览器打开后端端口调试。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://127.0.0.1:5174", "http://localhost:5184"],
    allow_methods=["*"],
    allow_headers=["*"],
)

errors.register(app)
app.include_router(schedule_routes.router)

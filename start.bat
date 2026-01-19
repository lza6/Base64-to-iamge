@echo off
:: 设置编码为 UTF-8
chcp 65001 > nul
title Base64 图像转换器 - 启动管理器

echo ======================================================
echo           Base64 图像转换器 - 启动环境检查
echo ======================================================
echo.

:: 检查 Python 环境
python --version > nul 2>&1
if %errorlevel% == 0 (
    echo [状态] 检测到 Python 环境，将启动本地 Web 服务器...
    echo [提示] 使用本地服务器可以完美支持 Web Worker 处理超大文件。
    echo.
    echo 正在启动浏览器: http://localhost:8000
    start "" "http://localhost:8000"
    echo 正在运行服务器 (如果需要停止，请按 Ctrl+C 或直接关闭此窗口)
    python -m http.server 8000
) else (
    echo [警告] 未检测到 Python，将以本地文件模式启动。
    echo [提示] 注意：Chrome/Edge 等浏览器在 file:// 协议下可能会禁止加载 Web Worker。
    echo       如果转换大文件时提示“线程未就绪”，请尝试使用 Firefox 或安装 Python。
    echo.
    echo 正在启动 index.html...
    
    :: 尝试通过默认浏览器打开，而不是关联的编辑器
    :: 使用 start "" 加引号是 Windows 标准做法
    start "" "index.html"
    
    echo.
    echo 启动成功！建议将其部署在 Web 服务器上以获得最佳性能。
    pause
)

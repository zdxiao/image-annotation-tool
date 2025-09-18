# 图像标注工具

图像标注工具是一个基于 Flask 的本地 Web 应用，用于快速浏览文件夹中的图像并给出 1–5 分的主观评分。应用自动遍历所选目录及其子目录，在浏览器里逐张呈现图像，帮助小团队完成半结构化的质检、优选或打分任务。

## 主要特性
- 在浏览器里创建标注任务，统一管理多个待评估的图像目录
- 自动过滤常见图片格式（PNG/JPG/GIF/BMP/WebP），并缓存为任务清单
- 为每张图像记录 1–5 分的评分，实时展示任务完成进度
- 支持从任务列表继续未完成的工作，断点续标
- 以 JSON 文件持久化任务与评分，便于后续分析或接入其他流程

## 快速开始
1. **准备环境**
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # Windows 请使用 .venv\Scripts\activate
   pip install -r requirements.txt
   ```
2. **放置待标注图像**：将需要打分的图片整理到 `images/` 目录下，可按需要建立子目录。
3. **启动服务**
   ```bash
   python app.py
   ```
   默认在 `http://127.0.0.1:5000` 监听，请在浏览器访问。

## 使用说明
- 在首页填写任务名称并勾选一个或多个图像目录，点击“创建并开始”即可生成任务。
- 系统会按顺序呈现图片，选择合适的评分后点击“保存评分并下一张”。
- 任一任务创建后都会出现在“继续未完成任务”列表中，可随时点击继续。
- 所有任务数据保存在 `data/` 目录下的 JSON 文件中，可手动备份或进一步处理。

## API 概览
应用同时暴露了简洁的 JSON API，供自动化集成或二次开发使用：
- `GET /api/bootstrap`：加载目录树与现有任务
- `GET /api/directory-tree?path=...`：浏览指定根目录下的子目录
- `POST /api/tasks`：创建新任务（提交任务名称与目录列表）
- `GET /api/tasks/<task_name>/next`：获取任务下一张待标注图片
- `POST /api/tasks/<task_name>/annotate`：提交评分
- `GET /api/tasks/<task_name>/image?token=...`：按令牌读取图片内容

## 开发与协作
- 代码风格遵循 PEP 8，建议提交前运行 `ruff --fix` 与 `black app.py static templates` 等格式化工具。
- 当前仓库尚未提供 `Makefile`，如需扩展自动化命令，可在 Makefile 中补充并同步更新本文档。
- 开发时请避免提交包含真实凭据的配置；若需要配置变量，可在根目录添加 `.env.example` 作为模板。

## 项目结构
```text
.
├── app.py          # Flask 入口，定义 API 与页面逻辑
├── static/         # 前端静态资源（样式与交互脚本）
├── templates/      # Jinja2 模板
├── images/         # 本地待标注图像（示例文件夹，可自定义）
├── data/           # 任务与评分数据（运行时生成）
├── requirements.txt
└── README.md
```

欢迎根据具体业务场景继续扩展标注标签、导出格式或协同机制。

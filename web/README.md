# 中文电诈识别 · 演示页

静态单页演示，包含首屏在线检测台（P）与 10 个叙事场景（S0–S9）。技术栈为 Vite + TypeScript + GSAP/ScrollTrigger + Canvas 2D。

## 运行

### 1. 先启动模型 API（可选）

演示页会自动探测后端：`/api/v1/*` → 现有 `/health`、`/labels`、`/predict` → 离线 mock。
不启动 API 也能完整浏览，页面会显示“离线演示”水印与 mock 标记。

```bash
# 仓库根目录
python -m pip install -r fasttext/api_zh/requirements.txt

# 训练产物默认在 fasttext/models_zh/，API 从 api_zh/model/ 读取
# 已训练过可复制一次（该文件在 .gitignore 中，不会入库）
cp fasttext/models_zh/fasttext_zh_fraud.bin fasttext/api_zh/model/

PORT=8000 python fasttext/api_zh/app.py
```

随机森林链路同样兼容本演示的 legacy 适配层：

```bash
PORT=8000 python -X utf8 randomforest/api.py
```

### 2. 启动演示页

```bash
cd web
npm install
npm run dev          # http://127.0.0.1:5173
```

开发服务器把 `/api`、`/health`、`/labels`、`/predict` 代理到 `http://127.0.0.1:8000`。
API 在别的地址时：

```bash
API_PROXY_TARGET=http://127.0.0.1:8001 npm run dev
```

### 3. 构建

```bash
npm run build        # validate + tsc + vite build
npm test             # 数据契约、颜色、脱敏等单测
npm run preview
```

## 数据与 mock

- 场景数据在 `public/data/`，由 `npm run mock` 生成；`meta.json` 记录 `data_mode` 与来源。
- 缺失的训练产物（逐类 F1、校准分箱、分数分布等）用固定种子生成，文件内标记 `mock: true`。
- 头条指标与 API 契约采用项目评估结果中的真实锚点；mock 只补缺口。
- 构建期校验：若 `meta.json` 声明 `data_mode: real` 但任一数据文件仍为 `mock: true`，`npm run build` 会失败。
- 场景里所有 `mock: true` 数据都会显示“样例数据”水印，避免被当成真实模型输出。

## 接口适配

| 模式 | 探测 | 说明 |
|---|---|---|
| `v1` | `GET /api/v1/health` | 计划中的新契约，`/api/v1/models`、`/api/v1/predict` |
| `legacy` | `GET /health` | 现有 `fasttext/api_zh/app.py` 与 `randomforest/api.py` |
| `mock` | 前两者都失败 | 离线演示，固定种子，不发起外部请求 |

legacy 适配层兼容现有响应的 `label`、`label_id`、`p_fraud`、`threshold`、`top_k[{label,prob}]`、`warnings`，
并把“文本较短”提示映射为统一文案。

## 安全与隐私

- 检测台输入只保存在页面内存：不写 URL、不写 `localStorage`、不接入第三方统计。
- 服务端不落库；演示页也不记录用户输入。
- 不要在源码、示例或测试里写入可用的分享码、令牌或其他凭据。线上访问所需的分享码应由部署环境注入，
  不要提交到仓库；`VITE_*` 变量会被打包进前端，等同公开。
- 生产环境应由后端做鉴权与限流，CORS 不应配置为 `*`。

## 目录

```
src/
  api/           v1 / legacy / mock 三种客户端与统一错误码
  charts/        Canvas 图表（热力图、可靠性图、分布图等）
  components/    MessageCard、ClassChip、ProbBar、Stamp
  core/          配置、主题、滚动导演、脱敏、水印
  playground/    首屏检测台
  scenes/        S0–S9
public/data/     场景数据（mock 缺口已标记）
scripts/         数据生成与构建期校验
tests/           Vitest
```

# 🪙 MimoToken 仓库

轻量级 Windows 桌面应用 — 小米 MiMo API Key 管理器。

自动鉴别 `sk-` / `tp-` 前缀、多集群验证、批量检测、本地持久化。

## ✨ 功能

- 🔍 **Key 验证** — 输入 Key 自动识别类型，一键验证有效性
- 📋 **模型列表** — 验证成功后展示可用模型
- 🌐 **多集群** — Token Plan 自动匹配中国/新加坡/欧洲三集群
- 🧪 **Anthropic 协议** — 支持 Anthropic 兼容协议测试
- 🔄 **一键检测** — 批量重验所有已保存 Key
- 🗑 **一键删除无效** — 快速清理失效 Key
- 📝 **复制 / 删除** — 每条 Key 独立操作
- 💾 **本地持久化** — 数据自动保存，重启不丢失
- 🎨 **白色简约 UI** — 干净、美观、流畅

## 📸 界面

```
┌───────────────────────────────────────┐
│  🪙 MimoToken 仓库     MiMo API · 自动鉴别│
├───────────────────────────────────────┤
│  ┌──────────────────────────┐ ┌──────┐│
│  │ 输入 MiMo API Key...     │ │ 确认 ││
│  └──────────────────────────┘ └──────┘│
│  tp-··· Token Plan Key · 自动匹配集群    │
│                                       │
│  ┌─────────────┐ ┌──────────────┐     │
│  │ 🔍 一键检测 │ │ 🗑 一键删除无效│     │
│  └─────────────┘ └──────────────┘     │
│  ████████████░░░░░░░░░░ 60%          │
│                                       │
│  ● tp- sk-abcd1234...  [12模型][📋][🗑]│
│  ● sk- sk-efgh5678...  [8模型] [📋][🗑]│
│  ○ sk- sk-ijkl9012...         [📋][🗑]│
│                                       │
│  共 3 个 Key  │  2 可用  1 失效        │
└───────────────────────────────────────┘
```

## 🚀 快速开始

### 直接使用

下载 `MimoToken 仓库_1.0.0_x64-setup.exe` 安装，或直接运行绿色版 `mimo-token-vault.exe`。

### 从源码构建

**环境要求：**

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://www.rust-lang.org/) ≥ 1.70

```bash
# 安装依赖
npm install

# 开发模式（热更新）
npm run tauri dev

# 生产构建
npm run tauri build
```

构建产物在 `src-tauri/target/release/`。

## 🛠 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | [Tauri 2](https://v2.tauri.app/) |
| 前端 | React 18 + TypeScript |
| 构建 | Vite 6 |
| 后端 | Rust (reqwest, serde, tokio) |
| 打包 | NSIS (支持中文) |

## 📁 项目结构

```
mimo-token-vault/
├── src/                          # React 前端
│   ├── App.tsx                   # 主组件 + Toast
│   ├── App.css                   # 白色主题样式
│   ├── types.ts                  # 类型定义
│   └── components/
│       ├── KeyInput.tsx           # 输入框 + 验证 + 模型预览
│       ├── KeyItem.tsx            # 单行 Key（类型徽章、操作按钮）
│       ├── KeyList.tsx            # Key 列表
│       └── ActionBar.tsx          # 批量操作栏
├── src-tauri/                    # Tauri / Rust 后端
│   ├── src/
│   │   ├── main.rs               # 入口
│   │   └── lib.rs                # MiMo API 验证、存储
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── capabilities/
├── index.html
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 🔑 MiMo API 接口

### Key 类型

| 前缀 | 类型 | 验证接口 |
|------|------|----------|
| `sk-` | 按量付费 | `GET api.xiaomimimo.com/v1/models` |
| `tp-` | Token Plan | `GET token-plan-{cn,sgp,ams}.xiaomimimo.com/v1/models` |

### 请求格式

```
GET /v1/models
Header: api-key: {key}
```

### 错误码

| 状态码 | 含义 |
|--------|------|
| 200 | Key 有效 |
| 401 | Key 无效 |
| 403 | 无权限 / 已过期 |
| 429 | 频率限制 |

## 📄 许可

MIT License

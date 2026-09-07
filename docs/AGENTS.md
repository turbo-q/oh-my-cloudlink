# AGENTS.md — Oh My CloudLink

面向在本仓库用 AI / Agent 协作开发的说明。**先读本文，再改代码**；细节以源码与同目录其他文档为准。

> Cursor：本文件由 `.cursor/rules/read-agents-doc.mdc` 要求优先阅读。

## 产品是什么

**Oh My CloudLink**（原「云连 SSH」）是类 Termius 的桌面 SSH 客户端：

- 主机 / 分组 / 标签、SSH 密钥、多标签终端
- SFTP（及 FTP）双栏文件、端口转发、命令片段
- 会话日志回放、导入导出 / 备份、主密码保险库加密

技术栈：**Electron + React 19 + TypeScript + Tailwind 4 + xterm.js + ssh2 + 本地 SQLite**。

## 仓库地图

```
oh-my-cloudlink/
├── electron/                 # 主进程（Node / Electron）
│   ├── main.ts               # 窗口、IPC 注册、生命周期
│   ├── preload.ts            # contextBridge → window.electronAPI
│   ├── app-paths.ts          # 强制 ASCII userData 目录名
│   ├── data-store.ts         # SQLite + 备份
│   ├── ssh-manager.ts        # SSH 会话
│   ├── ssh-io-ports.ts       # SSH I/O MessagePort（Phase B）
│   ├── sftp-manager.ts / file-manager.ts / local-file-manager.ts
│   ├── port-forward-manager.ts
│   ├── session-log-store.ts  # 会话日志落盘与裁剪
│   ├── log-append-bus.ts     # log:append 节流
│   └── crypto-vault.ts / vault-device-store.ts
├── src/                      # 渲染进程（React）
│   ├── App.tsx               # 面板路由、会话状态
│   ├── components/           # UI（Terminal / SFTP / Settings …）
│   ├── utils/                # sshDataBus、terminalSearch、WebGL 等
│   ├── theme.ts / i18n/      # 主题与中英文本
│   └── types/electron.d.ts   # electronAPI 类型（改 preload 必须同步）
├── docs/
│   ├── AGENTS.md             # 本文：Agent 项目导读
│   └── TERMINAL_PERF_ROADMAP.md
├── main.cjs                  # 打包入口：require('./dist-electron/main.js')
├── package.json              # scripts / electron-builder
└── .cursor/rules/            # Cursor 规则
```

入口链路：`main.cjs` → `dist-electron/main.js`；开发时 Vite `5173` + `tsc` 编译 `electron/` → `dist-electron/`。

## 常用命令

```bash
npm install          # 或 bun install
npm run dev          # Vite + Electron（可用 bun run dev）
npm run build        # electron tsc + 前端 build
npm run package      # build + electron-builder → release/
npm run lint         # oxlint
```

- 改 `electron/**`：依赖 `build:electron` / watch，改完需等编译或重启 Electron。
- 改 `src/**`：Vite HMR；涉及 preload / `electronAPI` 时通常要重载窗口。

## 架构要点

### 主进程 vs 渲染进程

| 职责 | 位置 |
|------|------|
| SSH / SFTP / 转发 / 落盘 / 保险库 | `electron/*` |
| UI、xterm、快捷键、面板状态 | `src/*` |
| 桥接 | `preload.ts` → `window.electronAPI`（类型在 `src/types/electron.d.ts`） |

**禁止**在渲染进程直接 `require('ssh2')` 或读私钥明文文件做连接；一律走 IPC / MessagePort。

### SSH 终端热路径（默认）

1. 键盘 → xterm `onData` → `writeSshData`（MessagePort，失败回退 IPC）
2. 远端输出 → `ssh-manager` → Port / IPC → `sshDataBus` → xterm
3. 会话日志：**旁路**热路径（`session-log-store` + `log-append-bus` 节流）；UI 先写终端再记日志

性能演进见 [`TERMINAL_PERF_ROADMAP.md`](./TERMINAL_PERF_ROADMAP.md)：

- **A** WebGL + 日志离热路径 — 已落地（`attachTerminalWebgl.ts`）
- **B** MessagePort — 已落地（`ssh-io-ports.ts` / `sshDataBus.ts`）
- **C+** UtilityProcess / 原生终端 — 规划或实验分支

### 终端搜索高亮

逻辑集中在 [`src/utils/terminalSearch.ts`](../src/utils/terminalSearch.ts)：

- 打开搜索时设**一次**实心 `selectionBackground` / `selectionForeground`（橙底黑字 = 当前命中）
- `findNext/Previous` 带 SearchAddon `decorations`（黄底 = 全部命中）
- 通过 patch `registerDecoration` 注入 `foregroundColor: #000`（Addon 本身不支持字色）
- **不要在每次 find 时重设整份 `term.options.theme`**，否则会刷掉装饰

接入点：`TerminalPanel.tsx`、`LogViewer.tsx`。

### 数据与路径

`ensureAppPaths()`（必须在任何 `app.getPath('userData')` 之前）把目录固定为：

```text
~/Library/Application Support/oh-my-cloudlink/   # macOS
```

内含：`cloudlink.db`、`session-logs/`、`backups/`、`vault/` 等。

注意：历史上可能还有 `Application Support/Oh My CloudLink`（按 productName）。**现行代码读写的是 `oh-my-cloudlink`**。开发与正式包应共用该目录；若两边数据不一致，先核对是否在用旧目录。

会话日志：

- 最多保留最近 **20** 条（`MAX_SESSION_LOGS`），超出 prune 旧项，不是「满 20 全清」
- 单条约 **2MB** 上限
- UI 列表来自 `manifest.json`；磁盘上可能残留孤儿 `.log`

### 安全相关

- 主机密码 / 私钥等经 vault 加密入库；导出备份为密封 envelope（见 `crypto-vault.ts`）
- 不要把密钥、`.env`、vault 材料打进 git 或 commit
- 会话日志 ID 必须是 UUID v4（防路径穿越）

## UI / 代码约定

- **i18n**：用户可见文案走 `src/i18n/zh.ts` + `en.ts`，勿硬编码中文/英文（设置页版本号等极少数除外）
- **主题**：`theme.ts` + CSS 变量；终端主题用 `getTerminalTheme`
- **组件**：现有面板模式（`*Panel.tsx`），优先扩展而非新造平行体系
- **Tailwind**：跟现有 utility / `index.css` 变量；不要引入另一套设计系统
- **类型**：改 IPC 必须同步 `preload.ts` 与 `electron.d.ts`
- **范围**：只改任务相关文件；不顺手大重构
- **导读对齐**：功能性修改或约定变更时，同步更新 [`docs/AGENTS.md`](./AGENTS.md)（见下「持续对齐」）

## Git / 提交

- 分支常见：`dev`（日常）、`main`、`opt/speed`（性能 / 实验）
- Commit 风格：`feat|fix|refactor|test|docs|chore:` + 中文说明「为什么」（参考 `git log`）
- **提交策略**（见 `.cursor/rules/auto-commit.mdc`）：任务完成且意图清晰时可自动 commit；**重大更新 / 未完成 / 不明确**须先问用户是否提交
- 用户当次指示优先；不要 `push --force`、不要改 git config；未要求则不 push
- 用户若要求「每次改完给全量 diff 的 commit 文案」：按仓库当前全部未提交变更写一条完整文案

## 打包注意

- `npm run package` → `release/`；产物名 `OhMyCloudLink-${version}-${arch}.*`
- macOS 发布包通常未公证；文档中有 `xattr -cr` 说明
- `electron-builder` 的 `files` 默认含 `main.cjs`、`dist/**`、`dist-electron/**`；若增加原生 `.node`，必须同时配置打包纳入与 `asarUnpack`（见实验分支上的 native-term 实践）

## 实验：原生终端（非默认）

macOS Rust/NSView 终端 spike 主要在 **`opt/speed`** 等分支（`native-term/`、`NativeTerminalPanel`），**不在默认 WebGL 路径**。

- 默认渲染器仍是 xterm WebGL；Native 需显式设置且 addon 可用
- NSView 盖在 Chromium 之上：React 浮层（右键菜单等）需临时隐藏 native
- ObjC 非法 selector 会直接干掉 Electron 进程；字宽用 `NSFont.maximumAdvancement` 等安全 API
- 细节见该分支上的 [`NATIVE_TERM_SPIKE.md`](./NATIVE_TERM_SPIKE.md)（若存在）

在 `dev` / 默认产品路径上改终端时，优先动 xterm + `terminalSearch` / WebGL，不要假设 native-term 一定在树里。

## 持续对齐（维护本导读）

`docs/AGENTS.md` 是给后续 Agent 的项目地图，**须与代码保持同步**：

| 改动类型 | 是否更新本文件 |
|----------|----------------|
| 新功能 / 行为变更、架构或目录职责变化 | **要** |
| IPC / preload API、数据路径、日志 / 加密策略 | **要** |
| 终端默认路径、热路径、打包必须知道的产物 | **要** |
| 纯 UI 文案、无关紧要的局部 bugfix | 一般不必 |
| 仅改本文件或其它 docs 的文档任务 | 按需 |

更新原则：只改过时段落，保持短、可执行；细节仍指向源码与专题 `docs/`。Cursor 规则 `.cursor/rules/read-agents-doc.mdc` 强制「先读 + 改完对齐」。

## 改动前检查清单

1. 影响主进程还是渲染进程？IPC / 类型是否要一起改？
2. 是否触及 SSH 热路径？避免同步重活、避免在 flush 路径上同步写大文件
3. 用户可见文案是否走 i18n？
4. 是否误用另一套 userData 路径解释「数据丢了」？
5. 终端搜索 / WebGL / MessagePort：读现有 util，勿重复造轮子
6. 提交与 push：确认用户意愿
7. **本轮功能性 / 约定变更是否已反映到 `docs/AGENTS.md`？**

## 推荐阅读顺序

1. 本文 [`docs/AGENTS.md`](./AGENTS.md)
2. [`README.md`](../README.md) — 功能与快速开始
3. [`TERMINAL_PERF_ROADMAP.md`](./TERMINAL_PERF_ROADMAP.md) — 终端性能阶段
4. `electron/main.ts` + `preload.ts` — IPC 全貌
5. `src/App.tsx` + `TerminalPanel.tsx` — 会话与终端 UI
6. `electron/data-store.ts` / `session-log-store.ts` — 持久化与日志

## 明确不要做的事

- 默认打开 Local Echo 作为主输入路径（路线图已否决为默认）
- 在多标签间滥用 WebGL `clearTextureAtlas()`（共享 atlas 会串台）
- 把 secrets、本机密钥、用户 `userData` 打进仓库
- 为「整洁」做与任务无关的大范围格式化 / 重命名
- 功能性改完却不更新 `docs/AGENTS.md`，导致后续 Agent 按过时约定改代码
- 未经验证就声称开发与安装包「一定」使用不同数据目录（先核对 `oh-my-cloudlink` 路径）

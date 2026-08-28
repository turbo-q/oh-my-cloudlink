# Oh My CloudLink

**简体中文** | [English](README_EN.md)

一款类 [Termius](https://termius.com) 的 SSH / SFTP / FTP 连接管理桌面应用（原「云连 SSH」），支持主机管理、分组、SSH 密钥、终端、文件传输、端口转发与命令片段。

## 功能特性

- **主机管理** — 添加、编辑、删除主机，支持密码和密钥认证
- **分组与标签** — 按环境/项目分组，支持标签搜索
- **SSH 密钥** — 统一管理私钥，关联到主机；支持发现本机 `~/.ssh` 密钥
- **SSH 终端** — 基于 xterm.js 的全功能终端，多标签、同一主机多开、⌘F 搜索
- **SFTP / FTP 文件传输** — 双栏文件浏览器，上传 / 下载 / 删除 / 重命名
- **端口转发** — 本地 / 远程 / SOCKS5 动态转发，独立于终端会话启停
- **命令片段** — 收藏常用命令，终端内快捷插入（支持多主机作用范围）
- **连接日志** — 会话输出记录与只读回放
- **数据导入导出 / 备份恢复** — JSON 备份；底层持久化为 SQLite
- **中英文界面** — 设置中切换语言（可跟随系统）

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron |
| 前端 | React 19 + TypeScript + Tailwind CSS 4 |
| 终端 | xterm.js |
| SSH | ssh2 (Node.js) |
| SFTP | ssh2 SFTP 子系统 |
| FTP | basic-ftp |
| 数据存储 | 本地 SQLite（`~/Library/Application Support/oh-my-cloudlink/cloudlink.db`） |

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

将同时启动 Vite 开发服务器和 Electron 窗口。

### 构建

```bash
npm run build        # 编译前端 + Electron 主进程
npm run package      # 打包为可分发安装包
```

## 项目结构

```
oh-my-cloudlink/
├── electron/           # Electron 主进程
│   ├── main.ts         # 窗口 & IPC 入口
│   ├── preload.ts      # 渲染进程 API 桥接
│   ├── ssh-manager.ts  # SSH 连接管理
│   ├── sftp-manager.ts # SFTP 文件传输
│   ├── ftp-manager.ts  # FTP 文件传输
│   └── data-store.ts   # 本地数据持久化
├── src/                # React 渲染进程
│   ├── components/     # UI 组件
│   ├── hooks/          # 数据 hooks
│   ├── i18n/           # 中英文文案
│   └── types/          # 类型定义
└── public/
```

## 数据模型

```typescript
type ConnectionProtocol = 'ssh' | 'sftp' | 'ftp'

interface Host {
  protocol: ConnectionProtocol  // SSH 终端 / SFTP / FTP 文件传输
  authType: 'password' | 'key'
  // ...
}
```

> 说明：UI 上主机主要用于 SSH/SFTP；纯 FTP 主机走文件传输面板。`protocol` 字段区分连接方式。

## 路线图

- [x] SSH 终端连接
- [x] SFTP 文件浏览器（上传/下载/删除/重命名）
- [x] FTP 文件传输
- [x] 主机 / 分组 / 密钥管理
- [x] 数据导入导出
- [x] 端口转发
- [x] Snippets / 命令片段
- [x] 中英文国际化
- [ ] 数据加密存储

## 许可证

MIT

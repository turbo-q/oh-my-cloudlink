# Oh My CloudLink

一款类 [Termius](https://termius.com) 的 SSH / SFTP 连接管理桌面应用（原「云连 SSH」），支持主机管理、分组、SSH 密钥和终端连接。

## 功能特性

- **主机管理** — 添加、编辑、删除 SSH 主机，支持密码和密钥认证
- **分组与标签** — 按环境/项目分组，支持标签搜索
- **SSH 密钥** — 统一管理私钥，关联到主机
- **终端连接** — 基于 xterm.js 的全功能 SSH 终端，支持多标签
- **数据导入导出** — JSON 格式备份与恢复配置（底层持久化为 SQLite）
- **协议预留** — 数据模型已预留 SFTP / FTP 扩展位，后续可接入文件传输

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
│   └── data-store.ts   # 本地数据持久化
├── src/                # React 渲染进程
│   ├── components/     # UI 组件
│   ├── hooks/          # 数据 hooks
│   └── types/          # 类型定义（含 FTP/SFTP 预留）
└── public/
```

## 数据模型

```typescript
// 连接协议 — 当前仅实现 ssh
type ConnectionProtocol = 'ssh' | 'sftp' | 'ftp'

interface Host {
  protocol: ConnectionProtocol  // sftp/ftp 预留
  authType: 'password' | 'key'
  // ...
}
```

## 路线图

- [x] SSH 终端连接
- [x] SFTP 文件浏览器（上传/下载/删除/重命名）
- [x] FTP 文件传输
- [x] 主机 / 分组 / 密钥管理
- [x] 数据导入导出
- [x] 端口转发
- [x] Snippets / 命令片段
- [ ] 数据加密存储

## 许可证

MIT

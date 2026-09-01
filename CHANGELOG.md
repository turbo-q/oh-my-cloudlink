# Changelog

本文件记录 **Oh My CloudLink** 各版本的可见功能变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 计划中

- Windows / Linux 安装包
- 终端性能 Phase C UtilityProcess（见 `docs/TERMINAL_PERF_ROADMAP.md`）

---

## [0.3.2] - 2026-09-01

### 变更

- **终端性能 Phase A/B**：xterm WebGL 渲染（context loss / 初始化失败自动回退 Canvas）；会话日志 `log:append` 约 80ms 节流，进一步离开热路径；SSH 高流量 I/O 默认 MessagePort（失败回退 IPC）。路线图见 `docs/TERMINAL_PERF_ROADMAP.md`

### 发布产物

| 文件 | 说明 |
|------|------|
| `OhMyCloudLink-0.3.2-arm64.dmg` | macOS 安装镜像（Apple Silicon） |
| `OhMyCloudLink-0.3.2-arm64.zip` | macOS 应用包压缩包 |

> **macOS 提示「已损坏」**：未签名导致的 Gatekeeper 拦截，执行  
> `xattr -cr "/Applications/oh-my-cloudlink.app"` 后再打开即可。

---

## [0.3.1] - 2026-08-31

### 变更

- **SSH 终端输出热路径优化**：会话日志 manifest 写入节流；主进程按负载自适应合并 `ssh:data`（交互小包立即刷出，大输出短时合并）；渲染进程小包直写 xterm、大输出按动画帧合并，兼顾打字跟手与刷屏流畅
- **输入与缩放**：`ssh:write` / `ssh:resize` 改为单向 IPC（`send`），降低按键往返延迟；窗口缩放防抖约 80ms
- **多标签**：非活动会话暂缓写入 xterm（切回时刷新，缓冲上限 512KB）；`ssh:data` 改为单路监听按会话分发
- **连接体验**：打开 shell 时传入初始 `cols` / `rows`，减少连接后尺寸抖动

### 修复

- 断连 / cleanup 前先 flush 合并中的 PTY 输出，避免尾部数据丢失
- **打字回显延迟**：交互小包立即刷出；`ssh:data` 先于会话日志落盘，避免日志拖慢终端

### 发布产物

| 文件 | 说明 |
|------|------|
| `OhMyCloudLink-0.3.1-arm64.dmg` | macOS 安装镜像（Apple Silicon） |
| `OhMyCloudLink-0.3.1-arm64.zip` | macOS 应用包压缩包 |

> **macOS 提示「已损坏」**：未签名导致的 Gatekeeper 拦截，执行  
> `xattr -cr "/Applications/oh-my-cloudlink.app"` 后再打开即可。

---

## [0.3.0] - 2026-08-31

### 新增

- **主密码保险库**：敏感字段与备份升级为 `omcl2` / 备份 v3（scrypt 派生，可跨机器）；启动需设置或解锁；本机可通过系统钥匙串记住解锁状态；兼容读取旧 `omcl1` / 备份 v2
- **导入合并去重**：导入与恢复支持合并（默认）或全量覆盖；冲突可选保留本机或以导入为准；预览展示分类统计与全部条目名称
- **会话标签快捷键**：`⌘W` / `Ctrl+W` 关闭当前标签；`F2` 重命名；`⌘⇧D` / `Ctrl+Shift+D` 新开；右键菜单显示对应加速键提示

### 变更

- **文件传输统一 SFTP**：移除未开放的明文 FTP 实现与 `basic-ftp` 依赖
- **Renderer 沙箱**：启用 `sandbox: true`，加强纵深防御（仍保持 `contextIsolation` / 关闭 `nodeIntegration`）
- **密钥从文件导入**：改为 main 进程对话框一体化读取（`pickKeyFile`），不再暴露任意路径读密钥 IPC
- **明文备份导入**：未加密 JSON 默认拒绝，需用户确认「仍要导入」后方可继续（兼容旧明文备份）

### 修复

- SSH 连接校验 `known_hosts`，降低中间人风险
- 会话日志 ID 限制为 UUID，防止路径穿越
- 会话日志忽略终端清屏序列（跨 PTY chunk 缓冲），避免回放时清空历史；`⌘F` 可再次聚焦搜索框
- 补全 SFTP 相关中文语言包遗漏词条

### 发布产物

| 文件 | 说明 |
|------|------|
| `OhMyCloudLink-0.3.0-arm64.dmg` | macOS 安装镜像（Apple Silicon） |
| `OhMyCloudLink-0.3.0-arm64.zip` | macOS 应用包压缩包 |

---

## [0.2.0] - 2026-08-28

### 新增

- **数据加密存储**：应用绑定 AES-256-GCM 加密 SQLite 敏感字段（密码 / 私钥 / 口令）与导出、定时备份 JSON；仅本应用可解密，兼容旧明文导入并静默升级
- **会话标签右键菜单**：已打开主机标签支持新开、重命名、关闭、关闭其他、关闭右侧、关闭全部
- **主机 OS 图标**：SSH 连接后识别远程系统（如 Ubuntu），在主机列表等处展示系统图标；未识别时回退为首字母
- **英文 README**：新增 `README_EN.md`，中英文文档顶部可切换语言

### 变更

- **表单提示样式**：片段占位符、端口转发说明等改用 `FormHint` 背景条与高亮 token，浅色主题下更易读
- **macOS 应用图标**：为 Dock 图标增加约 10% 透明边距，避免相对系统图标显得过大
- **连接入口文案**：统一连接按钮与 SSH Config 弹窗命名
- **日志页布局**：左右分栏样式调整

### 修复

- 会话标签「重命名」改用应用内弹窗（Electron 下 `window.prompt` 不可用）

### 发布产物

| 文件 | 说明 |
|------|------|
| `OhMyCloudLink-0.2.0-arm64.dmg` | macOS 安装镜像（Apple Silicon） |
| `OhMyCloudLink-0.2.0-arm64.zip` | macOS 应用包压缩包 |

---

## [0.1.2] - 2026-08-27

### 新增

- **中英文国际化**：设置中切换语言（跟随系统 / 中文 / English）；导航、主机、SFTP、弹窗、终端、日志等主要 UI 接入翻译
- **~/.ssh/config 快速连接**：可从 SSH 配置选择主机一键开终端
- **片段目标选择（两层 UI）**：编辑弹窗内「编辑目标」进入选择页；支持全选、按分组批量勾选、单独勾选主机，分组与主机状态联动
- **片段一键运行**：运行前自动保存；新开 SSH 标签并以片段名称作为 Tab 标题，连接成功后自动插入并执行命令

### 变更

- **片段面板**：列表简化为浏览 / 编辑 / 删除；搜索改为右上角图标；移除列表页「插入目标 / 插入并执行」
- **片段编辑弹窗**：加宽布局，目标主机移至右侧侧栏；去掉取消 / 保存按钮，点击遮罩或关闭时自动保存；底部仅保留「运行」
- **转发列表**：类型与状态改为彩色 badge，更易辨识
- README：SFTP / FTP 标注为已支持，移除过时「协议预留」表述

### 修复

- SSH 偶发「连两次」：主进程丢弃过期握手，终端侧防止卸载后仍写入；移除 MOTD 中间的「连接成功」提示
- 顶栏会话 Tab 竖线高度与其他分割线对齐
- Groups 编辑 / 删除、新建分组、日志刷新等文本按钮补充 hover 反馈
- 主机页「新建主机」按钮位置与顶部间距
- 终端 / 日志搜索框占位符随语言切换
- 合并后 `connectSshConfigHost` 重复定义

### 样式

- 统一工作区页面视觉层次与顶栏导航样式

---

## [0.1.1] - 2026-08-26

### 新增
- **端口转发**：本地 / 远程 / SOCKS5 动态转发；规则持久化；顶部「转发」面板独立启停
- **命令片段**：收藏常用命令（全局或多主机）；终端内 ⌘⇧S / Ctrl+Shift+S 快速插入；支持占位符
- **终端搜索**：SSH 实时终端支持 ⌘F / Ctrl+F 滚动搜索（与日志回放共用搜索栏）

### 修复
- 片段作用范围支持多选，并明确「插入目标终端」，避免全局/多主机时目标不清
- 片段筛选与插入目标行统一左侧标签对齐
- 强退后将遗留「进行中」会话日志收成「已断开」
- 会话日志不再重复记录键盘输入（避免 `ps` 记成 `psps`）

---

## [0.1.0] - 2026-08-26

首个公开测试版（macOS Apple Silicon）。

### 新增

- **SSH 终端**：多标签会话、xterm 终端、连接状态指示
- **同一主机多开**：可为同一主机打开多个 SSH/SFTP 标签（`主机名 #2`）
- **SFTP 双栏文件管理**：本机 / 远程目录浏览、路径输入、目录与文件拖拽传输
- **传输进度**：底部状态条显示文件数、字节、速度、ETA、百分比；失败时展示可读错误
- **主机 / 分组 / 密钥管理**：密码显隐、分组下拉、本机密钥发现与导入
- **数据存储**：SQLite（`~/Library/Application Support/oh-my-cloudlink/cloudlink.db`）
- **备份与恢复**：设置页按时间保留最近 5 份自动备份，支持列表恢复与选择文件恢复
- **连接日志**：「日志」面板记录最近 20 次 SSH 会话，只读终端回放，支持 ⌘F / Ctrl+F 搜索
- **主题**：跟随系统 / 浅色 / 深色
- **应用图标**：Release 使用自定义 Oh My CloudLink 图标

### 修复

- 切换顶部导航或会话 Tab 时保持 SSH/SFTP 连接不断开
- 连接远程后保留本机侧已选目录路径
- 打包时纳入 `main.cjs`，修复 Mac asar 入口缺失
- 修复打包复制运行中 Electron 导致 SQLite 数据丢失的问题（退出时 WAL checkpoint + JSON 旁路备份）
- 主机表单分组下拉在编辑时展示全部可选分组
- 修复 `local:list` IPC 与本机文件浏览相关问题

### 变更

- 项目重命名为 **Oh My CloudLink**（`oh-my-cloudlink`）
- 发布产物命名：`OhMyCloudLink-{version}-arm64.zip` / `.dmg`
- userData 目录固定为英文路径 `oh-my-cloudlink`（不再使用中文目录名）
- 去掉易混淆的 FTP 勾选项（SSH 主机走 SSH，文件传输走 SFTP）

### 发布产物

| 文件 | 说明 |
|------|------|
| `OhMyCloudLink-0.1.0-arm64.dmg` | macOS 安装镜像（Apple Silicon） |
| `OhMyCloudLink-0.1.0-arm64.zip` | macOS 应用包压缩包 |
| `OhMyCloudLink-0.1.0-source.zip` | 源代码（zip） |
| `OhMyCloudLink-0.1.0-source.tar.gz` | 源代码（tar.gz） |

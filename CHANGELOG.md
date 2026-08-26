# Changelog

本文件记录 **Oh My CloudLink** 各版本的可见功能变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 计划中
- Windows / Linux 安装包
- 端口转发、Snippets

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

### 发布资产

| 文件 | 说明 |
|------|------|
| `OhMyCloudLink-0.1.0-arm64.dmg` | macOS 安装镜像（Apple Silicon） |
| `OhMyCloudLink-0.1.0-arm64.zip` | macOS 应用包压缩包 |
| `OhMyCloudLink-0.1.0-source.zip` | 源代码（zip） |
| `OhMyCloudLink-0.1.0-source.tar.gz` | 源代码（tar.gz） |

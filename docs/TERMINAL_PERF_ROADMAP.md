# 终端性能架构路线图

> 目标：在 Electron 架构下逼近 VS Code / Tabby 级 SSH 跟手体验。  
> 不对标系统 Terminal.app 的绝对上限；**不以默认 Local Echo 作为主路径**（已验证退格/光标对账成本过高）。

## 现状（截至 0.3.1 热路径优化）

已完成：

- 主进程自适应 flush（交互小包立即刷出）
- `ssh:write` / `ssh:resize` 单向 IPC
- 渲染进程小包直写 xterm、大输出 RAF 合并
- `ssh:data` 单路分发；非活动标签缓冲
- `ssh:data` 先于会话日志落盘

瓶颈仍在：

```
键盘 → Chromium → IPC → Main(ssh2) → 网络
回显 → Main → IPC → xterm(DOM/Canvas)
```

相对系统终端多了 **IPC + JS 渲染** 两层。

---

## 阶段总览

| 阶段 | 主题 | 预期收益 | 成本 | 状态 |
|------|------|----------|------|------|
| **A** | WebGL 渲染 + 日志离热路径 | 刷屏/滚动更稳；减少日志抖动 | 低 | **已落地（本迭代）** |
| **B** | MessagePort 直连（旁路冗长 IPC 序列化路径） | 降按键与回显延迟 | 中 | **原型已通（IPC 回退）** |
| **C** | UtilityProcess 承载 ssh2 | 多会话/大输出不堵 UI 主进程 | 中高 | 规划 |
| **D** | 可选 Local Echo（默认关） | 高 RTT 场景体感 | 中（交互债） | 暂缓 |
| **E** | 原生/混合引擎（可选） | 逼近系统终端上限 | 很高 | 产品决策 |

参考实现：

- VS Code：PTY Host + MessagePort + WebGL（[ptyHostMain](https://github.com/microsoft/vscode/blob/main/src/vs/platform/terminal/node/ptyHostMain.ts)）
- Tabby：Electron + xterm WebGL
- xterm：[`@xterm/addon-webgl`](https://github.com/xtermjs/xterm.js/tree/master/addons/addon-webgl)

---

## Phase A — 渲染与日志（低风险）

### A1. WebGL 渲染

- 加载 `@xterm/addon-webgl`
- `webglcontextlost` → dispose addon，回退 DOM/Canvas
- 多标签：避免随意 `clearTextureAtlas()`（共享 atlas 会串台）
- 失败时静默降级，不影响连接

### A2. 会话日志离热路径

- UI 已先于日志；继续把 `log:append` **节流合并**，避免日志页监听拖慢主会话
- `append` 保持流式写；禁止在 flush 路径上同步 `appendFileSync`（已有 stream 时）

### A3. 可观测性（可选）

- 开发开关：记录 keydown → write → data → term.write 时间戳，便于 A/B

**验收**：`cat` 大文件 / 快速滚动时帧更稳；打开日志面板时打字不明显变顿。

---

## Phase B — MessagePort 热通道

### 目标

高流量 `ssh:data` / `ssh:write` 走 **MessagePort**，减少 `ipcRenderer` 字符串总线与主进程中转开销（对齐 VS Code「窗口直连 PTY」思路）。

### 设计草案

```
Renderer ←─ MessagePort ─→ Main(ssh-manager)
   │                            │
   └─ 仍用 invoke 做 connect/disconnect/resize（低频）
```

1. `ssh:connect` 成功后，Main 创建 `MessageChannelMain`，把一端 `postMessage` 给渲染进程
2. Preload 经 `window.postMessage` 把 port 交给业务层（contextIsolation 安全传递）
3. `sshDataBus` 优先从 port 收数据；`sshWrite` 优先 port 发送
4. Port 断开或未就绪时 **回退** 现有 `ssh:data` / `ssh:write` IPC

### 验收

- 功能与现网一致（含多标签）
- A/B 结论：同主机上 MessagePort 与 IPC 的 P50 无显著差异（约 110ms 量级，以网络 RTT 为主）；默认固定 auto（Port 优先）即可

---

## Phase C — UtilityProcess（规划）

- 将 ssh2 会话迁入 `utilityProcess`
- Renderer ↔ Utility 仍用 MessagePort；Main 只做窗口与权限编排
- 对齐 VS Code PTY Host：崩溃隔离、主进程内存不被终端流量撑爆

依赖 Phase B 通道稳定后再做。

---

## Phase D — 可选 Local Echo（暂缓）

- 默认 **关闭**
- 仅高 RTT 或用户设置开启；`vim` / alternate buffer 自动关
- 不作为默认「极致体验」手段（已踩坑：退格回闪、光标跳动）

---

## Phase E — 产品级上限（决策项）

若 Phase B/C 后仍不满足：

1. **接受 Electron 上限**，对标 Tabby/VS Code Remote  
2. **混合**：UI Electron，终端区嵌原生 view（维护成本高）  
3. **双客户端**：极致性能版 Tauri/原生；CloudLink 保留管理/SFTP

---

## 非目标

- 默认开启预测回显 / Mosh 换协议（短期）
- 为刷性能牺牲沙箱、主密码与会话隔离安全模型

---

## 迭代顺序（执行）

1. ~~文档~~ → **A1 WebGL** → **A2 日志节流** → **B MessagePort 原型** → 测量 → C  
2. 每阶段可独立发布；B 必须带 IPC 回退  
3. 重大阶段写入 `CHANGELOG`；本文件保持「状态」列更新

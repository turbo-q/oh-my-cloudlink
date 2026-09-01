# Native Terminal Spike（Phase E）

> Electron UI + Rust `NSView` 终端区。仅 **macOS**；默认仍是 xterm WebGL。

## 要验证什么

对比同一主机上：

| 模式 | 路径 |
|------|------|
| WebGL | 键盘 → Chromium → IPC/Port → ssh2 → … → xterm |
| Native | 键盘 → NSView → ssh2 → … → Core Text 绘制（不经 xterm） |

## 构建

依赖：Rust toolchain、Xcode CLT、本仓库已 `npm install`。

```bash
npm run build:native-term
```

产物：`native-term/native-term.darwin-arm64.node`（或对应 arch）。

## 启用

1. 设置 → **终端渲染（实验）** → **Native（macOS spike）**
2. **新开**一个 SSH 标签（已有标签不会切换）
3. 连接横幅带 `[native]` 即表示原生路径

也可：`localStorage.setItem('omcl.terminal.renderer','native')` 后新开标签；或开发地址加 `?term=native`。

失败（addon 缺失 / attach 失败）会自动回退 WebGL。

## 已知缺口（spike）

- IME 深度（组合输入 / 候选窗）未做
- Windows / Linux 未实现
- Core Text 逐格绘制，刷屏上限低于 Alacritty GPU；目标是验证 **输入路径** 是否更跟手
- 滚动条为简易 track/thumb（非系统 NSScroller）；alt-screen 下滚轮不翻 history

已对齐（本迭代）：

- 拖拽选中 + ⌘C/⌘V、⌘F 网格搜索、片段选择器插入（浮层时隐藏 native）
- 滚轮 + 右侧简易滚动条（`display_offset` / scrollback）
- 多标签共用一块 NSView，由 `uiOwnerSession` 独占可见性与键盘捕获（切回历史标签可交互）
- 右键菜单 / 重命名等 Chrome 浮层打开时临时隐藏 NSView，避免层级盖住 React UI

> **注意**：原生 ObjC 未捕获异常会直接杀死 Electron 进程（JS 来不及回退）。字宽请用 `NSFont.maximumAdvancement`，勿调用不存在的 selector。

## 相关文件

- [`native-term/`](../native-term/) — napi-rs + `alacritty_terminal`
- [`electron/native-term-bridge.ts`](../electron/native-term-bridge.ts)
- [`src/components/NativeTerminalPanel.tsx`](../src/components/NativeTerminalPanel.tsx)

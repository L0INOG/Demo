# Web 游戏打包为桌面安装程序 — 深度研究

> 本报告研究如何将 Vite + TypeScript + Three.js 游戏打包为 Windows/macOS/Linux 桌面安装程序（.exe / .msi / .dmg），用于对外分发下载安装。

---

## 一、核心问题

一个基于 Web 技术构建的游戏（HTML/CSS/JS/WebGL），如何变成一个普通用户能下载、双击安装、在桌面运行的程序？

答案：需要一个 **桌面运行时壳** + **安装程序打包工具**。

```
Web 游戏                      桌面安装程序
┌──────────────┐             ┌─────────────────────┐
│ index.html   │             │  Setup.exe / .msi   │
│ assets/      │  ──打包──▶  │  ┌───────────────┐  │
│ dist/        │             │  │ 桌面壳 + 游戏  │  │
│ (Vite build) │             │  │ (Chromium容器) │  │
└──────────────┘             │  └───────────────┘  │
                             └─────────────────────┘
```

---

## 二、桌面运行壳对比 — 四大方案

### 速览对比表

| 维度 | **Electron** | **NW.js** | **Tauri** | **Neutralino.js** |
|------|-------------|-----------|-----------|-------------------|
| 首发年份 | 2013 | 2011 | 2019 | 2018 |
| **安装包大小** | ~150MB | ~440MB | **~3-10MB** | ~1-5MB |
| **运行时内存(空闲)** | ~93-275MB | ~348MB | ~154-313MB | ~282MB |
| **冷启动速度** | ~183ms | ~668ms | ~708ms | 取决于系统WebView |
| 渲染引擎 | 自带 Chromium | 自带 Chromium | **系统 WebView** | 系统浏览器引擎 |
| 后端语言 | JavaScript (Node) | JavaScript (Node) | **Rust** | C/C++ |
| IPC 复杂度 | 高（主进程/渲染进程分离） | **无（同一进程）** | 中等 | 低（WebSocket） |
| Steam 游戏数量 | 少量 | **5,700+** | 新兴 | 无 |
| WebGL 兼容性 | ✅ 稳定 | ✅ 稳定 | ⚠️ 依赖系统 WebView | ⚠️ 依赖系统浏览器 |
| 跨平台一致性 | **最高** | **最高** | 中（不同OS不同WebView） | 低 |
| 学习曲线 | 中 | **低** | 高（需学 Rust） | 低 |

### 2.1 Electron — 最成熟

**原理：** 打包时把整个 Chromium 浏览器 + Node.js + 你的游戏文件一起塞进安装包。

```
Electron 应用结构：
┌─────────────────────────────────────┐
│ 主进程 (Node.js)                     │
│ ├── 窗口管理                         │
│ ├── 文件系统访问                     │
│ └── IPC 桥接                        │
├─────────────────────────────────────┤
│ 渲染进程 (Chromium)                  │
│ ├── 你的 Three.js 游戏              │
│ ├── WebGL 渲染                      │
│ └── 无法直接访问 Node.js（安全隔离）  │
└─────────────────────────────────────┘
```

**优点：**
- Chromium 版本固定 → 所有平台渲染结果完全一致，QA 成本低
- WebGL 支持成熟可靠
- 生态最完善：electron-builder、electron-updater（自动更新）、crash reporter
- 纯 JS/Node 技术栈，无需学其他语言

**缺点：**
- 安装包 ≥150MB（因为带了一整个 Chromium）
- 主进程/渲染进程分离，所有 Node 操作需要 IPC 桥接
- 跨平台构建复杂（Mac 上打 Windows 包需要 CI 或 Wine）

**打包命令（electron-builder）：**
```bash
npm install electron electron-builder --save-dev
npm run build       # Vite 构建前端
npx electron-builder --win --x64   # 输出 NSIS 安装程序 .exe
```

**适用：** 复杂商业游戏，团队重视稳定性和渲染一致性。

---

### 2.2 NW.js — 对游戏最友好

**原理：** 和 Electron 类似（自带 Chromium），但 Node.js 和浏览器 JS 运行在**同一个上下文**。

```
NW.js 应用结构（统一进程）：
┌─────────────────────────────────────┐
│ 单一进程 = Chromium + Node.js        │
│                                     │
│  index.html 里可以直接写：            │
│  const fs = require('fs');          │
│  fs.writeFileSync('save.json', ...) │
│                                     │
│  无需 IPC！无需 preload！            │
└─────────────────────────────────────┘
```

**优点：**
- **零 IPC** — `require('fs')` 直接在游戏代码里写，存档读写一行搞定
- Steam 生态最广泛 — 5,700+ Steam 游戏使用 NW.js（RPG Maker、Construct 等引擎的默认桌面导出目标）
- 打包极其简单：下载 NW.js 二进制包 → 把你的文件拖进 `package.nw` 文件夹 → 完成
- 与 Electron 一样的渲染一致性

**缺点：**
- 安装包最大（~440MB），比 Electron 还大
- 安全隐患：因为 DOM 可直接访问 Node，加载第三方内容时必须关闭 Node 权限
- 生态不如 Electron 丰富

**打包命令（nw-builder）：**
```bash
npm install nw-builder --save-dev
npx nwbuild --platforms win64 --output ./dist .
```

**适用：** 个人开发者/小团队，追求最简打包流程，或计划上架 Steam。

---

### 2.3 Tauri — 最小最轻

**原理：** 不打包浏览器。利用 Windows 自带的 WebView2（Edge 内核）来渲染，后端用 Rust。

```
Tauri 应用结构：
┌─────────────────────────────────────┐
│ Rust 核心 (~3MB)                    │
│ ├── 窗口管理                        │
│ ├── 系统 API                        │
│ └── IPC（Rust ↔ WebView）           │
├─────────────────────────────────────┤
│ 系统 WebView2（Edge 内核）           │
│ ├── 你的 Three.js 游戏              │
│ └── WebGL 渲染                      │
└─────────────────────────────────────┘
        不打包浏览器，体积极小
```

**优点：**
- **安装包 3-10MB**（vs Electron 150MB+）
- 内存占用低，冷启动快
- 安全性设计优秀（权限白名单）
- 增长极快，Discord 部分组件已迁移到 Tauri

**缺点：**
- **必须学 Rust** — 哪怕只写几行文件操作也要 Rust
- WebView 差异：Windows 用 Edge WebView2（Chromium），macOS 用 Safari/WebKit — CSS/字体可能不同，**必须三平台测试**
- MSI 安装包**只能在 Windows 上构建**（WiX 工具限制）
- IPC 在高频消息下有瓶颈

**打包命令：**
```bash
npm install @tauri-apps/cli --save-dev
npm run tauri build   # 输出 .msi + .exe
```

**适用：** 追求极致小体积和高性能，团队有 Rust 能力。

---

### 2.4 Neutralino.js — 最轻量

**原理：** 使用操作系统自带的浏览器引擎，以一个极小的 C/C++ 程序作为壳。

**优点：** 安装包仅 1-5MB。

**缺点：**
- 原生 API 仅基础功能（文件读写、窗口管理）
- 运行时内存可能反而更高（因为依赖系统完整浏览器）
- 生态极小，无自动更新方案
- **不建议用于 WebGL 游戏**（系统浏览器兼容性不可控）

**适用：** 工具类小应用，不推荐用于游戏。

---

### 2.5 最终推荐

```
你是个人开发者，游戏基于 Three.js：
                            推荐度    理由
Electron                   ★★★★☆   最稳，生态最全，包大了点但能接受
NW.js                      ★★★★★   最简单！无IPC，Steam最多游戏用
Tauri                      ★★★☆☆   最小但必须学Rust，WebView有兼容风险
Neutralino                 ★★☆☆☆   不适合WebGL游戏
```

**对本项目（Tactical Range Demo）的建议：优先选择 NW.js，其次 Electron。**
理由：团队是 JS 全栈，NW.js 无 IPC 意味着存档、文件操作直接写 Node 代码。打包简单到令人发指。

---

## 三、Windows 安装程序格式

把游戏壳打包好后，还需要生成用户能双击安装的安装程序。

### 3.1 常见格式

| 格式 | 工具 | 特点 |
|------|------|------|
| **NSIS (.exe)** | NSIS / electron-builder | 最通用，支持安装向导、自定义界面 |
| **MSI (.msi)** | WiX Toolset | 企业级，支持静默安装、组策略部署 |
| **便携版 (.exe)** | Enigma Virtual Box | 单文件运行，无需安装 |
| **AppX (.appx)** | electron-builder | Windows Store 上架 |

### 3.2 electron-builder 自动生成

如果选择 Electron，electron-builder 一条命令同时出 NSIS + MSI：

```json
// package.json
{
  "build": {
    "appId": "com.tacticalrange.demo",
    "productName": "Tactical Range",
    "win": {
      "target": ["nsis", "msi"],
      "icon": "build/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true
    }
  }
}
```

输出：
```
release/
├── Tactical Range Setup 1.0.0.exe    ← NSIS 安装程序
└── Tactical Range 1.0.0.msi          ← MSI 安装程序
```

### 3.3 独立安装程序制作工具

如果选择 NW.js（它本身不捆绑安装程序生成器），需要用第三方工具：

| 工具 | 类型 | 特点 |
|------|------|------|
| **Inno Setup** | 免费 | Pascal 脚本，有可视化编辑器，输出单个 .exe |
| **NSIS** | 免费开源 | 脚本驱动，插件丰富，electron-builder 内部用的就是它 |
| **WiX Toolset** | 免费 | 微软官方，输出 .msi，学习曲线陡 |
| **Enigma Virtual Box** | 免费 | 把整个文件夹打包成单个 .exe（便携版，无需安装） |

---

## 四、实战方案：Tactical Range Demo 打包指南

### 方案 A：NW.js（推荐）

```bash
# 1. 构建游戏
npm run build          # Vite 输出到 dist/

# 2. 创建 package.json（NW.js 配置）
cat > dist/package.json << 'EOF'
{
  "name": "tactical-range",
  "main": "index.html",
  "window": {
    "title": "Tactical Range",
    "width": 1920,
    "height": 1080,
    "fullscreen": false,
    "resizable": true,
    "icon": "icon.png"
  }
}
EOF

# 3. 用 nw-builder 打包成 exe
npx nwbuild --platforms win64 --output ./release ./dist

# 4. 用 Inno Setup 制作安装程序（带桌面快捷方式、卸载入口）
```

**最终大小估算：**
- NW.js 运行库 ~120MB
- 游戏文件 ~5MB
- 压缩后安装包 ~50MB

### 方案 B：Electron + electron-builder

```bash
# 1. 安装依赖
npm install electron electron-builder --save-dev

# 2. 创建 main.js（Electron 主进程）
# 3. 配置 package.json 的 build 字段（如上所示）

# 4. 一键打包
npm run build:win
# 输出 release/Tactical Range Setup 1.0.0.exe
```

**最终大小估算：**
- 安装包 ~80-100MB
- 安装后 ~250MB

---

## 五、高级话题

### 5.1 代码签名

Windows 默认对未签名的安装程序弹出 SmartScreen 警告。

**解决方案：**
- 购买代码签名证书（OV/EV Code Signing Certificate）
- 在 electron-builder 中配置：`win.certificateFile` + `win.certificatePassword`
- 个人/业余项目可跳过，用户点"仍要运行"即可

### 5.2 自动更新

| 框架 | 方案 |
|------|------|
| Electron | `electron-updater`（与 electron-builder 集成） |
| NW.js | 需自行实现（下载 → 替换 → 重启） |
| Tauri | 官方 `tauri-plugin-updater` |

### 5.3 Steam 上架

如果计划上架 Steam：

| 框架 | Steam SDK 方案 |
|------|---------------|
| NW.js | **greenworks**（成熟，5700+ 游戏用）或 **steamworks.js**（新一代，TypeScript 原生） |
| Electron | greenworks 或 steamworks.js |
| Tauri | 需自行编写 Rust 绑定 |

steamworks.js 是 2025 年推荐选择：npm install 即用，Promise API，TypeScript 类型支持，Electron/NW.js 通用。

**版本匹配铁律：** Greenworks/NW.js/Steamworks SDK 三者的版本必须严格对应，混用会导致 `Bad arguments` 或初始化失败。

### 5.4 WebView2 离线安装

Tauri 应用默认假设用户系统有 Edge WebView2（Win10/11 自带）。如果需要离线分发：

```json
// tauri.conf.json
"windows": {
  "webviewInstallMode": {
    "type": "offlineInstaller"  // 打包时包含 WebView2 (~127MB)
  }
}
```

### 5.5 跨平台构建

| 目标平台 | 在 Windows 开发机上 | 在 Mac 开发机上 |
|----------|-------------------|----------------|
| Windows .exe | ✅ 直接构建 | 需要 CI 或虚拟机 |
| Windows .msi | ✅ 直接构建（需 WiX） | ❌ 不可（WiX 仅 Windows） |
| macOS .dmg | ❌ 不可 | ✅ 直接构建 |
| Linux .AppImage | ✅ WSL 或 CI | ✅ 直接构建 |

**建议：** 用 GitHub Actions 做多平台 CI 构建。

---

## 六、快速决策路线图

```
你的需求：把 Three.js 游戏打包成 .exe 给别人安装

选框架：
  追求最简单 → NW.js + Inno Setup
  追求最稳定 → Electron + electron-builder
  追求最小体 → Tauri（需学 Rust）
  不上 Steam → 以上任一即可
  要上 Steam → NW.js + steamworks.js

后续升级路径：
  v1.0: 打包 .exe（便携版）
  v1.1: 加 Inno Setup 安装程序
  v1.2: 加自动更新
  v2.0: 上架 Steam（如需要）
```

---

## 七、与本项目的契合度

| 本项目现状 | NW.js 方案下 |
|-----------|-------------|
| Vite + TypeScript + Three.js | ✅ 完全兼容 |
| 使用 localStorage 存档 | ✅ 可改用 Node fs 写文件 |
| 无后端 | ✅ 无需后端 |
| 项目体积约 5MB | ✅ 安装包约 50MB |
| 个人开发者 | ✅ NW.js 学习成本最低 |

**推荐的下一步实操：** 用 NW.js 的 `nw-builder` 把 `demo/dist/` 打包成一个 `TacticalRange.exe`，再用 Inno Setup 包一层安装向导。

---

*分析日期：2026-07-20*
*参考来源：Electron 官方文档、Tauri v2 文档、NW.js 官方、web-to-desktop-framework-comparison (GitHub)、nw-builder v4、electron-builder 文档、Steamworks.js 文档、Greenworks 版本发布记录、多篇 2025-2026 年开发者实战经验帖*

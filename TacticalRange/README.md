# Tactical Range Demo — 项目总结文档

> **版本：** v1.0 | **日期：** 2026-07-20 | **作者：** FPS 开发团队  
> **技术栈：** TypeScript + Three.js + Vite + NW.js  
> **代码总量：** 2,801 行 TypeScript + 338 行 HTML/CSS + 127 行 JSON 配置  

---

## 目录

1. [项目概述](#一项目概述)
2. [技术架构总览](#二技术架构总览)
3. [项目优势分析](#三项目优势分析)
4. [项目不足与改进方向](#四项目不足与改进方向)
5. [编程手法与设计模式](#五编程手法与设计模式)
6. [完整文件目录与职责说明](#六完整文件目录与职责说明)
7. [数据流与系统交互](#七数据流与系统交互)
8. [构建与分发流水线](#八构建与分发流水线)
9. [版本管理规范](#九版本管理规范)
10. [性能指标](#十性能指标)

---

## 一、项目概述

Tactical Range Demo 是一个基于 Web 技术构建的第一人称射击瞄准训练器。玩家在 60 秒计时内使用枪械或匕首命中随机生成的三维球体靶子，系统记录分数并维护排行榜。

项目遵循"纯代码驱动"理念：不使用 Unity/Unreal 等商业引擎，全部通过代码命令行构建，开发者仅需通过指令驱动开发过程。

### 核心功能清单

| 类别 | 功能 |
|------|------|
| 射击 | 手枪（半自动）、步枪（全自动）、匕首（近战），支持 Hitscan 射线检测 |
| 手感 | 后坐力系统（点序列）、散布系统（锥角随机）、伤害衰减、命中暂停、屏幕震动 |
| 靶子 | 3D 球体靶子 + 头部判定区 + 不可见碰撞球（1.6x 容差），单靶即时刷新 |
| 计时 | 60 秒倒计时，每靶 +1 分 |
| UI | 主菜单、设置面板、结算界面、浮动伤害数字、动态点准星 |
| 设置 | 准星颜色、DPI/灵敏度、靶子尺寸（4 档）、全屏开关 |
| 场景 | 天蓝色室内靶场，四面围墙，射击台，距离标记，完整碰撞检测 |
| 打包 | NW.js 独立 .exe + Inno Setup 安装程序 |
| 持久化 | localStorage 排行榜（前 5）+ 设置保存 |

---

## 二、技术架构总览

### 2.1 架构模式

项目采用 **Game Singleton（游戏单例）** 架构，参考 Unreal Engine 的 Actor/Pawn/Controller 模式：

```
┌──────────────────────────────────────────────────┐
│                    Game (单例)                    │
│  统筹所有系统，驱动游戏主循环                       │
├──────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ FPSCamera │ │ Weapons  │ │ TargetSpawner    │ │
│  │ 相机控制  │ │ 武器系统  │ │ 靶子生成/回收    │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │HitFeedback│ │ScoreMgr  │ │ Crosshair/DmgNum │ │
│  │ 命中反馈  │ │ 计分排名  │ │ UI 层           │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │InputMgr  │ │EventBus  │ │ GameLoop         │ │
│  │ 输入采集  │ │ 事件解耦  │ │ rAF + delta     │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
└──────────────────────────────────────────────────┘
```

### 2.2 游戏循环顺序

每帧执行顺序严格遵循以下流程（参考研究报告 §01 和 §02）：

```
requestAnimationFrame
  → 命中暂停时间缩放
  → 相机更新（鼠标输入 → 欧拉角 → 四元数）
  → 玩家移动（WASD + 跳跃 + 重力 + 碰撞检测）
  → 武器更新（后坐力/散布回复）
  → 枪模跟随相机 + 后座动画 + 换弹动画
  → 准星绘制
  → 射击/近战检测
  → 换弹（手动/自动）
  → 武器切换（1/2/3）
  → 靶子生成与更新
  → 屏幕震动
  → 伤害数字更新与渲染
  → Three.js 渲染
  → 输入帧结束（清空瞬时状态）
```

### 2.3 游戏状态机

```
     ┌──────────┐  START GAME   ┌──────────┐  60s结束  ┌──────────┐
     │   MENU   │──────────────▶│ PLAYING  │─────────▶│  ENDED   │
     └──────────┘               └──────────┘          └──────────┘
          ▲                          │  Tab                │
          │                          ▼                     │
          │                     returnToMenu()              │
          └────────────────────────────────────────────────┘
                              PLAY AGAIN / Back to Menu
```

---

## 三、项目优势分析

### 3.1 架构设计优势

**（1）事件总线解耦**

所有系统通过 `EventBus` 通信，而非直接调用。武器发射 → 事件广播 → 计分系统、UI 系统、音效系统各自响应。新增功能只需监听事件，无需修改现有代码。

```typescript
// 武器发射时
events.emit(GameEvents.WEAPON_SHOT, { origin, direction, mag, reserve });
// 计分系统独立监听
events.on(GameEvents.WEAPON_SHOT, () => { this.totalShots++; });
// UI 系统独立监听
events.on(GameEvents.AMMO_CHANGED, (mag, reserve) => { updateDisplay(); });
```

**（2）JSON 数据驱动**

武器参数、靶子预设全部存放在 `data/*.json` 中，修改数值无需重新编译。新增武器只需添加一条 JSON 配置，`HitscanWeapon` 自动读取。

**（3）对象池复用**

`Target` 和 `DamageNumber` 均使用 `ObjectPool<T>` 泛型对象池，预创建实例 + 获取/归还机制，避免频繁 GC 导致的帧率波动。

**（4）单一职责分层**

每个文件职责明确。`FPSCamera` 只管相机旋转，`FireRateController` 只管射速节流，`RecoilSystem` 只管后坐力模式。修改一个系统不影响其他系统。

### 3.2 射击手感优势

**（1）确定性后坐力 + 随机散布分离**

后坐力是固定点序列（可学习、可掌握），散布是随机锥角（提供可控的不可预测性）。两者独立运作，符合 AAA 射击游戏标准。

**（2）五层命中反馈栈**

准星闪烁（<50ms）→ 靶子高亮（0ms）→ 浮动 "+1"（<100ms）→ 屏幕震动（同步）→ 命中暂停（微冻结）。五层叠加制造"重量感"。

**（3）创伤衰减震动模型**

`trauma²` 非线性衰减：震动强度 = trauma²（而非线性 trauma），大震动快速衰减，小震动持续更久，手感更自然。

### 3.3 工程化优势

**（1）完整的构建流水线**

```
TypeScript 源码 → Vite 编译 → dist/ → NW.js 打包 → release/*.exe → Inno Setup → 安装程序
```

一条 `build.bat` 完成全部流程。

**（2）版本管理系统**

`version.cjs` 脚本自动递增版本号 + 写入 CHANGELOG.md，小版本 v1.0 → v1.1 → v1.99 无限延伸。

**（3）开发与分发分离**

- 开发环境：`npm run dev`（Vite HMR 热更新，秒级反馈）
- 生产构建：`build.bat`（一键出 exe + 安装程序）
- 分发产物：`installer/TacticalRange-Setup-v1.0.0.exe`（可选择安装路径，带卸载程序）

### 3.4 代码质量优势

- **TypeScript 全覆盖：** 2801 行代码 100% TypeScript，零 `any` 滥用
- **严格空值检查：** `strict: true`，所有 DOM 访问使用 `!` 断言或 `?.` 可选链
- **无外部模型依赖：** 所有 3D 模型（手枪、步枪、匕首）均为程序化几何体生成，零外部 .glb 文件
- **完善的错误处理：** init() 包裹 try-catch，加载失败时在 UI 上显示具体错误信息

---

## 四、项目不足与改进方向

### 4.1 当前不足

| 问题 | 严重度 | 描述 |
|------|--------|------|
| **无音效系统** | 高 | 武器射击、命中反馈、UI 交互均无声。研究报告 §02 明确指出"60% 手感来自音效"。 |
| **无网络功能** | 中 | 排行榜仅本地 localStorage，无法全球竞技。 |
| **程序化模型简陋** | 中 | 手枪/步枪/匕首由基础几何体拼接，缺乏纹理和法线贴图。 |
| **靶子类型单一** | 中 | 仅有静态/浮动球体靶子，无移动靶、反应靶等高级训练模式。 |
| **无后处理效果** | 低 | 无泛光、环境光遮蔽、抗锯齿等后期特效。 |
| **无动画系统** | 低 | 换弹动画为代码驱动的位移/旋转，无骨骼动画。 |
| **未实现研究报告的全部建议** | 低 | 研究报告 §02 设计了 Flick/Tracking/Precision/Speed/Reaction 五种训练模式，目前仅实现了基础的自由训练模式。 |
| **NW.js 包体积大** | 低 | 520MB（含完整 Chromium），虽压缩后约 200MB，但仍可优化 |

### 4.2 后续版本改进路线图

| 版本 | 计划内容 |
|------|----------|
| v1.1 | 音效系统（Web Audio API + 音频精灵） |
| v1.2 | 移动靶子系统（直线/正弦/随机行走） |
| v1.3 | Flick / Tracking 训练模式 |
| v1.4 | 后处理特效（Bloom + SSAO） |
| v1.5 | GLB 模型替换程序化几何体 |
| v2.0 | 联网排行榜 + 账号系统 |

---

## 五、编程手法与设计模式

### 5.1 核心设计模式

#### （1）单例模式（Singleton）

`Game` 类作为全局唯一的游戏控制器，在 `main.ts` 中通过 `new Game()` 实例化。所有系统通过 Game 实例间接访问，避免全局变量污染。

#### （2）观察者模式（Observer）

`EventBus` 实现发布-订阅模型。事件生产者（武器系统）与消费者（计分、UI、反馈系统）完全解耦，新增系统只需 `events.on()` 监听。

#### （3）对象池模式（Object Pool）

```typescript
// src/utils/ObjectPool.ts
class ObjectPool<T> {
  private available: T[] = [];
  private active: T[] = [];
  private factory: () => T;
  private resetFn: (item: T) => void;

  get(): T { /* 从 available 取或 factory 新建 */ }
  release(item: T): void { /* 重置后归还 available */ }
}
```

`TargetSpawner` 使用 Target 对象池预创建 3 个靶子，`DamageNumbers` 使用 DamageNumber 对象池预创建 8 个数字。避免频繁 `new` / GC。

#### （4）策略模式（Strategy）

`HitscanWeapon` 内部组合了 `FireRateController`（射速策略）、`RecoilSystem`（后坐力策略）、`SpreadSystem`（散布策略）。每种策略可独立替换，互不影响。

#### （5）状态模式（State）

游戏使用三态状态机（MENU / PLAYING / ENDED），`WeaponState` 枚举管理武器生命周期（Idle / Shooting / Reloading / Empty），`TargetState` 管理靶子生命周期（Alive / Hit / Dead）。

#### （6）命令模式（Command）

`InputManager` 将原始键盘/鼠标事件包装为每帧查询接口（`isKeyDown` / `wasKeyPressed` / `wasKeyReleased`），游戏逻辑不需要直接绑定 DOM 事件。

### 5.2 核心算法

#### 鼠标灵敏度算法

```typescript
// 来源于研究报告 §02 — Three.js PointerLockControls 标准模型
const MOUSE_SENSITIVITY = 0.002; // 像素 → 弧度基准转换
euler.y -= movementX * MOUSE_SENSITIVITY * pointerSpeed;
euler.x -= movementY * MOUSE_SENSITIVITY * pointerSpeed * invert;

// DPI 转换公式
pointerSpeed = (userDPI / 800) * userSensitivity;
cmPer360 = 25000 / (userDPI * pointerSpeed); // 估算值
```

#### AABB 碰撞推离算法

```typescript
// 玩家圆形碰撞体 vs 矩形碰撞盒
// 取四个方向重叠量中的最小值，沿对应轴推出
const overlapLeft   = (x + R) - box.minX;
const overlapRight  = box.maxX - (x - R);
const overlapBack   = (z + R) - box.minZ;
const overlapFront  = box.maxZ - (z - R);
const minOverlap = Math.min(overlapLeft, overlapRight, overlapBack, overlapFront);
if (minOverlap === overlapLeft)  x = box.minX - R;
else if (minOverlap === overlapRight) x = box.maxX + R;
// ... (z 同理)
```

#### 屏幕震动创伤衰减

```typescript
// trauma² 非线性衰减 — 抖动强度非线性，大震动快衰减
const shake = this.trauma * this.trauma;
const offset = new Vector3(
  (Math.random() * 2 - 1) * shake * 0.04,
  (Math.random() * 2 - 1) * shake * 0.04, 0
);
this.trauma = Math.max(0, this.trauma - dt * 1.5); // 1.5/秒衰减
```

#### 后坐力点序列

```typescript
// 确定性模式 — 每次射击取下一个偏移点，循环使用
getShotOffset(): RecoilOffset {
  const offset = this.config.offsets[this.currentIndex];
  this.accumulatedYaw += offset.yaw;
  this.accumulatedPitch += offset.pitch;
  this.currentIndex = (this.currentIndex + 1) % this.config.offsets.length;
  return offset;
}
```

#### 散布锥角随机

```typescript
// 锥角内随机偏移方向
applySpread(direction: Vector3): Vector3 {
  const angle = (Math.random() * 2 - 1) * this.currentSpread * (Math.PI / 180);
  const axis = new Vector3(Math.random()*2-1, Math.random()*2-1, 0).normalize();
  return direction.applyAxisAngle(axis, angle);
}
```

### 5.3 性能优化手法

| 手法 | 应用位置 | 效果 |
|------|----------|------|
| 对象池 | TargetSpawner, DamageNumbers | 消除频繁 GC |
| requestAnimationFrame | GameLoop | 与屏幕刷新率同步 |
| delta 时间 clamp | GameLoop (max 0.033s) | 防止标签页切换后大跳跃 |
| 几何体段数控制 | Target (SphereGeometry 48段), 手枪模型 | 平衡视觉与性能 |
| 纹理替代 | 全部纯色材质（MeshStandardMaterial/MeshBasicMaterial） | 零纹理内存 |
| 单一 raycaster 复用 | HitscanWeapon | 避免每帧新建 |
| PixelRatio 上限 | Renderer (max 2x) | 高分屏不过度渲染 |
| 阴影贴图尺寸控制 | DirectionalLight (2048), SpotLight (1024) | 阴影质量与性能平衡 |

---

## 六、完整文件目录与职责说明

### 6.1 项目根目录

```
FPS/
├── .gitignore                        # Git 忽略规则（node_modules, dist, release, cache 等）
├── docs/                             # 项目文档
│   └── TacticalRange-Demo-项目总结文档.md  # ← 本文档
├── research-notes/                   # 前期研究报告（4份深度分析）
│   ├── 01-开源FPS项目深度分析.md      # 10+ 开源 FPS 项目架构对比
│   ├── 02-射击训练场设计深度分析.md    # 15+ 瞄准训练器射击手感/武器/反馈研究
│   ├── 03-游戏资源管理与高效调用系统.md # AAA 资源管线/引用计数/Web 存储
│   └── 04-Web游戏打包为桌面安装程序方案.md # Electron/NW.js/Tauri 打包对比
└── demo/                             # ← 主工程目录
    ├── [详见 6.2]
```

### 6.2 demo/ — 主工程目录

```
demo/
├── build.bat                         # 一键构建批处理（编译→打包→安装程序）
├── build-nw.cjs                      # NW.js 打包脚本（生成 .exe）
├── installer.iss                     # Inno Setup 安装程序脚本
├── version.cjs                       # 版本管理脚本（bump/set）
├── CHANGELOG.md                      # 版本更新记录
├── package.json                      # npm 依赖 + 项目元信息
├── package-lock.json                 # 依赖锁定文件
├── tsconfig.json                     # TypeScript 编译配置（strict 模式）
├── vite.config.ts                    # Vite 构建配置（别名/端口/输出）
│
├── index.html                        # 游戏入口 HTML（全部 UI 结构 + CSS）
│
├── data/                             # 游戏资料库（JSON 配置驱动）
│   ├── weapons.json                  # 武器参数表（手枪/步枪的属性/射速/后坐力/散布/衰减）
│   └── targets.json                  # 靶子预设表（尺寸/颜色/分数/头部倍率）+ 生成参数
│
└── src/                              # TypeScript 源代码
    ├── main.ts                       # 入口文件，实例化 Game，错误捕获
    │
    ├── core/                         # 引擎核心层
    │   ├── Game.ts                   # ★ 主控制器（1062行），统筹所有系统、游戏循环、状态机
    │   ├── GameLoop.ts               # requestAnimationFrame + delta 时间 clamp
    │   ├── InputManager.ts           # 键盘/鼠标状态采集，PointerLock 支持
    │   └── EventBus.ts               # 全局事件总线 + 事件名常量定义
    │
    ├── camera/                       # 相机系统
    │   └── FPSCamera.ts              # 第一人称相机，0.002 灵敏度模型，欧拉角 YXZ 顺序
    │
    ├── weapons/                      # 武器系统
    │   ├── WeaponData.ts             # 武器配置 TypeScript 接口定义
    │   ├── HitscanWeapon.ts          # ★ 射线武器核心：射击→射线检测→伤害计算→反馈
    │   ├── FireRateController.ts     # 射速节流（半自动/连发/全自动模式）
    │   ├── RecoilSystem.ts           # 确定性后坐力点序列 + 时间回复
    │   └── SpreadSystem.ts           # 随机锥角散布 + 时间回复
    │
    ├── targets/                      # 靶子系统
    │   ├── Target.ts                 # 3D 球体靶子：身体球 + 头部球 + 不可见碰撞球（1.6x）
    │   └── TargetSpawner.ts          # 靶子生成器：单靶即时刷新 + 对象池复用 + 随机位置
    │
    ├── shooting/                     # 射击/命中反馈
    │   └── HitFeedback.ts            # 五层反馈总控：准星→靶子→数字→震动→暂停
    │
    ├── scoring/                      # 计分排名
    │   └── ScoreManager.ts           # 计分 + 连击 + 精度 + localStorage 排行榜
    │
    ├── effects/                      # 视觉效果
    │   ├── CameraShake.ts            # 创伤衰减屏幕震动
    │   └── HitPause.ts               # 命中微冻结（时间缩放）
    │
    ├── ui/                           # UI 层
    │   ├── Crosshair.ts              # 动态点准星（Canvas 渲染，支持自定义颜色）
    │   └── DamageNumbers.ts          # 浮动伤害数字（全屏 Canvas，3D→2D 投影）
    │
    └── utils/                        # 工具函数
        ├── MathUtils.ts              # clamp / lerp / degToRad / randomRange
        └── ObjectPool.ts             # 泛型对象池（预创建 + 获取 + 归还 + 重置）
```

### 6.3 每个文件的具体职责

#### index.html — 游戏入口

**职责：** 完整的 UI 骨架 + 全局 CSS 样式。

包含：
- **加载画面** (`#loading`)：渐变天蓝色背景 + 进度条 + 状态文字，加载完成后淡出
- **准星容器** (`#crosshair-container`)：固定屏幕中央的 48×48 Canvas
- **伤害数字画布** (`#damage-canvas`)：全屏 Canvas，用于渲染浮动 "+1"
- **游戏 HUD** (`#hud`)：顶部计时器 + 分数 + 精度
- **弹药栏** (`#ammo-bar`)：底部弹药显示（当前/备弹）
- **按键提示** (`#key-hints`)：左上角常驻操作提示
- **主菜单** (`#menu-overlay`)：START GAME + Settings + 排行榜
- **设置面板** (`#settings-overlay`)：独立窗口，准星颜色/DPI/灵敏度/靶子尺寸/全屏
- **结算界面** (`#end-overlay`)：最终分数 + PLAY AGAIN + Back to Menu
- **早期错误捕获** (`<script>`)：window.onerror 监听，JS 报错时显示在加载画面

#### src/main.ts — 入口模块

**职责：** 引导应用启动。立即更新加载画面状态文字为 "Module loaded, starting..."，使用 `setTimeout(50ms)` 调用 `new Game()`，外层 try-catch 捕获致命错误并显示在 UI 上。

#### src/core/Game.ts — 主控制器 ★

**职责：** 整个项目的核心。1062 行，包含：

- **初始化流程：** Renderer → Scene → Input → Camera → 手枪/步枪/匕首模型 → 环境 → 武器 → UI → 靶子生成器 → 光照 → 事件监听 → 游戏循环 → 指针锁定
- **游戏状态机：** `GameState.MENU / PLAYING / ENDED` 三态切换
- **每帧循环：** 时间缩放 → 相机 → 移动 → 武器更新 → 枪模跟随 → 准星 → 射击/近战 → 换弹 → 武器切换 → 靶子 → 震动 → 伤害数字 → 渲染
- **移动系统：** WASD + Shift 冲刺 + 空格跳跃 + 重力 + Q/E 飞行 + AABB 碰撞检测推离
- **环境构建：** 50×50m 地面 + 四面 12m 墙壁 + 射击台（8m宽） + 隔板 + 天花板 + 距离标记 + 导轨柱
- **武器切换：** 1=手枪 2=步枪 3=匕首，cycleWeapon() 和 switchToMelee()
- **程序化武器建模：** buildPistolModel() / buildRifleModel() / buildKnifeModel() 三个方法，纯 BoxGeometry + CylinderGeometry + TorusGeometry 拼接
- **菜单 UI 绑定：** Start / Settings / Replay / Back to Menu / Exit / Clear Scores / Fullscreen Toggle 等按钮事件
- **设置持久化：** loadSettings() + saveSettings()，localStorage 读写

#### src/core/GameLoop.ts — 游戏循环

**职责：** 封装 `requestAnimationFrame`，提供 `start()` / `stop()`。核心逻辑：

```typescript
const dt = Math.min((now - lastTime) / 1000, 0.033); // 最大 33ms，防止标签页切换后帧爆炸
```

#### src/core/InputManager.ts — 输入管理器

**职责：** 将原始 DOM 键盘/鼠标事件转化为每帧可查询的状态。

- `keysDown: Set<string>` — 当前按下的键
- `keysPressed: Set<string>` — 本帧刚按下的键（瞬时）
- `keysReleased: Set<string>` — 本帧刚松开的键（瞬时）
- `mouseDX / mouseDY` — 本帧鼠标移动增量（累加）
- `isTriggerDown / isTriggerPressed / isTriggerReleased` — 鼠标左键三种状态
- `tabPressed / isReloadPressed / switchWeaponPressed` — 特殊按键标志
- `endFrame()` — 每帧结束时清空瞬时状态（pressed/released/delta）

所有按键名统一 `toLowerCase()` 处理。空格键 `e.preventDefault()` 防止页面滚动。

#### src/core/EventBus.ts — 事件总线

**职责：** 全局发布-订阅系统。

```typescript
class EventBus {
  private listeners: Map<string, Set<EventHandler>>;
  on(event, handler): void;
  off(event, handler): void;
  emit(event, ...args): void;
}
```

导出 `GameEvents` 常量对象，包含所有事件名：
`WEAPON_SHOT` / `WEAPON_RELOAD_START` / `WEAPON_RELOAD_COMPLETE` / `WEAPON_EMPTY` / `TARGET_HIT` / `TARGET_MISS` / `TARGET_DESTROYED` / `TARGET_SPAWNED` / `SCORE_CHANGED` / `COMBO_CHANGED` / `AMMO_CHANGED` / `GAME_READY`

#### src/camera/FPSCamera.ts — 第一人称相机

**职责：** Three.js PerspectiveCamera 封装。

- `pointerSpeed: 1.0` — 用户可调灵敏度倍数
- `applySensitivity(dpi, sens)` — 根据 DPI + 灵敏度计算 `pointerSpeed = (dpi/800) * sens`
- `getCmPer360()` — 估算 `cm/360 ≈ 25000 / (dpi * pointerSpeed)`
- 欧拉角使用 `YXZ` 旋转顺序（先 Yaw 后 Pitch），确保 Pitch 始终在局部 X 轴
- Pitch 限制 ±89°（`minPolarAngle` / `maxPolarAngle`），防止万向节翻转
- 窗口 resize 时自动更新 aspect ratio

#### src/weapons/WeaponData.ts — 武器数据接口

**职责：** 定义所有武器配置的 TypeScript 类型。

```typescript
interface WeaponConfig {
  id, name, type, fireRate, fireMode, magSize, maxAmmo, reloadTime, damage,
  range: { effective, max },
  spread: { base, perShot, max, recoveryPerSec },
  recoil: { offsets[], recoverySpeed, recoveryDelay },
  damageFalloff: { curve, steps[], minDamagePercent },
  sounds: { shoot[], reload, empty }
}
```

#### src/weapons/HitscanWeapon.ts — 射线武器核心 ★

**职责：** 射击系统的中心。241 行。

- `tryShoot()` — 完整射击流程：
  1. 检查射速节流（FireRateController.canFire）
  2. 检查弹药
  3. 消耗弹药 + 切换状态为 Shooting
  4. 获取后坐力偏移（RecoilSystem.getShotOffset）
  5. 计算射击方向（相机前方 + 散布随机偏移 + 后坐力偏移）
  6. 射线检测（Raycaster.intersectObjects）
  7. 命中 → 检查 headshot → 计算伤害衰减 → 返回 HitResult
  8. 未命中 → 返回 null
  9. 发射 WEAPON_SHOT 和 AMMO_CHANGED 事件

- `reload()` — 开始换弹（设置 Reloading 状态 + 记录开始时间）
- `completeReload()` — 计算装填量，更新弹药，发射事件
- `calculateDamage()` — 根据距离阶梯表计算伤害倍率 + 爆头 2.5x 加成
- `checkHeadshot()` — 遍历命中对象及其祖先，检查 `userData.isHeadshotZone`

#### src/weapons/FireRateController.ts — 射速控制器

**职责：** 根据武器 RPM 和开火模式限制射击频率。

- 半自动：每按一次扳机一发（需检测 trigger pressed 而非 held）
- 连发：每次扣扳机射出 N 发（burstCount）
- 全自动：按住连续射击
- `shotInterval = 60000 / RPM`（RPM → 毫秒间隔）

#### src/weapons/RecoilSystem.ts — 后坐力系统

**职责：** 确定性后坐力模式。

- 维护一个 `currentIndex` 指针，每次射击取 `offsets[currentIndex]` 的 yaw/pitch 偏移
- 指针循环使用（弹完最后一个从第一个重新开始）
- 累积偏移随时间回复（`recoverySpeed` × dt 的 lerp）
- 回复前有 `recoveryDelay` 延迟（停止射击后等 N 秒才开始回复）

#### src/weapons/SpreadSystem.ts — 散布系统

**职责：** 随机锥角散布。

- 每次射击 `spread += perShot`，上限 `maxSpread`
- 时间回复：`spread -= recoveryPerSec × dt`，下限 `baseSpread`
- `applySpread(direction)` — 在锥角内随机选择一个垂直轴旋转方向

#### src/targets/Target.ts — 靶子实体

**职责：** 单个靶子的视觉+碰撞模型。

- 身体球：`SphereGeometry(size, 48, 48)` + `MeshStandardMaterial`（红色，金属光泽）
- 头部球：`SphereGeometry(innerSize, 32, 32)` 偏移在身体上方 `size*0.85` 处，带黄色 emissive 自发光
- 碰撞球：`SphereGeometry(size*1.6, 24, 24)` + `MeshBasicMaterial({visible:false})` — 不可见但参与射线检测，1.6x 容差
- 状态机：Alive → 浮动+自转 / Hit → 高亮闪烁 / Dead → 缩放到 0.01
- `flashHit(isHeadshot)` — 命中时身体球变白/金 + emissive 高亮，180ms 后恢复
- `dispose()` — 清理所有 geometry 和 material

#### src/targets/TargetSpawner.ts — 靶子生成器

**职责：** 管理靶子的生成、回收和生命周期。

- 对象池：预创建 3 个 Target 实例，`get()` 从池中取，`release()` 归还
- 单靶模式：同一时间只有 1 个存活靶子
- 命中后 150ms 自动生成下一个（监听 TARGET_HIT 事件）
- 超时未命中 100ms 后生成下一个（监听 TARGET_MISS 事件）
- 随机位置：X=-10~10（20m 宽度），Y=0.8~9.2（离地到天花板），Z=-5~-24（纵深）
- 靶子尺寸通过 `setScale(scale)` 实时调节，应用于 `mesh.scale.setScalar(scale)`
- `spawnFirst()` — 游戏开始时生成第一个靶子
- `clear()` — 结算时清除所有靶子

#### src/scoring/ScoreManager.ts — 计分与排名

**职责：** 分数追踪 + 计时器 + 排行榜持久化。

- 每命中一个靶子 +1 分（固定，不区分身体/爆头）
- 60 秒倒计时（setInterval 1 秒递减），最后 10 秒 HUD 变红
- `startTimer(onEnd)` / `stopTimer()` — 计时器控制
- 排行榜：`localStorage` 存储，排序取前 5 名，含分数/日期/精度
- `clearHighScores()` — 清空所有记录
- `saveCurrentScore()` — 游戏结束时保存当前成绩

#### src/shooting/HitFeedback.ts — 命中反馈总控

**职责：** 协调五层反馈。

- L1：Crosshair.flashHit() — 准星变色+放大
- L2：Target.flashHit() — 靶子高亮
- L3：DamageNumbers.spawn() — 浮动 "+1"
- L4：CameraShake.addTrauma() + HitPause.trigger() — 震动+冻结

#### src/effects/CameraShake.ts — 屏幕震动

**职责：** 创伤衰减模型。

```typescript
addTrauma(amount) → trauma += amount (max 1.0)
update(dt) → shake = trauma²; offset = random * shake * 0.04; trauma -= 1.5 * dt
```

#### src/effects/HitPause.ts — 命中暂停

**职责：** 微冻结时间缩放。

```typescript
trigger(duration) → timeScale = 0.05, remaining = duration
update(dt) → 计时递减，归零后 timeScale = 1.0
```

#### src/ui/Crosshair.ts — 动态点准星

**职责：** 独立 Canvas 渲染的准星。

- 白色圆点（radius=1.6px） + 黑色外圈光晕（radius=3.6px）
- 命中时变色（白→红 / 白→金）+ 放大（radius=3.0px）
- dotColor 可通过设置面板自定义
- 散布增大时圆点轻微变大

#### src/ui/DamageNumbers.ts — 浮动伤害数字

**职责：** 全屏 Canvas 渲染的 "+1" 浮动文字。

- 对象池：预创建 8 个 DamageNumber 实例
- 3D→2D 投影：`worldPos.project(camera)` → 屏幕像素坐标
- 动画：向上漂移 40px + 淡出（最后 200ms）
- 身体命中：白色 22px，爆头：金色 30px

#### src/utils/ObjectPool.ts — 泛型对象池

**职责：** 通用对象池实现。

- `factory: () => T` — 创建新实例的工厂函数
- `resetFn: (item: T) => void` — 重置实例为初始状态的函数
- `prewarmCount` — 预创建数量
- `get()` — 从 available 栈取，空则 factory 新建
- `release(item)` — 调用 resetFn 后归还
- `releaseAll()` — 释放所有活跃实例

#### src/utils/MathUtils.ts — 数学工具

**职责：** 常用数学函数。

- `clamp(value, min, max)` — 值钳制
- `lerp(a, b, t)` — 线性插值
- `degToRad(degrees)` — 角度转弧度
- `randomRange(min, max)` — 随机浮点数

#### data/weapons.json — 武器参数表

**职责：** 两把枪的完整数值配置。

手枪（pistol）：半自动 400RPM，17发弹匣，51备弹，2.0秒换弹，伤害 35，射程 40/100m
步枪（rifle）：全自动 600RPM，30发弹匣，90备弹，2.5秒换弹，伤害 28，射程 60/200m

每把武器包含：后坐力点序列（手枪 5 点，步枪 8 点）+ 散布参数 + 伤害衰减阶梯表

#### data/targets.json — 靶子预设表

**职责：** 三种靶子预设 + 生成参数。

- close_large：半径 0.55，距离 15m，存活 5 秒
- mid_medium：半径 0.38，距离 30m，存活 4 秒
- far_small：半径 0.22，距离 50m，存活 3.5 秒

生成配置：最大 8 个同时激活，800ms 间隔，12×6m 生成区域，1.2m 最小间距

#### build.bat — 一键构建脚本

**职责：** 三步自动化流水线：`npm run build`（TypeScript 编译）→ `node build-nw.cjs`（NW.js 打包）→ `ISCC.exe installer.iss`（Inno Setup 安装程序）

#### build-nw.cjs — NW.js 打包脚本

**职责：** 将 Vite 的 dist/ 输出打包为独立 .exe。自动生成 .ico 图标，写入 NW.js 所需的 package.json，调用 nw-builder 库完成构建。

#### installer.iss — Inno Setup 安装脚本

**职责：** 定义 Windows 安装程序的配置。LZMA2 压缩，允许选择安装路径，创建桌面快捷方式 + 开始菜单 + 卸载入口，安装后自动启动游戏。

#### version.cjs — 版本管理脚本

**职责：** `node version.cjs` 查看版本，`node version.cjs bump` 小版本 +1（自动更新 package.json + CHANGELOG.md），`node version.cjs set 2.0` 手动设大版本。

#### tsconfig.json — TypeScript 配置

**职责：** `strict: true`（全严格模式），`target: ES2022`，`moduleResolution: bundler`，`resolveJsonModule: true`（支持 JSON 导入）

#### vite.config.ts — Vite 构建配置

**职责：** 端口 3000，自动打开浏览器，`@` 路径别名指向 `src/`，输出 ES2022 目标

---

## 七、数据流与系统交互

### 7.1 射击命中完整数据流

```
用户点击鼠标左键
  → InputManager.isTriggerPressed = true
  → Game.update() 检测到触发
  → HitscanWeapon.tryShoot()
      → FireRateController.canFire() ✓
      → currentMag-- (17→16)
      → RecoilSystem.getShotOffset() → { yaw: 0.0, pitch: -0.015 }
      → SpreadSystem.applySpread(direction)
      → Raycaster.intersectObjects(targets, true)
      → 命中！返回 HitResult
      → events.emit(WEAPON_SHOT) ────→ ScoreManager.totalShots++
      → events.emit(AMMO_CHANGED) ────→ HUD 更新弹药显示
  → HitFeedback.onHit()
      → Crosshair.flashHit()           # L1: 准星变红
      → Target.flashHit()              # L2: 靶子高亮
      → DamageNumbers.spawn("+1")      # L3: 浮动数字
      → CameraShake.addTrauma(0.1)     # L4a: 屏幕震动
      → HitPause.trigger(0.03)         # L4b: 命中暂停
      → events.emit(TARGET_HIT) ──────→ ScoreManager.totalHits++ / score+=1 / combo++
                                        → TargetSpawner 150ms 后 spawnNext()
  → Target.state = Hit
  → 180ms 后 Target.despawn()
```

### 7.2 菜单 → 游戏 → 结算 完整流程

```
[启动] → Game.init() → 加载画面 → [MENU 状态]
[MENU] → 场景渲染背景 + 菜单面板显示
  → 点击 START GAME → startGame()
      → 隐藏菜单，显示 HUD + 按键提示
      → 重置分数/计时器/武器
      → 应用设置（DPI/灵敏度/靶子尺寸/全屏）
      → 生成第一个靶子
      → 启动 60 秒倒计时
      → 请求 PointerLock
      → [PLAYING 状态]
[PLAYING] → 每帧处理移动/射击/靶子
  → 计时器归零 → endGame()
      → 停止计时器/靶子生成
      → 保存分数到 localStorage
      → 隐藏 HUD/按键提示
      → 释放 PointerLock
      → 显示结算面板
      → [ENDED 状态]
  → Tab 键 → returnToMenu()
      → 停止计时器/清除靶子
      → 回到 [MENU 状态]
[ENDED] → PLAY AGAIN → startGame() → [PLAYING]
       → Back to Menu → returnToMenu() → [MENU]
```

### 7.3 武器切换数据流

```
用户按 1 → switchWeaponPressed
  → cycleWeapon()
      → 隐藏当前枪模，显示手枪模型
      → currentWeaponId = 'pistol'
      → currentWeapon = weapons.get('pistol')
      → 更新 HUD 弹药显示

用户按 2 → switchWeaponPressed
  → cycleWeapon()
      → 隐藏当前枪模，显示步枪模型

用户按 3 → wasKeyPressed('3')
  → switchToMelee()
      → 隐藏所有枪模，显示匕首模型
      → isMelee = true
      → 弹药显示 "∞ / ∞"

用户按 1/2 (从匕首切回)
  → cycleWeapon()
      → isMelee = false
      → 显示对应枪模
```

---

## 八、构建与分发流水线

### 8.1 开发环境

```bash
cd demo
npm install          # 安装依赖（仅初次）
npm run dev          # 启动 Vite 开发服务器 → http://localhost:3000
```

Vite HMR 支持热更新：修改 .ts 源码 → 浏览器秒级刷新。

### 8.2 生产构建

```bash
双击 build.bat       # 一键完成三步：
```

**第一步：TypeScript 编译**
```
npx vite build
→ 编译 26 个模块
→ 输出 dist/index.html (12KB) + dist/assets/index-XXXXXX.js (524KB)
→ 耗时 ~1.2 秒
```

**第二步：NW.js 打包**
```
node build-nw.cjs
→ 生成 .ico 图标
→ 创建 package.nw 目录（NW.js 清单 + 游戏文件）
→ 下载/复用 NW.js 运行时（~120MB，首次慢，后续缓存秒过）
→ 输出 demo/release/tactical-range.exe
→ 耗时 ~5 秒（有缓存）
```

**第三步：安装程序制作**
```
ISCC.exe installer.iss
→ LZMA2 压缩 release/ 目录（520MB → ~200MB）
→ 输出 demo/installer/TacticalRange-Setup-v1.0.0.exe
→ 耗时 ~140 秒
```

### 8.3 分发

```
发送给用户：TacticalRange-Setup-v1.0.0.exe（~200MB）

用户端流程：
  双击安装程序 → 选择安装路径 → 安装完成 → 桌面快捷方式 → 启动游戏
  不需要 Node.js / npm / 浏览器
```

---

## 九、版本管理规范

### 版本号格式

```
v<major>.<minor>

major  — 大版本号，仅手动进位（重大重构、产品定位变更）
minor  — 小版本号，每次功能更新自动 +1（1.0 → 1.1 → … → 1.99）
```

### 操作命令

```bash
node version.cjs              # 查看当前版本
node version.cjs bump         # 小版本 +1
node version.cjs set 2.0      # 手动设置大版本
```

每次 `bump` 自动：更新 `package.json` → `CHANGELOG.md` 顶部插入新版本占位条目

---

## 十、性能指标

| 指标 | 数值 | 备注 |
|------|------|------|
| TypeScript 源码 | 2,801 行 | 26 个 .ts 文件 |
| JSON 配置 | 127 行 | 2 个 .json 文件 |
| HTML/CSS | 338 行 | 单文件 |
| Vite 构建产物 | 524KB JS + 12KB HTML | gzip 后 ~137KB |
| NW.js 运行时 | ~520MB | 含完整 Chromium + Node.js |
| 安装程序 | ~200MB | LZMA2 压缩后 |
| FPS | 60fps (稳定) | 60Hz 显示器 |
| 内存占用 | ~300MB | 含 Chromium 运行时 |
| 启动时间 | ~2 秒 | 冷启动（含 NW.js 初始化） |

---

*文档生成日期：2026-07-20*  
*对应版本：Tactical Range Demo v1.0*

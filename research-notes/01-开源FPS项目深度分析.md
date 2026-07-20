# 开源 FPS 游戏项目深度分析报告

> 本报告基于对 GitHub 上 10+ 个知名开源 FPS 项目的源码深入研究，总结架构模式、最佳实践和技术选型，为我们的 FPS 项目提供参考。

---

## 一、研究项目总览

| # | 项目 | 星标 | 技术栈 | 架构模式 | 物理引擎 |
|---|------|------|--------|----------|----------|
| 1 | [mohsenheydari/three-fps](https://github.com/mohsenheydari/three-fps) | 228⭐ | Three.js + ammo.js + Webpack | ECS + FSM | ammo.js (Bullet) |
| 2 | [Tiger-Foxx/three-very-minimalist-fist-person-shooter](https://github.com/Tiger-Foxx/three-very-minimalist-fist-person-shooter) | 3⭐ | Three.js + TypeScript + Webpack | Entity/Actor/Behavior + BehaviorTree | 自研碰撞检测 |
| 3 | [davidinfante/First-Person-Shooter-JS](https://github.com/davidinfante/First-Person-Shooter-JS) | 28⭐ | Three.js + Physijs + jQuery | 面向对象 (Scene/Map/Enemy) | Physijs (ammo.js封装) |
| 4 | [chawkitariq/motor](https://github.com/chawkitariq/motor) | — | Three.js + TypeScript + Vite | Component-based Engine | 自研 BoxCollider |
| 5 | [ufocoder/fps](https://github.com/ufocoder/fps) | 83⭐ | TypeScript + 纯手写光追 | ECS + System | 无(DDA光追) |
| 6 | [iErcann/enari-engine](https://github.com/iErcann/enari-engine) | 273⭐ | Three.js + ammo.js + TypeScript + Vite | Actor/Pawn/Controller | ammo.js |
| 7 | [MohdYahyaMahmodi/3d-fps-maze-game](https://github.com/MohdYahyaMahmodi/3d-fps-maze-game) | — | Three.js + 纯JS | 面向对象 | 自研AABB |
| 8 | [Baklawaa/iron-veil](https://github.com/Baklawaa/iron-veil) | — | Three.js + PWA | 编译打包 | 自研 |
| 9 | [Frederik353/three-js-fps-game](https://github.com/Frederik353/three-js-fps-game) | — | React + Three.js | React组件 + Game类 | 基础 |
| 10 | [FlySkyPie/three-fps-ts](https://github.com/FlySkyPie/three-fps-ts) | — | TypeScript + ammo.js | ECS (three-fps的TS移植) | ammo.js |

---

## 二、核心架构模式对比

### 模式 1：ECS (Entity Component System)

**代表项目：** three-fps, ufocoder/fps

```
ECS 核心思想：
Entity  = 纯ID，不含任何数据
Component = 纯数据，挂载到Entity上
System  = 纯逻辑，遍历拥有特定Component的Entity
```

**three-fps 的实现：**
```javascript
// Entity.js — 持有组件集合 + 位置/旋转
class Entity {
  constructor() {
    this.name = null;
    this.components = {};       // 组件字典
    this.position = new Vector3();
    this.rotation = new Quaternion();
    this.parent = null;         // 指向 EntityManager
    this.eventHandlers = {};    // 消息系统
  }

  AddComponent(component) { ... }  // 注册组件
  GetComponent(name) { ... }       // 获取组件
  Broadcast(msg) { ... }           // 组件间消息传递
  Update(timeElapsed) { ... }      // 遍历更新所有组件
}

// Component.js — 所有组件的基类
class Component {
  constructor() { this.parent = null; }
  Initialize() {}
  Update(_) {}
  PhysicsUpdate(_) {}
}

// EntityManager.js — 管理所有实体
class EntityManager {
  Add(entity) { ... }           // 注册实体
  Get(name) { ... }             // 按名称查找
  EndSetup() { ... }            // 统一初始化所有组件
  Update(timeElapsed) { ... }   // 遍历所有实体更新
}
```

**ufocoder/fps 的实现（更纯粹的ECS）：**
```typescript
type Entity = number;  // 实体就是数字ID！

abstract class System {
  abstract componentsRequired: Set<Function>;  // 声明需要的组件
  abstract update(dt: number, entities: Set<Entity>): void;
}
```

**优缺点：**
- ✅ 组件高度可复用，数据与逻辑分离
- ✅ 易于添加新功能（加新System即可）
- ✅ 天然支持数据驱动
- ❌ 学习曲线较陡
- ❌ 简单的功能也需要多个组件配合
- ❌ 调试时难以追踪数据流

---

### 模式 2：Entity/Actor/Behavior 分层

**代表项目：** Tiger-Foxx/three-very-minimalist-fist-person-shooter

```
分层职责：
Entity   = 游戏对象容器，持有 Actor + Behavior + HP
Actor    = 视觉表示（3D模型、动画、Mesh）
Behavior = 逻辑行为（移动、射击、AI）
```

**源码结构：**
```typescript
// Entity.ts — 通用游戏对象
class Entity<A extends Actor, B extends Behavior> {
  type: string;          // 类型标识 (ENTITY_TYPE.PLAYER, .ENEMY...)
  actor: A;              // 视觉层
  behavior: B;           // 逻辑层
  hp?: number;           // 生命值
  velocity?: Vector3;    // 速度
  isCollideTransparent: boolean;  // 碰撞穿透
  animations: ActorAnimator[];     // 动画队列

  get mesh() { return this.actor.mesh; }

  onHit(damage: number, entity?: Entity) {
    if (typeof this.hp === 'number') this.hp -= damage;
  }

  update(delta: number) {
    this.actor.update(delta);
    this.behavior.update(delta);
    // 播放动画队列
  }
}

// Behavior.ts — 最简单的接口
interface Behavior {
  update: (delta: number) => void;
}
```

**继承层次示例：**
```
Entity (抽象容器)
├── Player (玩家)
│   ├── PlayerActor (第一人称模型)
│   └── ControlledBehavior (键盘鼠标控制)
├── Enemy (敌人)
│   ├── EnemyActor (敌人模型)
│   └── EnemyBehavior (行为树AI)
├── Bullet (子弹)
│   ├── BulletActor (子弹Mesh)
│   └── BulletBehavior (直线飞行)
├── Gun (武器)
│   ├── GunActor (武器模型)
│   └── GunBehavior (射击逻辑)
│       ├── GunBehaviorRaycast (射线检测)
│       └── GunBehaviorBullet (发射弹丸)
└── Wall (墙壁)
    ├── WallActor (墙壁Mesh)
    └── WallBehavior (静态)
```

**优缺点：**
- ✅ 直观易懂，面向对象思维
- ✅ 每层职责清晰
- ✅ 容易调试和追踪
- ❌ 继承层次可能过深
- ❌ 组件不如ECS灵活复用

---

### 模式 3：Actor/Pawn/Controller

**代表项目：** iErcann/enari-engine (273⭐)

```
游戏层：
Game (单例，管理一切)
├── Renderer (渲染器)
├── Physics (物理世界，ammo.js)
├── InputManager (输入管理)
├── AudioManager (音频)
├── PlayerWrapper[]
│   └── Player → Pawn → Actor
│       ├── FPSRenderer (第一人称渲染)
│       └── PlayerController (输入控制)
├── Actor[]
│   ├── CubeRenderer (带物理的方块)
│   └── MapMesh (地图碰撞)
└── GlobalLoadingManager (资源加载)
```

**游戏循环：**
```typescript
class Game {
  update() {
    const dt = Math.min(20/1000, (now - lastUpdate) / 1000);

    // 1. 输入预处理
    this.currentPlayer.player.prestep(dt);
    this.inputManager.update(dt);

    // 2. 所有Actor逻辑更新
    for (let actor of this.actors) actor.update(dt);

    // 3. 玩家更新（物理运动）
    this.currentPlayer.player.update(dt);

    // 4. 物理步进
    this.physics.update(dt);

    // 5. 渲染
    this.renderer.update(dt);

    requestAnimationFrame(this.update);
  }
}
```

**优缺点：**
- ✅ 接近Unreal Engine的概念模型
- ✅ 清晰的关注点分离
- ✅ 单例Game类方便全局访问
- ❌ 单例模式可能导致耦合
- ❌ 需要理解Unreal的概念

---

### 模式 4：传统面向对象

**代表项目：** davidinfante/First-Person-Shooter-JS

```
结构：
index.html → script.js (入口)
├── TheScene (场景总控)
│   ├── Map (地图)
│   ├── Enemies (敌人管理)
│   ├── Bullets (子弹管理)
│   ├── Crosshair (准星)
│   ├── Skybox (天空盒)
│   └── avatar (玩家角色)
└── 全局变量控制移动 (moveForward, moveLeft...)
```

**简单直接但缺乏架构。**

---

## 三、武器系统对比分析

### three-fps 的武器系统

```javascript
// Weapon.js — 单把AK47
class Weapon extends Component {
  constructor(camera, model, flash, world, shotSound, listener) {
    this.fireRate = 0.1;        // 射速(秒)
    this.magAmmo = 30;          // 弹匣子弹
    this.ammoPerMag = 30;       // 弹匣容量
    this.ammo = 100;            // 备弹
    this.damage = 2;            // 伤害
    this.reloading = false;     // 换弹状态
  }

  // 每帧更新
  Update(t) {
    this.mixer.update(t);          // 动画
    this.stateMachine.Update(t);   // FSM状态 (idle/shoot/reload)
    this.Shoot(t);                 // 射击逻辑
    this.AnimateMuzzle(t);         // 枪口火焰
  }

  // 射线检测射击
  Raycast() {
    const start = new Vector3(0, 0, -1).unproject(this.camera);
    const end = new Vector3(0, 0, 1).unproject(this.camera);

    if (AmmoHelper.CastRay(this.world, start, end, hitResult, collisionMask)) {
      const entity = hitResult.collisionObject.parentEntity;
      entity?.Broadcast({ topic: 'hit', from: this.parent, amount: this.damage });
    }
  }

  // 射击节流
  Shoot(t) {
    if (!this.shoot || !this.magAmmo) return;
    if (this.shootTimer <= 0.0) {
      this.magAmmo--;
      this.Raycast();
      this.shotSound.play();
      this.shootTimer = this.fireRate;
    }
    this.shootTimer = Math.max(0, this.shootTimer - t);
  }
}
```

**WeaponFSM.js — 武器状态机：**
```
idle ──shoot──> shoot ──自动──> idle
  │                                │
  └────────reload (R键)────────────┘
```

### Tiger-Foxx 的武器系统（更完整的设计）

```
武器继承层次：
Gun (基类 Entity)
├── GunBehavior (行为基类)
│   ├── GunBehaviorRaycast (射线检测武器)
│   │   └── Damage随距离衰减
│   └── GunBehaviorBullet (弹丸发射武器)
├── Inheritor/
│   ├── Machinegun (机枪)
│   ├── Shotgun (霰弹枪 — 多弹丸)
│   ├── BoomerangGun (回旋镖枪)
│   └── EnemyGunBullet (敌人专用)
└── GunRaycast/GunBullet (配置数据)
```

**Shotgun 的关键实现逻辑：**
```
每发子弹 → for i in [0, bulletsPerShoot):
  direction = 基础方向 + 随机散布角度
  raycast → 命中检测 → damage(距离衰减)
  spawn ShootTrace (弹道线特效)
  spawn ShootMark (弹孔贴花)
```

### 关键设计启示

| 功能 | three-fps | Tiger-Foxx | 推荐方案 |
|------|-----------|------------|----------|
| 武器配置 | 硬编码 | WeaponData对象 | **JSON配置文件驱动** |
| 射击方式 | 射线检测 | 射线+弹丸双模式 | **策略模式** |
| 状态管理 | FSM | 无显式状态 | **FSM (idle/shoot/reload/equip)** |
| 伤害模型 | 固定值 | 距离衰减 | **配置化伤害曲线** |
| 弹道特效 | 枪口火焰 | 弹道线+弹孔 | **两者结合** |
| 音效 | 单一shot音效 | AudioSlices | **音频切片+随机变体** |

---

## 四、AI系统对比分析

### three-fps 的 FSM AI

```
状态机：Idle → Patrol → Chase → Attack → Dead
         ↑        ↑        ↓        ↓
         └────────└────────└────────┘

Idle:    随机等待1-5秒 → Patrol
         看到玩家 → Chase

Patrol:  导航到随机navmesh节点
         到达 → Idle
         看到玩家 → Chase

Chase:   每0.5秒更新寻路目标为玩家位置
         进入攻击距离 → Attack
         丢失玩家 → Patrol?

Attack:  面向玩家，播放攻击动画
         攻击判定帧 → HitPlayer()
         玩家离开范围 → Chase

Dead:    播放死亡动画一次，永久停留
```

**核心：视线检测**
```javascript
CanSeeThePlayer() {
  // 1. 距离检查 (maxViewDistance²)
  // 2. 角度检查 (viewAngle = cos(45°))
  // 3. 射线检测 (ammo.js CastRay — 是否有遮挡)
}
```

### Tiger-Foxx 的 Behavior Tree AI

**行为树结构：**
```typescript
type BehaviorTreeNode =
  ControlFlowNode |    // if/else 条件分支
  SequenceNode |       // 顺序执行全部子节点
  FunctionNode;        // 叶子节点（具体行为）

// 运行方式：每帧从根节点递归执行
class BehaviorTree {
  updateNode(node, delta) {
    if (typeof node === 'function')        → 执行叶子
    if ('condition' in node)               → if(条件) true分支 else false分支
    if ('sequence' in node)                → 依次执行，遇false停止
  }
}
```

**实际行为树定义：**
```typescript
// 基础敌人行为序列
const basicEnemySeq = {
  sequence: [
    hurtNode,              // 受伤硬直检查
    updateCollisions,      // 碰撞伤害
    updateFollowingEnemy,  // 锁定目标
    attackCond,            // 攻击距离判断 → 射击
    strafe,                // 横向移动
    gunpointStrafe         // 瞄准反应
  ]
};

// 不同类型敌人的行为树变体
basicEnemySeq      — 近战敌人
longRangeEnemySeq  — 远程敌人 (保持距离)
bleedEnemySeq      — 流血敌人 (持续掉血)
kamikazeEnemySeq   — 自爆敌人 (没有攻击条件，直接冲)
parasiteEnemySeq   — 寄生敌人 (感染后逃跑找新宿主)
```

**FSM vs Behavior Tree 对比：**

| 维度 | FSM | Behavior Tree |
|------|-----|---------------|
| 复杂度 | 简单直观 | 中等 |
| 可扩展性 | 差 (状态爆炸) | 好 (组合节点) |
| 可视化 | 状态图 | 树形图 |
| 条件判断 | 转移条件 | 内嵌条件节点 |
| 适合场景 | 简单AI | 复杂多变的AI |
| 调试难度 | 容易 | 中等 |

---

## 五、游戏循环设计对比

### 标准帧循环模式（所有项目通用）

```typescript
// 模式1：requestAnimationFrame + 时间delta（最常用）
class GameLoop {
  update() {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.033); // 最大33ms防止螺旋

    this.scene.Update(dt);     // 逻辑更新
    this.renderer.render();    // 渲染

    this.lastTime = now;
    requestAnimationFrame(() => this.update());
  }
}
```

### three-fps 的循环层次

```
requestAnimationFrame
  → PhysicsUpdate (物理步进)
    → entity.PhysicsUpdate (每个实体的物理)
  → Update (逻辑更新)
    → entity.Update (每个实体的逻辑)
      → Component.Update (每个组件)
        → Weapon.Shoot
        → CharacterController.MoveAlongPath
        → CharacterFSM.Update
  → Render (Three.js自动)
  → Stats.update (性能监控)
```

### enari-engine 的循环层次

```
requestAnimationFrame
  → player.prestep(dt)       # 输入预处理
  → inputManager.update(dt)  # 输入处理
  → actors[i].update(dt)     # 所有对象逻辑
  → player.update(dt)        # 玩家物理
  → physics.update(dt)       # 整个物理世界步进
  → renderer.update(dt)      # 渲染
```

### 关键启示

1. **delta时间必须clamp** — 防止标签页切换后的大跳跃
2. **固定时间步长可选** — 物理推荐固定步长（如1/60s），渲染用可变
3. **更新顺序要确定** — 输入 → 逻辑 → 物理 → 渲染
4. **性能监控内置** — stats.js是标配

---

## 六、资源管理对比

### 资源加载流程

**three-fps 的集中加载：**
```javascript
async LoadAssets() {
  const promises = [];
  // 并行加载所有资源
  promises.push(this.AddAsset(level, gltfLoader, "level"));
  promises.push(this.AddAsset(ak47, gltfLoader, "ak47"));
  promises.push(this.AddAsset(ak47Shot, audioLoader, "ak47Shot"));
  promises.push(this.AddAsset(mutant, fbxLoader, "mutant"));
  // ... 更多资源
  await Promise.all(promises);  // 全部加载完才能开始
}
```

**Tiger-Foxx 的资源管理：**
```typescript
// 分离加载器
export const texturesStore = { ... };  // 纹理仓库
export const audioStore = { ... };     // 音频仓库
// 带进度回调
const onTexturesProgress = (progress: number) => { ... };
const onSoundsProgress = (progress: number) => { ... };
// 分开加载，互不阻塞
```

**ufocoder/fps 的资源清单：**
```typescript
// presets.ts — 集中定义所有资源
export const sounds = { ... };      // 音效列表
export const textures = [ ... ];    // 纹理列表
export const sprites = [ ... ];     // 精灵列表
export const animation = { ... };   // 动画配置
// 由Manager分别加载
soundManager.load(presets.sounds);
textureManager.load([...presets.textures, ...presets.sprites]);
animationManager.load(presets.animation);
```

### 推荐方案

```
assets/
├── models/       # .glb/.gltf 3D模型
├── textures/     # 贴图、天空盒
├── sounds/       # .mp3/.wav 音效
├── sprites/      # UI精灵图
└── data/         # JSON配置文件
    ├── weapons.json
    ├── enemies.json
    └── levels.json

加载流程：
1. 显示Loading画面
2. AssetManager.loadAll({ onProgress })
3. 进度条更新
4. 加载完成 → 初始化游戏世界
5. 运行时按需加载（可选）
```

---

## 七、配置数据设计（资料库）

### 武器数据设计

**推荐结构（综合各项目优点）：**
```json
{
  "weapons": {
    "ak47": {
      "name": "AK-47",
      "type": "hitscan",
      "fireRate": 0.1,
      "magSize": 30,
      "maxAmmo": 120,
      "reloadTime": 2.5,
      "damage": { "min": 25, "max": 35 },
      "range": { "effective": 50, "max": 200 },
      "spread": { "hip": 3.0, "ads": 0.5 },
      "recoil": { "vertical": 1.5, "horizontal": 0.5 },
      "model": "models/ak47.glb",
      "animations": {
        "idle": "ak47_idle",
        "shoot": "ak47_shoot",
        "reload": "ak47_reload",
        "equip": "ak47_equip"
      },
      "sounds": {
        "shoot": ["ak47_shot_1.wav", "ak47_shot_2.wav"],
        "reload": "ak47_reload.wav"
      }
    }
  }
}
```

### 敌人数据设计

```json
{
  "enemies": {
    "zombie": {
      "name": "僵尸",
      "health": 100,
      "speed": 2.5,
      "damage": { "melee": 15 },
      "attackRange": 2.0,
      "viewDistance": 30,
      "viewAngle": 90,
      "ai": "behaviorTree.zombie",
      "model": "models/zombie.glb",
      "animations": {
        "idle": "zombie_idle",
        "walk": "zombie_walk",
        "attack": "zombie_attack",
        "die": "zombie_die",
        "hurt": "zombie_hurt"
      },
      "drops": [
        { "item": "health_pack", "chance": 0.15 },
        { "item": "ammo", "chance": 0.30 }
      ]
    }
  }
}
```

---

## 八、项目结构推荐（综合最佳实践）

```
FPS/
├── index.html                     # 入口HTML
├── package.json                   # 依赖管理
├── tsconfig.json                  # TypeScript配置
├── vite.config.ts                 # 构建配置
│
├── public/                        # 静态资源（直接serve）
│   └── favicon.ico
│
├── assets/                        # 游戏资源
│   ├── models/                    # 3D模型 (.glb)
│   │   ├── weapons/
│   │   ├── enemies/
│   │   └── environment/
│   ├── textures/                  # 贴图
│   ├── sounds/                    # 音效/音乐
│   └── sprites/                   # 2D精灵
│
├── data/                          # 资料库 (JSON配置)
│   ├── weapons.json               # 武器属性表
│   ├── enemies.json               # 敌人属性表
│   ├── items.json                 # 道具属性表
│   ├── levels.json                # 关卡配置
│   └── balance.json               # 数值平衡参数
│
├── src/                           # 源代码
│   ├── main.ts                    # 入口，初始化引擎
│   │
│   ├── core/                      # 引擎核心
│   │   ├── Game.ts                # 游戏主类 (单例)
│   │   ├── GameLoop.ts            # 游戏循环
│   │   ├── Time.ts                # 时间管理 (delta, timescale)
│   │   ├── EventBus.ts            # 全局事件总线
│   │   └── AssetManager.ts        # 资源加载管理
│   │
│   ├── ecs/                       # ECS框架
│   │   ├── Entity.ts              # 实体
│   │   ├── Component.ts           # 组件基类
│   │   ├── System.ts              # 系统基类
│   │   └── World.ts               # ECS世界管理
│   │
│   ├── components/                # 组件
│   │   ├── TransformComponent.ts  # 位置/旋转/缩放
│   │   ├── MeshComponent.ts       # 3D模型
│   │   ├── CollisionComponent.ts  # 碰撞体
│   │   ├── HealthComponent.ts     # 生命值
│   │   ├── WeaponComponent.ts     # 武器持有
│   │   └── AIComponent.ts         # AI状态
│   │
│   ├── systems/                   # 系统
│   │   ├── InputSystem.ts         # 输入处理
│   │   ├── MovementSystem.ts      # 移动
│   │   ├── PhysicsSystem.ts       # 物理
│   │   ├── WeaponSystem.ts        # 武器逻辑
│   │   ├── DamageSystem.ts        # 伤害计算
│   │   ├── AISystem.ts            # AI行为
│   │   ├── AnimationSystem.ts     # 动画
│   │   ├── RenderSystem.ts        # 渲染调度
│   │   └── AudioSystem.ts         # 音频
│   │
│   ├── weapons/                   # 武器模块
│   │   ├── WeaponData.ts          # 武器数据类型
│   │   ├── WeaponRegistry.ts      # 武器注册表
│   │   ├── HitscanWeapon.ts       # 射线检测武器
│   │   ├── ProjectileWeapon.ts    # 弹丸武器
│   │   └── WeaponStateMachine.ts  # 武器状态机
│   │
│   ├── ai/                        # AI模块
│   │   ├── BehaviorTree.ts        # 行为树引擎
│   │   ├── AIConditions.ts        # 条件节点库
│   │   ├── AIActions.ts           # 动作节点库
│   │   └── EnemyBehaviors.ts      # 具体行为树定义
│   │
│   ├── player/                    # 玩家模块
│   │   ├── PlayerController.ts    # 玩家控制器
│   │   ├── FirstPersonCamera.ts   # 第一人称相机
│   │   └── PlayerState.ts         # 玩家状态
│   │
│   ├── ui/                        # UI模块
│   │   ├── HUD.ts                 # 抬头显示
│   │   ├── Crosshair.ts           # 准星
│   │   ├── HealthBar.ts           # 血条
│   │   ├── AmmoDisplay.ts         # 弹药显示
│   │   ├── DamageVignette.ts      # 受伤血框
│   │   └── KillFeed.ts            # 击杀信息
│   │
│   └── utils/                     # 工具函数
│       ├── MathUtils.ts           # 数学工具
│       ├── ObjectPool.ts          # 对象池
│       ├── Raycaster.ts           # 射线工具
│       └── RandomUtils.ts         # 随机工具
│
├── tools/                         # 开发工具
│   └── balance-calculator/        # 数值平衡计算器
│
└── docs/                          # 文档
    ├── architecture.md            # 架构文档
    ├── GDD.md                     # 游戏设计文档
    └── api.md                     # API文档
```

---

## 九、关键技术决策总结

| 决策点 | 选项A | 选项B | **推荐** | 理由 |
|--------|-------|-------|----------|------|
| 架构模式 | ECS | Entity/Actor/Behavior | **ECS** | 游戏越复杂越需要ECS |
| 物理引擎 | ammo.js | 自研简单物理 | **自研** | FPS仅需射线+简单碰撞 |
| 构建工具 | Webpack | **Vite** | Vite | 开发体验好10倍 |
| 武器系统 | FSM | 无状态 | **FSM** | idle/shoot/reload天然是状态 |
| AI系统 | FSM | BehaviorTree | **混合** | 简单敌人FSM，复杂敌人BT |
| 配置文件 | 硬编码 | JSON/YAML | **JSON** | 简单够用，无需额外工具 |
| 资源加载 | 全部预加载 | 按需加载 | **预加载+Loading画面** | Web游戏资产不大 |
| 游戏循环 | 可变时间步长 | 固定时间步长 | **可变+clamp** | 渲染帧同步 |
| 事件通信 | 直接调用 | EventBus | **EventBus** | 解耦组件 |

---

## 十、分阶段实施路线图

### Phase 1：最小可玩原型 (MVP)
- [x] Vite + TypeScript + Three.js 项目搭建
- [ ] 第一人称相机 + WASD移动 + 鼠标视角
- [ ] 一个平面地面 + 几个方块障碍物
- [ ] 一把射线检测枪（点击射击）
- [ ] 准星UI
- [ ] 一个静态敌人（能被击中消灭）

### Phase 2：完善核心循环
- [ ] 武器系统（多武器 + FSM状态机）
- [ ] 弹药/换弹系统
- [ ] 敌人AI（巡逻/追击/攻击）
- [ ] 伤害系统 + 生命值
- [ ] 简易HUD（血量、弹药、准星）
- [ ] 音效系统

### Phase 3：内容丰富
- [ ] 多类型武器（手枪/步枪/霰弹枪）
- [ ] 多类型敌人（近战/远程/自爆）
- [ ] 关卡系统（多关卡 + 关卡切换）
- [ ] 道具系统（血包、弹药）
- [ ] 特效（枪口火焰、弹孔、粒子）

### Phase 4：打磨
- [ ] 后处理效果
- [ ] UI美化
- [ ] 数值平衡
- [ ] 性能优化
- [ ] 主菜单 + 暂停菜单

---

*分析日期：2026-07-20*
*分析项目数：10+*

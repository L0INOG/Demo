# Changelog

All notable changes to the Tactical Range Demo will be documented in this file.

---

## Versioning Rules

| 规则 | 说明 |
|------|------|
| **小版本** | `v1.0` → `v1.1` → `v1.2` … 无限延伸，可达 `v1.99` |
| **大版本** | 仅在主观决定时进位，如 `v1.99` → `v2.0`，不会自动触发 |
| **记录格式** | 每条记录 = 日期 + 版本号 + 变更摘要 |
| **自动化** | 每次更新时在此文件顶部追加新条目，同时更新 `package.json` 版本号 |

### 版本号语义

```
v<major>.<minor>

major  — 大版本号，仅手动进位（重大重构、产品定位变更）
minor  — 小版本号，每次功能更新自动 +1（1.0 → 1.1 → … → 1.99）
```

### 自动化脚本

```bash
# 查看当前版本
node version.js

# 小版本自动 +1（1.0 → 1.1）
node version.js bump

# 手动设置大版本
node version.js set 2.0
```

每次 `bump` 会自动：
1. 更新 `package.json` 中的 `version` 字段
2. 在 `CHANGELOG.md` 顶部插入新版本占位条目
3. 提示你填写变更内容

---

## Version History

## v1.0 (2026-07-20)

### Features
- Three.js + TypeScript + Vite 项目架构
- 第一人称相机：PointerLock + 原始鼠标输入 + 灵敏度系统
- WASD 移动 + 空格跳跃 + 碰撞检测（墙壁/台子/隔板）
- 两把枪械：手枪（半自动）+ 突击步枪（全自动），JSON 数据驱动
- 近战匕首（按 3 切换）
- 射击系统：Hitscan 射线检测 + 后坐力 + 散布 + 伤害衰减
- 自动换弹 + 换弹动画（套筒后座）
- 程序化武器模型：手枪、步枪、匕首
- 3D 球体靶子 + 头部判定区 + 不可见碰撞球（1.6x 容差）
- 单靶即时刷新：命中/超时后 150ms 生成下一个
- 60 秒计时赛制，每靶固定 +1 分
- 命中反馈：准星闪烁 + 靶子闪光 + 浮动 "+1" + 屏幕震动 + 命中暂停
- 动态点准星（可调颜色）
- 主菜单 / 设置 / 结束结算 三界面
- 设置面板：准星颜色、鼠标 DPI、灵敏度、靶子尺寸、cm/360 估算
- 排行榜（前 5 名）localStorage 持久化 + 清空功能
- 天蓝色明亮场景：四面围墙 + 天花板 + 射击台 + 距离标记
- 碰撞检测系统（AABB 推离）
- Tab 返回菜单
- 子弹命中同一靶子防重复计分

### Tech
- Three.js 0.170, TypeScript 5.7, Vite 6
- ECS 风格事件总线解耦
- Object Pool 对象池复用
- localStorage 设置 + 排行榜持久化

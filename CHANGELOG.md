# 更新日志

本项目遵循 [Conventional Commits](https://www.conventionalcommits.org/) 与 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

### 基线规则调研
- 整理宜昌花牌（上大人）规则：110 张 = 22 字 × 5；三人各 25 张、庄 26 张；胡牌 = 8 个轮 + 1 个口；门槛 ≥17 胡。
- 沉淀 `docs/rules.md`（含 9 项待拍板口径与来源冲突清单）与 `docs/rules-research.md`（8 个来源 + 出处）。

### 计划
- 确定技术栈与里程碑，落地 `docs/plan.md`。
- 拍定：横屏锁定（`sensorLandscape`）、一期只做手机、手牌采用分列竖向堆叠（一列 = 一个轮/口）。

## [0.1.0] - M0 环境与骨架

### 新增
- pnpm workspace 轻量 monorepo：`packages/engine`（纯 TS）+ `apps/web`（Vite + React）。
- 工具链：TypeScript 7 strict、ESLint 10 flat config、Prettier、Vitest 5、fast-check、@testing-library/react。
- 纯度纪律：`engine` 包 `lib: ["ES2022"]`（无 DOM）+ ESLint `no-restricted-imports`（禁 React/Node/app 层）。
- 横屏三段式版面占位（顶栏 28 / 主区 128 / 底部带 182）与竖屏「请横屏」遮罩。
- `docs/` 三份文档入库。

### 修复
- 修复工作区 Windows 文件权限：当前登录用户缺失该目录的完全控制权限，导致所有 shell 命令无法启动。

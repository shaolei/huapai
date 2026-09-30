# 宜昌花牌 · 上大人（单机版）

浏览器里能玩的宜昌花牌（上大人／湖北花牌），再用 Capacitor 套一层安卓壳，CI 自动打出 APK。

**1 真人 + 2 AI · 离线单机 · 横屏锁定**

---

## 这是什么

宜昌花牌是流行于湖北宜昌、枝江、公安、荆州一带的传统字牌游戏，用 **110 张**牌、
**22 个字每个 5 张**，三人各摸 **25 张**，把手牌做成 **「8 个轮 + 1 个口」** 即可胡牌。

完整规则见 **[docs/rules.md](docs/rules.md)**（含 9 项待拍板口径与来源冲突标注）；
调研原文与逐条出处见 **[docs/rules-research.md](docs/rules-research.md)**；
开发计划与里程碑见 **[docs/plan.md](docs/plan.md)**。

---

## 技术栈

| 层 | 选型 |
|---|---|
| 核心规则 | **纯 TypeScript**（`packages/engine`，无 React / DOM / Node 依赖） |
| UI | **React + 原生 CSS**（不引 UI 框架、不引 Tailwind） |
| 构建 | **Vite** |
| 测试 | **Vitest**（+ fast-check 属性测试、@testing-library/react） |
| 安卓打包 | **Capacitor**（横屏锁定 `sensorLandscape`） |
| 自动出 APK | **GitHub Actions + Gradle** |

---

## 目录结构

```
huapai/
├─ packages/engine/     纯 TS 规则引擎：牌库 / 胡牌分解 / 算胡 / 状态机 / AI
├─ apps/web/            React 客户端（Vite），含 Capacitor 壳与 android/ 工程
├─ docs/                规则、调研、开发计划
└─ .github/workflows/   CI：测试 + 构建 + 出 APK
```

`packages/engine` 的纯度由两道关卡守住：它的 `tsconfig` 只声明 `lib: ["ES2022"]`（没有 DOM），
且 ESLint 禁止它 import `react` / Node API / app 层代码。

---

## 快速开始

```bash
pnpm install
pnpm dev            # 启动开发服务器（浏览器）
pnpm test           # 全量单元测试
pnpm typecheck      # 类型检查
pnpm lint           # ESLint
pnpm build          # 构建产物到 apps/web/dist
```

> **本机沙箱提示**：如果你的环境禁止写工作区之外的目录（npm/pnpm 默认缓存位置），
> 需要把缓存与 store 重定向进仓库，例如：
> `node <pnpm.mjs> --store-dir ./.cache/pnpm-store install`，并把 `npm_config_cache` 指向 `./.cache/npm`。
> `.cache/` 已在 `.gitignore` 中。

---

## 开发纪律

- **提交规范**：Conventional Commits —— `feat(engine):` / `fix(ui):` / `test(score):` / `chore(ci):`
- **提交粒度**：每个模块 + 它的单测 = 一个提交，保证任何历史点 `pnpm test` 都能跑过。
- **规则改动**：任何规则口径的调整都必须同时改 `RuleSet` 默认值与对应测试，并在 `docs/rules.md` 更新。
- **不要在 `packages/engine` 里 import React/DOM/Node**，ESLint 会拦。

---

## 里程碑

M0 骨架 → M1 牌库 → M2 胡牌分解+算胡 → M3 状态机 → M4 AI → M5 牌桌 UI → M6 打磨 → M7 安卓壳 → M8 CI 出包。
进度见 [docs/plan.md §14](docs/plan.md)。

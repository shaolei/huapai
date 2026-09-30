# 更新日志

本项目遵循 [Conventional Commits](https://www.conventionalcommits.org/) 与 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

### 引擎（`packages/engine`）
- `cards.ts` 牌库：110 张 = 22 字 × 5；红字 9 / 经字 5（每字 2 花 + 3 素）/ 黑字 13；花字不是百搭。
- `rng.ts` 可复现随机：mulberry32 + Fisher-Yates 洗牌，不用 `Math.random`，同 seed 同一局牌。
- `meld.ts` 句表 14 种（固定句 6 + 数序句 8，乙通一）、口补齐、轮的种类与张数。
- `hand.ts` 不可变手牌结构 + 计数/分组/增删。
- `rules.ts` **RuleSet 规则开关**：把 docs/rules.md §9 的 9 项待拍板口径全部下沉为配置，
  含半胡单位（1 胡 = 2 半胡）与四个预设（基线三人 / 宜昌本地档 / 仅固定句 / 经取 3 条）。
- `arrange.ts` 手牌分列编排：一列 = 一个轮，供 UI 按「8 个轮 + 1 个口」直接呈现。
- 累计 **77 个单测**，含 200 副随机牌的不丢牌/不造牌 fuzz。

### 基线规则调研
- 整理宜昌花牌（上大人）规则：110 张 = 22 字 × 5；三人各 25 张、庄 26 张；胡牌 = 8 个轮 + 1 个口；门槛 ≥17 胡。
- 沉淀 `docs/rules.md`（含 9 项待拍板口径与来源冲突清单）与 `docs/rules-research.md`（8 个来源 + 出处）。
- **新增 §9.2 阻塞项**：有「统/开招/开泛」时 26 张怎么数 —— 规则资料内部对不上
  （8 轮全 3 张时 24+2=26 自洽；含 1 个统时 25+2=27；含 1 个开泛时 26+2=28）。
  已列出三种可能解释，**需业务方拍板后才实现 `win.ts`**。

### 计划
- 确定技术栈与里程碑，落地 `docs/plan.md`。
- 拍定：横屏锁定（`sensorLandscape`）、一期只做手机、手牌采用分列竖向堆叠（一列 = 一个轮/口）。

## [0.1.0] - M0 骨架 + M1 牌库与数据结构

### 新增
- pnpm workspace 轻量 monorepo：`packages/engine`（纯 TS）+ `apps/web`（Vite + React）。
- 工具链：**TypeScript 6** strict、ESLint 10 flat config、Prettier、Vitest 5、fast-check、@testing-library/react。
  （TS 之所以锁 6 而不是最新的 7：`typescript-eslint` 的 peer 范围是 `>=4.8.4 <6.1.0`，TS 7 会让 lint 整条链报错。）
- 纯度纪律：`engine` 包 `lib: ["ES2022"]`（无 DOM）+ ESLint `no-restricted-imports`（禁 React/Node/app 层）。
- 横屏三段式版面占位（顶栏 28 / 主区 128 / 底部带 182）与竖屏「请横屏」遮罩。
- `docs/` 三份文档入库。

### 修复
- 修复工作区 Windows 文件权限：当前登录用户缺失该目录的完全控制权限，导致所有 shell 命令无法启动。
- `pnpm-workspace.yaml` 固定 `nodeLinker: hoisted`，规避 Windows 上 `ERR_PNPM_SYMLINK_FAILED`。

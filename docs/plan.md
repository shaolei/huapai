# 宜昌花牌（上大人）单机版安卓游戏 · 开发计划

技术栈：**纯 TS 核心 + React/CSS UI + Vite 构建 + Vitest 测试 + Capacitor 打包安卓 + GitHub Actions/Gradle 自动出 APK**。
已拍板：**横屏锁定（`sensorLandscape`），一期只做手机**；手牌采用**分列竖向堆叠**（一列 = 一个轮/口）。

> 状态：**已批准，执行中**。里程碑进度见文末 §14。

---

## 0 目标与验收

**一句话目标**：先用 Web 技术做成浏览器里能完整玩的宜昌花牌（1 真人 + 2 AI），再用 Capacitor 套安卓壳，CI 打 tag 自动产出可安装 APK。

**一期完成的定义（DoD）**
1. `pnpm dev` 在浏览器里能从头到尾打完一局三人花牌：发牌 → 摸打 → 对/开招/统/踏船/开泛 → 胡牌 → 结算 → 再来一局。
2. `pnpm test` 全绿：牌库构成、胡牌分解、算胡、听牌、状态机、AI 合法性、**列布局不溢出**。
3. **横屏版面在 800×360（小屏下限）和 915×412（主流机型）下都不溢出**；手牌分列堆叠，**每张牌顶部的字带都可见**，最下面一张完整可见。
4. CI 在 tag 推送后产出可安装的 `app-debug.apk`（release 签名后置）。
5. `docs/rules.md` 与 `docs/plan.md` 沉淀在仓库里，规则每个可变量都有对应测试。

**一期非目标**：联机对战、账号/后端、内购、云存档、4 人局、恩施「别杠/太极图」变体、宜昌「百和」121 张变体、平板专门适配、竖屏布局。

---

## 1 规则整理

规则权威文档在 [rules.md](rules.md)，调研原文与逐条出处见 [rules-research.md](rules-research.md)。摘要：

- **110 张 = 22 字 × 5 张**；红字 9（上大人可知礼三五七）、经字 5（乙三五七九，每字 2 花 + 3 素）、黑字 13。花字**不是百搭**。
- 三人局：各 25 张、庄 26 张、牌墙 34（翻 1 张定庄则 33）。
- 胡牌 = **26 张 = 8 个轮 + 1 个口**，**无「将」**；门槛 ≥17 胡（基线）。
- **句表 14 种**：固定句 6（上大人/孔乙己/化三千/七十土/八九子/可知礼）+ 数序句 8（乙通一：乙二三 … 八九十）。
- 算胡：句 1 / 对 1 / 坎 2 / 招统 4 / 开泛 8，黑字减半；经 素 1 花 2，主经 ×2。
- 结算：自摸两家伙，点炮单付。
- **9 项拍板清单**与来源冲突见 [rules.md §9](rules.md)，全部下沉为 `RuleSet` 开关。

---

## 2 前置步骤：修工作区文件权限 ✅

`D:\workspace\aicoding\huapai` 存在但沙箱无法授予写权限，导致一切 shell 命令启动失败。

- 已用 `diagnose-windows-sandbox-acl` 技能脚本做「诊断即修复」的非受限执行：为当前登录用户补上该目录完全控制权限，**未改文件内容与属主**。
- 验证：`WRITE_OWNER` false→true，`grant_dacl` **verified**；随后受限模式下 shell 恢复正常。
- 回滚命令（如需要）：
  `pwsh -NoProfile -File 'D:\workspace\aicoding\huapai-acl-recovery\acl-backup-f1945d3630dd41b9b47c400c633c4c67.json.ps1' -Path 'D:\workspace\aicoding\huapai' -AllowRoot 'D:\workspace\aicoding\huapai' -Restore 'D:\workspace\aicoding\huapai-acl-recovery\acl-backup-f1945d3630dd41b9b47c400c633c4c67.json'`
- **本机环境注意**：沙箱下 npm/pnpm 的默认缓存与 store 目录在工作区之外，会被拒写。
  所有安装命令需把缓存重定向进工作区，例如：
  `node <pnpm.mjs> --store-dir <repo>/.cache/pnpm-store install`（并把 `npm_config_cache` 指向 `<repo>/.cache/npm`）。
  该目录已在 `.gitignore` 中忽略，不进版本库。

---

## 3 技术栈与仓库骨架

**轻量 monorepo（2 个包）**，用真实包边界保证「核心规则是纯 TS」：

```
huapai/
  pnpm-workspace.yaml
  package.json                # 根：scripts（dev/build/test/lint）
  tsconfig.base.json
  eslint.config.js            # flat config，含"engine 不得引 React/DOM/Node"约束
  .gitattributes .gitignore .editorconfig .prettierrc.json .prettierignore
  docs/
    rules.md                  # 规则权威文档（含拍板清单）
    rules-research.md         # 调研原始资料 + 来源 URL
    plan.md                   # 本计划
  packages/engine/            # 纯 TS，零运行时依赖，tsconfig lib 不含 DOM
  apps/web/                   # Vite + React + CSS，含 capacitor.config.ts 与 android/
  .github/workflows/android.yml
```

- 版本（M0 实测锁定）：React 19.3 / TypeScript 7.0 / Vite 8.3 / Vitest 5.0 / Capacitor 8.5 / ESLint 10.11 / Prettier 3.9。
- 包管理：pnpm 11（本机走 bundled `pnpm.mjs`）。
- `engine` 双重把关纯度：`tsconfig` 的 `"lib": ["ES2022"]`（无 DOM）+ eslint `no-restricted-imports`（禁 React/DOM/Node/app 层）。
- **不引入** Tailwind／UI 组件库／状态管理库／动画库；样式用原生 CSS + CSS 变量。

---

## 4 引擎设计（`packages/engine`，纯 TS，无副作用）

| 模块 | 职责 | 关键点 |
|---|---|---|
| `cards.ts` | 22 字枚举（稳定 id）、`Card{字, 花/素}`、`createDeck()`、红/经/黑标记表 | 常量表驱动；牌面文案与 id 分离 |
| `rng.ts` | 可复现伪随机（mulberry32）+ 洗牌 | 支持固定 seed 回放测试 |
| `hand.ts` | 手牌 = `Map<字, 张数>` + 副露 | 不可变更新，便于 undo |
| `meld.ts` | `轮` 类型：句/对/坎/招/统/开泛 + 明暗标记 | 句表常量 |
| `win.ts` | **胡牌分解器**：25/26 张拆成 8 轮 + 1 口，返回**全部**合法分解 | 按句表递归 + memo；先判「口」再补轮 |
| `listen.ts` | 听牌／撂听 → 可胡字集合（UI 提示与 AI 共用） | 「逐字试补后跑 win」 |
| `score.ts` | 算胡，多解取最大；门槛判定 | 内部半胡整数；RuleSet 注入 |
| `arrange.ts` | 把一组牌排成「列（轮/口）」的默认编排；接受人工覆盖 | 纯函数，输出 `Column[]` |
| `rules.ts` | `RuleSet` 配置类型 = 全部拍板开关 | 默认导出「三人基线」 |
| `game.ts` | **纯状态机**：`GameState / Action / reduce(state, action) → {state, events}` | 完全确定性、可序列化、可回放；无计时器 |
| `ai/` | 三档难度：easy=随机合法 / normal=向听数+胡数潜力贪心 / hard=向听+危险牌估计 | 复用 `win`/`listen` |

设计要点：

- **单一合法动作来源**：`legalActions(state)` 由引擎产出，UI 只渲染按钮、AI 只选一个 —— 杜绝 UI 与 AI 规则不一致。
- `reduce` 返回事件流（摸牌/打牌/对/胡/黄庄），UI 拿事件驱动动画，AI 拿事件更新记忆。
- 状态可 JSON 序列化 → 存档续玩、回放、CI 固定 seed 整局回归测试全部免费。

---

## 5 UI 设计（`apps/web`）—— 横屏锁定 + 手牌分列竖向堆叠

### 5.1 为什么是"一列 = 一个轮"

花牌的胡牌条件字面就是「**8 个轮 + 1 个口**」。单排平铺时玩家得在脑子里把 25 张重新分组；**分列堆叠后「有几列」就等于「有几个轮」**，数牌、找缺口、看听牌变成一眼的事。同时它符合真牌手感：真花牌竖着拿，每张露出的就是**顶部写字那一段**，最后一张完整可见。

### 5.2 列与牌面几何

- **一列 = 一个轮（句/对/坎/统）或一个口**；列内卡片纵向叠压，**下方压上方，最下面一张完整可见**。
- **牌面 30×92**（比例 1:3.07，保留细长观感）；**字画在顶部 30px 的「字带」内**（字 ~24px 居中），红/黑与花/素标记也在这一带内 → 叠压后每张牌的字都可见。
- **列高 = 92 + (n−1) × dy**，dy 默认 30：1 张 92 / 2 张 122 / 3 张 152 / 4 张（统）182；**第 5 张（开泛）自动压 dy 到 22**，仍超则加「+n」角标。
- **列宽 = 30 + 8 间距 = 38**；列序按句表：上大人 → 八九十 → 口 → 散张。
- **明牌（对/开招/踏船/开泛）并入底部带右侧**：`底部带 = [你的手牌列区] | [你的明牌列区]`。

### 5.3 版面预算（横屏下限 800×352 可用高度，主流 915×412）

| 区域 | 高度 | 内容 |
|---|---|---|
| 顶部信息条 | 28 | 局况、剩牌数、你的胡数与听牌状态、规则档 |
| 主区 | 128 | **左栏 AI（~104）｜中央弃牌堆 + 牌墙计数（~592）｜右栏 AI（~104）** |
| 底部带 | 182 | 手牌列区（左）｜分隔线｜明牌列区（右） |
| 余量 | 14 | 安全区 |
| **合计** | **352** | ✓ |

- **对手必须放左右栏**；对手副露用**紧凑徽章**：`孔×3`、`上·大·人`、`七×4 ⚑`（⚑ = 含花字）。
- 操作条（对/开招/统/踏船/开泛/胡/过）做成**浮层**覆盖主区下缘，无可操作时隐藏。
- 弃牌堆：中央横向自动换行，按家分列/分色，可折叠只显示最近 N 张。
- 安全区：横屏刘海在左右 → 全程吃 `env(safe-area-inset-left/right)`。
- **旋转保护**：Web/PWA 下检测方向，竖屏显示「请横屏」遮罩并暂停交互。
- 断点：只按**高度**分两档（<360 紧凑档 / ≥360 标准档）；**不写平板断点**。

### 5.4 列打包算法（`layoutHand`，纯函数，硬约束）

开局 25 张散张时若每张独占一列，25 × 38 = 950px 会溢出。规则：

1. 已成型的 句/对/坎/口 各占一列，不压缩；
2. **散张按每列最多 5 张合并**，dy 压缩到 22；
3. 仍溢出时：先压 dy → 再合并最短列 → **最后才退化为横向滚动**；
4. **硬保证**：`Σ(列宽+间距) ≤ 可用宽` 且 `列高 ≤ 可用高`。

### 5.5 交互设计（含已知取舍）

- **选牌**：点字带 → 该张**整牌抬出列外**并显示大按钮「打出 / 取消」；长按 → 放大预览；命中判定按「最近字带中心」把整列 y 区间分配给各张。
- **已知取舍**：露出的字带只有 30px 高，低于 44px 触控建议值。缓解 = 抬起后的大按钮 + 长按放大 + 最近中心判定。
- **理牌**：拖一张到另一列 = 合并成你要的组；拖到空白 = 拆成单列；一键**「自动理牌」**按引擎最优分解成列。
- **分组归谁定**：默认引擎自动成列，但**允许人工覆盖**（最优分解不一定等于你的打法）。
- **新摸的牌**：单独显示在牌墙侧的「待处理」槽并高亮；能补全某列时给该列发光提示（不自动并入）。
- **牌面渲染**：SVG 组件按「字 + 红/黑 + 花/素 + 花边」生成，不用位图；字体走系统楷体/宋体回退。
- **状态接入**：`GameStore`（普通 TS 类）+ `useSyncExternalStore`；AI 思考加 300–600ms 拟人延迟。
- **动画**：FLIP（`transform` + Web Animations API），零额外依赖；合并成列时用「滑入堆叠」动画强化反馈。
- **屏**：首页（开局：难度/规则档）→ 牌桌 → 单局结算 → 设置 → 规则说明。

### 5.6 屏幕方向的结论

分列之后手牌只需 ~380–530px 宽，两个方向算下来**牌面大小基本打平**（竖屏受宽度限制、横屏受 182px 高度限制）。所以横屏的价值是「**弃牌堆与场况有充足横向空间 + 三人围桌形态**」。**结论：横屏锁定**；若日后想改竖屏，因为布局已按高度分档且宽度需求很小，改造成本可控。

---

## 6 测试策略（Vitest）

| 层 | 内容 |
|---|---|
| 牌库单测 | 110 张总数、22 字 × 5、经字 2 花 + 3 素、红 9／黑 13 标记正确 |
| 洗牌/RNG | 同 seed 结果一致、分布粗检、洗牌不改牌堆多重集 |
| 句表 | 14 种句全部可识别，非法 3 字组合不识别 |
| 胡牌分解 | [rules.md §7](rules.md) 的正例/3 个负例；边界：全坎、多招统、撂听 |
| 属性测试（fast-check） | 分解出的轮张数之和 = 手牌总数；不产生重复解；`听牌集合 = {t \| 补 t 后能胡}`；**`layoutHand` 任意手牌 + 任意尺寸都不溢出、不丢牌** |
| `arrange` | 自动编排覆盖全部牌；人工覆盖被尊重 |
| 算胡 | 逐项对照算胡表；门槛 17/21/11/42 各一例；多解取最大 |
| 状态机 | 固定 seed + 动作序列 → 状态快照（golden replay）；非法动作必须被拒 |
| AI | fuzz 1000 局：无非法动作、不崩溃、必然终局（含黄庄） |
| UI | @testing-library/react 少量关键交互（选牌、对按钮可用性、胡按钮出现时机） |

**版面验收不引入 Playwright**：在 Chrome DevTools 设备模拟下按 **800×360 与 915×412** 人工验收（无溢出、无横向滚动、每张牌的字带可见），列为 M5/M7 验收项。

命令：`pnpm test`、`pnpm test:coverage`、`pnpm typecheck`、`pnpm lint`。

---

## 7 Android 打包（Capacitor）—— 横屏

- `capacitor.config.ts`：`appId: com.huapai.yichang`、`appName: 宜昌花牌`、`webDir: dist`、`android.allowMixedContent: false`。
- **`AndroidManifest.xml` 设 `android:screenOrientation="sensorLandscape"`**（允许左右横屏翻转，禁竖屏）。
- 沉浸式全屏：边到边 + 隐藏状态栏/导航栏。
- `<meta name="viewport" content="...viewport-fit=cover">`，全面吃 `env(safe-area-inset-*)`。
- **返回键**：牌桌内 → 退出确认弹窗；首页 → 退出应用。
- 图标/启动图：用 `@capacitor/assets` 从一张 1024 PNG + 一张横屏 splash 生成全套。
- 构建链：`pnpm build` → `npx cap sync android` → `./gradlew assembleDebug`。
- 本地构建需要 JDK 17 + Android SDK；**本机无 JDK**，故以 CI 出包为主路径，本地只做 `cap sync` 验证。

---

## 8 CI：GitHub Actions 自动出 APK

`.github/workflows/android.yml`：

- 触发：`push` tag `v*`、`workflow_dispatch`、PR（只跑测试）
- 步骤：checkout → setup Node 20 + pnpm 缓存 → `pnpm install --frozen-lockfile` → `pnpm lint && pnpm typecheck && pnpm test` → `pnpm build` → `npx cap sync android` → setup JDK 17 (temurin) + Android SDK → `./gradlew assembleDebug` → `actions/upload-artifact`
- Gradle 缓存 + pnpm store 缓存
- release 签名：`assembleRelease` + keystore 走 Secrets（`KEYSTORE_BASE64 / KEY_ALIAS / KEY_PASSWORD / STORE_PASSWORD`）；**一期先只出 debug 包**
- 需要 GitHub 远端仓库：本地 git 先行，远端地址提供后加 remote 并推送

---

## 9 Git 项目管理

- `git init`（默认分支 `main`）；`.gitattributes` 强制 `LF`，`.gitignore` 忽略 `node_modules/ dist/ .cache/ android/build/ *.keystore`
- 提交规范：Conventional Commits（`feat(engine):` / `fix(ui):` / `test(score):` / `chore(ci):`）
- 分支：`main` + `feat/mX-<主题>`；每个里程碑打 tag（`v0.1.0` … `v1.0.0`）+ 更新 `CHANGELOG.md`
- 提交粒度：**每个模块 + 其单测一个提交**，保证任何历史点 `pnpm test` 可跑

---

## 10 里程碑与验收标准

| 里程碑 | 交付 | 验收 |
|---|---|---|
| **M0 环境与骨架** | 权限修复；`git init`；pnpm workspace + Vite React TS 骨架 + Vitest + ESLint；`docs/` 三份文档入库 | `pnpm dev` 出页面、`pnpm test` 绿、首次提交完成 |
| **M1 牌库与数据结构** | `cards/rng/hand/meld` + 单测 | 牌库构成与洗牌测试全绿 |
| **M2 胡牌分解 + 算胡** | `win/listen/score/rules` + 全部用例 + 属性测试 | 正例 17 胡通过，3 个负例按预期失败，门槛切换生效 |
| **M3 游戏状态机** | `game.ts`：发牌/摸打/对/开招/统/踏船/开泛/胡/黄庄 + `legalActions` | 纯 TS 脚本能跑完一整局；golden replay 测试通过 |
| **M4 AI 三档** | `ai/easy\|normal\|hard` | fuzz 1000 局无非法动作；normal 对 easy 胜率显著 > 50% |
| **M5 横屏牌桌 UI** | `arrange` + `layoutHand` + 分列堆叠手牌 + 抬牌选牌 + 拖拽理牌 + 浮层操作条 + 左右对手栏 + 明牌列区 | 浏览器里完整打完一局；**800×360 与 915×412 双尺寸不溢出** |
| **M6 打磨** | FLIP 动画、音效开关、设置、规则页、本地存档续玩、紧凑档适配 | 手机 Chrome 横屏顺畅操作，小屏不挤 |
| **M7 Capacitor 安卓** | `android/` 工程、`sensorLandscape` 锁定、沉浸式全屏、返回键、图标启动图 | 真机横屏安装 APK 可玩完整一局 |
| **M8 CI 出包** | `android.yml` | 打 tag → Actions 产出可安装 APK artifact |

---

## 11 风险与对策

| 风险 | 对策 |
|---|---|
| **规则歧义（最大风险）** | 全部下沉为 `RuleSet` 开关；规则文档单列拍板清单；每个开关至少一个测试 |
| **列堆叠的字带只有 30px，触控偏小** | 抬起后的大按钮 + 长按放大 + 最近中心判定；已作为已知取舍备案 |
| **早期散张导致列数爆炸** | `layoutHand` 打包算法 + 属性测试硬保证不溢出 |
| **自动分组与玩家意图不一致** | 默认自动成列但允许拖拽覆盖 |
| 横屏纵向只有 ~350px，小屏易挤 | 对手强制左右栏 + 副露徽章化 + 操作条浮层；只按高度分两档断点 |
| 横屏刘海在左右遮挡 | 全程吃 `env(safe-area-inset-left/right)` |
| 胡牌分解性能 | 22 字 × ≤5 张，规模极小；递归 + memo，目标 <1ms |
| 特殊操作语义复杂易错 | 状态机显式动作 + 张数守恒属性测试 + fuzz 对局兜底 |
| Android/CI 环境（本机无 JDK） | 主路径走 CI；本地只要求 `cap sync` 通过；release 签名后置 |
| 中文牌面字体在安卓 WebView 缺失 | SVG 文字 + 回退字体，必要时内嵌 22 字子集字体 |
| 沙箱下 npm/pnpm 缓存被拒写 | 缓存与 store 重定向进 `<repo>/.cache/`（已 gitignore） |
| 素材版权 | 一期不用现成音效/图片，牌面自绘 SVG |

---

## 12 明确假设

1. 单人、离线、无后端、无账号；AI 与人类共用同一套规则与合法动作。
2. 一期只做 **3 人局**；引擎按「座位数」泛化，为二期 4 人局留口但不实现。
3. **横屏锁定（`sensorLandscape`），一期只做手机**；平板用同一套布局拉伸。
4. 版面验收下限 **800×360**，主流目标 915×412。
5. 手牌采用**分列竖向堆叠**（一列 = 一个轮/口），牌面 30×92、字带 30px；默认引擎自动成列，允许人工拖拽覆盖。
6. 基线 RuleSet = [rules.md](rules.md) 口径（门槛 17，经取 5 条，主经固定为「三」）；宜昌本地档作为可选配置项。
7. 不引入 CSS 框架、UI 组件库、状态管理库、动画库、e2e 测试框架；依赖总数保持个位数。
8. 本地 git 覆盖项目管理；GitHub 远端只用于 CI 出 APK。
9. 一期不打钱、不做联机；结算只记胡数与胜负。

---

## 13 首批产出物

1. `docs/rules.md`、`docs/plan.md`、`docs/rules-research.md`。
2. M0 骨架提交（仓库结构 + 工具链 + `README.md` + `CHANGELOG.md`）。
3. 之后每个里程碑一个 tag、一组提交、一份验收记录。

---

## 14 执行进度

| 里程碑 | 状态 | 备注 |
|---|---|---|
| 前置权限修复 | ✅ 完成 | `grant_dacl` verified；回滚命令见 §2 |
| M0 环境与骨架 | ✅ 完成 | pnpm workspace + Vite/React/Vitest/ESLint；横屏三带占位版面；tag `v0.1.0` |
| M1 牌库与数据结构 | ✅ 完成 | `cards/rng/meld/hand` + 44 个单测；牌库构成、洗牌多重集、句表正反例全绿 |
| M2 胡牌分解 + 算胡 | ✅ 完成 | `rules`(9 项开关) + `win`(8 单元 + 2 听头分解) + `score`(精表/主精/听头) + `listen`；四项口径已定案；engine 119 个测试全绿 |
| M3 游戏状态机 | ✅ 完成 | `game.ts`：发牌/请统/摸打/对/招/扎/开泛/胡/黄庄 + `legalActions`；纯函数 + 可序列化；40 局托管 fuzz 全程 110 张守恒 |
| M4 AI 三档 | ✅ 完成 | `ai/`：easy（随机/不响应/不扎）、normal（贪心推进手牌）、hard（+ 危险牌规避）；动作一律取自 `legalActions`，AI 不可能产出非法动作 |
| M5 横屏牌桌 UI | 🟡 基本完成 | ✅ `layoutHand`（列布局 + 打包，属性测试守住不溢出）+ 首页 + 牌桌（分列堆叠手牌/抬牌选牌/左右对手栏/明牌列/浮层操作条/弃牌堆/结算）+ 牌桌冒烟测试；⬜ 拖拽理牌与「自动理牌」按钮顺延到 M6 |
| M6 打磨 | 🟡 部分完成 | ✅ **黄庄率平衡**（hard×3 53%→11%）；✅ **拖拽理牌**（拖到别的牌上并成一列、拖到空白处拆开、一键自动理牌）；⬜ 动画 / 设置 / 规则页 / 存档；⬜ 真机视觉验收（需业务方） |
| M7 Capacitor 安卓 | ⬜ 未开始 | |
| M8 CI 出包 | ⬜ 未开始 | |

### 实测平衡数据

**M4 初版（1200 局）**

| 对局 | 座位 0 胜率 | 黄庄率 |
|---|---|---|
| normal vs 2×easy | 91.9% | 88% |
| hard vs 2×easy | 94.1% | 77% |
| hard vs 2×normal | 44.2% | 60% |
| normal ×3（对称性自检） | 34.2%（公平份额 33.3%） | 63% |

**M6 调优后（每格 200 局）**

| 对局 | 座位 0 胜率 | 黄庄率 | 变化 |
|---|---|---|---|
| normal vs 2×easy | 96.2% | 74% | — |
| hard vs 2×easy | 98.9% | 55% | ✅ |
| hard vs 2×normal | **46.0%** | 19% | ✅ hard 现在真的强于 normal（同配置 normal 是 39.0%） |
| normal ×3 | 39.0% | **30%** | ✅ 黄庄 66% → 30% |
| hard ×3 | 39.7% | **11%** | ✅ 黄庄 53% → 11% |

**诊断与修法**：先测出「黄庄时牌墙平均剩 0.00」——每局都打到墙底，说明瓶颈是
**牌墙只有 34 张（每家约 11 次换牌）**，而不是规则太苛刻。AI 强度与黄庄率单调相关
（easy 98% → normal 66% → hard 53%），所以问题在 **AI 的换牌效率**。

修法是给打牌加「**进张数**」评估：打完之后还有多少种字能真正推进手牌。
贪心只看眼前容易把"能连上别的牌"的字打掉，而牌墙这么短，**保住进张比当下多凑半个单元重要**。
normal 看前 4 个候选、hard 看前 8 个。

**一个负面结论（已写进代码注释）**：危险牌规避（`dangerOf`）做过三版，
200 局正面对抗全部测不出正收益（global ×8 → 34.3%、残局 ×6 → 34.3%、纯破平局 → 28.4%，
参照 normal 39.0%）。原因是牌墙短、对手真正听牌的窗口太窄，而防守让出的进度是实打实的损失。
**所以没有启用**，函数与单测保留，等牌墙变长或加入报听公告后重新测量再说。

### 实测环境备忘

- 本机 **无 JDK**，Android 本地构建不可用 → APK 走 CI（§8）。
- `pnpm` 必须用 bundled 版本：`node C:\Users\shaolei\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs`（**不在 PATH 上**）。
  - 因此根 `package.json` 里 `pnpm -r <script>` 这类脚本在本机直接失败（`'pnpm' is not recognized`）。
    **这只是本机环境问题**：CI 由 `pnpm/action-setup` 装上 pnpm 后脚本正常；
    本机要跑根脚本，在 `.cache/bin/pnpm.cmd` 放一个转发 shim 并加进 PATH 即可（`.cache/` 已 gitignore）：
    `@echo off` + `node "<pnpm.mjs 绝对路径>" %*`
  - 已用该 shim 实测：`pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` **全部通过**。
- `pnpm install` 专用参数（如 `--store-dir`）**不能**跟在 `pnpm <script>` 后面（`run` 不认这个选项），
  只在 install 时传。
- 沙箱禁止写工作区外目录时，npm 缓存需重定向：`npm_config_cache=<repo>/.cache/npm`；pnpm store 用 `--store-dir <repo>/.cache/pnpm-store`。
- `pnpm-workspace.yaml` 里固定了 `nodeLinker: hoisted`，是**刻意为之**（见 §3 注释），别改回默认，
  否则 Windows 上会踩 `ERR_PNPM_SYMLINK_FAILED`。
- **实测版本**：Node 24.14 / pnpm 11.7 / git 2.55 / React 19.3 / Vite 8.3 / Vitest 5.0 / ESLint 10.11 / **TypeScript 6.0.3**。
  TS 之所以锁 6 而不是最新的 7：`typescript-eslint` 的 peer 范围是 `>=4.8.4 <6.1.0`，TS 7 会直接报
  `typescript-eslint does not support TS 7.0`，lint 整条链就断了。

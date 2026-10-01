/**
 * @huapai/engine —— 宜昌花牌纯 TypeScript 规则引擎。
 *
 * 纯度契约（由 tsconfig 的 `lib: ["ES2022"]` 与 eslint 的 no-restricted-imports 双重把关）：
 * 本包不得引入 React、DOM、Node API，也不得反向依赖 app 层。
 */
export const ENGINE_VERSION = '0.1.0'

export * from './cards'
export * from './rng'
export * from './meld'
export * from './hand'
export * from './rules'
export * from './arrange'
export * from './win'
export * from './score'
export * from './listen'
export * from './game'
export * from './ai'

/**
 * 可复现的伪随机数与洗牌。
 *
 * 引擎必须完全确定：同一个 seed 必须给出同一局牌、同一条回放路径。
 * 所以这里不用 `Math.random()`，也刻意不提供以时间为 seed 的辅助函数 ——
 * 需要随机 seed 时由调用方（app 层）传入。
 */

/** 返回 [0, 1) 的随机数发生器。 */
export type Rng = () => number

/**
 * mulberry32：32 位状态、质量足够、实现只有几行的小型 PRNG。
 */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Fisher-Yates 洗牌。返回新数组，**不修改入参**。
 */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const swap = out[i] as T
    out[i] = out[j] as T
    out[j] = swap
  }
  return out
}

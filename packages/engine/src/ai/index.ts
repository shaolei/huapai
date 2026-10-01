/**
 * 三档 AI。
 *
 * | 难度 | 打牌 | 对/招 | 扎/开泛 | 防守 |
 * |---|---|---|---|---|
 * | easy   | 随机 | 从不 | 从不 | 无 |
 * | normal | 贪心最大化手牌进度 | 总是 | 总是 | 无 |
 * | hard   | 贪心 + 危险牌规避 | 总是 | 总是 | 有 |
 *
 * 接口刻意做成 `(state, difficulty, rng) → GameAction`：
 * 动作从 `legalActions(state)` 里挑，所以 **AI 永远不可能产出非法动作** ——
 * 这也是「UI 与 AI 共用同一套规则」的具体体现。
 * `rng` 由调用方注入，测试里给固定 seed 就完全可复现。
 */

import type { Card } from '../cards'
import {
  type GameAction,
  type GameState,
  actingSeat,
  allCardsOf,
  legalActions,
  playerAt,
} from '../game'
import type { Rng } from '../rng'
import { determineMainJing } from '../score'
import { dangerOf, handProgress, withoutCard } from './heuristics'

export type AiDifficulty = 'easy' | 'normal' | 'hard'

export const AI_DIFFICULTIES: readonly AiDifficulty[] = ['easy', 'normal', 'hard']

export { dangerOf, handProgress, withoutCard } from './heuristics'
export type { HandProgress } from './heuristics'

function pickRandom<T>(items: readonly T[], rng: Rng): T {
  const index = Math.min(items.length - 1, Math.floor(rng() * items.length))
  const picked = items[index]
  if (picked === undefined) throw new Error('pickRandom 收到空数组')
  return picked
}

/** easy —— 从不响应、从不扎，只随机打牌。 */
function chooseEasy(state: GameState, actions: readonly GameAction[], rng: Rng): GameAction {
  const pass = actions.find((action) => action.type === 'pass')
  if (pass && state.phase !== 'turn') return pass
  const discards = actions.filter((action) => action.type === 'discard')
  if (discards.length > 0) return pickRandom(discards, rng)
  const fallback = actions[0]
  if (!fallback) throw new Error('easy：没有可用动作')
  return fallback
}

/** normal / hard —— 贪心推进手牌，hard 额外规避危险牌。 */
function chooseSmart(
  state: GameState,
  seat: number,
  actions: readonly GameAction[],
  difficulty: AiDifficulty,
): GameAction {
  const ruleSet = state.ruleSet
  const meldActions = actions.filter((action) => action.type === 'zha' || action.type === 'fan')
  const pass = actions.find((action) => action.type === 'pass')
  const claim = actions.find((action) => action.type === 'claim')

  // 请统：有扎/开泛就做（锁单元 + 从牌底补张），否则过
  if (state.phase === 'qingtong') {
    const pick = meldActions[0] ?? pass
    if (!pick) throw new Error('请统阶段没有可用动作')
    return pick
  }

  // 响应：招/对都能白拿一个单元
  if (state.phase === 'claim') {
    const pick = claim ?? pass
    if (!pick) throw new Error('响应阶段没有可用动作')
    return pick
  }

  // 自己回合：先扎/开泛（做完还能继续打，不影响回合结构）
  if (meldActions.length > 0) {
    const pick = meldActions[0]
    if (pick) return pick
  }

  const player = playerAt(state, seat)
  const mainJing = determineMainJing(allCardsOf(player), ruleSet)

  let best: { action: GameAction; value: number } | null = null
  for (const action of actions) {
    if (action.type !== 'discard') continue
    const card = player.hand.find((item) => item.id === action.cardId)
    if (!card) continue

    const progress = handProgress(withoutCard(player.hand, action.cardId), ruleSet, mainJing)
    let value = progress.score
    if (difficulty === 'hard') {
      // 危险牌的权重刻意小于一个单元的 1000 分：
      // 只在「同样能推进手牌」的候选之间做安全取舍，不为防守牺牲成型。
      value -= dangerOf(state, seat, card) * 8
    }
    if (!best || value > best.value) best = { action, value }
  }

  if (best) return best.action
  const fallback = actions[0]
  if (!fallback) throw new Error('没有可用动作')
  return fallback
}

/**
 * 替**当前应行动的座位**选一个动作。
 *
 * 注意：调用方不需要传座位 —— 响应阶段（claim）该谁动由状态机决定，
 * AI 只从 `legalActions` 里挑，天然不会越位。
 */
export function chooseAction(state: GameState, difficulty: AiDifficulty, rng: Rng): GameAction {
  const actions = legalActions(state)
  if (actions.length === 0) {
    throw new Error(`座位 ${actingSeat(state)} 没有合法动作（phase=${state.phase}）`)
  }

  // 能胡永远胡 —— 三档都一样，否则「难度」会变成「故意不赢」
  const hu = actions.find(
    (action) => action.type === 'hu' || (action.type === 'claim' && action.kind === 'hu'),
  )
  if (hu) return hu

  if (difficulty === 'easy') return chooseEasy(state, actions, rng)
  return chooseSmart(state, actingSeat(state), actions, difficulty)
}

/** 某个座位当前的主精（AI 与 UI 都用这个口径）。 */
export function mainJingOf(state: GameState, seat: number): ReturnType<typeof determineMainJing> {
  return determineMainJing(allCardsOf(playerAt(state, seat)), state.ruleSet)
}

/** 便于测试与 UI 复用：手里每张牌的字。 */
export function handCharsOf(state: GameState, seat: number): string[] {
  return playerAt(state, seat).hand.map((card: Card) => card.char)
}

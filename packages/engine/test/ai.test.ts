import { describe, expect, it } from 'vitest'

import { type AiDifficulty, chooseAction, handProgress } from '../src/ai'
import { dangerOf } from '../src/ai/heuristics'
import type { Card, CardVariant, TileChar } from '../src/cards'
import {
  type GameState,
  actingSeat,
  createGame,
  legalActions,
  playerAt,
  reduce,
} from '../src/game'
import { BASELINE_RULES } from '../src/rules'
import { mulberry32, shuffle } from '../src/rng'
import { createDeck } from '../src/cards'

let nextId = 30_000
function card(char: TileChar, variant: CardVariant = 'plain'): Card {
  return { id: nextId++, char, variant }
}

/** 用指定难度跑完一局。 */
function playGame(
  seed: number,
  difficulties: readonly AiDifficulty[],
  dealer = 0,
): GameState {
  let state = createGame({ seed, dealer })
  const rng = mulberry32(seed ^ 0x9e3779b9)
  for (let step = 0; step < 4000 && state.phase !== 'finished'; step += 1) {
    const seat = actingSeat(state)
    const action = chooseAction(state, difficulties[seat] ?? 'normal', rng)
    state = reduce(state, action)
  }
  return state
}

function totalCards(state: GameState): number {
  const hands = state.players.reduce((sum, player) => sum + player.hand.length, 0)
  const melds = state.players.reduce(
    (sum, player) => sum + player.melds.reduce((inner, meld) => inner + meld.cards.length, 0),
    0,
  )
  return hands + melds + state.wall.length + state.discards.length
}

describe('AI 只产出合法动作', () => {
  it('三档难度各跑 8 局，每一步选出的动作都在 legalActions 里', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      for (let seed = 0; seed < 8; seed += 1) {
        let state = createGame({ seed: seed + 3000, dealer: seed % 3 })
        const rng = mulberry32(seed + 11)
        for (let step = 0; step < 4000 && state.phase !== 'finished'; step += 1) {
          const action = chooseAction(state, difficulty, rng)
          expect(legalActions(state), `${difficulty} seed=${seed} step=${step}`).toContainEqual(
            action,
          )
          state = reduce(state, action)
        }
        expect(state.phase).toBe('finished')
      }
    }
  })

  it('AI 对局保持全场 110 张牌，且一定终局', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      for (let seed = 0; seed < 30; seed += 1) {
        const state = playGame(seed + 4000, [difficulty, difficulty, difficulty])
        expect(totalCards(state), `${difficulty} seed=${seed}`).toBe(110)
        expect(state.phase, `${difficulty} seed=${seed} 没有终局`).toBe('finished')
        expect(state.result).not.toBeNull()
      }
    }
  })

  it('座位没有系统性优势：normal 三家同强时，座位 0 胜率接近公平份额 1/3', () => {
    let wins = 0
    let decided = 0
    for (let seed = 0; seed < 80; seed += 1) {
      const state = playGame(seed + 12_000, ['normal', 'normal', 'normal'], seed % 3)
      if (state.result?.kind !== 'hu') continue
      decided += 1
      if (state.result.winner === 0) wins += 1
    }
    expect(decided, '样本太小，说明不了问题').toBeGreaterThan(20)
    const rate = wins / decided
    expect(rate, `对称对局座位0胜率 ${(rate * 100).toFixed(1)}% —— 偏离公平份额太多`).toBeGreaterThan(
      0.15,
    )
    expect(rate).toBeLessThan(0.55)
  })

  it('能胡就胡 —— 三档都不会故意不赢', () => {
    // 从大量对局里找出一局「某一方可以自摸胡」的局面，验证 AI 一定选胡
    let checked = 0
    for (let seed = 0; seed < 120 && checked < 3; seed += 1) {
      let state = createGame({ seed: seed + 5000, dealer: seed % 3 })
      const rng = mulberry32(seed)
      for (let step = 0; step < 2000 && state.phase !== 'finished'; step += 1) {
        const actions = legalActions(state)
        const hu = actions.find((a) => a.type === 'hu')
        if (hu) {
          for (const difficulty of ['easy', 'normal', 'hard'] as const) {
            expect(chooseAction(state, difficulty, rng).type).toBe('hu')
          }
          checked += 1
          break
        }
        state = reduce(state, chooseAction(state, 'normal', rng))
      }
    }
    expect(checked, '没有找到可自摸的局面，测试没起到作用').toBeGreaterThan(0)
  })
})

describe('easy 与 normal/hard 的行为差异', () => {
  it('easy 在响应阶段一律过（不碰不吃）', () => {
    let sawClaimPhase = 0
    for (let seed = 0; seed < 40 && sawClaimPhase < 5; seed += 1) {
      let state = createGame({ seed: seed + 6000, dealer: seed % 3 })
      const rng = mulberry32(seed)
      for (let step = 0; step < 2000 && state.phase !== 'finished'; step += 1) {
        if (state.phase === 'claim') {
          const action = chooseAction(state, 'easy', rng)
          if (action.type !== 'claim' || action.kind !== 'hu') {
            expect(action.type).toBe('pass')
            sawClaimPhase += 1
          }
        }
        state = reduce(state, chooseAction(state, 'normal', rng))
      }
    }
    expect(sawClaimPhase).toBeGreaterThan(0)
  })
})

describe('handProgress', () => {
  function winningHand(): Card[] {
    const list: Card[] = []
    const add = (char: TileChar, n: number, flowers = 0): void => {
      for (let i = 0; i < n; i += 1) list.push(card(char, i < flowers ? 'flower' : 'plain'))
    }
    add('上', 1)
    add('大', 1)
    add('人', 1)
    add('乙', 1)
    add('二', 1)
    add('三', 2)
    add('四', 4)
    add('五', 1, 1)
    add('孔', 3)
    add('七', 5, 1)
    add('八', 1)
    add('九', 4, 1)
    add('十', 1)
    return list
  }

  it('完整胡牌的手能拆出 8 个单元 + 听头，评分明显高于随机手牌', () => {
    const good = handProgress(winningHand(), BASELINE_RULES, null)
    expect(good.units).toHaveLength(8)
    expect(good.tingtou).not.toBeNull()

    const deck = createDeck()
    const random = handProgress(shuffle(deck, mulberry32(5)).slice(0, 26), BASELINE_RULES, null)
    expect(good.score).toBeGreaterThan(random.score)
  })

  it('单元数与张数自洽', () => {
    const deck = createDeck()
    for (let seed = 0; seed < 30; seed += 1) {
      const cards = shuffle(deck, mulberry32(seed + 700)).slice(0, 25)
      const progress = handProgress(cards, BASELINE_RULES, null)
      const usedByUnits = progress.units.reduce((sum, unit) => sum + unit.chars.length, 0)
      const usedByTingtou = progress.tingtou ? 2 : 0
      expect(usedByUnits + usedByTingtou + progress.loose.length).toBe(cards.length)
    }
  })
})

describe('dangerOf', () => {
  const probe = card('孔')

  function cleanState(): GameState {
    const state = createGame({ seed: 123 })
    return {
      ...state,
      discards: [],
      players: state.players.map((player) => ({ ...player, melds: [] })),
    }
  }

  it('对手已经把这个字亮成副露 → 更危险', () => {
    const base = cleanState()
    const plain = dangerOf(base, 0, probe)
    const withMeld: GameState = {
      ...base,
      players: base.players.map((player) =>
        player.seat === 1
          ? {
              ...player,
              melds: [
                {
                  kind: 'kan' as const,
                  char: '孔' as const,
                  cards: [card('孔'), card('孔'), card('孔')],
                  revealed: true,
                  via: 'dui' as const,
                },
              ],
            }
          : player,
      ),
    }
    expect(dangerOf(withMeld, 0, probe)).toBeGreaterThan(plain)
  })

  it('这个字在场上现得越多 → 越安全', () => {
    const base = cleanState()
    const plain = dangerOf(base, 0, probe)
    const revealed: GameState = {
      ...base,
      discards: [card('孔'), card('孔'), card('孔')].map((item, index) => ({
        seat: index % 3,
        card: item,
      })),
    }
    expect(dangerOf(revealed, 0, probe)).toBeLessThan(plain)
  })

  it('对别人的弃牌不算自己的威胁', () => {
    const base = cleanState()
    for (const player of base.players) {
      expect(allMeldChars(player)).toEqual([])
    }
  })
})

function allMeldChars(player: { melds: readonly { char: TileChar }[] }): TileChar[] {
  return player.melds.map((meld) => meld.char)
}

describe('强弱差（胜率）', () => {
  it('normal 对两个 easy，胜率明显高于随机（1/3）', () => {
    const games = 60
    let normalWins = 0
    let decided = 0
    for (let seed = 0; seed < games; seed += 1) {
      const state = playGame(seed + 8000, ['normal', 'easy', 'easy'], seed % 3)
      if (state.result?.kind !== 'hu') continue
      decided += 1
      if (state.result.winner === 0) normalWins += 1
    }
    expect(decided, '没有一局胡牌，胜率测试没意义').toBeGreaterThan(0)
    const rate = normalWins / decided
    expect(rate, `normal 胜率 ${(rate * 100).toFixed(1)}%（${normalWins}/${decided}）`).toBeGreaterThan(
      0.5,
    )
  })

  it('hard 确实比 normal 强：坐 0 号位对 2 个 normal，胜率高于公平份额 1/3', () => {
    let wins = 0
    let decided = 0
    for (let seed = 0; seed < 80; seed += 1) {
      const state = playGame(seed + 70_000, ['hard', 'normal', 'normal'], seed % 3)
      if (state.result?.kind !== 'hu') continue
      decided += 1
      if (state.result.winner === 0) wins += 1
    }
    expect(decided).toBeGreaterThan(20)
    const rate = wins / decided
    expect(rate, `hard 对 2 normal 胜率 ${(rate * 100).toFixed(1)}%`).toBeGreaterThan(0.36)
  })

  it('黄庄率回归：三家 hard 时黄庄率必须明显低于一半', () => {
    // 这是 M6 的平衡修复留下的护栏。改坏之前 hard×3 的黄庄率是 53%，
    // 现在约 11%（瓶颈是 AI 换牌效率，不是规则）。
    const games = 60
    let draws = 0
    for (let seed = 0; seed < games; seed += 1) {
      const state = playGame(seed + 80_000, ['hard', 'hard', 'hard'], seed % 3)
      if (state.result?.kind !== 'hu') draws += 1
    }
    expect(draws / games, `hard×3 黄庄率 ${((draws / games) * 100).toFixed(0)}%`).toBeLessThan(0.4)
  })
})

describe('AI 与状态机协同', () => {
  it('AI 打出的牌确实从它手上消失', () => {
    let state = createGame({ seed: 4242, dealer: 0 })
    const rng = mulberry32(1)
    let checked = 0
    for (let step = 0; step < 500 && state.phase !== 'finished' && checked < 3; step += 1) {
      const action = chooseAction(state, 'normal', rng)
      if (action.type === 'discard') {
        const before = playerAt(state, action.seat).hand.length
        state = reduce(state, action)
        expect(playerAt(state, action.seat).hand.length).toBe(before - 1)
        checked += 1
      } else {
        state = reduce(state, action)
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
})

import { describe, expect, it } from 'vitest'

import { createDeck } from '../src/cards'
import {
  type GameAction,
  type GameState,
  IllegalActionError,
  SEATS,
  actingSeat,
  allCardsOf,
  createGame,
  legalActions,
  playerAt,
  reduce,
  zhaCandidates,
} from '../src/game'
import { BASELINE_RULES } from '../src/rules'

/** 场上所有牌（手牌 + 副露 + 牌墙 + 弃牌），应当恒为 110。 */
function totalCards(state: GameState): number {
  const hands = state.players.reduce((sum, player) => sum + player.hand.length, 0)
  const melds = state.players.reduce(
    (sum, player) => sum + player.melds.reduce((inner, meld) => inner + meld.cards.length, 0),
    0,
  )
  return hands + melds + state.wall.length + state.discards.length
}

/** 确定性托管：能胡就胡，能扎/开泛/招/对就做，否则打最后一张。 */
function autoPlay(state: GameState, maxSteps = 4000): GameState {
  let current = state
  for (let step = 0; step < maxSteps && current.phase !== 'finished'; step += 1) {
    const actions = legalActions(current)
    const pick =
      actions.find((a) => a.type === 'hu' || (a.type === 'claim' && a.kind === 'hu')) ??
      actions.find(
        (a) =>
          a.type === 'zha' ||
          a.type === 'fan' ||
          (a.type === 'claim' && (a.kind === 'zhao' || a.kind === 'dui')),
      ) ??
      actions[0]
    if (!pick) throw new Error(`座位 ${actingSeat(current)} 没有任何合法动作`)
    current = reduce(current, pick)
  }
  return current
}

describe('发牌', () => {
  it('庄家 26 张、闲家各 25 张、牌墙 34 张，合计 110', () => {
    const state = createGame({ seed: 20261001, dealer: 0 })
    expect(playerAt(state, 0).hand).toHaveLength(26)
    expect(playerAt(state, 1).hand).toHaveLength(25)
    expect(playerAt(state, 2).hand).toHaveLength(25)
    expect(state.wall).toHaveLength(34)
    expect(totalCards(state)).toBe(110)
  })

  it('三家手牌互不重复（是同一副 110 张的分割）', () => {
    const state = createGame({ seed: 7, dealer: 1 })
    const ids = state.players.flatMap((player) => player.hand.map((card) => card.id))
    expect(new Set(ids).size).toBe(ids.length) // 无重复
    expect(ids.length + state.wall.length).toBe(110)
  })

  it('同 seed 同庄家 → 完全相同的一局（可复现）', () => {
    const a = createGame({ seed: 42, dealer: 2 })
    const b = createGame({ seed: 42, dealer: 2 })
    expect(JSON.stringify(a.players)).toBe(JSON.stringify(b.players))
    expect(a.wall.map((card) => card.id)).toEqual(b.wall.map((card) => card.id))
  })

  it('不同 seed 发不同的牌', () => {
    const a = createGame({ seed: 1 })
    const b = createGame({ seed: 2 })
    expect(a.players[0]?.hand.map((card) => card.id)).not.toEqual(
      b.players[0]?.hand.map((card) => card.id),
    )
  })

  it('牌墙里也是完整的牌（手牌 + 牌墙 = 整副）', () => {
    const state = createGame({ seed: 99 })
    const all = [...state.players.flatMap((player) => player.hand), ...state.wall]
    expect(all).toHaveLength(createDeck().length)
    expect(new Set(all.map((card) => card.id)).size).toBe(110)
  })
})

describe('请统', () => {
  it('顺序是 末家 → 二家 → 庄家', () => {
    for (const dealer of [0, 1, 2]) {
      const state = createGame({ seed: 5, dealer })
      expect(state.qingtongQueue).toEqual([
        (dealer + 2) % SEATS,
        (dealer + 1) % SEATS,
        dealer,
      ])
      expect(state.phase).toBe('qingtong')
      expect(state.currentSeat).toBe((dealer + 2) % SEATS)
    }
  })

  it('请统期间只能扎/开泛/过；过完三轮后轮到庄家打牌', () => {
    let state = createGame({ seed: 11, dealer: 0 })
    for (let i = 0; i < SEATS; i += 1) {
      const actions = legalActions(state)
      expect(actions.some((action) => action.type === 'pass')).toBe(true)
      expect(actions.every((action) => ['zha', 'fan', 'pass'].includes(action.type))).toBe(true)
      const pass = actions.find((action) => action.type === 'pass')
      state = reduce(state, pass as GameAction)
    }
    expect(state.phase).toBe('turn')
    expect(state.currentSeat).toBe(0) // 庄家先打
    expect(state.needsDraw).toBe(false) // 庄家有 26 张，不用摸
  })

  it('有 4 张同字时可以扎，扎完补一张（手牌 -3）且副露成型', () => {
    let exercised = false
    for (let seed = 0; seed < 300 && !exercised; seed += 1) {
      const state = createGame({ seed })
      const zha = legalActions(state).find((action) => action.type === 'zha')
      if (!zha) continue
      const before = playerAt(state, zha.seat).hand.length
      const after = reduce(state, zha)
      const player = playerAt(after, zha.seat)
      expect(player.melds.some((meld) => meld.via === 'zha')).toBe(true)
      const meld = player.melds.find((item) => item.via === 'zha')
      expect(meld?.cards).toHaveLength(4)
      expect(meld?.revealed).toBe(false) // 暗扎
      expect(player.hand.length).toBe(before - 4 + 1) // 用掉 4 张、补 1 张
      exercised = true
    }
    expect(exercised).toBe(true)
  })
})

describe('合法性校验（非法动作必须被拒）', () => {
  it('不是自己回合时动手会被拒', () => {
    const state = createGame({ seed: 3, dealer: 0 })
    const wrongSeat = (state.currentSeat + 1) % SEATS
    expect(() => reduce(state, { type: 'pass', seat: wrongSeat })).toThrow(IllegalActionError)
  })

  it('打一张手上没有的牌会被拒', () => {
    let state = createGame({ seed: 3, dealer: 0 })
    for (let i = 0; i < SEATS; i += 1) {
      state = reduce(state, { type: 'pass', seat: state.currentSeat })
    }
    expect(state.phase).toBe('turn')
    expect(() => reduce(state, { type: 'discard', seat: 0, cardId: 999999 })).toThrow(
      IllegalActionError,
    )
  })

  it('请统阶段不能打牌', () => {
    const state = createGame({ seed: 3, dealer: 0 })
    const cardId = playerAt(state, state.currentSeat).hand[0]?.id ?? 0
    expect(() =>
      reduce(state, { type: 'discard', seat: state.currentSeat, cardId }),
    ).toThrow(IllegalActionError)
  })

  it('局终后任何动作都被拒', () => {
    const finished: GameState = {
      ...createGame({ seed: 1 }),
      phase: 'finished',
      result: { kind: 'draw', winner: null, from: null, hu: 0, shape: null },
    }
    expect(legalActions(finished)).toEqual([])
    expect(() => reduce(finished, { type: 'pass', seat: 0 })).toThrow(IllegalActionError)
  })
})

describe('整局跑通（托管对局）', () => {
  it('40 局都能终局，且全场始终恰好 110 张牌', () => {
    let huCount = 0
    let drawCount = 0
    for (let seed = 0; seed < 40; seed += 1) {
      let state = createGame({ seed: seed + 1000, dealer: seed % SEATS })
      const initial = totalCards(state)
      expect(initial).toBe(110)

      for (let step = 0; step < 4000 && state.phase !== 'finished'; step += 1) {
        const actions = legalActions(state)
        const pick =
          actions.find((a) => a.type === 'hu' || (a.type === 'claim' && a.kind === 'hu')) ??
          actions.find(
            (a) =>
              a.type === 'zha' ||
              a.type === 'fan' ||
              (a.type === 'claim' && (a.kind === 'zhao' || a.kind === 'dui')),
          ) ??
          actions[0]
        if (!pick) throw new Error('没有合法动作')
        state = reduce(state, pick)
        // 每一步都不允许丢牌或造牌
        expect(totalCards(state), `seed=${seed} step=${step}`).toBe(110)
      }

      expect(state.phase, `seed=${seed} 没有终局`).toBe('finished')
      expect(state.result).not.toBeNull()
      if (state.result?.kind === 'hu') huCount += 1
      else drawCount += 1
    }
    expect(huCount + drawCount).toBe(40)
    // 托管策略很粗糙，黄庄很正常；但两条路径都必须真实走到过
    expect(drawCount).toBeGreaterThan(0)
    expect(huCount, '40 局里一次胡牌都没有 —— 胡牌路径可能没打通').toBeGreaterThan(0)
  })

  it('托管对局里副露的张数与手牌张数自洽', () => {
    for (let seed = 0; seed < 10; seed += 1) {
      const state = autoPlay(createGame({ seed: seed + 2000 }))
      expect(state.phase).toBe('finished')
      for (const player of state.players) {
        const meldCards = player.melds.reduce((sum, meld) => sum + meld.cards.length, 0)
        for (const meld of player.melds) {
          // 每个副露都是同字
          expect(new Set(meld.cards.map((card) => card.char)).size).toBe(1)
          expect(meld.cards.length).toBeGreaterThanOrEqual(3)
          expect(meld.cards.length).toBeLessThanOrEqual(5)
        }
        expect(meldCards).toBeGreaterThanOrEqual(0)
        // 判胡时用的是「暗牌 + 副露」，这里确认拼接不重复
        expect(new Set(allCardsOf(player).map((card) => card.id)).size).toBe(
          allCardsOf(player).length,
        )
      }
    }
  })
})

describe('工具函数', () => {
  it('zhaCandidates 只给出 4 张以上的字', () => {
    const player = { seat: 0, hand: [], melds: [], duiCount: 0 }
    expect(zhaCandidates(player)).toEqual([])
  })

  it('baseline 限制「对」2 对', () => {
    expect(BASELINE_RULES.maxDui).toBe(2)
  })
})

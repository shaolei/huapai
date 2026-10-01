import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { TableScreen } from './TableScreen'
import { GameStore } from '../game/store'

afterEach(cleanup)

/**
 * 牌桌是 M5 里最大的一块，但纯函数测试覆盖不到 JSX。
 * 这里用「固定 seed + AI 即时推进」把局面推到轮到人类玩家，再渲染真实牌桌，
 * 目的是把 TableScreen 里的空值访问 / 分支错误在测试里暴露出来。
 */
function makeStore(seed: number): GameStore {
  const store = new GameStore({ seed, difficulty: 'easy', aiDelayMs: 0 })
  store.newGame(seed)
  store.runAiUntilHuman()
  return store
}

describe('TableScreen', () => {
  it('能渲染出牌桌：对手栏、牌墙、手牌都在', () => {
    const store = makeStore(1234)
    render(<TableScreen store={store} snap={store.getSnapshot()} />)

    expect(screen.getByText(/上家/)).toBeDefined()
    expect(screen.getByText(/下家/)).toBeDefined()
    // 「牌墙」在顶部信息条和中央各出现一次
    expect(screen.getAllByText(/牌墙/).length).toBeGreaterThan(0)
    expect(screen.getByText(/宜昌花牌 ·/)).toBeDefined()
    store.dispose()
  })

  it('轮到人类玩家时给出提示，且不会抛异常', () => {
    const store = makeStore(4321)
    const snap = store.getSnapshot()
    expect(snap.waitingForAi).toBe(false)
    render(<TableScreen store={store} snap={snap} />)
    // 请统阶段 / 打牌阶段都给一句可读的提示
    expect(document.body.textContent ?? '').toMatch(/请统|请打一张|请选择是否响应|轮到你|不扎|过/)
    store.dispose()
  })

  it('多个 seed 都能渲染，不崩', () => {
    for (const seed of [1, 7, 99, 20_000, 123_456]) {
      const store = makeStore(seed)
      const { unmount } = render(<TableScreen store={store} snap={store.getSnapshot()} />)
      unmount()
      store.dispose()
    }
  })

  it('人类手牌里的牌都能在 DOM 里找到对应牌面', () => {
    const store = makeStore(2026)
    const snap = store.getSnapshot()
    const humanHand = snap.state.players[0]?.hand ?? []
    expect(humanHand.length).toBeGreaterThan(0)

    render(<TableScreen store={store} snap={snap} />)
    for (const card of humanHand.slice(0, 6)) {
      expect(screen.getAllByLabelText(new RegExp(`^${card.char}`)).length).toBeGreaterThan(0)
    }
    store.dispose()
  })
})

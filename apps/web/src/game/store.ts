/**
 * 把引擎的纯状态机接到 React 上。
 *
 * 刻意做得很薄：状态本身永远是引擎里的 `GameState`，这里只负责
 *   1. 记「人类玩家选了哪张牌」这类纯 UI 状态
 *   2. 轮到 AI 时按节奏推进一步（`setTimeout`，让玩家看得清）
 *   3. 通过 `useSyncExternalStore` 给 React 一个不可变快照
 *
 * 所有规则判定都走引擎的 `legalActions` / `reduce`，UI 不复制任何规则。
 */

import {
  type AiDifficulty,
  type Column,
  type GameAction,
  type GameState,
  actingSeat,
  chooseAction,
  createGame,
  legalActions,
  mulberry32,
  reduce,
} from '@huapai/engine'
import { useSyncExternalStore } from 'react'

import {
  type Arrangement,
  buildColumns,
  moveCardToSlot,
  normalizeSlots,
} from './arrangement'

/** 人类玩家永远坐 0 号位（底部）。 */
export const HUMAN_SEAT = 0

/** AI 每步之间的停顿，纯粹为了可看性。 */
const AI_DELAY_MS = 420

export interface StoreSnapshot {
  readonly state: GameState
  readonly humanSeat: number
  /** 当前**人类玩家**可以做的动作；不是他的回合时为空。 */
  readonly legal: readonly GameAction[]
  readonly waitingForAi: boolean
  readonly selectedCardId: number | null
  readonly difficulty: AiDifficulty
  readonly seed: number
  /** 已经合成好的手牌列（人工组 + 自动编排），UI 直接渲染。 */
  readonly columns: readonly Column[]
  /** 玩家是否手工理过牌（决定「自动理牌」按钮要不要点亮）。 */
  readonly hasManualArrangement: boolean
}

export interface StoreOptions {
  readonly difficulty?: AiDifficulty
  readonly seed?: number
  /** 设为 0 可以让 AI 即时推进（测试用）。 */
  readonly aiDelayMs?: number
}

export class GameStore {
  private state: GameState
  private selectedCardId: number | null = null
  /** 玩家手工分的组（牌 id）。空 = 用引擎的语义分组。 */
  private arrangement: Arrangement = []
  /** 玩家是否手工理过牌（决定「自动理牌」按钮）。 */
  private manual = false
  private snapshot: StoreSnapshot
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly listeners = new Set<() => void>()
  private readonly difficulty: AiDifficulty
  private readonly aiDelayMs: number
  private seed: number

  constructor(options: StoreOptions = {}) {
    this.difficulty = options.difficulty ?? 'normal'
    this.aiDelayMs = options.aiDelayMs ?? AI_DELAY_MS
    this.seed = options.seed ?? Math.floor(Math.random() * 1_000_000)
    this.state = createGame({ seed: this.seed, dealer: 0 })
    this.snapshot = this.buildSnapshot()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): StoreSnapshot => this.snapshot

  private buildSnapshot(): StoreSnapshot {
    const acting = actingSeat(this.state)
    const isHumanTurn = this.state.phase !== 'finished' && acting === HUMAN_SEAT
    const hand = this.state.players[HUMAN_SEAT]?.hand ?? []
    return {
      state: this.state,
      humanSeat: HUMAN_SEAT,
      legal: isHumanTurn ? legalActions(this.state) : [],
      waitingForAi: this.state.phase !== 'finished' && acting !== HUMAN_SEAT,
      selectedCardId: this.selectedCardId,
      difficulty: this.difficulty,
      seed: this.seed,
      columns: buildColumns(hand, this.arrangement),
      hasManualArrangement: this.manual,
    }
  }

  /** 打牌/摸牌之后把死牌剪掉，并重新补齐到 8 列。 */
  private syncArrangement(): void {
    if (!this.manual) return
    const hand = this.state.players[HUMAN_SEAT]?.hand ?? []
    this.arrangement = normalizeSlots(hand, this.arrangement)
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot()
    for (const listener of this.listeners) listener()
  }

  /** 重开一局（换一个新 seed）。 */
  newGame(seed?: number): void {
    this.clearTimer()
    this.seed = seed ?? Math.floor(Math.random() * 1_000_000)
    this.state = createGame({ seed: this.seed, dealer: 0 })
    this.selectedCardId = null
    this.arrangement = []
    this.manual = false
    this.emit()
    this.pump()
  }

  /**
   * 理牌：把一张牌**移动**到第 `slot` 列（追加到该列末尾）。
   *
   * 注意是移动、不是交换 —— 源列少一张、目标列多一张，其余列完全不动。
   * 这是纯 UI 行为，不改变任何规则状态。
   */
  moveCardToSlot(cardId: number, slot: number): void {
    const hand = this.state.players[HUMAN_SEAT]?.hand ?? []
    this.arrangement = moveCardToSlot(hand, this.arrangement, cardId, slot)
    this.manual = true
    this.emit()
  }

  /** 一键回到引擎的语义分组（最优分解）。 */
  autoArrange(): void {
    this.arrangement = []
    this.manual = false
    this.emit()
  }

  /** 人类玩家点选/取消选牌。 */
  select(cardId: number | null): void {
    this.selectedCardId = cardId
    this.emit()
  }

  /** 人类玩家执行一个动作；不在 `legal` 里的动作会被直接忽略。 */
  play(action: GameAction): void {
    const allowed = legalActions(this.state).some(
      (candidate) =>
        candidate.type === action.type &&
        candidate.seat === action.seat &&
        (candidate.type !== 'discard' ||
          (action.type === 'discard' && candidate.cardId === action.cardId)),
    )
    if (!allowed) return
    this.state = reduce(this.state, action)
    if (action.type === 'discard') this.selectedCardId = null
    this.syncArrangement()
    this.emit()
    this.pump()
  }

  /** 让 AI 走一步（测试可直接调用；正常由定时器驱动）。 */
  stepAi(): boolean {
    if (this.state.phase === 'finished') return false
    if (actingSeat(this.state) === HUMAN_SEAT) return false
    const rng = mulberry32((this.seed ^ 0x5bf03635) >>> 0)
    // 每一步都用「步数」派生 rng，保证同一个 seed 下局面可复现
    const action = chooseAction(this.state, this.difficulty, mulberry32((rng() * 2 ** 31) | 0))
    this.state = reduce(this.state, action)
    this.syncArrangement()
    this.emit()
    return true
  }

  /** 一直推进到轮到人类玩家或终局（测试用）。 */
  runAiUntilHuman(): void {
    let guard = 0
    while (this.stepAi() && guard < 5000) guard += 1
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  /** 轮到 AI 就安排下一步。 */
  private pump(): void {
    this.clearTimer()
    if (this.state.phase === 'finished') return
    if (actingSeat(this.state) === HUMAN_SEAT) return
    if (this.aiDelayMs <= 0) {
      this.timer = setTimeout(() => {
        this.timer = null
        if (this.stepAi()) this.pump()
      }, 0)
      return
    }
    this.timer = setTimeout(() => {
      this.timer = null
      if (this.stepAi()) this.pump()
    }, this.aiDelayMs)
  }

  /** 进入牌桌时调用：把 AI 的节奏跑起来。 */
  start(): void {
    this.pump()
  }

  dispose(): void {
    this.clearTimer()
    this.listeners.clear()
  }
}

export function useGame(store: GameStore): StoreSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

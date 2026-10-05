import {
  type Card,
  type DiscardRecord,
  type GameAction,
  type MeldGroup,
  type PlayerState,
  type RuleSet,
  actingSeat,
  allCardsOf,
  determineMainJing,
  playerAt,
} from '@huapai/engine'
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { layoutHand } from '../game/layoutHand'
import { HUMAN_SEAT, type GameStore, type StoreSnapshot } from '../game/store'
import { CardFace } from './CardFace'

/** 超过这个像素才算拖拽，否则当成点选。 */
const DRAG_THRESHOLD_PX = 12

interface DragState {
  readonly cardId: number
  readonly startX: number
  readonly startY: number
  readonly x: number
  readonly y: number
  readonly moved: boolean
  /** 当前悬停在哪一列；`-1` = 弃牌区；`null` = 没有落点。 */
  readonly overSlot: number | null
}

/** 落点：某一列，或者弃牌区。 */
interface DropTarget {
  readonly slot: number | null
  readonly isDiscardZone: boolean
}

/** 指针下面是哪一列 / 是不是弃牌区。jsdom 里可能没有 elementFromPoint，做兜底。 */
function hitTest(x: number, y: number): DropTarget {
  const empty: DropTarget = { slot: null, isDiscardZone: false }
  if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') {
    return empty
  }
  const element = document.elementFromPoint(x, y)
  if (!element) return empty

  // 弃牌区优先：它比列大，先判它不会被误判成列
  if (element.closest('[data-drop="discard"]')) {
    return { slot: null, isDiscardZone: true }
  }
  const slotHolder = element.closest('[data-slot]')
  const raw = slotHolder?.getAttribute('data-slot') ?? null
  const slot = raw === null ? Number.NaN : Number(raw)
  return { slot: Number.isFinite(slot) ? slot : null, isDiscardZone: false }
}

const SEAT_LABEL: Readonly<Record<number, string>> = { 1: '上家', 2: '下家' }
const VIA_LABEL: Readonly<Record<MeldGroup['via'], string>> = {
  dui: '对',
  zhao: '招',
  zha: '扎',
  fan: '泛',
}
/** 牌墙满值（3 人局 110 张：25+25+26 发完剩 34）。用于画进度条。 */
const WALL_FULL = 34

/**
 * 副露：直接画小缩略图，而不是「字×张数」的文字。
 *
 * 文字看不出「花精还是素精」「有没有带花」，而这两件事直接影响胡数 ——
 * 所以看对手副露时缩略图比文字信息量大得多。
 */
function MeldRow({ meld, ruleSet }: { meld: MeldGroup; ruleSet: RuleSet }) {
  return (
    <span
      className={`hz-meld${meld.revealed ? ' is-open' : ''}`}
      title={`${VIA_LABEL[meld.via]}${meld.revealed ? '（明）' : '（暗）'}`}
    >
      <i className="hz-meld__tag">{VIA_LABEL[meld.via]}</i>
      <span className="hz-meld__cards">
        {meld.cards.map((card) => (
          <CardFace key={card.id} card={card} ruleSet={ruleSet} small />
        ))}
      </span>
    </span>
  )
}

function OpponentPanel({
  player,
  ruleSet,
  seat,
  isActing,
  discards,
  side,
}: {
  player: PlayerState
  ruleSet: RuleSet
  seat: number
  isActing: boolean
  discards: readonly DiscardRecord[]
  side: 'left' | 'right'
}) {
  return (
    <section className={`hz-seat hz-seat--${side}${isActing ? ' is-acting' : ''}`}>
      <div className="hz-seat__info">
        <header className="hz-seat__head">
          <span className="hz-seat__name">
            {SEAT_LABEL[seat] ?? seat}（AI）
          </span>
          <span className="hz-seat__count">{player.hand.length} 张</span>
        </header>

        <div className="hz-seat__melds">
          {player.melds.length === 0 ? (
            <span className="hz-hint">无副露</span>
          ) : (
            player.melds.map((meld, index) => (
              <MeldRow key={`${meld.char}-${index}`} meld={meld} ruleSet={ruleSet} />
            ))
          )}
        </div>

        {player.duiCount > 0 ? <span className="hz-hint">已对 {player.duiCount} 对</span> : null}
      </div>

      {/* 弃牌朝中央展开：左家在信息栏**右侧**，右家在信息栏**左侧**。
          放在信息栏下面会越堆越高，最后看不全。 */}
      <div className="hz-seat__discards">
        {discards.length === 0 ? (
          <span className="hz-hint">未出牌</span>
        ) : (
          discards.slice(-12).map((record, index) => (
            <span key={`${record.card.id}-${index}`} className="hz-discard">
              <CardFace card={record.card} ruleSet={ruleSet} small />
            </span>
          ))
        )}
      </div>
    </section>
  )
}

export function TableScreen({ store, snap }: { store: GameStore; snap: StoreSnapshot }) {
  const { state } = snap
  const ruleSet = state.ruleSet
  const human = playerAt(state, HUMAN_SEAT)
  const acting = actingSeat(state)

  const handRef = useRef<HTMLDivElement>(null)
  const [band, setBand] = useState({ width: 630, height: 182 })

  useEffect(() => {
    const element = handRef.current
    if (!element) return
    const update = (): void => {
      setBand({
        width: Math.max(1, element.clientWidth),
        height: Math.max(1, element.clientHeight),
      })
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const columns = snap.columns
  const layout = useMemo(
    () =>
      layoutHand({
        columns,
        availableWidth: band.width,
        availableHeight: band.height,
        // 手牌是固定 8 列，布局层不许再打包/分块，否则拖拽语义就废了
        packing: false,
      }),
    [columns, band.width, band.height],
  )

  // 人类当前能打的牌（其余牌点了也没用）
  const discardable = useMemo(() => {
    const ids = new Set<number>()
    for (const action of snap.legal) {
      if (action.type === 'discard') ids.add(action.cardId)
    }
    return ids
  }, [snap.legal])

  // ── 拖拽理牌 ────────────────────────────────────────────────
  // 指针状态放 ref（事件处理器读它），另存一份 view state 只用于渲染。
  const dragRef = useRef<DragState | null>(null)
  const [dragView, setDragView] = useState<DragState | null>(null)

  const beginDrag = (card: Card, event: ReactPointerEvent): void => {
    const next: DragState = {
      cardId: card.id,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      overSlot: null,
    }
    dragRef.current = next
    setDragView(next)
  }

  const handleDrop = useCallback(
    (current: DragState, event: PointerEvent): void => {
      const target = hitTest(event.clientX, event.clientY)

      if (current.moved) {
        // 拖到弃牌区 = 打出这张牌（只在轮到自己、且这张确实可打时生效）
        if (target.isDiscardZone) {
          if (discardable.has(current.cardId)) {
            store.play({ type: 'discard', seat: HUMAN_SEAT, cardId: current.cardId })
          }
          return
        }
        // 拖到某一列 = **移动**过去（不是交换：其余列原地不动）
        if (target.slot !== null) {
          store.moveCardToSlot(current.cardId, target.slot)
        }
        return
      }

      // 没怎么动 = 点选
      if (discardable.has(current.cardId)) {
        store.select(snap.selectedCardId === current.cardId ? null : current.cardId)
      }
    },
    [store, discardable, snap.selectedCardId],
  )

  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      const current = dragRef.current
      if (!current) return
      const moved =
        current.moved ||
        Math.hypot(event.clientX - current.startX, event.clientY - current.startY) >
          DRAG_THRESHOLD_PX
      const next: DragState = {
        ...current,
        x: event.clientX,
        y: event.clientY,
        moved,
        overSlot: moved ? hitTest(event.clientX, event.clientY).slot : null,
      }
      dragRef.current = next
      setDragView(next)
    }
    const onUp = (event: PointerEvent): void => {
      const current = dragRef.current
      dragRef.current = null
      setDragView(null)
      if (current) handleDrop(current, event)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [handleDrop])

  const selectedAction: GameAction | null = useMemo(() => {
    if (snap.selectedCardId === null) return null
    return (
      snap.legal.find(
        (action) => action.type === 'discard' && action.cardId === snap.selectedCardId,
      ) ?? null
    )
  }, [snap.legal, snap.selectedCardId])

  const huAction = snap.legal.find(
    (action) => action.type === 'hu' || (action.type === 'claim' && action.kind === 'hu'),
  )
  const claimActions = snap.legal.filter(
    (action) => action.type === 'claim' && action.kind !== 'hu',
  )
  const meldActions = snap.legal.filter(
    (action) => action.type === 'zha' || action.type === 'fan',
  )
  const passAction = snap.legal.find((action) => action.type === 'pass')

  // 弃牌按座位分开：AI 的贴在自己信息栏下方，中央只留自己的 ——
  // 混在中央的话根本分不清是谁打的。
  const discardsBySeat = useMemo(() => {
    const map: DiscardRecord[][] = [[], [], []]
    for (const record of state.discards) {
      let bucket = map[record.seat]
      if (!bucket) {
        bucket = []
        map[record.seat] = bucket
      }
      bucket.push(record)
    }
    return map
  }, [state.discards])

  // 口径②：主精按人判定 —— 手上该精张数最多者，会随摸打变化，所以每帧重算。
  const mainJing = useMemo(
    () => determineMainJing(allCardsOf(human), ruleSet),
    [human, ruleSet],
  )

  const phaseHint =
    state.phase === 'finished'
      ? '本局结束'
      : state.phase === 'qingtong'
        ? '请统阶段'
        : acting === HUMAN_SEAT
          ? '轮到你'
          : `${SEAT_LABEL[acting] ?? acting}（AI）思考中…`

  return (
    <div className="hz-app">
      <header className="hz-info-bar">
        <span className="hz-info-bar__title">
          宜昌花牌 · {phaseHint}
          {acting === HUMAN_SEAT && state.phase === 'turn' ? ' · 请打一张' : ''}
          {acting === HUMAN_SEAT && state.phase === 'claim' ? ' · 请选择是否响应' : ''}
        </span>
        <span className="hz-info-bar__hint">
          {human.hand.length} 张 · 主精 <b className="hz-jing">{mainJing ?? '—'}</b>
          {layout.scrolls ? ' · 手牌可横向滑动' : ''}
        </span>
      </header>

      <main className="hz-table">
        <OpponentPanel
          player={playerAt(state, 1)}
          ruleSet={ruleSet}
          seat={1}
          isActing={acting === 1}
          discards={discardsBySeat[1] ?? []}
          side="left"
        />

        <section className="hz-center">
          <div className="hz-wall">
            <span className="hz-wall__label">牌墙</span>
            <span className="hz-wall__track">
              <span
                className={`hz-wall__fill${state.wall.length <= 8 ? ' is-low' : ''}`}
                style={{ width: `${Math.min(100, (state.wall.length / WALL_FULL) * 100)}%` }}
              />
            </span>
            <span className="hz-wall__num">{state.wall.length}</span>
          </div>
          {/* data-drop="discard"：把牌拖到这里就是打出 */}
          <div className="hz-discards" data-drop="discard">
            {(discardsBySeat[HUMAN_SEAT] ?? []).length === 0 ? (
              <span className="hz-hint">你还没打牌</span>
            ) : (
              (discardsBySeat[HUMAN_SEAT] ?? []).slice(-18).map((record, index) => (
                <span key={`${record.card.id}-${index}`} className="hz-discard">
                  <CardFace card={record.card} ruleSet={ruleSet} small />
                </span>
              ))
            )}
          </div>
        </section>

        <OpponentPanel
          player={playerAt(state, 2)}
          ruleSet={ruleSet}
          seat={2}
          isActing={acting === 2}
          discards={discardsBySeat[2] ?? []}
          side="right"
        />
      </main>

      <footer className="hz-hand-band">
        <div
          className={`hz-hand${layout.scrolls ? ' is-scrollable' : ''}`}
          ref={handRef}
          style={{ overflowX: layout.scrolls ? 'auto' : 'hidden' }}
        >
          <div
            className="hz-hand__inner"
            style={{
              width: layout.totalWidth,
              height: layout.totalHeight,
              ['--hz-card-w' as string]: `${layout.cardWidth}px`,
              ['--hz-card-h' as string]: `${layout.cardHeight}px`,
              ['--hz-band' as string]: `${layout.stackStep}px`,
            }}
          >
            {layout.placed.map((column, slotIndex) => (
              <div
                key={column.key}
                className={'hz-col' + (dragView?.overSlot === slotIndex ? ' is-drop-target' : '')}
                data-slot={slotIndex}
                style={{
                  left: column.x,
                  width: layout.cardWidth,
                  height: column.height,
                }}
              >
                {/* 空列也保留可见的落点，这样玩家能主动把牌拖到一个空列 */}
                {column.cards.length === 0 ? (
                  <span className="hz-col__empty" style={{ height: layout.cardHeight }} />
                ) : null}

                {column.cards.map((card, index) => (
                  <div
                    key={card.id}
                    className={
                      'hz-col__slot' +
                      (dragView?.cardId === card.id && dragView.moved ? ' is-dragging' : '')
                    }
                    data-card-id={card.id}
                    style={{
                      top: column.offsets[index] ?? 0,
                      width: layout.cardWidth,
                      height: layout.cardHeight,
                    }}
                    onPointerDown={(event) => beginDrag(card, event)}
                  >
                    <CardFace
                      card={card}
                      ruleSet={ruleSet}
                      selected={snap.selectedCardId === card.id}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="hz-hand-band__melds">
          <span className="hz-zone-label">明牌</span>
          <button
            type="button"
            className="hz-btn hz-btn--mini"
            disabled={!snap.hasManualArrangement}
            onClick={() => store.autoArrange()}
            title="回到引擎的最优分解"
          >
            自动理牌
          </button>
          {human.melds.length === 0 ? (
            <span className="hz-hint">无</span>
          ) : (
            human.melds.map((meld, index) => (
              <MeldRow key={`${meld.char}-${index}`} meld={meld} ruleSet={ruleSet} />
            ))
          )}
        </div>
      </footer>

      {dragView?.moved ? (
        <div className="hz-drag-ghost" style={{ left: dragView.x, top: dragView.y }}>
          <CardFace
            card={human.hand.find((card) => card.id === dragView.cardId)}
            ruleSet={ruleSet}
          />
        </div>
      ) : null}

      {snap.legal.length > 0 ? (
        <div className="hz-action-bar">
          {huAction ? (
            <button
              type="button"
              className="hz-btn is-primary"
              onClick={() => store.play(huAction)}
            >
              胡
            </button>
          ) : null}

          {meldActions.map((action) =>
            action.type === 'zha' || action.type === 'fan' ? (
              <button
                key={`${action.type}-${action.char}`}
                type="button"
                className="hz-btn"
                onClick={() => store.play(action)}
              >
                {action.type === 'zha' ? '扎' : '开泛'} {action.char}
              </button>
            ) : null,
          )}

          {claimActions.map((action) =>
            action.type === 'claim' ? (
              <button
                key={action.kind}
                type="button"
                className="hz-btn is-primary"
                onClick={() => store.play(action)}
              >
                {action.kind === 'zhao' ? '招' : '对'}
              </button>
            ) : null,
          )}

          {selectedAction ? (
            <button
              type="button"
              className="hz-btn is-primary"
              onClick={() => store.play(selectedAction)}
            >
              打出{state.players[HUMAN_SEAT]?.hand.find((c) => c.id === snap.selectedCardId)?.char ?? ''}
            </button>
          ) : null}

          {passAction ? (
            <button type="button" className="hz-btn" onClick={() => store.play(passAction)}>
              {state.phase === 'qingtong' ? '不扎' : state.phase === 'claim' ? '过' : '不要'}
            </button>
          ) : null}

          {selectedAction === null && !huAction && claimActions.length === 0 && passAction === null ? (
            <span className="hz-hint hz-hint--bar">点手牌选牌，再按「打出」</span>
          ) : null}
        </div>
      ) : (
        <div className="hz-action-bar hz-action-bar--quiet">
          <span className="hz-hint hz-hint--bar">{phaseHint}</span>
        </div>
      )}

      {state.phase === 'finished' ? (
        <div className="hz-overlay">
          <div className="hz-overlay__box">
            <h2>
              {state.result?.kind === 'hu'
                ? `${state.result.winner === HUMAN_SEAT ? '你胡了！' : `${SEAT_LABEL[state.result.winner ?? -1] ?? 'AI'}胡了`}`
                : '黄庄（牌墙摸完）'}
            </h2>
            {state.result?.kind === 'hu' ? (
              <p>
                {state.result.hu} 胡 · {state.result.from === null ? '自摸' : '点炮'}
              </p>
            ) : (
              <p>无人胡牌，流局</p>
            )}
            <button type="button" className="hz-btn is-primary" onClick={() => store.newGame()}>
              再来一局
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

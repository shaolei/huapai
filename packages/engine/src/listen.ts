/**
 * 听牌：补哪张字可以胡。
 *
 * 与 `win.ts` / `score.ts` 共用同一套判定，所以 UI 的听牌提示、AI 的选牌、
 * 以及「按相」的合法性判断不会出现规则不一致。
 */

import { type Card, type TileChar, TILE_CHARS } from './cards'
import type { RuleSet } from './rules'
import { type EvaluateOptions, evaluateHand } from './score'

export interface WinningTile {
  readonly char: TileChar
  /** 补上这张之后的胡数。 */
  readonly hu: number
}

/**
 * 列出所有能补齐胡牌的字。
 *
 * @param mainJing 该玩家当前主精；不传则按补牌后的手牌自动判定（口径②按人判定）。
 */
export function winningTiles(
  cards: readonly Card[],
  ruleSet: RuleSet,
  options: EvaluateOptions = {},
): WinningTile[] {
  const out: WinningTile[] = []
  for (const char of TILE_CHARS) {
    const probe: Card = { id: -1, char, variant: 'plain' }
    const evaluation = evaluateHand([...cards, probe], ruleSet, options)
    if (evaluation.isWin && evaluation.best) {
      out.push({ char, hu: evaluation.best.score.hu })
    }
  }
  return out
}

/** 只列字，不关心胡数。 */
export function winningChars(
  cards: readonly Card[],
  ruleSet: RuleSet,
  options: EvaluateOptions = {},
): TileChar[] {
  return winningTiles(cards, ruleSet, options).map((tile) => tile.char)
}

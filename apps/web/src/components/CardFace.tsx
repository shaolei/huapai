import type { Card, RuleSet } from '@huapai/engine'
import { isRedChar } from '@huapai/engine'

export interface CardFaceProps {
  readonly card: Card | undefined
  readonly ruleSet: RuleSet
  readonly selected?: boolean
  readonly onClick?: () => void
  readonly small?: boolean
  /**
   * 画在牌面下半部分的徽章。手牌列里只给**最后一张（完整可见的那张）**传，
   * 用来标出这列是什么（句/坎/扎/泛/口/对/散）——
   * 否则每列下方那块面积只是空装饰纹，白占地方。
   */
  readonly badge?: string
}

/**
 * 牌面。
 *
 * 关键约定：**字画在顶部的「字带」里**。手牌列内叠压时，每张牌只露出顶部这一带，
 * 字带就是"还能认出这是什么牌"的全部依据 —— 所以字带里同时放字、红/黑、花/精标记。
 */
export function CardFace({ card, ruleSet, selected, onClick, small, badge }: CardFaceProps) {
  if (!card) {
    return <div className="hz-card hz-card--down" aria-hidden="true" />
  }

  const red = isRedChar(card.char)
  const jing = ruleSet.jingChars.includes(card.char)
  const flower = card.variant === 'flower'

  const className = [
    'hz-card',
    red ? 'hz-card--red' : 'hz-card--black',
    flower ? 'is-flower' : '',
    jing ? 'is-jing' : '',
    small ? 'is-small' : '',
    selected ? 'is-selected' : '',
    onClick ? 'is-clickable' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={className}
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && (event.key === 'Enter' || event.key === ' ')) onClick()
      }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`${card.char}${flower ? '（花）' : ''}`}
    >
      <span className="hz-card__band">
        <span className="hz-card__char">{card.char}</span>
        <span className="hz-card__marks">
          {flower ? <i className="hz-mark hz-mark--flower">花</i> : null}
          {jing ? <i className="hz-mark hz-mark--jing">精</i> : null}
        </span>
      </span>
      <span className="hz-card__body" aria-hidden="true">
        {badge ? <span className="hz-card__badge">{badge}</span> : null}
      </span>
    </div>
  )
}

import type { Card, Unit } from '../types'
import { drawCards } from './rules'

/** Resolve effects caused by a living character losing equipped cards. */
export function resolveEquipmentLoss(unit: Unit, lost: Card[], deck: Card[], discard: Card[], resolvingCardIds: readonly string[] = []) {
  const healed = unit.hp > 0 && unit.hp < unit.maxHp && lost.some(card => card.kind === 'silverLion')
  const drawCount = unit.hp > 0 && unit.skills.includes('xiaoji') ? lost.length * 2 : 0
  const draw = drawCount ? drawCards(deck, discard, drawCount, Math.random, resolvingCardIds) : { drawn: [] as Card[], deck, discard }
  return { hp: unit.hp + (healed ? 1 : 0), drawn: draw.drawn, deck: draw.deck, discard: draw.discard, healed }
}

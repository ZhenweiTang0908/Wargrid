import { beforeEach, describe, expect, it } from 'vitest'
import type { Card } from '../types'
import { createInitialState } from './rules'
import { beginTurn, useGameStore } from './store'

let sequence = 0
const card = (kind: Card['kind'], suit: Card['suit'], rank = 7): Card => ({ id: `judge-${++sequence}`, kind, suit, rank })

describe('player Guicai judgement window', () => {
  beforeEach(() => {
    useGameStore.setState(createInitialState(Array.from({ length: 30 }, () => card('slash', 'club'))))
    useGameStore.getState().selectGeneral('feedback')
  })

  it('pauses Indulgence, spends the chosen card, and resumes the draw phase', () => {
    const delayed = card('indulgence', 'club')
    const replacement = card('dodge', 'heart')
    const retained = card('slash', 'spade')
    const original = card('slash', 'spade')
    const state = useGameStore.getState()
    const pending = beginTurn({ ...state, deck: [original, card('slash', 'club'), card('slash', 'diamond')], units: { ...state.units, player: { ...state.units.player, hand: [replacement, retained], judgement: [delayed] } } }, 'player')
    expect(pending.pendingJudgement?.original).toEqual(original)
    expect(pending.units.player.hand).toEqual([replacement, retained])
    useGameStore.setState(pending)
    useGameStore.getState().chooseJudgementCard(replacement.id)
    const resolved = useGameStore.getState()
    expect(resolved.pendingJudgement).toBeNull()
    expect(resolved.turnStage).toBe('play')
    expect(resolved.units.player.hand).toContainEqual(retained)
    expect(resolved.units.player.hand).not.toContainEqual(replacement)
    expect(resolved.discard).toEqual(expect.arrayContaining([delayed, original, replacement]))
  })

  it('allows keeping the original judgement and does not spend a hand card', () => {
    const delayed = card('indulgence', 'club')
    const held = card('dodge', 'heart')
    const original = card('slash', 'heart')
    const state = useGameStore.getState()
    useGameStore.setState(beginTurn({ ...state, deck: [original, card('slash', 'club'), card('slash', 'diamond')], units: { ...state.units, player: { ...state.units.player, hand: [held], judgement: [delayed] } } }, 'player'))
    useGameStore.getState().chooseJudgementCard(null)
    const resolved = useGameStore.getState()
    expect(resolved.units.player.hand).toContainEqual(held)
    expect(resolved.turnStage).toBe('play')
    expect(resolved.discard).toEqual(expect.arrayContaining([delayed, original]))
  })
})

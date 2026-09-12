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

  it('lets Guicai prevent Lightning and pass it to the next living seat', () => {
    const delayed = card('lightning', 'spade')
    const replacement = card('dodge', 'heart')
    const original = card('slash', 'spade', 5)
    const state = useGameStore.getState()
    useGameStore.setState(beginTurn({ ...state, deck: [original, card('slash', 'club'), card('slash', 'diamond')], units: { ...state.units, player: { ...state.units.player, hand: [replacement], judgement: [delayed] } } }, 'player'))
    expect(useGameStore.getState().pendingJudgement?.delayed).toEqual(delayed)
    useGameStore.getState().chooseJudgementCard(replacement.id)
    const resolved = useGameStore.getState()
    expect(resolved.units.player.hp).toBe(state.units.player.hp)
    expect(resolved.units.north.judgement).toContainEqual(delayed)
    expect(resolved.discard).toEqual(expect.arrayContaining([original, replacement]))
    expect(resolved.discard).not.toContainEqual(delayed)
  })

  it('lets Guicai make Lightning hit its target', () => {
    const delayed = card('lightning', 'spade')
    const replacement = card('slash', 'spade', 5)
    const original = card('dodge', 'heart')
    const state = useGameStore.getState()
    useGameStore.setState(beginTurn({ ...state, deck: [original, card('slash', 'club'), card('slash', 'diamond')], units: { ...state.units, player: { ...state.units.player, hand: [replacement], judgement: [delayed] } } }, 'player'))
    useGameStore.getState().chooseJudgementCard(replacement.id)
    const resolved = useGameStore.getState()
    expect(resolved.units.player.hp).toBe(state.units.player.hp - 3)
    expect(resolved.units.north.judgement).not.toContainEqual(delayed)
    expect(resolved.discard).toEqual(expect.arrayContaining([delayed, original, replacement]))
  })

  it('can intervene in an opponent Lightning judgement and resume that turn', () => {
    const delayed = card('lightning', 'spade')
    const replacement = card('slash', 'spade', 5)
    const original = card('dodge', 'heart')
    const state = useGameStore.getState()
    const waiting = beginTurn({ ...state, deck: [original, card('slash', 'club'), card('slash', 'diamond')], units: {
      ...state.units,
      player: { ...state.units.player, hand: [replacement] },
      north: { ...state.units.north, judgement: [delayed] },
    } }, 'north')
    expect(waiting.pendingJudgement?.team).toBe('north')
    useGameStore.setState(waiting)
    useGameStore.getState().chooseJudgementCard(replacement.id)
    const resolved = useGameStore.getState()
    expect(resolved.units.north.hp).toBe(state.units.north.hp - 3)
    expect(resolved.currentUnit).toBe('north')
    expect(resolved.phase).toBe('ai')
  })

  it('waits for a Peach rescue before the Lightning victim draws turn cards', () => {
    const delayed = card('lightning', 'spade')
    const replacement = card('slash', 'spade', 5)
    const peach = card('peach', 'heart')
    const original = card('dodge', 'heart')
    const drawA = card('slash', 'club'), drawB = card('dodge', 'diamond')
    const state = useGameStore.getState()
    useGameStore.setState(beginTurn({ ...state, deck: [original, drawA, drawB], units: {
      ...state.units,
      player: { ...state.units.player, hand: [replacement, peach] },
      north: { ...state.units.north, hp: 3, hand: [], judgement: [delayed] },
    } }, 'north'))
    useGameStore.getState().chooseJudgementCard(replacement.id)
    const waiting = useGameStore.getState()
    expect(waiting.pendingResponse?.effect).toBe('dying')
    expect(waiting.pendingTurnStart?.team).toBe('north')
    expect(waiting.units.north.hand).toHaveLength(0)
    expect(waiting.deck).toEqual([drawA, drawB])
    useGameStore.getState().respond(peach.id)
    const resolved = useGameStore.getState()
    expect(resolved.pendingTurnStart).toBeNull()
    expect(resolved.pendingResponse).toBeNull()
    expect(resolved.units.north.hp).toBe(1)
    expect(resolved.units.north.hand).toEqual([drawA, drawB])
  })

  it('skips a character killed by Lightning instead of dealing turn cards to the dead', () => {
    const delayed = card('lightning', 'spade')
    const hit = card('slash', 'spade', 5)
    const drawA = card('slash', 'club'), drawB = card('dodge', 'diamond')
    const state = useGameStore.getState()
    const waiting = beginTurn({ ...state, deck: [hit, drawA, drawB], units: {
      ...state.units,
      player: { ...state.units.player, hand: [card('dodge', 'club')] },
      north: { ...state.units.north, hp: 2, hand: [], judgement: [delayed] },
    } }, 'north')
    expect(waiting.pendingJudgement?.team).toBe('north')
    useGameStore.setState(waiting)
    useGameStore.getState().chooseJudgementCard(null)
    const resolved = useGameStore.getState()
    expect(resolved.units.north.hp).toBeLessThanOrEqual(0)
    expect(resolved.units.north.hand).toHaveLength(0)
    expect(resolved.currentUnit).toBe('east')
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import type { Card } from '../types'
import { createInitialState } from './rules'
import { useGameStore } from './store'

let nextId = 0
const card = (kind: Card['kind'], suit: Card['suit'] = 'spade', rank = 7): Card => ({ id: `scenario-${++nextId}`, kind, suit, rank })

describe('standard card scenarios', () => {
  beforeEach(() => useGameStore.setState(createInitialState(Array.from({ length: 24 }, () => card('slash')))))

  it('places indulgence into the target judgement area', () => {
    const delayed = card('indulgence', 'heart', 6)
    useGameStore.setState(state => ({
      units: { ...state.units, player: { ...state.units.player, hand: [delayed] }, enemy: { ...state.units.enemy, hand: [] } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: delayed.id, target: 'enemy' })
    expect(useGameStore.getState().units.enemy.judgement).toEqual([delayed])
    expect(useGameStore.getState().discard.some(c => c.id === delayed.id)).toBe(false)
  })

  it('automatically nullifies a hostile tactic', () => {
    const duel = card('duel'), nullify = card('nullify', 'club', 12)
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hand: [duel] }, enemy: { ...state.units.enemy, hand: [nullify] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: duel.id, target: 'enemy' })
    const state = useGameStore.getState()
    expect(state.units.enemy.hp).toBe(4)
    expect(state.units.enemy.hand).toHaveLength(0)
    expect(state.discard.map(c => c.kind)).toEqual(expect.arrayContaining(['duel', 'nullify']))
  })

  it('uses peach to rescue a unit entering dying state', () => {
    const slash = card('slash', 'heart'), peach = card('peach', 'heart', 3)
    useGameStore.setState(state => ({
      units: {
        player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [slash] },
        enemy: { ...state.units.enemy, position: { x: 4, y: 0 }, hp: 1, hand: [peach] },
      },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'enemy' })
    const state = useGameStore.getState()
    expect(state.units.enemy.hp).toBe(1)
    expect(state.units.enemy.hand).toHaveLength(1)
    expect(state.units.enemy.hand[0].kind).toBe('slash')
    expect(state.winner).toBeNull()
  })

  it('resolves arrows with an automatic dodge response', () => {
    const arrows = card('arrows'), dodge = card('dodge', 'diamond', 2)
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hand: [arrows] }, enemy: { ...state.units.enemy, hand: [dodge] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: arrows.id, target: 'enemy' })
    const state = useGameStore.getState()
    expect(state.units.enemy.hp).toBe(4)
    expect(state.units.enemy.hand).toHaveLength(0)
    expect(state.discard.map(c => c.kind)).toEqual(expect.arrayContaining(['arrows', 'dodge']))
  })

  it('uses a red card as slash through Wusheng', () => {
    const redTrick = card('drawTwo', 'diamond', 9)
    useGameStore.setState(state => ({
      units: {
        player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [redTrick] },
        enemy: { ...state.units.enemy, position: { x: 4, y: 0 }, hand: [] },
      },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: redTrick.id, target: 'enemy', asSlash: true })
    const state = useGameStore.getState()
    expect(state.units.enemy.hp).toBe(3)
    expect(state.units.player.attacksUsed).toBe(1)
    expect(state.discard).toContainEqual(redTrick)
  })
})

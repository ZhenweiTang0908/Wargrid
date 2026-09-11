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
      units: { ...state.units, player: { ...state.units.player, hand: [delayed] }, north: { ...state.units.north, hand: [] } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: delayed.id, target: 'north' })
    expect(useGameStore.getState().units.north.judgement).toEqual([delayed])
    expect(useGameStore.getState().discard.some(c => c.id === delayed.id)).toBe(false)
  })

  it('automatically nullifies a hostile tactic', () => {
    const duel = card('duel'), nullify = card('nullify', 'club', 12)
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hand: [duel] }, north: { ...state.units.north, hand: [nullify] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: duel.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(4)
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.discard.map(c => c.kind)).toEqual(expect.arrayContaining(['duel', 'nullify']))
  })

  it('uses peach to rescue a unit entering dying state', () => {
    const slash = card('slash', 'heart'), peach = card('peach', 'heart', 3)
    useGameStore.setState(state => ({
      units: {
        ...state.units,
        player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [slash] },
        north: { ...state.units.north, position: { x: 4, y: 0 }, hp: 1, hand: [peach] },
      },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(1)
    expect(state.units.north.hand).toHaveLength(1)
    expect(state.units.north.hand[0].kind).toBe('slash')
    expect(state.winner).toBeNull()
  })

  it('resolves arrows with an automatic dodge response', () => {
    const arrows = card('arrows'), dodge = card('dodge', 'diamond', 2)
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hand: [arrows] }, north: { ...state.units.north, hand: [dodge] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: arrows.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(4)
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.units.east.hp).toBe(3)
    expect(state.units.west.hp).toBe(3)
    expect(state.discard.map(c => c.kind)).toEqual(expect.arrayContaining(['arrows', 'dodge']))
  })

  it('uses a red card as slash through Wusheng', () => {
    const redTrick = card('drawTwo', 'diamond', 9)
    useGameStore.setState(state => ({
      units: {
        ...state.units,
        player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [redTrick] },
        north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [] },
      },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: redTrick.id, target: 'north', asSlash: true })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.player.attacksUsed).toBe(1)
    expect(state.discard).toContainEqual(redTrick)
  })

  it('lets a loyalist provide dodge for the lord', () => {
    const slash = card('slash'), dodge = card('dodge', 'heart', 2)
    useGameStore.setState(state => ({
      currentUnit: 'east', phase: 'ai',
      units: { ...state.units, east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash] }, player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [] }, north: { ...state.units.north, hand: [dodge] } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(5)
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.message).toContain('护驾')
  })

  it('rewards the killer with three cards for defeating a rebel', () => {
    const slash = card('slash', 'heart')
    useGameStore.setState(state => ({
      units: { ...state.units, player: { ...state.units.player, position: { x: 8, y: 3 }, hand: [slash] }, east: { ...state.units.east, position: { x: 8, y: 4 }, hp: 1, hand: [] } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'east' })
    const state = useGameStore.getState()
    expect(state.units.east.hp).toBe(0)
    expect(state.units.player.hand).toHaveLength(3)
    expect(state.units.east.revealed).toBe(true)
  })

  it('strips the lord hand and equipment after killing a loyalist', () => {
    const slash = card('slash', 'heart'), spare = card('peach'), weapon = card('qinggang')
    useGameStore.setState(state => ({
      units: { ...state.units, player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [slash, spare], equipment: { weapon } }, north: { ...state.units.north, position: { x: 4, y: 0 }, hp: 1, hand: [] } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(0)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.units.player.equipment).toEqual({})
  })
})

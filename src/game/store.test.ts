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

  it('pauses duel whenever the player must play slash', () => {
    const duel = card('duel', 'spade'), playerSlash = card('slash', 'heart'), enemySlash = card('slash', 'club')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hand: [duel, playerSlash] }, north: { ...state.units.north, hand: [enemySlash] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: duel.id, target: 'north' })
    let state = useGameStore.getState()
    expect(state.pendingResponse).toMatchObject({ effect: 'duel', required: 'slash', source: 'north' })
    expect(state.units.north.hand).toHaveLength(0)

    useGameStore.getState().respond(playerSlash.id)
    state = useGameStore.getState()
    expect(state.pendingResponse).toBeNull()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.player.hp).toBe(5)
    expect(state.discard.map(discarded => discarded.id)).toEqual(expect.arrayContaining([duel.id, enemySlash.id, playerSlash.id]))
  })

  it('damages the player when declining an enemy duel', () => {
    const duel = card('duel', 'club')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: { ...state.units, east: { ...state.units.east, hand: [duel] }, player: { ...state.units.player, hand: [] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: duel.id, target: 'player' })
    expect(useGameStore.getState().pendingResponse?.effect).toBe('nullify')
    useGameStore.getState().respond(null)
    expect(useGameStore.getState().pendingResponse?.effect).toBe('duel')
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.pendingResponse).toBeNull()
    expect(state.units.player.hp).toBe(4)
    expect(state.message).toContain('决斗')
  })

  it('lets the player nullify an enemy duel before slash responses begin', () => {
    const duel = card('duel', 'spade'), nullify = card('nullify', 'club')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: { ...state.units, east: { ...state.units.east, hand: [duel] }, player: { ...state.units.player, hand: [nullify] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: duel.id, target: 'player' })
    let state = useGameStore.getState()
    expect(state.pendingResponse).toMatchObject({ effect: 'nullify', required: 'nullify', trick: 'duel' })
    expect(state.units.player.hand).toContainEqual(nullify)

    useGameStore.getState().respond(nullify.id)
    state = useGameStore.getState()
    expect(state.pendingResponse).toBeNull()
    expect(state.units.player.hp).toBe(5)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.discard.map(discarded => discarded.id)).toEqual(expect.arrayContaining([duel.id, nullify.id]))
  })

  it('continues from nullify into the underlying duel when declined', () => {
    const duel = card('duel', 'club'), nullify = card('nullify', 'heart')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: { ...state.units, east: { ...state.units.east, hand: [duel] }, player: { ...state.units.player, hand: [nullify] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: duel.id, target: 'player' })
    useGameStore.getState().respond(null)
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'duel', required: 'slash' })
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(4)
    expect(state.units.player.hand).toContainEqual(nullify)
  })

  it('chains group trick nullify into its required card response', () => {
    const arrows = card('arrows', 'heart'), nullify = card('nullify', 'spade'), dodge = card('dodge', 'diamond')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: { ...state.units, east: { ...state.units.east, hand: [arrows] }, player: { ...state.units.player, hand: [nullify, dodge] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: arrows.id, target: 'player' })
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'nullify', trick: 'arrows' })
    useGameStore.getState().respond(null)
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'arrows', required: 'dodge' })
    useGameStore.getState().respond(dodge.id)
    const state = useGameStore.getState()
    expect(state.pendingResponse).toBeNull()
    expect(state.units.player.hp).toBe(5)
    expect(state.units.player.hand).toEqual([nullify])
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
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.discard).toContainEqual(peach)
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

  it('lets Zhao Yun use slash as dodge through Longdan', () => {
    const attack = card('slash', 'heart'), converted = card('slash', 'club')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [attack] }, north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [converted] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: attack.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(4)
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.message).toContain('龙胆')
    expect(state.discard).toContainEqual(converted)
  })

  it('resolves Xiahou Dun Ganglie judgement and retaliation', () => {
    const attack = card('slash', 'heart'), judgement = card('dismantle', 'spade', 8)
    useGameStore.setState(state => ({
      deck: [judgement], discard: [],
      units: { ...state.units, player: { ...state.units.player, position: { x: 8, y: 3 }, hand: [attack] }, east: { ...state.units.east, position: { x: 8, y: 4 }, hand: [] } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: attack.id, target: 'east' })
    const state = useGameStore.getState()
    expect(state.units.east.hp).toBe(3)
    expect(state.units.player.hp).toBe(4)
    expect(state.message).toContain('刚烈')
    expect(state.discard).toContainEqual(judgement)
  })

  it('lets Sima Yi gain a source card through Feedback', () => {
    const attack = card('slash', 'heart'), spare = card('peach', 'diamond', 3)
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, position: { x: 0, y: 3 }, hand: [attack, spare] }, west: { ...state.units.west, position: { x: 0, y: 4 }, hand: [] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: attack.id, target: 'west' })
    const state = useGameStore.getState()
    expect(state.units.west.hp).toBe(3)
    expect(state.units.west.hand).toContainEqual(spare)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.message).toContain('反馈')
  })

  it('lets a loyalist provide dodge for the lord', () => {
    const slash = card('slash'), dodge = card('dodge', 'heart', 2)
    useGameStore.setState(state => ({
      currentUnit: 'east', phase: 'ai',
      units: { ...state.units, east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash] }, player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [] }, north: { ...state.units.north, hand: [dodge] } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    expect(useGameStore.getState().pendingResponse?.required).toBe('dodge')
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(5)
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.message).toContain('护驾')
  })

  it('waits for the player to choose a dodge response', () => {
    const slash = card('slash', 'club'), dodge = card('dodge', 'diamond', 6)
    useGameStore.setState(state => ({
      currentUnit: 'east', phase: 'ai',
      units: { ...state.units, east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash] }, player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [dodge] }, north: { ...state.units.north, hand: [] } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    let state = useGameStore.getState()
    expect(state.pendingResponse).toMatchObject({ effect: 'slash', required: 'dodge' })
    expect(state.units.player.hp).toBe(5)
    expect(state.units.player.hand).toContainEqual(dodge)

    useGameStore.getState().respond(dodge.id)
    state = useGameStore.getState()
    expect(state.pendingResponse).toBeNull()
    expect(state.units.player.hp).toBe(5)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.discard.filter(discarded => discarded.id === dodge.id)).toHaveLength(1)
    expect(state.units.east.attacksUsed).toBe(1)
  })

  it('uses a red Bagua judgement as dodge before opening a response window', () => {
    const slash = card('slash', 'club'), bagua = card('bagua', 'spade', 2), judgement = card('peach', 'heart', 8)
    useGameStore.setState(state => ({
      deck: [judgement], discard: [], currentUnit: 'east', phase: 'ai',
      units: { ...state.units, east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash] }, player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [], equipment: { armor: bagua } } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    const state = useGameStore.getState()
    expect(state.pendingResponse).toBeNull()
    expect(state.units.player.hp).toBe(5)
    expect(state.units.east.attacksUsed).toBe(1)
    expect(state.message).toContain('八卦阵')
    expect(state.discard).toContainEqual(judgement)
  })

  it('opens the dodge response after a failed Bagua judgement', () => {
    const slash = card('slash', 'heart'), bagua = card('bagua', 'club'), judgement = card('duel', 'spade', 9), dodge = card('dodge', 'diamond')
    useGameStore.setState(state => ({
      deck: [judgement], discard: [], currentUnit: 'east', phase: 'ai',
      units: { ...state.units, east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash] }, player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [dodge], equipment: { armor: bagua } } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'slash', armorChecked: true })
    useGameStore.getState().respond(dodge.id)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(5)
    expect(state.deck).toHaveLength(0)
    expect(state.discard).toContainEqual(judgement)
  })

  it('applies slash damage when the player declines to respond', () => {
    const slash = card('slash', 'heart')
    useGameStore.setState(state => ({
      currentUnit: 'east', phase: 'ai',
      units: { ...state.units, east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash] }, player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [] }, north: { ...state.units.north, hand: [] } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.pendingResponse).toBeNull()
    expect(state.units.player.hp).toBe(4)
    expect(state.units.east.attacksUsed).toBe(1)
  })

  it('opens a dying window and lets the player use peach to self-rescue', () => {
    const slash = card('slash', 'heart'), peach = card('peach', 'heart', 3)
    useGameStore.setState(state => ({
      currentUnit: 'east', phase: 'ai',
      units: { ...state.units, east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash] }, player: { ...state.units.player, position: { x: 4, y: 8 }, hp: 1, hand: [peach] }, north: { ...state.units.north, hand: [] } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().respond(null)
    let state = useGameStore.getState()
    expect(state.pendingResponse).toMatchObject({ effect: 'dying', required: 'peach' })
    expect(state.units.player.hp).toBe(0)
    expect(state.units.player.hand).toContainEqual(peach)

    useGameStore.getState().respond(peach.id)
    state = useGameStore.getState()
    expect(state.pendingResponse).toBeNull()
    expect(state.units.player.hp).toBe(1)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.discard).toContainEqual(peach)
    expect(state.winner).toBeNull()
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

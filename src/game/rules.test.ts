import { describe, expect, it } from 'vitest'
import type { Card, GameState } from '../types'
import { attackRange, canPeach, canSlash, combatDistance, createDeck, createInitialState, determineWinner, drawCards, effectiveAttackRange, findPath, movementCost, pathDistance, reachableCells, resolveEndTurnTerrain, scoreControlPoint, slashLimit } from './rules'

const fixedDeck = (): Card[] => Array.from({ length: 28 }, (_, index) => ({
  id: `test-${index}`,
  kind: index % 3 === 0 ? 'slash' : index % 3 === 1 ? 'dodge' : 'peach',
  suit: index % 2 ? 'heart' : 'spade',
  rank: (index % 13) + 1,
}))

describe('board rules', () => {
  it('finds an orthogonal route and avoids obstacles', () => {
    const state = createInitialState(fixedDeck())
    const path = findPath(state, { x: 4, y: 8 }, { x: 4, y: 6 }, 'player')
    expect(path).toEqual([{ x: 4, y: 7 }, { x: 4, y: 6 }])
    expect(findPath(state, { x: 4, y: 8 }, { x: 2, y: 6 }, 'player')).toEqual([])
  })

  it('limits reachable cells by remaining movement', () => {
    const state = createInitialState(fixedDeck())
    const cells = reachableCells(state, { ...state.units.player, movement: 1 })
    expect(cells).toHaveLength(3)
    expect(cells).toContainEqual({ x: 4, y: 7 })
  })

  it('uses shortest walkable distance for attacks', () => {
    const state = createInitialState(fixedDeck())
    state.units.player.position = { x: 4, y: 2 }
    expect(pathDistance(state, state.units.player.position, state.units.north.position, 'player')).toBe(2)
    state.units.player.position = { x: 4, y: 1 }
    expect(pathDistance(state, state.units.player.position, state.units.north.position, 'player')).toBe(1)
    expect(canSlash(state, state.units.player, state.units.north)).toBe(true)
    state.units.player.attacksUsed = 1
    expect(canSlash(state, state.units.player, state.units.north)).toBe(false)
  })
})

describe('card and victory rules', () => {
  it('builds a varied standard-inspired deck with suits and ranks', () => {
    const deck = createDeck()
    expect(deck.length).toBe(103)
    expect(new Set(deck.map(card => card.kind))).toEqual(new Set(['slash', 'dodge', 'peach', 'wine', 'duel', 'dismantle', 'snatch', 'drawTwo', 'crossbow', 'qinggang', 'greenDragon', 'spear', 'axe', 'halberd', 'qilinBow', 'gudingBlade', 'vermilionFan', 'shield', 'bagua', 'arrows', 'barbarians', 'nullify', 'indulgence', 'lightning', 'peachGarden', 'harvest', 'fireAttack', 'ironChain', 'redHare', 'dilu']))
    expect(deck.every(card => card.rank >= 1 && card.rank <= 13)).toBe(true)
  })

  it('applies terrain movement cost and equipment rules', () => {
    const state = createInitialState(fixedDeck())
    expect(movementCost(state, { x: 0, y: 2 })).toBe(2)
    expect(movementCost(state, { x: 4, y: 4 })).toBe(1)
    const qinggang = { ...state.units.player, equipment: { weapon: { id: 'q', kind: 'qinggang' as const, suit: 'spade' as const, rank: 6 } } }
    const crossbow = { ...state.units.player, equipment: { weapon: { id: 'c', kind: 'crossbow' as const, suit: 'club' as const, rank: 1 } } }
    const halberd = { ...state.units.player, equipment: { weapon: { id: 'h', kind: 'halberd' as const, suit: 'diamond' as const, rank: 12 } } }
    expect(attackRange(qinggang)).toBe(2)
    expect(attackRange(halberd)).toBe(4)
    expect(slashLimit(crossbow)).toBe(Infinity)
    expect(slashLimit({ ...state.units.player, skill: 'paoxiao' })).toBe(Infinity)
    const attacker = { ...state.units.player, position: { x: 4, y: 2 }, equipment: { offensiveMount: { id: 'r', kind: 'redHare' as const, suit: 'heart' as const, rank: 5 } } }
    const defender = { ...state.units.north, position: { x: 4, y: 0 }, equipment: { defensiveMount: { id: 'd', kind: 'dilu' as const, suit: 'club' as const, rank: 5 } } }
    const mountedState = { ...state, units: { ...state.units, player: attacker, north: defender } }
    expect(combatDistance(mountedState, attacker, defender)).toBe(2)
  })

  it('uses forests as cover and ridges as high ground', () => {
    const state = createInitialState(fixedDeck())
    const forestAttacker = { ...state.units.player, position: { x: 1, y: 0 } }
    const forestDefender = { ...state.units.north, position: { x: 1, y: 1 } }
    const forestState = { ...state, units: { ...state.units, player: forestAttacker, north: forestDefender } }
    expect(combatDistance(forestState, forestAttacker, forestDefender)).toBe(2)
    expect(canSlash(forestState, forestAttacker, forestDefender)).toBe(false)

    const ridgeAttacker = { ...state.units.player, position: { x: 3, y: 3 } }
    const ridgeDefender = { ...state.units.north, position: { x: 3, y: 1 } }
    const ridgeState = { ...state, units: { ...state.units, player: ridgeAttacker, north: ridgeDefender } }
    expect(effectiveAttackRange(ridgeState, ridgeAttacker)).toBe(2)
    expect(canSlash(ridgeState, ridgeAttacker, ridgeDefender)).toBe(true)
  })

  it('draws one supply card when a turn ends in a camp', () => {
    const state = createInitialState(fixedDeck())
    const before = state.units.player.hand.length
    const result = resolveEndTurnTerrain(state, 'player')
    expect(result.units.player.hand).toHaveLength(before + 1)
    expect(result.message).toContain('补给牌')
    expect(result.deck).toHaveLength(state.deck.length - 1)
  })

  it('reshuffles the discard pile when drawing from an empty deck', () => {
    const discard: Card[] = [{ id: 's', kind: 'slash', suit: 'spade', rank: 7 }, { id: 'p', kind: 'peach', suit: 'heart', rank: 3 }]
    const result = drawCards([], discard, 2, () => 0.5)
    expect(result.drawn).toHaveLength(2)
    expect(result.deck).toHaveLength(0)
    expect(result.discard).toHaveLength(0)
  })

  it('allows peach only below maximum health', () => {
    const state = createInitialState(fixedDeck())
    expect(canPeach(state.units.player)).toBe(false)
    expect(canPeach({ ...state.units.player, hp: 3 })).toBe(true)
  })

  it('scores only while occupying the control point and wins at three', () => {
    const state = createInitialState(fixedDeck())
    expect(scoreControlPoint(state, 'player').scores.player).toBe(0)
    const occupying: GameState = {
      ...state,
      units: { ...state.units, player: { ...state.units.player, position: state.controlPoint } },
      scores: { player: 2, north: 0, east: 0, west: 0 },
    }
    const result = scoreControlPoint(occupying, 'player')
    expect(result.scores.player).toBe(3)
    expect(result.winner).toBe('player')
    expect(result.phase).toBe('finished')
  })
})

describe('identity victory rules', () => {
  it('awards rebels victory when the lord dies while others remain', () => {
    const state = createInitialState(fixedDeck())
    const units = { ...state.units, player: { ...state.units.player, hp: 0 } }
    expect(determineWinner(units)).toBe('east')
  })

  it('awards the lord camp when rebels and renegade are gone', () => {
    const state = createInitialState(fixedDeck())
    const units = { ...state.units, east: { ...state.units.east, hp: 0 }, west: { ...state.units.west, hp: 0 } }
    expect(determineWinner(units)).toBe('player')
  })

  it('awards the renegade only as the sole survivor', () => {
    const state = createInitialState(fixedDeck())
    const units = Object.fromEntries(Object.entries(state.units).map(([id, unit]) => [id, { ...unit, hp: id === 'west' ? 1 : 0 }])) as typeof state.units
    expect(determineWinner(units)).toBe('west')
  })
})

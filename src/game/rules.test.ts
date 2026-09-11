import { describe, expect, it } from 'vitest'
import type { Card, GameState } from '../types'
import { canPeach, canSlash, createInitialState, drawCards, findPath, pathDistance, reachableCells, scoreControlPoint } from './rules'

const fixedDeck = (): Card[] => Array.from({ length: 28 }, (_, index) => ({
  id: `test-${index}`,
  kind: index % 3 === 0 ? 'slash' : index % 3 === 1 ? 'dodge' : 'peach',
}))

describe('board rules', () => {
  it('finds an orthogonal route and avoids obstacles', () => {
    const state = createInitialState(fixedDeck())
    const path = findPath(state, { x: 3, y: 6 }, { x: 3, y: 4 }, 'player')
    expect(path).toEqual([{ x: 3, y: 5 }, { x: 3, y: 4 }])
    expect(findPath(state, { x: 3, y: 6 }, { x: 2, y: 5 }, 'player')).toEqual([])
  })

  it('limits reachable cells by remaining movement', () => {
    const state = createInitialState(fixedDeck())
    const cells = reachableCells(state, { ...state.units.player, movement: 1 })
    expect(cells).toHaveLength(3)
    expect(cells).toContainEqual({ x: 3, y: 5 })
  })

  it('uses shortest walkable distance for attacks', () => {
    const state = createInitialState(fixedDeck())
    state.units.player.position = { x: 3, y: 2 }
    expect(pathDistance(state, state.units.player.position, state.units.enemy.position, 'player')).toBe(2)
    state.units.player.position = { x: 3, y: 1 }
    expect(pathDistance(state, state.units.player.position, state.units.enemy.position, 'player')).toBe(1)
    expect(canSlash(state, state.units.player, state.units.enemy)).toBe(true)
    state.units.player.attacksUsed = 1
    expect(canSlash(state, state.units.player, state.units.enemy)).toBe(false)
  })
})

describe('card and victory rules', () => {
  it('reshuffles the discard pile when drawing from an empty deck', () => {
    const discard: Card[] = [{ id: 's', kind: 'slash' }, { id: 'p', kind: 'peach' }]
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
      scores: { player: 2, enemy: 0 },
    }
    const result = scoreControlPoint(occupying, 'player')
    expect(result.scores.player).toBe(3)
    expect(result.winner).toBe('player')
    expect(result.phase).toBe('finished')
  })
})

import { describe, expect, it } from 'vitest'
import type { Card, GameState } from '../types'
import { MAP_DEFINITIONS, MAP_IDS, attackRange, canPeach, canSlash, combatDistance, createDeck, createInitialState, createStandardDeck, determineWinner, drawCards, effectiveAttackRange, findPath, movementCost, pathDistance, reachableCells, resolveEndTurnTerrain, scoreControlPoint, slashLimit, terrainAt, turnMovement } from './rules'

const fixedDeck = (): Card[] => Array.from({ length: 28 }, (_, index) => ({
  id: `test-${index}`,
  kind: index % 3 === 0 ? 'slash' : index % 3 === 1 ? 'dodge' : 'peach',
  suit: index % 2 ? 'heart' : 'spade',
  rank: (index % 13) + 1,
}))

describe('board rules', () => {
  it('keeps every selectable battlefield definition playable', () => {
    expect(MAP_IDS).toEqual(['river', 'siege', 'highland', 'wetland', 'bamboo', 'pass', 'dockyard', 'desert'])
    for (const id of MAP_IDS) {
      const map = MAP_DEFINITIONS[id]
      const state = createInitialState(fixedDeck(), false, Math.random, id)
      expect(map.name.length).toBeGreaterThan(0)
      expect(map.description.length).toBeGreaterThan(0)
      expect(state.terrain).toBe(map.terrain)
      expect(state.obstacles).toBe(map.obstacles)
      for (const unit of Object.values(state.units)) expect(findPath(state, unit.position, state.controlPoint, unit.id).length).toBeGreaterThan(0)
    }
  })
  it('keeps the desert oasis reachable while salt flats slow the flanks', () => {
    const state = createInitialState(fixedDeck(), false, Math.random, 'desert')
    expect(terrainAt(state, { x: 4, y: 4 })).toBe('road')
    expect(terrainAt(state, { x: 2, y: 4 })).toBe('marsh')
    expect(movementCost(state, { x: 2, y: 4 })).toBe(2)
    expect(terrainAt(state, { x: 0, y: 3 })).toBe('water')
    expect(state.obstacles).toContainEqual({ x: 2, y: 3 })
    expect(state.mapObjects.every(object => !state.obstacles.some(block => block.x === object.position.x && block.y === object.position.y))).toBe(true)
    for (const unit of Object.values(state.units)) expect(findPath(state, unit.position, state.controlPoint, unit.id).length).toBeGreaterThan(0)
  })
  it('uses dry gangways to cross the dockyard water lanes', () => {
    const state = createInitialState(fixedDeck(), false, Math.random, 'dockyard')
    expect(terrainAt(state, { x: 4, y: 3 })).toBe('road')
    expect(terrainAt(state, { x: 2, y: 3 })).toBe('bridge')
    expect(movementCost(state, { x: 1, y: 3 })).toBe(2)
    expect(state.obstacles).toContainEqual({ x: 3, y: 4 })
    expect(state.mapObjects.every(object => !state.obstacles.some(block => block.x === object.position.x && block.y === object.position.y))).toBe(true)
  })
  it('builds a canyon pass with a narrow central route and ranged flank towers', () => {
    const state = createInitialState(fixedDeck(), false, Math.random, 'pass')
    expect(state.obstacles).toContainEqual({ x: 2, y: 3 })
    expect(state.obstacles).not.toContainEqual({ x: 2, y: 4 })
    expect(terrainAt(state, { x: 4, y: 3 })).toBe('ridge')
    expect(terrainAt(state, { x: 1, y: 4 })).toBe('watchtower')
    expect(movementCost(state, { x: 3, y: 3 })).toBe(2)
    expect(findPath(state, state.units.player.position, state.controlPoint, 'player')).toEqual([
      { x: 4, y: 7 }, { x: 4, y: 6 }, { x: 4, y: 5 }, { x: 4, y: 4 },
    ])
    expect(state.mapObjects.every(object => !state.obstacles.some(wall => wall.x === object.position.x && wall.y === object.position.y))).toBe(true)
  })
  it('builds a bamboo battlefield with covered flanks and a clear central road', () => {
    const state = createInitialState(fixedDeck(), false, Math.random, 'bamboo')
    expect(terrainAt(state, { x: 3, y: 3 })).toBe('forest')
    expect(terrainAt(state, { x: 4, y: 3 })).toBe('road')
    expect(terrainAt(state, { x: 6, y: 3 })).toBe('watchtower')
    expect(state.obstacles).toContainEqual({ x: 3, y: 2 })
    expect(state.mapObjects.every(object => !state.obstacles.some(wall => wall.x === object.position.x && wall.y === object.position.y))).toBe(true)
    for (const unit of Object.values(state.units)) expect(findPath(state, unit.position, state.controlPoint, unit.id).length).toBeGreaterThan(0)
  })
  it('builds a wetland map with costly central water and side bridges', () => {
    const state = createInitialState(fixedDeck(), false, Math.random, 'wetland')
    expect(state.mapId).toBe('wetland')
    expect(terrainAt(state, { x: 4, y: 3 })).toBe('water')
    expect(movementCost(state, { x: 4, y: 3 })).toBe(2)
    expect(terrainAt(state, { x: 2, y: 3 })).toBe('bridge')
    expect(movementCost(state, { x: 2, y: 3 })).toBe(1)
    expect(state.obstacles).toContainEqual({ x: 3, y: 7 })
    for (const unit of Object.values(state.units)) expect(findPath(state, unit.position, state.controlPoint, unit.id).length).toBeGreaterThan(0)
    expect(state.mapObjects.every(object => !state.obstacles.some(wall => wall.x === object.position.x && wall.y === object.position.y))).toBe(true)
  })
  it('builds a highland map with four traversable routes and tactical side lanes', () => {
    const state = createInitialState(fixedDeck(), false, Math.random, 'highland')
    expect(state.mapId).toBe('highland')
    expect(state.obstacles).toContainEqual({ x: 3, y: 2 })
    expect(terrainAt(state, { x: 4, y: 2 })).toBe('marsh')
    expect(terrainAt(state, { x: 1, y: 4 })).toBe('watchtower')
    for (const unit of Object.values(state.units)) expect(findPath(state, unit.position, state.controlPoint, unit.id).length).toBeGreaterThan(0)
    expect(state.mapObjects.every(object => !state.obstacles.some(wall => wall.x === object.position.x && wall.y === object.position.y))).toBe(true)
  })

  it('builds a siege map with wall chokepoints and reachable central entrances', () => {
    const state = createInitialState(fixedDeck(), false, Math.random, 'siege')
    expect(state.mapId).toBe('siege')
    expect(state.obstacles).toContainEqual({ x: 3, y: 2 })
    expect(state.obstacles).not.toContainEqual({ x: 4, y: 2 })
    expect(terrainAt(state, { x: 3, y: 3 })).toBe('watchtower')
    expect(findPath(state, state.units.player.position, state.controlPoint, 'player').length).toBeGreaterThan(0)
    expect(findPath(state, state.units.east.position, state.controlPoint, 'east').length).toBeGreaterThan(0)
    expect(state.mapObjects.every(object => !state.obstacles.some(wall => wall.x === object.position.x && wall.y === object.position.y))).toBe(true)
  })
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
  it('uses the 108-card standard package with its printed suits and ranks', () => {
    const deck = createStandardDeck(() => .5)
    expect(deck).toHaveLength(108)
    expect(new Set(deck.map(card => card.id)).size).toBe(108)
    for (const suit of ['spade', 'heart', 'club', 'diamond']) expect(deck.filter(card => card.suit === suit)).toHaveLength(27)
    for (const [kind, count] of [['slash', 30], ['dodge', 15], ['peach', 8]] as const) expect(deck.filter(card => card.kind === kind)).toHaveLength(count)
    expect(deck).toContainEqual(expect.objectContaining({ kind: 'peachGarden', suit: 'heart', rank: 1 }))
    expect(deck).toContainEqual(expect.objectContaining({ kind: 'iceSword', suit: 'spade', rank: 2 }))
    expect(deck).toContainEqual(expect.objectContaining({ kind: 'nullify', suit: 'diamond', rank: 12 }))
    expect(deck).toContainEqual(expect.objectContaining({ kind: 'shield', suit: 'club', rank: 2 }))
    expect(deck.some(card => ['fireSlash', 'thunderSlash', 'wine', 'fireAttack', 'ironChain'].includes(card.kind))).toBe(false)
  })

  it('builds a varied standard-inspired deck with suits and ranks', () => {
    const deck = createDeck()
    expect(deck.length).toBe(116)
    expect(new Set(deck.map(card => card.kind))).toEqual(new Set(['slash', 'fireSlash', 'thunderSlash', 'dodge', 'peach', 'wine', 'duel', 'dismantle', 'snatch', 'drawTwo', 'borrowedSword', 'crossbow', 'qinggang', 'greenDragon', 'spear', 'axe', 'halberd', 'qilinBow', 'gudingBlade', 'vermilionFan', 'doubleSword', 'iceSword', 'shield', 'bagua', 'silverLion', 'arrows', 'barbarians', 'nullify', 'indulgence', 'lightning', 'peachGarden', 'harvest', 'fireAttack', 'ironChain', 'redHare', 'dayuan', 'zixing', 'dilu', 'jueying', 'zhaohuang']))
    expect(deck.every(card => card.rank >= 1 && card.rank <= 13)).toBe(true)
    expect(deck.filter(card => ['dodge', 'peach', 'fireSlash'].includes(card.kind)).every(card => card.suit === 'heart' || card.suit === 'diamond')).toBe(true)
    expect(deck.filter(card => card.kind === 'thunderSlash').every(card => card.suit === 'spade' || card.suit === 'club')).toBe(true)
  })

  it('randomizes the three hidden identities while keeping the lord public', () => {
    const deck = Array.from({ length: 24 }, (_, index) => ({ id: `identity-${index}`, kind: 'slash' as const, suit: 'spade' as const, rank: 7 }))
    const state = createInitialState(deck, true, () => 0)
    expect(state.units.player).toMatchObject({ identity: 'lord', revealed: true })
    expect([state.units.north.identity, state.units.east.identity, state.units.west.identity]).toEqual(['rebel', 'renegade', 'loyalist'])
    expect([state.units.north.revealed, state.units.east.revealed, state.units.west.revealed]).toEqual([false, false, false])
  })

  it('applies terrain movement cost and equipment rules', () => {
    const state = createInitialState(fixedDeck())
    expect(movementCost(state, { x: 0, y: 2 })).toBe(2)
    expect(terrainAt(state, { x: 4, y: 2 })).toBe('bridge')
    expect(movementCost(state, { x: 4, y: 2 })).toBe(1)
    expect(terrainAt(state, { x: 3, y: 6 })).toBe('water')
    expect(terrainAt(state, { x: 0, y: 5 })).toBe('marsh')
    expect(movementCost(state, { x: 0, y: 5 })).toBe(2)
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
    const cavalry = { ...attacker, equipment: {}, skills: ['mashu' as const] }
    const cavalryState = { ...state, units: { ...state.units, player: cavalry, north: defender } }
    expect(combatDistance(cavalryState, cavalry, defender)).toBe(2)
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

  it('grants one extra movement when a turn starts on the central road', () => {
    const state = createInitialState()
    const roadUnit = { ...state.units.player, position: { x: 4, y: 4 } }
    const plainUnit = { ...state.units.player, position: { x: 3, y: 4 } }
    expect(turnMovement(state, roadUnit)).toBe(4)
    expect(turnMovement(state, plainUnit)).toBe(3)
  })

  it('grants two extra attack range from a watchtower', () => {
    const state = createInitialState(fixedDeck())
    const attacker = { ...state.units.player, position: { x: 0, y: 3 } }
    expect(terrainAt(state, attacker.position)).toBe('watchtower')
    expect(effectiveAttackRange(state, attacker)).toBe(attackRange(attacker) + 2)
  })

  it('draws one supply card when a turn ends in a camp', () => {
    const state = createInitialState(fixedDeck())
    const before = state.units.player.hand.length
    const result = resolveEndTurnTerrain(state, 'player')
    expect(result.units.player.hand).toHaveLength(before + 1)
    expect(result.message).toContain('补给牌')
    expect(result.deck).toHaveLength(state.deck.length - 1)
  })

  it('heals a wounded unit when its turn ends in a village', () => {
    const state = createInitialState(fixedDeck())
    const villageState = { ...state, units: { ...state.units, player: { ...state.units.player, position: { x: 6, y: 8 }, hp: 3 } } }
    expect(terrainAt(villageState, villageState.units.player.position)).toBe('village')
    const result = resolveEndTurnTerrain(villageState, 'player')
    expect(result.units.player.hp).toBe(4)
    expect(result.message).toContain('村落休整')
    expect(result.history[0]).toContain('村落休整')
  })

  it('does not heal a full-health unit in a village', () => {
    const state = createInitialState(fixedDeck())
    const villageState = { ...state, units: { ...state.units, player: { ...state.units.player, position: { x: 6, y: 8 } } } }
    expect(resolveEndTurnTerrain(villageState, 'player')).toBe(villageState)
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

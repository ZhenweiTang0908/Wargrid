import type { Card, CardKind, DeckMode, GameState, Identity, MapId, MapObject, Position, Suit, Team, Terrain, TerrainKind, Unit } from '../types'

export const BOARD_SIZE = 9
export const CONTROL_POINT: Position = { x: 4, y: 4 }
export const OBSTACLES: Position[] = [
  { x: 2, y: 2 }, { x: 6, y: 2 }, { x: 2, y: 6 }, { x: 6, y: 6 },
  { x: 1, y: 4 }, { x: 7, y: 4 },
]
const terrainLine = (kind: TerrainKind, cells: Position[]): Terrain[] => cells.map(position => ({ position, kind }))
export const TERRAIN: Terrain[] = [
  ...terrainLine('road', Array.from({ length: 9 }, (_, y) => ({ x: 4, y }))),
  ...terrainLine('water', [
    ...Array.from({ length: 9 }, (_, x) => ({ x, y: 2 })),
    ...Array.from({ length: 9 }, (_, x) => ({ x, y: 6 })),
  ]),
  ...terrainLine('forest', [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 6, y: 7 }, { x: 7, y: 7 }, { x: 1, y: 7 }, { x: 7, y: 1 }]),
  ...terrainLine('ridge', [{ x: 3, y: 3 }, { x: 5, y: 3 }, { x: 3, y: 5 }, { x: 5, y: 5 }]),
  ...terrainLine('camp', [{ x: 4, y: 0 }, { x: 4, y: 8 }]),
  ...terrainLine('watchtower', [{ x: 0, y: 3 }, { x: 8, y: 5 }]),
  ...terrainLine('village', [{ x: 2, y: 0 }, { x: 6, y: 8 }]),
  ...terrainLine('marsh', [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 7, y: 3 }, { x: 8, y: 3 }]),
  ...terrainLine('bridge', [{ x: 4, y: 2 }, { x: 4, y: 6 }]),
]

export const SIEGE_OBSTACLES: Position[] = [
  { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 5, y: 2 }, { x: 6, y: 2 },
  { x: 2, y: 3 }, { x: 6, y: 3 }, { x: 2, y: 5 }, { x: 6, y: 5 },
  { x: 2, y: 6 }, { x: 3, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 6 },
]
export const SIEGE_TERRAIN: Terrain[] = [
  ...terrainLine('road', [
    ...Array.from({ length: 9 }, (_, y) => ({ x: 4, y })),
    ...Array.from({ length: 9 }, (_, x) => ({ x, y: 4 })),
  ]),
  ...terrainLine('watchtower', [{ x: 3, y: 3 }, { x: 5, y: 3 }, { x: 3, y: 5 }, { x: 5, y: 5 }]),
  ...terrainLine('ridge', [{ x: 1, y: 3 }, { x: 7, y: 5 }]),
  ...terrainLine('camp', [{ x: 4, y: 0 }, { x: 4, y: 8 }]),
  ...terrainLine('village', [{ x: 1, y: 1 }, { x: 7, y: 7 }]),
  ...terrainLine('forest', [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 7, y: 8 }, { x: 8, y: 7 }]),
  ...terrainLine('marsh', [{ x: 0, y: 6 }, { x: 8, y: 2 }]),
]
export const HIGHLAND_OBSTACLES: Position[] = [
  { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 },
  { x: 2, y: 7 }, { x: 2, y: 6 }, { x: 3, y: 6 }, { x: 2, y: 5 },
  { x: 6, y: 1 }, { x: 6, y: 2 }, { x: 5, y: 2 }, { x: 6, y: 3 },
  { x: 6, y: 7 }, { x: 6, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 5 },
]
export const HIGHLAND_TERRAIN: Terrain[] = [
  ...terrainLine('road', Array.from({ length: 9 }, (_, x) => ({ x, y: 4 }))),
  ...terrainLine('forest', [{ x: 1, y: 2 }, { x: 1, y: 6 }, { x: 7, y: 2 }, { x: 7, y: 6 }, { x: 3, y: 4 }, { x: 5, y: 4 }]),
  ...terrainLine('ridge', [{ x: 3, y: 3 }, { x: 5, y: 3 }, { x: 3, y: 5 }, { x: 5, y: 5 }]),
  ...terrainLine('watchtower', [{ x: 1, y: 4 }, { x: 7, y: 4 }]),
  ...terrainLine('marsh', [{ x: 4, y: 2 }, { x: 4, y: 6 }]),
  ...terrainLine('camp', [{ x: 4, y: 0 }, { x: 4, y: 8 }]),
  ...terrainLine('village', [{ x: 0, y: 2 }, { x: 8, y: 6 }]),
]
export const WETLAND_OBSTACLES: Position[] = [
  { x: 1, y: 3 }, { x: 7, y: 3 }, { x: 1, y: 5 }, { x: 7, y: 5 },
  { x: 3, y: 1 }, { x: 5, y: 1 }, { x: 3, y: 7 }, { x: 5, y: 7 },
]
export const WETLAND_TERRAIN: Terrain[] = [
  ...terrainLine('water', [
    ...Array.from({ length: 9 }, (_, x) => ({ x, y: 3 })),
    ...Array.from({ length: 9 }, (_, x) => ({ x, y: 5 })),
    ...Array.from({ length: 3 }, (_, y) => ({ x: 0, y: y + 3 })),
    ...Array.from({ length: 3 }, (_, y) => ({ x: 8, y: y + 3 })),
  ]),
  ...terrainLine('marsh', [{ x: 3, y: 4 }, { x: 5, y: 4 }, { x: 2, y: 2 }, { x: 6, y: 2 }, { x: 2, y: 6 }, { x: 6, y: 6 }]),
  ...terrainLine('bridge', [{ x: 2, y: 3 }, { x: 6, y: 3 }, { x: 2, y: 5 }, { x: 6, y: 5 }]),
  ...terrainLine('road', [{ x: 4, y: 0 }, { x: 4, y: 1 }, { x: 4, y: 2 }, { x: 4, y: 6 }, { x: 4, y: 7 }, { x: 4, y: 8 }]),
  ...terrainLine('forest', [{ x: 0, y: 1 }, { x: 8, y: 1 }, { x: 0, y: 7 }, { x: 8, y: 7 }]),
  ...terrainLine('ridge', [{ x: 2, y: 4 }, { x: 6, y: 4 }]),
  ...terrainLine('watchtower', [{ x: 0, y: 4 }, { x: 8, y: 4 }]),
  ...terrainLine('camp', [{ x: 4, y: 0 }, { x: 4, y: 8 }]),
  ...terrainLine('village', [{ x: 1, y: 1 }, { x: 7, y: 7 }]),
]
export const BAMBOO_OBSTACLES: Position[] = [
  { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 5, y: 2 }, { x: 6, y: 2 },
  { x: 2, y: 6 }, { x: 3, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 6 },
  { x: 1, y: 4 }, { x: 7, y: 4 },
]
export const BAMBOO_TERRAIN: Terrain[] = [
  ...terrainLine('forest', [
    { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 3 },
    { x: 7, y: 1 }, { x: 8, y: 1 }, { x: 7, y: 2 }, { x: 8, y: 3 },
    { x: 0, y: 5 }, { x: 1, y: 6 }, { x: 1, y: 7 }, { x: 0, y: 7 },
    { x: 8, y: 5 }, { x: 7, y: 6 }, { x: 7, y: 7 }, { x: 8, y: 7 },
    { x: 3, y: 3 }, { x: 5, y: 3 }, { x: 3, y: 5 }, { x: 5, y: 5 },
  ]),
  ...terrainLine('road', [
    ...Array.from({ length: 9 }, (_, y) => ({ x: 4, y })),
    ...Array.from({ length: 7 }, (_, x) => ({ x: x + 1, y: 4 })),
  ]),
  ...terrainLine('ridge', [{ x: 2, y: 3 }, { x: 6, y: 5 }]),
  ...terrainLine('watchtower', [{ x: 2, y: 5 }, { x: 6, y: 3 }]),
  ...terrainLine('marsh', [{ x: 0, y: 4 }, { x: 8, y: 4 }]),
  ...terrainLine('camp', [{ x: 4, y: 0 }, { x: 4, y: 8 }]),
  ...terrainLine('village', [{ x: 1, y: 0 }, { x: 7, y: 8 }]),
]
const riverObjects: MapObject[] = [
  { id: 'south-cache', position: { x: 3, y: 7 }, kind: 'supplyCache', claimed: false },
  { id: 'north-cache', position: { x: 5, y: 1 }, kind: 'supplyCache', claimed: false },
  { id: 'east-shrine', position: { x: 7, y: 2 }, kind: 'healingShrine', claimed: false },
  { id: 'west-drum', position: { x: 1, y: 6 }, kind: 'warDrum', claimed: false },
  { id: 'west-beacon', position: { x: 0, y: 7 }, kind: 'scoutBeacon', claimed: false },
  { id: 'east-beacon', position: { x: 8, y: 1 }, kind: 'scoutBeacon', claimed: false },
]
const siegeObjects: MapObject[] = [
  { id: 'south-cache', position: { x: 3, y: 7 }, kind: 'supplyCache', claimed: false },
  { id: 'north-cache', position: { x: 5, y: 1 }, kind: 'supplyCache', claimed: false },
  { id: 'east-shrine', position: { x: 7, y: 3 }, kind: 'healingShrine', claimed: false },
  { id: 'west-drum', position: { x: 1, y: 5 }, kind: 'warDrum', claimed: false },
  { id: 'west-beacon', position: { x: 0, y: 7 }, kind: 'scoutBeacon', claimed: false },
  { id: 'east-beacon', position: { x: 8, y: 1 }, kind: 'scoutBeacon', claimed: false },
]
const highlandObjects: MapObject[] = [
  { id: 'south-cache', position: { x: 3, y: 7 }, kind: 'supplyCache', claimed: false },
  { id: 'north-cache', position: { x: 5, y: 1 }, kind: 'supplyCache', claimed: false },
  { id: 'east-shrine', position: { x: 8, y: 3 }, kind: 'healingShrine', claimed: false },
  { id: 'west-drum', position: { x: 0, y: 5 }, kind: 'warDrum', claimed: false },
  { id: 'west-beacon', position: { x: 0, y: 7 }, kind: 'scoutBeacon', claimed: false },
  { id: 'east-beacon', position: { x: 8, y: 1 }, kind: 'scoutBeacon', claimed: false },
]
const wetlandObjects: MapObject[] = [
  { id: 'south-cache', position: { x: 3, y: 6 }, kind: 'supplyCache', claimed: false },
  { id: 'north-cache', position: { x: 5, y: 2 }, kind: 'supplyCache', claimed: false },
  { id: 'east-shrine', position: { x: 7, y: 4 }, kind: 'healingShrine', claimed: false },
  { id: 'west-drum', position: { x: 1, y: 4 }, kind: 'warDrum', claimed: false },
  { id: 'west-beacon', position: { x: 0, y: 7 }, kind: 'scoutBeacon', claimed: false },
  { id: 'east-beacon', position: { x: 8, y: 1 }, kind: 'scoutBeacon', claimed: false },
]
const bambooObjects: MapObject[] = [
  { id: 'south-cache', position: { x: 3, y: 7 }, kind: 'supplyCache', claimed: false },
  { id: 'north-cache', position: { x: 5, y: 1 }, kind: 'supplyCache', claimed: false },
  { id: 'east-shrine', position: { x: 7, y: 5 }, kind: 'healingShrine', claimed: false },
  { id: 'west-drum', position: { x: 1, y: 3 }, kind: 'warDrum', claimed: false },
  { id: 'west-beacon', position: { x: 0, y: 7 }, kind: 'scoutBeacon', claimed: false },
  { id: 'east-beacon', position: { x: 8, y: 1 }, kind: 'scoutBeacon', claimed: false },
]

export const MAP_IDS: MapId[] = ['river', 'siege', 'highland', 'wetland', 'bamboo']
export const MAP_DEFINITIONS: Record<MapId, {
  name: string
  description: string
  obstacles: Position[]
  terrain: Terrain[]
  objects: MapObject[]
  groundColors: [string, string]
  obstacleColor: string
}> = {
  river: { name: '双河争渡', description: '涉水耗力，中央桥梁是交通要道', obstacles: OBSTACLES, terrain: TERRAIN, objects: riverObjects, groundColors: ['#132c32', '#17363d'], obstacleColor: '#453f36' },
  siege: { name: '围城夺旗', description: '城墙阻路，四道入口与瞭望台决定攻防', obstacles: SIEGE_OBSTACLES, terrain: SIEGE_TERRAIN, objects: siegeObjects, groundColors: ['#283a3a', '#304144'], obstacleColor: '#453f36' },
  highland: { name: '山谷伏击', description: '林地掩护，山壁分路，泥沼拖慢中央推进', obstacles: HIGHLAND_OBSTACLES, terrain: HIGHLAND_TERRAIN, objects: highlandObjects, groundColors: ['#2d3b2c', '#354432'], obstacleColor: '#46503d' },
  wetland: { name: '泽国遗城', description: '中央涉水或侧翼过桥，废墟与水道改变路线', obstacles: WETLAND_OBSTACLES, terrain: WETLAND_TERRAIN, objects: wetlandObjects, groundColors: ['#273a35', '#30443a'], obstacleColor: '#453f36' },
  bamboo: { name: '竹林古道', description: '竹林掩护两翼，碎石断道迫使短兵相接', obstacles: BAMBOO_OBSTACLES, terrain: BAMBOO_TERRAIN, objects: bambooObjects, groundColors: ['#263d30', '#2d4935'], obstacleColor: '#4c5541' },
}

export const samePosition = (a: Position, b: Position) => a.x === b.x && a.y === b.y
export const positionKey = (p: Position) => `${p.x},${p.y}`
export function terrainAt(state: Pick<GameState, 'terrain'>, p: Position): TerrainKind {
  for (let index = state.terrain.length - 1; index >= 0; index--) {
    if (samePosition(state.terrain[index].position, p)) return state.terrain[index].kind
  }
  return 'plain'
}
export const movementCost = (state: Pick<GameState, 'terrain'>, p: Position) => ['water', 'marsh'].includes(terrainAt(state, p)) ? 2 : 1
export const turnMovement = (state: Pick<GameState, 'terrain'>, unit: Unit) => terrainAt(state, unit.position) === 'road' ? 4 : 3

const CARD_COUNTS: Partial<Record<CardKind, number>> = {
  slash: 18, fireSlash: 4, thunderSlash: 2, dodge: 12, peach: 8, wine: 5, duel: 4, dismantle: 5,
  snatch: 5, drawTwo: 4, borrowedSword: 2, crossbow: 2, qinggang: 2, greenDragon: 1, shield: 2,
  spear: 1, axe: 1, halberd: 1, qilinBow: 1, bagua: 2, silverLion: 1,
  gudingBlade: 1, vermilionFan: 1,
  doubleSword: 1, iceSword: 1,
  arrows: 2, barbarians: 2, nullify: 4, indulgence: 3, lightning: 2,
  peachGarden: 2, harvest: 2, fireAttack: 3, ironChain: 3,
  redHare: 1, dayuan: 1, zixing: 1, dilu: 1, jueying: 1, zhaohuang: 1,
}

export function createDeck(): Card[] {
  const suits: Suit[] = ['spade', 'heart', 'club', 'diamond']
  const cardSuits: Partial<Record<CardKind, Suit[]>> = {
    dodge: ['heart', 'diamond'],
    peach: ['heart', 'diamond'],
    fireSlash: ['heart', 'diamond'],
    thunderSlash: ['spade', 'club'],
  }
  let index = 0
  const cards: Card[] = []
  for (const [kind, count] of Object.entries(CARD_COUNTS) as [CardKind, number][]) {
    const availableSuits = cardSuits[kind] ?? suits
    for (let n = 0; n < count; n++) cards.push({ id: `card-${++index}`, kind, suit: availableSuits[n % availableSuits.length], rank: (index % 13) + 1 })
  }
  return shuffle(cards)
}

// Standard package: two cards per rank and suit, plus four EX cards.
// Source: https://wiki.biligame.com/sgs/标准包卡牌
const STANDARD_ROWS: Record<Suit, [CardKind, CardKind][]> = {
  heart: [
    ['peachGarden', 'arrows'], ['dodge', 'dodge'], ['peach', 'harvest'], ['peach', 'harvest'],
    ['qilinBow', 'redHare'], ['peach', 'indulgence'], ['peach', 'drawTwo'], ['peach', 'drawTwo'],
    ['peach', 'drawTwo'], ['slash', 'slash'], ['slash', 'drawTwo'], ['peach', 'dismantle'], ['dodge', 'zhaohuang'],
  ],
  spade: [
    ['duel', 'lightning'], ['doubleSword', 'bagua'], ['dismantle', 'snatch'], ['dismantle', 'snatch'],
    ['greenDragon', 'jueying'], ['indulgence', 'qinggang'], ['slash', 'barbarians'], ['slash', 'slash'],
    ['slash', 'slash'], ['slash', 'slash'], ['snatch', 'nullify'], ['dismantle', 'spear'], ['barbarians', 'dayuan'],
  ],
  diamond: [
    ['crossbow', 'duel'], ['dodge', 'dodge'], ['dodge', 'snatch'], ['dodge', 'snatch'],
    ['dodge', 'axe'], ['slash', 'dodge'], ['slash', 'dodge'], ['slash', 'dodge'],
    ['slash', 'dodge'], ['slash', 'dodge'], ['dodge', 'dodge'], ['peach', 'halberd'], ['slash', 'zixing'],
  ],
  club: [
    ['duel', 'crossbow'], ['slash', 'bagua'], ['slash', 'dismantle'], ['slash', 'dismantle'],
    ['slash', 'dilu'], ['slash', 'indulgence'], ['slash', 'barbarians'], ['slash', 'slash'],
    ['slash', 'slash'], ['slash', 'slash'], ['slash', 'slash'], ['borrowedSword', 'nullify'], ['borrowedSword', 'nullify'],
  ],
}
const STANDARD_EX: [Suit, number, CardKind][] = [
  ['heart', 12, 'lightning'], ['spade', 2, 'iceSword'], ['diamond', 12, 'nullify'], ['club', 2, 'shield'],
]

export function createStandardDeck(random = Math.random): Card[] {
  const cards: Card[] = []
  for (const suit of ['heart', 'spade', 'diamond', 'club'] as Suit[]) {
    STANDARD_ROWS[suit].forEach((pair, index) => pair.forEach((kind, copy) => {
      cards.push({ id: `standard-${suit}-${index + 1}-${copy}`, kind, suit, rank: index + 1 })
    }))
  }
  STANDARD_EX.forEach(([suit, rank, kind]) => cards.push({ id: `standard-ex-${suit}`, kind, suit, rank }))
  return shuffle(cards, random)
}

export function shuffle<T>(items: T[], random = Math.random): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function isBlocked(state: Pick<GameState, 'size' | 'obstacles' | 'units'>, p: Position, ignore?: Team) {
  if (p.x < 0 || p.y < 0 || p.x >= state.size || p.y >= state.size) return true
  if (state.obstacles.some(o => samePosition(o, p))) return true
  return Object.values(state.units).some(u => u.id !== ignore && u.hp > 0 && samePosition(u.position, p))
}
export const neighbors = (p: Position): Position[] => [{ x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 }]

export function findPath(state: Pick<GameState, 'size' | 'obstacles' | 'units' | 'terrain'>, start: Position, goal: Position, ignore?: Team): Position[] {
  if (samePosition(start, goal)) return []
  const frontier = [{ position: start, cost: 0 }]
  const costs = new Map([[positionKey(start), 0]])
  const previous = new Map<string, Position>()
  while (frontier.length) {
    frontier.sort((a, b) => a.cost - b.cost)
    const current = frontier.shift()!
    if (samePosition(current.position, goal)) {
      const path: Position[] = []; let cursor = goal
      while (!samePosition(cursor, start)) { path.unshift(cursor); cursor = previous.get(positionKey(cursor))! }
      return path
    }
    for (const next of neighbors(current.position)) {
      if (isBlocked(state, next, ignore)) continue
      const nextCost = current.cost + movementCost(state, next)
      if (nextCost >= (costs.get(positionKey(next)) ?? Infinity)) continue
      costs.set(positionKey(next), nextCost); previous.set(positionKey(next), current.position); frontier.push({ position: next, cost: nextCost })
    }
  }
  return []
}

export const pathCost = (state: Pick<GameState, 'terrain'>, path: Position[]) => path.reduce((sum, p) => sum + movementCost(state, p), 0)

export function reachableCells(state: Pick<GameState, 'size' | 'obstacles' | 'units' | 'terrain'>, unit: Unit): Position[] {
  const found: Position[] = []
  for (let y = 0; y < state.size; y++) for (let x = 0; x < state.size; x++) {
    const p = { x, y }; if (isBlocked(state, p, unit.id)) continue
    const path = findPath(state, unit.position, p, unit.id)
    if (path.length && pathCost(state, path) <= unit.movement) found.push(p)
  }
  return found
}

export function pathDistance(state: Pick<GameState, 'size' | 'obstacles' | 'units' | 'terrain'>, from: Position, to: Position, moving?: Team): number {
  if (samePosition(from, to)) return 0
  const targetUnit = Object.values(state.units).find(u => samePosition(u.position, to))
  if (targetUnit) {
    let best = Infinity
    for (const adjacent of neighbors(to)) {
      if (isBlocked(state, adjacent, moving)) continue
      const path = findPath(state, from, adjacent, moving)
      if (path.length || samePosition(from, adjacent)) best = Math.min(best, path.length + 1)
    }
    return best
  }
  const path = findPath(state, from, to, moving)
  return path.length || Infinity
}

export function attackRange(unit: Unit) {
  const ranges: Partial<Record<CardKind, number>> = { qinggang: 2, greenDragon: 3, spear: 3, axe: 3, halberd: 4, qilinBow: 5, gudingBlade: 2, vermilionFan: 4, doubleSword: 2, iceSword: 2 }
  return unit.equipment.weapon ? ranges[unit.equipment.weapon.kind] ?? 1 : 1
}
export function slashLimit(unit: Unit) { return unit.equipment.weapon?.kind === 'crossbow' || unit.skill === 'paoxiao' ? Infinity : 1 }
export function combatDistance(state: GameState, attacker: Unit, target: Unit) {
  const base = pathDistance(state, attacker.position, target.position, attacker.id)
  const attackBonus = attacker.equipment.offensiveMount && ['redHare', 'dayuan', 'zixing'].includes(attacker.equipment.offensiveMount.kind) ? 1 : 0
  const cavalryBonus = attacker.skills.includes('mashu') ? 1 : 0
  const defenseBonus = target.equipment.defensiveMount && ['dilu', 'jueying', 'zhaohuang'].includes(target.equipment.defensiveMount.kind) ? 1 : 0
  const forestCover = terrainAt(state, target.position) === 'forest' ? 1 : 0
  return Math.max(1, base - attackBonus - cavalryBonus + defenseBonus + forestCover)
}
export const effectiveAttackRange = (state: GameState, attacker: Unit) => attackRange(attacker) + (terrainAt(state, attacker.position) === 'ridge' ? 1 : terrainAt(state, attacker.position) === 'watchtower' ? 2 : 0)
export const canSlash = (state: GameState, attacker: Unit, target: Unit) => attacker.hp > 0 && target.hp > 0 && !(target.skills.includes('kongcheng') && target.hand.length === 0) && attacker.attacksUsed < slashLimit(attacker) && combatDistance(state, attacker, target) <= effectiveAttackRange(state, attacker)
export const canBorrowedSwordTarget = (state: GameState, wielder: Unit, victim: Unit) => !!wielder.equipment.weapon && wielder.hp > 0 && victim.hp > 0 && wielder.id !== victim.id && !(victim.skills.includes('kongcheng') && victim.hand.length === 0) && combatDistance(state, wielder, victim) <= effectiveAttackRange(state, wielder)
export const canPeach = (unit: Unit) => unit.hp > 0 && unit.hp < unit.maxHp
export const isSlashKind = (kind: CardKind) => kind === 'slash' || kind === 'fireSlash' || kind === 'thunderSlash'
export const isRedCard = (card: Card) => card.suit === 'heart' || card.suit === 'diamond'
export const isEquipment = (kind: CardKind) => ['crossbow', 'qinggang', 'greenDragon', 'spear', 'axe', 'halberd', 'qilinBow', 'gudingBlade', 'vermilionFan', 'doubleSword', 'iceSword', 'shield', 'bagua', 'silverLion', 'redHare', 'dayuan', 'zixing', 'dilu', 'jueying', 'zhaohuang'].includes(kind)

export function drawCards(deck: Card[], discard: Card[], count: number, random = Math.random) {
  let nextDeck = [...deck], nextDiscard = [...discard]; const drawn: Card[] = []
  while (drawn.length < count) {
    if (!nextDeck.length) { nextDeck = shuffle(nextDiscard, random); nextDiscard = [] }
    const card = nextDeck.shift(); if (!card) break; drawn.push(card)
  }
  return { drawn, deck: nextDeck, discard: nextDiscard }
}

export function scoreControlPoint(state: GameState, team: Team): GameState {
  const unit = state.units[team]
  if (!samePosition(unit.position, state.controlPoint) || unit.hp <= 0) return state
  const score = state.scores[team] + 1
  return { ...state, scores: { ...state.scores, [team]: score }, winner: score >= 3 ? team : state.winner, phase: score >= 3 ? 'finished' : state.phase, message: score >= 3 ? `${unit.name}占领中枢，赢得战局！` : `${unit.name}占领中枢，获得 1 分` }
}

export function resolveEndTurnTerrain(state: GameState, team: Team): GameState {
  const unit = state.units[team]
  const terrain = terrainAt(state, unit.position)
  if (unit.hp <= 0) return state
  if (terrain === 'village' && unit.hp < unit.maxHp) {
    const message = `${unit.name}在村落休整，回复 1 点体力`
    return { ...state, units: { ...state.units, [team]: { ...unit, hp: unit.hp + 1, animation: 'heal' } }, message, history: [message, ...state.history].slice(0, 8) }
  }
  if (terrain !== 'camp') return state
  const draw = drawCards(state.deck, state.discard, 1)
  if (!draw.drawn.length) return state
  const message = `${unit.name}驻守营地，获得一张补给牌`
  return { ...state, units: { ...state.units, [team]: { ...unit, hand: [...unit.hand, ...draw.drawn], animation: 'cast' } }, deck: draw.deck, discard: draw.discard, message, history: [message, ...state.history].slice(0, 8) }
}

export function determineWinner(units: Record<Team, Unit>): Team | null {
  const alive = Object.values(units).filter(unit => unit.hp > 0)
  const lordAlive = alive.some(unit => unit.identity === 'lord')
  const rebelsAlive = alive.some(unit => unit.identity === 'rebel')
  const renegadeAlive = alive.some(unit => unit.identity === 'renegade')
  if (!lordAlive) {
    if (alive.length === 1 && alive[0].identity === 'renegade') return alive[0].id
    return Object.values(units).find(unit => unit.identity === 'rebel')?.id ?? 'east'
  }
  if (!rebelsAlive && !renegadeAlive) return Object.values(units).find(unit => unit.identity === 'lord')?.id ?? 'player'
  return null
}

export function createInitialState(deck?: Card[], randomizeIdentities = false, random = Math.random, mapId: MapId = 'river', deckMode: DeckMode = 'standard'): GameState {
  const initialDeck = deck ?? (deckMode === 'standard' ? createStandardDeck(random) : createDeck())
  const hiddenIdentities: Identity[] = randomizeIdentities ? shuffle<Identity>(['loyalist', 'rebel', 'renegade'], random) : ['loyalist', 'rebel', 'renegade']
  const map = MAP_DEFINITIONS[mapId]
  const state: GameState = {
    mapId, deckMode, size: BOARD_SIZE, terrain: map.terrain, obstacles: map.obstacles, controlPoint: CONTROL_POINT,
    mapObjects: map.objects.map(object => ({ ...object, position: { ...object.position } })),
    units: {
      player: { id: 'player', name: '关羽', title: '美髯公', team: 'player', identity: 'lord', faction: 'shu', gender: 'male', revealed: true, position: { x: 4, y: 8 }, hp: 5, maxHp: 5, hand: initialDeck.slice(0, 4), equipment: {}, judgement: [], skill: 'wusheng', skills: ['wusheng'], movement: 3, attacksUsed: 0, wineUsed: false, drunk: false, luoyiActive: false, rendeGiven: 0, chained: false, skillUsed: false, animation: 'idle' },
      north: { id: 'north', name: '赵云', title: '少年将军', team: 'north', identity: hiddenIdentities[0], faction: 'shu', gender: 'male', revealed: false, position: { x: 4, y: 0 }, hp: 4, maxHp: 4, hand: initialDeck.slice(4, 8), equipment: {}, judgement: [], skill: 'longdan', skills: ['longdan'], movement: 3, attacksUsed: 0, wineUsed: false, drunk: false, luoyiActive: false, rendeGiven: 0, chained: false, skillUsed: false, animation: 'idle' },
      east: { id: 'east', name: '夏侯惇', title: '独眼的罗刹', team: 'east', identity: hiddenIdentities[1], faction: 'wei', gender: 'male', revealed: false, position: { x: 8, y: 4 }, hp: 4, maxHp: 4, hand: initialDeck.slice(8, 12), equipment: {}, judgement: [], skill: 'ganglie', skills: ['ganglie'], movement: 3, attacksUsed: 0, wineUsed: false, drunk: false, luoyiActive: false, rendeGiven: 0, chained: false, skillUsed: false, animation: 'idle' },
      west: { id: 'west', name: '司马懿', title: '狼顾之鬼', team: 'west', identity: hiddenIdentities[2], faction: 'wei', gender: 'male', revealed: false, position: { x: 0, y: 4 }, hp: 4, maxHp: 4, hand: initialDeck.slice(12, 16), equipment: {}, judgement: [], skill: 'feedback', skills: ['feedback', 'guicai'], movement: 3, attacksUsed: 0, wineUsed: false, drunk: false, luoyiActive: false, rendeGiven: 0, chained: false, skillUsed: false, animation: 'idle' },
    },
    deck: initialDeck.slice(16), discard: [], phase: 'player', turnStage: 'play', turn: 1,
    scores: { player: 0, north: 0, east: 0, west: 0 }, turnOrder: ['player', 'north', 'east', 'west'], currentUnit: 'player', generalSelected: false, selectedUnit: 'player', selectedCardId: null, borrowedSwordWielder: null, selectedAsSlash: false, selectedAsDismantle: false, selectedAsFanjian: false, selectedAsRende: false, selectedAsGuose: false, lijianMode: false, lijianTargets: [], spearMode: false, spearSelection: [], jijiangSource: null, zhihengMode: false, zhihengSelection: [], discardSelection: [],
    chainTargets: [], reachable: [], pathPreview: [], pendingResponse: null, pendingHarvest: null, pendingFanjian: null, pendingPlunder: null, pendingJudgement: null, pendingLuoshen: null, pendingGuanxing: null, pendingTuxi: null, pendingLuoyi: null, pendingGreenDragon: null, pendingLiuli: null, pendingTurnStart: null, winner: null, message: '出牌阶段 · 移动或使用手牌', history: ['战局开始'],
  }
  state.reachable = reachableCells(state, state.units.player)
  return state
}

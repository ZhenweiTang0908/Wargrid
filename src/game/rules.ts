import type { Card, CardKind, GameState, Position, Team, Unit } from '../types'

export const BOARD_SIZE = 7
export const CONTROL_POINT: Position = { x: 3, y: 3 }
export const OBSTACLES: Position[] = [
  { x: 2, y: 1 }, { x: 4, y: 1 },
  { x: 1, y: 3 }, { x: 5, y: 3 },
  { x: 2, y: 5 }, { x: 4, y: 5 },
]

export const samePosition = (a: Position, b: Position) => a.x === b.x && a.y === b.y
export const positionKey = (p: Position) => `${p.x},${p.y}`

export function createDeck(): Card[] {
  const kinds: CardKind[] = [
    ...Array<CardKind>(12).fill('slash'),
    ...Array<CardKind>(9).fill('dodge'),
    ...Array<CardKind>(7).fill('peach'),
  ]
  return shuffle(kinds.map((kind, index) => ({ id: `card-${index + 1}`, kind })))
}

export function shuffle<T>(items: T[], random = Math.random): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function isBlocked(state: Pick<GameState, 'size' | 'obstacles' | 'units'>, p: Position, ignore?: Team) {
  if (p.x < 0 || p.y < 0 || p.x >= state.size || p.y >= state.size) return true
  if (state.obstacles.some(o => samePosition(o, p))) return true
  return Object.values(state.units).some(u => u.id !== ignore && u.hp > 0 && samePosition(u.position, p))
}

const neighbors = (p: Position): Position[] => [
  { x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y },
  { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 },
]

export function findPath(state: Pick<GameState, 'size' | 'obstacles' | 'units'>, start: Position, goal: Position, ignore?: Team): Position[] {
  if (samePosition(start, goal)) return []
  const queue: Position[] = [start]
  const visited = new Set([positionKey(start)])
  const previous = new Map<string, Position>()
  while (queue.length) {
    const current = queue.shift()!
    for (const next of neighbors(current)) {
      const key = positionKey(next)
      const isGoal = samePosition(next, goal)
      if (visited.has(key) || (!isGoal && isBlocked(state, next, ignore)) || (isGoal && isBlocked(state, next, ignore))) continue
      visited.add(key)
      previous.set(key, current)
      if (isGoal) {
        const path: Position[] = [next]
        let cursor = current
        while (!samePosition(cursor, start)) {
          path.unshift(cursor)
          cursor = previous.get(positionKey(cursor))!
        }
        return path
      }
      queue.push(next)
    }
  }
  return []
}

export function reachableCells(state: Pick<GameState, 'size' | 'obstacles' | 'units'>, unit: Unit): Position[] {
  const found: Position[] = []
  const queue = [{ position: unit.position, cost: 0 }]
  const visited = new Set([positionKey(unit.position)])
  while (queue.length) {
    const { position, cost } = queue.shift()!
    if (cost > 0) found.push(position)
    if (cost >= unit.movement) continue
    for (const next of neighbors(position)) {
      const key = positionKey(next)
      if (visited.has(key) || isBlocked(state, next, unit.id)) continue
      visited.add(key)
      queue.push({ position: next, cost: cost + 1 })
    }
  }
  return found
}

export function pathDistance(state: Pick<GameState, 'size' | 'obstacles' | 'units'>, from: Position, to: Position, moving?: Team): number {
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

export const canSlash = (state: GameState, attacker: Unit, target: Unit) =>
  attacker.hp > 0 && target.hp > 0 && attacker.attacksUsed < 1 && pathDistance(state, attacker.position, target.position, attacker.id) <= 1

export const canPeach = (unit: Unit) => unit.hp > 0 && unit.hp < unit.maxHp

export function drawCards(deck: Card[], discard: Card[], count: number, random = Math.random) {
  let nextDeck = [...deck]
  let nextDiscard = [...discard]
  const drawn: Card[] = []
  while (drawn.length < count) {
    if (!nextDeck.length) {
      nextDeck = shuffle(nextDiscard, random)
      nextDiscard = []
    }
    const card = nextDeck.shift()
    if (!card) break
    drawn.push(card)
  }
  return { drawn, deck: nextDeck, discard: nextDiscard }
}

export function scoreControlPoint(state: GameState, team: Team): GameState {
  const unit = state.units[team]
  if (!samePosition(unit.position, state.controlPoint) || unit.hp <= 0) return state
  const score = state.scores[team] + 1
  return {
    ...state,
    scores: { ...state.scores, [team]: score },
    winner: score >= 3 ? team : state.winner,
    phase: score >= 3 ? 'finished' : state.phase,
    message: score >= 3 ? `${unit.name}占领中枢，赢得战局！` : `${unit.name}占领中枢，获得 1 分`,
  }
}

export function createInitialState(deck = createDeck()): GameState {
  const playerHand = deck.slice(0, 4)
  const enemyHand = deck.slice(4, 8)
  const state: GameState = {
    size: BOARD_SIZE,
    obstacles: OBSTACLES,
    controlPoint: CONTROL_POINT,
    units: {
      player: { id: 'player', name: '苍锋', team: 'player', position: { x: 3, y: 6 }, hp: 4, maxHp: 4, hand: playerHand, movement: 3, attacksUsed: 0, animation: 'idle' },
      enemy: { id: 'enemy', name: '赤骁', team: 'enemy', position: { x: 3, y: 0 }, hp: 4, maxHp: 4, hand: enemyHand, movement: 3, attacksUsed: 0, animation: 'idle' },
    },
    deck: deck.slice(8), discard: [], phase: 'player', turn: 1,
    scores: { player: 0, enemy: 0 }, selectedUnit: 'player', selectedCardId: null,
    reachable: [], pathPreview: [], pendingAttack: null, winner: null,
    message: '你的回合 · 选择高亮格移动，或使用手牌',
  }
  state.reachable = reachableCells(state, state.units.player)
  return state
}

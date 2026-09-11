import { create } from 'zustand'
import type { Card, GameAction, GameState, Position, Team } from '../types'
import { canPeach, canSlash, createInitialState, drawCards, findPath, pathDistance, reachableCells, samePosition, scoreControlPoint } from './rules'

interface GameStore extends GameState {
  dispatch: (action: GameAction) => void
  selectCard: (id: string | null) => void
  hoverCell: (position: Position | null) => void
  runAI: () => Promise<void>
  resetAnimation: (team: Team) => void
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const otherTeam = (team: Team): Team => team === 'player' ? 'enemy' : 'player'

function removeCard(hand: Card[], id: string) {
  const card = hand.find(c => c.id === id)
  return { card, hand: hand.filter(c => c.id !== id) }
}

function resolveAttack(state: GameState, attackerId: Team, targetId: Team): Partial<GameState> {
  const attacker = state.units[attackerId]
  const target = state.units[targetId]
  const dodge = target.hand.find(c => c.kind === 'dodge')
  const targetHand = dodge ? target.hand.filter(c => c.id !== dodge.id) : target.hand
  const hp = dodge ? target.hp : target.hp - 1
  const winner = hp <= 0 ? attackerId : null
  return {
    units: {
      ...state.units,
      [attackerId]: { ...attacker, attacksUsed: attacker.attacksUsed + 1, animation: 'attack' },
      [targetId]: { ...target, hand: targetHand, hp: Math.max(0, hp), animation: dodge ? 'idle' : 'hit' },
    },
    discard: dodge ? [...state.discard, dodge] : state.discard,
    pendingAttack: null,
    winner,
    phase: winner ? 'finished' : state.phase,
    message: winner ? `${attacker.name}击败了${target.name}！` : dodge ? `${target.name}打出【闪】，避开攻击` : `${target.name}受到 1 点伤害`,
  }
}

export const useGameStore = create<GameStore>((set, get) => ({
  ...createInitialState(),

  dispatch: (action) => {
    if (action.type === 'RESTART') {
      set({ ...createInitialState() })
      return
    }
    const state = get()
    if (state.phase === 'finished') return

    if (action.type === 'MOVE') {
      const unit = state.units[action.unit]
      if (state.phase !== action.unit || unit.movement <= 0) return
      const path = findPath(state, unit.position, action.to, unit.id)
      if (!path.length || path.length > unit.movement) return
      const updated = { ...unit, position: action.to, movement: unit.movement - path.length, animation: 'move' as const }
      const units = { ...state.units, [action.unit]: updated }
      set({ units, reachable: action.unit === 'player' ? reachableCells({ ...state, units }, updated) : [], pathPreview: [], message: `${unit.name}移动了 ${path.length} 格` })
      return
    }

    if (action.type === 'PLAY_CARD') {
      const unit = state.units[action.unit]
      if (state.phase !== action.unit) return
      const removed = removeCard(unit.hand, action.cardId)
      if (!removed.card) return
      if (removed.card.kind === 'peach') {
        if (!canPeach(unit)) return
        set({ units: { ...state.units, [action.unit]: { ...unit, hand: removed.hand, hp: unit.hp + 1, animation: 'heal' } }, discard: [...state.discard, removed.card], selectedCardId: null, message: `${unit.name}使用【桃】，回复 1 点体力` })
        return
      }
      if (removed.card.kind === 'slash' && action.target) {
        const target = state.units[action.target]
        if (!canSlash(state, unit, target)) return
        const base: GameState = { ...state, units: { ...state.units, [action.unit]: { ...unit, hand: removed.hand } }, discard: [...state.discard, removed.card], selectedCardId: null }
        set(resolveAttack(base, action.unit, action.target))
      }
      return
    }

    if (action.type === 'RESPOND' && state.pendingAttack) {
      const { attacker, target } = state.pendingAttack
      set(resolveAttack(state, attacker, target))
      return
    }

    if (action.type === 'END_TURN' && state.phase === 'player') {
      let scored = scoreControlPoint(state, 'player')
      if (scored.winner) { set(scored); return }
      const draw = drawCards(scored.deck, scored.discard, 2)
      const enemy = { ...scored.units.enemy, hand: [...scored.units.enemy.hand, ...draw.drawn], movement: 3, attacksUsed: 0, animation: 'idle' as const }
      set({ ...scored, units: { ...scored.units, enemy }, deck: draw.deck, discard: draw.discard, phase: 'ai', selectedCardId: null, reachable: [], pathPreview: [], message: '敌方正在思考…' })
      void get().runAI()
    }
  },

  selectCard: (id) => {
    const state = get()
    if (state.phase !== 'player') return
    if (!id) { set({ selectedCardId: null, message: '已取消选牌' }); return }
    const selectedCard = state.units.player.hand.find(c => c.id === id)
    if (!selectedCard) { set({ selectedCardId: null }); return }
    if (selectedCard.kind === 'dodge') { set({ message: '【闪】会在受到攻击时自动使用' }); return }
    set({ selectedCardId: state.selectedCardId === id ? null : id, message: selectedCard.kind === 'slash' ? '选择攻击范围内的敌方棋子' : '再次点击【桃】立即使用' })
    if (selectedCard.kind === 'peach' && state.selectedCardId === id) get().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: id })
  },

  hoverCell: (position) => {
    const state = get()
    if (!position || state.phase !== 'player') { set({ pathPreview: [] }); return }
    const path = findPath(state, state.units.player.position, position, 'player')
    set({ pathPreview: path.length <= state.units.player.movement ? path : [] })
  },

  resetAnimation: (team) => set(state => ({ units: { ...state.units, [team]: { ...state.units[team], animation: 'idle' } } })),

  runAI: async () => {
    await wait(550)
    let state = get()
    if (state.phase !== 'ai') return
    let ai = state.units.enemy
    const player = state.units.player

    const peach = ai.hand.find(c => c.kind === 'peach')
    if (peach && ai.hp < ai.maxHp) {
      get().dispatch({ type: 'PLAY_CARD', unit: 'enemy', cardId: peach.id })
      await wait(500)
      state = get(); ai = state.units.enemy
    }

    const slash = ai.hand.find(c => c.kind === 'slash')
    if (slash && canSlash(state, ai, player)) {
      get().dispatch({ type: 'PLAY_CARD', unit: 'enemy', cardId: slash.id, target: 'player' })
      await wait(650)
    } else {
      const targets = slash ? [player.position, state.controlPoint] : [state.controlPoint, player.position]
      let bestPath: Position[] = []
      for (const target of targets) {
        const isControlPoint = samePosition(target, state.controlPoint)
        const candidates = isControlPoint ? [target] : [
          { x: target.x + 1, y: target.y }, { x: target.x - 1, y: target.y },
          { x: target.x, y: target.y + 1 }, { x: target.x, y: target.y - 1 },
        ]
        for (const candidate of candidates) {
          const path = findPath(state, ai.position, candidate, 'enemy')
          if (path.length && (!bestPath.length || path.length < bestPath.length)) bestPath = path
        }
        if (bestPath.length) break
      }
      if (bestPath.length) {
        const step = bestPath[Math.min(ai.movement, bestPath.length) - 1]
        get().dispatch({ type: 'MOVE', unit: 'enemy', to: step })
        await wait(650)
      }
      state = get(); ai = state.units.enemy
      const nextSlash = ai.hand.find(c => c.kind === 'slash')
      if (nextSlash && canSlash(state, ai, state.units.player)) {
        get().dispatch({ type: 'PLAY_CARD', unit: 'enemy', cardId: nextSlash.id, target: 'player' })
        await wait(650)
      }
    }

    state = get()
    if (state.phase === 'finished') return
    let scored = scoreControlPoint(state, 'enemy')
    if (scored.winner) { set(scored); return }
    const draw = drawCards(scored.deck, scored.discard, 2)
    const nextPlayer = { ...scored.units.player, hand: [...scored.units.player.hand, ...draw.drawn], movement: 3, attacksUsed: 0, animation: 'idle' as const }
    const units = { ...scored.units, player: nextPlayer, enemy: { ...scored.units.enemy, animation: 'idle' as const } }
    const next: GameState = { ...scored, units, deck: draw.deck, discard: draw.discard, phase: 'player', turn: scored.turn + 1, message: '你的回合 · 选择高亮格移动，或使用手牌', selectedCardId: null, pathPreview: [], reachable: [] }
    next.reachable = reachableCells(next, nextPlayer)
    set(next)
  },
}))

export function isCellReachable(cells: Position[], position: Position) {
  return cells.some(cell => samePosition(cell, position))
}

export function attackDistance(state: GameState) {
  return pathDistance(state, state.units.player.position, state.units.enemy.position, 'player')
}

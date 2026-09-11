import { create } from 'zustand'
import { CARD_LABEL, type Card, type GameAction, type GameState, type Position, type Team, type Unit } from '../types'
import { attackRange, canPeach, canSlash, createInitialState, determineWinner, drawCards, findPath, isEquipment, pathCost, pathDistance, reachableCells, samePosition, scoreControlPoint } from './rules'

interface GameStore extends GameState {
  dispatch: (action: GameAction) => void
  selectCard: (id: string | null) => void
  activateWusheng: () => void
  hoverCell: (position: Position | null) => void
  runAI: () => Promise<void>
  resetAnimation: (team: Team) => void
}
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const nextSeat = (state: GameState, team: Team) => {
  const start = state.turnOrder.indexOf(team)
  for (let offset = 1; offset <= state.turnOrder.length; offset++) {
    const candidate = state.turnOrder[(start + offset) % state.turnOrder.length]
    if (state.units[candidate].hp > 0) return candidate
  }
  return team
}
const targetsFor = (state: GameState, team: Team) => {
  const actor = state.units[team], alive = Object.values(state.units).filter(unit => unit.id !== team && unit.hp > 0)
  if (actor.identity === 'lord' || actor.identity === 'loyalist') return alive.sort((a, b) => (a.identity === 'rebel' ? -2 : a.identity === 'renegade' ? -1 : 1) - (b.identity === 'rebel' ? -2 : b.identity === 'renegade' ? -1 : 1))
  if (actor.identity === 'rebel') return alive.sort((a, b) => (a.identity === 'lord' ? -2 : a.identity === 'loyalist' ? -1 : 1) - (b.identity === 'lord' ? -2 : b.identity === 'loyalist' ? -1 : 1))
  return alive.sort((a, b) => a.hp - b.hp || (a.identity === 'lord' ? 1 : -1))
}
const primaryTarget = (state: GameState, team: Team) => targetsFor(state, team)[0]?.id ?? team
const log = (state: GameState, message: string) => [message, ...state.history].slice(0, 8)
const takeCard = (hand: Card[], id: string) => ({ card: hand.find(c => c.id === id), hand: hand.filter(c => c.id !== id) })

function damage(state: GameState, attackerId: Team, targetId: Team, amount: number, message: string): Partial<GameState> {
  const target = state.units[targetId]
  let hp = target.hp - amount, hand = target.hand, discard = state.discard
  const rescue = hp <= 0 ? hand.find(c => c.kind === 'peach') : undefined
  if (rescue) { hand = hand.filter(c => c.id !== rescue.id); discard = [...discard, rescue]; hp = 1 }
  let units = { ...state.units, [targetId]: { ...target, hand, hp: Math.max(0, hp), revealed: hp <= 0 ? true : target.revealed, animation: 'hit' as const } }
  const winner = determineWinner(units)
  const finalMessage = hp <= 0 ? `${state.units[attackerId].name}击败了${target.name}，其身份是${target.identity === 'loyalist' ? '忠臣' : target.identity === 'rebel' ? '反贼' : target.identity === 'renegade' ? '内奸' : '主公'}！` : rescue ? `${target.name}进入濒死并使用【桃】自救` : message
  const resolveSkill = target.skill === 'resolve' && hp > 0
  const draw = resolveSkill ? drawCards(state.deck, discard, 1) : null
  if (draw) { hand = [...hand, ...draw.drawn]; discard = draw.discard }
  if (draw) units = { ...units, [targetId]: { ...units[targetId], hand } }
  return { units, deck: draw?.deck ?? state.deck, discard, winner, phase: winner ? 'finished' : state.phase, message: finalMessage, history: log(state, resolveSkill ? `${finalMessage}；发动【刚烈】摸一张牌` : finalMessage) }
}

function resolveSlash(state: GameState, attackerId: Team, targetId: Team): Partial<GameState> {
  const attacker = state.units[attackerId], target = state.units[targetId]
  const slashCard = state.discard[state.discard.length - 1]
  const shieldBlocks = target.equipment.armor?.kind === 'shield' && slashCard && (slashCard.suit === 'spade' || slashCard.suit === 'club') && attacker.equipment.weapon?.kind !== 'qinggang'
  const dodge = !shieldBlocks ? target.hand.find(c => c.kind === 'dodge') : undefined
  const updatedAttacker = { ...attacker, attacksUsed: attacker.attacksUsed + 1, drunk: false, animation: 'attack' as const }
  if (shieldBlocks || dodge) {
    const updatedTarget = dodge ? { ...target, hand: target.hand.filter(c => c.id !== dodge.id) } : target
    const message = shieldBlocks ? `${target.name}的【仁王盾】挡住黑色【杀】` : `${target.name}打出【闪】`
    return { units: { ...state.units, [attackerId]: updatedAttacker, [targetId]: updatedTarget }, discard: dodge ? [...state.discard, dodge] : state.discard, message, history: log(state, message) }
  }
  const base = { ...state, units: { ...state.units, [attackerId]: updatedAttacker } }
  return damage(base, attackerId, targetId, attacker.drunk ? 2 : 1, `${target.name}受到${attacker.drunk ? ' 2 ' : ' 1 '}点伤害`)
}

function resolveDuel(state: GameState, initiator: Team, targetId: Team): Partial<GameState> {
  let units = { ...state.units }; let current = targetId; let other = initiator; const spent: Card[] = []
  for (let round = 0; round < 20; round++) {
    const slash = units[current].hand.find(c => c.kind === 'slash')
    if (!slash) {
      const base = { ...state, units, discard: [...state.discard, ...spent] }
      return damage(base, other, current, 1, `${units[current].name}在【决斗】中受到 1 点伤害`)
    }
    spent.push(slash); units = { ...units, [current]: { ...units[current], hand: units[current].hand.filter(c => c.id !== slash.id), animation: 'cast' } }
    ;[current, other] = [other, current]
  }
  return { units, discard: [...state.discard, ...spent] }
}

function resolveGroupTrick(state: GameState, actorId: Team, kind: 'arrows' | 'barbarians'): Partial<GameState> {
  let working = state
  const responseKind = kind === 'arrows' ? 'dodge' : 'slash'
  for (const targetId of working.turnOrder) {
    if (targetId === actorId || working.units[targetId].hp <= 0) continue
    const target = working.units[targetId]
    const nullify = target.hand.find(c => c.kind === 'nullify')
    if (nullify) {
      const message = `${target.name}以【无懈可击】抵消【${CARD_LABEL[kind]}】`
      working = { ...working, units: { ...working.units, [targetId]: { ...target, hand: target.hand.filter(c => c.id !== nullify.id), animation: 'cast' } }, discard: [...working.discard, nullify], message, history: log(working, message) }
      continue
    }
    const response = target.hand.find(c => c.kind === responseKind)
    if (response) {
      const message = `${target.name}打出【${CARD_LABEL[responseKind]}】响应【${CARD_LABEL[kind]}】`
      working = { ...working, units: { ...working.units, [targetId]: { ...target, hand: target.hand.filter(c => c.id !== response.id), animation: 'cast' } }, discard: [...working.discard, response], message, history: log(working, message) }
    } else working = { ...working, ...damage(working, actorId, targetId, 1, `${target.name}未能响应【${CARD_LABEL[kind]}】，受到 1 点伤害`) }
    if (working.winner) break
  }
  return working
}

function discardOverflow(state: GameState, team: Team): GameState {
  const unit = state.units[team], excess = Math.max(0, unit.hand.length - unit.hp)
  if (!excess) return state
  const removed = unit.hand.slice(-excess), kept = unit.hand.slice(0, -excess)
  return { ...state, units: { ...state.units, [team]: { ...unit, hand: kept } }, discard: [...state.discard, ...removed], message: `${unit.name}弃置 ${excess} 张手牌`, history: log(state, `${unit.name}弃牌至体力上限`) }
}

function beginTurn(state: GameState, team: Team): GameState {
  let working = state, unit = state.units[team], skipPlay = false
  for (const delayed of unit.judgement) {
    const judged = drawCards(working.deck, working.discard, 1)
    const judge = judged.drawn[0]; if (!judge) break
    working = { ...working, deck: judged.deck, discard: [...judged.discard, delayed, judge] }
    if (delayed.kind === 'indulgence' && judge.suit !== 'heart') skipPlay = true
    if (delayed.kind === 'lightning') {
      const hit = judge.suit === 'spade' && judge.rank >= 2 && judge.rank <= 9
      if (hit) working = { ...working, ...damage(working, primaryTarget(working, team), team, 3, `${unit.name}受到【闪电】3 点伤害`) }
      else {
        const opponent = nextSeat(working, team)
        working = { ...working, units: { ...working.units, [opponent]: { ...working.units[opponent], judgement: [...working.units[opponent].judgement, delayed] } }, discard: working.discard.filter(c => c.id !== delayed.id) }
      }
    }
  }
  unit = { ...working.units[team], judgement: [] }
  if (working.winner) return { ...working, units: { ...working.units, [team]: unit } }
  const draw = drawCards(working.deck, working.discard, 2)
  const refreshed: Unit = { ...unit, hand: [...unit.hand, ...draw.drawn], movement: 3, attacksUsed: 0, wineUsed: false, drunk: false, animation: 'idle' }
  const next: GameState = { ...working, units: { ...working.units, [team]: refreshed }, deck: draw.deck, discard: draw.discard, currentUnit: team, phase: team === 'player' ? 'player' : 'ai', turnStage: skipPlay ? 'finish' : 'play', selectedCardId: null, selectedAsSlash: false, pathPreview: [], reachable: [], message: skipPlay ? `${refreshed.name}的【乐不思蜀】判定失败，跳过出牌阶段` : `${team === 'player' ? '你的' : `${refreshed.name}的`}出牌阶段 · 摸两张牌`, history: log(working, skipPlay ? `${refreshed.name}跳过出牌阶段` : `${refreshed.name}摸两张牌`) }
  next.reachable = team === 'player' ? reachableCells(next, refreshed) : []
  return next
}

export const useGameStore = create<GameStore>((set, get) => ({
  ...createInitialState(),
  dispatch: action => {
    if (action.type === 'RESTART') { set({ ...createInitialState() }); return }
    const state = get(); if (state.phase === 'finished') return
    if (action.type === 'MOVE') {
      const unit = state.units[action.unit]
      if (state.currentUnit !== action.unit || state.turnStage !== 'play') return
      const path = findPath(state, unit.position, action.to, unit.id), cost = pathCost(state, path)
      if (!path.length || cost > unit.movement) return
      const updated = { ...unit, position: action.to, movement: unit.movement - cost, animation: 'move' as const }
      const units = { ...state.units, [action.unit]: updated }, message = `${unit.name}移动 ${cost} 点（${path.length} 格）`
      set({ units, reachable: action.unit === 'player' ? reachableCells({ ...state, units }, updated) : [], pathPreview: [], message, history: log(state, message) }); return
    }
    if (action.type === 'PLAY_CARD') {
      const unit = state.units[action.unit]
      if (state.currentUnit !== action.unit || state.turnStage !== 'play') return
      const removed = takeCard(unit.hand, action.cardId); if (!removed.card) return
      const card = removed.card, kind = action.asSlash && unit.skill === 'wusheng' && (card.suit === 'heart' || card.suit === 'diamond') ? 'slash' : card.kind
      const targetId = action.target ?? primaryTarget(state, action.unit), target = state.units[targetId]
      let base: GameState = { ...state, units: { ...state.units, [action.unit]: { ...unit, hand: removed.hand, animation: 'cast' } }, discard: [...state.discard, card], selectedCardId: null, selectedAsSlash: false }
      const nullifiable = ['duel', 'dismantle', 'snatch', 'indulgence'].includes(kind)
      const nullify = nullifiable ? target.hand.find(c => c.kind === 'nullify') : undefined
      if (nullify) {
        const message = `${target.name}打出【无懈可击】，抵消【${card.kind === 'duel' ? '决斗' : card.kind === 'arrows' ? '万箭齐发' : card.kind === 'barbarians' ? '南蛮入侵' : card.kind === 'indulgence' ? '乐不思蜀' : card.kind === 'snatch' ? '顺手牵羊' : '过河拆桥'}】`
        set({ units: { ...base.units, [targetId]: { ...target, hand: target.hand.filter(c => c.id !== nullify.id), animation: 'cast' } }, discard: [...base.discard, nullify], message, history: log(state, message) }); return
      }
      if (kind === 'peach') {
        if (!canPeach(unit)) return
        const healed = { ...unit, hand: removed.hand, hp: unit.hp + 1, animation: 'heal' as const }; const message = `${unit.name}使用【桃】，回复 1 点体力`
        set({ units: { ...state.units, [action.unit]: healed }, discard: base.discard, selectedCardId: null, message, history: log(state, message) }); return
      }
      if (kind === 'wine') {
        if (unit.wineUsed) return
        const message = `${unit.name}饮【酒】，下一张【杀】伤害 +1`
        set({ units: { ...state.units, [action.unit]: { ...unit, hand: removed.hand, wineUsed: true, drunk: true, animation: 'heal' } }, discard: base.discard, selectedCardId: null, message, history: log(state, message) }); return
      }
      if (kind === 'drawTwo') {
        const draw = drawCards(base.deck, base.discard, 2), actor = base.units[action.unit], message = `${unit.name}使用【无中生有】，摸两张牌`
        set({ units: { ...base.units, [action.unit]: { ...actor, hand: [...actor.hand, ...draw.drawn] } }, deck: draw.deck, discard: draw.discard, message, history: log(state, message) }); return
      }
      if (isEquipment(kind)) {
        const slot = card.kind === 'shield' ? 'armor' : 'weapon', old = unit.equipment[slot]
        const equipped = { ...unit, hand: removed.hand, equipment: { ...unit.equipment, [slot]: card }, animation: 'cast' as const }, message = `${unit.name}装备【${card.kind === 'shield' ? '仁王盾' : card.kind === 'crossbow' ? '诸葛连弩' : '青釭剑'}】`
        set({ units: { ...state.units, [action.unit]: equipped }, discard: old ? [...state.discard, old] : state.discard, selectedCardId: null, message, history: log(state, message) }); return
      }
      if (kind === 'slash') {
        if (!canSlash(state, unit, target)) return
        set(resolveSlash(base, action.unit, targetId)); return
      }
      if (kind === 'duel') { set(resolveDuel(base, action.unit, targetId)); return }
      if (kind === 'arrows' || kind === 'barbarians') {
        set(resolveGroupTrick(base, action.unit, kind)); return
      }
      if (kind === 'indulgence') {
        const message = `${unit.name}将【乐不思蜀】置入${target.name}的判定区`
        set({ units: { ...base.units, [targetId]: { ...target, judgement: [...target.judgement, card], animation: 'cast' } }, discard: state.discard, message, history: log(state, message) }); return
      }
      if (kind === 'lightning') {
        const actor = base.units[action.unit], message = `${unit.name}将【闪电】置入判定区`
        set({ units: { ...base.units, [action.unit]: { ...actor, judgement: [...actor.judgement, card] } }, discard: state.discard, message, history: log(state, message) }); return
      }
      if (kind === 'dismantle' || kind === 'snatch') {
        if (kind === 'snatch' && pathDistance(state, unit.position, target.position, unit.id) > 1) return
        const stolen = target.hand[0] ?? target.equipment.weapon ?? target.equipment.armor
        if (!stolen) return
        const targetHand = target.hand.filter(c => c.id !== stolen.id)
        const targetEquipment = { weapon: target.equipment.weapon?.id === stolen.id ? undefined : target.equipment.weapon, armor: target.equipment.armor?.id === stolen.id ? undefined : target.equipment.armor }
        const actor = base.units[action.unit], gain = kind === 'snatch', message = `${unit.name}使用【${gain ? '顺手牵羊' : '过河拆桥'}】${gain ? '获得' : '弃置'}一张牌`
        set({ units: { ...base.units, [targetId]: { ...target, hand: targetHand, equipment: targetEquipment, animation: 'hit' }, [action.unit]: { ...actor, hand: gain ? [...actor.hand, stolen] : actor.hand } }, discard: gain ? base.discard : [...base.discard, stolen], message, history: log(state, message) }); return
      }
      return
    }
    if (action.type === 'END_TURN' && state.phase === 'player') {
      let next = discardOverflow({ ...state, turnStage: 'discard' }, 'player'); next = scoreControlPoint(next, 'player')
      if (next.winner) { set(next); return }
      const nextUnit = nextSeat(next, 'player'); next = beginTurn({ ...next, turnStage: 'finish' }, nextUnit); set(next); void get().runAI()
    }
  },
  selectCard: id => {
    const state = get(); if (state.phase !== 'player') return
    if (!id) { set({ selectedCardId: null, selectedAsSlash: false, message: '已取消选牌' }); return }
    const card = state.units.player.hand.find(c => c.id === id); if (!card) return
    if (card.kind === 'dodge') { set({ message: '【闪】会在受到【杀】时自动打出' }); return }
    const needsTarget = ['slash', 'duel', 'dismantle', 'snatch', 'indulgence'].includes(card.kind)
    if (!needsTarget && state.selectedCardId === id) { get().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: id }); return }
    set({ selectedCardId: state.selectedCardId === id ? null : id, selectedAsSlash: false, message: needsTarget ? `选择敌将使用【${CARD_LABEL[card.kind]}】` : '再次点击确认使用' })
  },
  activateWusheng: () => {
    const state = get(), card = state.units.player.hand.find(c => c.id === state.selectedCardId)
    if (!card || card.kind === 'slash' || (card.suit !== 'heart' && card.suit !== 'diamond')) return
    set({ selectedAsSlash: true, message: `【武圣】将${CARD_LABEL[card.kind]}当【杀】使用，请选择敌将` })
  },
  hoverCell: position => {
    const state = get(); if (!position || state.phase !== 'player') { set({ pathPreview: [] }); return }
    const path = findPath(state, state.units.player.position, position, 'player')
    set({ pathPreview: pathCost(state, path) <= state.units.player.movement ? path : [] })
  },
  resetAnimation: team => set(state => ({ units: { ...state.units, [team]: { ...state.units[team], animation: 'idle' } } })),
  runAI: async () => {
    await wait(450); let state = get(); if (state.phase !== 'ai') return
    const aiId = state.currentUnit, aiUnit = state.units[aiId]
    if (!aiUnit || aiUnit.hp <= 0) {
      const next = nextSeat(state, aiId); set(beginTurn(state, next)); if (next !== 'player') void get().runAI(); return
    }
    if (state.turnStage === 'finish') {
      let skipped = scoreControlPoint(state, aiId); if (skipped.winner) { set(skipped); return }
      const next = nextSeat(skipped, aiId), nextState = beginTurn({ ...skipped, turn: next === 'player' ? skipped.turn + 1 : skipped.turn }, next)
      set(nextState); if (next !== 'player') void get().runAI(); return
    }
    let ai = state.units[aiId]
    for (const kind of ['peach', 'drawTwo', 'shield', 'qinggang', 'crossbow', 'lightning', 'wine'] as const) {
      state = get(); ai = state.units[aiId]
      const card = ai.hand.find(c => c.kind === kind)
      if (!card || (kind === 'peach' && ai.hp === ai.maxHp) || (kind === 'wine' && !ai.hand.some(c => c.kind === 'slash'))) continue
      get().dispatch({ type: 'PLAY_CARD', unit: aiId, cardId: card.id }); await wait(280)
    }
    state = get(); ai = state.units[aiId]
    let target = targetsFor(state, aiId)[0]
    if (!target) return
    const aggressive = ai.hand.find(c => c.kind === 'slash')
    if (!aggressive || !canSlash(state, ai, target)) {
      const destinations = aggressive ? [{ x: target.position.x + 1, y: target.position.y }, { x: target.position.x - 1, y: target.position.y }, { x: target.position.x, y: target.position.y + 1 }, { x: target.position.x, y: target.position.y - 1 }] : [state.controlPoint]
      let best: Position[] = []
      for (const destination of destinations) { const path = findPath(state, ai.position, destination, aiId); if (path.length && (!best.length || pathCost(state, path) < pathCost(state, best))) best = path }
      if (best.length) { let cost = 0, destination = ai.position; for (const p of best) { const step = pathCost(state, [p]); if (cost + step > ai.movement) break; cost += step; destination = p } get().dispatch({ type: 'MOVE', unit: aiId, to: destination }); await wait(500) }
    }
    state = get(); ai = state.units[aiId]; target = targetsFor(state, aiId)[0]
    if (!target) return
    for (const kind of ['indulgence', 'dismantle', 'snatch', 'arrows', 'barbarians', 'duel', 'slash'] as const) {
      const card = ai.hand.find(c => c.kind === kind); if (!card) continue
      if (kind === 'slash' && !canSlash(state, ai, target)) continue
      if (kind === 'snatch' && pathDistance(state, ai.position, target.position, aiId) > 1) continue
      get().dispatch({ type: 'PLAY_CARD', unit: aiId, cardId: card.id, target: target.id }); await wait(420); state = get(); ai = state.units[aiId]
      if (state.phase === 'finished') return
    }
    state = get(); let next = discardOverflow({ ...state, turnStage: 'discard' }, aiId); next = scoreControlPoint(next, aiId)
    if (next.winner) { set(next); return }
    const nextId = nextSeat(next, aiId), nextState = beginTurn({ ...next, turn: nextId === 'player' ? next.turn + 1 : next.turn, turnStage: 'finish' }, nextId)
    set(nextState); if (nextId !== 'player') void get().runAI()
  },
}))

export const isCellReachable = (cells: Position[], position: Position) => cells.some(cell => samePosition(cell, position))
export const attackDistance = (state: GameState, target: Team = 'east') => pathDistance(state, state.units.player.position, state.units[target].position, 'player')
export const rangeLabel = (unit: Unit) => `攻击范围 ${attackRange(unit)}`

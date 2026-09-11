import { create } from 'zustand'
import { CARD_LABEL, type Card, type GameAction, type GameState, type GeneralSkill, type Position, type Team, type Unit } from '../types'
import { attackRange, canPeach, canSlash, combatDistance, createInitialState, determineWinner, drawCards, effectiveAttackRange, findPath, isEquipment, pathCost, pathDistance, reachableCells, resolveEndTurnTerrain, samePosition, scoreControlPoint, slashLimit } from './rules'

interface GameStore extends GameState {
  dispatch: (action: GameAction) => void
  selectGeneral: (skill: GeneralSkill) => void
  respond: (cardId: string | null) => void
  selectCard: (id: string | null) => void
  toggleDiscard: (id: string) => void
  activateWusheng: () => void
  activateSpear: () => void
  activateJijiang: () => void
  activateQixi: () => void
  activateZhiheng: () => void
  hoverCell: (position: Position | null) => void
  runAI: () => Promise<void>
  resetAnimation: (team: Team) => void
}
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const GENERAL_PROFILE: Partial<Record<GeneralSkill, Pick<Unit, 'name' | 'title' | 'skill' | 'skills' | 'faction'>>> = {
  wusheng: { name: '关羽', title: '美髯公', skill: 'wusheng', skills: ['wusheng'], faction: 'shu' },
  longdan: { name: '赵云', title: '少年将军', skill: 'longdan', skills: ['longdan'], faction: 'shu' },
  ganglie: { name: '夏侯惇', title: '独眼的罗刹', skill: 'ganglie', skills: ['ganglie'], faction: 'wei' },
  feedback: { name: '司马懿', title: '狼顾之鬼', skill: 'feedback', skills: ['feedback', 'guicai'], faction: 'wei' },
  paoxiao: { name: '张飞', title: '万夫不当', skill: 'paoxiao', skills: ['paoxiao'], faction: 'shu' },
  jizhi: { name: '黄月英', title: '归隐的杰女', skill: 'jizhi', skills: ['jizhi', 'qicai'], faction: 'shu' },
  qixi: { name: '甘宁', title: '锦帆游侠', skill: 'qixi', skills: ['qixi'], faction: 'wu' },
  biyue: { name: '貂蝉', title: '绝世的舞姬', skill: 'biyue', skills: ['biyue'], faction: 'qun' },
  zhiheng: { name: '孙权', title: '年轻的贤君', skill: 'zhiheng', skills: ['zhiheng'], faction: 'wu' },
  wushuang: { name: '吕布', title: '武的化身', skill: 'wushuang', skills: ['wushuang'], faction: 'qun' },
}
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
const responseCard = (unit: Unit, required: 'slash' | 'dodge') => unit.hand.find(card => card.kind === required) ?? (unit.skill === 'longdan' ? unit.hand.find(card => card.kind === (required === 'slash' ? 'dodge' : 'slash')) : undefined)
const responseText = (unit: Unit, card: Card, required: 'slash' | 'dodge') => card.kind === required ? `打出【${CARD_LABEL[required]}】` : `发动【龙胆】，将【${CARD_LABEL[card.kind]}】当【${CARD_LABEL[required]}】`
const loyalGuard = (state: GameState, targetId: Team) => {
  if (state.units[targetId].identity !== 'lord' || state.units[targetId].faction !== 'wei') return null
  for (const unit of Object.values(state.units)) {
    const dodge = unit.identity === 'loyalist' && unit.faction === 'wei' && unit.hp > 0 ? responseCard(unit, 'dodge') : undefined
    if (dodge) return { unit, dodge }
  }
  return null
}

function damage(state: GameState, attackerId: Team, targetId: Team, amount: number, message: string, skipRescue = false): Partial<GameState> {
  const target = state.units[targetId]
  let hp = target.hp - amount, hand = target.hand, discard = state.discard
  const playerPeach = !skipRescue && targetId === 'player' && hp <= 0 ? hand.find(c => c.kind === 'peach') : undefined
  if (playerPeach) {
    const prompt = `${target.name}进入濒死状态，是否使用【桃】自救？`
    return {
      units: { ...state.units, [targetId]: { ...target, hp: 0, animation: 'hit' } },
      pendingResponse: { effect: 'dying', source: attackerId, target: targetId, required: 'peach', prompt },
      message: prompt,
      history: log(state, `${target.name}进入濒死状态`),
    }
  }
  const rescue = !skipRescue && targetId !== 'player' && hp <= 0 ? hand.find(c => c.kind === 'peach') : undefined
  if (rescue) { hand = hand.filter(c => c.id !== rescue.id); discard = [...discard, rescue]; hp = 1 }
  let units = { ...state.units, [targetId]: { ...target, hand, hp: Math.max(0, hp), revealed: hp <= 0 ? true : target.revealed, animation: 'hit' as const } }
  const aidPeach = !skipRescue && hp <= 0 && targetId !== 'player' && state.units.player.hp > 0 ? state.units.player.hand.find(card => card.kind === 'peach') : undefined
  if (aidPeach) {
    const prompt = `${target.name}进入濒死状态，是否使用【桃】援救？`
    units = { ...units, [targetId]: { ...units[targetId], revealed: target.revealed } }
    return { units, pendingResponse: { effect: 'dying', source: attackerId, target: targetId, required: 'peach', prompt }, message: prompt, history: log(state, `${target.name}进入濒死状态`) }
  }
  let deck = state.deck
  if (hp <= 0 && target.identity === 'rebel') {
    const reward = drawCards(deck, discard, 3); deck = reward.deck; discard = reward.discard
    units = { ...units, [attackerId]: { ...units[attackerId], hand: [...units[attackerId].hand, ...reward.drawn] } }
  }
  if (hp <= 0 && units[attackerId].identity === 'lord' && target.identity === 'loyalist') {
    const killer = units[attackerId]
    discard = [...discard, ...killer.hand, ...Object.values(killer.equipment).filter((card): card is Card => !!card)]
    units = { ...units, [attackerId]: { ...killer, hand: [], equipment: {} } }
  }
  let winner = determineWinner(units)
  const finalMessage = hp <= 0 ? `${state.units[attackerId].name}击败了${target.name}，其身份是${target.identity === 'loyalist' ? '忠臣' : target.identity === 'rebel' ? '反贼' : target.identity === 'renegade' ? '内奸' : '主公'}！` : rescue ? `${target.name}进入濒死并使用【桃】自救` : message
  let skillText = ''
  if (hp > 0 && target.skill === 'feedback') {
    const attacker = units[attackerId]
    const gained = attacker.hand[0] ?? attacker.equipment.weapon ?? attacker.equipment.armor ?? attacker.equipment.offensiveMount ?? attacker.equipment.defensiveMount
    if (gained) {
      const equipment = { ...attacker.equipment }
      for (const slot of Object.keys(equipment) as (keyof typeof equipment)[]) if (equipment[slot]?.id === gained.id) delete equipment[slot]
      units = { ...units, [attackerId]: { ...attacker, hand: attacker.hand.filter(card => card.id !== gained.id), equipment }, [targetId]: { ...units[targetId], hand: [...units[targetId].hand, gained], animation: 'cast' } }
      skillText = `；${target.name}发动【反馈】获得一张牌`
    }
  }
  if (hp > 0 && target.skill === 'ganglie') {
    const judged = drawCards(deck, discard, 1), judge = judged.drawn[0]
    deck = judged.deck; discard = judge ? [...judged.discard, judge] : judged.discard
    if (judge && judge.suit !== 'heart') {
      const attacker = units[attackerId]
      if (attacker.hand.length >= 2) {
        const paid = attacker.hand.slice(0, 2)
        units = { ...units, [attackerId]: { ...attacker, hand: attacker.hand.slice(2), animation: 'hit' } }
        discard = [...discard, ...paid]
        skillText = `；${target.name}发动【刚烈】，${attacker.name}弃置两张牌`
      } else {
        units = { ...units, [attackerId]: { ...attacker, hp: Math.max(0, attacker.hp - 1), revealed: attacker.hp <= 1 ? true : attacker.revealed, animation: 'hit' } }
        skillText = `；${target.name}发动【刚烈】，${attacker.name}受到 1 点伤害`
      }
    } else if (judge) skillText = `；【刚烈】判定为红桃，未生效`
  }
  const skillWinner = determineWinner(units)
  if (skillWinner) { winner = skillWinner }
  const rewardText = hp <= 0 && target.identity === 'rebel' ? '；击杀反贼摸三张牌' : hp <= 0 && units[attackerId].identity === 'lord' && target.identity === 'loyalist' ? '；主公误杀忠臣，弃置所有牌' : ''
  return { units, deck, discard, winner, phase: winner ? 'finished' : state.phase, message: `${finalMessage}${skillText}`, history: log(state, `${finalMessage}${skillText}${rewardText}`) }
}

function elementalDamage(state: GameState, attackerId: Team, targetId: Team, amount: number, nature: 'fire' | 'thunder'): Partial<GameState> {
  const target = state.units[targetId]
  const linked = target.chained ? [targetId, ...state.turnOrder.filter(id => id !== targetId && state.units[id].hp > 0 && state.units[id].chained)] : [targetId]
  let working: GameState = {
    ...state,
    units: Object.fromEntries(Object.entries(state.units).map(([id, unit]) => [id, linked.includes(id as Team) ? { ...unit, chained: false } : unit])) as GameState['units'],
  }
  const label = nature === 'fire' ? '火焰' : '雷电'
  for (const id of linked) {
    const transmitted = id === targetId ? '' : '（铁索传导）'
    working = { ...working, ...damage(working, attackerId, id, amount, `${working.units[id].name}受到 ${amount} 点${label}伤害${transmitted}`) }
    if (working.pendingResponse || working.winner) break
  }
  return working
}

function resolveFireAttack(state: GameState, actorId: Team, targetId: Team): Partial<GameState> {
  const actor = state.units[actorId], target = state.units[targetId]
  const revealed = target.hand[0]
  if (!revealed) {
    const message = `${target.name}没有手牌，【火攻】未生效`
    return { message, history: log(state, message) }
  }
  const paid = actor.hand.find(card => card.suit === revealed.suit)
  if (!paid) {
    const message = `${target.name}展示${revealed.suit}牌，${actor.name}没有同花色牌可弃置`
    return { message, history: log(state, message) }
  }
  const paidState: GameState = { ...state, units: { ...state.units, [actorId]: { ...actor, hand: actor.hand.filter(card => card.id !== paid.id), animation: 'cast' } }, discard: [...state.discard, paid] }
  return elementalDamage(paidState, actorId, targetId, 1, 'fire')
}

function resolveIronChain(state: GameState, actorId: Team, targetId: Team): Partial<GameState> {
  const target = state.units[targetId], chained = !target.chained
  const message = `${state.units[actorId].name}使用【铁索连环】，${target.name}${chained ? '进入' : '解除'}连环状态`
  return { units: { ...state.units, [targetId]: { ...target, chained, animation: 'cast' } }, message, history: log(state, message) }
}

function resolveBorrowedSword(state: GameState, actorId: Team, wielderId: Team): Partial<GameState> {
  const wielder = state.units[wielderId], actor = state.units[actorId], weapon = wielder.equipment.weapon
  if (!weapon) return state
  const slash = responseCard(wielder, 'slash')
  const victim = targetsFor(state, wielderId)
    .filter(unit => unit.id !== actorId && canSlash(state, wielder, unit))
    .sort((a, b) => combatDistance(state, wielder, a) - combatDistance(state, wielder, b))[0]
  if (slash && victim) {
    const message = `${actor.name}借刀，令${wielder.name}对${victim.name}使用【杀】`
    const forced: GameState = {
      ...state,
      units: { ...state.units, [wielderId]: { ...wielder, hand: wielder.hand.filter(card => card.id !== slash.id), animation: 'attack' } },
      discard: [...state.discard, slash], message, history: log(state, message),
    }
    return { ...forced, ...resolveSlash(forced, wielderId, victim.id) }
  }
  const message = `${wielder.name}未能出【杀】，${actor.name}获得其【${CARD_LABEL[weapon.kind]}】`
  return {
    units: { ...state.units, [wielderId]: { ...wielder, equipment: { ...wielder.equipment, weapon: undefined }, animation: 'hit' }, [actorId]: { ...actor, hand: [...actor.hand, weapon], animation: 'cast' } },
    message, history: log(state, message),
  }
}

function judgeBagua(state: GameState, targetId: Team) {
  const draw = drawCards(state.deck, state.discard, 1), judge = draw.drawn[0]
  if (!judge) return { state, success: false }
  const success = judge.suit === 'heart' || judge.suit === 'diamond'
  const message = `${state.units[targetId].name}发动【八卦阵】，判定${success ? '为红色，视为打出【闪】' : '为黑色，判定失败'}`
  return { state: { ...state, deck: draw.deck, discard: [...draw.discard, judge], message, history: log(state, message) }, success }
}

function greenDragonChase(state: GameState, attackerId: Team, targetId: Team): Partial<GameState> | null {
  const attacker = state.units[attackerId]
  if (attacker.equipment.weapon?.kind !== 'greenDragon') return null
  const nextSlash = responseCard(attacker, 'slash')
  if (!nextSlash) return null
  const message = `${attacker.name}发动【青龙偃月刀】，继续对${state.units[targetId].name}使用【杀】`
  const chaseState: GameState = {
    ...state,
    units: { ...state.units, [attackerId]: { ...attacker, hand: attacker.hand.filter(card => card.id !== nextSlash.id), animation: 'attack' } },
    discard: [...state.discard, nextSlash], message, history: log(state, message),
  }
  return resolveSlash(chaseState, attackerId, targetId)
}

function resolveSlash(state: GameState, attackerId: Team, targetId: Team, manualResponse?: Card | null, armorChecked = false): Partial<GameState> {
  let attacker = state.units[attackerId], target = state.units[targetId]
  if (!armorChecked && target.equipment.armor?.kind === 'bagua' && attacker.equipment.weapon?.kind !== 'qinggang') {
    const judged = judgeBagua(state, targetId)
    state = judged.state; attacker = state.units[attackerId]; target = state.units[targetId]
    if (judged.success) {
      const updatedAttacker = { ...attacker, attacksUsed: attacker.attacksUsed + 1, drunk: false, animation: 'attack' as const }
      if (attacker.equipment.weapon?.kind === 'axe' && attacker.hand.length >= 2) {
        const paid = attacker.hand.slice(0, 2)
        const forcedState: GameState = { ...state, units: { ...state.units, [attackerId]: { ...updatedAttacker, hand: attacker.hand.slice(2) } }, discard: [...state.discard, ...paid] }
        return damage(forcedState, attackerId, targetId, attacker.drunk ? 2 : 1, `${attacker.name}发动【贯石斧】弃置两张牌，强制命中${target.name}`)
      }
      const defendedState: GameState = { ...state, units: { ...state.units, [attackerId]: updatedAttacker } }
      return greenDragonChase(defendedState, attackerId, targetId) ?? defendedState
    }
  }
  const slashCard = state.discard[state.discard.length - 1]
  const shieldBlocks = target.equipment.armor?.kind === 'shield' && slashCard && (slashCard.suit === 'spade' || slashCard.suit === 'club') && attacker.equipment.weapon?.kind !== 'qinggang'
  const availableDodges = target.hand.filter(card => card.kind === 'dodge' || (target.skill === 'longdan' && card.kind === 'slash'))
  const requiredDodges = attacker.skill === 'wushuang' && manualResponse === undefined ? 2 : 1
  const dodgeCards = shieldBlocks ? [] : manualResponse === undefined ? (availableDodges.length >= requiredDodges ? availableDodges.slice(0, requiredDodges) : []) : manualResponse ? [manualResponse] : []
  const dodge = dodgeCards[0]
  const guard = !shieldBlocks && !dodge && attacker.skill !== 'wushuang' ? loyalGuard(state, targetId) : null
  const updatedAttacker = { ...attacker, attacksUsed: attacker.attacksUsed + 1, drunk: false, animation: 'attack' as const }
  if (shieldBlocks || dodge || guard) {
    const dodgeIds = new Set(dodgeCards.map(card => card.id))
    const updatedTarget = dodge ? { ...target, hand: target.hand.filter(c => !dodgeIds.has(c.id)) } : target
    const guardedUnits = guard ? { ...state.units, [guard.unit.id]: { ...guard.unit, hand: guard.unit.hand.filter(c => c.id !== guard.dodge.id), animation: 'cast' as const } } : state.units
    const responseDiscard = dodge ? [...state.discard, ...dodgeCards] : guard ? [...state.discard, guard.dodge] : state.discard
    if (!shieldBlocks && attacker.equipment.weapon?.kind === 'axe' && attacker.hand.length >= 2) {
      const paid = attacker.hand.slice(0, 2)
      const forcedState: GameState = { ...state, units: { ...guardedUnits, [attackerId]: { ...updatedAttacker, hand: attacker.hand.slice(2) }, [targetId]: updatedTarget }, discard: [...responseDiscard, ...paid] }
      return damage(forcedState, attackerId, targetId, attacker.drunk ? 2 : 1, `${attacker.name}发动【贯石斧】弃置两张牌，强制命中${target.name}`)
    }
    const message = shieldBlocks ? `${target.name}的【仁王盾】挡住黑色【杀】` : guard ? `${guard.unit.name}响应主公技【护驾】，${responseText(guard.unit, guard.dodge, 'dodge')}` : `${target.name}${dodgeCards.length > 1 ? '连续打出两张【闪】响应【无双】' : responseText(target, dodge!, 'dodge')}`
    const defendedState: GameState = { ...state, units: { ...guardedUnits, [attackerId]: updatedAttacker, [targetId]: updatedTarget }, discard: responseDiscard, message, history: log(state, message) }
    return shieldBlocks ? defendedState : greenDragonChase(defendedState, attackerId, targetId) ?? defendedState
  }
  let units = { ...state.units, [attackerId]: updatedAttacker }, discard = state.discard
  let weaponText = ''
  if (attacker.equipment.weapon?.kind === 'qilinBow') {
    const slot = target.equipment.defensiveMount ? 'defensiveMount' : target.equipment.offensiveMount ? 'offensiveMount' : null
    if (slot) {
      const mount = target.equipment[slot]!
      const equipment = { ...target.equipment }; delete equipment[slot]
      units = { ...units, [targetId]: { ...target, equipment } }
      discard = [...discard, mount]
      weaponText = `；【麒麟弓】弃置${target.name}的【${CARD_LABEL[mount.kind]}】`
    }
  }
  const base: GameState = { ...state, units, discard }
  const emptyHandBonus = attacker.equipment.weapon?.kind === 'gudingBlade' && target.hand.length === 0 ? 1 : 0
  const amount = (attacker.drunk ? 2 : 1) + emptyHandBonus
  const nature = attacker.equipment.weapon?.kind === 'vermilionFan' ? 'fire' : null
  const effectText = `${target.name}受到 ${amount} 点${nature === 'fire' ? '火焰' : ''}伤害${emptyHandBonus ? '；【古锭刀】伤害 +1' : ''}${weaponText}`
  return nature === 'fire' ? elementalDamage(base, attackerId, targetId, amount, 'fire') : damage(base, attackerId, targetId, amount, effectText)
}

function continueDuel(state: GameState, currentId: Team, otherId: Team): Partial<GameState> {
  let working = state, current = currentId, other = otherId
  for (let round = 0; round < 20; round++) {
    const requiredCount = working.units[other].skill === 'wushuang' ? 2 : 1
    if (current === 'player') {
      const prompt = `${working.units[other].name}在【决斗】中出杀，请${requiredCount === 2 ? '连续' : ''}打出${requiredCount}张【杀】响应`
      return { ...working, pendingResponse: { effect: 'duel', source: other, target: 'player', required: 'slash', requiredCount, prompt }, message: prompt, history: log(working, prompt) }
    }
    const responder = working.units[current]
    const slashes = responder.hand.filter(card => card.kind === 'slash' || (responder.skill === 'longdan' && card.kind === 'dodge')).slice(0, requiredCount)
    if (slashes.length < requiredCount) {
      return damage(working, other, current, 1, `${working.units[current].name}未能在【决斗】中出杀，受到 1 点伤害`)
    }
    const slashIds = new Set(slashes.map(card => card.id))
    const message = `${responder.name}${slashes.length > 1 ? '连续打出两张【杀】响应【无双决斗】' : responseText(responder, slashes[0], 'slash') + '响应【决斗】'}`
    working = { ...working, units: { ...working.units, [current]: { ...responder, hand: responder.hand.filter(c => !slashIds.has(c.id)), animation: 'cast' } }, discard: [...working.discard, ...slashes], message, history: log(working, message) }
    ;[current, other] = [other, current]
  }
  return working
}

function takeTargetCard(state: GameState, actorId: Team, targetId: Team, gain: boolean): Partial<GameState> {
  const actor = state.units[actorId], target = state.units[targetId]
  const chosen = target.hand[0] ?? target.equipment.weapon ?? target.equipment.armor ?? target.equipment.offensiveMount ?? target.equipment.defensiveMount
  if (!chosen) {
    const message = `${target.name}没有可被${gain ? '获得' : '弃置'}的牌`
    return { message, history: log(state, message) }
  }
  const equipment = { ...target.equipment }
  for (const slot of Object.keys(equipment) as (keyof typeof equipment)[]) if (equipment[slot]?.id === chosen.id) delete equipment[slot]
  const message = `${actor.name}使用【${gain ? '顺手牵羊' : '过河拆桥'}】${gain ? '获得' : '弃置'}${target.name}的一张牌`
  return {
    units: { ...state.units, [targetId]: { ...target, hand: target.hand.filter(card => card.id !== chosen.id), equipment, animation: 'hit' }, [actorId]: { ...actor, hand: gain ? [...actor.hand, chosen] : actor.hand } },
    discard: gain ? state.discard : [...state.discard, chosen], message, history: log(state, message),
  }
}

function resolveGroupTrick(state: GameState, actorId: Team, kind: 'arrows' | 'barbarians'): Partial<GameState> {
  let working = state
  const responseKind = kind === 'arrows' ? 'dodge' : 'slash'
  const orderedTargets = [...working.turnOrder.filter(id => id !== 'player'), 'player' as Team]
  for (const targetId of orderedTargets) {
    if (targetId === actorId || working.units[targetId].hp <= 0) continue
    const target = working.units[targetId]
    if (targetId === 'player' && actorId !== 'player') {
      const prompt = `${working.units[actorId].name}使用【${CARD_LABEL[kind]}】，是否打出【无懈可击】？`
      return { ...working, pendingResponse: { effect: 'nullify', source: actorId, target: targetId, required: 'nullify', trick: kind, prompt }, message: prompt, history: log(working, prompt) }
    }
    const nullify = target.hand.find(c => c.kind === 'nullify')
    if (nullify) {
      const message = `${target.name}以【无懈可击】抵消【${CARD_LABEL[kind]}】`
      working = { ...working, units: { ...working.units, [targetId]: { ...target, hand: target.hand.filter(c => c.id !== nullify.id), animation: 'cast' } }, discard: [...working.discard, nullify], message, history: log(working, message) }
      continue
    }
    const response = responseCard(target, responseKind)
    const guard = responseKind === 'dodge' && !response ? loyalGuard(working, targetId) : null
    if (response || guard) {
      const message = guard ? `${guard.unit.name}发动【护驾】保护主公` : `${target.name}${responseText(target, response!, responseKind)}响应【${CARD_LABEL[kind]}】`
      working = guard
        ? { ...working, units: { ...working.units, [guard.unit.id]: { ...guard.unit, hand: guard.unit.hand.filter(c => c.id !== guard.dodge.id), animation: 'cast' } }, discard: [...working.discard, guard.dodge], message, history: log(working, message) }
        : { ...working, units: { ...working.units, [targetId]: { ...target, hand: target.hand.filter(c => c.id !== response!.id), animation: 'cast' } }, discard: [...working.discard, response!], message, history: log(working, message) }
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

function resolveEndSkill(state: GameState, team: Team): GameState {
  const unit = state.units[team]
  if (unit.hp <= 0 || unit.skill !== 'biyue') return state
  const draw = drawCards(state.deck, state.discard, 1)
  if (!draw.drawn.length) return state
  const message = `${unit.name}发动【闭月】，摸一张牌`
  return { ...state, units: { ...state.units, [team]: { ...unit, hand: [...unit.hand, ...draw.drawn], animation: 'cast' } }, deck: draw.deck, discard: draw.discard, message, history: log(state, message) }
}

export function beginTurn(state: GameState, team: Team): GameState {
  let working = state, unit = state.units[team], skipPlay = false
  for (const delayed of unit.judgement) {
    const judged = drawCards(working.deck, working.discard, 1)
    const originalJudge = judged.drawn[0]; if (!originalJudge) break
    let judge = originalJudge, judgementDiscard = [originalJudge]
    const owner = working.units[team]
    const unfavorable = delayed.kind === 'indulgence' ? originalJudge.suit !== 'heart' : delayed.kind === 'lightning' ? originalJudge.suit === 'spade' && originalJudge.rank >= 2 && originalJudge.rank <= 9 : false
    if (unfavorable && owner.skills.includes('guicai')) {
      const replacement = owner.hand.find(card => delayed.kind === 'indulgence' ? card.suit === 'heart' : !(card.suit === 'spade' && card.rank >= 2 && card.rank <= 9))
      if (replacement) {
        judge = replacement; judgementDiscard = [originalJudge, replacement]
        const message = `${owner.name}发动【鬼才】，以${replacement.suit}${replacement.rank}改判`
        working = { ...working, units: { ...working.units, [team]: { ...owner, hand: owner.hand.filter(card => card.id !== replacement.id), animation: 'cast' } }, message, history: log(working, message) }
      }
    }
    working = { ...working, deck: judged.deck, discard: [...judged.discard, delayed, ...judgementDiscard] }
    if (delayed.kind === 'indulgence' && judge.suit !== 'heart') skipPlay = true
    if (delayed.kind === 'lightning') {
      const hit = judge.suit === 'spade' && judge.rank >= 2 && judge.rank <= 9
      if (hit) working = { ...working, ...elementalDamage(working, primaryTarget(working, team), team, 3, 'thunder') }
      else {
        const opponent = nextSeat(working, team)
        working = { ...working, units: { ...working.units, [opponent]: { ...working.units[opponent], judgement: [...working.units[opponent].judgement, delayed] } }, discard: working.discard.filter(c => c.id !== delayed.id) }
      }
    }
  }
  unit = { ...working.units[team], judgement: [] }
  if (working.winner) return { ...working, units: { ...working.units, [team]: unit } }
  const draw = drawCards(working.deck, working.discard, 2)
  const refreshed: Unit = { ...unit, hand: [...unit.hand, ...draw.drawn], movement: 3, attacksUsed: 0, wineUsed: false, drunk: false, skillUsed: false, animation: 'idle' }
  const next: GameState = { ...working, units: { ...working.units, [team]: refreshed }, deck: draw.deck, discard: draw.discard, currentUnit: team, phase: team === 'player' ? 'player' : 'ai', turnStage: skipPlay ? 'finish' : 'play', selectedCardId: null, selectedAsSlash: false, selectedAsDismantle: false, spearMode: false, spearSelection: [], jijiangSource: null, zhihengMode: false, zhihengSelection: [], discardSelection: [], pathPreview: [], reachable: [], message: skipPlay ? `${refreshed.name}的【乐不思蜀】判定失败，跳过出牌阶段` : `${team === 'player' ? '你的' : `${refreshed.name}的`}出牌阶段 · 摸两张牌`, history: log(working, skipPlay ? `${refreshed.name}跳过出牌阶段` : `${refreshed.name}摸两张牌`) }
  next.reachable = team === 'player' ? reachableCells(next, refreshed) : []
  return next
}

export const useGameStore = create<GameStore>((set, get) => ({
  ...createInitialState(),
  selectGeneral: skill => {
    const state = get(), sourceId = state.turnOrder.find(id => state.units[id].skill === skill)
    if (sourceId === 'player') { set({ generalSelected: true, message: `已选择${state.units.player.name}，准备开战` }); return }
    const player = state.units.player
    const chosen = GENERAL_PROFILE[skill]!, replacement = GENERAL_PROFILE[player.skill]!
    if (!sourceId) {
      set({ generalSelected: true, units: { ...state.units, player: { ...player, ...chosen, hp: 5, maxHp: 5 } }, message: `已选择${chosen.name}，准备开战` })
      return
    }
    const source = state.units[sourceId]
    set({
      generalSelected: true,
      units: {
        ...state.units,
        player: { ...player, ...chosen, hp: 5, maxHp: 5 },
        [sourceId]: { ...source, ...replacement, hp: 4, maxHp: 4 },
      },
      message: `已选择${chosen.name}，准备开战`,
    })
  },
  dispatch: action => {
    if (action.type === 'RESTART') { set({ ...createInitialState() }); return }
    const state = get(); if (state.phase === 'finished' || state.pendingResponse) return
    if (action.type === 'MOVE') {
      const unit = state.units[action.unit]
      if (state.currentUnit !== action.unit || state.turnStage !== 'play') return
      const path = findPath(state, unit.position, action.to, unit.id), cost = pathCost(state, path)
      if (!path.length || cost > unit.movement) return
      const updated = { ...unit, position: action.to, movement: unit.movement - cost, animation: 'move' as const }
      const units = { ...state.units, [action.unit]: updated }, message = `${unit.name}移动 ${cost} 点（${path.length} 格）`
      set({ units, reachable: action.unit === 'player' ? reachableCells({ ...state, units }, updated) : [], pathPreview: [], message, history: log(state, message) }); return
    }
    if (action.type === 'INTERACT') {
      const unit = state.units[action.unit], object = state.mapObjects.find(item => item.id === action.objectId)
      if (state.currentUnit !== action.unit || state.turnStage !== 'play' || !object || object.claimed) return
      if (Math.abs(unit.position.x - object.position.x) + Math.abs(unit.position.y - object.position.y) > 1) return
      const payment = unit.hand.find(card => card.id === action.cardId); if (!payment) return
      const draw = drawCards(state.deck, [...state.discard, payment], 2)
      const message = `${unit.name}弃置【${CARD_LABEL[payment.kind]}】开启军需箱，获得两张牌`
      set({
        units: { ...state.units, [action.unit]: { ...unit, hand: [...unit.hand.filter(card => card.id !== payment.id), ...draw.drawn], animation: 'cast' } },
        mapObjects: state.mapObjects.map(item => item.id === object.id ? { ...item, claimed: true } : item),
        deck: draw.deck, discard: draw.discard, selectedCardId: null, selectedAsSlash: false, selectedAsDismantle: false,
        message, history: log(state, message),
      }); return
    }
    if (action.type === 'PLAY_CARD') {
      const unit = state.units[action.unit]
      if (state.currentUnit !== action.unit || state.turnStage !== 'play') return
      const assistant = action.lordAssist ? state.units[action.lordAssist] : undefined
      const validJijiang = assistant && action.unit === 'player' && unit.identity === 'lord' && unit.faction === 'shu' && assistant.identity === 'loyalist' && assistant.faction === 'shu'
      const assistedCard = validJijiang ? responseCard(assistant, 'slash') : undefined
      if (action.lordAssist && (!assistedCard || assistedCard.id !== action.cardId)) return
      const spearMaterials = action.asSlash && unit.equipment.weapon?.kind === 'spear' && action.materialIds?.length === 2
        ? unit.hand.filter(card => action.materialIds!.includes(card.id)) : []
      if (action.materialIds && (spearMaterials.length !== 2 || new Set(action.materialIds).size !== 2)) return
      const removed = takeCard(assistant ? assistant.hand : unit.hand, action.cardId); if (!removed.card) return
      const card = removed.card
      const virtualDismantle = action.asDismantle && unit.skill === 'qixi' && (card.suit === 'spade' || card.suit === 'club')
      const virtualSlash = !!validJijiang || (action.asSlash && (spearMaterials.length === 2 || (unit.skill === 'wusheng' && (card.suit === 'heart' || card.suit === 'diamond')) || (unit.skill === 'longdan' && card.kind === 'dodge')))
      const kind = virtualSlash ? 'slash' : virtualDismantle ? 'dismantle' : card.kind
      const targetId = action.target ?? primaryTarget(state, action.unit), target = state.units[targetId]
      const playedCards = spearMaterials.length === 2 ? spearMaterials : [card]
      const remainingHand = assistant ? unit.hand : spearMaterials.length === 2 ? unit.hand.filter(item => !action.materialIds!.includes(item.id)) : removed.hand
      const unitsAfterPlay = assistant
        ? { ...state.units, [action.unit]: { ...unit, animation: 'cast' as const }, [assistant.id]: { ...assistant, hand: removed.hand, animation: 'cast' as const } }
        : { ...state.units, [action.unit]: { ...unit, hand: remainingHand, animation: 'cast' as const } }
      let base: GameState = { ...state, units: unitsAfterPlay, discard: [...state.discard, ...playedCards], selectedCardId: null, selectedAsSlash: false, selectedAsDismantle: false, spearMode: false, spearSelection: [], jijiangSource: null }
      const instantTricks: Card['kind'][] = ['duel', 'dismantle', 'snatch', 'borrowedSword', 'drawTwo', 'arrows', 'barbarians', 'peachGarden', 'harvest', 'fireAttack', 'ironChain']
      if (unit.skill === 'jizhi' && instantTricks.includes(kind)) {
        const insight = drawCards(base.deck, base.discard, 1), actor = base.units[action.unit]
        const skillMessage = `${unit.name}发动【集智】，摸一张牌`
        base = { ...base, units: { ...base.units, [action.unit]: { ...actor, hand: [...actor.hand, ...insight.drawn] } }, deck: insight.deck, discard: insight.discard, message: skillMessage, history: log(base, skillMessage) }
      }
      const nullifiable = ['duel', 'dismantle', 'snatch', 'borrowedSword', 'indulgence', 'fireAttack', 'ironChain'].includes(kind)
      if (kind === 'borrowedSword' && !target.equipment.weapon) return
      if (kind === 'snatch' && !unit.skills.includes('qicai') && combatDistance(state, unit, target) > 1) return
      if (nullifiable && targetId === 'player' && action.unit !== 'player') {
        const trick = kind as 'duel' | 'dismantle' | 'snatch' | 'borrowedSword' | 'indulgence' | 'fireAttack' | 'ironChain'
        const prompt = `${unit.name}对你使用【${CARD_LABEL[trick]}】，是否打出【无懈可击】？`
        set({ ...base, pendingResponse: { effect: 'nullify', source: action.unit, target: 'player', required: 'nullify', trick, originCardId: card.id, prompt }, message: prompt, history: log(base, prompt) }); return
      }
      const nullify = nullifiable ? target.hand.find(c => c.kind === 'nullify') : undefined
      if (nullify) {
        const message = `${target.name}打出【无懈可击】，抵消【${CARD_LABEL[kind]}】`
        set({ ...base, units: { ...base.units, [targetId]: { ...target, hand: target.hand.filter(c => c.id !== nullify.id), animation: 'cast' } }, discard: [...base.discard, nullify], message, history: log(base, message) }); return
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
        set({ ...base, units: { ...base.units, [action.unit]: { ...actor, hand: [...actor.hand, ...draw.drawn] } }, deck: draw.deck, discard: draw.discard, message, history: log(base, message) }); return
      }
      if (kind === 'peachGarden') {
        const units = Object.fromEntries(Object.entries(base.units).map(([id, actor]) => [id, actor.hp > 0 ? { ...actor, hp: Math.min(actor.maxHp, actor.hp + 1), animation: actor.hp < actor.maxHp ? 'heal' as const : actor.animation } : actor])) as GameState['units']
        const message = `${unit.name}使用【桃园结义】，所有存活角色回复体力`
        set({ ...base, units, message, history: log(base, message) }); return
      }
      if (kind === 'harvest') {
        let deck = base.deck, discard = base.discard, units = base.units
        for (const id of base.turnOrder) {
          if (units[id].hp <= 0) continue
          const draw = drawCards(deck, discard, 1); deck = draw.deck; discard = draw.discard
          units = { ...units, [id]: { ...units[id], hand: [...units[id].hand, ...draw.drawn], animation: 'cast' } }
        }
        const message = `${unit.name}使用【五谷丰登】，所有存活角色各摸一张牌`
        set({ ...base, units, deck, discard, message, history: log(base, message) }); return
      }
      if (isEquipment(kind)) {
        const slot = card.kind === 'shield' || card.kind === 'bagua' ? 'armor' : card.kind === 'redHare' ? 'offensiveMount' : card.kind === 'dilu' ? 'defensiveMount' : 'weapon', old = unit.equipment[slot]
        const equipped = { ...unit, hand: removed.hand, equipment: { ...unit.equipment, [slot]: card }, animation: 'cast' as const }, message = `${unit.name}装备【${CARD_LABEL[card.kind]}】`
        set({ units: { ...state.units, [action.unit]: equipped }, discard: old ? [...state.discard, old] : state.discard, selectedCardId: null, message, history: log(state, message) }); return
      }
      if (kind === 'slash') {
        if (!canSlash(state, unit, target)) return
        if (targetId === 'player' && action.unit !== 'player') {
          const slashCard = base.discard[base.discard.length - 1]
          const shieldBlocks = target.equipment.armor?.kind === 'shield' && (slashCard.suit === 'spade' || slashCard.suit === 'club') && unit.equipment.weapon?.kind !== 'qinggang'
          if (!shieldBlocks) {
            let armorChecked = false
            if (target.equipment.armor?.kind === 'bagua' && unit.equipment.weapon?.kind !== 'qinggang') {
              const judged = judgeBagua(base, targetId); base = judged.state; armorChecked = true
              if (judged.success) {
                set({ ...base, units: { ...base.units, [action.unit]: { ...base.units[action.unit], attacksUsed: base.units[action.unit].attacksUsed + 1, drunk: false, animation: 'attack' } } }); return
              }
            }
            const requiredCount = unit.skill === 'wushuang' ? 2 : 1
            const prompt = `${unit.name}对你使用【杀】，${requiredCount === 2 ? '【无双】要求连续打出两张【闪】' : '请选择是否打出【闪】'}`
            set({ ...base, pendingResponse: { effect: 'slash', source: action.unit, target: 'player', required: 'dodge', requiredCount, armorChecked, prompt }, message: prompt, history: log(base, prompt) }); return
          }
        }
        if (action.unit === 'player' && unit.equipment.weapon?.kind === 'halberd' && remainingHand.length === 0) {
          const legal = [targetId, ...state.turnOrder.filter(id => id !== action.unit && id !== targetId && state.units[id].hp > 0 && combatDistance(state, unit, state.units[id]) <= effectiveAttackRange(state, unit))].slice(0, 3)
          let working = base
          for (const id of legal) {
            working = { ...working, ...resolveSlash(working, action.unit, id) }
            if (working.pendingResponse || working.winner) break
            working = { ...working, units: { ...working.units, [action.unit]: { ...working.units[action.unit], attacksUsed: unit.attacksUsed } } }
          }
          if (!working.pendingResponse) working = { ...working, units: { ...working.units, [action.unit]: { ...working.units[action.unit], attacksUsed: unit.attacksUsed + 1 } }, message: `${unit.name}发动【方天画戟】，一杀多目标` }
          set(working); return
        }
        set({ ...base, ...resolveSlash(base, action.unit, targetId) }); return
      }
      if (kind === 'duel') { set(continueDuel(base, targetId, action.unit)); return }
      if (kind === 'fireAttack') { set(resolveFireAttack(base, action.unit, targetId)); return }
      if (kind === 'ironChain') { set(resolveIronChain(base, action.unit, targetId)); return }
      if (kind === 'borrowedSword') { set(resolveBorrowedSword(base, action.unit, targetId)); return }
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
        set(takeTargetCard(base, action.unit, targetId, kind === 'snatch')); return
      }
      return
    }
    if (action.type === 'END_TURN' && state.phase === 'player') {
      const player = state.units.player, excess = Math.max(0, player.hand.length - player.hp)
      let turnState = state
      if (state.turnStage !== 'discard' && excess > 0) {
        const message = `弃牌阶段 · 请选择 ${excess} 张手牌`
        set({ turnStage: 'discard', discardSelection: [], selectedCardId: null, selectedAsSlash: false, selectedAsDismantle: false, spearMode: false, spearSelection: [], jijiangSource: null, zhihengMode: false, zhihengSelection: [], reachable: [], pathPreview: [], message, history: log(state, message) }); return
      }
      if (state.turnStage === 'discard') {
        if (state.discardSelection.length !== excess) return
        const chosen = player.hand.filter(card => state.discardSelection.includes(card.id))
        const message = `${player.name}弃置 ${chosen.length} 张手牌`
        const units = { ...state.units, player: { ...player, hand: player.hand.filter(card => !state.discardSelection.includes(card.id)) } }
        turnState = { ...state, units, discard: [...state.discard, ...chosen], history: log(state, message), message }
      }
      let next = resolveEndSkill({ ...turnState, turnStage: 'finish', discardSelection: [] }, 'player'); next = resolveEndTurnTerrain(next, 'player'); next = scoreControlPoint(next, 'player')
      if (next.winner) { set(next); return }
      const nextUnit = nextSeat(next, 'player'); next = beginTurn({ ...next, turnStage: 'finish' }, nextUnit); set(next); void get().runAI()
    }
  },
  toggleDiscard: id => {
    const state = get(); if (state.phase !== 'player' || state.turnStage !== 'discard') return
    const excess = Math.max(0, state.units.player.hand.length - state.units.player.hp)
    if (!state.units.player.hand.some(card => card.id === id)) return
    const selected = state.discardSelection.includes(id)
    if (!selected && state.discardSelection.length >= excess) return
    const discardSelection = selected ? state.discardSelection.filter(cardId => cardId !== id) : [...state.discardSelection, id]
    set({ discardSelection, message: `弃牌阶段 · 已选择 ${discardSelection.length}/${excess} 张` })
  },
  respond: cardId => {
    const state = get(), pending = state.pendingResponse
    if (!pending) return
    const player = state.units.player
    const card = cardId ? player.hand.find(candidate => candidate.id === cardId && (candidate.kind === pending.required || (player.skill === 'longdan' && ((pending.required === 'dodge' && candidate.kind === 'slash') || (pending.required === 'slash' && candidate.kind === 'dodge'))))) : undefined
    if (cardId && !card) return
    let base: GameState = { ...state, pendingResponse: null }
    if (pending.effect === 'dying') {
      if (card) {
        const player = base.units.player, target = base.units[pending.target]
        const rescuedPlayer = { ...player, hand: player.hand.filter(candidate => candidate.id !== card.id), ...(pending.target === 'player' ? { hp: 1, animation: 'heal' as const } : {}) }
        const units = { ...base.units, player: rescuedPlayer, [pending.target]: pending.target === 'player' ? rescuedPlayer : { ...target, hp: 1, animation: 'heal' as const } }
        const message = pending.target === 'player' ? `${player.name}使用【桃】自救，回复至 1 点体力` : `${player.name}对${target.name}使用【桃】，将其救回至 1 点体力`
        base = { ...base, units, discard: [...base.discard, card], message, history: log(base, message) }
      } else {
        const target = base.units[pending.target]
        const deathBase = { ...base, units: { ...base.units, [pending.target]: { ...target, hp: 1 } } }
        base = { ...base, ...damage(deathBase, pending.source, pending.target, 1, `${target.name}无人援救，阵亡！`, true) }
      }
      set(base)
      if (base.phase === 'ai' && !base.winner) setTimeout(() => void get().runAI(), 120)
      return
    }
    if (pending.effect === 'nullify') {
      if (card) {
        const player = base.units.player, message = `${player.name}打出【无懈可击】，抵消【${CARD_LABEL[pending.trick!]}】`
        base = { ...base, units: { ...base.units, player: { ...player, hand: player.hand.filter(candidate => candidate.id !== card.id), animation: 'cast' } }, discard: [...base.discard, card], message, history: log(base, message) }
      } else if (pending.trick === 'arrows' || pending.trick === 'barbarians') {
        const required = pending.trick === 'arrows' ? 'dodge' : 'slash'
        const prompt = `${base.units[pending.source].name}使用【${CARD_LABEL[pending.trick]}】，请打出【${CARD_LABEL[required]}】响应`
        base = { ...base, pendingResponse: { effect: pending.trick, source: pending.source, target: 'player', required, prompt }, message: prompt, history: log(base, prompt) }
      } else if (pending.trick === 'duel') base = { ...base, ...continueDuel(base, 'player', pending.source) }
      else if (pending.trick === 'indulgence') {
        const delayed = base.discard.find(candidate => candidate.id === pending.originCardId)
        if (delayed) {
          const player = base.units.player, message = `${base.units[pending.source].name}将【乐不思蜀】置入${player.name}的判定区`
          base = { ...base, units: { ...base.units, player: { ...player, judgement: [...player.judgement, delayed], animation: 'cast' } }, discard: base.discard.filter(candidate => candidate.id !== delayed.id), message, history: log(base, message) }
        }
      } else if (pending.trick === 'dismantle' || pending.trick === 'snatch') base = { ...base, ...takeTargetCard(base, pending.source, 'player', pending.trick === 'snatch') }
      else if (pending.trick === 'borrowedSword') base = { ...base, ...resolveBorrowedSword(base, pending.source, 'player') }
      else if (pending.trick === 'fireAttack') base = { ...base, ...resolveFireAttack(base, pending.source, 'player') }
      else if (pending.trick === 'ironChain') base = { ...base, ...resolveIronChain(base, pending.source, 'player') }
      set(base)
      if (base.phase === 'ai' && !base.winner && !base.pendingResponse) setTimeout(() => void get().runAI(), 120)
      return
    }
    if (pending.effect === 'duel') {
      if (card) {
        const player = base.units.player
        if ((pending.requiredCount ?? 1) > 1) {
          const remaining = (pending.requiredCount ?? 1) - 1, prompt = `【无双决斗】还需打出 ${remaining} 张【杀】`
          base = { ...base, units: { ...base.units, player: { ...player, hand: player.hand.filter(candidate => candidate.id !== card.id), animation: 'cast' } }, discard: [...base.discard, card], pendingResponse: { ...pending, requiredCount: remaining, prompt }, message: prompt, history: log(base, `${player.name}为【无双决斗】打出第一张【杀】`) }
          set(base); return
        }
        base = { ...base, units: { ...base.units, player: { ...player, hand: player.hand.filter(candidate => candidate.id !== card.id), animation: 'cast' } }, discard: [...base.discard, card] }
        base = { ...base, ...continueDuel(base, pending.source, 'player') }
      } else base = { ...base, ...damage(base, pending.source, 'player', 1, `${base.units.player.name}未能在【决斗】中出杀，受到 1 点伤害`) }
      set(base)
      if (base.phase === 'ai' && !base.winner && !base.pendingResponse) setTimeout(() => void get().runAI(), 120)
      return
    }
    if (pending.effect === 'slash' && card && (pending.requiredCount ?? 1) > 1) {
      const player = base.units.player, remaining = (pending.requiredCount ?? 1) - 1
      const prompt = `【无双】还需打出 ${remaining} 张【闪】，或放弃并承受伤害`
      base = { ...base, units: { ...base.units, player: { ...player, hand: player.hand.filter(candidate => candidate.id !== card.id), animation: 'cast' } }, discard: [...base.discard, card], pendingResponse: { ...pending, requiredCount: remaining, prompt }, message: prompt, history: log(base, `${player.name}为【无双】打出第一张【闪】`) }
      set(base); return
    }
    if (card) {
      const player = base.units.player
      const message = `${player.name}打出【${CARD_LABEL[card.kind]}】响应【${CARD_LABEL[pending.effect]}】`
      base = { ...base, units: { ...base.units, player: { ...player, hand: player.hand.filter(candidate => candidate.id !== card.id), animation: 'cast' } }, discard: [...base.discard, card], message, history: log(base, message) }
      if (pending.effect === 'slash') {
        const resolved = resolveSlash({ ...base, discard: base.discard.filter(candidate => candidate.id !== card.id) }, pending.source, 'player', card, pending.armorChecked)
        base = { ...base, ...resolved }
      }
    } else if (pending.effect === 'slash') {
      base = { ...base, ...resolveSlash(base, pending.source, 'player', null, pending.armorChecked) }
    } else {
      const guard = pending.required === 'dodge' ? loyalGuard(base, 'player') : null
      if (guard) {
        const message = `${guard.unit.name}发动【护驾】保护主公`
        base = { ...base, units: { ...base.units, [guard.unit.id]: { ...guard.unit, hand: guard.unit.hand.filter(candidate => candidate.id !== guard.dodge.id), animation: 'cast' } }, discard: [...base.discard, guard.dodge], message, history: log(base, message) }
      } else base = { ...base, ...damage(base, pending.source, 'player', 1, `${base.units.player.name}未能响应【${CARD_LABEL[pending.effect]}】，受到 1 点伤害`) }
    }
    set(base)
    if (base.phase === 'ai' && !base.winner) setTimeout(() => void get().runAI(), 120)
  },
  selectCard: id => {
    const state = get(); if (state.phase !== 'player' || state.pendingResponse) return
    if (!id) { set({ selectedCardId: null, selectedAsSlash: false, selectedAsDismantle: false, spearMode: false, spearSelection: [], jijiangSource: null, zhihengMode: false, zhihengSelection: [], message: '已取消选牌' }); return }
    const card = state.units.player.hand.find(c => c.id === id); if (!card) return
    if (state.zhihengMode) {
      const selected = state.zhihengSelection.includes(id)
      const zhihengSelection = selected ? state.zhihengSelection.filter(cardId => cardId !== id) : [...state.zhihengSelection, id]
      set({ zhihengSelection, message: `【制衡】已选择 ${zhihengSelection.length} 张牌，再次点击制衡确认` }); return
    }
    if (state.spearMode) {
      const selected = state.spearSelection.includes(id)
      const spearSelection = selected ? state.spearSelection.filter(cardId => cardId !== id) : state.spearSelection.length < 2 ? [...state.spearSelection, id] : state.spearSelection
      set({ spearSelection, selectedCardId: spearSelection[0] ?? null, selectedAsSlash: spearSelection.length === 2, message: spearSelection.length === 2 ? '【丈八蛇矛】请选择攻击范围内的敌将' : `【丈八蛇矛】请选择两张手牌（${spearSelection.length}/2）` }); return
    }
    if (card.kind === 'dodge' && state.units.player.skill === 'longdan') {
      set({ selectedCardId: state.selectedCardId === id ? null : id, selectedAsSlash: state.selectedCardId !== id, message: '【龙胆】将【闪】当【杀】使用，请选择敌将' }); return
    }
    if (card.kind === 'dodge' && !(state.units.player.skill === 'qixi' && (card.suit === 'spade' || card.suit === 'club'))) { set({ message: '【闪】在响应窗口中打出' }); return }
    const needsTarget = ['slash', 'duel', 'dismantle', 'snatch', 'borrowedSword', 'indulgence', 'fireAttack', 'ironChain'].includes(card.kind)
    if (!needsTarget && state.selectedCardId === id) { get().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: id }); return }
    set({ selectedCardId: state.selectedCardId === id ? null : id, selectedAsSlash: false, selectedAsDismantle: false, message: needsTarget ? `选择敌将使用【${CARD_LABEL[card.kind]}】` : '再次点击确认使用' })
  },
  activateWusheng: () => {
    const state = get(), card = state.units.player.hand.find(c => c.id === state.selectedCardId)
    if (state.units.player.skill !== 'wusheng' || !card || card.kind === 'slash' || (card.suit !== 'heart' && card.suit !== 'diamond')) return
    set({ selectedAsSlash: true, selectedAsDismantle: false, message: `【武圣】将${CARD_LABEL[card.kind]}当【杀】使用，请选择敌将` })
  },
  activateSpear: () => {
    const state = get()
    if (state.phase !== 'player' || state.turnStage !== 'play' || state.units.player.equipment.weapon?.kind !== 'spear' || state.units.player.hand.length < 2) return
    const spearMode = !state.spearMode
    set({ spearMode, spearSelection: [], selectedCardId: null, selectedAsSlash: false, selectedAsDismantle: false, message: spearMode ? '【丈八蛇矛】请选择两张手牌' : '已取消丈八蛇矛' })
  },
  activateJijiang: () => {
    const state = get(), lord = state.units.player
    if (state.phase !== 'player' || state.turnStage !== 'play' || lord.identity !== 'lord' || lord.faction !== 'shu' || lord.attacksUsed >= slashLimit(lord)) return
    const helper = Object.values(state.units).find(unit => unit.identity === 'loyalist' && unit.faction === 'shu' && unit.hp > 0 && responseCard(unit, 'slash'))
    if (!helper) { set({ message: '没有蜀势力忠臣可以响应【激将】' }); return }
    const offered = responseCard(helper, 'slash')!
    set({ selectedCardId: offered.id, selectedAsSlash: true, selectedAsDismantle: false, spearMode: false, spearSelection: [], jijiangSource: helper.id, message: `${helper.name}响应【激将】，请选择攻击范围内的敌将` })
  },
  activateQixi: () => {
    const state = get(), card = state.units.player.hand.find(item => item.id === state.selectedCardId)
    if (state.units.player.skill !== 'qixi' || !card || (card.suit !== 'spade' && card.suit !== 'club')) return
    set({ selectedAsDismantle: true, selectedAsSlash: false, message: `【奇袭】将${CARD_LABEL[card.kind]}当【过河拆桥】使用，请选择敌将` })
  },
  activateZhiheng: () => {
    const state = get(), player = state.units.player
    if (state.phase !== 'player' || state.turnStage !== 'play' || player.skill !== 'zhiheng' || player.skillUsed) return
    if (!state.zhihengMode) {
      set({ zhihengMode: true, zhihengSelection: [], selectedCardId: null, selectedAsSlash: false, selectedAsDismantle: false, message: '【制衡】请选择任意张手牌，再次点击制衡确认' }); return
    }
    if (!state.zhihengSelection.length) { set({ zhihengMode: false, message: '已取消制衡' }); return }
    const chosen = player.hand.filter(card => state.zhihengSelection.includes(card.id))
    const remaining = player.hand.filter(card => !state.zhihengSelection.includes(card.id))
    const draw = drawCards(state.deck, [...state.discard, ...chosen], chosen.length)
    const message = `${player.name}发动【制衡】，弃置并重摸 ${chosen.length} 张牌`
    set({ units: { ...state.units, player: { ...player, hand: [...remaining, ...draw.drawn], skillUsed: true, animation: 'cast' } }, deck: draw.deck, discard: draw.discard, zhihengMode: false, zhihengSelection: [], message, history: log(state, message) })
  },
  hoverCell: position => {
    const state = get(); if (!position || state.phase !== 'player') { set({ pathPreview: [] }); return }
    const path = findPath(state, state.units.player.position, position, 'player')
    set({ pathPreview: pathCost(state, path) <= state.units.player.movement ? path : [] })
  },
  resetAnimation: team => set(state => ({ units: { ...state.units, [team]: { ...state.units[team], animation: 'idle' } } })),
  runAI: async () => {
    await wait(450); let state = get(); if (state.phase !== 'ai' || state.pendingResponse) return
    const aiId = state.currentUnit, aiUnit = state.units[aiId]
    if (!aiUnit || aiUnit.hp <= 0) {
      const next = nextSeat(state, aiId); set(beginTurn(state, next)); if (next !== 'player') void get().runAI(); return
    }
    if (state.turnStage === 'finish') {
      let skipped = resolveEndSkill(state, aiId); skipped = resolveEndTurnTerrain(skipped, aiId); skipped = scoreControlPoint(skipped, aiId); if (skipped.winner) { set(skipped); return }
      const next = nextSeat(skipped, aiId), nextState = beginTurn({ ...skipped, turn: next === 'player' ? skipped.turn + 1 : skipped.turn }, next)
      set(nextState); if (next !== 'player') void get().runAI(); return
    }
    let ai = state.units[aiId]
    for (const kind of ['peach', 'drawTwo', 'harvest', 'peachGarden', 'shield', 'bagua', 'qinggang', 'greenDragon', 'crossbow', 'spear', 'axe', 'halberd', 'qilinBow', 'gudingBlade', 'vermilionFan', 'redHare', 'dilu', 'lightning', 'wine'] as const) {
      state = get(); ai = state.units[aiId]
      const card = ai.hand.find(c => c.kind === kind)
      if (!card || (kind === 'peach' && ai.hp === ai.maxHp) || (kind === 'peachGarden' && ai.hp === ai.maxHp) || (kind === 'wine' && !ai.hand.some(c => c.kind === 'slash'))) continue
      get().dispatch({ type: 'PLAY_CARD', unit: aiId, cardId: card.id }); await wait(280)
      if (get().pendingResponse) return
    }
    state = get(); ai = state.units[aiId]
    const cache = state.mapObjects.find(item => !item.claimed && Math.abs(ai.position.x - item.position.x) + Math.abs(ai.position.y - item.position.y) <= 1)
    const payment = ai.hand.find(card => card.kind === 'dodge' || card.kind === 'slash') ?? ai.hand[ai.hand.length - 1]
    if (cache && payment) {
      get().dispatch({ type: 'INTERACT', unit: aiId, objectId: cache.id, cardId: payment.id }); await wait(320)
      state = get(); ai = state.units[aiId]
    }
    let target = targetsFor(state, aiId)[0]
    if (!target) return
    const aggressive = ai.hand.find(c => c.kind === 'slash') ?? (ai.skill === 'longdan' ? ai.hand.find(c => c.kind === 'dodge') : undefined)
    if (!aggressive || !canSlash(state, ai, target)) {
      const destinations = aggressive ? [{ x: target.position.x + 1, y: target.position.y }, { x: target.position.x - 1, y: target.position.y }, { x: target.position.x, y: target.position.y + 1 }, { x: target.position.x, y: target.position.y - 1 }] : [state.controlPoint]
      let best: Position[] = []
      for (const destination of destinations) { const path = findPath(state, ai.position, destination, aiId); if (path.length && (!best.length || pathCost(state, path) < pathCost(state, best))) best = path }
      if (best.length) { let cost = 0, destination = ai.position; for (const p of best) { const step = pathCost(state, [p]); if (cost + step > ai.movement) break; cost += step; destination = p } get().dispatch({ type: 'MOVE', unit: aiId, to: destination }); await wait(500) }
    }
    state = get(); ai = state.units[aiId]; target = targetsFor(state, aiId)[0]
    if (!target) return
    for (const kind of ['ironChain', 'fireAttack', 'indulgence', 'dismantle', 'snatch', 'borrowedSword', 'arrows', 'barbarians', 'duel', 'slash'] as const) {
      const card = kind === 'slash' ? responseCard(ai, 'slash') : ai.hand.find(c => c.kind === kind); if (!card) continue
      if (kind === 'borrowedSword') target = targetsFor(state, aiId).find(unit => !!unit.equipment.weapon) ?? target
      if (kind === 'borrowedSword' && !target.equipment.weapon) continue
      if (kind === 'slash' && !canSlash(state, ai, target)) continue
      if (kind === 'snatch' && combatDistance(state, ai, target) > 1) continue
      get().dispatch({ type: 'PLAY_CARD', unit: aiId, cardId: card.id, target: target.id, asSlash: kind === 'slash' && card.kind === 'dodge' }); await wait(420); state = get(); ai = state.units[aiId]
      if (state.pendingResponse) return
      if (state.phase === 'finished') return
    }
    state = get(); let next = discardOverflow({ ...state, turnStage: 'discard' }, aiId); next = resolveEndSkill(next, aiId); next = resolveEndTurnTerrain(next, aiId); next = scoreControlPoint(next, aiId)
    if (next.winner) { set(next); return }
    const nextId = nextSeat(next, aiId), nextState = beginTurn({ ...next, turn: nextId === 'player' ? next.turn + 1 : next.turn, turnStage: 'finish' }, nextId)
    set(nextState); if (nextId !== 'player') void get().runAI()
  },
}))

export const isCellReachable = (cells: Position[], position: Position) => cells.some(cell => samePosition(cell, position))
export const attackDistance = (state: GameState, target: Team = 'east') => pathDistance(state, state.units.player.position, state.units[target].position, 'player')
export const rangeLabel = (unit: Unit) => `攻击范围 ${attackRange(unit)}`

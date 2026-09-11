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
  activateQingnang: () => void
  activateFanjian: () => void
  activateJieyin: () => void
  activateRende: () => void
  activateKurou: () => void
  activateGuose: () => void
  activateLijian: () => void
  selectLijianTarget: (team: Team) => void
  hoverCell: (position: Position | null) => void
  runAI: () => Promise<void>
  resetAnimation: (team: Team) => void
}
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const GENERAL_PROFILE: Partial<Record<GeneralSkill, Pick<Unit, 'name' | 'title' | 'skill' | 'skills' | 'faction' | 'gender'>>> = {
  qianxun: { name: '陆逊', title: '儒生雄才', skill: 'qianxun', skills: ['qianxun', 'lianying'], faction: 'wu', gender: 'male' },
  guose: { name: '大乔', title: '矜持之花', skill: 'guose', skills: ['guose', 'liuli'], faction: 'wu', gender: 'female' },
  luoshen: { name: '甄姬', title: '薄幸的美人', skill: 'luoshen', skills: ['luoshen', 'qingguo'], faction: 'wei', gender: 'female' },
  keji: { name: '吕蒙', title: '白衣渡江', skill: 'keji', skills: ['keji'], faction: 'wu', gender: 'male' },
  kurou: { name: '黄盖', title: '轻身为国', skill: 'kurou', skills: ['kurou'], faction: 'wu', gender: 'male' },
  tieqi: { name: '马超', title: '一骑当千', skill: 'tieqi', skills: ['mashu', 'tieqi'], faction: 'shu', gender: 'male' },
  rende: { name: '刘备', title: '乱世的枭雄', skill: 'rende', skills: ['rende', 'jijiang'], faction: 'shu', gender: 'male' },
  wusheng: { name: '关羽', title: '美髯公', skill: 'wusheng', skills: ['wusheng'], faction: 'shu', gender: 'male' },
  longdan: { name: '赵云', title: '少年将军', skill: 'longdan', skills: ['longdan'], faction: 'shu', gender: 'male' },
  ganglie: { name: '夏侯惇', title: '独眼的罗刹', skill: 'ganglie', skills: ['ganglie'], faction: 'wei', gender: 'male' },
  feedback: { name: '司马懿', title: '狼顾之鬼', skill: 'feedback', skills: ['feedback', 'guicai'], faction: 'wei', gender: 'male' },
  jianxiong: { name: '曹操', title: '魏武帝', skill: 'jianxiong', skills: ['jianxiong'], faction: 'wei', gender: 'male' },
  yiji: { name: '郭嘉', title: '早终的先知', skill: 'yiji', skills: ['tiandu', 'yiji'], faction: 'wei', gender: 'male' },
  qingnang: { name: '华佗', title: '神医', skill: 'qingnang', skills: ['qingnang', 'jijiu'], faction: 'qun', gender: 'male' },
  yingzi: { name: '周瑜', title: '大都督', skill: 'yingzi', skills: ['yingzi', 'fanjian'], faction: 'wu', gender: 'male' },
  guanxing: { name: '诸葛亮', title: '迟暮的丞相', skill: 'guanxing', skills: ['guanxing', 'kongcheng'], faction: 'shu', gender: 'male' },
  tuxi: { name: '张辽', title: '前将军', skill: 'tuxi', skills: ['tuxi'], faction: 'wei', gender: 'male' },
  luoyi: { name: '许褚', title: '虎痴', skill: 'luoyi', skills: ['luoyi'], faction: 'wei', gender: 'male' },
  jieyin: { name: '孙尚香', title: '弓腰姬', skill: 'jieyin', skills: ['jieyin', 'xiaoji'], faction: 'wu', gender: 'female' },
  paoxiao: { name: '张飞', title: '万夫不当', skill: 'paoxiao', skills: ['paoxiao'], faction: 'shu', gender: 'male' },
  jizhi: { name: '黄月英', title: '归隐的杰女', skill: 'jizhi', skills: ['jizhi', 'qicai'], faction: 'shu', gender: 'female' },
  qixi: { name: '甘宁', title: '锦帆游侠', skill: 'qixi', skills: ['qixi'], faction: 'wu', gender: 'male' },
  biyue: { name: '貂蝉', title: '绝世的舞姬', skill: 'biyue', skills: ['lijian', 'biyue'], faction: 'qun', gender: 'female' },
  zhiheng: { name: '孙权', title: '年轻的贤君', skill: 'zhiheng', skills: ['zhiheng', 'jiuyuan'], faction: 'wu', gender: 'male' },
  wushuang: { name: '吕布', title: '武的化身', skill: 'wushuang', skills: ['wushuang'], faction: 'qun', gender: 'male' },
}
const GENERAL_BASE_HP: Partial<Record<GeneralSkill, number>> = { qianxun: 3, guose: 3, luoshen: 3, keji: 4, kurou: 4, tieqi: 4, rende: 4, wusheng: 4, longdan: 4, ganglie: 4, feedback: 3, jianxiong: 4, yiji: 3, qingnang: 3, yingzi: 3, guanxing: 3, tuxi: 4, luoyi: 4, jieyin: 3, paoxiao: 4, jizhi: 3, qixi: 4, biyue: 3, zhiheng: 4, wushuang: 4 }
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
const alliesFor = (state: GameState, team: Team) => {
  const actor = state.units[team]
  return Object.values(state.units).filter(unit => unit.hp > 0 && (
    unit.id === team ||
    ((actor.identity === 'lord' || actor.identity === 'loyalist') && (unit.identity === 'lord' || unit.identity === 'loyalist')) ||
    (actor.identity === 'rebel' && unit.identity === 'rebel')
  ))
}
const rescueCard = (unit: Unit) => unit.hand.find(card => card.kind === 'peach')
  ?? (unit.skills.includes('jijiu') ? unit.hand.find(card => card.suit === 'heart' || card.suit === 'diamond') : undefined)
const log = (state: GameState, message: string) => [message, ...state.history].slice(0, 8)
function triggerLianying(state: GameState, team: Team): GameState {
  const unit = state.units[team]
  if (unit.hp <= 0 || unit.hand.length || !unit.skills.includes('lianying')) return state
  const draw = drawCards(state.deck, state.discard, 1)
  if (!draw.drawn.length) return state
  const message = `${unit.name}发动【连营】，失去最后一张手牌后摸一张牌`
  return { ...state, units: { ...state.units, [team]: { ...unit, hand: draw.drawn, animation: 'cast' } }, deck: draw.deck, discard: draw.discard, message, history: log(state, message) }
}
const takeCard = (hand: Card[], id: string) => ({ card: hand.find(c => c.id === id), hand: hand.filter(c => c.id !== id) })
const responseCard = (unit: Unit, required: 'slash' | 'dodge') => unit.hand.find(card => card.kind === required)
  ?? (unit.skill === 'longdan' ? unit.hand.find(card => card.kind === (required === 'slash' ? 'dodge' : 'slash')) : undefined)
  ?? (required === 'slash' && unit.skills.includes('wusheng') ? unit.hand.find(card => card.suit === 'heart' || card.suit === 'diamond') : undefined)
  ?? (required === 'dodge' && unit.skills.includes('qingguo') ? unit.hand.find(card => card.suit === 'spade' || card.suit === 'club') : undefined)
const responseText = (unit: Unit, card: Card, required: 'slash' | 'dodge') => card.kind === required ? `打出【${CARD_LABEL[required]}】` : unit.skills.includes('qingguo') && required === 'dodge' && (card.suit === 'spade' || card.suit === 'club') ? `发动【倾国】，将黑色牌当【闪】` : unit.skills.includes('wusheng') && required === 'slash' && (card.suit === 'heart' || card.suit === 'diamond') ? `发动【武圣】，将红色牌当【杀】` : `发动【龙胆】，将【${CARD_LABEL[card.kind]}】当【${CARD_LABEL[required]}】`
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
  if (amount > 1 && target.equipment.armor?.kind === 'silverLion' && state.units[attackerId].equipment.weapon?.kind !== 'qinggang') {
    amount = 1; message += '；【白银狮子】将伤害减至 1'
  }
  let hp = target.hp - amount, hand = target.hand, discard = state.discard
  let rescuedUnits = state.units
  if (!skipRescue && hp <= 0 && target.identity === 'lord' && target.faction === 'wu' && target.skills.includes('jiuyuan')) {
    const helper = Object.values(state.units).find(unit => unit.id !== targetId && unit.identity === 'loyalist' && unit.faction === 'wu' && unit.hp > 0 && unit.hand.some(card => card.kind === 'peach'))
    const peach = helper?.hand.find(card => card.kind === 'peach')
    if (helper && peach) {
      rescuedUnits = { ...rescuedUnits, [helper.id]: { ...helper, hand: helper.hand.filter(card => card.id !== peach.id), animation: 'cast' } }
      discard = [...discard, peach]
      hp = 2
      message += `；${helper.name}响应【救援】，令【桃】额外回复 1 点体力`
    }
  }
  const playerPeach = !skipRescue && targetId === 'player' && hp <= 0 ? hand.find(c => c.kind === 'peach' || (target.skills.includes('jijiu') && (c.suit === 'heart' || c.suit === 'diamond'))) : undefined
  if (playerPeach) {
    const requiredCount = 1 - hp
    const prompt = `${target.name}进入濒死状态，需要 ${requiredCount} 张【桃】才能救回，是否使用？`
    return {
      units: { ...state.units, [targetId]: { ...target, hp, animation: 'hit' } },
      pendingResponse: { effect: 'dying', source: attackerId, target: targetId, required: 'peach', requiredCount, prompt },
      message: prompt,
      history: log(state, `${target.name}进入濒死状态`),
    }
  }
  while (!skipRescue && targetId !== 'player' && hp <= 0) {
    const selfAid = rescueCard({ ...target, hand })
    if (selfAid) {
      hand = hand.filter(card => card.id !== selfAid.id); discard = [...discard, selfAid]; hp += 1
      message += `；${target.name}${selfAid.kind === 'peach' ? '使用【桃】自救' : '发动【急救】自救'}`
      continue
    }
    const helper = alliesFor({ ...state, units: rescuedUnits }, targetId).find(unit => unit.id !== targetId && unit.id !== 'player' && rescueCard(unit))
    const aid = helper ? rescueCard(helper) : undefined
    if (!helper || !aid) break
    rescuedUnits = { ...rescuedUnits, [helper.id]: { ...helper, hand: helper.hand.filter(card => card.id !== aid.id), animation: 'cast' } }
    discard = [...discard, aid]; hp += 1
    message += `；${helper.name}${aid.kind === 'peach' ? '使用【桃】' : '发动【急救】'}援救${target.name}`
  }
  let units = { ...rescuedUnits, [targetId]: { ...target, hand, hp, revealed: hp <= 0 ? true : target.revealed, animation: 'hit' as const } }
  const aidPeach = !skipRescue && hp <= 0 && targetId !== 'player' && state.units.player.hp > 0 ? state.units.player.hand.find(card => card.kind === 'peach' || (state.units.player.skills.includes('jijiu') && (card.suit === 'heart' || card.suit === 'diamond'))) : undefined
  if (aidPeach) {
    const requiredCount = 1 - hp
    const prompt = `${target.name}进入濒死状态，还需要 ${requiredCount} 张【桃】，是否援救？`
    units = { ...units, [targetId]: { ...units[targetId], revealed: target.revealed } }
    return { units, pendingResponse: { effect: 'dying', source: attackerId, target: targetId, required: 'peach', requiredCount, prompt }, message: prompt, history: log(state, `${target.name}进入濒死状态`) }
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
  const finalMessage = hp <= 0 ? `${state.units[attackerId].name}击败了${target.name}，其身份是${target.identity === 'loyalist' ? '忠臣' : target.identity === 'rebel' ? '反贼' : target.identity === 'renegade' ? '内奸' : '主公'}！` : message
  let skillText = ''
  if (hp > 0 && target.skills.includes('jianxiong')) {
    const gained = discard[discard.length - 1]
    if (gained) {
      discard = discard.slice(0, -1)
      units = { ...units, [targetId]: { ...units[targetId], hand: [...units[targetId].hand, gained], animation: 'cast' } }
      skillText = `；${target.name}发动【奸雄】获得造成伤害的【${CARD_LABEL[gained.kind]}】`
    }
  }
  if (hp > 0 && target.skill === 'feedback') {
    const attacker = units[attackerId]
    const gained = attacker.hand[0] ?? attacker.equipment.weapon ?? attacker.equipment.armor ?? attacker.equipment.offensiveMount ?? attacker.equipment.defensiveMount
    if (gained) {
      const equipment = { ...attacker.equipment }
      for (const slot of Object.keys(equipment) as (keyof typeof equipment)[]) if (equipment[slot]?.id === gained.id) delete equipment[slot]
      units = { ...units, [attackerId]: { ...attacker, hand: attacker.hand.filter(card => card.id !== gained.id), equipment }, [targetId]: { ...units[targetId], hand: [...units[targetId].hand, gained], animation: 'cast' } }
      skillText += `；${target.name}发动【反馈】获得一张牌`
    }
  }
  if (hp > 0 && target.skills.includes('yiji')) {
    const insight = drawCards(deck, discard, amount * 2); deck = insight.deck; discard = insight.discard
    units = { ...units, [targetId]: { ...units[targetId], hand: [...units[targetId].hand, ...insight.drawn], animation: 'cast' } }
    skillText += `；${target.name}发动【遗计】${amount} 次，摸${amount * 2}张牌`
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
        skillText += `；${target.name}发动【刚烈】，${attacker.name}弃置两张牌`
      } else {
        units = { ...units, [attackerId]: { ...attacker, hp: Math.max(0, attacker.hp - 1), revealed: attacker.hp <= 1 ? true : attacker.revealed, animation: 'hit' } }
        skillText += `；${target.name}发动【刚烈】，${attacker.name}受到 1 点伤害`
      }
    } else if (judge) skillText += `；【刚烈】判定为红桃，未生效`
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
  const target = state.units[targetId], tiandu = target.skills.includes('tiandu')
  const message = `${target.name}发动【八卦阵】，判定${success ? '为红色，视为打出【闪】' : '为黑色，判定失败'}${tiandu ? '；【天妒】获得判定牌' : ''}`
  return { state: { ...state, units: tiandu ? { ...state.units, [targetId]: { ...target, hand: [...target.hand, judge], animation: 'cast' } } : state.units, deck: draw.deck, discard: tiandu ? draw.discard : [...draw.discard, judge], message, history: log(state, message) }, success }
}

function judgeTieqi(state: GameState, attackerId: Team) {
  const attacker = state.units[attackerId]
  if (!attacker.skills.includes('tieqi')) return { state, locked: false }
  const draw = drawCards(state.deck, state.discard, 1), judge = draw.drawn[0]
  if (!judge) return { state, locked: false }
  const locked = judge.suit === 'heart' || judge.suit === 'diamond'
  const message = `${attacker.name}发动【铁骑】，判定为${judge.suit}${judge.rank}${locked ? '，目标不能使用【闪】' : '，判定未生效'}`
  return { state: { ...state, deck: draw.deck, discard: [judge, ...draw.discard], message, history: log(state, message) }, locked }
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

function liuliRedirect(state: GameState, attackerId: Team, targetId: Team) {
  const target = state.units[targetId]
  if (!target.skills.includes('liuli') || !target.hand.length) return null
  const redirect = state.turnOrder.map(id => state.units[id]).find(unit => unit.id !== attackerId && unit.id !== targetId && unit.hp > 0 && combatDistance(state, target, unit) <= effectiveAttackRange(state, target))
  if (!redirect) return null
  const payment = target.hand[0]
  const message = `${target.name}发动【流离】，弃置【${CARD_LABEL[payment.kind]}】将【杀】转移给${redirect.name}`
  return { targetId: redirect.id, state: { ...state, units: { ...state.units, [targetId]: { ...target, hand: target.hand.slice(1), animation: 'cast' } }, discard: [...state.discard, payment], message, history: log(state, message) } }
}

function resolveSlash(state: GameState, attackerId: Team, targetId: Team, manualResponse?: Card | null, armorChecked = false): Partial<GameState> {
  if (manualResponse === undefined) {
    const redirected = liuliRedirect(state, attackerId, targetId)
    if (redirected) return resolveSlash(redirected.state, attackerId, redirected.targetId)
  }
  let attacker = state.units[attackerId], target = state.units[targetId]
  if (manualResponse === undefined) {
    const tieqi = judgeTieqi(state, attackerId)
    state = tieqi.state
    if (tieqi.locked) { manualResponse = null; armorChecked = true }
    attacker = state.units[attackerId]; target = state.units[targetId]
  }
  if (attacker.equipment.weapon?.kind === 'doubleSword' && attacker.gender !== target.gender) {
    if (target.hand.length) {
      const paid = target.hand[0], message = `${attacker.name}发动【雌雄双股剑】，${target.name}弃置一张手牌`
      state = { ...state, units: { ...state.units, [targetId]: { ...target, hand: target.hand.slice(1), animation: 'cast' } }, discard: [...state.discard, paid], message, history: log(state, message) }
    } else {
      const draw = drawCards(state.deck, state.discard, 1), message = `${attacker.name}发动【雌雄双股剑】，摸一张牌`
      state = { ...state, units: { ...state.units, [attackerId]: { ...attacker, hand: [...attacker.hand, ...draw.drawn], animation: 'cast' } }, deck: draw.deck, discard: draw.discard, message, history: log(state, message) }
    }
    attacker = state.units[attackerId]; target = state.units[targetId]
  }
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
  if (attacker.equipment.weapon?.kind === 'iceSword') {
    const iceTarget = units[targetId], equipment = { ...iceTarget.equipment }
    const removed = iceTarget.hand.slice(0, 2)
    for (const slot of ['weapon', 'armor', 'offensiveMount', 'defensiveMount'] as const) {
      if (removed.length >= 2) break
      if (equipment[slot]) { removed.push(equipment[slot]!); delete equipment[slot] }
    }
    if (removed.length) {
      const lionHeal = removed.some(card => card.kind === 'silverLion') && iceTarget.hp < iceTarget.maxHp
      const removedIds = new Set(removed.map(card => card.id)), message = `${attacker.name}发动【寒冰剑】，防止伤害并弃置${target.name}${removed.length}张牌${lionHeal ? '；白银狮子令其回复 1 点体力' : ''}`
      return { ...base, units: { ...units, [targetId]: { ...iceTarget, hp: lionHeal ? iceTarget.hp + 1 : iceTarget.hp, hand: iceTarget.hand.filter(card => !removedIds.has(card.id)), equipment, animation: lionHeal ? 'heal' : 'hit' } }, discard: [...discard, ...removed], message, history: log(base, message) }
    }
  }
  const emptyHandBonus = attacker.equipment.weapon?.kind === 'gudingBlade' && target.hand.length === 0 ? 1 : 0
  const amount = (attacker.drunk ? 2 : 1) + emptyHandBonus + (attacker.luoyiActive ? 1 : 0)
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
      const duelDamage = working.units[other].luoyiActive ? 2 : 1
      return damage(working, other, current, duelDamage, `${working.units[current].name}未能在【决斗】中出杀，受到 ${duelDamage} 点伤害${duelDamage > 1 ? '（裸衣）' : ''}`)
    }
    const slashIds = new Set(slashes.map(card => card.id))
    const message = `${responder.name}${slashes.length > 1 ? '连续打出两张【杀】响应【无双决斗】' : responseText(responder, slashes[0], 'slash') + '响应【决斗】'}`
    working = { ...working, units: { ...working.units, [current]: { ...responder, hand: responder.hand.filter(c => !slashIds.has(c.id)), animation: 'cast' } }, discard: [...working.discard, ...slashes], message, history: log(working, message) }
    working = triggerLianying(working, current)
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
  const lostEquipment = Object.values(equipment).some(card => card?.id === chosen.id)
  for (const slot of Object.keys(equipment) as (keyof typeof equipment)[]) if (equipment[slot]?.id === chosen.id) delete equipment[slot]
  const lionHeal = chosen.kind === 'silverLion' && target.hp > 0 && target.hp < target.maxHp
  const xiaoji = lostEquipment && target.skills.includes('xiaoji')
  const nextDiscard = gain ? state.discard : [...state.discard, chosen]
  const insight = xiaoji ? drawCards(state.deck, nextDiscard, 2) : { drawn: [] as Card[], deck: state.deck, discard: nextDiscard }
  const message = `${actor.name}使用【${gain ? '顺手牵羊' : '过河拆桥'}】${gain ? '获得' : '弃置'}${target.name}的一张牌${lionHeal ? '；白银狮子令其回复 1 点体力' : ''}${xiaoji ? '；枭姬摸两张牌' : ''}`
  const result: GameState = { ...state,
    units: { ...state.units, [targetId]: { ...target, hp: lionHeal ? target.hp + 1 : target.hp, hand: [...target.hand.filter(card => card.id !== chosen.id), ...insight.drawn], equipment, animation: lionHeal ? 'heal' : xiaoji ? 'cast' : 'hit' }, [actorId]: { ...actor, hand: gain ? [...actor.hand, chosen] : actor.hand } },
    deck: insight.deck, discard: insight.discard, message, history: log(state, message),
  }
  return triggerLianying(result, targetId)
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
      working = triggerLianying(working, targetId)
      continue
    }
    const response = responseCard(target, responseKind)
    const guard = responseKind === 'dodge' && !response ? loyalGuard(working, targetId) : null
    if (response || guard) {
      const message = guard ? `${guard.unit.name}发动【护驾】保护主公` : `${target.name}${responseText(target, response!, responseKind)}响应【${CARD_LABEL[kind]}】`
      working = guard
        ? { ...working, units: { ...working.units, [guard.unit.id]: { ...guard.unit, hand: guard.unit.hand.filter(c => c.id !== guard.dodge.id), animation: 'cast' } }, discard: [...working.discard, guard.dodge], message, history: log(working, message) }
        : { ...working, units: { ...working.units, [targetId]: { ...target, hand: target.hand.filter(c => c.id !== response!.id), animation: 'cast' } }, discard: [...working.discard, response!], message, history: log(working, message) }
      working = triggerLianying(working, targetId)
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
  if (team === 'player' && state.mapObjects.some(object => object.claimed)) {
    const message = '新一轮开始，战场设施已重新补给'
    working = { ...working, mapObjects: working.mapObjects.map(object => ({ ...object, claimed: false })), message, history: log(working, message) }
  }
  if (unit.skills.includes('luoshen')) {
    const gained: Card[] = []
    while (working.deck.length || working.discard.length) {
      const judged = drawCards(working.deck, working.discard, 1), judge = judged.drawn[0]
      if (!judge) break
      working = { ...working, deck: judged.deck, discard: judged.discard }
      if (judge.suit === 'spade' || judge.suit === 'club') gained.push(judge)
      else { working = { ...working, discard: [...working.discard, judge] }; break }
    }
    if (gained.length) {
      unit = { ...unit, hand: [...unit.hand, ...gained], animation: 'cast' }
      const message = `${unit.name}发动【洛神】，连续获得 ${gained.length} 张黑色判定牌`
      working = { ...working, units: { ...working.units, [team]: unit }, message, history: log(working, message) }
    } else {
      const message = `${unit.name}发动【洛神】，首张判定为红色，未获得牌`
      working = { ...working, message, history: log(working, message) }
    }
  }
  if (unit.skills.includes('guanxing') && working.deck.length) {
    const count = Math.min(5, Object.values(working.units).filter(actor => actor.hp > 0).length, working.deck.length)
    const viewed = working.deck.slice(0, count), rest = working.deck.slice(count)
    const hasIndulgence = unit.judgement.some(card => card.kind === 'indulgence'), hasLightning = unit.judgement.some(card => card.kind === 'lightning')
    const priority = (card: Card) => hasIndulgence && card.suit === 'heart' ? -20 : hasLightning && !(card.suit === 'spade' && card.rank >= 2 && card.rank <= 9) ? -15 : card.kind === 'peach' ? 0 : card.kind === 'dodge' ? 1 : card.kind === 'slash' ? 2 : 3
    viewed.sort((a, b) => priority(a) - priority(b))
    const message = `${unit.name}发动【观星】，调整牌堆顶 ${count} 张牌`
    working = { ...working, deck: [...viewed, ...rest], message, history: log(working, message) }
  }
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
    if (owner.skills.includes('tiandu')) {
      const currentOwner = working.units[team]
      working = { ...working, units: { ...working.units, [team]: { ...currentOwner, hand: [...currentOwner.hand, judge], animation: 'cast' } }, history: log(working, `${owner.name}发动【天妒】，获得判定牌`) }
      judgementDiscard = judgementDiscard.filter(card => card.id !== judge.id)
    }
    working = { ...working, deck: judged.deck, discard: [...judged.discard, delayed, ...judgementDiscard] }
    const judgeName = `${judge.suit}${judge.rank}`
    if (delayed.kind === 'indulgence') {
      const failed = judge.suit !== 'heart'; if (failed) skipPlay = true
      const message = `${owner.name}的【乐不思蜀】判定为${judgeName}，${failed ? '跳过出牌阶段' : '判定通过'}`
      working = { ...working, message, history: log(working, message) }
    }
    if (delayed.kind === 'lightning') {
      const hit = judge.suit === 'spade' && judge.rank >= 2 && judge.rank <= 9
      if (hit) {
        const message = `${owner.name}的【闪电】判定为${judgeName}，受到 3 点雷电伤害`
        working = { ...working, message, history: log(working, message), ...elementalDamage(working, team, team, 3, 'thunder') }
      }
      else {
        const opponent = nextSeat(working, team)
        const message = `${owner.name}的【闪电】判定为${judgeName}，传递给${working.units[opponent].name}`
        working = { ...working, units: { ...working.units, [opponent]: { ...working.units[opponent], judgement: [...working.units[opponent].judgement, delayed] } }, discard: working.discard.filter(c => c.id !== delayed.id), message, history: log(working, message) }
      }
    }
  }
  unit = { ...working.units[team], judgement: [] }
  if (working.winner) return { ...working, units: { ...working.units, [team]: unit } }
  let tuxiCount = 0
  if (unit.skills.includes('tuxi')) {
    let units = { ...working.units }, gained: Card[] = []
    for (const target of targetsFor(working, team).filter(candidate => candidate.hand.length).slice(0, 2)) {
      const stolen = units[target.id].hand[0]; if (!stolen) continue
      units = { ...units, [target.id]: { ...units[target.id], hand: units[target.id].hand.slice(1), animation: 'hit' } }
      gained.push(stolen)
    }
    if (gained.length) {
      tuxiCount = gained.length
      unit = { ...unit, hand: [...unit.hand, ...gained], animation: 'cast' }
      units = { ...units, [team]: unit }
      const message = `${unit.name}发动【突袭】，从 ${gained.length} 名角色处各获得一张手牌`
      working = { ...working, units, message, history: log(working, message) }
    }
  }
  const luoyiActive = unit.skills.includes('luoyi')
  const drawCount = tuxiCount ? 0 : luoyiActive ? 1 : unit.skills.includes('yingzi') ? 3 : 2
  const draw = drawCards(working.deck, working.discard, drawCount)
  const refreshed: Unit = { ...unit, hand: [...unit.hand, ...draw.drawn], movement: 3, attacksUsed: 0, wineUsed: false, drunk: false, luoyiActive, rendeGiven: 0, skillUsed: false, animation: 'idle' }
  const drawText = tuxiCount ? `发动【突袭】获得 ${tuxiCount} 张牌` : luoyiActive ? '发动【裸衣】摸一张牌' : drawCount === 3 ? '发动【英姿】摸三张牌' : '摸两张牌'
  const next: GameState = { ...working, units: { ...working.units, [team]: refreshed }, deck: draw.deck, discard: draw.discard, currentUnit: team, phase: team === 'player' ? 'player' : 'ai', turnStage: skipPlay ? 'finish' : 'play', selectedCardId: null, selectedAsSlash: false, selectedAsDismantle: false, selectedAsFanjian: false, selectedAsRende: false, selectedAsGuose: false, lijianMode: false, lijianTargets: [], spearMode: false, spearSelection: [], jijiangSource: null, zhihengMode: false, zhihengSelection: [], discardSelection: [], pathPreview: [], reachable: [], message: skipPlay ? `${refreshed.name}的【乐不思蜀】判定失败，跳过出牌阶段` : `${team === 'player' ? '你的' : refreshed.name}出牌阶段 · ${drawText}`, history: log(working, skipPlay ? `${refreshed.name}跳过出牌阶段` : `${refreshed.name}${drawText}`) }
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
      const maxHp = (GENERAL_BASE_HP[skill] ?? 4) + 1
      set({ generalSelected: true, units: { ...state.units, player: { ...player, ...chosen, hp: maxHp, maxHp } }, message: `已选择${chosen.name}，准备开战` })
      return
    }
    const source = state.units[sourceId]
    set({
      generalSelected: true,
      units: {
        ...state.units,
        player: { ...player, ...chosen, hp: (GENERAL_BASE_HP[skill] ?? 4) + 1, maxHp: (GENERAL_BASE_HP[skill] ?? 4) + 1 },
        [sourceId]: { ...source, ...replacement, hp: GENERAL_BASE_HP[player.skill] ?? 4, maxHp: GENERAL_BASE_HP[player.skill] ?? 4 },
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
      if (object.kind === 'healingShrine' && unit.hp >= unit.maxHp) {
        if (action.unit === 'player') set({ message: '体力已满，无法使用医庐' })
        return
      }
      const draw = object.kind === 'supplyCache' ? drawCards(state.deck, [...state.discard, payment], 2) : { drawn: [] as Card[], deck: state.deck, discard: [...state.discard, payment] }
      const effect = object.kind === 'supplyCache'
        ? { hand: [...unit.hand.filter(card => card.id !== payment.id), ...draw.drawn] }
        : object.kind === 'healingShrine'
          ? { hand: unit.hand.filter(card => card.id !== payment.id), hp: Math.min(unit.maxHp, unit.hp + 1) }
          : { hand: unit.hand.filter(card => card.id !== payment.id), movement: unit.movement + 2, attacksUsed: Math.max(0, unit.attacksUsed - 1) }
      const message = object.kind === 'supplyCache' ? `${unit.name}弃置【${CARD_LABEL[payment.kind]}】开启军需箱，获得两张牌`
        : object.kind === 'healingShrine' ? `${unit.name}献牌使用医庐，回复 1 点体力`
          : `${unit.name}献牌擂响战鼓，获得 2 点移动力并恢复一次出杀机会`
      set({
        units: { ...state.units, [action.unit]: { ...unit, ...effect, animation: object.kind === 'healingShrine' ? 'heal' : 'cast' } },
        mapObjects: state.mapObjects.map(item => item.id === object.id ? { ...item, claimed: true } : item),
        deck: draw.deck, discard: draw.discard, selectedCardId: null, selectedAsSlash: false, selectedAsDismantle: false,
        message, history: log(state, message),
      }); return
    }
    if (action.type === 'PLAY_CARD') {
      const unit = state.units[action.unit]
      if (state.currentUnit !== action.unit || state.turnStage !== 'play') return
      if (action.asRende) {
        const targetId = action.target, gift = unit.hand.find(card => card.id === action.cardId)
        if (!targetId || targetId === action.unit || !gift || !unit.skills.includes('rende') || state.units[targetId].hp <= 0) return
        const target = state.units[targetId], total = unit.rendeGiven + 1
        const heals = unit.rendeGiven < 2 && total >= 2 && unit.hp < unit.maxHp
        const giver = { ...unit, hp: heals ? unit.hp + 1 : unit.hp, hand: unit.hand.filter(card => card.id !== gift.id), rendeGiven: total, animation: heals ? 'heal' as const : 'cast' as const }
        const message = `${unit.name}发动【仁德】，将【${CARD_LABEL[gift.kind]}】交给${target.name}${heals ? '，累计给出两张牌并回复 1 点体力' : ''}`
        set({ units: { ...state.units, [action.unit]: giver, [targetId]: { ...target, hand: [...target.hand, gift], animation: 'cast' } }, selectedCardId: null, selectedAsRende: false, message, history: log(state, message) })
        return
      }
      if (action.asFanjian) {
        const targetId = action.target, gift = unit.hand.find(card => card.id === action.cardId)
        if (!targetId || targetId === action.unit || !gift || !unit.skills.includes('fanjian') || unit.skillUsed || state.units[targetId].hp <= 0) return
        const target = state.units[targetId], suits: Card['suit'][] = ['spade', 'heart', 'club', 'diamond']
        const guessedSuit = suits[(state.turn + state.turnOrder.indexOf(targetId)) % suits.length]
        const transferred: GameState = { ...state, units: { ...state.units, [action.unit]: { ...unit, hand: unit.hand.filter(card => card.id !== gift.id), skillUsed: true, animation: 'cast' }, [targetId]: { ...target, hand: [...target.hand, gift], animation: 'cast' } }, selectedCardId: null, selectedAsFanjian: false }
        const message = `${unit.name}发动【反间】，${target.name}猜${guessedSuit}，展示牌为${gift.suit}${gift.rank}`
        set(guessedSuit === gift.suit ? { ...transferred, message: `${message}，猜中免受伤害`, history: log(transferred, `${message}，猜中`) } : { ...transferred, message, history: log(transferred, message), ...damage(transferred, action.unit, targetId, 1, `${message}，猜错并受到 1 点伤害`) })
        return
      }
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
      const virtualIndulgence = action.asGuose && unit.skills.includes('guose') && card.suit === 'diamond'
      const virtualSlash = !!validJijiang || (action.asSlash && (spearMaterials.length === 2 || (unit.skill === 'wusheng' && (card.suit === 'heart' || card.suit === 'diamond')) || (unit.skill === 'longdan' && card.kind === 'dodge')))
      const kind = virtualSlash ? 'slash' : virtualDismantle ? 'dismantle' : virtualIndulgence ? 'indulgence' : card.kind
      const targetId = action.target ?? primaryTarget(state, action.unit), target = state.units[targetId]
      if (target.skills.includes('qianxun') && (kind === 'snatch' || kind === 'indulgence')) return
      if (kind === 'duel' && target.skills.includes('kongcheng') && target.hand.length === 0) return
      if (kind === 'indulgence' && target.judgement.some(delayed => delayed.kind === 'indulgence')) return
      if (card.kind === 'lightning' && unit.judgement.some(delayed => delayed.kind === 'lightning')) return
      const playedCards = spearMaterials.length === 2 ? spearMaterials : [card]
      const remainingHand = assistant ? unit.hand : spearMaterials.length === 2 ? unit.hand.filter(item => !action.materialIds!.includes(item.id)) : removed.hand
      const unitsAfterPlay = assistant
        ? { ...state.units, [action.unit]: { ...unit, animation: 'cast' as const }, [assistant.id]: { ...assistant, hand: removed.hand, animation: 'cast' as const } }
        : { ...state.units, [action.unit]: { ...unit, hand: remainingHand, animation: 'cast' as const } }
      let base: GameState = { ...state, units: unitsAfterPlay, discard: [...state.discard, ...playedCards], selectedCardId: null, selectedAsSlash: false, selectedAsDismantle: false, selectedAsGuose: false, spearMode: false, spearSelection: [], jijiangSource: null }
      base = triggerLianying(base, assistant?.id ?? action.unit)
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
        const nullified: GameState = { ...base, units: { ...base.units, [targetId]: { ...target, hand: target.hand.filter(c => c.id !== nullify.id), animation: 'cast' } }, discard: [...base.discard, nullify], message, history: log(base, message) }
        set(triggerLianying(nullified, targetId)); return
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
        const slot = card.kind === 'shield' || card.kind === 'bagua' || card.kind === 'silverLion' ? 'armor' : ['redHare', 'dayuan', 'zixing'].includes(card.kind) ? 'offensiveMount' : ['dilu', 'jueying', 'zhaohuang'].includes(card.kind) ? 'defensiveMount' : 'weapon', old = unit.equipment[slot]
        const lionHeal = old?.kind === 'silverLion' && unit.hp < unit.maxHp
        const xiaoji = !!old && unit.skills.includes('xiaoji'), nextDiscard = old ? [...state.discard, old] : state.discard
        const insight = xiaoji ? drawCards(state.deck, nextDiscard, 2) : { drawn: [] as Card[], deck: state.deck, discard: nextDiscard }
        const equipped = { ...unit, hp: lionHeal ? unit.hp + 1 : unit.hp, hand: [...removed.hand, ...insight.drawn], equipment: { ...unit.equipment, [slot]: card }, animation: lionHeal ? 'heal' as const : 'cast' as const }, message = `${unit.name}装备【${CARD_LABEL[card.kind]}】${lionHeal ? '，失去白银狮子并回复 1 点体力' : ''}${xiaoji ? '；发动【枭姬】摸两张牌' : ''}`
        set({ units: { ...state.units, [action.unit]: equipped }, deck: insight.deck, discard: insight.discard, selectedCardId: null, message, history: log(state, message) }); return
      }
      if (kind === 'slash') {
        if (!canSlash(state, unit, target)) return
        if (targetId === 'player' && action.unit !== 'player') {
          const redirected = liuliRedirect(base, action.unit, targetId)
          if (redirected) { set({ ...redirected.state, ...resolveSlash(redirected.state, action.unit, redirected.targetId) }); return }
          const tieqi = judgeTieqi(base, action.unit); base = tieqi.state
          if (tieqi.locked) { set({ ...base, ...resolveSlash(base, action.unit, targetId, null, true) }); return }
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
        const delayed = virtualIndulgence ? { ...card, kind: 'indulgence' as const } : card
        const message = `${unit.name}${virtualIndulgence ? '发动【国色】，将方片牌当' : '将'}【乐不思蜀】置入${target.name}的判定区`
        set({ units: { ...base.units, [targetId]: { ...target, judgement: [...target.judgement, delayed], animation: 'cast' } }, discard: state.discard, message, history: log(state, message) }); return
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
      const keji = player.skills.includes('keji') && player.attacksUsed === 0 && excess > 0
      let turnState = state
      if (state.turnStage !== 'discard' && excess > 0 && !keji) {
        const message = `弃牌阶段 · 请选择 ${excess} 张手牌`
        set({ turnStage: 'discard', discardSelection: [], selectedCardId: null, selectedAsSlash: false, selectedAsDismantle: false, lijianMode: false, lijianTargets: [], spearMode: false, spearSelection: [], jijiangSource: null, zhihengMode: false, zhihengSelection: [], reachable: [], pathPreview: [], message, history: log(state, message) }); return
      }
      if (state.turnStage === 'discard') {
        if (state.discardSelection.length !== excess) return
        const chosen = player.hand.filter(card => state.discardSelection.includes(card.id))
        const message = `${player.name}弃置 ${chosen.length} 张手牌`
        const units = { ...state.units, player: { ...player, hand: player.hand.filter(card => !state.discardSelection.includes(card.id)) } }
        turnState = { ...state, units, discard: [...state.discard, ...chosen], history: log(state, message), message }
      }
      if (keji) {
        const message = `${player.name}发动【克己】，本回合未使用【杀】，跳过弃牌阶段`
        turnState = { ...turnState, message, history: log(turnState, message) }
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
    const card = cardId ? player.hand.find(candidate => candidate.id === cardId && (candidate.kind === pending.required || (pending.effect === 'dying' && player.skills.includes('jijiu') && (candidate.suit === 'heart' || candidate.suit === 'diamond')) || (pending.required === 'slash' && player.skills.includes('wusheng') && (candidate.suit === 'heart' || candidate.suit === 'diamond')) || (player.skill === 'longdan' && ((pending.required === 'dodge' && candidate.kind === 'slash') || (pending.required === 'slash' && candidate.kind === 'dodge'))) || (pending.required === 'dodge' && player.skills.includes('qingguo') && (candidate.suit === 'spade' || candidate.suit === 'club')))) : undefined
    if (cardId && !card) return
    let base: GameState = { ...state, pendingResponse: null }
    if (pending.effect === 'dying') {
      if (card) {
        const player = base.units.player, target = base.units[pending.target]
        const nextHp = target.hp + 1, stillDying = nextHp <= 0
        const rescuedPlayer = { ...player, hand: player.hand.filter(candidate => candidate.id !== card.id), ...(pending.target === 'player' ? { hp: nextHp, animation: 'heal' as const } : {}) }
        const units = { ...base.units, player: rescuedPlayer, [pending.target]: pending.target === 'player' ? rescuedPlayer : { ...target, hp: nextHp, animation: 'heal' as const } }
        const rescueName = card.kind === 'peach' ? '桃' : '急救'
        const message = stillDying
          ? `${player.name}使用【${rescueName}】，${target.name}仍处于濒死状态（体力 ${nextHp}）`
          : pending.target === 'player' ? `${player.name}使用【${rescueName}】自救，回复至 1 点体力` : `${player.name}对${target.name}使用【${rescueName}】，将其救回至 1 点体力`
        const requiredCount = Math.max(0, 1 - nextHp)
        base = { ...base, units, discard: [...base.discard, card], pendingResponse: stillDying ? { ...pending, requiredCount, prompt: `${target.name}仍需 ${requiredCount} 张【桃】，请继续使用或放弃` } : null, message, history: log(base, message) }
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
      const applyUnderlying = (working: GameState): GameState => {
        if (pending.trick === 'arrows' || pending.trick === 'barbarians') {
          const required = pending.trick === 'arrows' ? 'dodge' : 'slash'
          const prompt = `${working.units[pending.source].name}使用【${CARD_LABEL[pending.trick]}】，请打出【${CARD_LABEL[required]}】响应`
          return { ...working, pendingResponse: { effect: pending.trick, source: pending.source, target: 'player', required, prompt }, message: prompt, history: log(working, prompt) }
        }
        if (pending.trick === 'duel') return { ...working, ...continueDuel(working, 'player', pending.source) }
        if (pending.trick === 'indulgence') {
          const delayed = working.discard.find(candidate => candidate.id === pending.originCardId)
          if (delayed) {
            const player = working.units.player, message = `${working.units[pending.source].name}将【乐不思蜀】置入${player.name}的判定区`
            return { ...working, units: { ...working.units, player: { ...player, judgement: [...player.judgement, delayed], animation: 'cast' } }, discard: working.discard.filter(candidate => candidate.id !== delayed.id), message, history: log(working, message) }
          }
        }
        if (pending.trick === 'dismantle' || pending.trick === 'snatch') return { ...working, ...takeTargetCard(working, pending.source, 'player', pending.trick === 'snatch') }
        if (pending.trick === 'borrowedSword') return { ...working, ...resolveBorrowedSword(working, pending.source, 'player') }
        if (pending.trick === 'fireAttack') return { ...working, ...resolveFireAttack(working, pending.source, 'player') }
        if (pending.trick === 'ironChain') return { ...working, ...resolveIronChain(working, pending.source, 'player') }
        return working
      }
      if (card) {
        const player = base.units.player, message = `${player.name}打出【无懈可击】，抵消【${CARD_LABEL[pending.trick!]}】`
        base = { ...base, units: { ...base.units, player: { ...player, hand: player.hand.filter(candidate => candidate.id !== card.id), animation: 'cast' } }, discard: [...base.discard, card], message, history: log(base, message) }
        const source = base.units[pending.source], counter = source.hand.find(candidate => candidate.kind === 'nullify')
        if (counter) {
          const counterMessage = `${source.name}打出【无懈可击】，反制${player.name}的【无懈可击】`
          base = { ...base, units: { ...base.units, [pending.source]: { ...source, hand: source.hand.filter(candidate => candidate.id !== counter.id), animation: 'cast' } }, discard: [...base.discard, counter], message: counterMessage, history: log(base, counterMessage) }
          const another = base.units.player.hand.some(candidate => candidate.kind === 'nullify')
          if (another) {
            const prompt = `${source.name}反制了你的【无懈可击】，是否再次打出【无懈可击】？`
            base = { ...base, pendingResponse: { ...pending, prompt }, message: prompt, history: log(base, prompt) }
          } else base = applyUnderlying(base)
        }
      } else base = applyUnderlying(base)
      set(base)
      if (base.phase === 'ai' && !base.winner && !base.pendingResponse) setTimeout(() => void get().runAI(), 120)
      return
    }
    if (pending.effect === 'duel') {
      if (card) {
        const player = base.units.player
        const responseMessage = `${player.name}${responseText(player, card, 'slash')}响应【决斗】`
        if ((pending.requiredCount ?? 1) > 1) {
          const remaining = (pending.requiredCount ?? 1) - 1, prompt = `【无双决斗】还需打出 ${remaining} 张【杀】`
          base = { ...base, units: { ...base.units, player: { ...player, hand: player.hand.filter(candidate => candidate.id !== card.id), animation: 'cast' } }, discard: [...base.discard, card], pendingResponse: { ...pending, requiredCount: remaining, prompt }, message: prompt, history: log(base, responseMessage) }
          base = triggerLianying(base, 'player')
          set(base); return
        }
        base = { ...base, units: { ...base.units, player: { ...player, hand: player.hand.filter(candidate => candidate.id !== card.id), animation: 'cast' } }, discard: [...base.discard, card], message: responseMessage, history: log(base, responseMessage) }
        base = { ...base, ...continueDuel(base, pending.source, 'player') }
      } else {
        const duelDamage = base.units[pending.source].luoyiActive ? 2 : 1
        base = { ...base, ...damage(base, pending.source, 'player', duelDamage, `${base.units.player.name}未能在【决斗】中出杀，受到 ${duelDamage} 点伤害${duelDamage > 1 ? '（裸衣）' : ''}`) }
      }
      set(base)
      if (base.phase === 'ai' && !base.winner && !base.pendingResponse) setTimeout(() => void get().runAI(), 120)
      return
    }
    if (pending.effect === 'slash' && card && (pending.requiredCount ?? 1) > 1) {
      const player = base.units.player, remaining = (pending.requiredCount ?? 1) - 1
      const prompt = `【无双】还需打出 ${remaining} 张【闪】，或放弃并承受伤害`
      base = { ...base, units: { ...base.units, player: { ...player, hand: player.hand.filter(candidate => candidate.id !== card.id), animation: 'cast' } }, discard: [...base.discard, card], pendingResponse: { ...pending, requiredCount: remaining, prompt }, message: prompt, history: log(base, `${player.name}为【无双】打出第一张【闪】`) }
      base = triggerLianying(base, 'player')
      set(base); return
    }
    if (card) {
      const player = base.units.player
      const response = pending.required === 'slash' || pending.required === 'dodge' ? responseText(player, card, pending.required) : `打出【${CARD_LABEL[card.kind]}】`
      const message = `${player.name}${response}响应【${CARD_LABEL[pending.effect]}】`
      base = { ...base, units: { ...base.units, player: { ...player, hand: player.hand.filter(candidate => candidate.id !== card.id), animation: 'cast' } }, discard: [...base.discard, card], message, history: log(base, message) }
      base = triggerLianying(base, 'player')
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
    if (!id) { set({ selectedCardId: null, selectedAsSlash: false, selectedAsDismantle: false, selectedAsRende: false, selectedAsGuose: false, lijianMode: false, lijianTargets: [], spearMode: false, spearSelection: [], jijiangSource: null, zhihengMode: false, zhihengSelection: [], message: '已取消选牌' }); return }
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
    if (card.kind === 'dodge' && !state.units.player.skills.includes('lijian') && !(state.units.player.skill === 'qixi' && (card.suit === 'spade' || card.suit === 'club'))) { set({ message: '【闪】在响应窗口中打出' }); return }
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
  activateQingnang: () => {
    const state = get(), healer = state.units.player
    if (state.phase !== 'player' || state.turnStage !== 'play' || !healer.skills.includes('qingnang') || healer.skillUsed || !state.selectedCardId) return
    const payment = healer.hand.find(card => card.id === state.selectedCardId); if (!payment) return
    const candidates = Object.values(state.units).filter(unit => unit.hp > 0 && unit.hp < unit.maxHp && (unit.id === 'player' || unit.identity === 'loyalist'))
    const target = candidates.sort((a, b) => (b.maxHp - b.hp) - (a.maxHp - a.hp))[0]
    if (!target) { set({ message: '没有可由【青囊】治疗的友方角色' }); return }
    const updatedHealer = { ...healer, hand: healer.hand.filter(card => card.id !== payment.id), skillUsed: true, animation: 'cast' as const }
    const units = { ...state.units, player: updatedHealer, [target.id]: { ...(target.id === 'player' ? updatedHealer : target), hp: target.hp + 1, animation: 'heal' as const } }
    const message = `${healer.name}发动【青囊】，弃置【${CARD_LABEL[payment.kind]}】令${target.name}回复 1 点体力`
    set({ units, discard: [...state.discard, payment], selectedCardId: null, message, history: log(state, message) })
  },
  activateFanjian: () => {
    const state = get(), player = state.units.player
    if (state.phase !== 'player' || state.turnStage !== 'play' || !player.skills.includes('fanjian') || player.skillUsed || !state.selectedCardId) return
    const active = !state.selectedAsFanjian
    set({ selectedAsFanjian: active, selectedAsSlash: false, selectedAsDismantle: false, message: active ? '【反间】请选择一名其他角色' : '已取消反间' })
  },
  activateJieyin: () => {
    const state = get(), player = state.units.player
    if (state.phase !== 'player' || state.turnStage !== 'play' || !player.skills.includes('jieyin') || player.skillUsed || player.hp >= player.maxHp || player.hand.length < 2) return
    const target = Object.values(state.units).filter(unit => unit.id !== 'player' && unit.hp > 0 && unit.hp < unit.maxHp && unit.gender === 'male').sort((a, b) => (a.identity === 'loyalist' ? -1 : 1) - (b.identity === 'loyalist' ? -1 : 1))[0]
    if (!target) { set({ message: '没有可发动【结姻】的受伤男性角色' }); return }
    const paid = player.hand.slice(0, 2), message = `${player.name}发动【结姻】，与${target.name}各回复 1 点体力`
    set({ units: { ...state.units, player: { ...player, hp: player.hp + 1, hand: player.hand.slice(2), skillUsed: true, animation: 'heal' }, [target.id]: { ...target, hp: target.hp + 1, animation: 'heal' } }, discard: [...state.discard, ...paid], message, history: log(state, message) })
  },
  activateRende: () => {
    const state = get(), player = state.units.player
    if (state.phase !== 'player' || state.turnStage !== 'play' || !player.skills.includes('rende') || !state.selectedCardId) return
    const active = !state.selectedAsRende
    set({ selectedAsRende: active, selectedAsSlash: false, selectedAsDismantle: false, selectedAsFanjian: false, message: active ? '【仁德】请选择一名其他角色获得此牌' : '已取消仁德' })
  },
  activateKurou: () => {
    const state = get(), player = state.units.player
    if (state.phase !== 'player' || state.turnStage !== 'play' || !player.skills.includes('kurou') || player.hp <= 0) return
    const draw = drawCards(state.deck, state.discard, 2)
    const message = `${player.name}发动【苦肉】，失去 1 点体力并摸两张牌`
    const drawnState: GameState = { ...state, units: { ...state.units, player: { ...player, hand: [...player.hand, ...draw.drawn], animation: 'cast' } }, deck: draw.deck, discard: draw.discard, message, history: log(state, message) }
    set({ ...drawnState, ...damage(drawnState, 'player', 'player', 1, message) })
  },
  activateGuose: () => {
    const state = get(), card = state.units.player.hand.find(item => item.id === state.selectedCardId)
    if (state.phase !== 'player' || state.turnStage !== 'play' || !state.units.player.skills.includes('guose') || !card || card.suit !== 'diamond') return
    const active = !state.selectedAsGuose
    set({ selectedAsGuose: active, selectedAsSlash: false, selectedAsDismantle: false, selectedAsFanjian: false, selectedAsRende: false, message: active ? '【国色】将方片牌当【乐不思蜀】，请选择目标' : '已取消国色' })
  },
  activateLijian: () => {
    const state = get(), player = state.units.player
    if (state.phase !== 'player' || state.turnStage !== 'play' || !player.skills.includes('lijian') || player.skillUsed || !state.selectedCardId) return
    const targets = Object.values(state.units).filter(unit => unit.id !== 'player' && unit.hp > 0 && unit.gender === 'male')
    if (targets.length < 2) { set({ message: '场上没有两名可发动【离间】的男性角色' }); return }
    const active = !state.lijianMode
    set({ lijianMode: active, lijianTargets: [], selectedAsSlash: false, selectedAsDismantle: false, selectedAsFanjian: false, selectedAsRende: false, selectedAsGuose: false, message: active ? '【离间】请选择第一名男性角色' : '已取消离间' })
  },
  selectLijianTarget: team => {
    const state = get(), player = state.units.player, target = state.units[team]
    if (!state.lijianMode || !state.selectedCardId || team === 'player' || target.hp <= 0 || target.gender !== 'male' || state.lijianTargets.includes(team)) return
    if (!state.lijianTargets.length) { set({ lijianTargets: [team], message: `已选择${target.name}，请再选择一名男性角色` }); return }
    const payment = player.hand.find(card => card.id === state.selectedCardId)
    if (!payment) return
    const duelist = state.units[state.lijianTargets[0]], challenged = target
    const message = `${player.name}发动【离间】，弃置一张牌，令${duelist.name}视为对${challenged.name}使用【决斗】`
    const lijianState: GameState = {
      ...state,
      units: { ...state.units, player: { ...player, hand: player.hand.filter(card => card.id !== payment.id), skillUsed: true, animation: 'cast' } },
      discard: [...state.discard, payment], selectedCardId: null, lijianMode: false, lijianTargets: [], message, history: log(state, message),
    }
    set({ ...lijianState, ...continueDuel(lijianState, challenged.id, duelist.id) })
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
    for (const kind of ['peach', 'drawTwo', 'harvest', 'peachGarden', 'shield', 'bagua', 'silverLion', 'qinggang', 'greenDragon', 'crossbow', 'spear', 'axe', 'halberd', 'qilinBow', 'gudingBlade', 'vermilionFan', 'doubleSword', 'iceSword', 'redHare', 'dayuan', 'zixing', 'dilu', 'jueying', 'zhaohuang', 'lightning', 'wine'] as const) {
      state = get(); ai = state.units[aiId]
      const card = ai.hand.find(c => c.kind === kind)
      if (!card || (kind === 'peach' && ai.hp === ai.maxHp) || (kind === 'peachGarden' && ai.hp === ai.maxHp) || (kind === 'wine' && !responseCard(ai, 'slash'))) continue
      get().dispatch({ type: 'PLAY_CARD', unit: aiId, cardId: card.id }); await wait(280)
      if (get().pendingResponse) return
    }
    state = get(); ai = state.units[aiId]
    if (ai.skills.includes('fanjian') && !ai.skillUsed && ai.hand.length) {
      const victim = targetsFor(state, aiId)[0], gift = ai.hand.find(card => card.kind !== 'peach' && card.kind !== 'dodge') ?? ai.hand[0]
      if (victim && gift) {
        get().dispatch({ type: 'PLAY_CARD', unit: aiId, cardId: gift.id, target: victim.id, asFanjian: true })
        await wait(280); state = get(); ai = state.units[aiId]
      }
    }
    if (ai.skills.includes('rende') && ai.hand.length) {
      const companion = alliesFor(state, aiId).filter(unit => unit.id !== aiId).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
      const gifts = [...ai.hand].sort(card => card.kind === 'peach' ? 1 : card.kind === 'dodge' ? 0 : -1).slice(0, 2)
      if (companion) for (const gift of gifts) {
        get().dispatch({ type: 'PLAY_CARD', unit: aiId, cardId: gift.id, target: companion.id, asRende: true })
        await wait(140); state = get(); ai = state.units[aiId]
      }
    }
    if (ai.skills.includes('lijian') && !ai.skillUsed && ai.hand.length) {
      const prioritized = [...targetsFor(state, aiId), ...Object.values(state.units).filter(unit => unit.id !== aiId)]
      const males = prioritized.filter((unit, index, list) => unit.hp > 0 && unit.gender === 'male' && list.findIndex(candidate => candidate.id === unit.id) === index)
      const payment = ai.hand.find(card => card.kind !== 'peach' && card.kind !== 'dodge') ?? ai.hand[0]
      if (males.length >= 2 && payment) {
        const [duelist, challenged] = males, message = `${ai.name}发动【离间】，弃置一张牌，令${duelist.name}视为对${challenged.name}使用【决斗】`
        const lijianState: GameState = { ...state, units: { ...state.units, [aiId]: { ...ai, hand: ai.hand.filter(card => card.id !== payment.id), skillUsed: true, animation: 'cast' } }, discard: [...state.discard, payment], message, history: log(state, message) }
        set({ ...lijianState, ...continueDuel(lijianState, challenged.id, duelist.id) })
        await wait(280); state = get(); ai = state.units[aiId]
        if (state.pendingResponse || state.winner) return
      }
    }
    if (ai.skills.includes('qingnang') && !ai.skillUsed && ai.hand.length) {
      const patient = alliesFor(state, aiId).filter(unit => unit.hp < unit.maxHp).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
      const payment = ai.hand.find(card => card.kind !== 'peach' && card.kind !== 'dodge') ?? ai.hand[0]
      if (patient && payment) {
        const message = `${ai.name}发动【青囊】，弃置【${CARD_LABEL[payment.kind]}】令${patient.name}回复 1 点体力`
        const healer = { ...ai, hand: ai.hand.filter(card => card.id !== payment.id), skillUsed: true, animation: 'cast' as const }
        const units = patient.id === aiId ? { ...state.units, [aiId]: { ...healer, hp: healer.hp + 1, animation: 'heal' as const } } : { ...state.units, [aiId]: healer, [patient.id]: { ...patient, hp: patient.hp + 1, animation: 'heal' as const } }
        set({ units, discard: [...state.discard, payment], message, history: log(state, message) })
        await wait(280); state = get(); ai = state.units[aiId]
      }
    }
    if (ai.skills.includes('zhiheng') && !ai.skillUsed && ai.hand.length) {
      const lacksSlash = !responseCard(ai, 'slash')
      const exchange = ai.hand.filter(card => card.kind !== 'peach' && card.kind !== 'dodge' && card.kind !== 'slash').slice(0, ai.hand.length > ai.hp ? 2 : lacksSlash ? 1 : 0)
      if (exchange.length) {
        const exchangeIds = new Set(exchange.map(card => card.id)), draw = drawCards(state.deck, [...state.discard, ...exchange], exchange.length)
        const message = `${ai.name}发动【制衡】，弃置并重摸 ${exchange.length} 张牌`
        set({ units: { ...state.units, [aiId]: { ...ai, hand: [...ai.hand.filter(card => !exchangeIds.has(card.id)), ...draw.drawn], skillUsed: true, animation: 'cast' } }, deck: draw.deck, discard: draw.discard, message, history: log(state, message) })
        await wait(280); state = get(); ai = state.units[aiId]
      }
    }
    if (ai.skills.includes('jieyin') && !ai.skillUsed && ai.hp < ai.maxHp && ai.hand.length >= 2) {
      const companion = alliesFor(state, aiId).filter(unit => unit.id !== aiId && unit.gender === 'male' && unit.hp < unit.maxHp).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
      if (companion) {
        const paid = [...ai.hand].sort(card => card.kind === 'peach' ? 1 : card.kind === 'dodge' ? 0 : -1).slice(0, 2), paidIds = new Set(paid.map(card => card.id))
        const message = `${ai.name}发动【结姻】，弃置两张牌，与${companion.name}各回复 1 点体力`
        set({ units: { ...state.units, [aiId]: { ...ai, hp: ai.hp + 1, hand: ai.hand.filter(card => !paidIds.has(card.id)), skillUsed: true, animation: 'heal' }, [companion.id]: { ...companion, hp: companion.hp + 1, animation: 'heal' } }, discard: [...state.discard, ...paid], message, history: log(state, message) })
        await wait(280); state = get(); ai = state.units[aiId]
      }
    }
    if (ai.skills.includes('kurou') && ai.hp > 2) {
      const draw = drawCards(state.deck, state.discard, 2), message = `${ai.name}发动【苦肉】，失去 1 点体力并摸两张牌`
      const drawnState: GameState = { ...state, units: { ...state.units, [aiId]: { ...ai, hand: [...ai.hand, ...draw.drawn], animation: 'cast' } }, deck: draw.deck, discard: draw.discard, message, history: log(state, message) }
      set({ ...drawnState, ...damage(drawnState, aiId, aiId, 1, message) })
      await wait(280); state = get(); ai = state.units[aiId]
    }
    const cache = state.mapObjects.find(item => !item.claimed && (item.kind !== 'healingShrine' || ai.hp < ai.maxHp) && Math.abs(ai.position.x - item.position.x) + Math.abs(ai.position.y - item.position.y) <= 1)
    const payment = ai.hand.find(card => card.kind === 'dodge' || card.kind === 'slash') ?? ai.hand[ai.hand.length - 1]
    if (cache && payment) {
      get().dispatch({ type: 'INTERACT', unit: aiId, objectId: cache.id, cardId: payment.id }); await wait(320)
      state = get(); ai = state.units[aiId]
    }
    let target = targetsFor(state, aiId)[0]
    if (!target) return
    const aggressive = responseCard(ai, 'slash')
    if (!aggressive || !canSlash(state, ai, target)) {
      const destinations = aggressive ? [{ x: target.position.x + 1, y: target.position.y }, { x: target.position.x - 1, y: target.position.y }, { x: target.position.x, y: target.position.y + 1 }, { x: target.position.x, y: target.position.y - 1 }] : [state.controlPoint]
      let best: Position[] = []
      for (const destination of destinations) { const path = findPath(state, ai.position, destination, aiId); if (path.length && (!best.length || pathCost(state, path) < pathCost(state, best))) best = path }
      if (best.length) { let cost = 0, destination = ai.position; for (const p of best) { const step = pathCost(state, [p]); if (cost + step > ai.movement) break; cost += step; destination = p } get().dispatch({ type: 'MOVE', unit: aiId, to: destination }); await wait(500) }
    }
    state = get(); ai = state.units[aiId]; target = targetsFor(state, aiId)[0]
    if (!target) return
    for (const kind of ['ironChain', 'fireAttack', 'indulgence', 'dismantle', 'snatch', 'borrowedSword', 'arrows', 'barbarians', 'duel', 'slash'] as const) {
      const card = kind === 'slash' ? responseCard(ai, 'slash') : kind === 'dismantle' ? ai.hand.find(c => c.kind === 'dismantle') ?? (ai.skills.includes('qixi') ? ai.hand.find(c => c.suit === 'spade' || c.suit === 'club') : undefined) : ai.hand.find(c => c.kind === kind); if (!card) continue
      if (kind === 'borrowedSword') target = targetsFor(state, aiId).find(unit => !!unit.equipment.weapon) ?? target
      if (kind === 'borrowedSword' && !target.equipment.weapon) continue
      if (kind === 'slash' && !canSlash(state, ai, target)) continue
      if (kind === 'snatch' && !ai.skills.includes('qicai') && combatDistance(state, ai, target) > 1) continue
      get().dispatch({ type: 'PLAY_CARD', unit: aiId, cardId: card.id, target: target.id, asSlash: kind === 'slash' && card.kind !== 'slash', asDismantle: kind === 'dismantle' && card.kind !== 'dismantle' }); await wait(420); state = get(); ai = state.units[aiId]
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

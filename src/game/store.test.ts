import { beforeEach, describe, expect, it } from 'vitest'
import type { Card } from '../types'
import { createInitialState } from './rules'
import { beginTurn, useGameStore } from './store'

let nextId = 0
const card = (kind: Card['kind'], suit: Card['suit'] = 'spade', rank = 7): Card => ({ id: `scenario-${++nextId}`, kind, suit, rank })

describe('standard card scenarios', () => {
  beforeEach(() => useGameStore.setState(createInitialState(Array.from({ length: 24 }, () => card('slash')))))

  it('swaps the selected general into the player seat without changing identities', () => {
    const before = useGameStore.getState()
    const playerHand = before.units.player.hand, northHand = before.units.north.hand
    useGameStore.getState().selectGeneral('longdan')
    const state = useGameStore.getState()
    expect(state.generalSelected).toBe(true)
    expect(state.units.player).toMatchObject({ name: '赵云', skill: 'longdan', identity: 'lord', hp: 5, maxHp: 5 })
    expect(state.units.north).toMatchObject({ name: '关羽', skill: 'wusheng', identity: 'loyalist', hp: 4, maxHp: 4 })
    expect(state.units.player.skills).toEqual(['longdan'])
    expect(state.units.player.hand).toEqual(playerHand)
    expect(state.units.north.hand).toEqual(northHand)
  })

  it('selects a new general who is not already seated', () => {
    useGameStore.getState().selectGeneral('paoxiao')
    const state = useGameStore.getState()
    expect(state.generalSelected).toBe(true)
    expect(state.units.player).toMatchObject({ name: '张飞', skill: 'paoxiao', identity: 'lord', hp: 5, maxHp: 5 })
    expect(state.units.north.name).toBe('赵云')
  })

  it('requires the player to choose overflow cards during the discard phase', () => {
    const hand = Array.from({ length: 7 }, (_, index) => card(index % 2 ? 'slash' : 'dodge'))
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hand, position: { x: 4, y: 7 } } } }))
    useGameStore.getState().dispatch({ type: 'END_TURN' })
    let state = useGameStore.getState()
    expect(state.phase).toBe('player')
    expect(state.turnStage).toBe('discard')
    expect(state.currentUnit).toBe('player')

    useGameStore.getState().toggleDiscard(hand[0].id)
    useGameStore.getState().toggleDiscard(hand[1].id)
    useGameStore.getState().toggleDiscard(hand[2].id)
    state = useGameStore.getState()
    expect(state.discardSelection).toEqual([hand[0].id, hand[1].id])

    useGameStore.getState().dispatch({ type: 'END_TURN' })
    state = useGameStore.getState()
    expect(state.currentUnit).toBe('north')
    expect(state.units.player.hand).toHaveLength(5)
    expect(state.discard.map(discarded => discarded.id)).toEqual(expect.arrayContaining([hand[0].id, hand[1].id]))
    expect(state.discardSelection).toEqual([])
  })

  it('lets a player-selected Zhao Yun use dodge as slash', () => {
    useGameStore.getState().selectGeneral('longdan')
    const dodge = card('dodge', 'diamond')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [dodge] }, north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [] } } }))
    useGameStore.getState().selectCard(dodge.id)
    expect(useGameStore.getState()).toMatchObject({ selectedCardId: dodge.id, selectedAsSlash: true })
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: dodge.id, target: 'north', asSlash: true })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.player.attacksUsed).toBe(1)
    expect(state.discard).toContainEqual(dodge)
  })

  it('lets Zhang Fei use multiple slashes through Paoxiao', () => {
    useGameStore.getState().selectGeneral('paoxiao')
    const first = card('slash', 'heart'), second = card('slash', 'club')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [first, second] }, north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: first.id, target: 'north' })
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: second.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(2)
    expect(state.units.player.attacksUsed).toBe(2)
  })

  it('lets a Shu lord borrow slash from a Shu loyalist through Jijiang', () => {
    const offered = card('slash', 'diamond')
    useGameStore.setState(state => ({
      deck: [card('peach', 'heart')],
      units: { ...state.units, player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [] }, north: { ...state.units.north, hand: [offered] }, east: { ...state.units.east, position: { x: 4, y: 2 }, hand: [] } },
    }))
    useGameStore.getState().activateJijiang()
    let state = useGameStore.getState()
    expect(state.jijiangSource).toBe('north')
    expect(state.selectedAsSlash).toBe(true)
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: offered.id, target: 'east', asSlash: true, lordAssist: 'north' })
    state = useGameStore.getState()
    expect(state.units.east.hp).toBe(3)
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.units.player.attacksUsed).toBe(1)
    expect(state.discard).toContainEqual(offered)
    expect(state.jijiangSource).toBeNull()
  })

  it('lets Huang Yueying draw through Jizhi after using an instant trick', () => {
    useGameStore.getState().selectGeneral('jizhi')
    const trick = card('drawTwo'), insight = card('peach', 'heart'), bonusA = card('slash'), bonusB = card('dodge')
    useGameStore.setState(state => ({ deck: [insight, bonusA, bonusB], discard: [], units: { ...state.units, player: { ...state.units.player, hand: [trick] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: trick.id })
    const state = useGameStore.getState()
    expect(state.units.player.hand.map(item => item.id)).toEqual([insight.id, bonusA.id, bonusB.id])
    expect(state.history.some(entry => entry.includes('集智'))).toBe(true)
  })

  it('lets Huang Yueying ignore Snatch distance through Qicai', () => {
    useGameStore.getState().selectGeneral('jizhi')
    const snatch = card('snatch'), prize = card('peach')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [snatch] }, north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [prize] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: snatch.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.player.hand).toContainEqual(prize)
    expect(state.units.north.hand).toHaveLength(0)
  })

  it('lets Sima Yi replace an unfavorable judgement through Guicai', () => {
    const state = createInitialState([])
    const indulgence = card('indulgence'), badJudge = card('slash', 'spade'), replacement = card('peach', 'heart'), drawA = card('slash'), drawB = card('dodge')
    state.deck = [badJudge, drawA, drawB]
    state.units.west = { ...state.units.west, hand: [replacement], judgement: [indulgence] }
    const result = beginTurn(state, 'west')
    expect(result.turnStage).toBe('play')
    expect(result.units.west.hand.map(item => item.id)).toEqual([drawA.id, drawB.id])
    expect(result.discard.map(item => item.id)).toEqual(expect.arrayContaining([indulgence.id, badJudge.id, replacement.id]))
    expect(result.history.some(entry => entry.includes('鬼才'))).toBe(true)
  })

  it('lets Cao Cao gain the damage card through Jianxiong', () => {
    useGameStore.getState().selectGeneral('jianxiong')
    const slash = card('slash', 'spade')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: { ...state.units, east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash] }, player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(4)
    expect(state.units.player.hand).toContainEqual(slash)
    expect(state.discard).not.toContainEqual(slash)
    expect(state.message).toContain('奸雄')
  })

  it('lets Guo Jia gain a judgement card and draw two cards after damage', () => {
    useGameStore.getState().selectGeneral('yiji')
    let state = useGameStore.getState()
    expect(state.units.player).toMatchObject({ name: '郭嘉', hp: 4, maxHp: 4, skills: ['tiandu', 'yiji'] })
    const indulgence = card('indulgence'), judge = card('peach', 'heart'), turnA = card('slash'), turnB = card('dodge')
    state.deck = [judge, turnA, turnB]
    state.units.player = { ...state.units.player, judgement: [indulgence], hand: [] }
    const judged = beginTurn(state, 'player')
    expect(judged.units.player.hand).toEqual([judge, turnA, turnB])
    expect(judged.discard).toContainEqual(indulgence)
    expect(judged.discard).not.toContainEqual(judge)

    const attack = card('slash'), legacyA = card('peach'), legacyB = card('drawTwo')
    useGameStore.setState({ ...judged, deck: [legacyA, legacyB], currentUnit: 'east', phase: 'ai', units: { ...judged.units, east: { ...judged.units.east, position: { x: 4, y: 7 }, hand: [attack] }, player: { ...judged.units.player, position: { x: 4, y: 8 }, hand: [] } } })
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: attack.id, target: 'player' })
    useGameStore.getState().respond(null)
    const damaged = useGameStore.getState()
    expect(damaged.units.player.hand).toEqual([legacyA, legacyB])
    expect(damaged.message).toContain('遗计')
  })

  it('triggers Yiji once for each point of damage', () => {
    useGameStore.getState().selectGeneral('yiji')
    const slash = card('slash'), legacy = [card('peach'), card('drawTwo'), card('dodge'), card('duel')]
    useGameStore.setState(state => ({ deck: legacy, discard: [], currentUnit: 'east', phase: 'ai', units: {
      ...state.units,
      east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash], drunk: true },
      player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(2)
    expect(state.units.player.hand).toEqual(legacy)
    expect(state.message).toContain('遗计】2 次')
  })

  it('lets Hua Tuo heal with Qingnang once per turn', () => {
    useGameStore.getState().selectGeneral('qingnang')
    const payment = card('slash')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hp: 2, hand: [payment] } } }))
    useGameStore.getState().selectCard(payment.id)
    useGameStore.getState().activateQingnang()
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(3)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.units.player.skillUsed).toBe(true)
    expect(state.discard).toContainEqual(payment)
  })

  it('lets Hua Tuo treat a red card as peach through Jijiu', () => {
    useGameStore.getState().selectGeneral('qingnang')
    const slash = card('slash', 'spade'), redCard = card('dodge', 'heart')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: { ...state.units, east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash] }, player: { ...state.units.player, position: { x: 4, y: 8 }, hp: 1, hand: [redCard] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().respond(null)
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'dying' })
    useGameStore.getState().respond(redCard.id)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(1)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.message).toContain('急救')
  })

  it('lets Zhou Yu draw three cards through Yingzi', () => {
    useGameStore.getState().selectGeneral('yingzi')
    const first = card('slash'), second = card('dodge'), third = card('peach')
    const state = useGameStore.getState()
    state.deck = [first, second, third]
    state.units.player = { ...state.units.player, hand: [] }
    const result = beginTurn(state, 'player')
    expect(result.units.player.hand).toEqual([first, second, third])
    expect(result.history.some(entry => entry.includes('英姿'))).toBe(true)
  })

  it('lets Zhou Yu give a card and resolve Fanjian suit guessing', () => {
    useGameStore.getState().selectGeneral('yingzi')
    const gift = card('dodge', 'club', 9)
    useGameStore.setState(state => ({ turn: 1, units: { ...state.units, player: { ...state.units.player, hand: [gift] }, east: { ...state.units.east, hand: [] } } }))
    useGameStore.getState().selectCard(gift.id)
    useGameStore.getState().activateFanjian()
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: gift.id, target: 'east', asFanjian: true })
    const state = useGameStore.getState()
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.units.east.hand).toContainEqual(gift)
    expect(state.units.player.skillUsed).toBe(true)
    expect(state.selectedAsFanjian).toBe(false)
    expect(state.message).toContain('反间')
  })

  it('lets Zhuge Liang rearrange top cards through Guanxing', () => {
    useGameStore.getState().selectGeneral('guanxing')
    const low = card('duel', 'spade'), peach = card('peach', 'heart'), dodge = card('dodge', 'club'), slash = card('slash', 'diamond')
    const state = useGameStore.getState()
    state.deck = [low, peach, dodge, slash]
    state.units.player = { ...state.units.player, hand: [] }
    const result = beginTurn(state, 'player')
    expect(result.units.player.hand).toEqual([peach, dodge])
    expect(result.deck[0]).toEqual(slash)
    expect(result.history.some(entry => entry.includes('观星'))).toBe(true)
  })

  it('prevents slash and duel from targeting an empty-handed Zhuge Liang', () => {
    useGameStore.getState().selectGeneral('guanxing')
    const slash = card('slash'), duel = card('duel')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: { ...state.units, east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash, duel] }, player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: duel.id, target: 'player' })
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(4)
    expect(state.units.east.hand).toEqual([slash, duel])
    expect(state.pendingResponse).toBeNull()
  })

  it('lets Zhang Liao replace drawing with Tuxi against two targets', () => {
    useGameStore.getState().selectGeneral('tuxi')
    const northCard = card('dodge'), eastCard = card('peach'), untouched = card('slash'), deckA = card('duel'), deckB = card('drawTwo')
    const state = useGameStore.getState()
    state.deck = [deckA, deckB]
    state.units.player = { ...state.units.player, hand: [] }
    state.units.north = { ...state.units.north, hand: [northCard] }
    state.units.east = { ...state.units.east, hand: [eastCard] }
    state.units.west = { ...state.units.west, hand: [untouched] }
    const result = beginTurn(state, 'player')
    expect(result.units.player.hand).toHaveLength(2)
    expect(result.units.player.hand).toEqual(expect.arrayContaining([eastCard, untouched]))
    expect(result.deck).toEqual([deckA, deckB])
    expect(result.history.some(entry => entry.includes('突袭'))).toBe(true)
  })

  it('lets Xu Chu draw one and add damage through Luoyi', () => {
    useGameStore.getState().selectGeneral('luoyi')
    const drawn = card('slash'), spare = card('dodge')
    const state = useGameStore.getState()
    state.deck = [drawn, spare]
    state.units.player = { ...state.units.player, hand: [] }
    const begun = beginTurn(state, 'player')
    expect(begun.units.player.hand).toEqual([drawn])
    expect(begun.units.player.luoyiActive).toBe(true)
    useGameStore.setState({ ...begun, units: { ...begun.units, player: { ...begun.units.player, position: { x: 4, y: 1 } }, north: { ...begun.units.north, position: { x: 4, y: 0 }, hand: [] } } })
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: drawn.id, target: 'north' })
    expect(useGameStore.getState().units.north.hp).toBe(2)
    expect(useGameStore.getState().history.some(entry => entry.includes('2 点'))).toBe(true)
  })

  it('lets Sun Shangxiang heal herself and a wounded male through Jieyin', () => {
    useGameStore.getState().selectGeneral('jieyin')
    const first = card('slash'), second = card('dodge')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hp: 2, hand: [first, second] }, north: { ...state.units.north, hp: 2, gender: 'male' } } }))
    useGameStore.getState().activateJieyin()
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(3)
    expect(state.units.north.hp).toBe(3)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.units.player.skillUsed).toBe(true)
    expect(state.discard).toEqual(expect.arrayContaining([first, second]))
  })

  it('lets Sun Shangxiang draw two cards when replacing equipment through Xiaoji', () => {
    useGameStore.getState().selectGeneral('jieyin')
    const oldWeapon = card('qinggang'), newWeapon = card('spear'), insightA = card('peach'), insightB = card('dodge')
    useGameStore.setState(state => ({ deck: [insightA, insightB], discard: [], units: { ...state.units, player: { ...state.units.player, hand: [newWeapon], equipment: { weapon: oldWeapon } } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: newWeapon.id })
    const state = useGameStore.getState()
    expect(state.units.player.equipment.weapon).toEqual(newWeapon)
    expect(state.units.player.hand).toEqual([insightA, insightB])
    expect(state.discard).toContainEqual(oldWeapon)
    expect(state.message).toContain('枭姬')
  })

  it('lets Gan Ning convert a black card into Dismantle through Qixi', () => {
    useGameStore.getState().selectGeneral('qixi')
    const material = card('dodge', 'spade'), victimCard = card('peach', 'heart')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hand: [material] }, east: { ...state.units.east, hand: [victimCard] } } }))
    useGameStore.getState().selectCard(material.id)
    useGameStore.getState().activateQixi()
    expect(useGameStore.getState().selectedAsDismantle).toBe(true)
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: material.id, target: 'east', asDismantle: true })
    const state = useGameStore.getState()
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.units.east.hand).toHaveLength(0)
    expect(state.discard.map(item => item.id)).toEqual(expect.arrayContaining([material.id, victimCard.id]))
    expect(state.message).toContain('过河拆桥')
  })

  it('lets Diao Chan draw at the end of her turn through Biyue', () => {
    useGameStore.getState().selectGeneral('biyue')
    const moonCard = card('peach', 'heart'), nextA = card('slash'), nextB = card('dodge')
    useGameStore.setState(state => ({ deck: [moonCard, nextA, nextB], units: { ...state.units, player: { ...state.units.player, position: { x: 4, y: 7 }, hand: [] } } }))
    useGameStore.getState().dispatch({ type: 'END_TURN' })
    const state = useGameStore.getState()
    expect(state.units.player.hand).toContainEqual(moonCard)
    expect(state.history.some(entry => entry.includes('闭月'))).toBe(true)
  })

  it('lets Sun Quan exchange multiple selected cards once through Zhiheng', () => {
    useGameStore.getState().selectGeneral('zhiheng')
    const keep = card('peach'), oldA = card('slash'), oldB = card('dodge'), freshA = card('drawTwo'), freshB = card('duel')
    useGameStore.setState(state => ({ deck: [freshA, freshB], discard: [], units: { ...state.units, player: { ...state.units.player, hand: [keep, oldA, oldB] } } }))
    useGameStore.getState().activateZhiheng()
    useGameStore.getState().selectCard(oldA.id)
    useGameStore.getState().selectCard(oldB.id)
    useGameStore.getState().activateZhiheng()
    const state = useGameStore.getState()
    expect(state.units.player.hand.map(item => item.id)).toEqual([keep.id, freshA.id, freshB.id])
    expect(state.units.player.skillUsed).toBe(true)
    expect(state.zhihengMode).toBe(false)
    expect(state.message).toContain('制衡')
  })

  it('lets Diao Chan discard a card to make two male characters duel through Lijian', () => {
    useGameStore.getState().selectGeneral('biyue')
    const payment = card('dodge')
    useGameStore.setState(state => ({ units: {
      ...state.units,
      player: { ...state.units.player, hand: [payment] },
      north: { ...state.units.north, gender: 'male', hand: [] },
      east: { ...state.units.east, gender: 'male', hand: [] },
    } }))
    useGameStore.getState().selectCard(payment.id)
    useGameStore.getState().activateLijian()
    expect(useGameStore.getState().lijianMode).toBe(true)
    useGameStore.getState().selectLijianTarget('north')
    expect(useGameStore.getState().lijianTargets).toEqual(['north'])
    useGameStore.getState().selectLijianTarget('east')
    const state = useGameStore.getState()
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.units.player.skillUsed).toBe(true)
    expect(state.units.east.hp).toBe(3)
    expect(state.lijianMode).toBe(false)
    expect(state.discard).toContainEqual(payment)
    expect(state.history.some(entry => entry.includes('离间'))).toBe(true)
  })

  it('lets a Wu loyalist Peach rescue Sun Quan for two health through Jiuyuan', () => {
    useGameStore.getState().selectGeneral('zhiheng')
    const slash = card('slash'), peach = card('peach', 'heart')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: {
      ...state.units,
      player: { ...state.units.player, hp: 1, position: { x: 4, y: 8 }, hand: [] },
      east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash] },
      north: { ...state.units.north, identity: 'loyalist', faction: 'wu', hand: [peach] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    expect(useGameStore.getState().pendingResponse).toMatchObject({ required: 'dodge' })
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(2)
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.discard).toContainEqual(peach)
    expect(state.history.some(entry => entry.includes('救援'))).toBe(true)
  })

  it('requires two dodges against Lu Bu Wushuang slash', () => {
    useGameStore.getState().selectGeneral('wushuang')
    const slash = card('slash'), onlyDodge = card('dodge')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [slash] }, north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [onlyDodge] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.north.hand).toContainEqual(onlyDodge)
  })

  it('asks the player for two sequential dodges against Wushuang', () => {
    const slash = card('slash'), first = card('dodge'), second = card('dodge', 'heart')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: { ...state.units, east: { ...state.units.east, skill: 'wushuang', position: { x: 4, y: 7 }, hand: [slash] }, player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [first, second] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    expect(useGameStore.getState().pendingResponse?.requiredCount).toBe(2)
    useGameStore.getState().respond(first.id)
    expect(useGameStore.getState().pendingResponse?.requiredCount).toBe(1)
    useGameStore.getState().respond(second.id)
    const state = useGameStore.getState()
    expect(state.pendingResponse).toBeNull()
    expect(state.units.player.hp).toBe(5)
    expect(state.units.player.hand).toHaveLength(0)
  })

  it('requires two slashes per duel response against Wushuang', () => {
    useGameStore.getState().selectGeneral('wushuang')
    const duel = card('duel'), onlySlash = card('slash')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hand: [duel] }, north: { ...state.units.north, hand: [onlySlash] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: duel.id, target: 'north' })
    expect(useGameStore.getState().units.north.hp).toBe(3)
    expect(useGameStore.getState().units.north.hand).toContainEqual(onlySlash)
  })

  it('uses fire attack by matching the revealed card suit', () => {
    const fire = card('fireAttack', 'spade'), payment = card('slash', 'heart'), revealed = card('dodge', 'heart')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hand: [fire, payment] }, east: { ...state.units.east, hand: [revealed] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: fire.id, target: 'east' })
    const state = useGameStore.getState()
    expect(state.units.east.hp).toBe(3)
    expect(state.units.east.hand).toContainEqual(revealed)
    expect(state.discard.map(item => item.id)).toEqual(expect.arrayContaining([fire.id, payment.id]))
  })

  it('toggles iron chains and transmits elemental damage through linked units', () => {
    const chain = card('ironChain'), fire = card('fireAttack', 'diamond'), payment = card('slash', 'club'), revealed = card('dodge', 'club')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hand: [chain, fire, payment] }, north: { ...state.units.north, chained: true }, east: { ...state.units.east, hand: [revealed] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: chain.id, target: 'east' })
    expect(useGameStore.getState().units.east.chained).toBe(true)
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: fire.id, target: 'east' })
    const state = useGameStore.getState()
    expect(state.units.east.hp).toBe(3)
    expect(state.units.north.hp).toBe(3)
    expect(state.units.east.chained).toBe(false)
    expect(state.units.north.chained).toBe(false)
  })

  it('lets a player-selected Zhao Yun use slash as dodge', () => {
    useGameStore.getState().selectGeneral('longdan')
    const enemySlash = card('slash', 'club'), converted = card('slash', 'heart')
    useGameStore.setState(state => ({
      currentUnit: 'east', phase: 'ai',
      units: { ...state.units, east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [enemySlash] }, player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [converted] }, north: { ...state.units.north, hand: [] } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: enemySlash.id, target: 'player' })
    useGameStore.getState().respond(converted.id)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(5)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.message).toContain('龙胆')
  })

  it('places indulgence into the target judgement area', () => {
    const delayed = card('indulgence', 'heart', 6)
    useGameStore.setState(state => ({
      units: { ...state.units, player: { ...state.units.player, hand: [delayed] }, north: { ...state.units.north, hand: [] } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: delayed.id, target: 'north' })
    expect(useGameStore.getState().units.north.judgement).toEqual([delayed])
    expect(useGameStore.getState().discard.some(c => c.id === delayed.id)).toBe(false)
  })

  it('rejects duplicate delayed tactics in the same judgement area', () => {
    const first = card('indulgence'), duplicate = card('indulgence'), lightning = card('lightning'), duplicateLightning = card('lightning')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hand: [duplicate, lightning, duplicateLightning], judgement: [first] }, north: { ...state.units.north, judgement: [first] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: duplicate.id, target: 'north' })
    expect(useGameStore.getState().units.player.hand).toContainEqual(duplicate)
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: lightning.id })
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: duplicateLightning.id })
    const state = useGameStore.getState()
    expect(state.units.player.judgement.filter(item => item.kind === 'lightning')).toHaveLength(1)
    expect(state.units.player.hand).toContainEqual(duplicateLightning)
  })

  it('passes a missed lightning to the next living seat and records the judgement', () => {
    const lightning = card('lightning'), safeJudge = card('peach', 'heart', 5), drawA = card('slash'), drawB = card('dodge')
    const state = createInitialState([])
    state.deck = [safeJudge, drawA, drawB]
    state.units.player = { ...state.units.player, judgement: [lightning] }
    const result = beginTurn(state, 'player')
    expect(result.units.player.judgement).toHaveLength(0)
    expect(result.units.north.judgement).toContainEqual(lightning)
    expect(result.discard).toContainEqual(safeJudge)
    expect(result.discard).not.toContainEqual(lightning)
    expect(result.history.some(entry => entry.includes('传递给'))).toBe(true)
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

  it('uses a red card as slash through Wusheng in a duel response', () => {
    const duel = card('duel', 'spade'), redCard = card('peach', 'heart'), enemySlash = card('slash', 'club')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: {
      ...state.units,
      player: { ...state.units.player, hand: [redCard] },
      east: { ...state.units.east, hand: [duel, enemySlash] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: duel.id, target: 'player' })
    useGameStore.getState().respond(null)
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'duel', required: 'slash' })
    useGameStore.getState().respond(redCard.id)
    const state = useGameStore.getState()
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.discard).toContainEqual(redCard)
    expect(state.history.some(entry => entry.includes('武圣'))).toBe(true)
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
      units: { ...state.units, east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash] }, player: { ...state.units.player, faction: 'wei', position: { x: 4, y: 8 }, hand: [] }, north: { ...state.units.north, faction: 'wei', hand: [dodge] } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    expect(useGameStore.getState().pendingResponse?.required).toBe('dodge')
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(5)
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.message).toContain('护驾')
  })

  it('does not allow Hujia without matching Wei factions', () => {
    const slash = card('slash'), dodge = card('dodge', 'heart', 2)
    useGameStore.setState(state => ({
      currentUnit: 'east', phase: 'ai',
      units: { ...state.units, east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash] }, player: { ...state.units.player, faction: 'shu', position: { x: 4, y: 8 }, hand: [] }, north: { ...state.units.north, faction: 'shu', hand: [dodge] } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(4)
    expect(state.units.north.hand).toContainEqual(dodge)
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

  it('lets Stone Axe discard two cards to force a hit after dodge', () => {
    const slash = card('slash', 'heart'), axe = card('axe'), costA = card('peach'), costB = card('drawTwo'), dodge = card('dodge')
    useGameStore.setState(state => ({
      units: { ...state.units, player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [slash, costA, costB], equipment: { weapon: axe } }, north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [dodge] } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.discard.map(item => item.id)).toEqual(expect.arrayContaining([slash.id, dodge.id, costA.id, costB.id]))
    expect(state.message).toContain('贯石斧')
  })

  it('lets Qilin Bow discard a mount after slash damage', () => {
    const slash = card('slash', 'heart'), bow = card('qilinBow'), mount = card('dilu')
    useGameStore.setState(state => ({
      units: { ...state.units, player: { ...state.units.player, position: { x: 4, y: 2 }, hand: [slash], equipment: { weapon: bow } }, north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [], equipment: { defensiveMount: mount } } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.north.equipment.defensiveMount).toBeUndefined()
    expect(state.discard).toContainEqual(mount)
    expect(state.message).toContain('麒麟弓')
  })

  it('lets Serpent Spear convert two selected hand cards into slash', () => {
    const spear = card('spear'), materialA = card('peach', 'heart'), materialB = card('drawTwo', 'club')
    useGameStore.setState(state => ({
      units: { ...state.units, player: { ...state.units.player, position: { x: 4, y: 2 }, hand: [materialA, materialB], equipment: { weapon: spear } }, north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [] } },
    }))
    useGameStore.getState().activateSpear()
    useGameStore.getState().selectCard(materialA.id)
    useGameStore.getState().selectCard(materialB.id)
    let state = useGameStore.getState()
    expect(state.spearSelection).toEqual([materialA.id, materialB.id])
    expect(state.selectedAsSlash).toBe(true)
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: materialA.id, target: 'north', asSlash: true, materialIds: state.spearSelection })
    state = useGameStore.getState()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.discard.map(item => item.id)).toEqual(expect.arrayContaining([materialA.id, materialB.id]))
    expect(state.spearMode).toBe(false)
  })

  it('lets Halberd attack up to three targets with the final hand slash', () => {
    const slash = card('slash', 'heart'), halberd = card('halberd')
    useGameStore.setState(state => ({
      deck: [card('peach', 'heart')],
      units: {
        ...state.units,
        player: { ...state.units.player, position: { x: 4, y: 4 }, hand: [slash], equipment: { weapon: halberd } },
        north: { ...state.units.north, position: { x: 4, y: 2 }, hand: [] },
        east: { ...state.units.east, position: { x: 6, y: 4 }, hand: [] },
        west: { ...state.units.west, position: { x: 2, y: 4 }, hand: [] },
      },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.east.hp).toBe(3)
    expect(state.units.west.hp).toBe(3)
    expect(state.units.player.attacksUsed).toBe(1)
    expect(state.message).toContain('方天画戟')
  })

  it('lets Green Dragon Blade chase with another slash after dodge', () => {
    const firstSlash = card('slash', 'heart'), secondSlash = card('slash', 'club'), weapon = card('greenDragon'), dodge = card('dodge')
    useGameStore.setState(state => ({
      units: { ...state.units, player: { ...state.units.player, position: { x: 4, y: 2 }, hand: [firstSlash, secondSlash], equipment: { weapon } }, north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [dodge] } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: firstSlash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.units.player.attacksUsed).toBe(2)
    expect(state.discard.map(item => item.id)).toEqual(expect.arrayContaining([firstSlash.id, secondSlash.id, dodge.id]))
    expect(state.history.some(entry => entry.includes('青龙偃月刀'))).toBe(true)
  })

  it('adds one damage with Guding Blade against an empty hand', () => {
    const slash = card('slash'), weapon = card('gudingBlade')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, position: { x: 4, y: 2 }, hand: [slash], equipment: { weapon } }, north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(2)
    expect(state.message).toContain('古锭刀')
  })

  it('turns slash into chained fire damage with Vermilion Fan', () => {
    const slash = card('slash'), weapon = card('vermilionFan')
    useGameStore.setState(state => ({
      deck: [card('peach', 'heart')],
      units: {
        ...state.units,
        player: { ...state.units.player, position: { x: 4, y: 4 }, hand: [slash], equipment: { weapon } },
        north: { ...state.units.north, position: { x: 4, y: 2 }, hand: [], chained: true },
        east: { ...state.units.east, position: { x: 6, y: 4 }, hand: [], chained: true },
      },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.east.hp).toBe(3)
    expect(state.units.north.chained).toBe(false)
    expect(state.units.east.chained).toBe(false)
  })

  it('triggers Double Sword against an opposite-gender target', () => {
    const slash = card('slash'), weapon = card('doubleSword'), payment = card('peach')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, gender: 'male', position: { x: 4, y: 1 }, hand: [slash], equipment: { weapon } }, north: { ...state.units.north, gender: 'female', position: { x: 4, y: 0 }, hand: [payment] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.units.north.hp).toBe(3)
    expect(state.discard).toContainEqual(payment)
  })

  it('lets Ice Sword prevent damage and discard two target cards', () => {
    const slash = card('slash'), weapon = card('iceSword'), first = card('peach'), second = card('drawTwo')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [slash], equipment: { weapon } }, north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [first, second] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(4)
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.discard.map(item => item.id)).toEqual(expect.arrayContaining([first.id, second.id]))
    expect(state.message).toContain('寒冰剑')
  })

  it('caps high damage at one with Silver Lion', () => {
    const slash = card('slash'), armor = card('silverLion')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [slash], drunk: true }, north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [], equipment: { armor } } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(3)
    expect(state.message).toContain('白银狮子')
  })

  it('heals when Silver Lion is replaced', () => {
    const lion = card('silverLion'), replacement = card('bagua')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hp: 3, hand: [replacement], equipment: { armor: lion } } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: replacement.id })
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(4)
    expect(state.units.player.equipment.armor).toEqual(replacement)
    expect(state.discard).toContainEqual(lion)
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

  it('lets the player use peach to rescue another dying general', () => {
    const slash = card('slash', 'spade'), peach = card('peach', 'heart')
    useGameStore.setState(state => ({
      units: { ...state.units, player: { ...state.units.player, position: { x: 8, y: 3 }, hand: [slash, peach] }, east: { ...state.units.east, position: { x: 8, y: 4 }, hp: 1, hand: [] } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'east' })
    let state = useGameStore.getState()
    expect(state.pendingResponse).toMatchObject({ effect: 'dying', target: 'east', required: 'peach' })
    expect(state.units.east.hp).toBe(0)
    expect(state.units.east.revealed).toBe(false)

    useGameStore.getState().respond(peach.id)
    state = useGameStore.getState()
    expect(state.pendingResponse).toBeNull()
    expect(state.units.east.hp).toBe(1)
    expect(state.units.east.revealed).toBe(false)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.winner).toBeNull()
  })

  it('settles identity rewards after declining to rescue another general', () => {
    const slash = card('slash', 'diamond'), peach = card('peach', 'heart')
    useGameStore.setState(state => ({
      units: { ...state.units, player: { ...state.units.player, position: { x: 8, y: 3 }, hand: [slash, peach] }, east: { ...state.units.east, position: { x: 8, y: 4 }, hp: 1, hand: [] } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'east' })
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.east.hp).toBe(0)
    expect(state.units.east.revealed).toBe(true)
    expect(state.units.player.hand).toHaveLength(4)
    expect(state.units.player.hand).toContainEqual(peach)
    expect(state.message).toContain('击败')
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
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'dying', target: 'north' })
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(0)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.units.player.equipment).toEqual({})
  })

  it('opens an adjacent supply cache by trading one card for two', () => {
    const payment = card('dodge'), rewardA = card('peach'), rewardB = card('slash')
    useGameStore.setState(state => ({
      deck: [rewardA, rewardB], discard: [],
      units: { ...state.units, player: { ...state.units.player, position: { x: 3, y: 8 }, hand: [payment] } },
    }))
    useGameStore.getState().dispatch({ type: 'INTERACT', unit: 'player', objectId: 'south-cache', cardId: payment.id })
    const state = useGameStore.getState()
    expect(state.units.player.hand).toEqual([rewardA, rewardB])
    expect(state.discard).toContainEqual(payment)
    expect(state.mapObjects.find(item => item.id === 'south-cache')?.claimed).toBe(true)
    expect(state.message).toContain('开启军需箱')
  })

  it('cannot open a supply cache from a distance or reuse it', () => {
    const payment = card('dodge'), rewardA = card('peach'), rewardB = card('slash')
    useGameStore.setState(state => ({ deck: [rewardA, rewardB], discard: [], units: { ...state.units, player: { ...state.units.player, hand: [payment] } } }))
    useGameStore.getState().dispatch({ type: 'INTERACT', unit: 'player', objectId: 'north-cache', cardId: payment.id })
    expect(useGameStore.getState().units.player.hand).toEqual([payment])
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, position: { x: 3, y: 8 } } } }))
    useGameStore.getState().dispatch({ type: 'INTERACT', unit: 'player', objectId: 'south-cache', cardId: payment.id })
    const received = useGameStore.getState().units.player.hand
    useGameStore.getState().dispatch({ type: 'INTERACT', unit: 'player', objectId: 'south-cache', cardId: received[0].id })
    expect(useGameStore.getState().units.player.hand).toEqual(received)
  })

  it('uses the healing shrine by sacrificing a card while wounded', () => {
    const payment = card('dodge')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, position: { x: 7, y: 3 }, hp: 2, hand: [payment] } } }))
    useGameStore.getState().dispatch({ type: 'INTERACT', unit: 'player', objectId: 'east-shrine', cardId: payment.id })
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(3)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.discard).toContainEqual(payment)
    expect(state.mapObjects.find(item => item.id === 'east-shrine')?.claimed).toBe(true)
    expect(state.message).toContain('医庐')
  })

  it('does not consume the healing shrine at full health', () => {
    const payment = card('slash')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, position: { x: 7, y: 3 }, hand: [payment] } } }))
    useGameStore.getState().dispatch({ type: 'INTERACT', unit: 'player', objectId: 'east-shrine', cardId: payment.id })
    const state = useGameStore.getState()
    expect(state.units.player.hand).toEqual([payment])
    expect(state.mapObjects.find(item => item.id === 'east-shrine')?.claimed).toBe(false)
  })

  it('uses the war drum to regain movement and a slash opportunity', () => {
    const payment = card('peach')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, position: { x: 1, y: 7 }, movement: 0, attacksUsed: 1, hand: [payment] } } }))
    useGameStore.getState().dispatch({ type: 'INTERACT', unit: 'player', objectId: 'west-drum', cardId: payment.id })
    const state = useGameStore.getState()
    expect(state.units.player.movement).toBe(2)
    expect(state.units.player.attacksUsed).toBe(0)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.mapObjects.find(item => item.id === 'west-drum')?.claimed).toBe(true)
    expect(state.message).toContain('战鼓')
  })

  it('forces an armed target to slash through Borrowed Sword', () => {
    const trick = card('borrowedSword'), weapon = card('qinggang'), forcedSlash = card('slash')
    useGameStore.setState(state => ({ units: {
      ...state.units,
      player: { ...state.units.player, hand: [trick] },
      north: { ...state.units.north, position: { x: 4, y: 1 }, hand: [forcedSlash], equipment: { weapon } },
      east: { ...state.units.east, position: { x: 4, y: 2 }, hand: [] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: trick.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.east.hp).toBe(3)
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.units.north.equipment.weapon).toEqual(weapon)
    expect(state.discard.map(item => item.id)).toEqual(expect.arrayContaining([trick.id, forcedSlash.id]))
  })

  it('takes the weapon when Borrowed Sword target cannot slash', () => {
    const trick = card('borrowedSword'), weapon = card('greenDragon')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hand: [trick] }, north: { ...state.units.north, hand: [], equipment: { weapon } } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: trick.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.equipment.weapon).toBeUndefined()
    expect(state.units.player.hand).toContainEqual(weapon)
    expect(state.message).toContain('获得其')
  })

  it('lets Liu Bei gift cards and heals once when Rende reaches two cards', () => {
    useGameStore.getState().selectGeneral('rende')
    const first = card('dodge'), second = card('slash'), third = card('peach')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hp: 3, hand: [first, second, third] }, north: { ...state.units.north, hand: [] } } }))
    for (const gift of [first, second, third]) {
      useGameStore.getState().selectCard(gift.id)
      useGameStore.getState().activateRende()
      useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: gift.id, target: 'north', asRende: true })
    }
    const state = useGameStore.getState()
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.units.player.hp).toBe(4)
    expect(state.units.player.rendeGiven).toBe(3)
    expect(state.units.north.hand).toEqual([first, second, third])
    expect(state.history.some(entry => entry.includes('累计给出两张牌'))).toBe(true)
  })

  it('resets Liu Bei Rende count at the start of his next turn', () => {
    useGameStore.getState().selectGeneral('rende')
    const state = useGameStore.getState()
    state.units.player = { ...state.units.player, rendeGiven: 3, hand: [] }
    const result = beginTurn(state, 'player')
    expect(result.units.player.rendeGiven).toBe(0)
  })

  it('lets Ma Chao prevent dodge after a red Tieqi judgement', () => {
    useGameStore.getState().selectGeneral('tieqi')
    const slash = card('slash', 'spade'), dodge = card('dodge'), redJudge = card('peach', 'heart', 8)
    useGameStore.setState(state => ({ deck: [redJudge], discard: [], units: { ...state.units, player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [slash] }, north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [dodge] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.north.hand).toContainEqual(dodge)
    expect(state.history.some(entry => entry.includes('不能使用【闪】'))).toBe(true)
  })

  it('allows dodge after a black Tieqi judgement', () => {
    useGameStore.getState().selectGeneral('tieqi')
    const slash = card('slash'), dodge = card('dodge'), blackJudge = card('duel', 'club', 4)
    useGameStore.setState(state => ({ deck: [blackJudge], discard: [], units: { ...state.units, player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [slash] }, north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [dodge] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(4)
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.history.some(entry => entry.includes('判定未生效'))).toBe(true)
  })

  it('lets Huang Gai repeatedly trade health for cards through Kurou', () => {
    useGameStore.getState().selectGeneral('kurou')
    const rewards = [card('slash'), card('dodge'), card('duel'), card('peach')]
    useGameStore.setState(state => ({ deck: rewards, discard: [], units: { ...state.units, player: { ...state.units.player, hp: 3, hand: [] } } }))
    useGameStore.getState().activateKurou()
    useGameStore.getState().activateKurou()
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(1)
    expect(state.units.player.hand).toEqual(rewards)
    expect(state.history.filter(entry => entry.includes('苦肉')).length).toBeGreaterThanOrEqual(2)
  })

  it('opens a dying response after Huang Gai uses Kurou at one health', () => {
    useGameStore.getState().selectGeneral('kurou')
    const peach = card('peach', 'heart'), extra = card('slash')
    useGameStore.setState(state => ({ deck: [peach, extra], discard: [], units: { ...state.units, player: { ...state.units.player, hp: 1, hand: [] } } }))
    useGameStore.getState().activateKurou()
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'dying', target: 'player' })
    useGameStore.getState().respond(peach.id)
    expect(useGameStore.getState().units.player.hp).toBe(1)
    expect(useGameStore.getState().units.player.hand).toEqual([extra])
  })

  it('lets Lu Meng skip discarding through Keji after using no slash', () => {
    useGameStore.getState().selectGeneral('keji')
    const hand = Array.from({ length: 7 }, () => card('dodge'))
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, position: { x: 4, y: 7 }, hand, attacksUsed: 0 } } }))
    useGameStore.getState().dispatch({ type: 'END_TURN' })
    const state = useGameStore.getState()
    expect(state.units.player.hand).toEqual(hand)
    expect(state.discard).toHaveLength(0)
    expect(state.history.some(entry => entry.includes('克己'))).toBe(true)
    expect(state.currentUnit).not.toBe('player')
  })

  it('requires Lu Meng to discard after using a slash', () => {
    useGameStore.getState().selectGeneral('keji')
    const hand = Array.from({ length: 7 }, () => card('dodge'))
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hand, attacksUsed: 1 } } }))
    useGameStore.getState().dispatch({ type: 'END_TURN' })
    const state = useGameStore.getState()
    expect(state.turnStage).toBe('discard')
    expect(state.message).toContain('请选择 2 张手牌')
  })

  it('lets Zhen Ji collect consecutive black judgements through Luoshen', () => {
    useGameStore.getState().selectGeneral('luoshen')
    const blackA = card('duel', 'spade'), blackB = card('slash', 'club'), redStop = card('peach', 'heart'), drawA = card('dodge'), drawB = card('slash')
    const state = useGameStore.getState()
    state.deck = [blackA, blackB, redStop, drawA, drawB]
    state.discard = []
    state.units.player = { ...state.units.player, hand: [] }
    const result = beginTurn(state, 'player')
    expect(result.units.player.hand).toEqual([blackA, blackB, drawA, drawB])
    expect(result.discard).toContainEqual(redStop)
    expect(result.history.some(entry => entry.includes('洛神') && entry.includes('2 张'))).toBe(true)
  })

  it('lets Zhen Ji use a black hand card as dodge through Qingguo', () => {
    useGameStore.getState().selectGeneral('luoshen')
    const slash = card('slash', 'heart'), blackCard = card('duel', 'club')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: { ...state.units, east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash] }, player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [blackCard] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    expect(useGameStore.getState().pendingResponse).toMatchObject({ required: 'dodge' })
    useGameStore.getState().respond(blackCard.id)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(4)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.discard).toContainEqual(blackCard)
    expect(state.history.some(entry => entry.includes('倾国'))).toBe(true)
  })

  it('lets Da Qiao turn a diamond card into Indulgence through Guose', () => {
    useGameStore.getState().selectGeneral('guose')
    const diamond = card('dodge', 'diamond', 6)
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hand: [diamond] }, east: { ...state.units.east, hand: [] } } }))
    useGameStore.getState().selectCard(diamond.id)
    useGameStore.getState().activateGuose()
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: diamond.id, target: 'east', asGuose: true })
    const state = useGameStore.getState()
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.units.east.judgement).toContainEqual({ ...diamond, kind: 'indulgence' })
    expect(state.message).toContain('国色')
  })

  it('lets Da Qiao discard a card to redirect slash through Liuli', () => {
    useGameStore.getState().selectGeneral('guose')
    const slash = card('slash'), payment = card('dodge')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: {
      ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [payment] },
      east: { ...state.units.east, position: { x: 3, y: 8 }, hand: [slash] },
      north: { ...state.units.north, position: { x: 4, y: 7 }, hand: [] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(4)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.units.north.hp).toBe(3)
    expect(state.units.east.attacksUsed).toBe(1)
    expect(state.history.some(entry => entry.includes('流离'))).toBe(true)
  })

  it('protects Lu Xun from Snatch and Indulgence through Qianxun', () => {
    useGameStore.getState().selectGeneral('qianxun')
    const snatch = card('snatch'), indulgence = card('indulgence')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: { ...state.units, east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [snatch, indulgence] }, player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [card('dodge')] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: snatch.id, target: 'player' })
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: indulgence.id, target: 'player' })
    const state = useGameStore.getState()
    expect(state.units.east.hand).toEqual([snatch, indulgence])
    expect(state.units.player.judgement).toHaveLength(0)
  })

  it('draws through Lianying when Lu Xun plays his final hand card', () => {
    useGameStore.getState().selectGeneral('qianxun')
    const trick = card('drawTwo'), rewardA = card('slash'), rewardB = card('dodge'), rewardC = card('peach')
    useGameStore.setState(state => ({ deck: [rewardA, rewardB, rewardC], discard: [], units: { ...state.units, player: { ...state.units.player, hand: [trick] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: trick.id })
    const state = useGameStore.getState()
    expect(state.units.player.hand).toEqual([rewardA, rewardB, rewardC])
    expect(state.history.some(entry => entry.includes('连营'))).toBe(true)
  })

  it('draws through Lianying after Lu Xun responds with his final dodge', () => {
    useGameStore.getState().selectGeneral('qianxun')
    const slash = card('slash'), dodge = card('dodge'), reward = card('peach')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', deck: [reward], discard: [], units: { ...state.units, east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash] }, player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [dodge] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().respond(dodge.id)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(4)
    expect(state.units.player.hand).toEqual([reward])
    expect(state.history.some(entry => entry.includes('连营'))).toBe(true)
  })

  it('lets AI Hua Tuo heal the weakest allied character through Qingnang', async () => {
    const payment = card('nullify')
    useGameStore.setState(state => ({ currentUnit: 'north', phase: 'ai', turnStage: 'play', scores: { ...state.scores, north: 2 }, units: {
      ...state.units,
      north: { ...state.units.north, skill: 'qingnang', skills: ['qingnang', 'jijiu'], position: state.controlPoint, hp: 2, maxHp: 4, hand: [payment] },
    } }))
    await useGameStore.getState().runAI()
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.history.some(entry => entry.includes('青囊'))).toBe(true)
  })

  it('lets AI Sun Quan exchange an unhelpful card through Zhiheng', async () => {
    const oldCard = card('nullify'), freshCard = card('nullify', 'heart')
    useGameStore.setState(state => ({ deck: [freshCard], discard: [], currentUnit: 'north', phase: 'ai', turnStage: 'play', scores: { ...state.scores, north: 2 }, units: {
      ...state.units,
      north: { ...state.units.north, skill: 'zhiheng', skills: ['zhiheng', 'jiuyuan'], position: state.controlPoint, hand: [oldCard] },
    } }))
    await useGameStore.getState().runAI()
    const state = useGameStore.getState()
    expect(state.units.north.skillUsed).toBe(true)
    expect(state.units.north.hand).toContainEqual(freshCard)
    expect(state.history.some(entry => entry.includes('制衡'))).toBe(true)
  })

  it('lets AI Sun Shangxiang heal herself and a wounded male ally through Jieyin', async () => {
    const first = card('nullify'), second = card('nullify', 'heart')
    useGameStore.setState(state => ({ currentUnit: 'north', phase: 'ai', turnStage: 'play', scores: { ...state.scores, north: 2 }, units: {
      ...state.units,
      player: { ...state.units.player, hp: 3 },
      north: { ...state.units.north, skill: 'jieyin', skills: ['jieyin', 'xiaoji'], position: state.controlPoint, hp: 2, maxHp: 3, hand: [first, second] },
    } }))
    await useGameStore.getState().runAI()
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.player.hp).toBe(4)
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.history.some(entry => entry.includes('结姻'))).toBe(true)
  })

  it('lets AI Huang Gai use Kurou while above its safety threshold', async () => {
    const drawA = card('nullify'), drawB = card('nullify', 'heart')
    useGameStore.setState(state => ({ deck: [drawA, drawB], discard: [], currentUnit: 'north', phase: 'ai', turnStage: 'play', scores: { ...state.scores, north: 2 }, units: {
      ...state.units,
      north: { ...state.units.north, skill: 'kurou', skills: ['kurou'], position: state.controlPoint, hp: 4, maxHp: 4, hand: [] },
    } }))
    await useGameStore.getState().runAI()
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.north.hand).toEqual([drawA, drawB])
    expect(state.history.some(entry => entry.includes('苦肉'))).toBe(true)
  })
})

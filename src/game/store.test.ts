import { beforeEach, describe, expect, it } from 'vitest'
import type { Card } from '../types'
import { createInitialState } from './rules'
import { useGameStore } from './store'

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
})

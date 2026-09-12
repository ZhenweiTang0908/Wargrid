import { beforeEach, describe, expect, it } from 'vitest'
import type { Card } from '../types'
import { createInitialState } from './rules'
import { beginTurn, borrowedSwordChoices, greenDragonChoices, targetsFor, useGameStore } from './store'

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
    expect(state.units.player.hand.slice(0, 4)).toEqual(playerHand)
    expect(state.units.player.hand).toHaveLength(6)
    expect(state.deck).toHaveLength(before.deck.length - 2)
    expect(state.units.north.hand).toEqual(northHand)
  })

  it('selects a new general who is not already seated', () => {
    useGameStore.getState().selectGeneral('paoxiao')
    const state = useGameStore.getState()
    expect(state.generalSelected).toBe(true)
    expect(state.units.player).toMatchObject({ name: '张飞', skill: 'paoxiao', identity: 'lord', hp: 5, maxHp: 5 })
    expect(state.units.north.name).toBe('赵云')
  })

  it('runs the first draw phase when choosing the initial lord general', () => {
    const before = useGameStore.getState()
    useGameStore.getState().selectGeneral('wusheng')
    const state = useGameStore.getState()
    expect(state.units.player.hand).toHaveLength(before.units.player.hand.length + 2)
    expect(state.units.player.movement).toBe(3)
    expect(state.turnStage).toBe('play')
    expect(state.message).toContain('摸两张牌')
    useGameStore.getState().selectGeneral('longdan')
    expect(useGameStore.getState().deck).toEqual(state.deck)
    expect(useGameStore.getState().units.player.hand).toEqual(state.units.player.hand)
  })

  it('applies first-turn draw skills during general selection', () => {
    useGameStore.getState().selectGeneral('yingzi')
    expect(useGameStore.getState().units.player.hand).toHaveLength(7)
    useGameStore.getState().dispatch({ type: 'RESTART' })
    useGameStore.getState().selectGeneral('luoyi')
    expect(useGameStore.getState().pendingLuoyi).not.toBeNull()
    useGameStore.getState().chooseLuoyi(true)
    expect(useGameStore.getState().units.player.hand).toHaveLength(5)
    expect(useGameStore.getState().units.player.luoyiActive).toBe(true)
  })

  it('switches maps before selection and keeps the map on restart', () => {
    useGameStore.getState().selectMap('siege')
    expect(useGameStore.getState().mapId).toBe('siege')
    expect(useGameStore.getState().obstacles).toContainEqual({ x: 3, y: 2 })
    useGameStore.getState().selectGeneral('wusheng')
    useGameStore.getState().selectMap('river')
    expect(useGameStore.getState().mapId).toBe('siege')
    useGameStore.getState().dispatch({ type: 'RESTART' })
    expect(useGameStore.getState().mapId).toBe('siege')
    expect(useGameStore.getState().generalSelected).toBe(false)
  })

  it('keeps the highland battlefield when restarting after general selection', () => {
    useGameStore.getState().selectMap('highland')
    expect(useGameStore.getState().mapId).toBe('highland')
    useGameStore.getState().selectGeneral('wusheng')
    useGameStore.getState().dispatch({ type: 'RESTART' })
    expect(useGameStore.getState().mapId).toBe('highland')
    expect(useGameStore.getState().obstacles).toContainEqual({ x: 3, y: 2 })
  })

  it('keeps the wetland battlefield when restarting after general selection', () => {
    useGameStore.getState().selectMap('wetland')
    expect(useGameStore.getState().mapId).toBe('wetland')
    useGameStore.getState().selectGeneral('wusheng')
    useGameStore.getState().dispatch({ type: 'RESTART' })
    expect(useGameStore.getState().mapId).toBe('wetland')
    expect(useGameStore.getState().obstacles).toContainEqual({ x: 3, y: 7 })
  })

  it('switches between standard and expanded card pools before selection and preserves the choice', () => {
    useGameStore.getState().selectDeckMode('expanded')
    let state = useGameStore.getState()
    expect(state.deckMode).toBe('expanded')
    expect(state.deck.length + Object.values(state.units).reduce((total, unit) => total + unit.hand.length, 0)).toBe(116)
    useGameStore.getState().selectGeneral('wusheng')
    useGameStore.getState().selectDeckMode('standard')
    expect(useGameStore.getState().deckMode).toBe('expanded')
    useGameStore.getState().dispatch({ type: 'RESTART' })
    state = useGameStore.getState()
    expect(state.deckMode).toBe('expanded')
    useGameStore.getState().selectDeckMode('standard')
    state = useGameStore.getState()
    expect(state.deckMode).toBe('standard')
    expect(state.deck.length + Object.values(state.units).reduce((total, unit) => total + unit.hand.length, 0)).toBe(108)
  })

  it('does not let lord-side AI see unrevealed identities', () => {
    const state = useGameStore.getState()
    const hidden = { ...state, units: {
      ...state.units,
      north: { ...state.units.north, hp: 1, identity: 'loyalist' as const, revealed: false },
      east: { ...state.units.east, hp: 4, identity: 'rebel' as const, revealed: false },
      west: { ...state.units.west, hp: 3, identity: 'renegade' as const, revealed: false },
    } }
    expect(targetsFor(hidden, 'player')[0].id).toBe('north')
    const scouted = { ...hidden, units: { ...hidden.units, east: { ...hidden.units.east, revealed: true } } }
    expect(targetsFor(scouted, 'player')[0].id).toBe('east')
  })

  it('never lets a loyalist target the public lord or a revealed loyalist', () => {
    const state = useGameStore.getState()
    const informed = { ...state, units: {
      ...state.units,
      north: { ...state.units.north, identity: 'loyalist' as const },
      east: { ...state.units.east, identity: 'loyalist' as const, revealed: true },
      west: { ...state.units.west, identity: 'rebel' as const, revealed: true },
    } }
    expect(targetsFor(informed, 'north').map(unit => unit.id)).toEqual(['west'])
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

  it('starts a turn with four movement on the central road', () => {
    const state = useGameStore.getState()
    state.units.player = { ...state.units.player, position: { x: 4, y: 4 }, movement: 0 }
    const result = beginTurn(state, 'player')
    expect(result.units.player.movement).toBe(4)
    expect(result.message).toContain('官道疾行')
    expect(result.reachable.length).toBeGreaterThan(0)
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
    useGameStore.getState().selectGeneral('rende')
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

  it('lets a Shu lord use Guan Yu red equipment through Jijiang', () => {
    useGameStore.getState().selectGeneral('rende')
    const armor = card('silverLion', 'heart')
    useGameStore.setState(state => ({ units: { ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [] },
      north: { ...state.units.north, name: '关羽', skill: 'wusheng', skills: ['wusheng'], hp: 2, maxHp: 4, hand: [], equipment: { armor } },
      east: { ...state.units.east, position: { x: 4, y: 2 }, hand: [] },
    } }))
    useGameStore.getState().activateJijiang()
    expect(useGameStore.getState()).toMatchObject({ jijiangSource: 'north', selectedCardId: armor.id, selectedAsSlash: true })
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: armor.id, target: 'east', asSlash: true, lordAssist: 'north' })
    const state = useGameStore.getState()
    expect(state.units.east.hp).toBe(3)
    expect(state.units.north.equipment.armor).toBeUndefined()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.player.attacksUsed).toBe(1)
    expect(state.discard).toContainEqual(armor)
  })

  it('does not grant Jijiang to a different Shu lord', () => {
    const offered = card('slash', 'diamond')
    useGameStore.setState(state => ({
      units: { ...state.units, player: { ...state.units.player, hand: [] }, north: { ...state.units.north, hand: [offered] } },
    }))
    useGameStore.getState().activateJijiang()
    expect(useGameStore.getState().jijiangSource).toBeNull()
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

  it('does not draw the resolving trick when Jizhi reshuffles the discard pile', () => {
    useGameStore.getState().selectGeneral('jizhi')
    const trick = card('drawTwo'), reward = card('slash')
    useGameStore.setState(state => ({ deck: [], discard: [reward], units: { ...state.units, player: { ...state.units.player, hand: [trick] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: trick.id })
    const state = useGameStore.getState()
    expect(state.units.player.hand).toEqual([reward])
    expect(state.discard).toContainEqual(trick)
  })

  it('does not let Draw Two draw itself when the deck is empty', () => {
    const trick = card('drawTwo'), reward = card('dodge')
    useGameStore.setState(state => ({ deck: [], discard: [reward], units: { ...state.units, player: { ...state.units.player, hand: [trick] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: trick.id })
    const state = useGameStore.getState()
    expect(state.units.player.hand).toEqual([reward])
    expect(state.discard).toContainEqual(trick)
  })

  it('lets the player nullify an AI Draw Two before cards are drawn', () => {
    const trick = card('drawTwo'), nullify = card('nullify'), rewardA = card('slash'), rewardB = card('dodge')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', deck: [rewardA, rewardB], discard: [], units: { ...state.units,
      east: { ...state.units.east, hand: [trick] }, player: { ...state.units.player, hand: [nullify] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: trick.id })
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'nullify', trick: 'drawTwo' })
    useGameStore.getState().respond(nullify.id)
    const state = useGameStore.getState()
    expect(state.units.east.hand).toHaveLength(0)
    expect(state.deck).toEqual([rewardA, rewardB])
    expect(state.discard).toEqual(expect.arrayContaining([trick, nullify]))
  })

  it('resolves an AI Draw Two if the player declines to nullify it', () => {
    const trick = card('drawTwo'), nullify = card('nullify'), rewardA = card('slash'), rewardB = card('dodge')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', deck: [rewardA, rewardB], discard: [], units: { ...state.units,
      east: { ...state.units.east, hand: [trick] }, player: { ...state.units.player, hand: [nullify] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: trick.id })
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.east.hand).toEqual([rewardA, rewardB])
    expect(state.units.player.hand).toContainEqual(nullify)
  })

  it('lets a hostile AI nullify the player Draw Two', () => {
    const trick = card('drawTwo'), nullify = card('nullify'), rewardA = card('slash'), rewardB = card('dodge')
    useGameStore.setState(state => ({ deck: [rewardA, rewardB], discard: [], units: { ...state.units,
      player: { ...state.units.player, hand: [trick] }, east: { ...state.units.east, hand: [nullify], identity: 'rebel' },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: trick.id })
    const state = useGameStore.getState()
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.units.east.hand).toHaveLength(0)
    expect(state.deck).toEqual([rewardA, rewardB])
    expect(state.discard).toEqual(expect.arrayContaining([trick, nullify]))
  })

  it('lets the player counter a hostile nullify on Draw Two', () => {
    const trick = card('drawTwo'), playerNullify = card('nullify', 'heart'), enemyNullify = card('nullify'), rewardA = card('slash'), rewardB = card('dodge')
    useGameStore.setState(state => ({ deck: [rewardA, rewardB], discard: [], units: { ...state.units,
      player: { ...state.units.player, hand: [trick, playerNullify] }, east: { ...state.units.east, hand: [enemyNullify], identity: 'rebel' },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: trick.id })
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'nullify', trick: 'drawTwo', counteredBy: 'east' })
    useGameStore.getState().respond(playerNullify.id)
    const state = useGameStore.getState()
    expect(state.pendingResponse).toBeNull()
    expect(state.units.player.hand).toEqual([rewardA, rewardB])
    expect(state.discard).toEqual(expect.arrayContaining([trick, playerNullify, enemyNullify]))
  })

  it('lets Huang Yueying ignore Snatch distance through Qicai', () => {
    useGameStore.getState().selectGeneral('jizhi')
    const snatch = card('snatch'), prize = card('peach')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [snatch] }, north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [prize] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: snatch.id, target: 'north' })
    expect(useGameStore.getState().pendingPlunder).toMatchObject({ target: 'north', gain: true })
    useGameStore.getState().choosePlunderCard(prize.id)
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

  it('lets AI Sima Yi replace an allied lord judgement', () => {
    const state = createInitialState([])
    const indulgence = card('indulgence'), badJudge = card('slash', 'spade'), replacement = card('peach', 'heart')
    state.deck = [badJudge, card('slash'), card('dodge')]
    state.units.player = { ...state.units.player, judgement: [indulgence], hand: [] }
    state.units.west = { ...state.units.west, identity: 'loyalist', hand: [replacement] }
    const result = beginTurn(state, 'player')
    expect(result.turnStage).toBe('play')
    expect(result.units.west.hand).toHaveLength(0)
    expect(result.discard).toEqual(expect.arrayContaining([badJudge, replacement]))
    expect(result.history.some(entry => entry.includes('司马懿发动【鬼才】'))).toBe(true)
  })

  it('lets hostile AI Sima Yi turn a favorable judgement against the lord', () => {
    const state = createInitialState([])
    const indulgence = card('indulgence'), goodJudge = card('peach', 'heart'), replacement = card('slash', 'spade')
    state.deck = [goodJudge, card('slash'), card('dodge')]
    state.units.player = { ...state.units.player, judgement: [indulgence], hand: [] }
    state.units.west = { ...state.units.west, hand: [replacement] }
    const result = beginTurn(state, 'player')
    expect(result.turnStage).toBe('finish')
    expect(result.units.west.hand).toHaveLength(0)
    expect(result.discard).toEqual(expect.arrayContaining([goodJudge, replacement]))
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

  it('lets Cao Cao gain the original Slash instead of a later Bagua judgement', () => {
    useGameStore.getState().selectGeneral('jianxiong')
    const slash = card('slash', 'heart'), bagua = card('bagua'), blackJudge = card('duel', 'spade')
    useGameStore.setState(state => ({
      currentUnit: 'east', phase: 'ai', deck: [blackJudge], discard: [],
      units: {
        ...state.units,
        east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash] },
        player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [], equipment: { armor: bagua } },
      },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().activateBagua()
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.player.hand).toContainEqual(slash)
    expect(state.units.player.hand).not.toContainEqual(blackJudge)
    expect(state.discard).toContainEqual(blackJudge)
    expect(state.discard).not.toContainEqual(slash)
  })

  it('lets Cao Cao gain the Duel card after declining both response windows', () => {
    useGameStore.getState().selectGeneral('jianxiong')
    const duel = card('duel', 'spade')
    useGameStore.setState(state => ({
      currentUnit: 'east', phase: 'ai', discard: [],
      units: { ...state.units, east: { ...state.units.east, hand: [duel] }, player: { ...state.units.player, hand: [] } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: duel.id, target: 'player' })
    useGameStore.getState().respond(null)
    expect(useGameStore.getState().pendingResponse?.effect).toBe('duel')
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.player.hand).toContainEqual(duel)
    expect(state.discard).not.toContainEqual(duel)
  })

  it('lets Guo Jia gain a judgement card and draw two cards after damage', () => {
    useGameStore.getState().selectGeneral('yiji')
    let state = useGameStore.getState()
    expect(state.units.player).toMatchObject({ name: '郭嘉', hp: 4, maxHp: 4, skills: ['tiandu', 'yiji'] })
    const indulgence = card('indulgence'), judge = card('peach', 'heart'), turnA = card('slash'), turnB = card('dodge')
    state.deck = [judge, turnA, turnB]
    state.units.player = { ...state.units.player, judgement: [indulgence], hand: [] }
    state.units.west = { ...state.units.west, hand: [] }
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
    expect(useGameStore.getState().qingnangMode).toBe(true)
    useGameStore.getState().chooseQingnangTarget('player')
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(3)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.units.player.skillUsed).toBe(true)
    expect(state.discard).toContainEqual(payment)
  })

  it('lets Hua Tuo choose any wounded character for Qingnang', () => {
    useGameStore.getState().selectGeneral('qingnang')
    const payment = card('slash')
    useGameStore.setState(state => ({ units: { ...state.units,
      player: { ...state.units.player, hand: [payment] },
      east: { ...state.units.east, hp: 2, identity: 'rebel' },
    } }))
    useGameStore.getState().selectCard(payment.id)
    useGameStore.getState().activateQingnang()
    useGameStore.getState().chooseQingnangTarget('north')
    expect(useGameStore.getState().qingnangMode).toBe(true)
    expect(useGameStore.getState().units.player.hand).toContainEqual(payment)
    useGameStore.getState().chooseQingnangTarget('east')
    const state = useGameStore.getState()
    expect(state.units.east.hp).toBe(3)
    expect(state.units.player.hp).toBe(state.units.player.maxHp)
    expect(state.units.player.skillUsed).toBe(true)
    expect(state.qingnangMode).toBe(false)
    expect(state.discard).toContainEqual(payment)
  })

  it('lets Hua Tuo discard Dodge as Qingnang payment', () => {
    useGameStore.getState().selectGeneral('qingnang')
    const payment = card('dodge')
    useGameStore.setState(state => ({ units: { ...state.units,
      player: { ...state.units.player, hp: 2, hand: [payment] },
    } }))
    useGameStore.getState().selectCard(payment.id)
    expect(useGameStore.getState().selectedCardId).toBe(payment.id)
    useGameStore.getState().activateQingnang()
    useGameStore.getState().chooseQingnangTarget('player')
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(3)
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

  it('does not allow Jijiu during Hua Tuo’s own turn', () => {
    useGameStore.getState().selectGeneral('qingnang')
    const redCard = card('dodge', 'heart')
    useGameStore.setState(state => ({
      currentUnit: 'player', phase: 'player',
      units: { ...state.units, player: { ...state.units.player, hp: 0, hand: [redCard] } },
      pendingResponse: { effect: 'dying', source: 'east', target: 'player', required: 'peach', prompt: '濒死救援' },
    }))
    useGameStore.getState().respond(redCard.id)
    const state = useGameStore.getState()
    expect(state.pendingResponse?.effect).toBe('dying')
    expect(state.units.player.hand).toContainEqual(redCard)
    expect(state.units.player.hp).toBe(0)
  })

  it('lets player Hua Tuo use a red equipped card for Jijiu once', () => {
    useGameStore.getState().selectGeneral('qingnang')
    const attack = card('slash', 'spade'), mount = card('redHare', 'heart')
    useGameStore.setState(state => ({
      currentUnit: 'east', phase: 'ai',
      units: { ...state.units,
        east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [attack] },
        player: { ...state.units.player, position: { x: 4, y: 8 }, hp: 1, hand: [], equipment: { offensiveMount: mount } },
      },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: attack.id, target: 'player' })
    useGameStore.getState().respond(null)
    expect(useGameStore.getState().pendingResponse?.effect).toBe('dying')
    useGameStore.getState().respond(mount.id)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(1)
    expect(state.units.player.equipment.offensiveMount).toBeUndefined()
    expect(state.discard.filter(candidate => candidate.id === mount.id)).toHaveLength(1)
  })

  it('lets AI Hua Tuo rescue himself with a red equipped card', () => {
    const attack = card('slash', 'spade'), mount = card('redHare', 'heart')
    useGameStore.setState(state => ({
      units: { ...state.units,
        player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [attack] },
        north: { ...state.units.north, skill: 'qingnang', skills: ['qingnang', 'jijiu'], position: { x: 4, y: 0 }, hp: 1, hand: [], equipment: { offensiveMount: mount } },
      },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: attack.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(1)
    expect(state.units.north.equipment.offensiveMount).toBeUndefined()
    expect(state.discard.filter(candidate => candidate.id === mount.id)).toHaveLength(1)
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
    const low = card('duel', 'spade'), peach = card('peach', 'heart'), dodge = card('dodge', 'club'), slash = card('slash', 'diamond'), untouched = card('wine', 'heart')
    const state = useGameStore.getState()
    const waiting = beginTurn({ ...state, pendingGuanxing: null, deck: [low, peach, dodge, slash, untouched], units: { ...state.units, player: { ...state.units.player, hand: [] } } }, 'player')
    expect(waiting.pendingGuanxing?.pool).toEqual([low, peach, dodge, slash])
    expect(waiting.deck).toEqual([untouched])
    useGameStore.setState(waiting)
    useGameStore.getState().assignGuanxing(peach.id, 'top')
    useGameStore.getState().finishGuanxing()
    expect(useGameStore.getState().pendingGuanxing?.pool).toHaveLength(3)
    useGameStore.getState().assignGuanxing(dodge.id, 'top')
    useGameStore.getState().assignGuanxing(slash.id, 'top')
    useGameStore.getState().assignGuanxing(low.id, 'bottom')
    useGameStore.getState().finishGuanxing()
    const result = useGameStore.getState()
    expect(result.units.player.hand).toEqual([peach, dodge])
    expect(result.deck[0]).toEqual(slash)
    expect(result.deck.slice(-2)).toEqual([untouched, low])
    expect(result.pendingGuanxing).toBeNull()
    expect(result.history.some(entry => entry.includes('观星'))).toBe(true)
  })

  it('can restore the original Guanxing order after moving cards', () => {
    useGameStore.getState().selectGeneral('guanxing')
    const cards = [card('duel'), card('dodge'), card('peach'), card('slash')]
    const state = useGameStore.getState()
    useGameStore.setState(beginTurn({ ...state, pendingGuanxing: null, deck: cards, units: { ...state.units, player: { ...state.units.player, hand: [] } } }, 'player'))
    useGameStore.getState().assignGuanxing(cards[2].id, 'bottom')
    useGameStore.getState().assignGuanxing(cards[0].id, 'top')
    useGameStore.getState().finishGuanxing(true)
    const result = useGameStore.getState()
    expect(result.units.player.hand).toEqual(cards.slice(0, 2))
    expect(result.deck).toEqual(cards.slice(2))
    expect(result.pendingGuanxing).toBeNull()
  })

  it('prevents slash and duel from targeting an empty-handed Zhuge Liang', () => {
    useGameStore.getState().selectGeneral('guanxing')
    useGameStore.getState().finishGuanxing(true)
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
    const waiting = beginTurn({ ...state, pendingTuxi: null, deck: [deckA, deckB], units: { ...state.units,
      player: { ...state.units.player, hand: [] }, north: { ...state.units.north, hand: [northCard], revealed: true },
      east: { ...state.units.east, hand: [eastCard], revealed: true }, west: { ...state.units.west, hand: [untouched], revealed: true },
    } }, 'player')
    expect(waiting.pendingTuxi?.targets).toEqual([])
    useGameStore.setState(waiting)
    useGameStore.getState().selectTuxiTarget('east')
    useGameStore.getState().selectTuxiTarget('west')
    useGameStore.getState().finishTuxi(true)
    const result = useGameStore.getState()
    expect(result.units.player.hand).toHaveLength(2)
    expect(result.units.player.hand).toEqual(expect.arrayContaining([eastCard, untouched]))
    expect(result.deck).toEqual([deckA, deckB])
    expect(result.pendingTuxi).toBeNull()
    expect(result.history.some(entry => entry.includes('突袭'))).toBe(true)
  })

  it('lets Zhang Liao decline Tuxi and draw normally', () => {
    useGameStore.getState().selectGeneral('tuxi')
    const drawA = card('duel'), drawB = card('drawTwo')
    const state = useGameStore.getState()
    useGameStore.setState(beginTurn({ ...state, pendingTuxi: null, deck: [drawA, drawB], units: { ...state.units, player: { ...state.units.player, hand: [] } } }, 'player'))
    useGameStore.getState().finishTuxi(false)
    const result = useGameStore.getState()
    expect(result.units.player.hand).toEqual([drawA, drawB])
    expect(result.pendingTuxi).toBeNull()
  })

  it('lets Zhang Liao take one card from any other character, including a loyalist', () => {
    useGameStore.getState().selectGeneral('tuxi')
    const loyalistCard = card('peach'), drawA = card('slash'), drawB = card('dodge')
    const state = useGameStore.getState()
    useGameStore.setState(beginTurn({ ...state, pendingTuxi: null, deck: [drawA, drawB], units: { ...state.units,
      player: { ...state.units.player, hand: [] }, north: { ...state.units.north, identity: 'loyalist', hand: [loyalistCard] },
      east: { ...state.units.east, hand: [] }, west: { ...state.units.west, hand: [] },
    } }, 'player'))
    useGameStore.getState().selectTuxiTarget('north')
    useGameStore.getState().finishTuxi(true)
    const result = useGameStore.getState()
    expect(result.units.player.hand).toEqual([loyalistCard])
    expect(result.units.north.hand).toEqual([])
    expect(result.deck).toEqual([drawA, drawB])
  })

  it('lets Xu Chu draw one and add damage through Luoyi', () => {
    useGameStore.getState().selectGeneral('luoyi')
    const drawn = card('slash'), spare = card('dodge')
    const state = useGameStore.getState()
    useGameStore.setState(beginTurn({ ...state, pendingLuoyi: null, deck: [drawn, spare], units: { ...state.units, player: { ...state.units.player, hand: [] } } }, 'player'))
    expect(useGameStore.getState().pendingLuoyi).not.toBeNull()
    useGameStore.getState().chooseLuoyi(true)
    const begun = useGameStore.getState()
    expect(begun.units.player.hand).toEqual([drawn])
    expect(begun.units.player.luoyiActive).toBe(true)
    useGameStore.setState({ ...begun, units: { ...begun.units, player: { ...begun.units.player, position: { x: 4, y: 1 } }, north: { ...begun.units.north, position: { x: 4, y: 0 }, hand: [] } } })
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: drawn.id, target: 'north' })
    expect(useGameStore.getState().units.north.hp).toBe(2)
    expect(useGameStore.getState().history.some(entry => entry.includes('2 点'))).toBe(true)
  })

  it('lets Xu Chu decline Luoyi, draw two cards, and deal normal damage', () => {
    useGameStore.getState().selectGeneral('luoyi')
    const drawn = card('slash'), spare = card('dodge')
    const state = useGameStore.getState()
    useGameStore.setState(beginTurn({ ...state, pendingLuoyi: null, deck: [drawn, spare], units: { ...state.units, player: { ...state.units.player, hand: [] } } }, 'player'))
    useGameStore.getState().chooseLuoyi(false)
    const begun = useGameStore.getState()
    expect(begun.units.player.hand).toEqual([drawn, spare])
    expect(begun.units.player.luoyiActive).toBe(false)
    useGameStore.setState({ ...begun, units: { ...begun.units, player: { ...begun.units.player, position: { x: 4, y: 1 } }, north: { ...begun.units.north, position: { x: 4, y: 0 }, hand: [] } } })
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: drawn.id, target: 'north' })
    expect(useGameStore.getState().units.north.hp).toBe(3)
  })

  it('lets Sun Shangxiang heal herself and a wounded male through Jieyin', () => {
    useGameStore.getState().selectGeneral('jieyin')
    const kept = card('peach'), first = card('slash'), second = card('dodge')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hp: 2, hand: [kept, first, second] }, north: { ...state.units.north, hp: 2, gender: 'male' }, east: { ...state.units.east, hp: 2, gender: 'male' } } }))
    useGameStore.getState().activateJieyin()
    useGameStore.getState().selectCard(first.id)
    useGameStore.getState().selectCard(second.id)
    expect(useGameStore.getState().jieyinSelection).toEqual([first.id, second.id])
    useGameStore.getState().chooseJieyinTarget('east')
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(3)
    expect(state.units.north.hp).toBe(2)
    expect(state.units.east.hp).toBe(3)
    expect(state.units.player.hand).toEqual([kept])
    expect(state.units.player.skillUsed).toBe(true)
    expect(state.discard).toEqual(expect.arrayContaining([first, second]))
  })

  it('lets Sun Shangxiang use Jieyin at full health to heal a wounded male', () => {
    useGameStore.getState().selectGeneral('jieyin')
    const first = card('slash'), second = card('dodge')
    useGameStore.setState(state => ({ units: { ...state.units,
      player: { ...state.units.player, hp: state.units.player.maxHp, hand: [first, second] },
      north: { ...state.units.north, hp: 2, gender: 'male' },
    } }))
    useGameStore.getState().activateJieyin()
    useGameStore.getState().selectCard(first.id)
    useGameStore.getState().selectCard(second.id)
    useGameStore.getState().chooseJieyinTarget('north')
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(state.units.player.maxHp)
    expect(state.units.north.hp).toBe(3)
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
    expect(useGameStore.getState().pendingPlunder).toMatchObject({ target: 'east', gain: false })
    useGameStore.getState().choosePlunderCard(victimCard.id)
    const state = useGameStore.getState()
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.units.east.hand).toHaveLength(0)
    expect(state.discard.map(item => item.id)).toEqual(expect.arrayContaining([material.id, victimCard.id]))
    expect(state.message).toContain('过河拆桥')
  })

  it('lets the player choose a specific equipment with Dismantle', () => {
    const dismantle = card('dismantle'), hidden = card('peach'), armor = card('shield')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hand: [dismantle] }, east: { ...state.units.east, hand: [hidden], equipment: { armor } } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: dismantle.id, target: 'east' })
    useGameStore.getState().choosePlunderCard(armor.id)
    const state = useGameStore.getState()
    expect(state.pendingPlunder).toBeNull()
    expect(state.units.east.hand).toContainEqual(hidden)
    expect(state.units.east.equipment.armor).toBeUndefined()
    expect(state.discard).toContainEqual(armor)
  })

  it('keeps the choice open when a Plunder card ID is invalid', () => {
    const snatch = card('snatch'), hidden = card('dodge')
    useGameStore.setState(state => ({ units: {
      ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [snatch] },
      north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [hidden] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: snatch.id, target: 'north' })
    useGameStore.getState().choosePlunderCard('missing-card')
    const state = useGameStore.getState()
    expect(state.pendingPlunder).toMatchObject({ target: 'north', gain: true })
    expect(state.units.north.hand).toContainEqual(hidden)
    expect(state.units.player.hand).not.toContainEqual(hidden)
  })

  it('does not spend Snatch or Dismantle against a target with no cards', () => {
    const snatch = card('snatch'), dismantle = card('dismantle')
    useGameStore.setState(state => ({ units: {
      ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [snatch, dismantle] },
      north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [], equipment: {} },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: snatch.id, target: 'north' })
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: dismantle.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.player.hand).toEqual([snatch, dismantle])
    expect(state.pendingPlunder).toBeNull()
    expect(state.discard).not.toContainEqual(snatch)
    expect(state.discard).not.toContainEqual(dismantle)
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

  it('lets Sun Quan exchange equipped cards and resolve losing Silver Lion', () => {
    useGameStore.getState().selectGeneral('zhiheng')
    const peach = card('peach'), lion = card('silverLion', 'heart'), freshA = card('slash'), freshB = card('dodge')
    useGameStore.setState(state => ({ deck: [freshA, freshB], discard: [], units: { ...state.units, player: { ...state.units.player, hp: 3, hand: [peach], equipment: { armor: lion } } } }))
    useGameStore.getState().activateZhiheng()
    useGameStore.getState().selectCard(peach.id)
    useGameStore.getState().selectCard(lion.id)
    expect(useGameStore.getState().zhihengSelection).toEqual([peach.id, lion.id])
    useGameStore.getState().activateZhiheng()
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(4)
    expect(state.units.player.equipment.armor).toBeUndefined()
    expect(state.units.player.hand.map(item => item.id)).toEqual([freshA.id, freshB.id])
    expect(state.discard).toContainEqual(peach)
    expect(state.discard).toContainEqual(lion)
    expect(state.units.player.skillUsed).toBe(true)
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

  it('applies Jiuyuan from the actual dying health after a two-damage Slash', () => {
    useGameStore.getState().selectGeneral('zhiheng')
    const slash = card('slash'), first = card('peach', 'heart'), second = card('peach', 'diamond')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: {
      ...state.units,
      player: { ...state.units.player, hp: 1, hand: [] },
      north: { ...state.units.north, identity: 'loyalist', faction: 'wu', hand: [first, second] },
      east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash], drunk: true },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(1)
    expect(state.units.north.hand).toEqual([second])
    expect(state.discard).toContainEqual(first)
    expect(state.winner).toBeNull()
  })

  it('doubles a Wu player Peach when rescuing an AI lord with Jiuyuan', () => {
    useGameStore.getState().selectGeneral('zhiheng')
    const slash = card('slash'), peach = card('peach', 'heart')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: {
      ...state.units,
      player: { ...state.units.player, identity: 'loyalist', hand: [peach] },
      north: { ...state.units.north, identity: 'lord', hp: 1, hand: [], skills: ['jiuyuan'] },
      east: { ...state.units.east, position: { x: 4, y: 1 }, hand: [slash] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'north' })
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'dying', target: 'north' })
    useGameStore.getState().respond(peach.id)
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(2)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.discard).toContainEqual(peach)
    expect(state.winner).toBeNull()
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

  it('lets AI Zhen Ji use a black hand card as Dodge through Qingguo', () => {
    const slash = card('slash', 'heart'), black = card('peach', 'club')
    useGameStore.setState(state => ({ units: {
      ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [slash] },
      north: { ...state.units.north, skill: 'luoshen', skills: ['luoshen', 'qingguo'], position: { x: 4, y: 7 }, hand: [black] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(4)
    expect(state.units.north.hand).toEqual([])
    expect(state.discard).toContainEqual(black)
    expect(state.message).toContain('倾国')
  })

  it('requires two black cards when AI Zhen Ji faces Wushuang', () => {
    const slash = card('slash', 'heart'), first = card('peach', 'club'), second = card('duel', 'spade'), red = card('peach', 'heart')
    useGameStore.setState(state => ({ units: {
      ...state.units,
      player: { ...state.units.player, skill: 'wushuang', skills: ['wushuang'], position: { x: 4, y: 8 }, hand: [slash] },
      north: { ...state.units.north, skill: 'luoshen', skills: ['luoshen', 'qingguo'], position: { x: 4, y: 7 }, hand: [first, second, red] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(4)
    expect(state.units.north.hand).toEqual([red])
    expect(state.discard).toEqual(expect.arrayContaining([first, second]))
    expect(state.message).toContain('倾国')
  })

  it('does not treat a red non-Dodge as Qingguo', () => {
    const slash = card('slash', 'heart'), red = card('peach', 'heart')
    useGameStore.setState(state => ({ units: {
      ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [slash] },
      north: { ...state.units.north, skill: 'luoshen', skills: ['luoshen', 'qingguo'], position: { x: 4, y: 7 }, hand: [red] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.north.hand).toEqual([red])
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

  it('amplifies fire in forests and extinguishes it in water', () => {
    const forestFire = card('fireAttack'), forestPayment = card('slash', 'heart'), forestReveal = card('dodge', 'heart')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hand: [forestFire, forestPayment] }, north: { ...state.units.north, position: { x: 1, y: 1 }, hand: [forestReveal] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: forestFire.id, target: 'north' })
    expect(useGameStore.getState().units.north.hp).toBe(2)
    expect(useGameStore.getState().history.some(entry => entry.includes('森林助燃'))).toBe(true)

    const waterState = createInitialState(Array.from({ length: 24 }, () => card('slash')))
    const waterFire = card('fireAttack'), waterPayment = card('slash', 'diamond'), waterReveal = card('dodge', 'diamond')
    useGameStore.setState({ ...waterState, units: { ...waterState.units, player: { ...waterState.units.player, hand: [waterFire, waterPayment] }, north: { ...waterState.units.north, position: { x: 0, y: 2 }, hand: [waterReveal] } } })
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: waterFire.id, target: 'north' })
    expect(useGameStore.getState().units.north.hp).toBe(4)
    expect(useGameStore.getState().history.some(entry => entry.includes('熄灭了火焰'))).toBe(true)
  })

  it('treats fire slash as slash and transmits its elemental damage', () => {
    const fireSlash = card('fireSlash', 'heart'), weapon = card('qinggang')
    useGameStore.setState(state => ({ units: {
      ...state.units,
      player: { ...state.units.player, position: { x: 1, y: 2 }, hand: [fireSlash], equipment: { weapon } },
      east: { ...state.units.east, position: { x: 1, y: 1 }, hand: [], chained: true },
      north: { ...state.units.north, hand: [], chained: true },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: fireSlash.id, target: 'east' })
    const state = useGameStore.getState()
    expect(state.units.player.attacksUsed).toBe(1)
    expect(state.units.east.hp).toBe(2)
    expect(state.units.north.hp).toBe(3)
    expect(state.units.east.animation).toBe('fireHit')
    expect(state.units.north.animation).toBe('fireHit')
    expect(state.units.east.chained).toBe(false)
    expect(state.units.north.chained).toBe(false)
  })

  it('shows thunder impact state after a thunder slash on wet terrain', () => {
    const thunderSlash = card('thunderSlash', 'spade')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, position: { x: 0, y: 1 }, hand: [thunderSlash] }, east: { ...state.units.east, position: { x: 0, y: 2 }, hand: [] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: thunderSlash.id, target: 'east' })
    const state = useGameStore.getState()
    expect(state.units.east.hp).toBe(2)
    expect(state.units.east.animation).toBe('thunderHit')
    expect(state.history.some(entry => entry.includes('湿地导雷'))).toBe(true)
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

  it('recasts Iron Chain to draw one card without triggering Jizhi', () => {
    useGameStore.getState().selectGeneral('jizhi')
    const chain = card('ironChain'), replacement = card('peach')
    useGameStore.setState(state => ({ deck: [replacement], discard: [], units: { ...state.units, player: { ...state.units.player, hand: [chain] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: chain.id, recast: true })
    const state = useGameStore.getState()
    expect(state.units.player.hand).toEqual([replacement])
    expect(state.discard).toContainEqual(chain)
    expect(state.history.some(entry => entry.includes('重铸'))).toBe(true)
    expect(state.history.some(entry => entry.includes('集智'))).toBe(false)
  })

  it('does not draw the recast Iron Chain from an exhausted deck', () => {
    const chain = card('ironChain'), replacement = card('dodge')
    useGameStore.setState(state => ({ deck: [], discard: [replacement], units: { ...state.units, player: { ...state.units.player, hand: [chain] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: chain.id, recast: true })
    const state = useGameStore.getState()
    expect(state.units.player.hand).toEqual([replacement])
    expect(state.discard).toContainEqual(chain)
  })

  it('triggers Lianying when Lu Xun recasts his final hand card', () => {
    useGameStore.getState().selectGeneral('qianxun')
    const chain = card('ironChain'), lianyingDraw = card('slash'), recastDraw = card('dodge')
    useGameStore.setState(state => ({ deck: [lianyingDraw, recastDraw], discard: [], units: { ...state.units, player: { ...state.units.player, hand: [chain] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: chain.id, recast: true })
    const state = useGameStore.getState()
    expect(state.units.player.hand).toEqual([lianyingDraw, recastDraw])
    expect(state.discard).toContainEqual(chain)
    expect(state.history.some(entry => entry.includes('连营'))).toBe(true)
  })

  it('lets the player choose one or two Iron Chain targets including themselves', () => {
    const chain = card('ironChain')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hand: [chain] } } }))
    useGameStore.getState().selectCard(chain.id)
    useGameStore.getState().selectChainTarget('player')
    useGameStore.getState().selectChainTarget('east')
    expect(useGameStore.getState().chainTargets).toEqual(['player', 'east'])
    useGameStore.getState().playIronChain()
    const state = useGameStore.getState()
    expect(state.units.player.chained).toBe(true)
    expect(state.units.east.chained).toBe(true)
    expect(state.units.north.chained).toBe(false)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.chainTargets).toEqual([])
    expect(state.discard).toContainEqual(chain)
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

  it('amplifies lightning damage on wet terrain', () => {
    const lightning = card('lightning'), hit = card('slash', 'spade', 5), drawA = card('slash'), drawB = card('dodge')
    const state = createInitialState([])
    state.deck = [hit, drawA, drawB]
    state.units.player = { ...state.units.player, position: { x: 0, y: 2 }, judgement: [lightning] }
    const result = beginTurn(state, 'player')
    expect(result.units.player.hp).toBe(1)
    expect(result.history.some(entry => entry.includes('湿地导雷'))).toBe(true)
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

  it('lets an AI counter a player nullify so the original trick continues', () => {
    const duel = card('duel', 'spade'), playerNullify = card('nullify', 'club'), counterNullify = card('nullify', 'heart')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: { ...state.units, east: { ...state.units.east, hand: [duel, counterNullify] }, player: { ...state.units.player, hand: [playerNullify] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: duel.id, target: 'player' })
    useGameStore.getState().respond(playerNullify.id)
    const state = useGameStore.getState()
    expect(state.pendingResponse).toMatchObject({ effect: 'duel', required: 'slash' })
    expect(state.units.east.hand).toHaveLength(0)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.discard).toEqual(expect.arrayContaining([duel, playerNullify, counterNullify]))
    expect(state.history.some(entry => entry.includes('反制'))).toBe(true)
  })

  it('lets the player counter an AI counter-nullify', () => {
    const duel = card('duel'), first = card('nullify', 'club'), second = card('nullify', 'diamond'), counter = card('nullify', 'heart')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: { ...state.units, east: { ...state.units.east, hand: [duel, counter] }, player: { ...state.units.player, hand: [first, second] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: duel.id, target: 'player' })
    useGameStore.getState().respond(first.id)
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'nullify', required: 'nullify' })
    useGameStore.getState().respond(second.id)
    const state = useGameStore.getState()
    expect(state.pendingResponse).toBeNull()
    expect(state.units.player.hp).toBe(5)
    expect(state.discard).toEqual(expect.arrayContaining([duel, first, second, counter]))
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

  it('lets the player accept or nullify their own Peach Garden recovery', () => {
    const garden = card('peachGarden', 'heart'), nullify = card('nullify', 'spade')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: { ...state.units, east: { ...state.units.east, hand: [garden], hp: 2 }, player: { ...state.units.player, hand: [nullify], hp: 3 } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: garden.id })
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'nullify', trick: 'peachGarden' })
    expect(useGameStore.getState().units.east.hp).toBe(3)
    expect(useGameStore.getState().units.player.hp).toBe(3)
    useGameStore.getState().respond(null)
    expect(useGameStore.getState().units.player.hp).toBe(4)

    useGameStore.setState(state => ({ ...state, pendingResponse: null, currentUnit: 'east', phase: 'ai', units: { ...state.units, east: { ...state.units.east, hand: [garden] }, player: { ...state.units.player, hp: 3, hand: [nullify] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: garden.id })
    useGameStore.getState().respond(nullify.id)
    expect(useGameStore.getState().units.player.hp).toBe(3)
    expect(useGameStore.getState().pendingResponse).toBeNull()
  })

  it('restores Peach Garden recovery when the source counters nullify', () => {
    const garden = card('peachGarden', 'heart'), nullify = card('nullify', 'spade'), counter = card('nullify', 'club')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: { ...state.units, east: { ...state.units.east, hand: [garden, counter] }, player: { ...state.units.player, hand: [nullify], hp: 3 } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: garden.id })
    useGameStore.getState().respond(nullify.id)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(4)
    expect(state.pendingResponse).toBeNull()
    expect(state.discard).toEqual(expect.arrayContaining([garden, nullify, counter]))
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

  it('lets an AI ally spend enough peaches to rescue a deeply wounded ally', () => {
    const slash = card('slash', 'heart'), peach = card('peach', 'diamond', 3), secondPeach = card('peach', 'heart', 4)
    useGameStore.setState(state => ({
      units: {
        ...state.units,
        player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [slash], drunk: true },
        north: { ...state.units.north, position: { x: 4, y: 0 }, hp: 1, hand: [] },
        west: { ...state.units.west, identity: 'loyalist', hand: [peach, secondPeach] },
      },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(1)
    expect(state.units.west.hand).toHaveLength(0)
    expect(state.discard).toEqual(expect.arrayContaining([peach, secondPeach]))
    expect(state.history.some(entry => entry.includes('援救'))).toBe(true)
    expect(state.winner).toBeNull()
  })

  it('lets a loyalist rescue the dying player lord without a Peach in hand', () => {
    const slash = card('slash'), peach = card('peach', 'heart')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: {
      ...state.units,
      player: { ...state.units.player, hp: 1, hand: [] },
      north: { ...state.units.north, hand: [peach] },
      east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(1)
    expect(state.units.player.animation).toBe('heal')
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.discard).toContainEqual(peach)
    expect(state.winner).toBeNull()
  })

  it('asks loyalist AI for help after the player declines self-rescue', () => {
    const slash = card('slash'), playerPeach = card('peach', 'diamond'), allyPeach = card('peach', 'heart')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: {
      ...state.units,
      player: { ...state.units.player, hp: 1, hand: [playerPeach] },
      north: { ...state.units.north, hand: [allyPeach] },
      east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().respond(null)
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'dying', target: 'player' })
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(1)
    expect(state.units.player.hand).toContainEqual(playerPeach)
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.winner).toBeNull()
  })

  it('requires enough allied Peaches to save a lord below zero health', () => {
    const slash = card('slash'), first = card('peach', 'heart'), second = card('peach', 'diamond')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: {
      ...state.units,
      player: { ...state.units.player, hp: 1, hand: [] },
      north: { ...state.units.north, hand: [first, second] },
      east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash], drunk: true },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(1)
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.discard).toEqual(expect.arrayContaining([first, second]))
    expect(state.winner).toBeNull()
  })

  it('lets an AI character use wine for self-rescue', () => {
    const slash = card('slash'), wine = card('wine')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [slash] }, north: { ...state.units.north, position: { x: 4, y: 0 }, hp: 1, hand: [wine] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(1)
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.discard).toContainEqual(wine)
    expect(state.history.some(entry => entry.includes('【酒】自救'))).toBe(true)
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

  it('keeps AI Nullify when a basic card can answer a group trick', () => {
    for (const [trickKind, answerKind] of [['arrows', 'dodge'], ['barbarians', 'slash']] as const) {
      const trick = card(trickKind), answer = card(answerKind), nullify = card('nullify')
      useGameStore.setState(createInitialState(Array.from({ length: 30 }, () => card('slash', 'club'))))
      useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hand: [trick] }, north: { ...state.units.north, hand: [nullify, answer] } } }))
      useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: trick.id, target: 'north' })
      const state = useGameStore.getState()
      expect(state.units.north.hand).toContainEqual(nullify)
      expect(state.units.north.hand).not.toContainEqual(answer)
      expect(state.units.north.hp).toBe(4)
    }
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

  it('lets player Guan Yu use a red equipped card as Slash through Wusheng', () => {
    useGameStore.getState().selectGeneral('wusheng')
    const mount = card('redHare', 'heart')
    useGameStore.setState(state => ({ units: { ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [], equipment: { offensiveMount: mount } },
      north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [] },
    } }))
    useGameStore.getState().activateWusheng()
    useGameStore.getState().selectCard(mount.id)
    expect(useGameStore.getState().selectedCardId).toBe(mount.id)
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: mount.id, target: 'north', asSlash: true })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.player.equipment.offensiveMount).toBeUndefined()
    expect(state.discard).toContainEqual(mount)
  })

  it('lets AI Guan Yu attack with a red equipped card through Wusheng', async () => {
    const mount = card('redHare', 'heart')
    useGameStore.setState(state => ({ currentUnit: 'north', phase: 'ai', turnStage: 'play', scores: { ...state.scores, north: 2 }, units: { ...state.units,
      north: { ...state.units.north, skill: 'wusheng', skills: ['wusheng'], position: state.controlPoint, hand: [], equipment: { offensiveMount: mount } },
      east: { ...state.units.east, position: { x: 5, y: 4 }, hand: [], equipment: {} },
    } }))
    await useGameStore.getState().runAI()
    const state = useGameStore.getState()
    expect(state.units.north.equipment.offensiveMount).toBeUndefined()
    expect(state.units.east.hp).toBe(3)
    expect(state.discard).toContainEqual(mount)
  })

  it('checks Slash range after Guan Yu spends an equipped weapon through Wusheng', () => {
    useGameStore.getState().selectGeneral('wusheng')
    const weapon = card('doubleSword', 'heart')
    useGameStore.setState(state => ({ units: { ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 2 }, hand: [], equipment: { weapon } },
      north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: weapon.id, target: 'north', asSlash: true })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(4)
    expect(state.units.player.equipment.weapon).toEqual(weapon)
    expect(state.discard).not.toContainEqual(weapon)
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

  it('spends red equipment through Wusheng when answering Duel', () => {
    useGameStore.getState().selectGeneral('wusheng')
    const mount = card('redHare', 'heart')
    useGameStore.setState(state => ({ pendingResponse: { effect: 'duel', source: 'east', target: 'player', required: 'slash', prompt: '决斗' }, units: { ...state.units,
      player: { ...state.units.player, hand: [], equipment: { offensiveMount: mount } },
      east: { ...state.units.east, hand: [] },
    } }))
    useGameStore.getState().respond(mount.id)
    const state = useGameStore.getState()
    expect(state.units.player.equipment.offensiveMount).toBeUndefined()
    expect(state.discard).toContainEqual(mount)
    expect(state.units.player.hp).toBe(4)
  })

  it('spends red equipment through Wusheng when answering Barbarians', () => {
    useGameStore.getState().selectGeneral('wusheng')
    const armor = card('silverLion', 'diamond')
    useGameStore.setState(state => ({ pendingResponse: { effect: 'barbarians', source: 'east', target: 'player', required: 'slash', prompt: '南蛮入侵' }, units: { ...state.units,
      player: { ...state.units.player, hp: 3, hand: [], equipment: { armor } },
    } }))
    useGameStore.getState().respond(armor.id)
    const state = useGameStore.getState()
    expect(state.units.player.equipment.armor).toBeUndefined()
    expect(state.units.player.hp).toBe(4)
    expect(state.discard).toContainEqual(armor)
  })

  it('lets AI Guan Yu spend red equipment when answering Duel', () => {
    const duel = card('duel'), armor = card('silverLion', 'heart')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: { ...state.units,
      east: { ...state.units.east, skill: 'kurou', skills: ['kurou'], hand: [duel] },
      north: { ...state.units.north, skill: 'wusheng', skills: ['wusheng'], hp: 2, hand: [], equipment: { armor } },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: duel.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.equipment.armor).toBeUndefined()
    expect(state.units.north.hp).toBe(3)
    expect(state.discard).toContainEqual(armor)
  })

  it('lets AI Guan Yu spend red equipment when answering Barbarians', () => {
    const trick = card('barbarians'), armor = card('silverLion', 'heart')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: { ...state.units,
      east: { ...state.units.east, hand: [trick] },
      north: { ...state.units.north, skill: 'wusheng', skills: ['wusheng'], hp: 2, hand: [], equipment: { armor } },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: trick.id })
    const state = useGameStore.getState()
    expect(state.units.north.equipment.armor).toBeUndefined()
    expect(state.units.north.hp).toBe(3)
    expect(state.discard).toContainEqual(armor)
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

  it('lets AI Zhao Yun use an elemental slash as dodge through Longdan', () => {
    const attack = card('slash', 'heart'), converted = card('thunderSlash', 'club')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [attack] }, north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [converted] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: attack.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(4)
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.discard).toContainEqual(converted)
    expect(state.message).toContain('龙胆')
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

  it('lets the player choose which two hand cards Ganglie discards', () => {
    const attack = card('slash', 'heart'), first = card('dodge', 'diamond'), second = card('slash', 'club'), keep = card('peach', 'heart'), judgement = card('dismantle', 'spade', 8)
    useGameStore.setState(state => ({
      deck: [judgement], discard: [],
      units: { ...state.units,
        player: { ...state.units.player, position: { x: 8, y: 3 }, hand: [attack, first, second, keep] },
        east: { ...state.units.east, position: { x: 8, y: 4 }, hand: [] },
      },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: attack.id, target: 'east' })
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'ganglie', requiredCount: 2 })
    useGameStore.getState().respond(second.id)
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'ganglie', requiredCount: 1 })
    useGameStore.getState().respond(null)
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'ganglie', requiredCount: 1 })
    useGameStore.getState().respond(first.id)
    const state = useGameStore.getState()
    expect(state.pendingResponse).toBeNull()
    expect(state.units.player.hp).toBe(5)
    expect(state.units.player.hand).toEqual([keep])
    expect(state.discard).toEqual(expect.arrayContaining([attack, judgement, first, second]))
  })

  it('lets the player choose Ganglie damage instead of discarding', () => {
    const attack = card('slash', 'heart'), first = card('dodge', 'diamond'), second = card('peach', 'heart'), judgement = card('dismantle', 'spade', 8)
    useGameStore.setState(state => ({
      deck: [judgement], discard: [],
      units: { ...state.units,
        player: { ...state.units.player, position: { x: 8, y: 3 }, hand: [attack, first, second] },
        east: { ...state.units.east, position: { x: 8, y: 4 }, hand: [] },
      },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: attack.id, target: 'east' })
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.pendingResponse).toBeNull()
    expect(state.units.player.hp).toBe(4)
    expect(state.units.player.hand).toEqual([first, second])
  })

  it('opens a dying Peach response when Ganglie would kill the player', () => {
    const attack = card('slash', 'heart'), peach = card('peach', 'diamond'), judgement = card('dismantle', 'spade', 8)
    useGameStore.setState(state => ({
      deck: [judgement], discard: [],
      units: { ...state.units,
        player: { ...state.units.player, position: { x: 8, y: 3 }, hp: 1, hand: [attack, peach] },
        east: { ...state.units.east, position: { x: 8, y: 4 }, hand: [] },
        north: { ...state.units.north, hand: [] },
      },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: attack.id, target: 'east' })
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'dying', target: 'player' })
    useGameStore.getState().respond(peach.id)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(1)
    expect(state.winner).toBeNull()
    expect(state.discard).toEqual(expect.arrayContaining([judgement, peach]))
  })

  it('settles lord defeat when Ganglie kills a player without rescue', () => {
    const attack = card('slash', 'heart'), judgement = card('dismantle', 'spade', 8), armor = card('bagua')
    useGameStore.setState(state => ({
      deck: [judgement], discard: [],
      units: { ...state.units,
        player: { ...state.units.player, position: { x: 8, y: 3 }, hp: 1, hand: [attack], equipment: { armor } },
        east: { ...state.units.east, position: { x: 8, y: 4 }, hand: [] },
        north: { ...state.units.north, hand: [] },
      },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: attack.id, target: 'east' })
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(0)
    expect(state.units.player.equipment).toEqual({})
    expect(state.discard).toContainEqual(armor)
    expect(state.phase).toBe('finished')
    expect(state.winner).toBe('east')
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

  it('triggers Xiaoji when Feedback takes Sun Shangxiang equipment', () => {
    useGameStore.getState().selectGeneral('jieyin')
    const attack = card('slash', 'heart'), weapon = card('qinggang'), first = card('dodge'), second = card('peach')
    useGameStore.setState(state => ({ deck: [first, second], discard: [], units: {
      ...state.units,
      player: { ...state.units.player, position: { x: 0, y: 3 }, hand: [attack], equipment: { weapon } },
      west: { ...state.units.west, position: { x: 0, y: 4 }, hand: [] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: attack.id, target: 'west' })
    const state = useGameStore.getState()
    expect(state.units.west.hand).toContainEqual(weapon)
    expect(state.units.player.equipment.weapon).toBeUndefined()
    expect(state.units.player.hand).toEqual([first, second])
  })

  it('lets player Sima Yi choose an attacker equipment through Feedback', () => {
    useGameStore.getState().selectGeneral('feedback')
    const attack = card('slash', 'heart'), hidden = card('peach', 'diamond'), weapon = card('qinggang', 'spade')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: {
      ...state.units,
      player: { ...state.units.player, hp: 3, hand: [] },
      east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [attack, hidden], equipment: { weapon } },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: attack.id, target: 'player' })
    useGameStore.getState().respond(null)
    expect(useGameStore.getState().pendingPlunder).toMatchObject({ source: 'player', target: 'east', reason: 'feedback' })
    useGameStore.getState().choosePlunderCard('missing')
    expect(useGameStore.getState().pendingPlunder).not.toBeNull()
    useGameStore.getState().choosePlunderCard(weapon.id)
    const state = useGameStore.getState()
    expect(state.pendingPlunder).toBeNull()
    expect(state.units.player.hp).toBe(2)
    expect(state.units.player.hand).toContainEqual(weapon)
    expect(state.units.east.hand).toContainEqual(hidden)
    expect(state.units.east.equipment.weapon).toBeUndefined()
    expect(state.message).toContain('反馈')
  })

  it('lets a loyalist provide dodge for the lord', () => {
    useGameStore.getState().selectGeneral('jianxiong')
    const slash = card('slash'), dodge = card('dodge', 'heart', 2)
    useGameStore.setState(state => ({
      currentUnit: 'east', phase: 'ai',
      units: { ...state.units, east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash] }, player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [] }, north: { ...state.units.north, faction: 'wei', hand: [dodge] } },
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
    useGameStore.getState().selectGeneral('jianxiong')
    const slash = card('slash'), dodge = card('dodge', 'heart', 2)
    useGameStore.setState(state => ({
      currentUnit: 'east', phase: 'ai',
      units: { ...state.units, east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash] }, player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [] }, north: { ...state.units.north, faction: 'shu', hand: [dodge] } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(4)
    expect(state.units.north.hand).toContainEqual(dodge)
  })

  it('does not grant Hujia to a different Wei lord', () => {
    const slash = card('slash'), dodge = card('dodge', 'heart', 2)
    useGameStore.setState(state => ({
      currentUnit: 'east', phase: 'ai',
      units: {
        ...state.units,
        east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash] },
        player: { ...state.units.player, faction: 'wei', skills: ['feedback', 'guicai'], position: { x: 4, y: 8 }, hand: [] },
        north: { ...state.units.north, faction: 'wei', hand: [dodge] },
      },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(4)
    expect(state.units.north.hand).toContainEqual(dodge)
  })

  it('discards every card owned by a defeated character', () => {
    const slash = card('slash', 'heart'), held = card('drawTwo'), weapon = card('qinggang'), delayed = card('indulgence')
    useGameStore.setState(state => ({
      units: {
        ...state.units,
        player: { ...state.units.player, position: { x: 8, y: 3 }, hand: [slash] },
        east: { ...state.units.east, identity: 'renegade', position: { x: 8, y: 4 }, hp: 1, hand: [held], equipment: { weapon }, judgement: [delayed] },
      },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'east' })
    const state = useGameStore.getState()
    expect(state.units.east).toMatchObject({ hp: 0, hand: [], equipment: {}, judgement: [], revealed: true })
    expect(state.discard.map(item => item.id)).toEqual(expect.arrayContaining([slash.id, held.id, weapon.id, delayed.id]))
  })

  it('does not award cards when a rebel defeats themselves', () => {
    const held = card('dodge'), discarded = card('peach')
    useGameStore.setState(state => ({
      deck: [card('slash'), card('duel'), card('snatch')], discard: [discarded],
      units: { ...state.units, east: { ...state.units.east, identity: 'rebel', hp: 0, hand: [held] } },
    }))
    const selfDefeat = useGameStore.getState()
    // Model a source-less defeat through the public damage path used by failed rescue.
    useGameStore.setState({ pendingResponse: { effect: 'dying', source: 'east', target: 'east', required: 'peach', prompt: '濒死' } })
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.east.hand).toHaveLength(0)
    expect(state.deck).toHaveLength(selfDefeat.deck.length)
    expect(state.discard).toEqual(expect.arrayContaining([discarded, held]))
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
    expect(useGameStore.getState().pendingAxe).toMatchObject({ target: 'north', originCardId: slash.id, amount: 1 })
    expect(useGameStore.getState().units.player.hand).toEqual([costA, costB])
    useGameStore.getState().chooseAxe([costA.id, costB.id])
    const state = useGameStore.getState()
    expect(state.pendingAxe).toBeNull()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.discard.map(item => item.id)).toEqual(expect.arrayContaining([slash.id, dodge.id, costA.id, costB.id]))
    expect(state.message).toContain('贯石斧')
  })

  it('lets the player decline Stone Axe after the target dodges', () => {
    const slash = card('slash', 'heart'), axe = card('axe'), costA = card('peach'), costB = card('drawTwo'), dodge = card('dodge')
    useGameStore.setState(state => ({ units: {
      ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [slash, costA, costB], equipment: { weapon: axe } },
      north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [dodge] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    useGameStore.getState().chooseAxe(null)
    const state = useGameStore.getState()
    expect(state.pendingAxe).toBeNull()
    expect(state.units.north.hp).toBe(4)
    expect(state.units.player.hand).toEqual([costA, costB])
    expect(state.units.player.attacksUsed).toBe(1)
  })

  it('lets Stone Axe use equipment as one of its two costs', () => {
    const slash = card('slash', 'heart'), axe = card('axe'), mount = card('redHare'), cost = card('peach'), dodge = card('dodge')
    useGameStore.setState(state => ({ units: {
      ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [slash, cost], equipment: { weapon: axe, offensiveMount: mount } },
      north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [dodge] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    useGameStore.getState().chooseAxe([cost.id, mount.id])
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.player.hand).toEqual([])
    expect(state.units.player.equipment.offensiveMount).toBeUndefined()
    expect(state.units.player.equipment.weapon).toEqual(axe)
    expect(state.discard).toEqual(expect.arrayContaining([cost, mount]))
  })

  it('offers Stone Axe after a successful Bagua judgement', () => {
    const slash = card('slash', 'heart'), axe = card('axe'), bagua = card('bagua'), judge = card('peach', 'heart'), costA = card('duel'), costB = card('snatch')
    useGameStore.setState(state => ({ deck: [judge], discard: [], units: {
      ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [slash, costA, costB], equipment: { weapon: axe } },
      north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [], equipment: { armor: bagua } },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    expect(useGameStore.getState().pendingAxe).toMatchObject({ target: 'north', amount: 1 })
    expect(useGameStore.getState().discard).toContainEqual(judge)
    useGameStore.getState().chooseAxe([costA.id, costB.id])
    expect(useGameStore.getState().units.north.hp).toBe(3)
  })

  it('preserves Luoyi damage when Stone Axe forces a hit', () => {
    const slash = card('slash', 'heart'), axe = card('axe'), costA = card('duel'), costB = card('snatch'), dodge = card('dodge')
    useGameStore.setState(state => ({ units: {
      ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [slash, costA, costB], equipment: { weapon: axe }, luoyiActive: true },
      north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [dodge] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    expect(useGameStore.getState().pendingAxe?.amount).toBe(2)
    useGameStore.getState().chooseAxe([costA.id, costB.id])
    expect(useGameStore.getState().units.north.hp).toBe(2)
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

  it('triggers Xiaoji when Qilin Bow removes a mount', () => {
    const slash = card('slash', 'heart'), bow = card('qilinBow'), mount = card('dilu')
    const first = card('dodge'), second = card('peach')
    useGameStore.setState(state => ({ deck: [first, second], discard: [], units: {
      ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 2 }, hand: [slash], equipment: { weapon: bow } },
      north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [], equipment: { defensiveMount: mount }, skill: 'jieyin', skills: ['jieyin', 'xiaoji'] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.equipment.defensiveMount).toBeUndefined()
    expect(state.units.north.hand).toEqual([first, second])
    expect(state.units.north.hp).toBe(3)
    expect(state.message).toContain('枭姬')
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
    expect(useGameStore.getState().pendingGreenDragon).toEqual({ target: 'north' })
    expect(useGameStore.getState().units.player.hand).toContainEqual(secondSlash)
    useGameStore.getState().chooseGreenDragon(secondSlash.id)
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.units.player.attacksUsed).toBe(2)
    expect(state.discard.map(item => item.id)).toEqual(expect.arrayContaining([firstSlash.id, secondSlash.id, dodge.id]))
    expect(state.history.some(entry => entry.includes('青龙偃月刀'))).toBe(true)
  })

  it('lets Guan Yu chase with red equipment through Wusheng', () => {
    useGameStore.getState().selectGeneral('wusheng')
    const firstSlash = card('slash'), weapon = card('greenDragon'), armor = card('silverLion', 'heart'), dodge = card('dodge')
    useGameStore.setState(state => ({ units: { ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 2 }, hp: 3, hand: [firstSlash], equipment: { weapon, armor } },
      north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [dodge] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: firstSlash.id, target: 'north' })
    expect(useGameStore.getState().pendingGreenDragon).toEqual({ target: 'north' })
    expect(greenDragonChoices(useGameStore.getState(), 'player', 'north')).toContainEqual(armor)
    useGameStore.getState().chooseGreenDragon(armor.id)
    const state = useGameStore.getState()
    expect(state.units.player.equipment.armor).toBeUndefined()
    expect(state.units.player.hp).toBe(4)
    expect(state.units.north.hp).toBe(3)
    expect(state.discard).toContainEqual(armor)
  })

  it('does not offer Wusheng chase with a mount that would leave the target out of range', () => {
    useGameStore.getState().selectGeneral('wusheng')
    const weapon = card('greenDragon'), mount = card('redHare', 'heart')
    useGameStore.setState(state => ({ units: { ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 4 }, hand: [], equipment: { weapon, offensiveMount: mount } },
      north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [card('dodge')] },
    } }))
    expect(greenDragonChoices(useGameStore.getState(), 'player', 'north')).not.toContainEqual(mount)
  })

  it('lets the player decline Green Dragon Blade and keep the next slash', () => {
    const firstSlash = card('slash', 'heart'), secondSlash = card('slash', 'club'), weapon = card('greenDragon'), dodge = card('dodge')
    useGameStore.setState(state => ({ units: {
      ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 2 }, hand: [firstSlash, secondSlash], equipment: { weapon } },
      north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [dodge] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: firstSlash.id, target: 'north' })
    useGameStore.getState().chooseGreenDragon(null)
    const state = useGameStore.getState()
    expect(state.pendingGreenDragon).toBeNull()
    expect(state.units.player.hand).toEqual([secondSlash])
    expect(state.units.north.hp).toBe(4)
    expect(state.units.player.attacksUsed).toBe(1)
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
    expect(useGameStore.getState().pendingIceSword).toMatchObject({ target: 'north', amount: 1 })
    useGameStore.getState().chooseIceSword([first.id, second.id])
    const state = useGameStore.getState()
    expect(state.pendingIceSword).toBeNull()
    expect(state.units.north.hp).toBe(4)
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.discard.map(item => item.id)).toEqual(expect.arrayContaining([first.id, second.id]))
    expect(state.message).toContain('寒冰剑')
  })

  it('lets the player keep Slash damage instead of activating Ice Sword', () => {
    const slash = card('slash'), weapon = card('iceSword'), held = card('peach')
    useGameStore.setState(state => ({ units: {
      ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [slash], equipment: { weapon } },
      north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [held] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    useGameStore.getState().chooseIceSword(null)
    const state = useGameStore.getState()
    expect(state.pendingIceSword).toBeNull()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.north.hand).toEqual([held])
  })

  it('lets Ice Sword discard chosen equipment instead of a hidden hand card', () => {
    const slash = card('slash', 'heart'), sword = card('iceSword'), held = card('peach'), shield = card('shield'), mount = card('dilu')
    useGameStore.setState(state => ({ units: {
      ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [slash], equipment: { weapon: sword } },
      north: { ...state.units.north, position: { x: 4, y: 0 }, hand: [held], equipment: { armor: shield, defensiveMount: mount } },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    useGameStore.getState().chooseIceSword([shield.id, mount.id])
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(4)
    expect(state.units.north.hand).toEqual([held])
    expect(state.units.north.equipment).toEqual({})
    expect(state.discard).toEqual(expect.arrayContaining([shield, mount]))
  })

  it('lets AI deal lethal Slash damage instead of automatically using Ice Sword', () => {
    const slash = card('slash', 'heart'), sword = card('iceSword'), held = card('drawTwo')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: {
      ...state.units,
      east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash], equipment: { weapon: sword } },
      player: { ...state.units.player, position: { x: 4, y: 8 }, hp: 1, hand: [held] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(0)
    expect(state.pendingIceSword).toBeNull()
    expect(state.discard).toContainEqual(held)
  })

  it('heals Silver Lion and draws for Xiaoji when Ice Sword removes two equipment cards', () => {
    const slash = card('slash'), sword = card('iceSword'), lion = card('silverLion'), mount = card('dilu')
    const rewards = [card('dodge'), card('peach'), card('drawTwo'), card('slash', 'club')]
    useGameStore.setState(state => ({ deck: rewards, discard: [], units: {
      ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [slash], equipment: { weapon: sword } },
      north: { ...state.units.north, position: { x: 4, y: 0 }, hp: 2, maxHp: 3, hand: [], equipment: { armor: lion, defensiveMount: mount }, skill: 'jieyin', skills: ['jieyin', 'xiaoji'] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    useGameStore.getState().chooseIceSword([lion.id, mount.id])
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.north.equipment).toEqual({})
    expect(state.units.north.hand).toEqual(rewards)
    expect(state.discard).toEqual(expect.arrayContaining([lion, mount]))
    expect(state.message).toContain('枭姬')
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

  it('lets the player activate Bagua and use a red judgement as dodge', () => {
    const slash = card('slash', 'club'), bagua = card('bagua', 'spade', 2), judgement = card('peach', 'heart', 8)
    useGameStore.setState(state => ({
      deck: [judgement], discard: [], currentUnit: 'east', phase: 'ai',
      units: { ...state.units, east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash] }, player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [], equipment: { armor: bagua } } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'slash', armorChecked: false })
    expect(useGameStore.getState().deck).toContainEqual(judgement)
    useGameStore.getState().activateBagua()
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
    useGameStore.getState().activateBagua()
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'slash', armorChecked: true })
    useGameStore.getState().respond(dodge.id)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(5)
    expect(state.deck).toHaveLength(0)
    expect(state.discard).toContainEqual(judgement)
  })

  it('allows playing a Dodge without activating Bagua or consuming the judgement deck', () => {
    const slash = card('slash', 'heart'), bagua = card('bagua'), judgement = card('peach', 'heart'), dodge = card('dodge', 'diamond')
    useGameStore.setState(state => ({
      deck: [judgement], discard: [], currentUnit: 'east', phase: 'ai',
      units: { ...state.units, east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash] }, player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [dodge], equipment: { armor: bagua } } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().respond(dodge.id)
    const state = useGameStore.getState()
    expect(state.pendingResponse).toBeNull()
    expect(state.units.player.hp).toBe(5)
    expect(state.deck).toEqual([judgement])
    expect(state.discard).not.toContainEqual(judgement)
  })

  it('counts a successful Bagua judgement as only one Dodge against Wushuang', () => {
    const slash = card('slash', 'heart'), bagua = card('bagua'), judgement = card('peach', 'heart'), dodge = card('dodge', 'diamond')
    useGameStore.setState(state => ({
      deck: [judgement], discard: [], currentUnit: 'east', phase: 'ai',
      units: { ...state.units, east: { ...state.units.east, skill: 'wushuang', skills: ['wushuang'], position: { x: 4, y: 7 }, hand: [slash] }, player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [dodge], equipment: { armor: bagua } } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().activateBagua()
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'slash', requiredCount: 1, armorChecked: true })
    useGameStore.getState().respond(dodge.id)
    const state = useGameStore.getState()
    expect(state.pendingResponse).toBeNull()
    expect(state.units.player.hp).toBe(5)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.discard).toEqual(expect.arrayContaining([judgement, dodge]))
  })

  it('requires an AI defender to add a Dodge after a successful Bagua judgement against Wushuang', () => {
    const slash = card('slash', 'heart'), bagua = card('bagua'), judgement = card('peach', 'heart'), dodge = card('dodge', 'diamond')
    useGameStore.setState(state => ({
      deck: [judgement], discard: [],
      units: {
        ...state.units,
        player: { ...state.units.player, skill: 'wushuang', skills: ['wushuang'], position: { x: 4, y: 8 }, hand: [slash] },
        north: { ...state.units.north, position: { x: 4, y: 7 }, hand: [dodge], equipment: { armor: bagua } },
      },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(4)
    expect(state.units.north.hand).toEqual([])
    expect(state.discard).toEqual(expect.arrayContaining([judgement, dodge, slash]))
    expect(state.message).toContain('八卦阵')
  })

  it('lets Wushuang hit an AI defender with no second Dodge after Bagua succeeds', () => {
    const slash = card('slash', 'heart'), bagua = card('bagua'), judgement = card('peach', 'heart')
    useGameStore.setState(state => ({
      deck: [judgement], discard: [],
      units: {
        ...state.units,
        player: { ...state.units.player, skill: 'wushuang', skills: ['wushuang'], position: { x: 4, y: 8 }, hand: [slash] },
        north: { ...state.units.north, position: { x: 4, y: 7 }, hand: [], equipment: { armor: bagua } },
      },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(3)
    expect(state.discard).toEqual(expect.arrayContaining([judgement, slash]))
  })

  it('retains fire damage after a failed Bagua judgement', () => {
    const fireSlash = card('fireSlash', 'heart'), bagua = card('bagua'), blackJudge = card('duel', 'spade')
    useGameStore.setState(state => ({
      currentUnit: 'east', phase: 'ai', deck: [blackJudge], discard: [],
      units: {
        ...state.units,
        east: { ...state.units.east, position: { x: 1, y: 0 }, hand: [fireSlash], equipment: { weapon: card('greenDragon') } },
        player: { ...state.units.player, position: { x: 1, y: 1 }, hand: [], equipment: { armor: bagua } },
      },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: fireSlash.id, target: 'player' })
    useGameStore.getState().activateBagua()
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'slash', originCardId: fireSlash.id, armorChecked: true })
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(3)
    expect(state.units.player.animation).toBe('fireHit')
  })

  it('checks the original black Slash against Renwang Shield after Double Sword discards', () => {
    const blackSlash = card('slash', 'club'), sword = card('doubleSword'), shield = card('shield'), redPayment = card('peach', 'heart')
    useGameStore.setState(state => ({ units: {
      ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [blackSlash], equipment: { weapon: sword } },
      north: { ...state.units.north, position: { x: 4, y: 0 }, gender: 'female', hand: [redPayment], equipment: { armor: shield } },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: blackSlash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(4)
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.discard).toEqual(expect.arrayContaining([blackSlash, redPayment]))
    expect(state.message).toContain('仁王盾')
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

  it('lets a dying player use wine to rescue only themselves', () => {
    const enemySlash = card('slash'), wine = card('wine', 'spade')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: { ...state.units, east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [enemySlash] }, player: { ...state.units.player, position: { x: 4, y: 8 }, hp: 1, hand: [wine] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: enemySlash.id, target: 'player' })
    useGameStore.getState().respond(null)
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'dying', target: 'player' })
    useGameStore.getState().respond(wine.id)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(1)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.discard).toContainEqual(wine)
    expect(state.message).toContain('【酒】自救')
  })

  it('does not allow wine to rescue another character', () => {
    const slash = card('slash'), wine = card('wine')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, position: { x: 8, y: 3 }, hand: [slash, wine] }, east: { ...state.units.east, position: { x: 8, y: 4 }, hp: 1, hand: [] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'east' })
    const state = useGameStore.getState()
    expect(state.pendingResponse).toBeNull()
    expect(state.units.east.hp).toBe(0)
    expect(state.units.player.hand).toContainEqual(wine)
  })

  it('requires enough peaches to recover from negative health', () => {
    const slash = card('slash', 'heart'), firstPeach = card('peach', 'heart', 3), secondPeach = card('peach', 'diamond', 4)
    useGameStore.setState(state => ({
      currentUnit: 'east', phase: 'ai',
      units: { ...state.units, east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash], drunk: true }, player: { ...state.units.player, position: { x: 4, y: 8 }, hp: 1, hand: [firstPeach, secondPeach] }, north: { ...state.units.north, hand: [] } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().respond(null)
    let state = useGameStore.getState()
    expect(state.units.player.hp).toBe(-1)
    expect(state.pendingResponse).toMatchObject({ effect: 'dying', requiredCount: 2 })

    useGameStore.getState().respond(firstPeach.id)
    state = useGameStore.getState()
    expect(state.units.player.hp).toBe(0)
    expect(state.pendingResponse).toMatchObject({ effect: 'dying', requiredCount: 1 })

    useGameStore.getState().respond(secondPeach.id)
    state = useGameStore.getState()
    expect(state.units.player.hp).toBe(1)
    expect(state.pendingResponse).toBeNull()
    expect(state.discard).toEqual(expect.arrayContaining([firstPeach, secondPeach]))
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

  it('refreshes claimed battlefield facilities when a new round begins', () => {
    const state = useGameStore.getState()
    const claimed = { ...state, mapObjects: state.mapObjects.map(object => ({ ...object, claimed: true })) }
    const midRound = beginTurn(claimed, 'north')
    expect(midRound.mapObjects.every(object => object.claimed)).toBe(true)
    const refreshed = beginTurn(claimed, 'player')
    expect(refreshed.mapObjects.every(object => !object.claimed)).toBe(true)
    expect(refreshed.history.some(entry => entry.includes('重新补给'))).toBe(true)
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

  it('uses a scout beacon to reveal the nearest hidden identity', () => {
    const payment = card('dodge')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, position: { x: 0, y: 8 }, hand: [payment] } } }))
    useGameStore.getState().dispatch({ type: 'INTERACT', unit: 'player', objectId: 'west-beacon', cardId: payment.id })
    const state = useGameStore.getState()
    expect(state.units.west.revealed).toBe(true)
    expect(state.units.north.revealed).toBe(false)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.discard).toContainEqual(payment)
    expect(state.mapObjects.find(item => item.id === 'west-beacon')?.claimed).toBe(true)
    expect(state.message).toContain('【内奸】')
  })

  it('does not consume a scout beacon when every identity is revealed', () => {
    const payment = card('slash')
    useGameStore.setState(state => ({ units: Object.fromEntries(Object.entries(state.units).map(([id, unit]) => [id, { ...unit, revealed: true, ...(id === 'player' ? { position: { x: 0, y: 8 }, hand: [payment] } : {}) }])) as typeof state.units }))
    useGameStore.getState().dispatch({ type: 'INTERACT', unit: 'player', objectId: 'west-beacon', cardId: payment.id })
    const state = useGameStore.getState()
    expect(state.units.player.hand).toContainEqual(payment)
    expect(state.mapObjects.find(item => item.id === 'west-beacon')?.claimed).toBe(false)
  })

  it('forces an armed target to slash through Borrowed Sword', () => {
    const trick = card('borrowedSword'), weapon = card('qinggang'), forcedSlash = card('slash')
    useGameStore.setState(state => ({ units: {
      ...state.units,
      player: { ...state.units.player, hand: [trick] },
      north: { ...state.units.north, position: { x: 4, y: 1 }, hand: [forcedSlash], equipment: { weapon } },
      east: { ...state.units.east, position: { x: 4, y: 2 }, hand: [] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: trick.id, target: 'north', targets: ['north', 'east'] })
    const state = useGameStore.getState()
    expect(state.units.east.hp).toBe(3)
    expect(state.units.north.hand).toHaveLength(0)
    expect(state.units.north.equipment.weapon).toEqual(weapon)
    expect(state.discard.map(item => item.id)).toEqual(expect.arrayContaining([trick.id, forcedSlash.id]))
  })

  it('takes the weapon when Borrowed Sword target cannot slash', () => {
    const trick = card('borrowedSword'), weapon = card('greenDragon')
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hand: [trick] }, north: { ...state.units.north, hand: [], equipment: { weapon } }, east: { ...state.units.east, position: { x: 4, y: 1 } } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: trick.id, target: 'north', targets: ['north', 'east'] })
    const state = useGameStore.getState()
    expect(state.units.north.equipment.weapon).toBeUndefined()
    expect(state.units.player.hand).toContainEqual(weapon)
    expect(state.message).toContain('获得其')
  })

  it('uses the player-designated Borrowed Sword victim and rejects invalid choices', () => {
    const trick = card('borrowedSword'), weapon = card('qinggang'), forcedSlash = card('slash')
    useGameStore.setState(state => ({ units: {
      ...state.units,
      player: { ...state.units.player, hand: [trick] },
      north: { ...state.units.north, position: { x: 4, y: 1 }, hand: [forcedSlash], equipment: { weapon } },
      east: { ...state.units.east, position: { x: 4, y: 2 }, hand: [] },
      west: { ...state.units.west, position: { x: 5, y: 1 }, hand: [], skill: 'kurou', skills: ['kurou'] },
    } }))
    useGameStore.getState().selectCard(trick.id)
    useGameStore.getState().selectBorrowedSwordWielder('north')
    expect(useGameStore.getState().borrowedSwordWielder).toBe('north')
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: trick.id, target: 'north', targets: ['north', 'north'] })
    expect(useGameStore.getState().units.player.hand).toContainEqual(trick)
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: trick.id, target: 'north', targets: ['north', 'west'] })
    const state = useGameStore.getState()
    expect(state.borrowedSwordWielder).toBeNull()
    expect(state.units.west.hp).toBe(3)
    expect(state.units.east.hp).toBe(4)
    expect(state.units.north.hand).toHaveLength(0)
  })

  it('lets the player designate themselves as the Borrowed Sword victim and dodge', () => {
    const trick = card('borrowedSword'), weapon = card('qinggang'), forcedSlash = card('slash'), dodge = card('dodge', 'diamond')
    useGameStore.setState(state => ({ units: {
      ...state.units,
      player: { ...state.units.player, hand: [trick, dodge] },
      north: { ...state.units.north, position: { x: 4, y: 7 }, hand: [forcedSlash], equipment: { weapon }, attacksUsed: 1 },
    } }))
    useGameStore.getState().selectCard(trick.id)
    useGameStore.getState().selectBorrowedSwordWielder('north')
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: trick.id, target: 'north', targets: ['north', 'player'] })
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'slash', source: 'north', required: 'dodge' })
    useGameStore.getState().respond(dodge.id)
    const state = useGameStore.getState()
    expect(state.pendingResponse).toBeNull()
    expect(state.units.player.hp).toBe(5)
    expect(state.units.north.attacksUsed).toBe(1)
    expect(state.units.north.equipment.weapon).toEqual(weapon)
  })

  it('damages the player if they decline the Borrowed Sword Slash', () => {
    const trick = card('borrowedSword'), weapon = card('qinggang'), forcedSlash = card('slash')
    useGameStore.setState(state => ({ units: {
      ...state.units,
      player: { ...state.units.player, hand: [trick] },
      north: { ...state.units.north, position: { x: 4, y: 7 }, hand: [forcedSlash], equipment: { weapon } },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: trick.id, target: 'north', targets: ['north', 'player'] })
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(4)
    expect(state.units.north.attacksUsed).toBe(0)
  })

  it('lets Renwang Shield block a black Slash forced by Borrowed Sword', () => {
    const trick = card('borrowedSword'), weapon = card('greenDragon'), shield = card('shield'), forcedSlash = card('slash', 'spade')
    useGameStore.setState(state => ({ units: {
      ...state.units,
      player: { ...state.units.player, hand: [trick], equipment: { armor: shield } },
      north: { ...state.units.north, position: { x: 4, y: 7 }, hand: [forcedSlash], equipment: { weapon } },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: trick.id, target: 'north', targets: ['north', 'player'] })
    const state = useGameStore.getState()
    expect(state.pendingResponse).toBeNull()
    expect(state.units.player.hp).toBe(5)
    expect(state.units.north.attacksUsed).toBe(0)
  })

  it('lets an armed player choose the forced Slash without consuming their own attack quota', () => {
    const trick = card('borrowedSword'), weapon = card('qinggang'), forcedSlash = card('slash')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: {
      ...state.units,
      east: { ...state.units.east, hand: [trick] },
      player: { ...state.units.player, hand: [forcedSlash], equipment: { weapon }, attacksUsed: 1 },
      west: { ...state.units.west, position: { x: 4, y: 7 }, hand: [], skill: 'kurou', skills: ['kurou'] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: trick.id, target: 'player' })
    useGameStore.getState().respond(null)
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'borrowedSword', required: 'slash' })
    useGameStore.getState().respond(forcedSlash.id)
    const state = useGameStore.getState()
    expect(state.pendingResponse).toBeNull()
    expect(state.units.west.hp).toBe(3)
    expect(state.units.player.attacksUsed).toBe(1)
    expect(state.units.player.equipment.weapon).toEqual(weapon)
  })

  it('lets Guan Yu answer Borrowed Sword with red non-weapon equipment', () => {
    useGameStore.getState().selectGeneral('wusheng')
    const weapon = card('qinggang'), mount = card('redHare', 'heart')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', pendingResponse: { effect: 'borrowedSword', source: 'east', target: 'player', required: 'slash', prompt: '借刀杀人' }, units: {
      ...state.units,
      east: { ...state.units.east, hand: [] },
      player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [], equipment: { weapon, offensiveMount: mount } },
      west: { ...state.units.west, position: { x: 4, y: 7 }, hand: [], skill: 'kurou', skills: ['kurou'] },
    } }))
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'borrowedSword' })
    useGameStore.getState().respond(mount.id)
    const state = useGameStore.getState()
    expect(state.units.player.equipment.offensiveMount).toBeUndefined()
    expect(state.units.player.equipment.weapon).toEqual(weapon)
    expect(state.discard).toContainEqual(mount)
    expect(state.units.west.hp).toBe(3)
  })

  it('lets Guan Yu use the borrowed red weapon as Slash at adjacent range', () => {
    useGameStore.getState().selectGeneral('wusheng')
    const weapon = card('greenDragon', 'heart')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', pendingResponse: { effect: 'borrowedSword', source: 'east', target: 'player', required: 'slash', prompt: '借刀杀人' }, units: { ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [], equipment: { weapon } },
      west: { ...state.units.west, position: { x: 4, y: 7 }, hand: [], skill: 'kurou', skills: ['kurou'] },
    } }))
    expect(borrowedSwordChoices(useGameStore.getState(), 'east', 'player')).toContainEqual(weapon)
    useGameStore.getState().respond(weapon.id)
    const state = useGameStore.getState()
    expect(state.units.player.equipment.weapon).toBeUndefined()
    expect(state.units.west.hp).toBe(3)
    expect(state.units.east.hand).not.toContainEqual(weapon)
    expect(state.discard).toContainEqual(weapon)
  })

  it('rejects Wusheng payment of the borrowed weapon when losing its range would miss', () => {
    useGameStore.getState().selectGeneral('wusheng')
    const weapon = card('greenDragon', 'heart')
    useGameStore.setState(state => ({ pendingResponse: { effect: 'borrowedSword', source: 'east', target: 'player', required: 'slash', prompt: '借刀杀人' }, units: { ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [], equipment: { weapon } },
      west: { ...state.units.west, position: { x: 4, y: 6 }, hand: [], skill: 'kurou', skills: ['kurou'] },
    } }))
    expect(borrowedSwordChoices(useGameStore.getState(), 'east', 'player')).not.toContainEqual(weapon)
    useGameStore.getState().respond(weapon.id)
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'borrowedSword' })
    expect(useGameStore.getState().units.player.equipment.weapon).toEqual(weapon)
  })

  it('lets AI Guan Yu spend his red weapon when Borrowed Sword forces an adjacent Slash', () => {
    const trick = card('borrowedSword'), weapon = card('greenDragon', 'heart')
    useGameStore.setState(state => ({ units: { ...state.units,
      player: { ...state.units.player, hand: [trick] },
      north: { ...state.units.north, skill: 'wusheng', skills: ['wusheng'], position: { x: 4, y: 7 }, hand: [], equipment: { weapon } },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: trick.id, target: 'north', targets: ['north', 'player'] })
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'slash', source: 'north' })
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.north.equipment.weapon).toBeUndefined()
    expect(state.discard).toContainEqual(weapon)
    expect(state.units.player.hp).toBe(4)
  })

  it('transfers the weapon when the player declines Borrowed Sword', () => {
    const trick = card('borrowedSword'), weapon = card('qinggang'), forcedSlash = card('slash')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: {
      ...state.units,
      east: { ...state.units.east, hand: [trick] },
      player: { ...state.units.player, hand: [forcedSlash], equipment: { weapon } },
      west: { ...state.units.west, position: { x: 4, y: 7 }, hand: [] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: trick.id, target: 'player' })
    useGameStore.getState().respond(null)
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.player.equipment.weapon).toBeUndefined()
    expect(state.units.player.hand).toContainEqual(forcedSlash)
    expect(state.units.east.hand).toContainEqual(weapon)
    expect(state.units.west.hp).toBe(4)
  })

  it('triggers Xiaoji when Borrowed Sword takes Sun Shangxiang weapon', () => {
    useGameStore.getState().selectGeneral('jieyin')
    const trick = card('borrowedSword'), weapon = card('qinggang'), forcedSlash = card('slash'), first = card('dodge'), second = card('peach')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', deck: [first, second], discard: [], units: {
      ...state.units,
      east: { ...state.units.east, hand: [trick] },
      player: { ...state.units.player, hand: [forcedSlash], equipment: { weapon } },
      west: { ...state.units.west, position: { x: 4, y: 7 }, hand: [] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: trick.id, target: 'player' })
    useGameStore.getState().respond(null)
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.player.equipment.weapon).toBeUndefined()
    expect(state.units.player.hand).toEqual([forcedSlash, first, second])
    expect(state.units.east.hand).toContainEqual(weapon)
    expect(state.message).toContain('枭姬')
  })

  it('does not spend Borrowed Sword when the armed target has no legal victim', () => {
    const trick = card('borrowedSword'), weapon = card('qinggang')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: {
      ...state.units,
      east: { ...state.units.east, hand: [trick] },
      player: { ...state.units.player, equipment: { weapon } },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: trick.id, target: 'player' })
    expect(useGameStore.getState().units.east.hand).toContainEqual(trick)
    expect(useGameStore.getState().pendingResponse).toBeNull()
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
    useGameStore.setState(state)
    expect(useGameStore.getState().pendingLuoshen).toEqual({ gained: 0 })
    useGameStore.getState().chooseLuoshen(true)
    expect(useGameStore.getState().pendingLuoshen).toEqual({ gained: 1 })
    useGameStore.getState().chooseLuoshen(true)
    expect(useGameStore.getState().pendingLuoshen).toEqual({ gained: 2 })
    useGameStore.getState().chooseLuoshen(true)
    const result = useGameStore.getState()
    expect(result.units.player.hand).toEqual([blackA, blackB, drawA, drawB])
    expect(result.discard).toContainEqual(redStop)
    expect(result.pendingLuoshen).toBeNull()
    expect(result.turnStage).toBe('play')
    expect(result.history.some(entry => entry.includes('洛神') && entry.includes('2 张牌'))).toBe(true)
  })

  it('lets Zhen Ji stop Luoshen after a black judgement and keep the next card for the draw phase', () => {
    useGameStore.getState().selectGeneral('luoshen')
    const black = card('duel', 'spade'), nextCard = card('peach', 'heart'), drawB = card('slash', 'club')
    useGameStore.setState(state => ({ deck: [black, nextCard, drawB], discard: [], units: { ...state.units, player: { ...state.units.player, hand: [] } } }))
    useGameStore.getState().chooseLuoshen(true)
    expect(useGameStore.getState().units.player.hand).toEqual([black])
    useGameStore.getState().chooseLuoshen(false)
    const result = useGameStore.getState()
    expect(result.units.player.hand).toEqual([black, nextCard, drawB])
    expect(result.discard).not.toContainEqual(nextCard)
    expect(result.pendingLuoshen).toBeNull()
  })

  it('lets Zhen Ji skip Luoshen before revealing a judgement card', () => {
    useGameStore.getState().selectGeneral('luoshen')
    const first = card('duel', 'spade'), second = card('slash', 'club')
    useGameStore.setState({ deck: [first, second], discard: [] })
    useGameStore.getState().chooseLuoshen(false)
    const result = useGameStore.getState()
    expect(result.pendingLuoshen).toBeNull()
    expect(result.units.player.hand).toEqual(expect.arrayContaining([first, second]))
    expect(result.discard).not.toContainEqual(first)
  })

  it('lets Zhen Ji use a black hand card as dodge through Qingguo', () => {
    useGameStore.getState().selectGeneral('luoshen')
    useGameStore.getState().chooseLuoshen(false)
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

  it('lets Da Qiao use a diamond equipped card for Guose', () => {
    useGameStore.getState().selectGeneral('guose')
    const equipped = card('crossbow', 'diamond', 1)
    useGameStore.setState(state => ({ units: { ...state.units, player: { ...state.units.player, hand: [], equipment: { weapon: equipped } }, east: { ...state.units.east, hand: [] } } }))
    useGameStore.getState().activateGuose()
    useGameStore.getState().selectCard(equipped.id)
    expect(useGameStore.getState().selectedAsGuose).toBe(true)
    expect(useGameStore.getState().selectedCardId).toBe(equipped.id)
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: equipped.id, target: 'east', asGuose: true })
    const state = useGameStore.getState()
    expect(state.units.player.equipment.weapon).toBeUndefined()
    expect(state.units.east.judgement).toContainEqual({ ...equipped, kind: 'indulgence' })
    expect(state.discard.some(card => card.id === equipped.id)).toBe(false)
  })

  it('lets AI Da Qiao use a diamond equipped card for Guose', async () => {
    const equipped = card('crossbow', 'diamond', 1)
    useGameStore.setState(state => ({ currentUnit: 'north', phase: 'ai', turnStage: 'play', scores: { ...state.scores, north: 2 }, units: { ...state.units,
      north: { ...state.units.north, skill: 'guose', skills: ['guose', 'liuli'], position: state.controlPoint, hand: [], equipment: { weapon: equipped } },
      east: { ...state.units.east, hand: [] },
    } }))
    await useGameStore.getState().runAI()
    const state = useGameStore.getState()
    expect(state.units.north.equipment.weapon).toBeUndefined()
    expect(state.units.east.judgement).toContainEqual({ ...equipped, kind: 'indulgence' })
    expect(state.history.some(entry => entry.includes('国色'))).toBe(true)
  })

  it.each(['crossbow', 'paoxiao'] as const)('lets AI use multiple slashes with %s', async ability => {
    const first = card('slash'), second = card('slash', 'heart')
    useGameStore.setState(state => ({ currentUnit: 'north', phase: 'ai', turnStage: 'play', scores: { ...state.scores, north: 2 }, units: { ...state.units,
      north: { ...state.units.north, skill: ability === 'paoxiao' ? 'paoxiao' : 'longdan', skills: ability === 'paoxiao' ? ['paoxiao'] : ['longdan'], position: state.controlPoint, hand: [first, second], equipment: ability === 'crossbow' ? { weapon: card('crossbow', 'diamond') } : {} },
      east: { ...state.units.east, position: { x: 4, y: 5 }, hand: [] },
    } }))
    await useGameStore.getState().runAI()
    const state = useGameStore.getState()
    expect(state.units.east.hp).toBe(2)
    expect(state.units.north.attacksUsed).toBe(2)
    expect(state.discard).toEqual(expect.arrayContaining([first, second]))
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
    expect(useGameStore.getState().pendingLiuli).toMatchObject({ source: 'east', originCardId: slash.id })
    expect(useGameStore.getState().units.player.hand).toContainEqual(payment)
    useGameStore.getState().chooseLiuli(payment.id, 'north')
    const state = useGameStore.getState()
    expect(state.pendingLiuli).toBeNull()
    expect(state.units.player.hp).toBe(4)
    expect(state.units.player.hand).toHaveLength(0)
    expect(state.units.north.hp).toBe(3)
    expect(state.units.east.attacksUsed).toBe(1)
    expect(state.history.some(entry => entry.includes('流离'))).toBe(true)
  })

  it('lets Da Qiao decline Liuli and answer the original slash with Dodge', () => {
    useGameStore.getState().selectGeneral('guose')
    const slash = card('slash', 'heart'), dodge = card('dodge')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: {
      ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [dodge] },
      east: { ...state.units.east, position: { x: 3, y: 8 }, hand: [slash] },
      north: { ...state.units.north, position: { x: 4, y: 7 }, hand: [] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().chooseLiuli(null)
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'slash', source: 'east', target: 'player' })
    useGameStore.getState().respond(dodge.id)
    const state = useGameStore.getState()
    expect(state.pendingResponse).toBeNull()
    expect(state.units.player.hp).toBe(4)
    expect(state.units.north.hp).toBe(4)
    expect(state.discard).toContainEqual(dodge)
  })

  it('lets Da Qiao discard equipment for Liuli without spending a hand card', () => {
    useGameStore.getState().selectGeneral('guose')
    const slash = card('slash', 'heart'), shield = card('shield'), held = card('peach')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: {
      ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [held], equipment: { armor: shield } },
      east: { ...state.units.east, position: { x: 3, y: 8 }, hand: [slash] },
      north: { ...state.units.north, position: { x: 4, y: 7 }, hand: [] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().chooseLiuli(shield.id, 'north')
    const state = useGameStore.getState()
    expect(state.units.player.equipment.armor).toBeUndefined()
    expect(state.units.player.hand).toEqual([held])
    expect(state.units.north.hp).toBe(3)
    expect(state.discard).toContainEqual(shield)
  })

  it('lets AI Da Qiao redirect Slash by discarding equipment when she has no hand cards', () => {
    const slash = card('slash', 'heart'), shield = card('shield', 'spade')
    useGameStore.setState(state => ({ units: { ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [slash] },
      north: { ...state.units.north, skill: 'guose', skills: ['guose', 'liuli'], position: { x: 4, y: 0 }, hand: [], equipment: { armor: shield } },
      east: { ...state.units.east, position: { x: 5, y: 0 }, hand: [], equipment: {} },
    } } ))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(4)
    expect(state.units.north.equipment.armor).toBeUndefined()
    expect(state.discard).toContainEqual(shield)
    expect(state.units.east.hp).toBeLessThan(4)
    expect(state.history.some(entry => entry.includes('流离'))).toBe(true)
  })

  it('does not let AI Liuli use a weapon that would leave the redirected target out of range', () => {
    const slash = card('slash', 'heart'), weapon = card('qinggang', 'spade')
    useGameStore.setState(state => ({ units: { ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [slash] },
      north: { ...state.units.north, skill: 'guose', skills: ['guose', 'liuli'], position: { x: 4, y: 0 }, hand: [], equipment: { weapon } },
      east: { ...state.units.east, position: { x: 6, y: 0 }, hand: [], equipment: {} },
      west: { ...state.units.west, position: { x: 8, y: 8 }, hand: [], equipment: {} },
    } } ))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBeLessThan(4)
    expect(state.units.north.equipment.weapon).toEqual(weapon)
    expect(state.discard).not.toContainEqual(weapon)
  })

  it('does not offer Liuli when discarding the only weapon would put every target out of range', () => {
    useGameStore.getState().selectGeneral('guose')
    const slash = card('slash', 'heart'), weapon = card('greenDragon')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: {
      ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [], equipment: { weapon } },
      east: { ...state.units.east, position: { x: 3, y: 8 }, hand: [slash] },
      north: { ...state.units.north, position: { x: 4, y: 6 }, hand: [] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    const state = useGameStore.getState()
    expect(state.pendingLiuli).toBeNull()
    expect(state.pendingResponse).toMatchObject({ effect: 'slash', target: 'player' })
    expect(state.units.player.equipment.weapon).toEqual(weapon)
  })

  it('offers Liuli against a Slash forced by Borrowed Sword', () => {
    useGameStore.getState().selectGeneral('guose')
    const trick = card('borrowedSword'), slash = card('slash', 'heart'), weapon = card('greenDragon'), payment = card('peach')
    useGameStore.setState(state => ({ currentUnit: 'east', phase: 'ai', units: {
      ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [payment] },
      north: { ...state.units.north, identity: 'rebel', position: { x: 4, y: 7 }, hand: [slash], equipment: { weapon } },
      east: { ...state.units.east, position: { x: 3, y: 8 }, hand: [trick] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: trick.id, target: 'north' })
    expect(useGameStore.getState().pendingLiuli).toMatchObject({ source: 'north', originCardId: slash.id, forcedSlashAttacksUsed: 0 })
    useGameStore.getState().chooseLiuli(payment.id, 'east')
    const state = useGameStore.getState()
    expect(state.pendingLiuli).toBeNull()
    expect(state.units.east.hp).toBe(3)
    expect(state.units.player.hp).toBe(4)
    expect(state.units.north.attacksUsed).toBe(0)
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

  it('does not let Lianying return the resolving card to Lu Xun', () => {
    useGameStore.getState().selectGeneral('qianxun')
    const trick = card('drawTwo'), reward = card('peach')
    useGameStore.setState(state => ({ deck: [], discard: [reward], units: { ...state.units, player: { ...state.units.player, hand: [trick] } } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: trick.id })
    const state = useGameStore.getState()
    expect(state.units.player.hand).toEqual([reward])
    expect(state.discard).toContainEqual(trick)
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

  it('draws through Lianying after AI Lu Xun automatically spends his last Dodge', () => {
    const slash = card('slash'), dodge = card('dodge'), reward = card('peach')
    useGameStore.setState(state => ({ deck: [reward], discard: [], units: { ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [slash] },
      north: { ...state.units.north, name: '陆逊', position: { x: 4, y: 0 }, skill: 'qianxun', skills: ['qianxun', 'lianying'], hand: [dodge] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(4)
    expect(state.units.north.hand).toEqual([reward])
    expect(state.history.some(entry => entry.includes('连营'))).toBe(true)
  })

  it('draws through Lianying when Double Sword discards AI Lu Xun final card', () => {
    const slash = card('slash'), weapon = card('doubleSword'), payment = card('peach'), reward = card('dodge')
    useGameStore.setState(state => ({ deck: [reward], discard: [], units: { ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [slash], equipment: { weapon } },
      north: { ...state.units.north, name: '陆逊', gender: 'female', position: { x: 4, y: 0 }, skill: 'qianxun', skills: ['qianxun', 'lianying'], hand: [payment] },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'north' })
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(4)
    expect(state.units.north.hand).toHaveLength(1)
    expect(state.history.some(entry => entry.includes('连营'))).toBe(true)
  })

  it('draws through Lianying after AI Lu Xun spends his final two cards with Stone Axe', () => {
    const slash = card('slash'), costA = card('peach'), costB = card('nullify'), dodge = card('dodge'), axe = card('axe'), reward = card('drawTwo')
    useGameStore.setState(state => ({ currentUnit: 'north', phase: 'ai', deck: [reward], discard: [], units: { ...state.units,
      player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [dodge] },
      north: { ...state.units.north, name: '陆逊', position: { x: 4, y: 7 }, skill: 'qianxun', skills: ['qianxun', 'lianying'], hand: [slash, costA, costB], equipment: { weapon: axe } },
    } }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'north', cardId: slash.id, target: 'player' })
    useGameStore.getState().respond(dodge.id)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(4)
    expect(state.units.north.hand).toEqual([reward])
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

  it('lets wounded AI Sun Quan exchange Silver Lion through Zhiheng', async () => {
    const lion = card('silverLion', 'heart'), fresh = card('nullify', 'spade')
    useGameStore.setState(state => ({ deck: [fresh], discard: [], currentUnit: 'north', phase: 'ai', turnStage: 'play', scores: { ...state.scores, north: 2 }, units: {
      ...state.units,
      north: { ...state.units.north, skill: 'zhiheng', skills: ['zhiheng', 'jiuyuan'], position: state.controlPoint, hp: 2, maxHp: 4, hand: [], equipment: { armor: lion } },
    } }))
    await useGameStore.getState().runAI()
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.north.equipment.armor).toBeUndefined()
    expect(state.units.north.hand).toContainEqual(fresh)
    expect(state.discard).toContainEqual(lion)
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

  it('lets AI Sun Shangxiang use Jieyin at full health for a wounded ally', async () => {
    const first = card('nullify'), second = card('nullify', 'heart')
    useGameStore.setState(state => ({ currentUnit: 'north', phase: 'ai', turnStage: 'play', scores: { ...state.scores, north: 2 }, units: {
      ...state.units,
      player: { ...state.units.player, hp: 3 },
      north: { ...state.units.north, skill: 'jieyin', skills: ['jieyin', 'xiaoji'], position: state.controlPoint, hp: 3, maxHp: 3, hand: [first, second] },
    } }))
    await useGameStore.getState().runAI()
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.player.hp).toBe(4)
    expect(state.units.north.skillUsed).toBe(true)
    expect(state.discard).toEqual(expect.arrayContaining([first, second]))
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

  it('lets AI Zhou Yu use Fanjian against an enemy', async () => {
    const gift = card('nullify', 'spade')
    useGameStore.setState(state => ({ currentUnit: 'north', phase: 'ai', turnStage: 'play', scores: { ...state.scores, north: 2 }, units: {
      ...state.units,
      north: { ...state.units.north, skill: 'yingzi', skills: ['yingzi', 'fanjian'], position: state.controlPoint, hand: [gift] },
      player: { ...state.units.player, hand: [] },
    } }))
    await useGameStore.getState().runAI()
    const state = useGameStore.getState()
    expect(state.units.north.skillUsed).toBe(true)
    expect(state.units.east.hand).toContainEqual(gift)
    expect(state.history.some(entry => entry.includes('反间'))).toBe(true)
  })

  it('lets AI Liu Bei give two cards and recover through Rende', async () => {
    const first = card('nullify'), second = card('nullify', 'heart')
    useGameStore.setState(state => ({ currentUnit: 'north', phase: 'ai', turnStage: 'play', scores: { ...state.scores, north: 2 }, units: {
      ...state.units,
      north: { ...state.units.north, skill: 'rende', skills: ['rende', 'jijiang'], position: state.controlPoint, hp: 2, maxHp: 4, hand: [first, second] },
      player: { ...state.units.player, hand: [] },
    } }))
    await useGameStore.getState().runAI()
    const state = useGameStore.getState()
    expect(state.units.north.hp).toBe(3)
    expect(state.units.north.rendeGiven).toBe(2)
    expect(state.units.player.hand).toEqual(expect.arrayContaining([first, second]))
    expect(state.history.filter(entry => entry.includes('仁德')).length).toBeGreaterThanOrEqual(2)
  })

  it('lets AI Diao Chan make two male enemies duel through Lijian', async () => {
    const payment = card('nullify')
    useGameStore.setState(state => ({ deck: [card('nullify', 'heart')], discard: [], currentUnit: 'north', phase: 'ai', turnStage: 'play', scores: { ...state.scores, north: 2 }, units: {
      ...state.units,
      north: { ...state.units.north, skill: 'lijian', skills: ['lijian', 'biyue'], position: state.controlPoint, hand: [payment] },
      east: { ...state.units.east, gender: 'male', hand: [] },
      west: { ...state.units.west, gender: 'male', hand: [] },
    } }))
    await useGameStore.getState().runAI()
    const state = useGameStore.getState()
    expect(state.units.north.skillUsed).toBe(true)
    expect(state.units.west.hp).toBe(3)
    expect(state.discard).toContainEqual(payment)
    expect(state.history.some(entry => entry.includes('离间'))).toBe(true)
  })

  it('preserves elemental slash nature when AI attacks', async () => {
    const fireSlash = card('fireSlash', 'heart')
    useGameStore.setState(state => ({
      currentUnit: 'north', phase: 'ai', turnStage: 'play',
      units: {
        ...state.units,
        north: { ...state.units.north, identity: 'rebel', position: { x: 1, y: 0 }, hand: [fireSlash], equipment: { weapon: card('qinggang') }, movement: 0 },
        player: { ...state.units.player, position: { x: 1, y: 1 }, hand: [] },
        east: { ...state.units.east, hp: 0 },
        west: { ...state.units.west, hp: 0 },
      },
    }))
    await useGameStore.getState().runAI()
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'slash', source: 'north', target: 'player' })
    useGameStore.getState().respond(null)
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(3)
    expect(state.units.player.animation).toBe('fireHit')
  })

  it('reveals a Harvest pool and lets the player choose before AI seats', () => {
    const harvest = card('harvest'), peach = card('peach', 'heart'), dodge = card('dodge'), slash = card('slash'), weapon = card('qinggang')
    useGameStore.setState(state => ({
      deck: [peach, dodge, slash, weapon], discard: [],
      units: Object.fromEntries(Object.entries(state.units).map(([id, unit]) => [id, { ...unit, hand: id === 'player' ? [harvest] : [] }])) as typeof state.units,
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: harvest.id })
    expect(useGameStore.getState().pendingHarvest?.pool).toHaveLength(4)
    useGameStore.getState().chooseHarvest(peach.id)
    const state = useGameStore.getState()
    expect(state.pendingHarvest).toBeNull()
    expect(state.units.player.hand).toContainEqual(peach)
    expect([state.units.north.hand.length, state.units.east.hand.length, state.units.west.hand.length]).toEqual([1, 1, 1])
  })

  it('lets preceding AI seats choose Harvest cards before the player', () => {
    const harvest = card('harvest'), peach = card('peach', 'heart'), dodge = card('dodge'), slash = card('slash'), weapon = card('qinggang')
    useGameStore.setState(state => ({
      currentUnit: 'north', phase: 'ai', turnStage: 'play', deck: [peach, dodge, slash, weapon], discard: [],
      units: Object.fromEntries(Object.entries(state.units).map(([id, unit]) => [id, { ...unit, hand: id === 'north' ? [harvest] : [] }])) as typeof state.units,
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'north', cardId: harvest.id })
    const pending = useGameStore.getState().pendingHarvest
    expect(pending?.order).toEqual(['player'])
    expect(pending?.pool).toHaveLength(1)
    expect(useGameStore.getState().units.north.hand).toHaveLength(1)
    expect(useGameStore.getState().units.east.hand).toHaveLength(1)
    expect(useGameStore.getState().units.west.hand).toHaveLength(1)
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'nullify', trick: 'harvest' })
    useGameStore.getState().respond(null)
    useGameStore.getState().chooseHarvest(pending!.pool[0].id)
    expect(useGameStore.getState().pendingHarvest).toBeNull()
    expect(useGameStore.getState().units.player.hand).toHaveLength(1)
  })

  it('lets a player nullify their Harvest pick without denying later seats', () => {
    const harvest = card('harvest'), nullify = card('nullify'), pool = [card('peach'), card('dodge'), card('slash'), card('qinggang')]
    useGameStore.setState(state => ({
      currentUnit: 'east', phase: 'ai', turnStage: 'play', deck: pool, discard: [],
      units: Object.fromEntries(Object.entries(state.units).map(([id, unit]) => [id, { ...unit, hand: id === 'east' ? [harvest] : id === 'player' ? [nullify] : [] }])) as typeof state.units,
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: harvest.id })
    const before = useGameStore.getState()
    expect(before.pendingResponse).toMatchObject({ effect: 'nullify', trick: 'harvest' })
    expect(before.pendingHarvest?.order).toEqual(['player', 'north'])
    useGameStore.getState().chooseHarvest(before.pendingHarvest!.pool[0].id)
    expect(useGameStore.getState().units.player.hand).toEqual([nullify])
    useGameStore.getState().respond(nullify.id)
    const after = useGameStore.getState()
    expect(after.pendingHarvest).toBeNull()
    expect(after.units.player.hand).toHaveLength(0)
    expect(after.units.north.hand).toHaveLength(1)
    expect(after.discard).toContainEqual(nullify)
  })

  it('keeps the Harvest pick available when the source counters nullify', () => {
    const harvest = card('harvest'), nullify = card('nullify'), counter = card('nullify', 'club')
    const pool = [card('peach'), card('dodge'), card('slash'), card('qinggang')]
    useGameStore.setState(state => ({
      currentUnit: 'north', phase: 'ai', turnStage: 'play', deck: pool, discard: [],
      units: Object.fromEntries(Object.entries(state.units).map(([id, unit]) => [id, { ...unit, hand: id === 'north' ? [harvest, counter] : id === 'player' ? [nullify] : [] }])) as typeof state.units,
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'north', cardId: harvest.id })
    useGameStore.getState().respond(nullify.id)
    const state = useGameStore.getState()
    expect(state.pendingResponse).toBeNull()
    expect(state.pendingHarvest?.order).toEqual(['player'])
    useGameStore.getState().chooseHarvest(state.pendingHarvest!.pool[0].id)
    expect(useGameStore.getState().units.player.hand).toHaveLength(1)
    expect(useGameStore.getState().discard).toEqual(expect.arrayContaining([nullify, counter]))
  })

  it('never reshuffles the resolving Harvest card into its own pool', () => {
    const harvest = card('harvest'), onlyDeckCard = card('peach', 'heart'), oldDiscardA = card('dodge'), oldDiscardB = card('slash'), oldDiscardC = card('qinggang')
    useGameStore.setState(state => ({
      deck: [onlyDeckCard], discard: [oldDiscardA, oldDiscardB, oldDiscardC],
      units: Object.fromEntries(Object.entries(state.units).map(([id, unit]) => [id, { ...unit, hand: id === 'player' ? [harvest] : [] }])) as typeof state.units,
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: harvest.id })
    const state = useGameStore.getState()
    expect(state.pendingHarvest?.pool).toHaveLength(4)
    expect(state.pendingHarvest?.pool.some(card => card.id === harvest.id)).toBe(false)
    expect(state.discard).toContainEqual(harvest)
  })

  it('lets the player guess before revealing an AI Fanjian card', () => {
    const gift = card('dodge', 'heart', 8)
    useGameStore.setState(state => ({
      currentUnit: 'north', phase: 'ai', turnStage: 'play',
      units: { ...state.units, north: { ...state.units.north, skill: 'yingzi', skills: ['yingzi', 'fanjian'], hand: [gift] }, player: { ...state.units.player, hand: [] } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'north', cardId: gift.id, target: 'player', asFanjian: true })
    let state = useGameStore.getState()
    expect(state.pendingFanjian).toMatchObject({ source: 'north', card: gift })
    expect(state.units.player.hand).not.toContainEqual(gift)
    useGameStore.getState().chooseFanjianSuit('spade')
    state = useGameStore.getState()
    expect(state.pendingFanjian).toBeNull()
    expect(state.units.player.hand).toContainEqual(gift)
    expect(state.units.player.hp).toBe(4)
    expect(state.message).toContain('猜错')
  })

  it('prevents Fanjian damage when the player guesses the suit', () => {
    const gift = card('slash', 'club', 6)
    useGameStore.setState(state => ({
      currentUnit: 'north', phase: 'ai', turnStage: 'play',
      units: { ...state.units, north: { ...state.units.north, skill: 'yingzi', skills: ['yingzi', 'fanjian'], hand: [gift] }, player: { ...state.units.player, hand: [] } },
    }))
    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'north', cardId: gift.id, target: 'player', asFanjian: true })
    useGameStore.getState().chooseFanjianSuit('club')
    const state = useGameStore.getState()
    expect(state.units.player.hp).toBe(5)
    expect(state.units.player.hand).toContainEqual(gift)
    expect(state.message).toContain('猜中')
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import type { Card } from '../types'
import { createInitialState } from './rules'
import { beginTurn, useGameStore } from './store'

let sequence = 0
const card = (kind: Card['kind'], suit: Card['suit'], rank = 7): Card => ({ id: `judge-${++sequence}`, kind, suit, rank })

describe('player Guicai judgement window', () => {
  beforeEach(() => {
    useGameStore.setState(createInitialState(Array.from({ length: 30 }, () => card('slash', 'club'))))
    useGameStore.getState().selectGeneral('feedback')
  })

  it('pauses Indulgence, spends the chosen card, and resumes the draw phase', () => {
    const delayed = card('indulgence', 'club')
    const replacement = card('dodge', 'heart')
    const retained = card('slash', 'spade')
    const original = card('slash', 'spade')
    const state = useGameStore.getState()
    const pending = beginTurn({ ...state, deck: [original, card('slash', 'club'), card('slash', 'diamond')], units: { ...state.units, player: { ...state.units.player, hand: [replacement, retained], judgement: [delayed] } } }, 'player')
    expect(pending.pendingJudgement?.original).toEqual(original)
    expect(pending.units.player.hand).toEqual([replacement, retained])
    useGameStore.setState(pending)
    useGameStore.getState().chooseJudgementCard(replacement.id)
    const resolved = useGameStore.getState()
    expect(resolved.pendingJudgement).toBeNull()
    expect(resolved.turnStage).toBe('play')
    expect(resolved.units.player.hand).toContainEqual(retained)
    expect(resolved.units.player.hand).not.toContainEqual(replacement)
    expect(resolved.discard).toEqual(expect.arrayContaining([delayed, original, replacement]))
  })

  it('allows keeping the original judgement and does not spend a hand card', () => {
    const delayed = card('indulgence', 'club')
    const held = card('dodge', 'heart')
    const original = card('slash', 'heart')
    const state = useGameStore.getState()
    useGameStore.setState(beginTurn({ ...state, deck: [original, card('slash', 'club'), card('slash', 'diamond')], units: { ...state.units, player: { ...state.units.player, hand: [held], judgement: [delayed] } } }, 'player'))
    useGameStore.getState().chooseJudgementCard(null)
    const resolved = useGameStore.getState()
    expect(resolved.units.player.hand).toContainEqual(held)
    expect(resolved.turnStage).toBe('play')
    expect(resolved.discard).toEqual(expect.arrayContaining([delayed, original]))
  })

  it('lets Guicai prevent Lightning and pass it to the next living seat', () => {
    const delayed = card('lightning', 'spade')
    const replacement = card('dodge', 'heart')
    const original = card('slash', 'spade', 5)
    const state = useGameStore.getState()
    useGameStore.setState(beginTurn({ ...state, deck: [original, card('slash', 'club'), card('slash', 'diamond')], units: { ...state.units, player: { ...state.units.player, hand: [replacement], judgement: [delayed] } } }, 'player'))
    expect(useGameStore.getState().pendingJudgement).toMatchObject({ kind: 'delayed', delayed })
    useGameStore.getState().chooseJudgementCard(replacement.id)
    const resolved = useGameStore.getState()
    expect(resolved.units.player.hp).toBe(state.units.player.hp)
    expect(resolved.units.north.judgement).toContainEqual(delayed)
    expect(resolved.discard).toEqual(expect.arrayContaining([original, replacement]))
    expect(resolved.discard).not.toContainEqual(delayed)
  })

  it('lets Guicai make Lightning hit its target', () => {
    const delayed = card('lightning', 'spade')
    const replacement = card('slash', 'spade', 5)
    const original = card('dodge', 'heart')
    const state = useGameStore.getState()
    useGameStore.setState(beginTurn({ ...state, deck: [original, card('slash', 'club'), card('slash', 'diamond')], units: { ...state.units, player: { ...state.units.player, hand: [replacement], judgement: [delayed] } } }, 'player'))
    useGameStore.getState().chooseJudgementCard(replacement.id)
    const resolved = useGameStore.getState()
    expect(resolved.units.player.hp).toBe(state.units.player.hp - 3)
    expect(resolved.units.north.judgement).not.toContainEqual(delayed)
    expect(resolved.discard).toEqual(expect.arrayContaining([delayed, original, replacement]))
  })

  it('can intervene in an opponent Lightning judgement and resume that turn', () => {
    const delayed = card('lightning', 'spade')
    const replacement = card('slash', 'spade', 5)
    const original = card('dodge', 'heart')
    const state = useGameStore.getState()
    const waiting = beginTurn({ ...state, deck: [original, card('slash', 'club'), card('slash', 'diamond')], units: {
      ...state.units,
      player: { ...state.units.player, hand: [replacement] },
      north: { ...state.units.north, judgement: [delayed] },
    } }, 'north')
    expect(waiting.pendingJudgement?.team).toBe('north')
    useGameStore.setState(waiting)
    useGameStore.getState().chooseJudgementCard(replacement.id)
    const resolved = useGameStore.getState()
    expect(resolved.units.north.hp).toBe(state.units.north.hp - 3)
    expect(resolved.currentUnit).toBe('north')
    expect(resolved.phase).toBe('ai')
  })

  it('waits for a Peach rescue before the Lightning victim draws turn cards', () => {
    const delayed = card('lightning', 'spade')
    const replacement = card('slash', 'spade', 5)
    const peach = card('peach', 'heart')
    const original = card('dodge', 'heart')
    const drawA = card('slash', 'club'), drawB = card('dodge', 'diamond')
    const state = useGameStore.getState()
    useGameStore.setState(beginTurn({ ...state, deck: [original, drawA, drawB], units: {
      ...state.units,
      player: { ...state.units.player, hand: [replacement, peach] },
      north: { ...state.units.north, hp: 3, hand: [], judgement: [delayed] },
    } }, 'north'))
    useGameStore.getState().chooseJudgementCard(replacement.id)
    const waiting = useGameStore.getState()
    expect(waiting.pendingResponse?.effect).toBe('dying')
    expect(waiting.pendingTurnStart?.team).toBe('north')
    expect(waiting.units.north.hand).toHaveLength(0)
    expect(waiting.deck).toEqual([drawA, drawB])
    useGameStore.getState().respond(peach.id)
    const resolved = useGameStore.getState()
    expect(resolved.pendingTurnStart).toBeNull()
    expect(resolved.pendingResponse).toBeNull()
    expect(resolved.units.north.hp).toBe(1)
    expect(resolved.units.north.hand).toEqual([drawA, drawB])
  })

  it('skips a character killed by Lightning instead of dealing turn cards to the dead', () => {
    const delayed = card('lightning', 'spade')
    const hit = card('slash', 'spade', 5)
    const drawA = card('slash', 'club'), drawB = card('dodge', 'diamond')
    const state = useGameStore.getState()
    const waiting = beginTurn({ ...state, deck: [hit, drawA, drawB], units: {
      ...state.units,
      player: { ...state.units.player, hand: [card('dodge', 'club')] },
      north: { ...state.units.north, hp: 2, hand: [], judgement: [delayed] },
    } }, 'north')
    expect(waiting.pendingJudgement?.team).toBe('north')
    useGameStore.setState(waiting)
    useGameStore.getState().chooseJudgementCard(null)
    const resolved = useGameStore.getState()
    expect(resolved.units.north.hp).toBeLessThanOrEqual(0)
    expect(resolved.units.north.hand).toHaveLength(0)
    expect(resolved.currentUnit).toBe('east')
  })

  it('lets Sima Yi replace a failed Bagua judgement with a red hand card', () => {
    const slash = card('slash', 'club')
    const bagua = card('bagua', 'spade', 2)
    const blackJudge = card('duel', 'spade')
    const replacement = card('peach', 'heart')
    const retained = card('dodge', 'diamond')
    const state = useGameStore.getState()
    const hp = state.units.player.hp
    useGameStore.setState({
      ...state,
      currentUnit: 'east', phase: 'ai', deck: [blackJudge], discard: [],
      units: {
        ...state.units,
        east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash] },
        player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [replacement, retained], equipment: { armor: bagua } },
      },
    })

    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().activateBagua()
    const waiting = useGameStore.getState()
    expect(waiting.pendingResponse).toBeNull()
    expect(waiting.pendingJudgement).toMatchObject({ kind: 'bagua', original: blackJudge })

    useGameStore.getState().chooseJudgementCard(replacement.id)
    const resolved = useGameStore.getState()
    expect(resolved.pendingJudgement).toBeNull()
    expect(resolved.pendingResponse).toBeNull()
    expect(resolved.units.player.hp).toBe(hp)
    expect(resolved.units.player.hand).toEqual([retained])
    expect(resolved.discard).toEqual(expect.arrayContaining([slash, blackJudge, replacement]))
    expect(resolved.history.some(entry => entry.includes('鬼才') && entry.includes('八卦阵'))).toBe(true)
  })

  it('can keep a black Bagua judgement and then answer with Dodge', () => {
    const slash = card('slash', 'club')
    const bagua = card('bagua', 'spade', 2)
    const blackJudge = card('duel', 'club')
    const dodge = card('dodge', 'diamond')
    const state = useGameStore.getState()
    useGameStore.setState({
      ...state,
      currentUnit: 'east', phase: 'ai', deck: [blackJudge], discard: [],
      units: {
        ...state.units,
        east: { ...state.units.east, position: { x: 4, y: 7 }, hand: [slash] },
        player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [dodge], equipment: { armor: bagua } },
      },
    })

    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().activateBagua()
    useGameStore.getState().chooseJudgementCard(null)
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'slash', armorChecked: true })
    expect(useGameStore.getState().units.player.hand).toContainEqual(dodge)

    useGameStore.getState().respond(dodge.id)
    const resolved = useGameStore.getState()
    expect(resolved.pendingResponse).toBeNull()
    expect(resolved.units.player.hand).not.toContainEqual(dodge)
    expect(resolved.discard).toEqual(expect.arrayContaining([blackJudge, dodge]))
  })

  it('counts a red Guicai replacement as one Dodge against Wushuang', () => {
    const slash = card('slash', 'club')
    const bagua = card('bagua', 'spade', 2)
    const blackJudge = card('duel', 'club')
    const replacement = card('peach', 'heart')
    const dodge = card('dodge', 'diamond')
    const state = useGameStore.getState()
    useGameStore.setState({
      ...state,
      currentUnit: 'east', phase: 'ai', deck: [blackJudge], discard: [],
      units: {
        ...state.units,
        east: { ...state.units.east, skill: 'wushuang', skills: ['wushuang'], position: { x: 4, y: 7 }, hand: [slash] },
        player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [replacement, dodge], equipment: { armor: bagua } },
      },
    })

    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().activateBagua()
    useGameStore.getState().chooseJudgementCard(replacement.id)
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'slash', armorChecked: true, requiredCount: 1 })
    useGameStore.getState().respond(dodge.id)
    expect(useGameStore.getState().pendingResponse).toBeNull()
  })

  it('lets Sima Yi turn Tieqi red so the player cannot use Dodge', () => {
    const slash = card('slash', 'club')
    const blackJudge = card('duel', 'spade')
    const replacement = card('peach', 'heart')
    const dodge = card('dodge', 'diamond')
    const state = useGameStore.getState()
    const hp = state.units.player.hp
    useGameStore.setState({
      ...state,
      currentUnit: 'east', phase: 'ai', deck: [blackJudge], discard: [],
      units: {
        ...state.units,
        east: { ...state.units.east, name: '马超', skill: 'tieqi', skills: ['mashu', 'tieqi'], position: { x: 4, y: 7 }, hand: [slash] },
        player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [replacement, dodge] },
      },
    })

    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    expect(useGameStore.getState().pendingJudgement).toMatchObject({ kind: 'tieqi', original: blackJudge })
    useGameStore.getState().chooseJudgementCard(replacement.id)

    const resolved = useGameStore.getState()
    expect(resolved.pendingJudgement).toBeNull()
    expect(resolved.pendingResponse).toBeNull()
    expect(resolved.units.player.hp).toBe(hp - 1)
    expect(resolved.units.player.hand).toContainEqual(dodge)
    expect(resolved.history.some(entry => entry.includes('鬼才') && entry.includes('铁骑'))).toBe(true)
  })

  it('lets Sima Yi turn Tieqi black and then answer the Slash with Dodge', () => {
    const slash = card('slash', 'heart')
    const redJudge = card('peach', 'heart')
    const replacement = card('duel', 'club')
    const dodge = card('dodge', 'diamond')
    const state = useGameStore.getState()
    const hp = state.units.player.hp
    useGameStore.setState({
      ...state,
      currentUnit: 'east', phase: 'ai', deck: [redJudge], discard: [],
      units: {
        ...state.units,
        east: { ...state.units.east, name: '马超', skill: 'tieqi', skills: ['mashu', 'tieqi'], position: { x: 4, y: 7 }, hand: [slash] },
        player: { ...state.units.player, position: { x: 4, y: 8 }, hand: [replacement, dodge] },
      },
    })

    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().chooseJudgementCard(replacement.id)
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'slash', required: 'dodge' })
    useGameStore.getState().respond(dodge.id)

    const resolved = useGameStore.getState()
    expect(resolved.pendingResponse).toBeNull()
    expect(resolved.units.player.hp).toBe(hp)
    expect(resolved.units.player.hand).not.toContainEqual(dodge)
  })

  it('can alter Tieqi when Ma Chao attacks another character', () => {
    const slash = card('slash', 'heart')
    const redJudge = card('peach', 'diamond')
    const replacement = card('duel', 'spade')
    const dodge = card('dodge', 'heart')
    const state = useGameStore.getState()
    const hp = state.units.east.hp
    useGameStore.setState({
      ...state,
      currentUnit: 'north', phase: 'ai', deck: [redJudge], discard: [],
      units: {
        ...state.units,
        player: { ...state.units.player, hand: [replacement] },
        north: { ...state.units.north, name: '马超', skill: 'tieqi', skills: ['mashu', 'tieqi'], position: { x: 4, y: 4 }, hand: [slash] },
        east: { ...state.units.east, position: { x: 4, y: 5 }, hand: [dodge] },
      },
    })

    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'north', cardId: slash.id, target: 'east' })
    expect(useGameStore.getState().pendingJudgement).toMatchObject({ kind: 'tieqi', team: 'north' })
    useGameStore.getState().chooseJudgementCard(replacement.id)

    const resolved = useGameStore.getState()
    expect(resolved.pendingJudgement).toBeNull()
    expect(resolved.units.east.hp).toBe(hp)
    expect(resolved.units.east.hand).not.toContainEqual(dodge)
    expect(resolved.discard).toEqual(expect.arrayContaining([redJudge, replacement, dodge]))
  })

  it('preserves a successful Tieqi lock through Double Sword resolution', () => {
    const slash = card('slash', 'club')
    const weapon = card('doubleSword', 'spade')
    const blackJudge = card('duel', 'club')
    const replacement = card('peach', 'heart')
    const payment = card('dodge', 'diamond')
    const state = useGameStore.getState()
    const hp = state.units.player.hp
    useGameStore.setState({
      ...state,
      currentUnit: 'east', phase: 'ai', deck: [blackJudge], discard: [],
      units: {
        ...state.units,
        east: { ...state.units.east, name: '马超', skill: 'tieqi', skills: ['mashu', 'tieqi'], gender: 'male', position: { x: 4, y: 7 }, hand: [slash], equipment: { weapon } },
        player: { ...state.units.player, gender: 'female', position: { x: 4, y: 8 }, hand: [replacement, payment] },
      },
    })

    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'east', cardId: slash.id, target: 'player' })
    useGameStore.getState().chooseJudgementCard(replacement.id)
    expect(useGameStore.getState().pendingDoubleSword).toMatchObject({ tieqiChecked: true, tieqiLocked: true })
    useGameStore.getState().chooseDoubleSword('discard', payment.id)

    const resolved = useGameStore.getState()
    expect(resolved.pendingDoubleSword).toBeNull()
    expect(resolved.pendingResponse).toBeNull()
    expect(resolved.units.player.hp).toBe(hp - 1)
  })

  it('lets Sima Yi turn Ganglie into a successful non-heart judgement', () => {
    const slash = card('slash', 'heart')
    const heartJudge = card('peach', 'heart')
    const replacement = card('duel', 'spade')
    const firstPayment = card('dodge', 'diamond')
    const secondPayment = card('peach', 'club')
    const state = useGameStore.getState()
    const hp = state.units.player.hp
    useGameStore.setState({
      ...state,
      deck: [heartJudge], discard: [],
      units: {
        ...state.units,
        player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [slash, replacement, firstPayment, secondPayment] },
        east: { ...state.units.east, name: '夏侯惇', skill: 'ganglie', skills: ['ganglie'], position: { x: 4, y: 0 }, hand: [] },
      },
    })

    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'east' })
    expect(useGameStore.getState().pendingJudgement).toMatchObject({ kind: 'ganglie', team: 'east', original: heartJudge })
    useGameStore.getState().chooseJudgementCard(replacement.id)
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'ganglie', requiredCount: 2 })
    useGameStore.getState().respond(firstPayment.id)
    useGameStore.getState().respond(secondPayment.id)

    const resolved = useGameStore.getState()
    expect(resolved.pendingResponse).toBeNull()
    expect(resolved.units.player.hp).toBe(hp)
    expect(resolved.units.player.hand).toEqual([])
    expect(resolved.discard).toEqual(expect.arrayContaining([slash, heartJudge, replacement, firstPayment, secondPayment]))
  })

  it('lets Sima Yi turn Ganglie into a failed heart judgement', () => {
    const slash = card('slash', 'club')
    const blackJudge = card('duel', 'spade')
    const replacement = card('peach', 'heart')
    const state = useGameStore.getState()
    const hp = state.units.player.hp
    useGameStore.setState({
      ...state,
      deck: [blackJudge], discard: [],
      units: {
        ...state.units,
        player: { ...state.units.player, position: { x: 4, y: 1 }, hand: [slash, replacement] },
        east: { ...state.units.east, name: '夏侯惇', skill: 'ganglie', skills: ['ganglie'], position: { x: 4, y: 0 }, hand: [] },
      },
    })

    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: slash.id, target: 'east' })
    useGameStore.getState().chooseJudgementCard(replacement.id)

    const resolved = useGameStore.getState()
    expect(resolved.pendingJudgement).toBeNull()
    expect(resolved.pendingResponse).toBeNull()
    expect(resolved.units.player.hp).toBe(hp)
    expect(resolved.message).toContain('【刚烈】判定为红桃，未生效')
    expect(resolved.history.some(entry => entry.includes('鬼才'))).toBe(true)
  })

  it('pauses a group trick for Guicai and resumes from the next unresolved seat', () => {
    const arrows = card('arrows', 'heart')
    const heartJudge = card('peach', 'heart')
    const replacement = card('duel', 'club')
    const firstPayment = card('dodge', 'diamond')
    const secondPayment = card('peach', 'spade')
    const state = useGameStore.getState()
    const eastHp = state.units.east.hp, westHp = state.units.west.hp
    useGameStore.setState({
      ...state,
      deck: [heartJudge], discard: [],
      units: {
        ...state.units,
        player: { ...state.units.player, hand: [arrows, replacement, firstPayment, secondPayment] },
        north: { ...state.units.north, name: '夏侯惇', skill: 'ganglie', skills: ['ganglie'], hand: [] },
        east: { ...state.units.east, skill: 'wusheng', skills: ['wusheng'], hand: [] },
        west: { ...state.units.west, skill: 'wusheng', skills: ['wusheng'], hand: [] },
      },
    })

    useGameStore.getState().dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: arrows.id, target: 'north' })
    const waiting = useGameStore.getState()
    expect(waiting.pendingJudgement).toMatchObject({ kind: 'ganglie', team: 'north' })
    expect(waiting.pendingGroupContinuation).toMatchObject({ kind: 'arrows', resolvedTargets: ['north'] })
    expect(waiting.units.east.hp).toBe(eastHp)
    expect(waiting.units.west.hp).toBe(westHp)

    useGameStore.getState().chooseJudgementCard(replacement.id)
    expect(useGameStore.getState().pendingResponse).toMatchObject({ effect: 'ganglie' })
    expect(useGameStore.getState().units.east.hp).toBe(eastHp)
    useGameStore.getState().respond(null)

    const resolved = useGameStore.getState()
    expect(resolved.pendingGroupContinuation).toBeNull()
    expect(resolved.units.east.hp).toBe(eastHp - 1)
    expect(resolved.units.west.hp).toBe(westHp - 1)
  })
})

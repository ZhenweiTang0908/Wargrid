import { describe, expect, it } from 'vitest'
import type { Card } from '../types'
import { createInitialState } from './rules'
import { audioEvents } from './audioEvents'

const card = (id: string, kind: Card['kind']): Card => ({ id, kind, suit: 'spade', rank: 7 })

describe('game audio cues', () => {
  it('announces a played Slash and its impact for either side', () => {
    const slash = card('attack', 'slash')
    const state = createInitialState([slash])
    const before = { ...state, generalSelected: true, units: { ...state.units, player: { ...state.units.player, hand: [] }, east: { ...state.units.east, hand: [slash] } } }
    const after = { ...before, discard: [slash], units: { ...before.units, east: { ...before.units.east, hand: [] }, player: { ...before.units.player, hp: 4 } } }
    expect(audioEvents(before, after)).toEqual([
      { type: 'effect', cue: 'card' }, { type: 'voice', cue: 'slash' }, { type: 'effect', cue: 'hit' },
    ])
  })

  it('announces a Dodge response and a Peach heal', () => {
    const dodge = card('dodge', 'dodge'), peach = card('peach', 'peach')
    const state = createInitialState([dodge, peach])
    const before = { ...state, generalSelected: true, units: { ...state.units, player: { ...state.units.player, hand: [dodge, peach], hp: 3 } } }
    const after = { ...before, discard: [dodge, peach], units: { ...before.units, player: { ...before.units.player, hand: [], hp: 4 } } }
    expect(audioEvents(before, after)).toEqual([
      { type: 'effect', cue: 'card' }, { type: 'voice', cue: 'dodge' },
      { type: 'effect', cue: 'card' }, { type: 'voice', cue: 'peach' }, { type: 'effect', cue: 'heal' },
    ])
  })

  it('announces equipment when it moves from hand into a slot', () => {
    const armor = card('armor', 'bagua')
    const state = createInitialState([armor])
    const before = { ...state, generalSelected: true, units: { ...state.units, player: { ...state.units.player, hand: [armor] } } }
    const after = { ...before, units: { ...before.units, player: { ...before.units.player, hand: [], equipment: { armor } } } }
    expect(audioEvents(before, after)).toEqual([{ type: 'effect', cue: 'card' }, { type: 'voice', cue: 'equipment' }])
  })

  it('keeps discard-stage payments quiet and distinguishes victory from defeat', () => {
    const slash = card('discarded', 'slash')
    const state = createInitialState([slash])
    const before = { ...state, generalSelected: true, turnStage: 'discard' as const, units: { ...state.units, player: { ...state.units.player, hand: [slash] } } }
    const after = { ...before, discard: [slash], winner: 'north' as const, units: { ...before.units, player: { ...before.units.player, hand: [] } } }
    expect(audioEvents(before, after)).toEqual([{ type: 'effect', cue: 'defeat' }, { type: 'voice', cue: 'defeat' }])
  })
})

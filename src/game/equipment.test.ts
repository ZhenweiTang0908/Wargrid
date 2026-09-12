import { expect, it } from 'vitest'
import type { Card } from '../types'
import { resolveEquipmentLoss } from './equipment'
import { createInitialState } from './rules'

it('does not trigger equipment-loss healing or draws after the owner has died', () => {
  const state = createInitialState()
  const lion: Card = { id: 'lost-lion', kind: 'silverLion', suit: 'club', rank: 1 }
  const deck: Card[] = [{ id: 'reward', kind: 'peach', suit: 'heart', rank: 3 }]
  const owner = { ...state.units.player, hp: 0, skills: ['xiaoji' as const] }
  const result = resolveEquipmentLoss(owner, [lion], deck, [])
  expect(result).toMatchObject({ hp: 0, healed: false, drawn: [], deck })
})

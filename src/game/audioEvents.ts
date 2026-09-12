import type { Card, CardKind, GameState } from '../types'

export type VoiceCue = 'slash' | 'dodge' | 'peach' | 'nullify' | 'duel' | 'arrows' | 'barbarians' | 'harvest' | 'peachGarden' | 'drawTwo' | 'indulgence' | 'lightning' | 'equipment' | 'victory' | 'defeat'
export type EffectCue = 'card' | 'move' | 'hit' | 'heal' | 'victory' | 'defeat'
export type AudioEvent = { type: 'voice'; cue: VoiceCue } | { type: 'effect'; cue: EffectCue }

const cardVoice: Partial<Record<CardKind, VoiceCue>> = {
  slash: 'slash', fireSlash: 'slash', thunderSlash: 'slash', dodge: 'dodge', peach: 'peach',
  nullify: 'nullify', duel: 'duel', arrows: 'arrows', barbarians: 'barbarians',
  harvest: 'harvest', peachGarden: 'peachGarden', drawTwo: 'drawTwo', indulgence: 'indulgence', lightning: 'lightning',
  crossbow: 'equipment', qinggang: 'equipment', greenDragon: 'equipment', spear: 'equipment', axe: 'equipment',
  halberd: 'equipment', qilinBow: 'equipment', doubleSword: 'equipment', iceSword: 'equipment', shield: 'equipment',
  bagua: 'equipment', silverLion: 'equipment', redHare: 'equipment', dayuan: 'equipment', zixing: 'equipment',
  dilu: 'equipment', jueying: 'equipment', zhaohuang: 'equipment', gudingBlade: 'equipment', vermilionFan: 'equipment',
}

export function audioEvents(previous: GameState, next: GameState): AudioEvent[] {
  if (!previous.generalSelected || !next.generalSelected || previous === next) return []
  const events: AudioEvent[] = []
  const nextDiscard = new Set(next.discard.map(card => card.id))
  const nextJudgement = new Set(Object.values(next.units).flatMap(unit => unit.judgement.map(card => card.id)))
  if (previous.turnStage !== 'discard') {
    for (const team of previous.turnOrder) {
      const nextEquipment = new Set(Object.values(next.units[team].equipment).filter((card): card is Card => !!card).map(card => card.id))
      const spent = previous.units[team].hand.filter(card => nextDiscard.has(card.id) || nextEquipment.has(card.id) || nextJudgement.has(card.id))
      for (const card of spent.slice(0, 2)) {
        const voice = previous.selectedAsSlash && team === 'player' ? 'slash'
          : previous.selectedAsGuose && team === 'player' ? 'indulgence'
            : cardVoice[card.kind]
        events.push({ type: 'effect', cue: 'card' })
        if (voice) events.push({ type: 'voice', cue: voice })
      }
    }
  }
  for (const team of previous.turnOrder) {
    if (next.units[team].hp < previous.units[team].hp) events.push({ type: 'effect', cue: 'hit' })
    else if (next.units[team].hp > previous.units[team].hp) events.push({ type: 'effect', cue: 'heal' })
    if (next.units[team].position.x !== previous.units[team].position.x || next.units[team].position.y !== previous.units[team].position.y) events.push({ type: 'effect', cue: 'move' })
  }
  if (!previous.winner && next.winner) {
    const cue = next.winner === 'player' ? 'victory' : 'defeat'
    events.push({ type: 'effect', cue }, { type: 'voice', cue })
  }
  return events
}

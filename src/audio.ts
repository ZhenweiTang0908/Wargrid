import type { AudioEvent, EffectCue, VoiceCue } from './game/audioEvents'

let enabled = true
let context: AudioContext | null = null
let master: GainNode | null = null
let nextVoiceAt = 0
const voiceBuffers = new Map<VoiceCue, Promise<AudioBuffer>>()

const voiceCues: VoiceCue[] = [
  'slash', 'dodge', 'peach', 'nullify', 'duel', 'arrows', 'barbarians', 'harvest',
  'peachGarden', 'drawTwo', 'indulgence', 'lightning', 'equipment', 'victory', 'defeat',
]

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null
  if (!context) {
    context = new AudioContext()
    master = context.createGain()
    master.gain.value = enabled ? 0.8 : 0
    master.connect(context.destination)
  }
  return context
}

export function unlockAudio() {
  const ctx = audioContext()
  if (!ctx) return
  void ctx.resume()
  for (const cue of voiceCues) void loadVoice(cue)
}

export function setAudioEnabled(value: boolean) {
  enabled = value
  if (master && context) master.gain.setTargetAtTime(value ? 0.8 : 0, context.currentTime, 0.02)
  if (value) unlockAudio()
}

function loadVoice(cue: VoiceCue): Promise<AudioBuffer> {
  let pending = voiceBuffers.get(cue)
  if (!pending) {
    const ctx = audioContext()!
    pending = fetch(`/audio/${cue}.mp3`)
      .then(response => {
        if (!response.ok) throw new Error(`Audio ${cue}: ${response.status}`)
        return response.arrayBuffer()
      })
      .then(data => ctx.decodeAudioData(data))
    voiceBuffers.set(cue, pending)
    pending.catch(() => voiceBuffers.delete(cue))
  }
  return pending
}

function playVoice(cue: VoiceCue) {
  const ctx = context
  if (!ctx || !master || ctx.state !== 'running') return
  void loadVoice(cue).then(buffer => {
    if (!enabled || !context || !master || context.state !== 'running') return
    const start = Math.max(context.currentTime, nextVoiceAt)
    if (start - context.currentTime > 1.8) return
    const source = context.createBufferSource()
    const gain = context.createGain()
    source.buffer = buffer
    gain.gain.value = cue === 'victory' || cue === 'defeat' ? 0.95 : 0.75
    source.connect(gain).connect(master)
    source.start(start)
    nextVoiceAt = start + Math.min(buffer.duration, 1.3) * 0.85
  }).catch(() => {})
}

function tone(ctx: AudioContext, frequency: number, endFrequency: number, duration: number, volume: number, start: number, type: OscillatorType = 'sine') {
  if (!master) return
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration)
  gain.gain.setValueAtTime(Math.max(0.0001, volume), start)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(gain).connect(master)
  oscillator.start(start)
  oscillator.stop(start + duration)
}

function playEffect(cue: EffectCue) {
  const ctx = context
  if (!ctx || ctx.state !== 'running') return
  const now = ctx.currentTime
  if (cue === 'card') tone(ctx, 440, 260, 0.085, 0.1, now, 'triangle')
  if (cue === 'move') tone(ctx, 115, 68, 0.07, 0.055, now, 'triangle')
  if (cue === 'hit') {
    tone(ctx, 145, 50, 0.24, 0.25, now, 'sawtooth')
    tone(ctx, 52, 30, 0.29, 0.18, now)
  }
  if (cue === 'heal') {
    tone(ctx, 392, 587, 0.23, 0.11, now)
    tone(ctx, 587, 880, 0.3, 0.09, now + 0.1)
  }
  if (cue === 'victory') for (const [index, note] of [392, 494, 587, 784].entries()) tone(ctx, note, note * 1.02, 0.48, 0.12, now + index * 0.13)
  if (cue === 'defeat') for (const [index, note] of [392, 330, 262].entries()) tone(ctx, note, note * 0.82, 0.45, 0.13, now + index * 0.18)
}

export function playAudioEvents(events: AudioEvent[]) {
  if (!enabled || !context || context.state !== 'running') return
  let effects = 0, voices = 0
  for (const event of events) {
    if (event.type === 'effect' && effects++ < 3) playEffect(event.cue)
    if (event.type === 'voice' && voices++ < 2) playVoice(event.cue)
  }
}

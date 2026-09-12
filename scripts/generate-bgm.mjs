// Deterministic, original procedural score. Run with `node scripts/generate-bgm.mjs`.
// Outputs seamless PCM masters; the app ships the compact MP3 encodes.
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const rate = 22050
const output = 'public/audio/bgm'
mkdirSync(output, { recursive: true })

function noise(x) {
  const n = Math.sin(x * 127.1 + 19.19) * 43758.5453
  return (n - Math.floor(n)) * 2 - 1
}

function noteFrequency(n) { return 146.832 * 2 ** (n / 12) }

function score(config) {
  const seconds = 32 * 60 / config.bpm
  const length = Math.round(seconds * rate)
  const signal = new Float64Array(length)
  const beat = 60 / config.bpm
  function add(startBeat, pitch, beats, amp, voice) {
    if (pitch === null) return
    const start = startBeat * beat
    const duration = beats * beat
    const samples = Math.floor(duration * rate)
    const frequency = noteFrequency(pitch)
    for (let i = 0; i < samples; i++) {
      const time = i / rate
      const p = time / duration
      let value
      if (voice === 'guqin') {
        const envelope = (1 - Math.exp(-time * 55)) * Math.exp(-time * 4.6 / beat)
        value = envelope * (Math.sin(2 * Math.PI * frequency * time) + .38 * Math.sin(2 * Math.PI * frequency * 2 * time) + .12 * Math.sin(2 * Math.PI * frequency * 3 * time))
      } else if (voice === 'xiao') {
        const envelope = Math.min(1, time * 24) * Math.min(1, (duration - time) * 8)
        const vibrato = .0035 * Math.sin(2 * Math.PI * 5.2 * time)
        value = envelope * (Math.sin(2 * Math.PI * frequency * time * (1 + vibrato)) + .11 * Math.sin(2 * Math.PI * frequency * 3 * time))
      } else if (voice === 'bell') {
        const envelope = (1 - Math.exp(-time * 100)) * Math.exp(-time * 6.5 / beat)
        value = envelope * (Math.sin(2 * Math.PI * frequency * time) + .28 * Math.sin(2 * Math.PI * frequency * 2.71 * time))
      } else if (voice === 'drum') {
        const envelope = Math.exp(-time * 32)
        value = envelope * (.62 * Math.sin(2 * Math.PI * (frequency * .43 - time * 70) * time) + .38 * noise(i + startBeat * 911))
      } else {
        const envelope = Math.min(1, time * 8) * Math.min(1, (duration - time) * 4)
        value = envelope * (Math.sin(2 * Math.PI * frequency * time) + .24 * Math.sin(2 * Math.PI * frequency * 2 * time))
      }
      const index = (Math.round(start * rate) + i) % length
      signal[index] += value * amp
    }
  }

  for (let bar = 0; bar < 8; bar++) {
    const root = config.roots[bar]
    const b = bar * 4
    add(b, root - 12, 3.7, config.bass, 'pad')
    add(b, root, 2.4, config.chord, 'guqin')
    add(b + 2, root + 7, 1.7, config.chord * .7, 'guqin')
    if (config.drums) {
      add(b, -8, .43, config.drums, 'drum')
      add(b + 2, -4, .28, config.drums * .67, 'drum')
      for (let step = 0; step < 8; step++) add(b + step * .5, 12, .13, config.drums * (step % 2 ? .09 : .15), 'bell')
    }
  }
  for (let step = 0; step < 64; step++) {
    const pitch = config.melody[step % config.melody.length]
    const b = step * .5
    if (pitch !== null) add(b, pitch + (step >= 32 && config.lift ? 12 : 0), .45, config.lead, config.voice)
    if (config.answer && step % 8 === 5) add(b, pitch === null ? 12 : pitch - 12, 1.15, config.lead * .37, 'bell')
  }
  // Exact loop boundary: every note's natural tail wraps to the beginning.
  let peak = 0
  for (const sample of signal) peak = Math.max(peak, Math.abs(sample))
  const gain = .76 / Math.max(peak, 1)
  const pcm = Buffer.alloc(length * 2)
  for (let i = 0; i < length; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, signal[i] * gain)) * 32767), i * 2)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  const wav = `${output}/${config.name}.wav`
  writeFileSync(wav, Buffer.concat([header, pcm]))
  const encoded = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '96k', `${output}/${config.name}.mp3`], { stdio: 'inherit' })
  if (encoded.status !== 0) throw new Error(`Could not encode ${config.name}; install ffmpeg.`)
  unlinkSync(wav)
}

score({ name: 'mist-and-banners', bpm: 76, roots: [0, 0, 3, 3, -2, -2, 0, 0], bass: .07, chord: .14, lead: .18, voice: 'xiao', answer: true,
  melody: [12, null, 15, 17, 19, null, 17, 15, 12, null, 10, 12, 15, null, 12, null, 10, null, 12, 15, 17, null, 15, 12, 10, null, 7, 10, 12, null, 10, null] })
score({ name: 'crossing-blades', bpm: 112, roots: [0, 0, -2, -2, 3, 3, 0, 0], bass: .1, chord: .18, lead: .2, voice: 'guqin', drums: .17, lift: false,
  melody: [12, 15, 17, null, 19, 17, 15, 12, 10, 12, 15, 17, 19, null, 17, null, 15, 17, 19, 22, 24, 22, 19, 17, 15, 12, 10, 12, 15, null, 12, null] })
score({ name: 'last-stand', bpm: 94, roots: [0, -2, -5, -2, 0, -2, -5, 0], bass: .14, chord: .11, lead: .21, voice: 'bell', drums: .2, answer: true,
  melody: [12, null, 13, 12, 10, null, 7, null, 12, 13, 17, null, 15, 13, 12, null, 10, null, 12, 13, 17, null, 19, null, 17, 15, 13, 12, 10, null, 7, null] })

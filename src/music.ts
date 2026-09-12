export type MusicScene = 'menu' | 'battle' | 'danger' | 'result'

const tracks = {
  menu: '/audio/bgm/mist-and-banners.mp3',
  battle: '/audio/bgm/crossing-blades.mp3',
  danger: '/audio/bgm/last-stand.mp3',
} as const

let scene: MusicScene = 'menu'
let enabled = true
let unlocked = false
let frame = 0
let lastTime = 0
const players = new Map<keyof typeof tracks, HTMLAudioElement>()

function player(key: keyof typeof tracks) {
  let audio = players.get(key)
  if (!audio) {
    audio = new Audio(tracks[key])
    audio.loop = true
    audio.preload = 'auto'
    audio.volume = 0
    players.set(key, audio)
  }
  return audio
}

function activeTrack(): keyof typeof tracks | null {
  if (!unlocked || !enabled) return null
  return scene === 'danger' ? 'danger' : scene === 'battle' ? 'battle' : scene === 'menu' ? 'menu' : null
}

function update(time: number) {
  const delta = Math.min(.1, (time - (lastTime || time)) / 1000)
  lastTime = time
  const active = activeTrack()
  let changing = false
  for (const [key, audio] of players) {
    const target = key === active ? (key === 'menu' ? .29 : key === 'danger' ? .33 : .36) : 0
    audio.volume += (target - audio.volume) * Math.min(1, delta * 2.5)
    if (Math.abs(audio.volume - target) > .002) changing = true
    else audio.volume = target
    if (audio.volume === 0 && key !== active) audio.pause()
  }
  frame = changing ? requestAnimationFrame(update) : 0
}

function refresh() {
  if (typeof Audio === 'undefined') return
  const active = activeTrack()
  if (active) void player(active).play().catch(() => {})
  if (!frame) { lastTime = 0; frame = requestAnimationFrame(update) }
}

export function unlockMusic() {
  unlocked = true
  refresh()
}

export function setMusicEnabled(value: boolean) {
  enabled = value
  refresh()
}

export function setMusicScene(value: MusicScene) {
  if (scene === value) return
  scene = value
  refresh()
}

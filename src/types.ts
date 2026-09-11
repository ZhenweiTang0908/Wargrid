export type Team = 'player' | 'enemy'
export type CardKind = 'slash' | 'dodge' | 'peach'
export type Phase = 'player' | 'ai' | 'finished'
export type AnimationKind = 'idle' | 'move' | 'attack' | 'hit' | 'heal'

export interface Position { x: number; y: number }
export interface Card { id: string; kind: CardKind }

export interface Unit {
  id: Team
  name: string
  team: Team
  position: Position
  hp: number
  maxHp: number
  hand: Card[]
  movement: number
  attacksUsed: number
  animation: AnimationKind
}

export interface PendingAttack {
  attacker: Team
  target: Team
}

export interface GameState {
  size: number
  obstacles: Position[]
  controlPoint: Position
  units: Record<Team, Unit>
  deck: Card[]
  discard: Card[]
  phase: Phase
  turn: number
  scores: Record<Team, number>
  selectedUnit: Team | null
  selectedCardId: string | null
  reachable: Position[]
  pathPreview: Position[]
  pendingAttack: PendingAttack | null
  winner: Team | null
  message: string
}

export type GameAction =
  | { type: 'MOVE'; unit: Team; to: Position }
  | { type: 'PLAY_CARD'; unit: Team; cardId: string; target?: Team }
  | { type: 'RESPOND'; unit: Team; cardId?: string }
  | { type: 'END_TURN' }
  | { type: 'RESTART' }

export const CARD_LABEL: Record<CardKind, string> = {
  slash: '杀', dodge: '闪', peach: '桃',
}

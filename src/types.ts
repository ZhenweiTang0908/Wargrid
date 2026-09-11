export type Team = 'player' | 'north' | 'east' | 'west'
export type Identity = 'lord' | 'loyalist' | 'rebel' | 'renegade'
export type Suit = 'spade' | 'heart' | 'club' | 'diamond'
export type CardKind =
  | 'slash' | 'dodge' | 'peach' | 'wine'
  | 'duel' | 'dismantle' | 'snatch' | 'drawTwo'
  | 'arrows' | 'barbarians' | 'nullify' | 'indulgence' | 'lightning'
  | 'peachGarden' | 'harvest'
  | 'crossbow' | 'qinggang' | 'spear' | 'axe' | 'halberd' | 'qilinBow'
  | 'shield' | 'bagua' | 'redHare' | 'dilu'
export type Phase = 'player' | 'ai' | 'finished'
export type TurnStage = 'prepare' | 'draw' | 'play' | 'discard' | 'finish'
export type AnimationKind = 'idle' | 'move' | 'attack' | 'hit' | 'heal' | 'cast'
export type TerrainKind = 'plain' | 'forest' | 'water' | 'ridge' | 'road' | 'camp'
export type EquipmentSlot = 'weapon' | 'armor' | 'offensiveMount' | 'defensiveMount'
export type GeneralSkill = 'wusheng' | 'longdan' | 'ganglie' | 'feedback'

export interface Position { x: number; y: number }
export interface Card { id: string; kind: CardKind; suit: Suit; rank: number }
export interface Terrain { position: Position; kind: TerrainKind }
export interface Equipment { weapon?: Card; armor?: Card; offensiveMount?: Card; defensiveMount?: Card }

export interface Unit {
  id: Team
  name: string
  title: string
  team: Team
  identity: Identity
  revealed: boolean
  position: Position
  hp: number
  maxHp: number
  hand: Card[]
  equipment: Equipment
  judgement: Card[]
  skill: GeneralSkill
  movement: number
  attacksUsed: number
  wineUsed: boolean
  drunk: boolean
  animation: AnimationKind
}

export interface PendingResponse {
  effect: 'slash' | 'arrows' | 'barbarians' | 'duel' | 'nullify' | 'dying'
  source: Team
  target: Team
  required: 'dodge' | 'slash' | 'peach' | 'nullify'
  prompt: string
  trick?: 'duel' | 'dismantle' | 'snatch' | 'indulgence' | 'arrows' | 'barbarians'
  originCardId?: string
  armorChecked?: boolean
}

export interface GameState {
  size: number
  terrain: Terrain[]
  obstacles: Position[]
  controlPoint: Position
  units: Record<Team, Unit>
  deck: Card[]
  discard: Card[]
  phase: Phase
  turnStage: TurnStage
  turn: number
  scores: Record<Team, number>
  turnOrder: Team[]
  currentUnit: Team
  generalSelected: boolean
  selectedUnit: Team | null
  selectedCardId: string | null
  selectedAsSlash: boolean
  discardSelection: string[]
  reachable: Position[]
  pathPreview: Position[]
  pendingResponse: PendingResponse | null
  winner: Team | null
  message: string
  history: string[]
}

export type GameAction =
  | { type: 'MOVE'; unit: Team; to: Position }
  | { type: 'PLAY_CARD'; unit: Team; cardId: string; target?: Team; asSlash?: boolean }
  | { type: 'END_TURN' }
  | { type: 'RESTART' }

export const CARD_LABEL: Record<CardKind, string> = {
  slash: '杀', dodge: '闪', peach: '桃', wine: '酒', duel: '决斗',
  dismantle: '过河拆桥', snatch: '顺手牵羊', drawTwo: '无中生有',
  crossbow: '诸葛连弩', qinggang: '青釭剑', shield: '仁王盾',
  spear: '丈八蛇矛', axe: '贯石斧', halberd: '方天画戟', qilinBow: '麒麟弓', bagua: '八卦阵',
  arrows: '万箭齐发', barbarians: '南蛮入侵', nullify: '无懈可击', indulgence: '乐不思蜀', lightning: '闪电',
  peachGarden: '桃园结义', harvest: '五谷丰登',
  redHare: '赤兔', dilu: '的卢',
}

export const CARD_COPY: Record<CardKind, string> = {
  slash: '攻击范围内造成 1 点伤害', dodge: '响应【杀】或【万箭齐发】', peach: '回复 1 点体力',
  wine: '本回合下一张【杀】伤害 +1', duel: '双方轮流打出【杀】', dismantle: '弃置敌方一张牌',
  snatch: '获得距离 1 敌方一张牌', drawTwo: '摸两张牌', crossbow: '本回合可使用多张【杀】',
  qinggang: '攻击范围 2，攻击无视护甲', spear: '攻击范围 3', axe: '攻击范围 3', halberd: '攻击范围 4', qilinBow: '攻击范围 5',
  shield: '使黑色【杀】失效', bagua: '受到【杀】时红色判定视为【闪】',
  arrows: '所有敌人需打出【闪】', barbarians: '所有敌人需打出【杀】', nullify: '在响应窗口抵消锦囊效果',
  indulgence: '置于敌方判定区，可能跳过出牌', lightning: '判定失败造成 3 点雷电伤害',
  peachGarden: '所有存活角色回复 1 点体力', harvest: '所有存活角色各摸一张牌',
  redHare: '进攻坐骑：计算距离 -1', dilu: '防御坐骑：他人至你的距离 +1',
}

export const SUIT_GLYPH: Record<Suit, string> = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' }
export const IDENTITY_LABEL: Record<Identity, string> = { lord: '主公', loyalist: '忠臣', rebel: '反贼', renegade: '内奸' }

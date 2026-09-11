export type Team = 'player' | 'north' | 'east' | 'west'
export type Identity = 'lord' | 'loyalist' | 'rebel' | 'renegade'
export type Faction = 'wei' | 'shu' | 'wu' | 'qun'
export type Suit = 'spade' | 'heart' | 'club' | 'diamond'
export type CardKind =
  | 'slash' | 'dodge' | 'peach' | 'wine'
  | 'duel' | 'dismantle' | 'snatch' | 'drawTwo'
  | 'borrowedSword'
  | 'arrows' | 'barbarians' | 'nullify' | 'indulgence' | 'lightning'
  | 'peachGarden' | 'harvest' | 'fireAttack' | 'ironChain'
  | 'crossbow' | 'qinggang' | 'greenDragon' | 'spear' | 'axe' | 'halberd' | 'qilinBow' | 'gudingBlade' | 'vermilionFan'
  | 'shield' | 'bagua' | 'redHare' | 'dilu'
export type Phase = 'player' | 'ai' | 'finished'
export type TurnStage = 'prepare' | 'draw' | 'play' | 'discard' | 'finish'
export type AnimationKind = 'idle' | 'move' | 'attack' | 'hit' | 'heal' | 'cast'
export type TerrainKind = 'plain' | 'forest' | 'water' | 'ridge' | 'road' | 'camp'
export type EquipmentSlot = 'weapon' | 'armor' | 'offensiveMount' | 'defensiveMount'
export type GeneralSkill = 'wusheng' | 'longdan' | 'ganglie' | 'feedback' | 'guicai' | 'jianxiong' | 'paoxiao' | 'jizhi' | 'qicai' | 'qixi' | 'biyue' | 'zhiheng' | 'wushuang'

export interface Position { x: number; y: number }
export interface Card { id: string; kind: CardKind; suit: Suit; rank: number }
export interface Terrain { position: Position; kind: TerrainKind }
export interface MapObject { id: string; position: Position; kind: 'supplyCache'; claimed: boolean }
export interface Equipment { weapon?: Card; armor?: Card; offensiveMount?: Card; defensiveMount?: Card }

export interface Unit {
  id: Team
  name: string
  title: string
  team: Team
  identity: Identity
  faction: Faction
  revealed: boolean
  position: Position
  hp: number
  maxHp: number
  hand: Card[]
  equipment: Equipment
  judgement: Card[]
  skill: GeneralSkill
  skills: GeneralSkill[]
  movement: number
  attacksUsed: number
  wineUsed: boolean
  drunk: boolean
  chained: boolean
  skillUsed: boolean
  animation: AnimationKind
}

export interface PendingResponse {
  effect: 'slash' | 'arrows' | 'barbarians' | 'duel' | 'nullify' | 'dying'
  source: Team
  target: Team
  required: 'dodge' | 'slash' | 'peach' | 'nullify'
  prompt: string
  trick?: 'duel' | 'dismantle' | 'snatch' | 'borrowedSword' | 'indulgence' | 'arrows' | 'barbarians' | 'fireAttack' | 'ironChain'
  originCardId?: string
  armorChecked?: boolean
  requiredCount?: number
}

export interface GameState {
  size: number
  terrain: Terrain[]
  obstacles: Position[]
  controlPoint: Position
  mapObjects: MapObject[]
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
  selectedAsDismantle: boolean
  spearMode: boolean
  spearSelection: string[]
  jijiangSource: Team | null
  zhihengMode: boolean
  zhihengSelection: string[]
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
  | { type: 'INTERACT'; unit: Team; objectId: string; cardId: string }
  | { type: 'PLAY_CARD'; unit: Team; cardId: string; target?: Team; asSlash?: boolean; asDismantle?: boolean; materialIds?: string[]; lordAssist?: Team }
  | { type: 'END_TURN' }
  | { type: 'RESTART' }

export const CARD_LABEL: Record<CardKind, string> = {
  slash: '杀', dodge: '闪', peach: '桃', wine: '酒', duel: '决斗',
  dismantle: '过河拆桥', snatch: '顺手牵羊', drawTwo: '无中生有',
  borrowedSword: '借刀杀人',
  crossbow: '诸葛连弩', qinggang: '青釭剑', greenDragon: '青龙偃月刀', shield: '仁王盾',
  spear: '丈八蛇矛', axe: '贯石斧', halberd: '方天画戟', qilinBow: '麒麟弓', bagua: '八卦阵',
  gudingBlade: '古锭刀', vermilionFan: '朱雀羽扇',
  arrows: '万箭齐发', barbarians: '南蛮入侵', nullify: '无懈可击', indulgence: '乐不思蜀', lightning: '闪电',
  peachGarden: '桃园结义', harvest: '五谷丰登', fireAttack: '火攻', ironChain: '铁索连环',
  redHare: '赤兔', dilu: '的卢',
}

export const CARD_COPY: Record<CardKind, string> = {
  slash: '攻击范围内造成 1 点伤害', dodge: '响应【杀】或【万箭齐发】', peach: '回复 1 点体力',
  wine: '本回合下一张【杀】伤害 +1', duel: '双方轮流打出【杀】', dismantle: '弃置敌方一张牌',
  snatch: '获得距离 1 敌方一张牌', drawTwo: '摸两张牌', crossbow: '本回合可使用多张【杀】',
  borrowedSword: '令有武器的角色出【杀】，否则获得其武器',
  qinggang: '攻击范围 2，攻击无视护甲', greenDragon: '攻击范围 3；【杀】被闪避后可继续出【杀】', spear: '攻击范围 3；两张手牌可当【杀】', axe: '攻击范围 3；闪避后弃两牌可强制命中', halberd: '攻击范围 4；最后手牌的【杀】可攻击三人', qilinBow: '攻击范围 5；造成伤害后弃置目标坐骑',
  gudingBlade: '攻击范围 2；无手牌目标受到伤害 +1', vermilionFan: '攻击范围 4；普通【杀】改为火焰伤害',
  shield: '使黑色【杀】失效', bagua: '受到【杀】时红色判定视为【闪】',
  arrows: '所有敌人需打出【闪】', barbarians: '所有敌人需打出【杀】', nullify: '在响应窗口抵消锦囊效果',
  indulgence: '置于敌方判定区，可能跳过出牌', lightning: '判定失败造成 3 点雷电伤害',
  peachGarden: '所有存活角色回复 1 点体力', harvest: '所有存活角色各摸一张牌',
  fireAttack: '目标展示手牌；弃置同花色牌造成 1 点火焰伤害', ironChain: '令一名角色横置或重置，属性伤害会在横置角色间传导',
  redHare: '进攻坐骑：计算距离 -1', dilu: '防御坐骑：他人至你的距离 +1',
}

export const SUIT_GLYPH: Record<Suit, string> = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' }
export const IDENTITY_LABEL: Record<Identity, string> = { lord: '主公', loyalist: '忠臣', rebel: '反贼', renegade: '内奸' }

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
const key = ([x, y]) => `${x},${y}`
const copy = value => JSON.parse(JSON.stringify(value))
const LEVELS = require('./levels')

const TILE_TYPES = {
  '#': ['walls', 'WALL', ['BlockingComponent']], A: ['apples', 'APPLE', ['CollectibleComponent']], R: ['rocks', 'ROCK', ['CarryableComponent', 'BlockingComponent']],
  B: ['buttons', 'PRESSURE', ['TriggerComponent', 'PressurePlateComponent']], D: ['doors', 'DOOR', ['DoorComponent', 'BlockingComponent']],
  P: ['buddyButtons', 'BUDDY_PRESSURE', ['TriggerComponent', 'BuddyPressurePlateComponent']], H: ['headButtons', 'HEAD_PRESSURE', ['TriggerComponent', 'HeadPressurePlateComponent']],
  '+': ['conductors', 'CONDUCTOR', ['TriggerComponent', 'ConductorComponent']], M: ['fusions', 'FUSION', ['FusionComponent']],
  T: ['toggles', 'TOGGLE', ['TriggerComponent', 'ToggleSwitchComponent']],
  '2': ['shortGates', 'SHORT_GATE', ['LengthGateComponent']], '4': ['longGates', 'LONG_GATE', ['LengthGateComponent']],
  S: ['scissors', 'SCISSORS', ['SplitPointComponent']], N: ['nests', 'NEST', ['TriggerComponent']], E: ['eggs', 'EGG', ['CarryableComponent', 'FragileComponent']],
  O: ['portals', 'PORTAL', ['TeleportComponent']], C: ['acids', 'ACID_FRUIT', ['CollectibleComponent', 'ShrinkComponent']],
  K: ['keys', 'HEART_KEY', ['CollectibleComponent', 'KeyComponent']], L: ['locks', 'HEART_LOCK', ['LockComponent', 'BlockingComponent']],
  X: ['exits', 'EXIT', ['ExitComponent']]
}

class Segment {
  constructor(x, y, id, state = {}) { this.x = x; this.y = y; this.id = id; this.state = copy(state || {}); this.previous = null; this.next = null }
  get 0() { return this.x }
  get 1() { return this.y }
  moveTo([x, y]) { this.x = x; this.y = y }
  slice() { return [this.x, this.y] }
  [Symbol.iterator]() { return [this.x, this.y][Symbol.iterator]() }
}

function parseLevel(source) {
  const state = { walls: [], apples: [], rocks: [], buttons: [], buddyButtons: [], headButtons: [], conductors: [], fusions: [], toggles: [], shortGates: [], longGates: [], doors: [], scissors: [], nests: [], eggs: [], exits: [], portals: [], acids: [], keys: [], locks: [], oneWays: new Map(), entityById: new Map(), entityAt: new Map() }
  source.tiles.forEach((row, y) => [...row].forEach((cell, x) => {
    if ('^v<>'.includes(cell)) { state.oneWays.set(key([x, y]), cell); return }
    const definition = TILE_TYPES[cell]; if (!definition) return
    const [collection, type, components] = definition, position = [x, y], id = `${type.toLowerCase()}_${x}_${y}`, entity = { id, type, position, components }
    state.entityById.set(id, entity); state.entityAt.set(key(position), entity)
    state[collection].push(key(position))
  }))
  return state
}

class Game {
  constructor(level = 0) { this.load(level) }

  load(index) {
    const source = LEVELS[index]
    const parsed = parseLevel(source)
    this.level = index
    this.id = source.id
    this.w = source.width
    this.h = source.height
    this.name = source.name
    this.chapter = source.chapterName
    this.hint = source.hint
    this.objectives = copy(source.objectives)
    this.links = copy(source.links)
    this.maxUndoHint = source.maxUndoHint
    this.nextSegmentId = 1
    this.worms = source.entities.filter(entity => entity.type === 'WORM').map(entity => this.makeWorm(entity.segments))
    this.relink()
    this.active = 0
    Object.keys(parsed).forEach(name => { this[name] = Array.isArray(parsed[name]) ? new Set(parsed[name]) : parsed[name] })
    this.exit = [...this.exits][0]?.split(',').map(Number) || null
    this.toggleStates = new Map([...this.toggles].map(position => [position, false]))
    this.keyCount = 0
    this.exited = new Set()
    this.history = []
    this.moves = 0
    this.won = false
    this.message = ''
    this.eggDelivered = false
    this.buttonChanged = false
    this.event = 'load'
  }

  get worm() { return this.worms[this.active] }
  set worm(value) { this.worms[this.active] = this.makeWorm(value); this.relink() }
  isExited(worm) { return this.exited.has(worm[0].id) }
  liveWorms() { return this.worms.filter(worm => !this.isExited(worm)) }
  pressureActive(entityId) {
    const entity = this.entityById.get(entityId); if (!entity) return false
    const occupied = new Set(this.liveWorms().flat().map(key)), heads = new Set(this.liveWorms().map(worm => key(worm[0]))), position = key(entity.position)
    if (entity.type === 'BUDDY_PRESSURE') return occupied.has(position)
    if (entity.type === 'HEAD_PRESSURE') return heads.has(position)
    return occupied.has(position) || this.rocks.has(position)
  }
  triggerActive(link) {
    const entity = this.entityById.get(link.source)
    if (entity?.type === 'TOGGLE') {
      const on = Boolean(this.toggleStates.get(key(entity.position)))
      return link.mode === 'WHEN_OFF' ? !on : on
    }
    return link.mode === 'WHILE_ACTIVE' && this.pressureActive(link.source)
  }
  doorOpen(position) {
    const door = this.entityAt.get(key(position)), incoming = this.links.filter(link => link.target === door?.id)
    const conductors = incoming.filter(link => this.entityById.get(link.source)?.type === 'CONDUCTOR').map(link => this.entityById.get(link.source).position)
    const circuit = !conductors.length || this.liveWorms().some(worm => { const body = new Set(worm.map(key)); return conductors.every(position => body.has(key(position))) })
    return incoming.length > 0 && circuit && incoming.every(link => this.entityById.get(link.source)?.type === 'CONDUCTOR' || this.triggerActive(link))
  }
  get doorsOpen() {
    return this.doors.size > 0 && [...this.doors].every(position => this.doorOpen(position.split(',').map(Number)))
  }

  snapshot() {
    const worms = this.worms.map(worm => worm.map(({ x, y, id, state }) => ({ x, y, id, state: copy(state) })))
    return { worms, nextSegmentId: this.nextSegmentId, active: this.active, exited: [...this.exited], apples: [...this.apples], acids: [...this.acids], keys: [...this.keys], keyCount: this.keyCount, locks: [...this.locks], rocks: [...this.rocks], eggs: [...this.eggs], toggleStates: [...this.toggleStates], moves: this.moves, won: this.won, eggDelivered: this.eggDelivered }
  }

  restore(state) {
    this.nextSegmentId = state.nextSegmentId; this.worms = state.worms.map(worm => this.makeWorm(worm)); this.active = state.active; this.exited = new Set(state.exited || []); this.relink()
    this.apples = new Set(state.apples); this.acids = new Set(state.acids || []); this.keys = new Set(state.keys || []); this.keyCount = state.keyCount || 0; this.locks = new Set(state.locks || []); this.rocks = new Set(state.rocks); this.eggs = new Set(state.eggs)
    this.toggleStates = new Map(state.toggleStates || [])
    this.moves = state.moves; this.won = state.won; this.eggDelivered = state.eggDelivered
    this.message = ''; this.event = 'undo'; this.buttonChanged = false
  }

  undo() { if (this.history.length) { this.restore(this.history.pop()); return true } return false }
  select(index) { if (index >= 0 && index < this.worms.length && !this.isExited(this.worms[index])) { this.active = index; this.event = 'select'; return true } return false }

  makeWorm(parts) {
    return parts.map(part => part instanceof Segment ? part : new Segment(part.x ?? part[0], part.y ?? part[1], part.id || `segment-${this.nextSegmentId++}`, part.state))
  }

  relink() {
    this.worms.forEach(worm => worm.forEach((segment, i) => { segment.previous = worm[i - 1]?.id || null; segment.next = worm[i + 1]?.id || null }))
  }

  segmentAt(position) { return this.liveWorms().flat().find(segment => key(segment) === key(position)) || null }
  setSegmentState(id, state) { const segment = this.worms.flat().find(part => part.id === id); if (!segment) return false; Object.assign(segment.state, state); return true }

  cut(wormIndex, connectionIndex) {
    const worm = this.worms[wormIndex]
    if (!worm || connectionIndex < 1 || connectionIndex >= worm.length) return false
    this.worms.splice(wormIndex, 1, worm.slice(0, connectionIndex), worm.slice(connectionIndex).reverse())
    this.relink()
    return true
  }

  canFuse(first = this.active, second = this.worms.findIndex((worm, i) => i !== first && !this.isExited(worm) && Math.abs(worm[0].x - this.worms[first][0].x) + Math.abs(worm[0].y - this.worms[first][0].y) === 1)) {
    if (second < 0 || !this.worms[first] || !this.worms[second]) return false
    const a = this.worms[first][0], b = this.worms[second][0]
    return (this.fusions.has(key(a)) || this.fusions.has(key(b))) && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1
  }

  fuse(first = this.active, second) {
    if (second === undefined) second = this.worms.findIndex((worm, i) => i !== first && this.canFuse(first, i))
    if (!this.canFuse(first, second)) return false
    this.history.push(this.snapshot()); this.worms[first] = [...this.worms[first]].reverse().concat(this.worms[second]); this.worms.splice(second, 1); this.active = second < first ? first - 1 : first
    this.moves++; this.relink(); this.event = 'fuse'; this.message = '伙伴们重新连在一起了'; return true
  }

  splitAtScissors() {
    const worm = this.worm
    const cut = worm.findIndex((part, i) => i >= 2 && i <= worm.length - 2 && this.scissors.has(key(part)))
    if (cut < 0) return false
    this.cut(this.active, cut)
    this.message = '咔嚓！现在有两个伙伴了'
    this.event = 'cut'
    return true
  }

  portalDestination(position) {
    if (!this.portals.has(position) || this.portals.size !== 2) return null
    return [...this.portals].find(portal => portal !== position) || null
  }

  teleportPositions(next) {
    const destination = this.portalDestination(key(next)); if (!destination) return null
    const old = this.worm.map(segment => segment.slice()), moved = [next, ...old.slice(0, -1)], [tx, ty] = destination.split(',').map(Number)
    const dx = tx - next[0], dy = ty - next[1]
    return moved.map(([x, y]) => [x + dx, y + dy])
  }

  teleportBlocked(positions) {
    const otherBodies = new Set(this.liveWorms().filter(worm => worm !== this.worm).flat().map(key)), seen = new Set()
    return positions.some(position => {
      const target = key(position), duplicate = seen.has(target); seen.add(target)
      return duplicate || this.walls.has(target) || otherBodies.has(target) || this.rocks.has(target) || this.eggs.has(target) || this.locks.has(target) || this.doors.has(target) && !this.doorOpen(position)
    })
  }

  blockedReason(p, movingTail, worm = null, direction = null) {
    const target = key(p)
    const bodies = new Set(this.liveWorms().flat().map(key))
    if (movingTail) bodies.delete(key(movingTail))
    const oneWayDirection = { '^': 'up', v: 'down', '<': 'left', '>': 'right' }[this.oneWays.get(target)]
    if (this.locks.has(target) && this.keyCount === 0) return '需要携带心钥'
    if (this.shortGates.has(target) && (!worm || worm.length > 2)) return '身体最多只能有2节'
    if (this.longGates.has(target) && (!worm || worm.length < 4)) return '身体至少需要4节'
    if (oneWayDirection && direction !== oneWayDirection) return '只能顺着风纹进入'
    if (this.doors.has(target) && !this.doorOpen(p)) return '先让机关打开这道门'
    if (this.walls.has(target)) return '这里是坚硬的根墙'
    if (bodies.has(target)) return '身体挡住了去路'
    if (this.rocks.has(target) || this.eggs.has(target)) return '前面的东西推不动'
    return ''
  }
  blocked(p, movingTail, worm = null, direction = null) { return Boolean(this.blockedReason(p, movingTail, worm, direction)) }

  objectiveComplete(objective, target) {
    if (objective.type === 'COLLECT_ALL_APPLES') return this.apples.size === 0
    if (objective.type === 'DELIVER_ALL_EGGS') return this.eggs.size === 0
    if (objective.type === 'REACH_EXIT') return this.exits.has(target)
    if (objective.type === 'ALL_CHARACTERS_EXIT') return this.exited.size === this.worms.length
    if (objective.type === 'ALL_EXITS_OCCUPIED') { const heads = new Set(this.liveWorms().map(worm => key(worm[0]))); return [...this.exits].every(exit => heads.has(exit)) }
    return false
  }

  interaction(direction) {
    if (this.won || this.isExited(this.worm) || !DIRS[direction]) return 'blocked'
    const [dx, dy] = DIRS[direction], [hx, hy] = this.worm[0], next = [hx + dx, hy + dy], target = key(next)
    if (this.eggs.has(target)) return 'egg'
    if (this.rocks.has(target)) return 'rock'
    if (this.scissors.has(target)) return 'scissors'
    if (this.portals.has(target)) return 'portal'
    if (this.exits.has(target)) return 'exit'
    if (this.apples.has(target)) return 'apple'
    if (this.acids.has(target)) return 'acid'
    if (this.keys.has(target)) return 'key'
    if (this.locks.has(target) && this.keyCount > 0) return 'unlock'
    const tail = this.worm[this.worm.length - 1]
    return this.blocked(next, tail, this.worm, direction) ? 'blocked' : 'move'
  }

  move(direction) {
    if (this.won || this.isExited(this.worm) || !DIRS[direction]) return false
    this.buttonChanged = false
    const [dx, dy] = DIRS[direction]
    const [hx, hy] = this.worm[0]
    const next = [hx + dx, hy + dy]
    let target = key(next)
    const grows = this.apples.has(target)
    const shrinks = this.acids.has(target)
    const collectsKey = this.keys.has(target)
    const unlocks = this.locks.has(target) && this.keyCount > 0
    const tail = grows ? null : this.worm[this.worm.length - 1]
    const pushesRock = this.rocks.has(target)
    const pushesEgg = this.eggs.has(target)

    if (pushesRock || pushesEgg) {
      const beyond = [next[0] + dx, next[1] + dy]
      const reason = this.blockedReason(beyond, tail, null, direction)
      if (reason) { this.message = `${pushesEgg ? '蛋' : '石头'}推不动：${reason}`; this.event = 'bump'; return false }
    } else if (this.blocked(next, tail, this.worm, direction)) { this.message = this.blockedReason(next, tail, this.worm, direction); this.event = 'bump'; return false }
    const teleported = this.teleportPositions(next)
    if (teleported && this.teleportBlocked(teleported)) { this.message = '另一朵回声花周围没有足够空间'; this.event = 'bump'; return false }

    const doorsWereOpen = this.doorsOpen
    this.history.push(this.snapshot())
    this.message = ''
    if (pushesRock || pushesEgg) {
      const objects = pushesRock ? this.rocks : this.eggs
      const far = key([next[0] + dx, next[1] + dy])
      objects.delete(target); objects.add(far)
      if (pushesEgg && this.nests.has(far)) { this.eggs.delete(far); this.eggDelivered = true; this.message = '蛋安全回到草窝了'; this.event = 'nest' }
      else this.event = 'push'
    } else this.event = grows ? 'apple' : shrinks ? 'acid' : collectsKey ? 'key' : unlocks ? 'unlock' : teleported ? 'portal' : 'move'

    const oldPositions = this.worm.map(segment => segment.slice())
    if (grows) this.worm.push(new Segment(...oldPositions[oldPositions.length - 1], `segment-${this.nextSegmentId++}`))
    for (let i = this.worm.length - 1; i > 0; i--) this.worm[i].moveTo(oldPositions[Math.min(i - 1, oldPositions.length - 1)])
    this.worm[0].moveTo(next)
    if (teleported) { this.worm.forEach((segment, index) => segment.moveTo(teleported[index])); target = key(teleported[0]) }
    if (shrinks) { this.acids.delete(key(next)); if (this.worm.length > 2) this.worm.pop(); this.message = '酸酸！身体缩短了一截' }
    if (collectsKey) { this.keys.delete(key(next)); this.keyCount++; this.message = `获得心钥，现有 ${this.keyCount} 把` }
    if (unlocks) { this.locks.delete(key(next)); this.keyCount--; this.message = `心锁打开，还剩 ${this.keyCount} 把钥匙` }
    this.relink()
    if (grows) { this.apples.delete(target); this.message = '嚼嚼！长了一截' }
    if (teleported) { this.event = 'portal'; this.message = '嗡——整条身体穿过了回声花' }
    if (this.toggles.has(target)) {
      const on = !this.toggleStates.get(target)
      this.toggleStates.set(target, on)
      this.message = on ? '咔哒！菌核通路亮起来了' : '咔哒！菌核通路换向了'
      this.event = 'toggle'
    }
    this.moves++
    this.splitAtScissors()
    this.buttonChanged = doorsWereOpen !== this.doorsOpen
    if (this.buttonChanged && !this.message) this.message = this.doorsOpen ? '咔哒！门打开了' : '按钮弹起来了'

    if (this.objectives.some(objective => objective.type === 'ALL_CHARACTERS_EXIT') && this.exits.has(target)) { this.exited.add(this.worm[0].id); this.event = 'exit'; this.message = '一位伙伴先回家了'; const nextActive = this.worms.findIndex(worm => !this.isExited(worm)); if (nextActive >= 0) this.active = nextActive }

    if (this.objectives.every(objective => this.objectiveComplete(objective, target))) { this.won = true; this.event = 'win' }
    else if (this.exits.has(target) && this.eggs.size) this.message = '还有一枚蛋没有回家'
    else if (this.exits.has(target) && this.apples.size) this.message = '还有果子没有吃完'
    return true
  }
}

module.exports = { Game, Segment, LEVELS, DIRS, key }

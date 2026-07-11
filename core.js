const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
const key = ([x, y]) => `${x},${y}`
const copy = value => JSON.parse(JSON.stringify(value))

class Segment {
  constructor(x, y, id, state = {}) { this.x = x; this.y = y; this.id = id; this.state = copy(state || {}); this.previous = null; this.next = null }
  get 0() { return this.x }
  get 1() { return this.y }
  moveTo([x, y]) { this.x = x; this.y = y }
  slice() { return [this.x, this.y] }
  [Symbol.iterator]() { return [this.x, this.y][Symbol.iterator]() }
}

// 每关只描述玩法必需数据；形状、美术和解法均为原创。
const LEVELS = [
  { name: '醒来', chapter: '泥土之下', hint: '滑动屏幕，让小蠕虫吃掉果子后回家', map: [
    '############', '#..........#', '#..A.......#', '#..........#', '#.......X..#', '############'
  ], worms: [[[2, 4], [2, 3], [3, 3]]] },
  { name: '绕一个弯', chapter: '泥土之下', hint: '身体不能穿过自己，给尾巴留点空间', map: [
    '#############', '#.....#.....#', '#.A...#...X.#', '#.....#.....#', '#...........#', '#############'
  ], worms: [[[2, 4], [2, 3], [3, 3], [4, 3]]] },
  { name: '沉石', chapter: '泥土之下', hint: '石头只能推，不能拉', map: [
    '##############', '#............#', '#....R.......#', '#............#', '#.........X..#', '##############'
  ], worms: [[[2, 2], [2, 3], [3, 3]]] },
  { name: '黄按钮', chapter: '旧根深处', hint: '让石头压住按钮，白门会打开', map: [
    '###############', '#......#......#', '#...R..D...X..#', '#...B..#......#', '#......#......#', '#.............#', '###############'
  ], worms: [[[2, 2], [2, 3], [2, 4]]] },
  { name: '咔嚓', chapter: '旧根深处', hint: '身体经过剪刀时会分成两个伙伴', map: [
    '###############', '#.............#', '#.....S.......#', '#.........X...#', '#.............#', '###############'
  ], worms: [[[2, 2], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3]]] },
  { name: '两个脑袋', chapter: '旧根深处', hint: '轻触伙伴切换控制；两个按钮要同时压住', map: [
    '################', '#......#.......#', '#..B...D....X..#', '#......#.......#', '#..B...#.......#', '#..............#', '################'
  ], worms: [[[2, 3], [2, 2]], [[4, 4], [4, 3]]] },
  { name: '轻拿轻放', chapter: '苔藓庭院', hint: '把蛋推入草窝，再进入心形洞口', map: [
    '################', '#..............#', '#...E......N...#', '#..............#', '#...........X..#', '#..............#', '################'
  ], worms: [[[2, 2], [2, 3], [3, 3]]] },
  { name: '分工', chapter: '苔藓庭院', hint: '剪开身体，让伙伴看守按钮', map: [
    '#################', '#.......#.......#', '#...S...D....X..#', '#.......#.......#', '#...B...#.......#', '#...............#', '#################'
  ], worms: [[[2, 2], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3]]] },
  { name: '果园机关', chapter: '苔藓庭院', hint: '长度既是奖励，也是限制', map: [
    '#################', '#..A....#.......#', '#.......#...R...#', '#.......D.......#', '#..A....#...B...#', '#.......#....X..#', '#...............#', '#################'
  ], worms: [[[2, 5], [2, 4], [3, 4]]] },
  { name: '归巢', chapter: '更深的家', hint: '照顾好蛋，也照顾好每一个伙伴', map: [
    '##################', '#........#.......#', '#..E.....D....N..#', '#........#.......#', '#..S.....#..B....#', '#........#.....X.#', '#................#', '##################'
  ], worms: [[[2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [6, 4]]] }
]

function parseLevel(source) {
  const state = { walls: [], apples: [], rocks: [], buttons: [], doors: [], scissors: [], nests: [], eggs: [], exit: null }
  source.map.forEach((row, y) => [...row].forEach((cell, x) => {
    const p = key([x, y])
    const names = { '#': 'walls', A: 'apples', R: 'rocks', B: 'buttons', D: 'doors', S: 'scissors', N: 'nests', E: 'eggs' }
    if (names[cell]) state[names[cell]].push(p)
    if (cell === 'X') state.exit = [x, y]
  }))
  return state
}

class Game {
  constructor(level = 0) { this.load(level) }

  load(index) {
    const source = LEVELS[index]
    const parsed = parseLevel(source)
    this.level = index
    this.w = Math.max(...source.map.map(row => row.length))
    this.h = source.map.length
    this.name = source.name
    this.chapter = source.chapter
    this.hint = source.hint
    this.nextSegmentId = 1
    this.worms = source.worms.map(worm => this.makeWorm(worm))
    this.relink()
    this.active = 0
    Object.keys(parsed).forEach(name => { this[name] = Array.isArray(parsed[name]) && name !== 'exit' ? new Set(parsed[name]) : parsed[name] })
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
  get doorsOpen() {
    const occupied = new Set(this.worms.flat().map(key))
    return this.buttons.size > 0 && [...this.buttons].every(p => this.rocks.has(p) || occupied.has(p))
  }

  snapshot() {
    const worms = this.worms.map(worm => worm.map(({ x, y, id, state }) => ({ x, y, id, state: copy(state) })))
    return { worms, nextSegmentId: this.nextSegmentId, active: this.active, apples: [...this.apples], rocks: [...this.rocks], eggs: [...this.eggs], moves: this.moves, won: this.won, eggDelivered: this.eggDelivered }
  }

  restore(state) {
    this.nextSegmentId = state.nextSegmentId; this.worms = state.worms.map(worm => this.makeWorm(worm)); this.active = state.active; this.relink()
    this.apples = new Set(state.apples); this.rocks = new Set(state.rocks); this.eggs = new Set(state.eggs)
    this.moves = state.moves; this.won = state.won; this.eggDelivered = state.eggDelivered
    this.message = ''; this.event = 'undo'; this.buttonChanged = false
  }

  undo() { if (this.history.length) { this.restore(this.history.pop()); return true } return false }
  select(index) { if (index >= 0 && index < this.worms.length) { this.active = index; this.event = 'select'; return true } return false }

  makeWorm(parts) {
    return parts.map(part => part instanceof Segment ? part : new Segment(part.x ?? part[0], part.y ?? part[1], part.id || `segment-${this.nextSegmentId++}`, part.state))
  }

  relink() {
    this.worms.forEach(worm => worm.forEach((segment, i) => { segment.previous = worm[i - 1]?.id || null; segment.next = worm[i + 1]?.id || null }))
  }

  segmentAt(position) { return this.worms.flat().find(segment => key(segment) === key(position)) || null }
  setSegmentState(id, state) { const segment = this.worms.flat().find(part => part.id === id); if (!segment) return false; Object.assign(segment.state, state); return true }

  cut(wormIndex, connectionIndex) {
    const worm = this.worms[wormIndex]
    if (!worm || connectionIndex < 1 || connectionIndex >= worm.length) return false
    this.worms.splice(wormIndex, 1, worm.slice(0, connectionIndex), worm.slice(connectionIndex).reverse())
    this.relink()
    return true
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

  blocked(p, movingTail) {
    const target = key(p)
    const bodies = new Set(this.worms.flat().map(key))
    if (movingTail) bodies.delete(key(movingTail))
    return this.walls.has(target) || bodies.has(target) || this.rocks.has(target) || this.eggs.has(target) || (this.doors.has(target) && !this.doorsOpen)
  }

  interaction(direction) {
    if (this.won || !DIRS[direction]) return 'blocked'
    const [dx, dy] = DIRS[direction], [hx, hy] = this.worm[0], next = [hx + dx, hy + dy], target = key(next)
    if (this.eggs.has(target)) return 'egg'
    if (this.rocks.has(target)) return 'rock'
    if (this.scissors.has(target)) return 'scissors'
    if (this.exit && target === key(this.exit)) return 'exit'
    if (this.apples.has(target)) return 'apple'
    const tail = this.worm[this.worm.length - 1]
    return this.blocked(next, tail) ? 'blocked' : 'move'
  }

  move(direction) {
    if (this.won || !DIRS[direction]) return false
    this.buttonChanged = false
    const [dx, dy] = DIRS[direction]
    const [hx, hy] = this.worm[0]
    const next = [hx + dx, hy + dy]
    const target = key(next)
    const grows = this.apples.has(target)
    const tail = grows ? null : this.worm[this.worm.length - 1]
    const pushesRock = this.rocks.has(target)
    const pushesEgg = this.eggs.has(target)

    if (pushesRock || pushesEgg) {
      const beyond = [next[0] + dx, next[1] + dy]
      if (this.blocked(beyond, tail)) { this.message = pushesEgg ? '蛋壳很薄，不能硬挤' : '石头后面没有空间'; this.event = 'bump'; return false }
    } else if (this.blocked(next, tail)) { this.message = '这边过不去'; this.event = 'bump'; return false }

    const doorsWereOpen = this.doorsOpen
    this.history.push(this.snapshot())
    this.message = ''
    if (pushesRock || pushesEgg) {
      const objects = pushesRock ? this.rocks : this.eggs
      const far = key([next[0] + dx, next[1] + dy])
      objects.delete(target); objects.add(far)
      if (pushesEgg && this.nests.has(far)) { this.eggs.delete(far); this.eggDelivered = true; this.message = '蛋安全回到草窝了'; this.event = 'nest' }
      else this.event = 'push'
    } else this.event = grows ? 'apple' : 'move'

    const oldPositions = this.worm.map(segment => segment.slice())
    if (grows) this.worm.push(new Segment(...oldPositions[oldPositions.length - 1], `segment-${this.nextSegmentId++}`))
    for (let i = this.worm.length - 1; i > 0; i--) this.worm[i].moveTo(oldPositions[Math.min(i - 1, oldPositions.length - 1)])
    this.worm[0].moveTo(next)
    this.relink()
    if (grows) { this.apples.delete(target); this.message = '嚼嚼！长了一截' }
    this.moves++
    this.splitAtScissors()
    this.buttonChanged = doorsWereOpen !== this.doorsOpen
    if (this.buttonChanged && !this.message) this.message = this.doorsOpen ? '咔哒！门打开了' : '按钮弹起来了'

    const eggReady = this.nests.size === 0 || this.eggDelivered
    if (this.exit && target === key(this.exit) && eggReady && this.apples.size === 0) { this.won = true; this.event = 'win' }
    else if (this.exit && target === key(this.exit) && !eggReady) this.message = '还有一枚蛋没有回家'
    else if (this.exit && target === key(this.exit) && this.apples.size) this.message = '还有果子没有吃完'
    return true
  }
}

module.exports = { Game, Segment, LEVELS, DIRS, key }

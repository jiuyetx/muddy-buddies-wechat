const assert = require('assert')
const { Game, LEVELS } = require('./core')
const { resolveSwipe } = require('./input')
const positions = worm => worm.map(segment => segment.slice())

assert(LEVELS.every(level => level.id && level.width && level.height && level.objectives.length && Array.isArray(level.entities) && Array.isArray(level.links)))
assert(!require('fs').readFileSync(require.resolve('./core'), 'utf8').includes('levelId ==='))
assert.equal(resolveSwipe(30, 3, 800), 'right')
assert.equal(resolveSwipe(30, 27, 800), null)
assert.equal(resolveSwipe(10, 2, 800), null)
assert.equal(resolveSwipe(70, 45, 800), 'right')
assert.equal(resolveSwipe(43, 75, 800), 'down')
assert.equal(resolveSwipe(70, 68, 800), null)
assert.equal(LEVELS.length, 15)
const tokenType = { B: 'pressure', D: 'door' }
LEVELS.forEach(level => {
  assert(level.tiles.every(row => row.length === level.width), `${level.id} row width mismatch`)
  const ids = new Set()
  level.tiles.forEach((row, y) => [...row].forEach((cell, x) => { if (tokenType[cell]) ids.add(`${tokenType[cell]}_${x}_${y}`) }))
  level.entities.filter(entity => entity.type === 'WORM').flatMap(entity => entity.segments).forEach(([x, y]) => assert(level.tiles[y]?.[x] && level.tiles[y][x] !== '#', `${level.id} worm starts in wall`))
  level.links.forEach(({ source, target }) => { assert(ids.has(source), `${level.id} missing link source ${source}`); assert(ids.has(target), `${level.id} missing link target ${target}`) })
})

function exitReachable(level, doorsOpen) {
  const start = level.entities.find(entity => entity.type === 'WORM').segments[0], seen = new Set([start.join(',')]), queue = [start]
  while (queue.length) {
    const [x, y] = queue.shift()
    if (level.tiles[y][x] === 'X') return true
    for (const [dx, dy] of [[0,-1], [0,1], [-1,0], [1,0]]) {
      const nx = x + dx, ny = y + dy, cell = level.tiles[ny]?.[nx], id = `${nx},${ny}`
      if (cell && cell !== '#' && (doorsOpen || cell !== 'D') && !seen.has(id)) { seen.add(id); queue.push([nx, ny]) }
    }
  }
  return false
}
LEVELS.filter(level => level.links.length).forEach(level => {
  assert.equal(exitReachable(level, false), false, `${level.id} can bypass its closed door`)
  assert.equal(exitReachable(level, true), true, `${level.id} has no route after its door opens`)
})

const solutions = [
  '0:right 0:right 0:right 0:right 0:right 0:right',
  '0:right 0:up 0:up 0:right 0:down 0:down 0:right 0:right 0:right 0:right',
  '0:left 0:up 0:up 0:right 0:down 0:down 0:right 0:right 0:right 0:right 0:right 0:up 0:up 0:up 0:right 0:right 0:right',
  '0:down 0:right 0:right 0:right 0:right 0:right 0:right 0:right 0:right',
  '0:down 0:right 0:right 0:right 0:right 0:right 0:right 0:right 0:right 0:right',
  '0:up 0:right 0:right 0:right 0:right 1:left 0:right 0:right 0:right 0:right 0:right 0:right',
  '0:up 0:up 0:up 0:up 0:right 0:down 0:down 0:right 0:right 0:right 0:right 0:down 0:down 0:right 0:right 0:right 0:right 0:up 0:up 0:up 0:up 0:right',
  '0:right 0:down 0:right 0:right 0:right 0:right 0:right 0:down 0:down 0:right 0:right 0:right 0:right 0:up 0:up 0:up 0:up 0:right',
  '0:left 0:up 0:up 0:up 0:up 0:up 0:up 0:right 0:right 0:right 0:down 0:down 0:right 0:up 0:right 0:right 0:right 0:right 0:right 0:right 0:right 0:right'
]
solutions.forEach((solution, level) => { const game = new Game(level); solution.split(' ').forEach(step => { const [active, direction] = step.split(':'); game.select(Number(active)); assert(game.move(direction), `${LEVELS[level].id} solution move failed`) }); assert(game.won, `${LEVELS[level].id} solution did not win`) })

const eggDetour = new Game(10)
'left up up up up up right right down down left down right right right right right right right down right up up right up up left left down right right right right up right down down down down down'.split(' ').forEach(direction => assert(eggDetour.move(direction), `4-02 solution failed at ${direction}`))
assert(eggDetour.won, '4-02 solution did not win')

const basic = new Game(0)
assert.equal(basic.interaction('right'), 'move')
assert.equal(basic.move('right'), true)
assert.equal(basic.moves, 1)
assert.equal(basic.undo(), true)
assert.deepEqual(positions(basic.worm), [[2, 3], [2, 2], [3, 2]])

const rock = new Game(3)
rock.worm = [[4, 2], [3, 2]]
assert.equal(rock.move('right'), true)
assert(rock.rocks.has('6,2'))

const cut = new Game(4)
cut.worm = [[7, 2], [6, 2], [5, 2], [4, 2]]
assert.equal(cut.move('right'), true)
assert.equal(cut.worms.length, 2)
assert(cut.worms.every(worm => worm.length >= 2))

const team = new Game(5)
assert.equal(team.select(1), true)
assert.equal(team.active, 1)

const pressure = new Game(8)
pressure.worm = [[3, 4], [2, 4]]
assert.equal(pressure.move('right'), true)
assert.equal(pressure.doorsOpen, true)
assert.equal(pressure.buttonChanged, true)

const body = new Game(0)
const headId = body.worm[0].id, middleId = body.worm[1].id
body.setSegmentState(middleId, { charged: true })
body.move('right')
assert.equal(body.worm[0].id, headId)
assert.equal(body.worm[1].id, middleId)
assert.deepEqual(body.worm[1].slice(), [2, 3])
assert.equal(body.worm[1].state.charged, true)
assert.equal(body.worm[0].next, middleId)
assert.equal(body.segmentAt([2, 3]).id, middleId)
assert.equal(body.undo(), true)
assert.equal(body.worm[1].state.charged, true)

const growing = new Game(1)
const originalIds = growing.worm.map(segment => segment.id)
growing.apples.add('3,4')
assert.equal(growing.move('right'), true)
assert.deepEqual(positions(growing.worm), [[3, 4], [2, 4], [2, 3], [3, 3]])
assert.deepEqual(growing.worm.slice(0, 3).map(segment => segment.id), originalIds)
assert(!originalIds.includes(growing.worm[3].id))

const manualCut = new Game(4)
const joined = manualCut.worm[2].id
assert.equal(manualCut.cut(0, 2), true)
assert.equal(manualCut.worms.length, 2)
assert.equal(manualCut.worms[1][manualCut.worms[1].length - 1].id, joined)
assert.equal(manualCut.worms[0][manualCut.worms[0].length - 1].next, null)
console.log('core checks passed')

const assert = require('assert')
const { Game, LEVELS } = require('./core')
const positions = worm => worm.map(segment => segment.slice())

assert(LEVELS.every(level => level.id && level.width && level.height && level.objectives.length && Array.isArray(level.entities) && Array.isArray(level.links)))
assert(!require('fs').readFileSync(require.resolve('./core'), 'utf8').includes('levelId ==='))

const basic = new Game(0)
assert.equal(basic.interaction('right'), 'move')
assert.equal(basic.move('right'), true)
assert.equal(basic.moves, 1)
assert.equal(basic.undo(), true)
assert.deepEqual(positions(basic.worm), [[2, 4], [2, 3], [3, 3]])

const rock = new Game(2)
rock.worm = [[3, 2], [2, 2]]
assert.equal(rock.move('right'), true)
assert(rock.rocks.has('5,2'))

const cut = new Game(4)
cut.worm = [[6, 2], [5, 2], [5, 3], [4, 3]]
assert.equal(cut.move('right'), true)
assert.equal(cut.move('right'), true)
assert.equal(cut.worms.length, 2)
assert(cut.worms.every(worm => worm.length >= 2))

const team = new Game(5)
assert.equal(team.select(1), true)
assert.equal(team.active, 1)

const pressure = new Game(3)
pressure.worm = [[3, 3], [2, 3]]
assert.equal(pressure.move('right'), true)
assert.equal(pressure.doorsOpen, true)
assert.equal(pressure.buttonChanged, true)

const body = new Game(0)
const headId = body.worm[0].id, middleId = body.worm[1].id
body.setSegmentState(middleId, { charged: true })
body.move('right')
assert.equal(body.worm[0].id, headId)
assert.equal(body.worm[1].id, middleId)
assert.deepEqual(body.worm[1].slice(), [2, 4])
assert.equal(body.worm[1].state.charged, true)
assert.equal(body.worm[0].next, middleId)
assert.equal(body.segmentAt([2, 4]).id, middleId)
assert.equal(body.undo(), true)
assert.equal(body.worm[1].state.charged, true)

const growing = new Game(0)
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

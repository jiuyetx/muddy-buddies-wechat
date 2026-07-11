const assert = require('assert')
const { Game } = require('./core')

const basic = new Game(0)
assert.equal(basic.interaction('right'), 'move')
assert.equal(basic.move('right'), true)
assert.equal(basic.moves, 1)
assert.equal(basic.undo(), true)
assert.deepEqual(basic.worm, [[2, 4], [2, 3], [3, 3]])

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
console.log('core checks passed')

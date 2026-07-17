const assert = require('assert')
const { Game, LEVELS } = require('./core')
const { resolveSwipe, chapterY } = require('./input')
const SOLUTIONS = require('./solutions')
const positions = worm => worm.map(segment => segment.slice())
const gameSource = require('fs').readFileSync(require.resolve('./game'), 'utf8')

assert(LEVELS.every(level => level.id && level.width && level.height && level.objectives.length && Array.isArray(level.entities) && Array.isArray(level.links)))
assert.deepEqual(['入门', '进阶', '高难'].map(difficulty => LEVELS.filter(level => level.difficulty === difficulty).length), [15, 25, 20])
assert.deepEqual([...new Set(LEVELS.map(level => level.chapter))].map(chapter => LEVELS.filter(level => level.chapter === chapter).length), Array(12).fill(5))
assert(!require('fs').readFileSync(require.resolve('./core'), 'utf8').includes('levelId ==='))
assert(gameSource.includes('DPR = Math.min(sys.pixelRatio || 1, 2)'))
assert(gameSource.includes("activeAnimation() ? 0 : scene === 'title' ? 250 : 67"))
assert.equal([...gameSource.matchAll(/^  \d+: \{ accent:/gm)].length, new Set(LEVELS.map(level => level.chapter)).size)
assert(gameSource.includes('theme.motif'))
assert(gameSource.includes("if (winMoment) actions.push(['挑战好友', shareChallenge])"))
assert(gameSource.includes("wx.reportEvent('game_flow'") && ['game_start', 'level_start', 'undo', 'restart', 'level_complete', 'chapter_reached', 'share_click', 'share_enter', 'challenge_complete'].every(event => gameSource.includes(`'${event}'`)))
assert(gameSource.includes('query: `challenge=1&level=${level}&moves=${moves}`'))
assert(gameSource.includes("query?.challenge !== '1'") && gameSource.includes("if (!challenge) { const unlocked") && gameSource.includes('继续我的主线'))
assert(gameSource.includes("if (!challenge && game.moves < best)"))
assert(gameSource.includes("function levelDifficulty(level)") && gameSource.includes("difficulty === '高难'"))
assert(gameSource.includes('taught_${card.id}') && gameSource.includes('失败原因：') && gameSource.includes('关键思路：') && gameSource.includes('参考 ${reference}'))
assert.equal(resolveSwipe(30, 3, 800), 'right')
assert.equal(resolveSwipe(30, 27, 800), null)
assert.equal(resolveSwipe(10, 2, 800), null)
assert.equal(resolveSwipe(70, 45, 800), 'right')
assert.equal(resolveSwipe(43, 75, 800), 'down')
assert.equal(resolveSwipe(70, 68, 800), null)
for (const viewport of [300, 390, 440]) {
  const chapterCount = new Set(LEVELS.map(level => level.chapter)).size, pages = Math.ceil(chapterCount / 2), pageHeight = Math.max(370, viewport), maxScroll = pages * pageHeight - viewport
  assert([chapterCount - 2, chapterCount - 1].every(chapter => chapterY(chapter, pageHeight) > 54 && chapterY(chapter, pageHeight) - maxScroll < viewport), `last chapters must be reachable in a ${viewport}px map`)
}
assert.equal(LEVELS.length, 60)
const tokenType = { B: 'pressure', P: 'buddy_pressure', H: 'head_pressure', '+': 'conductor', T: 'toggle', D: 'door' }
LEVELS.forEach(level => {
  assert(level.tiles.every(row => row.length === level.width), `${level.id} row width mismatch`)
  if (level.difficulty !== '入门' && level.id !== '6-01') assert(level.width >= 18 && level.width <= 24 && level.height >= 7 && level.height <= 10, `${level.id} should use the 18-22 x 7-9 standard or the 24 x 10 special size`)
  const ids = new Set()
  level.tiles.forEach((row, y) => [...row].forEach((cell, x) => { if (tokenType[cell]) ids.add(`${tokenType[cell]}_${x}_${y}`) }))
  level.tiles.forEach((row, y) => [...row].forEach((cell, x) => { if (cell === 'R') assert([[1,0],[-1,0],[0,1],[0,-1]].every(([dx, dy]) => level.tiles[y + dy]?.[x + dx] !== '#'), `${level.id} rock at ${x},${y} touches a wall`) }))
  level.entities.filter(entity => entity.type === 'WORM').flatMap(entity => entity.segments).forEach(([x, y]) => assert(level.tiles[y]?.[x] && level.tiles[y][x] !== '#', `${level.id} worm starts in wall`))
  const initialBody = new Set(level.entities.filter(entity => entity.type === 'WORM').flatMap(entity => entity.segments).map(position => position.join(',')))
  level.tiles.forEach((row, y) => [...row].forEach((cell, x) => { if (cell === 'S') assert(!initialBody.has(`${x},${y}`), `${level.id} scissors start under a worm`) }))
  level.links.forEach(({ source, target }) => { assert(ids.has(source), `${level.id} missing link source ${source}`); assert(ids.has(target), `${level.id} missing link target ${target}`) })
})

function exitReachable(level, doorsOpen, start = level.entities.find(entity => entity.type === 'WORM').segments[0], targetExit = null) {
  const portals = level.tiles.flatMap((row, y) => [...row].flatMap((cell, x) => cell === 'O' ? [[x, y]] : []))
  const seen = new Set([start.join(',')]), queue = [start]
  while (queue.length) {
    const [x, y] = queue.shift()
    if (targetExit ? x === targetExit[0] && y === targetExit[1] : level.tiles[y][x] === 'X') return true
    const neighbors = [[0,-1], [0,1], [-1,0], [1,0]].map(([dx, dy]) => [x + dx, y + dy])
    if (level.tiles[y][x] === 'O') neighbors.push(...portals.filter(([px, py]) => px !== x || py !== y))
    for (const [nx, ny] of neighbors) {
      const cell = level.tiles[ny]?.[nx], id = `${nx},${ny}`
      if (cell && cell !== '#' && (doorsOpen || cell !== 'D') && !seen.has(id)) { seen.add(id); queue.push([nx, ny]) }
    }
  }
  return false
}
LEVELS.filter(level => level.status === 'playtest' && level.links.length && !level.tiles.some(row => row.includes('O'))).forEach(level => {
  const starts = level.entities.filter(entity => entity.type === 'WORM').map(entity => entity.segments[0])
  const exits = level.tiles.flatMap((row, y) => [...row].flatMap((cell, x) => cell === 'X' ? [[x, y]] : []))
  assert(starts.some(start => exits.some(exit => !exitReachable(level, false, start, exit) && exitReachable(level, true, start, exit))), `${level.id} doors block no route to an exit`)
  assert(starts.every(start => exitReachable(level, true, start)), `${level.id} has no route after its doors open`)
})

LEVELS.forEach((level, index) => { if (level.status === 'playtest') assert(SOLUTIONS[index], `${level.id} cannot enter playtest without an official solution`) })
LEVELS.filter(level => level.status === 'playtest' && level.objectives.some(objective => objective.type === 'ALL_CHARACTERS_EXIT')).forEach(level => {
  const plannedDoors = new Set(level.releasePlan.map(plan => plan.door))
  level.links.forEach(link => assert(plannedDoors.has(link.target), `${level.id} has no release plan for ${link.target}`))
})
Object.entries(SOLUTIONS).forEach(([level, solution]) => {
  const game = new Game(Number(level)), initialWorms = game.worms.length, movedByWorm = new Set()
  solution.split(' ').forEach(step => { const parts = step.split(':'); if (step === 'fuse') { assert(game.fuse(), `${game.id} cannot fuse`); return } if (parts.length === 2) assert(game.select(Number(parts[0])), `${game.id} cannot select worm ${parts[0]}`); movedByWorm.add(game.worm[0].id); assert(game.move(parts.at(-1)), `${game.id} solution failed at ${step}`) })
  assert(game.won, `${game.id} official solution did not win`)
  if (game.objectives.some(objective => ['ALL_CHARACTERS_EXIT', 'ALL_EXITS_OCCUPIED'].includes(objective.type))) assert(movedByWorm.size >= initialWorms, `${game.id} official solution leaves a buddy idle`)
})

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
rock.walls.add('7,2')
assert.equal(rock.move('right'), false)
assert.equal(rock.message, '石头推不动：这里是坚硬的根墙')

const cut = new Game(4)
assert.equal(cut.move('right'), true)
assert.equal(cut.move('right'), true)
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

const buddyPlate = new Game(20)
buddyPlate.rocks.add('3,1')
assert.equal(buddyPlate.pressureActive('buddy_pressure_3_1'), false)
buddyPlate.worm = [[2, 1], [3, 1]]
assert.equal(buddyPlate.pressureActive('buddy_pressure_3_1'), true)

const headPlate = new Game(21)
headPlate.worm = [[2, 2], [2, 1]]
assert.equal(headPlate.pressureActive('head_pressure_2_1'), false)
headPlate.worm = [[2, 1], [2, 2]]
assert.equal(headPlate.pressureActive('head_pressure_2_1'), true)

const everybody = new Game(17)
everybody.worms = [everybody.makeWorm([[13, 5], [13, 4]]), everybody.makeWorm([[14, 6], [13, 6]])]
everybody.relink()
assert.equal(everybody.move('right'), true)
assert.equal(everybody.won, false)
assert.equal(everybody.liveWorms().length, 1)
assert.equal(everybody.select(0), false)
assert.equal(everybody.undo(), true)
assert.equal(everybody.liveWorms().length, 2)
assert.equal(everybody.move('right'), true)
assert.equal(everybody.move('up'), true)
assert.equal(everybody.won, true)

const occupiedExits = new Game(22)
const exits = [...occupiedExits.exits].map(exit => exit.split(',').map(Number))
occupiedExits.worms = exits.map(([x, y]) => occupiedExits.makeWorm([[x, y]]))
occupiedExits.relink()
assert.equal(occupiedExits.objectiveComplete({ type: 'ALL_EXITS_OCCUPIED' }), true)

const shortGate = new Game(0)
shortGate.shortGates.add('3,3')
assert.equal(shortGate.interaction('right'), 'blocked')
assert.equal(shortGate.blockedReason([3, 3], shortGate.worm.at(-1), shortGate.worm, 'right'), '身体最多只能有2节')
shortGate.worm = [[2, 3], [2, 2]]
assert.equal(shortGate.move('right'), true)

const longGate = new Game(0)
longGate.longGates.add('3,3')
assert.equal(longGate.interaction('right'), 'blocked')
assert.equal(longGate.blockedReason([3, 3], longGate.worm.at(-1), longGate.worm, 'right'), '身体至少需要4节')
longGate.worm = [[2, 3], [2, 2], [3, 2], [4, 2]]
assert.equal(longGate.move('right'), true)

const circuit = new Game(5)
circuit.worm = [[2, 3], [2, 2]]
circuit.entityById.set('conductor_a', { id: 'conductor_a', type: 'CONDUCTOR', position: [2, 3] })
circuit.entityById.set('conductor_b', { id: 'conductor_b', type: 'CONDUCTOR', position: [2, 2] })
circuit.links = [{ source: 'conductor_a', target: 'door_7_2' }, { source: 'conductor_b', target: 'door_7_2' }]
assert.equal(circuit.doorOpen([7, 2]), true)
circuit.worm = [[2, 3], [1, 3]]
assert.equal(circuit.doorOpen([7, 2]), false)

const fusion = new Game(0)
fusion.worms = [fusion.makeWorm([[2, 2], [1, 2]]), fusion.makeWorm([[3, 2], [4, 2]])]
fusion.fusions.add('2,2'); fusion.relink()
assert.equal(fusion.fuse(), true)
assert.deepEqual(positions(fusion.worm), [[1, 2], [2, 2], [3, 2], [4, 2]])
assert.equal(fusion.undo(), true)
assert.equal(fusion.worms.length, 2)

const toggle = new Game(35)
assert.equal(toggle.doorOpen([10, 2]), false)

const portal = new Game(50)
portal.worm = [[4, 1], [3, 1]]
assert.equal(portal.move('right'), true)
assert.deepEqual(positions(portal.worm), [[16, 5], [15, 5]])
assert.equal(portal.event, 'portal')
assert.equal(portal.undo(), true)
assert.deepEqual(positions(portal.worm), [[4, 1], [3, 1]])

const acid = new Game(55)
acid.worm = [[8, 3], [7, 3], [6, 3]]
assert.equal(acid.move('right'), true)
assert.equal(acid.worm.length, 2)
assert.equal(acid.acids.size, 0)
assert.equal(acid.undo(), true)
assert.equal(acid.worm.length, 3)
assert.equal(acid.acids.size, 1)

const heartKey = new Game(57)
assert.equal(heartKey.blockedReason([11, 3], null, heartKey.worm, 'right'), '需要携带心钥')
heartKey.worm = [[3, 1], [2, 1]]
assert.equal(heartKey.move('right'), true)
assert.equal(heartKey.keyCount, 1)
heartKey.worm = [[10, 3], [9, 3]]
assert.equal(heartKey.move('right'), true)
assert.equal(heartKey.keyCount, 0)
assert(!heartKey.locks.has('11,3'))
heartKey.worm = [[13, 5], [12, 5]]
assert.equal(heartKey.move('right'), true)
assert.equal(heartKey.keyCount, 1)
heartKey.worm = [[17, 3], [16, 3]]
assert.equal(heartKey.move('right'), true)
assert.equal(heartKey.keyCount, 0)
assert(!heartKey.locks.has('18,3'))
assert.equal(heartKey.undo(), true)
assert.equal(heartKey.keyCount, 1)
assert(heartKey.locks.has('18,3'))
toggle.worm = [[6, 5], [5, 5]]
assert.equal(toggle.move('right'), true)
assert.equal(toggle.toggleStates.get('7,5'), true)
assert.equal(toggle.doorOpen([10, 2]), true)
assert.equal(toggle.undo(), true)
assert.equal(toggle.toggleStates.get('7,5'), false)

const oneWay = new Game(45)
assert.equal(oneWay.interaction('right'), 'move')
oneWay.worm = [[7, 2], [7, 3]]
assert.equal(oneWay.interaction('left'), 'blocked')
console.log('core checks passed')

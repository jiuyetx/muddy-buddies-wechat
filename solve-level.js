const { Game, DIRS } = require('./core')

const level = Number(process.argv[2]), requireSplit = process.argv.includes('--require-split'), minWorms = Number(process.argv.find(value => value.startsWith('--min-worms='))?.split('=')[1]) || 1, game = new Game(level), source = require('./levels')[level]
const hash = (state, split = false) => JSON.stringify({
  worms: state.worms.map(worm => worm.map(({ x, y, id }) => [x, y, id])), exited: state.exited.slice().sort(),
  apples: state.apples.slice().sort(), acids: (state.acids || []).slice().sort(), keys: (state.keys || []).slice().sort(), keyCount: state.keyCount || 0, locks: (state.locks || []).slice().sort(), rocks: state.rocks.slice().sort(), eggs: state.eggs.slice().sort(), toggles: state.toggleStates, won: state.won, split
})
const distance = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])
const points = char => source.tiles.flatMap((row, y) => [...row].flatMap((cell, x) => cell === char ? [[x, y]] : []))
const exits = points('X'), nests = points('N')
const heuristic = state => {
  const heads = state.worms.filter(worm => !state.exited.includes(worm[0].id)).map(worm => [worm[0].x, worm[0].y])
  let score = state.apples.reduce((sum, value) => { const apple = value.split(',').map(Number); return sum + Math.min(...heads.map(head => distance(head, apple))) }, 0)
  score += state.eggs.reduce((sum, value) => { const egg = value.split(',').map(Number); return sum + Math.min(...heads.map(head => distance(head, egg))) + Math.min(...nests.map(nest => distance(egg, nest))) }, 0)
  if (game.objectives.some(goal => goal.type === 'ALL_EXITS_OCCUPIED')) score += exits.reduce((sum, exit) => sum + Math.min(...heads.map(head => distance(head, exit))), 0)
  else score += heads.reduce((sum, head) => sum + Math.min(...exits.map(exit => distance(head, exit))), 0)
  return score
}
const heap = []
const push = node => { heap.push(node); for (let i = heap.length - 1; i; ) { const p = (i - 1) >> 1; if (heap[p].score <= node.score) break; heap[i] = heap[p]; i = p; heap[i] = node } }
const pop = () => { const root = heap[0], last = heap.pop(); if (heap.length) { let i = 0; heap[0] = last; while (true) { let child = i * 2 + 1; if (child >= heap.length) break; if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++; if (heap[child].score >= heap[i].score) break; [heap[i], heap[child]] = [heap[child], heap[i]]; i = child } } return root }
const first = game.snapshot(), seen = new Map([[hash(first), 0]])
push({ state: first, path: '', moves: 0, score: heuristic(first), split: false })

for (let searched = 0; heap.length && searched < 750000; searched++) {
  const current = pop(); game.restore(current.state); game.history = []
  for (let worm = 0; worm < game.worms.length; worm++) for (const direction of Object.keys(DIRS)) {
    game.restore(current.state); game.history = []
    if (!game.select(worm) || !game.move(direction)) continue
    const next = game.snapshot(), moves = current.moves + 1, path = `${current.path} ${worm}:${direction}`.trim(), split = current.split || next.worms.length > current.state.worms.length
    if (game.won && (!requireSplit || split) && game.worms.length >= minWorms) { console.log(path); process.exit(0) }
    const id = hash(next, split); if ((seen.get(id) ?? Infinity) <= moves) continue
    seen.set(id, moves); push({ state: next, path, moves, score: moves + heuristic(next) * 2, split })
  }
  game.restore(current.state); game.history = []
  if (game.canFuse() && game.fuse()) {
    const next = game.snapshot(), moves = current.moves + 1, path = `${current.path} fuse`.trim()
    if (game.won && (!requireSplit || current.split) && game.worms.length >= minWorms) { console.log(path); process.exit(0) }
    const id = hash(next, current.split)
    if ((seen.get(id) ?? Infinity) > moves) { seen.set(id, moves); push({ state: next, path, moves, score: moves + heuristic(next) * 2, split: current.split }) }
  }
}
throw new Error(`No solution for level ${level + 1} after ${seen.size} states`)

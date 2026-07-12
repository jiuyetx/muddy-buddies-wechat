function resolveSwipe(dx, dy, width) {
  const ax = Math.abs(dx), ay = Math.abs(dy), threshold = Math.max(22, Math.min(30, width * .035))
  if (Math.max(ax, ay) < threshold) return null
  if (ax > ay * 1.2) return dx > 0 ? 'right' : 'left'
  if (ay > ax * 1.2) return dy > 0 ? 'down' : 'up'
  if (Math.hypot(dx, dy) >= threshold * 1.8 && Math.abs(ax - ay) >= threshold * .22) return ax > ay ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
  return null
}

module.exports = { resolveSwipe }

const { Game, LEVELS, DIRS, key } = require('./core')
const { resolveSwipe } = require('./input')

const sys = wx.getSystemInfoSync()
const W = sys.windowWidth, H = sys.windowHeight, DPR = sys.pixelRatio || 1
const safe = sys.safeArea || { top: 0, bottom: H }
let capsule = null
try { capsule = wx.getMenuButtonBoundingClientRect() } catch (_) {}
const SAFE_TOP = Math.max(safe.top || 0, capsule ? capsule.bottom : 0)
const SAFE_BOTTOM = Math.max(0, H - (safe.bottom || H))
const HEADER_Y = SAFE_TOP + 18, FOOTER_Y = H - SAFE_BOTTOM - 42
const canvas = wx.createCanvas(), ctx = canvas.getContext('2d')
canvas.width = W * DPR; canvas.height = H * DPR; ctx.scale(DPR, DPR)

const C = { dirt: '#934b3f', deep: '#21191e', tunnel: '#30272b', ridge: '#64342f', pink: '#f29aae', rose: '#d7617c', cream: '#f7f0ce', green: '#93be72', yellow: '#f4ce4c', ink: '#191419', white: '#fffdf5' }
let game = new Game(Math.min(Number(wx.getStorageSync('caveLevel')) || 0, LEVELS.length - 1))
let scene = wx.getStorageSync('seenIntro') ? 'map' : 'title'
let touch = null, controls = [], transition = 1, shake = 0, particles = [], visualWorms = null, inputQueue = []
let motion = null, bumpMotion = null, pushMotion = null, failedMotion = null, lastDirections = {}
let lastActionAt = Date.now()
let lastQueuedDirection = null, lastQueuedAt = 0, boardLayout = { tile: 0, ox: 0, oy: 0 }, winAt = 0
let audio
let muted = Boolean(wx.getStorageSync('muted'))
let directionButtons = Boolean(wx.getStorageSync('directionButtons'))

function rr(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); ctx.fill()
}

function sound(kind) {
  if (muted) return
  try {
    audio ||= wx.createWebAudioContext()
    const osc = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime
    const notes = { move: 130, push: 90, apple: 420, cut: 180, nest: 520, win: 660, bump: 70, fail: 58, button: 360, select: 300 }
    osc.type = kind === 'cut' ? 'sawtooth' : 'sine'; osc.frequency.setValueAtTime(notes[kind] || 140, now)
    if (kind === 'win') osc.frequency.exponentialRampToValueAtTime(990, now + .22)
    gain.gain.setValueAtTime(.055, now); gain.gain.exponentialRampToValueAtTime(.001, now + .18)
    osc.connect(gain); gain.connect(audio.destination); osc.start(now); osc.stop(now + .2)
  } catch (_) {}
}

function addControl(x, y, w, h, action, blockSwipe = false) { controls.push({ x, y, w, h, action, blockSwipe }) }
function button(label, x, y, w, action, accent = false, disabled = false) {
  ctx.save(); if (disabled) ctx.globalAlpha = .38
  ctx.fillStyle = accent ? C.cream : 'rgba(25,20,24,.72)'; rr(x, y, w, 38, 19)
  ctx.fillStyle = accent ? C.ink : C.cream; ctx.font = '700 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x + w / 2, y + 19)
  ctx.restore(); if (!disabled) addControl(x, y, w, 38, action, true)
}

function background(color = C.dirt) {
  ctx.fillStyle = color; ctx.fillRect(-10, -10, W + 20, H + 20); ctx.strokeStyle = 'rgba(53,25,26,.24)'; ctx.lineWidth = 2
  for (let y = 8; y < H; y += 17) { ctx.beginPath(); for (let x = -10; x <= W + 10; x += 16) ctx.lineTo(x, y + Math.sin(x * .04 + y * .13) * 3); ctx.stroke() }
}

function title() {
  background('#793d36'); controls = []
  ctx.save(); ctx.translate(W / 2, H / 2 - 35); ctx.rotate(-.025)
  ctx.fillStyle = C.deep; rr(-190, -67, 380, 134, 34)
  ctx.fillStyle = C.cream; ctx.font = `900 ${Math.min(58, W / 9)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('泥 土 小 伙 伴', 0, -6)
  ctx.fillStyle = C.pink; rr(-145, 46, 72, 28, 14); ctx.fillStyle = C.white; ctx.beginPath(); ctx.arc(-84, 60, 9, 0, 7); ctx.fill(); ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(-81, 60, 4, 0, 7); ctx.fill()
  ctx.restore(); button('开始探索', W / 2 - 65, H - SAFE_BOTTOM - 68, 130, () => { scene = 'map'; wx.setStorageSync('seenIntro', 1); sound('win') }, true)
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('原创身体解谜游戏', W / 2, H - SAFE_BOTTOM - 16)
}

function mapScreen() {
  background('#694e43'); controls = []
  ctx.fillStyle = C.cream; ctx.font = '900 26px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('地下路线', 22, HEADER_Y)
  const unlocked = Math.min(Number(wx.getStorageSync('unlocked')) || 1, LEVELS.length)
  const cols = 5, gap = 12, size = Math.min(72, (W - 44 - gap * 4) / cols), startX = (W - cols * size - gap * 4) / 2, startY = HEADER_Y + 24
  LEVELS.forEach((level, i) => {
    const x = startX + (i % cols) * (size + gap), y = startY + Math.floor(i / cols) * (size + 26)
    ctx.fillStyle = i < unlocked ? C.deep : 'rgba(30,25,28,.35)'; rr(x, y, size, size, 17)
    ctx.fillStyle = i < unlocked ? (i === unlocked - 1 ? C.yellow : C.cream) : 'rgba(255,255,255,.3)'; ctx.font = '900 22px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(i < unlocked ? i + 1 : '·', x + size / 2, y + size * .42)
    ctx.font = '11px sans-serif'; ctx.fillText(i < unlocked ? level.name : '未发现', x + size / 2, y + size * .72)
    const best = Number(wx.getStorageSync(`best_${i}`)) || 0
    if (best) { ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.font = '9px sans-serif'; ctx.fillText(`${best}步`, x + size / 2, y + size - 6) }
    if (i < unlocked) addControl(x, y, size, size, () => { game.load(i); clearAnimation(); scene = 'play'; transition = 1; sound('select') })
  })
  button('返回标题', 18, FOOTER_Y, 90, () => { scene = 'title' })
  button(directionButtons ? '辅助键：开' : '辅助键：关', W / 2 - 48, FOOTER_Y, 96, () => { directionButtons = !directionButtons; wx.setStorageSync('directionButtons', directionButtons); sound('select') })
  button(muted ? '声音：关' : '声音：开', W - 104, FOOTER_Y, 86, () => { muted = !muted; wx.setStorageSync('muted', muted); if (!muted) sound('select') })
}

function object(type, x, y, s, t, active = false) {
  const cx = x + s / 2, cy = y + s / 2
  ctx.save()
  ctx.shadowColor = 'rgba(10,7,9,.38)'; ctx.shadowBlur = s * .12; ctx.shadowOffsetY = s * .07
  if (type === 'apple') {
    ctx.fillStyle = '#b92f46'; ctx.beginPath(); ctx.arc(cx, cy + s * .07, s * .28, 0, 7); ctx.fill()
    ctx.shadowColor = 'transparent'; ctx.fillStyle = '#eb5963'; ctx.beginPath(); ctx.arc(cx - s * .06, cy, s * .22, 0, 7); ctx.fill()
    ctx.strokeStyle = '#60452e'; ctx.lineWidth = Math.max(2, s * .055); ctx.beginPath(); ctx.moveTo(cx, cy - s * .18); ctx.quadraticCurveTo(cx + s * .02, cy - s * .35, cx + s * .12, cy - s * .34); ctx.stroke()
    ctx.fillStyle = C.green; ctx.beginPath(); ctx.ellipse(cx + s * .15, cy - s * .25, s * .15, s * .075, -.45, 0, 7); ctx.fill()
  }
  if (type === 'rock') {
    ctx.fillStyle = '#725b43'; ctx.beginPath(); ctx.moveTo(cx - s * .3, cy + s * .2); ctx.lineTo(cx - s * .36, cy - s * .08); ctx.lineTo(cx - s * .16, cy - s * .32); ctx.lineTo(cx + s * .18, cy - s * .28); ctx.lineTo(cx + s * .35, cy); ctx.lineTo(cx + s * .25, cy + s * .3); ctx.closePath(); ctx.fill()
    ctx.shadowColor = 'transparent'; ctx.fillStyle = '#a98b61'; ctx.beginPath(); ctx.ellipse(cx - s * .07, cy - s * .08, s * .21, s * .13, -.35, 0, 7); ctx.fill()
    ctx.strokeStyle = '#594631'; ctx.lineWidth = Math.max(1.5, s * .04); ctx.beginPath(); ctx.arc(cx + s * .04, cy + s * .08, s * .14, -.5, 4.4); ctx.stroke()
  }
  if (type === 'egg') {
    ctx.fillStyle = '#d7ccb0'; ctx.beginPath(); ctx.ellipse(cx, cy + s * .04, s * .25, s * .34, 0, 0, 7); ctx.fill()
    ctx.shadowColor = 'transparent'; ctx.fillStyle = C.white; ctx.beginPath(); ctx.ellipse(cx - s * .035, cy, s * .2, s * .29, -.08, 0, 7); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.ellipse(cx - s * .09, cy - s * .12, s * .055, s * .1, -.3, 0, 7); ctx.fill()
  }
  if (type === 'button') {
    if (active) ctx.translate(0, s * .07)
    ctx.fillStyle = '#8e681e'; ctx.beginPath(); ctx.ellipse(cx, cy + s * .17, s * .34, s * .16, 0, 0, 7); ctx.fill()
    ctx.shadowColor = 'transparent'; ctx.fillStyle = C.yellow; ctx.beginPath(); ctx.ellipse(cx, cy + s * .04, s * .3, s * .16, 0, 0, 7); ctx.fill()
    ctx.fillStyle = '#ffe783'; ctx.beginPath(); ctx.ellipse(cx - s * .07, cy, s * .13, s * .055, -.15, 0, 7); ctx.fill()
    if (active) { ctx.shadowColor = C.yellow; ctx.shadowBlur = s * .3; ctx.strokeStyle = '#ffe783'; ctx.lineWidth = Math.max(2, s * .04); ctx.beginPath(); ctx.arc(cx, cy, s * .36, 0, 7); ctx.stroke() }
  }
  if (type === 'nest') {
    ctx.fillStyle = '#283327'; ctx.beginPath(); ctx.ellipse(cx, cy + s * .16, s * .39, s * .19, 0, 0, 7); ctx.fill()
    ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#aa8147'; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(2, s * .075)
    for (let i = 0; i < 7; i++) { const yy = cy - s * .02 + i * s * .045; ctx.beginPath(); ctx.moveTo(cx - s * (.36 - i * .015), yy); ctx.quadraticCurveTo(cx, yy + (i % 2 ? -1 : 1) * s * .1, cx + s * (.36 - i * .015), yy); ctx.stroke() }
    ctx.strokeStyle = '#6f5937'; ctx.lineWidth = Math.max(1.5, s * .035); for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(cx + i * s * .11, cy - s * .14); ctx.lineTo(cx - i * s * .08, cy + s * .25); ctx.stroke() }
    ctx.fillStyle = '#78a45d'; for (const [lx, ly, a] of [[-.31,-.15,-.8],[.29,-.12,.7],[-.2,.22,-.2],[.23,.2,.25]]) { ctx.beginPath(); ctx.ellipse(cx + lx * s, cy + ly * s, s * .11, s * .055, a, 0, 7); ctx.fill() }
  }
  if (type === 'scissors') {
    ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#d8d1c1'; ctx.lineWidth = Math.max(2, s * .065); ctx.lineCap = 'round'
    ctx.beginPath(); ctx.arc(cx - s * .18, cy - s * .13, s * .105, 0, 7); ctx.moveTo(cx - s * .08, cy - s * .06); ctx.lineTo(cx + s * .27, cy + s * .22); ctx.moveTo(cx - s * .08, cy + s * .06); ctx.lineTo(cx + s * .27, cy - s * .22); ctx.stroke()
    ctx.strokeStyle = '#778d94'; ctx.lineWidth = Math.max(1, s * .025); ctx.stroke()
  }
  if (type === 'exit') {
    const pulse = .5 + Math.sin(t / 260) * .12
    ctx.shadowColor = 'rgba(236,55,148,.55)'; ctx.shadowBlur = s * pulse
    ctx.fillStyle = '#171217'; ctx.beginPath(); ctx.moveTo(x + s * .12, y + s * .92); ctx.lineTo(x + s * .12, y + s * .38); ctx.quadraticCurveTo(x + s * .12, y + s * .08, cx, y + s * .08); ctx.quadraticCurveTo(x + s * .88, y + s * .08, x + s * .88, y + s * .38); ctx.lineTo(x + s * .88, y + s * .92); ctx.closePath(); ctx.fill()
    ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#5b4035'; ctx.lineWidth = Math.max(2, s * .07); ctx.beginPath(); ctx.moveTo(x + s * .1, y + s * .9); ctx.lineTo(x + s * .1, y + s * .37); ctx.quadraticCurveTo(x + s * .12, y + s * .05, cx, y + s * .05); ctx.quadraticCurveTo(x + s * .88, y + s * .05, x + s * .9, y + s * .37); ctx.lineTo(x + s * .9, y + s * .9); ctx.stroke()
    ctx.fillStyle = '#f04a9e'; ctx.beginPath(); ctx.moveTo(cx, cy + s * .18); ctx.bezierCurveTo(cx - s * .32, cy, cx - s * .23, cy - s * .23, cx, cy - s * .08); ctx.bezierCurveTo(cx + s * .23, cy - s * .23, cx + s * .32, cy, cx, cy + s * .18); ctx.fill()
    ctx.fillStyle = '#ff9bc8'; ctx.beginPath(); ctx.arc(cx - s * .09, cy - s * .04, s * .045, 0, 7); ctx.fill()
    if (active) for (let i = 0; i < 7; i++) { const a = i * Math.PI * 2 / 7 + t / 500; ctx.fillStyle = i % 2 ? C.yellow : C.pink; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * s * .42, cy + Math.sin(a) * s * .35, s * .075, s * .035, a, 0, 7); ctx.fill() }
  }
  ctx.restore()
}

function drawSmoothBody(worm, tile, ox, oy) {
  const world = worm.map(p => [ox + (p[0] + .5) * tile, oy + (p[1] + .5) * tile]), path = [world[0]]
  for (let i = 1; i < world.length; i++) {
    const from = path[path.length - 1], to = world[i], dx = to[0] - from[0], dy = to[1] - from[1]
    if (Math.abs(dx) > .5 && Math.abs(dy) > .5) path.push(Math.abs(dx) > Math.abs(dy) ? [to[0], from[1]] : [from[0], to[1]])
    path.push(to)
  }
  ctx.beginPath(); ctx.moveTo(path[0][0], path[0][1])
  for (let i = 1; i < path.length - 1; i++) {
    const before = path[i - 1], point = path[i], after = path[i + 1], ax = point[0] - before[0], ay = point[1] - before[1], bx = after[0] - point[0], by = after[1] - point[1], al = Math.hypot(ax, ay), bl = Math.hypot(bx, by)
    if (!al || !bl || Math.abs(ax * by - ay * bx) < .5) { ctx.lineTo(point[0], point[1]); continue }
    const radius = Math.min(tile * .22, al / 2, bl / 2)
    ctx.lineTo(point[0] - ax / al * radius, point[1] - ay / al * radius); ctx.quadraticCurveTo(point[0], point[1], point[0] + bx / bl * radius, point[1] + by / bl * radius)
  }
  if (path.length > 1) ctx.lineTo(path[path.length - 1][0], path[path.length - 1][1]); ctx.stroke()
}

function wormBody(worm, index, tile, ox, oy, time, feel = {}) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = index === game.active ? C.pink : '#dd7891'; ctx.lineWidth = tile * .78
  drawSmoothBody(worm, tile, ox, oy)
  worm.forEach((p, i) => { if (i && i % 2) { ctx.fillStyle = C.rose; ctx.beginPath(); ctx.arc(ox + (p[0] + .5) * tile, oy + (p[1] + .5) * tile, tile * .31, 0, 7); ctx.fill() } })
  const head = worm[0], next = worm[1] || [head[0] - 1, head[1]], rawX = feel.direction?.[0] ?? head[0] - next[0], rawY = feel.direction?.[1] ?? head[1] - next[1], length = Math.hypot(rawX, rawY) || 1, vx = rawX / length, vy = rawY / length, bob = Math.sin(time / 180 + index) * tile * .025
  const hx = ox + (head[0] + .5) * tile, hy = oy + (head[1] + .5) * tile + bob
  const amount = feel.amount || 0, long = feel.bump ? 1 - amount * .25 : feel.turn ? 1 - amount * .16 : 1 + amount * .1, wide = feel.bump ? 1 + amount * .18 : feel.turn ? 1 + amount * .13 : 1 - amount * .06
  ctx.fillStyle = index === game.active ? C.pink : '#dd7891'; ctx.beginPath(); ctx.ellipse(hx, hy, tile * .4 * long, tile * .4 * wide, Math.atan2(vy, vx), 0, 7); ctx.fill()
  const sideX = -vy * tile * .12, sideY = vx * tile * .12, lookX = vx * tile * .045, lookY = vy * tile * .045
  for (const side of [-1, 1]) {
    const ex = hx + vx * tile * .14 + sideX * side, ey = hy + vy * tile * .14 + sideY * side
    if (feel.yawn || feel.celebrate) { ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(1.5, tile * .035); ctx.beginPath(); ctx.arc(ex, ey, tile * .075, 0, Math.PI); ctx.stroke() }
    else {
      const eye = tile * (feel.nervous ? .13 : .105), pupil = tile * (feel.strain ? .034 : .045)
      ctx.fillStyle = C.white; ctx.beginPath(); ctx.arc(ex, ey, eye, 0, 7); ctx.fill()
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(ex + lookX, ey + lookY, pupil, 0, 7); ctx.fill()
      if (feel.strain) { ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(1.5, tile * .035); ctx.beginPath(); ctx.moveTo(ex - sideX * .35 - vx * tile * .05, ey - sideY * .35 - vy * tile * .05); ctx.lineTo(ex + sideX * .35 + vx * tile * .02, ey + sideY * .35 + vy * tile * .02); ctx.stroke() }
    }
  }
  const mx = hx + vx * tile * .29, my = hy + vy * tile * .29
  if (feel.yawn) { ctx.fillStyle = '#713747'; ctx.beginPath(); ctx.ellipse(mx, my, tile * .09, tile * .13, Math.atan2(vy, vx), 0, 7); ctx.fill() }
  else if (feel.strain) { ctx.fillStyle = C.white; ctx.beginPath(); ctx.ellipse(mx, my, tile * .11, tile * .045, Math.atan2(vy, vx), 0, 7); ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.stroke() }
  else if (feel.celebrate) { ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(1.5, tile * .035); ctx.beginPath(); ctx.arc(mx - vx * tile * .05, my - vy * tile * .05, tile * .1, 0, Math.PI); ctx.stroke() }
  if (index === game.active && game.worms.length > 1) { ctx.strokeStyle = C.yellow; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx, hy, tile * .47, 0, 7); ctx.stroke() }
  if (feel.moving && amount > .12) {
    const tail = worm[worm.length - 1], tx = ox + (tail[0] + .5) * tile, ty = oy + (tail[1] + .5) * tile
    ctx.fillStyle = 'rgba(93,55,45,.55)'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(tx - vx * tile * (.28 + i * .12), ty - vy * tile * (.28 + i * .12) + (i - 1) * 2, tile * (.025 + i * .008), 0, 7); ctx.fill() }
  }
  if (feel.sweat) { ctx.fillStyle = '#9cdded'; ctx.beginPath(); ctx.moveTo(hx - vy * tile * .36, hy + vx * tile * .36); ctx.quadraticCurveTo(hx - vy * tile * .5 - vx * 4, hy + vx * tile * .5 - vy * 4, hx - vy * tile * .39, hy + vx * tile * .55); ctx.quadraticCurveTo(hx - vy * tile * .29, hy + vx * tile * .46, hx - vy * tile * .36, hy + vx * tile * .36); ctx.fill() }
  if (feel.celebrate) for (const side of [-1, 1]) { ctx.fillStyle = side > 0 ? C.yellow : '#ff86b5'; ctx.beginPath(); ctx.arc(hx - vy * tile * .58 * side, hy + vx * tile * .58 * side + Math.sin(time / 100) * 3, tile * .055, 0, 7); ctx.fill() }
}

function particlesDraw() {
  particles = particles.filter(p => p.life-- > 0)
  particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .04; ctx.globalAlpha = p.life / 22; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill() }); ctx.globalAlpha = 1
}

function burst(x, y, color, count = 12) { for (let i = 0; i < count; i++) { const a = Math.random() * 7, speed = .5 + Math.random() * 2; particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, size: 1 + Math.random() * 3, color, life: 22 }) } }
function ease(t) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3) }
function segmentDelay(index, length) { return length <= 4 ? Math.min(index * 18, 54) : length <= 8 ? Math.min(index * 14, 72) : Math.min(index * 10, 80) }
function clearAnimation() { visualWorms = null; motion = null; bumpMotion = null; pushMotion = null; failedMotion = null; lastDirections = {}; inputQueue = []; lastQueuedDirection = null; winAt = 0; lastActionAt = Date.now() }
function characterFeel(worm, index, now) {
  if (game.won) return { celebrate: true }
  if (now - lastActionAt < 900) return {}
  const [hx, hy] = worm[0], other = game.worms.map((w, i) => i === index ? null : w[0]).filter(Boolean).sort((a, b) => Math.abs(a[0] - hx) + Math.abs(a[1] - hy) - Math.abs(b[0] - hx) - Math.abs(b[1] - hy))[0]
  const targets = [...game.apples, ...game.rocks, ...game.eggs, ...game.scissors, ...game.buttons].map(p => p.split(',').map(Number)); if (game.exit) targets.push(game.exit)
  const target = other && Math.abs(other[0] - hx) + Math.abs(other[1] - hy) <= 5 ? other : targets.sort((a, b) => Math.abs(a[0] - hx) + Math.abs(a[1] - hy) - Math.abs(b[0] - hx) - Math.abs(b[1] - hy))[0]
  const idle = now - lastActionAt, yawn = idle > 5000 && (idle - 5000) % 5200 < 1400, nearEgg = [...game.eggs].some(p => { const [x, y] = p.split(',').map(Number); return Math.abs(x - hx) + Math.abs(y - hy) <= 2 })
  return { direction: target ? [target[0] - hx, target[1] - hy] : undefined, yawn, nervous: nearEgg }
}

function play(time) {
  controls = []; ctx.save(); if (shake > 0) { ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake); shake *= .82 }
  background(game.chapter === '苔藓庭院' ? '#65735b' : game.chapter === '更深的家' ? '#584158' : C.dirt)
  const top = HEADER_Y + 31, bottom = 49 + SAFE_BOTTOM, tile = Math.floor(Math.min((W - 24) / game.w, (H - top - bottom) / game.h)), ox = Math.floor((W - game.w * tile) / 2), oy = top + Math.floor((H - top - bottom - game.h * tile) / 2)
  boardLayout = { tile, ox, oy }
  ctx.fillStyle = C.tunnel; for (let y = 0; y < game.h; y++) for (let x = 0; x < game.w; x++) if (!game.walls.has(key([x, y]))) {
    rr(ox + x * tile - 1, oy + y * tile - 1, tile + 2, tile + 2, tile * .19)
    ctx.fillStyle = 'rgba(255,255,255,.018)'; ctx.beginPath(); ctx.arc(ox + (x + .25) * tile, oy + (y + .28) * tile, Math.max(1, tile * .025), 0, 7); ctx.fill(); ctx.fillStyle = C.tunnel
  }
  ctx.fillStyle = C.ridge; game.walls.forEach(p => { const [x, y] = p.split(',').map(Number); rr(ox + x * tile + 2, oy + y * tile + 3, tile - 4, tile - 5, tile * .14); ctx.fillStyle = 'rgba(255,210,185,.07)'; rr(ox + x * tile + 5, oy + y * tile + 5, tile - 10, Math.max(2, tile * .08), tile * .04); ctx.fillStyle = C.ridge })
  const now = Date.now()
  if (failedMotion && now - failedMotion.start >= 230) failedMotion = null
  const occupied = new Set(game.worms.flat().map(key))
  const each = (set, type) => set.forEach(p => {
    if (pushMotion && pushMotion.type === type && p === pushMotion.to) return
    const [x, y] = p.split(',').map(Number), failed = failedMotion && failedMotion.type === type && failedMotion.position === p, jitter = failed ? Math.sin((now - failedMotion.start) * .16) * tile * .055 * (1 - (now - failedMotion.start) / 230) : 0
    object(type, ox + x * tile + jitter, oy + y * tile, tile, time, type === 'button' && (game.rocks.has(p) || occupied.has(p)))
  })
  each(game.buttons, 'button'); each(game.nests, 'nest'); each(game.scissors, 'scissors')
  game.doors.forEach(p => { const [x, y] = p.split(',').map(Number), px = ox + x * tile, py = oy + y * tile, open = game.doorOpen([x, y]); ctx.shadowColor = open ? C.yellow : 'transparent'; ctx.shadowBlur = tile * .35; ctx.fillStyle = open ? 'rgba(244,206,76,.42)' : C.cream; rr(px + tile * .35, py, tile * .3, tile, tile * .09); ctx.shadowColor = 'transparent' })
  if (game.exit) object('exit', ox + game.exit[0] * tile, oy + game.exit[1] * tile, tile, time, game.won)
  each(game.apples, 'apple'); each(game.rocks, 'rock'); each(game.eggs, 'egg')
  if (pushMotion) {
    const elapsed = now - pushMotion.start, progress = ease((elapsed - 45) / 105), settle = Math.sin(Math.PI * Math.max(0, Math.min(1, (elapsed - 150) / 45))), x = pushMotion.from[0] + (pushMotion.target[0] - pushMotion.from[0]) * progress, y = pushMotion.from[1] + (pushMotion.target[1] - pushMotion.from[1]) * progress
    object(pushMotion.type, ox + x * tile, oy + y * tile - settle * tile * .035, tile, time)
    if (elapsed >= 195) pushMotion = null
  }
  if (!visualWorms || visualWorms.length !== game.worms.length) visualWorms = copyWorms(game.worms)
  if (motion) {
    let finished = true
    motion.to.forEach((worm, i) => worm.forEach((target, j) => {
      const progress = ease((now - motion.start - motion.delay - segmentDelay(j, worm.length)) / 105)
      visualWorms[i][j][0] = motion.from[i][j][0] + (target[0] - motion.from[i][j][0]) * progress
      visualWorms[i][j][1] = motion.from[i][j][1] + (target[1] - motion.from[i][j][1]) * progress
      if (progress < 1) finished = false
    }))
    if (finished) motion = null
  }
  const winDuration = 130 + ((game.worms[game.active]?.length || 1) - 1) * 40, winReady = game.won && winAt && now - winAt >= winDuration
  game.worms.forEach((worm, i) => {
    if (!visualWorms[i] || visualWorms[i].length !== worm.length) visualWorms[i] = copyWorms([worm])[0]
    const display = copyWorms([visualWorms[i]])[0], activeMotion = motion && i === game.active, headProgress = activeMotion ? Math.max(0, Math.min(1, (now - motion.start - motion.delay) / 105)) : 0
    let feel = activeMotion ? { direction: motion.direction, turn: motion.turn, amount: Math.sin(Math.PI * headProgress), moving: true, strain: motion.pushed } : {}
    if (!activeMotion) feel = characterFeel(worm, i, now)
    if (game.won && i === game.active && winAt) { display.forEach((part, j) => { const progress = ease((now - winAt - j * 40) / 130); part[0] += (game.exit[0] - part[0]) * progress; part[1] += (game.exit[1] - part[1]) * progress }); feel = { direction: [game.exit[0] - display[0][0], game.exit[1] - display[0][1]] }; if (winReady) return }
    else if (game.won) display.forEach((part, j) => { part[0] += Math.sin(time / 115 + j * .8 + i) * .07; part[1] += Math.cos(time / 140 + j * .7 + i) * .06 })
    if (bumpMotion && i === game.active) {
      const progress = Math.min(1, (now - bumpMotion.start) / 170), amount = Math.sin(Math.PI * progress)
      display[0][0] += bumpMotion.direction[0] * amount * .13; display[0][1] += bumpMotion.direction[1] * amount * .13
      feel = { direction: bumpMotion.direction, amount, bump: true, sweat: Boolean(failedMotion?.type), strain: Boolean(failedMotion?.type) }
      if (progress >= 1) bumpMotion = null
    }
    wormBody(display, i, tile, ox, oy, time, feel)
  })
  game.worms.forEach((worm, i) => { const [x, y] = worm[0], size = tile * 1.35, offset = (size - tile) / 2; addControl(ox + x * tile - offset, oy + y * tile - offset, size, size, () => { inputQueue = []; game.select(i); wx.setStorageSync('learnedSwitch', 1); sound('select') }) })
  particlesDraw(); ctx.restore()

  ctx.fillStyle = C.cream; ctx.font = '800 17px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(`${game.level + 1}. ${game.name}`, 15, HEADER_Y)
  ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.font = '12px sans-serif'; ctx.fillText(game.message || game.hint, 15, HEADER_Y + 21)
  ctx.textAlign = 'right'; ctx.fillText(`${game.moves} 步 · ${game.worms.length} 位伙伴`, W - 15, HEADER_Y)
  const utilityX = directionButtons ? 24 : W / 2 - 108, mapX = directionButtons ? W - 69 : utilityX + 160
  button('↶ 撤回一步', utilityX, FOOTER_Y, 86, () => { game.undo(); clearAnimation(); sound('move') }, false, game.history.length === 0)
  button('重开', utilityX + 94, FOOTER_Y, 58, () => { game.load(game.level); clearAnimation() }); button('地图', mapX, FOOTER_Y, 56, () => { scene = 'map' })
  if (directionButtons) { const directions = [['←','left'], ['↑','up'], ['↓','down'], ['→','right']], start = W / 2 - 81; directions.forEach(([label, direction], i) => button(label, start + i * 42, FOOTER_Y, 36, () => enqueue(direction))) }

  if (game.level === 0 && game.moves === 0 && !wx.getStorageSync('learnedSwipe')) {
    const pulse = Math.sin(time / 260) * 8
    ctx.strokeStyle = C.cream; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(W / 2 - 32 + pulse, H / 2); ctx.lineTo(W / 2 + 22 + pulse, H / 2); ctx.lineTo(W / 2 + 10 + pulse, H / 2 - 10); ctx.moveTo(W / 2 + 22 + pulse, H / 2); ctx.lineTo(W / 2 + 10 + pulse, H / 2 + 10); ctx.stroke()
    ctx.fillStyle = C.cream; ctx.font = '700 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('向任意方向滑动', W / 2, H / 2 + 30)
  }
  if (game.worms.length > 1 && !wx.getStorageSync('learnedSwitch')) {
    ctx.fillStyle = 'rgba(20,15,19,.82)'; rr(W / 2 - 118, FOOTER_Y - 47, 236, 34, 17); ctx.fillStyle = C.cream; ctx.font = '700 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('轻触伙伴的脑袋可以切换控制', W / 2, FOOTER_Y - 30)
  }

  if (transition > 0) { ctx.fillStyle = `rgba(20,15,19,${transition})`; ctx.fillRect(0, 0, W, H); transition = Math.max(0, transition - .045) }
  if (game.won && winReady) {
    ctx.fillStyle = 'rgba(22,17,21,.84)'; rr(W / 2 - 145, H / 2 - 76, 290, 152, 23)
    ctx.fillStyle = C.cream; ctx.font = '900 27px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('伙伴们找到路了！', W / 2, H / 2 - 34)
    ctx.font = '13px sans-serif'; ctx.fillStyle = C.white; ctx.fillText(`${game.moves} 步 · ${game.worms.length} 位伙伴`, W / 2, H / 2 - 3)
    if (game.level < LEVELS.length - 1) button('继续深入 →', W / 2 - 62, H / 2 + 20, 124, () => { game.load(game.level + 1); clearAnimation(); wx.setStorageSync('caveLevel', game.level); scene = 'play'; transition = 1 })
    else button('回到地图', W / 2 - 52, H / 2 + 20, 104, () => { scene = 'map' })
  }
}

function move(direction) {
  lastActionAt = Date.now()
  const interaction = game.interaction(direction)
  if (!visualWorms || visualWorms.length !== game.worms.length) visualWorms = copyWorms(game.worms)
  const fromById = new Map(), headId = game.worm[0].id, [dx, dy] = DIRS[direction]
  game.worms.forEach((worm, i) => worm.forEach((segment, j) => fromById.set(segment.id, (visualWorms[i]?.[j] || segment).slice())))
  const pushed = ['rock', 'egg'].includes(interaction), pushedFrom = [game.worm[0][0] + dx, game.worm[0][1] + dy]
  const ok = game.move(direction)
  if (ok) {
    const from = game.worms.map(worm => worm.map(segment => (fromById.get(segment.id) || segment.slice()).slice())), to = copyWorms(game.worms)
    const turn = Boolean(lastDirections[headId] && lastDirections[headId] !== direction)
    visualWorms = copyWorms(from); motion = { from, to, start: Date.now(), delay: pushed ? 45 : turn ? 45 : 0, direction: [dx, dy], turn, pushed }
    if (pushed) pushMotion = { type: interaction, from: pushedFrom, target: [pushedFrom[0] + dx, pushedFrom[1] + dy], to: key([pushedFrom[0] + dx, pushedFrom[1] + dy]), start: Date.now() }
    lastDirections[headId] = direction
  } else { bumpMotion = { start: Date.now(), direction: [dx, dy] }; failedMotion = pushed ? { start: Date.now(), type: interaction, position: key(pushedFrom) } : null; inputQueue = [] }
  if (ok) wx.setStorageSync('learnedSwipe', 1)
  sound(ok ? game.event : pushed ? 'fail' : 'bump'); if (ok && game.buttonChanged) sound('button'); if (!ok || game.event === 'cut') { shake = game.event === 'cut' ? 11 : 4; try { wx.vibrateShort({ type: game.event === 'cut' ? 'heavy' : 'light' }) } catch (_) {} }
  if (ok) {
    const h = game.worms[game.active][0], px = boardLayout.ox + (h[0] + .5) * boardLayout.tile, py = boardLayout.oy + (h[1] + .5) * boardLayout.tile; burst(px, py, game.event === 'apple' ? '#e64b59' : C.pink, game.event === 'cut' ? 25 : 5)
    if (game.won) {
      winAt = Date.now()
      const unlocked = Math.max(Number(wx.getStorageSync('unlocked')) || 1, Math.min(LEVELS.length, game.level + 2)); wx.setStorageSync('unlocked', unlocked)
      const best = Number(wx.getStorageSync(`best_${game.level}`)) || Infinity; if (game.moves < best) wx.setStorageSync(`best_${game.level}`, game.moves)
    }
    if (['cut', 'win', 'nest'].includes(game.event)) inputQueue = []
  }
  return ok
}

function tap(x, y) { const c = [...controls].reverse().find(v => x >= v.x && x <= v.x + v.w && y >= v.y && y <= v.y + v.h); if (c) c.action() }
function copyWorms(worms) { return worms.map(worm => worm.map(part => part.slice())) }
function swipeDirection(t) {
  return resolveSwipe(t.clientX - touch.x, t.clientY - touch.y, W)
}
function enqueue(direction) { const now = Date.now(); if (scene !== 'play' || game.won || inputQueue.length >= 2 || (direction === lastQueuedDirection && now - lastQueuedAt < 80)) return; inputQueue.push(direction); lastQueuedDirection = direction; lastQueuedAt = now }
function consumeInput() { if (!motion && !pushMotion && !bumpMotion && inputQueue.length && !game.won) move(inputQueue.shift()) }
wx.onTouchStart(e => { const t = e.touches[0], ui = controls.some(c => c.blockSwipe && t.clientX >= c.x && t.clientX <= c.x + c.w && t.clientY >= c.y && t.clientY <= c.y + c.h); lastActionAt = Date.now(); touch = { x: t.clientX, y: t.clientY, ui } })
wx.onTouchEnd(e => {
  if (!touch) return
  const t = e.changedTouches[0]
  const distance = Math.hypot(t.clientX - touch.x, t.clientY - touch.y), direction = !touch.ui && scene === 'play' ? swipeDirection(t) : null
  if (direction) enqueue(direction); else if (touch.ui || distance < 14) tap(t.clientX, t.clientY)
  touch = null
})
wx.onTouchCancel(() => { touch = null })

try {
  wx.setKeepScreenOn({ keepScreenOn: true })
  wx.showShareMenu({ menus: ['shareAppMessage'] })
  wx.onShareAppMessage(() => ({ title: '一条身体，两颗脑袋？来帮泥土小伙伴回家' }))
  wx.onHide(() => { wx.setStorageSync('caveLevel', game.level) })
  wx.onShow(() => { if (audio && audio.state === 'suspended') audio.resume() })
  if (wx.onKeyDown) wx.onKeyDown(({ key }) => {
    const keys = { ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down', ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right' }
    if (scene === 'play' && keys[key]) enqueue(keys[key])
    if (scene === 'play' && (key === 'z' || key === 'Backspace')) game.undo()
  })
} catch (_) {}

function loop(time) {
  if (scene === 'title') title(); else if (scene === 'map') mapScreen(); else { play(time); consumeInput() } requestAnimationFrame(loop)
}
loop(0)

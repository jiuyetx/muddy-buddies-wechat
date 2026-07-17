const { Game, LEVELS, DIRS, key } = require('./core')
const { resolveSwipe, chapterY } = require('./input')
const SOLUTIONS = require('./solutions')

const sys = wx.getSystemInfoSync()
const W = sys.windowWidth, H = sys.windowHeight, DPR = Math.min(sys.pixelRatio || 1, 2)
const safe = sys.safeArea || { top: 0, bottom: H }
let capsule = null
try { capsule = wx.getMenuButtonBoundingClientRect() } catch (_) {}
const SAFE_TOP = Math.max(0, safe.top || 0)
const SAFE_BOTTOM = Math.max(0, H - (safe.bottom || H))
// Some iOS/WeChat combinations briefly return portrait safe-area coordinates
// after the game has entered landscape. Reject that stale rectangle instead of
// squeezing the entire map into its reported `right` coordinate.
const safeWidth = (safe.right || W) - (safe.left || 0)
const horizontalSafeValid = safeWidth >= W * .72 && safeWidth <= W
const maxHorizontalInset = Math.min(72, W * .12)
const SAFE_LEFT = horizontalSafeValid ? Math.min(maxHorizontalInset, Math.max(0, safe.left || 0)) : 0
const SAFE_RIGHT = horizontalSafeValid ? Math.min(maxHorizontalInset, Math.max(0, W - (safe.right || W))) : 0
const BUTTON_H = 42
const HEADER_Y = SAFE_TOP + 20, FOOTER_Y = H - SAFE_BOTTOM - BUTTON_H - 6
const PLAY_HEADER_TOP = SAFE_TOP + 6, PLAY_HEADER_HEIGHT = 54, PLAY_VIEW_TOP = PLAY_HEADER_TOP + PLAY_HEADER_HEIGHT + 7, PLAY_VIEW_BOTTOM = FOOTER_Y - 12
const PLAY_HEADER_RIGHT = capsule?.left ? capsule.left - 8 : W - 10
const canvas = wx.createCanvas(), ctx = canvas.getContext('2d')
canvas.width = W * DPR; canvas.height = H * DPR; ctx.scale(DPR, DPR)
function loadCanvasImage(src) {
  const image = wx.createImage()
  image.onload = () => scheduleFrame()
  image.src = src
  return image
}
const MAP_ART = {
  title: loadCanvasImage('assets/title-root-path-bg.jpg'),
  background: loadCanvasImage('assets/life-tree-map-continuous.jpg'),
  complete: loadCanvasImage('assets/life-node-complete.png'),
  current: loadCanvasImage('assets/life-node-current.png'),
  locked: loadCanvasImage('assets/life-node-locked.png')
}

const C = { dirt: '#934b3f', deep: '#21191e', tunnel: '#30272b', ridge: '#64342f', pink: '#f29aae', rose: '#d7617c', cream: '#f7f0ce', green: '#93be72', yellow: '#f4ce4c', ink: '#191419', white: '#fffdf5' }
const CHAPTER_THEMES = {
  1: { accent: '#d8ae68', tint: 'rgba(116,71,42,.18)', floor: 'rgba(52,37,33,.94)', wall: '#654333', rim: 'rgba(216,174,104,.14)', motif: '初醒土层' },
  2: { accent: '#d7a05b', tint: 'rgba(117,72,39,.18)', floor: 'rgba(49,34,31,.94)', wall: '#684231', rim: 'rgba(215,160,91,.15)', motif: '旧根回廊' },
  3: { accent: '#d49aaa', tint: 'rgba(92,55,78,.2)', floor: 'rgba(48,34,43,.94)', wall: '#62404f', rim: 'rgba(212,154,170,.15)', motif: '苔藓之家' },
  4: { accent: '#dba55d', tint: 'rgba(105,66,38,.2)', floor: 'rgba(47,36,31,.94)', wall: '#674733', rim: 'rgba(219,165,93,.16)', motif: '菌丝工坊' },
  5: { accent: '#79d8cd', tint: 'rgba(42,75,83,.22)', floor: 'rgba(31,42,47,.94)', wall: '#38565a', rim: 'rgba(121,216,205,.18)', motif: '荧光菌潮' },
  6: { accent: '#a9bfff', tint: 'rgba(56,64,111,.23)', floor: 'rgba(34,36,52,.94)', wall: '#4b4d72', rim: 'rgba(169,191,255,.2)', motif: '水晶脉冲' },
  7: { accent: '#d993ee', tint: 'rgba(91,49,108,.23)', floor: 'rgba(46,31,50,.94)', wall: '#65416d', rim: 'rgba(217,147,238,.19)', motif: '形变标本' },
  8: { accent: '#ff9872', tint: 'rgba(124,48,42,.24)', floor: 'rgba(51,31,32,.94)', wall: '#713e38', rim: 'rgba(255,152,114,.2)', motif: '菌核警报' },
  9: { accent: '#95d1a0', tint: 'rgba(53,88,70,.22)', floor: 'rgba(34,46,41,.94)', wall: '#466052', rim: 'rgba(149,209,160,.18)', motif: '共生回声' },
  10: { accent: '#8fd2e8', tint: 'rgba(48,79,99,.23)', floor: 'rgba(31,42,49,.94)', wall: '#3e5863', rim: 'rgba(143,210,232,.2)', motif: '风痕峡道' },
  11: { accent: '#c2a7ff', tint: 'rgba(67,52,103,.24)', floor: 'rgba(37,33,50,.95)', wall: '#51466b', rim: 'rgba(194,167,255,.2)', motif: '回声深井' },
  12: { accent: '#ffd17d', tint: 'rgba(112,68,45,.22)', floor: 'rgba(49,36,38,.95)', wall: '#684b4f', rim: 'rgba(255,209,125,.21)', motif: '心根圣殿' }
}
let game = new Game(Math.min(Number(wx.getStorageSync('caveLevel')) || 0, LEVELS.length - 1))
let scene = wx.getStorageSync('seenIntro') ? 'map' : 'title'
let touch = null, controls = [], transition = 1, shake = 0, particles = [], visualWorms = null, inputQueue = []
let motion = null, bumpMotion = null, pushMotion = null, failedMotion = null, lastDirections = {}
let lastActionAt = Date.now()
let lastQueuedDirection = null, lastQueuedAt = 0, boardLayout = { tile: 0, ox: 0, oy: 0 }, winAt = 0
let audio
let muted = Boolean(wx.getStorageSync('muted'))
let directionButtons = Boolean(wx.getStorageSync('directionButtons'))
let mapScrollY = 0, mapVelocityY = 0, mapDragging = false, mapNeedsFocus = true, mapSettingsOpen = false
let appVisible = true, frameTimer = null, renderToken = 0
let frustration = 0, teaching = null, challenge = null, winMoment = null, lastChallengeQuery = ''
const MAP_VIEW_TOP = SAFE_TOP, MAP_VIEW_BOTTOM = H - SAFE_BOTTOM
const MAP_PAGE_HEIGHT = Math.max(370, H - SAFE_TOP - SAFE_BOTTOM)
const TEACHING = [
  ['rock', 'rocks', 'R', '石头只能推，不能拉'], ['scissors', 'scissors', 'S', '身体经过剪刀会分成两个伙伴'],
  ['button', 'buttons', 'B', '压住黄色按钮，白门才会开启'], ['egg', 'eggs', 'E', '蛋壳很薄，把它轻轻推回草窝'],
  ['buddy', 'buddyButtons', 'P', '绿色按钮需要伙伴亲自压住'], ['head', 'headButtons', 'H', '蓝色按钮只认伙伴的头部'],
  ['short', 'shortGates', '2', '短门只允许不超过两节的身体通过'], ['long', 'longGates', '4', '重门需要至少四节身体才能通过'],
  ['conductor', 'conductors', '+', '同一条身体要覆盖全部光点才能通电'], ['fusion', 'fusions', 'M', '相邻伙伴在紫花旁可以重新融合'],
  ['toggle', 'toggles', 'T', '紫色开关踩一次就会保持新状态'], ['oneway', 'oneWays', '^v<>', '青色根门只能顺着风纹进入'],
  ['portal', 'portals', 'O', '进入回声花，整条身体会从另一端重现'], ['acid', 'acids', 'C', '酸果会让身体缩短一节'],
  ['key', 'keys', 'K', '心钥会随身携带，并在开锁时消耗']
]

function track(action, data = {}) {
  if (typeof wx.reportEvent !== 'function') return false
  const level = LEVELS[game.level], mechanics = TEACHING.filter(([, , tokens]) => level.tiles.some(row => [...row].some(cell => tokens.includes(cell)))).map(([id]) => id).join(',') || 'none'
  try { wx.reportEvent('game_flow', { action, level_id: level.id, level: game.level + 1, chapter: level.chapter, moves: game.moves, mechanics, screen: scene, challenge: challenge ? 1 : 0, ...data }); return true } catch (_) { return false }
}
function trackChapter() {
  const chapter = LEVELS[game.level].chapter, storageKey = `analytics_chapter_${chapter}`
  if (!challenge && !wx.getStorageSync(storageKey) && track('chapter_reached', { screen: 'play' })) wx.setStorageSync(storageKey, 1)
}

function referenceMoves(level) { return SOLUTIONS[level]?.trim().split(/\s+/).filter(Boolean).length || 0 }
function levelDifficulty(level) { return LEVELS[level]?.difficulty || '入门' }
function firstStep(level) {
  const step = SOLUTIONS[level]?.trim().split(/\s+/)[0]
  if (!step) return ''
  if (step === 'fuse') return '重开后第一步：先让相邻伙伴融合'
  const parts = step.split(':'), direction = { up: '上', down: '下', left: '左', right: '右' }[parts.at(-1)]
  return `重开后第一步：${parts.length > 1 ? `伙伴${Number(parts[0]) + 1}` : '当前伙伴'}向${direction}走`
}
function progressiveHint() {
  if (game.message && game.event !== 'bump') return game.message
  if (failedMotion?.reason) return `失败原因：${failedMotion.reason}`
  if (frustration >= 6) return firstStep(game.level) || `关键思路：${game.hint}`
  if (frustration >= 4) return `关键思路：${game.hint}`
  if (frustration >= 2) return '先看机关、门和出口的位置关系'
  if (game.message) return game.message
  return '先观察地形，再决定第一步'
}
function addFrustration() { frustration = Math.min(6, frustration + 1) }
function loadLevel(index) { game.load(index); frustration = 0; teaching = null; winMoment = null; clearAnimation(); track('level_start', { screen: 'play' }); trackChapter() }
function openChallenge(query) {
  const level = Number(query?.level), moves = Number(query?.moves), signature = `${level}:${moves}`
  if (query?.challenge !== '1' || !Number.isInteger(level) || level < 1 || level > LEVELS.length || !Number.isInteger(moves) || moves < 1 || moves > 9999 || signature === lastChallengeQuery) return
  const unlocked = Math.min(Number(wx.getStorageSync('unlocked')) || 1, LEVELS.length)
  challenge = { level: level - 1, moves, mainLevel: challenge?.mainLevel ?? unlocked - 1 }
  lastChallengeQuery = signature; loadLevel(challenge.level); track('share_enter', { screen: 'play', source: 'challenge', target_moves: moves }); scene = 'play'; transition = 1
}
function returnToMain() {
  const level = challenge?.mainLevel ?? Math.min(Number(wx.getStorageSync('unlocked')) || 1, LEVELS.length) - 1
  challenge = null; loadLevel(level); scene = 'play'; transition = 1
}
function winHighlight(previousBest) {
  const firstClear = !Number.isFinite(previousBest), chapterComplete = firstClear && LEVELS[game.level + 1]?.chapter !== LEVELS[game.level].chapter
  const hardClear = firstClear && levelDifficulty(game.level) === '高难'
  return game.moves < previousBest && !firstClear ? '新纪录' : chapterComplete ? '章节完成' : hardClear ? '高难关突破' : ''
}
function shareChallenge() {
  const level = game.level + 1, moves = game.moves, title = `我在第 ${level} 关用了 ${moves} 步，你能更少吗？`
  track('share_click', { source: 'challenge' })
  const share = imageUrl => wx.shareAppMessage({ title, query: `challenge=1&level=${level}&moves=${moves}`, ...(imageUrl ? { imageUrl } : {}) })
  try {
    const card = wx.createCanvas(), cardCtx = card.getContext('2d'); card.width = 600; card.height = 480
    const gradient = cardCtx.createLinearGradient(0, 0, 600, 480); gradient.addColorStop(0, '#21191e'); gradient.addColorStop(1, '#64342f')
    cardCtx.fillStyle = gradient; cardCtx.fillRect(0, 0, 600, 480)
    cardCtx.fillStyle = '#f4ce4c'; cardCtx.font = '700 26px sans-serif'; cardCtx.textAlign = 'center'; cardCtx.fillText('泥土小伙伴 · 好友挑战', 300, 90)
    cardCtx.fillStyle = '#f7f0ce'; cardCtx.font = '900 52px sans-serif'; cardCtx.fillText(`第 ${level} 关`, 300, 185)
    cardCtx.font = '900 72px sans-serif'; cardCtx.fillText(`${moves} 步`, 300, 285)
    cardCtx.font = '700 30px sans-serif'; cardCtx.fillText('你能更少吗？', 300, 365)
    card.toTempFilePath({ destWidth: 600, destHeight: 480, fileType: 'jpg', quality: .9, success: result => share(result.tempFilePath), fail: () => share() })
  } catch (_) { share() }
}

function mapMetrics() {
  const viewportH = MAP_VIEW_BOTTOM - MAP_VIEW_TOP
  // Canvas coordinates are logical pixels, so the short edge is the most
  // reliable size reference across compact Androids and large iPhones.
  const node = Math.max(82, Math.min(108, viewportH * .245))
  const activeNode = Math.max(106, Math.min(136, node * 1.27))
  const panelW = Math.max(172, Math.min(214, W * .235))
  return {
    node,
    activeNode,
    chapterFont: Math.max(13, Math.min(16, viewportH * .036)),
    levelFont: Math.max(21, Math.min(27, node * .25)),
    activeLevelFont: Math.max(27, Math.min(34, activeNode * .25)),
    labelH: Math.max(30, Math.min(36, node * .36)),
    panelW
  }
}

function rr(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); ctx.fill()
}

function fitText(text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let result = text
  while (result && ctx.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1)
  return `${result}…`
}

function sound(kind) {
  if (muted) return
  try {
    audio ||= wx.createWebAudioContext()
    const osc = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime
    const notes = { move: 130, push: 90, apple: 420, acid: 240, key: 610, unlock: 560, portal: 470, cut: 180, nest: 520, exit: 540, win: 660, bump: 70, fail: 58, button: 360, select: 300 }
    osc.type = kind === 'cut' ? 'sawtooth' : 'sine'; osc.frequency.setValueAtTime(notes[kind] || 140, now)
    if (kind === 'win') osc.frequency.exponentialRampToValueAtTime(990, now + .22)
    gain.gain.setValueAtTime(.055, now); gain.gain.exponentialRampToValueAtTime(.001, now + .18)
    osc.connect(gain); gain.connect(audio.destination); osc.start(now); osc.stop(now + .2)
  } catch (_) {}
}

function addControl(x, y, w, h, action, blockSwipe = false) { controls.push({ x, y, w, h, action, blockSwipe }) }
function button(label, x, y, w, action, accent = false, disabled = false) {
  ctx.save(); if (disabled) ctx.globalAlpha = .34
  ctx.shadowColor = accent ? 'rgba(247,240,206,.28)' : 'rgba(10,7,9,.2)'; ctx.shadowBlur = accent ? 14 : 7; ctx.shadowOffsetY = 3
  ctx.fillStyle = accent ? C.cream : 'rgba(25,20,24,.82)'; rr(x, y, w, BUTTON_H, 21)
  ctx.shadowColor = 'transparent'; ctx.strokeStyle = accent ? 'rgba(255,255,255,.55)' : 'rgba(180,137,72,.32)'; ctx.lineWidth = 1; ctx.stroke()
  ctx.fillStyle = accent ? C.ink : C.cream; ctx.font = '800 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x + w / 2, y + BUTTON_H / 2)
  ctx.restore(); if (!disabled) addControl(x, y, w, BUTTON_H, action, true)
}

function mapSettingsButton(x, y, action) {
  ctx.save(); ctx.shadowColor = 'rgba(8,5,7,.5)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4
  ctx.fillStyle = 'rgba(25,20,24,.9)'; ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2); ctx.fill()
  ctx.shadowColor = 'transparent'; ctx.strokeStyle = 'rgba(244,206,76,.55)'; ctx.lineWidth = 1.4; ctx.stroke()
  ctx.strokeStyle = C.cream; ctx.fillStyle = C.cream; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill()
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10); ctx.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14); ctx.stroke() }
  ctx.restore(); addControl(x - 28, y - 28, 56, 56, action, true)
}

function mapBackButton(x, y, action) {
  const w = 82, h = 42
  ctx.save(); ctx.shadowColor = 'rgba(8,5,7,.46)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4
  ctx.fillStyle = 'rgba(25,20,24,.9)'; rr(x, y, w, h, h / 2)
  ctx.shadowColor = 'transparent'; ctx.strokeStyle = 'rgba(244,206,76,.58)'; ctx.lineWidth = 1.4; ctx.stroke()
  ctx.strokeStyle = C.cream; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.beginPath(); ctx.moveTo(x + 27, y + 13); ctx.lineTo(x + 19, y + h / 2); ctx.lineTo(x + 27, y + h - 13); ctx.stroke()
  ctx.fillStyle = C.cream; ctx.font = '800 14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('返回', x + 36, y + h / 2)
  ctx.restore(); addControl(x - 4, y - 5, w + 8, h + 10, action, true)
}

function mapSegmentedToggle(x, y, value, action) {
  const w = 116, h = 34
  ctx.fillStyle = 'rgba(15,12,14,.72)'; rr(x, y, w, h, 17)
  ctx.strokeStyle = 'rgba(247,240,206,.18)'; ctx.lineWidth = 1; ctx.stroke()
  ctx.fillStyle = value ? 'rgba(105,142,65,.92)' : 'rgba(71,58,62,.92)'; rr(x + (value ? w / 2 : 2), y + 2, w / 2 - 2, h - 4, 15)
  ctx.fillStyle = value ? 'rgba(247,240,206,.55)' : C.cream; ctx.font = '800 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('关', x + w * .25, y + h / 2)
  ctx.fillStyle = value ? C.cream : 'rgba(247,240,206,.55)'; ctx.fillText('开', x + w * .75, y + h / 2)
  addControl(x, y, w, h, action, true)
}

function currentChapterTheme() { return CHAPTER_THEMES[LEVELS[game.level]?.chapter] || CHAPTER_THEMES[1] }

function playBackdrop(theme) {
  ctx.fillStyle = '#171116'; ctx.fillRect(-10, -10, W + 20, H + 20)
  const image = MAP_ART.background
  if (image.width) {
    const sourceH = Math.min(image.height, image.width * H / W)
    const progress = LEVELS.length > 1 ? game.level / (LEVELS.length - 1) : 0
    const sourceY = Math.max(0, Math.min(image.height - sourceH, progress * (image.height - sourceH)))
    ctx.drawImage(image, 0, sourceY, image.width, sourceH, 0, 0, W, H)
  }
  ctx.fillStyle = theme.tint; ctx.fillRect(0, 0, W, H)
  const shade = ctx.createLinearGradient(0, 0, 0, H)
  shade.addColorStop(0, 'rgba(18,13,17,.24)'); shade.addColorStop(.55, 'rgba(18,13,17,.42)'); shade.addColorStop(1, 'rgba(18,13,17,.68)')
  ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H)
}

function title() {
  ctx.fillStyle = '#181114'; ctx.fillRect(0, 0, W, H); controls = []
  if (MAP_ART.title.width) ctx.drawImage(MAP_ART.title, 0, 0, W, H)
  const x = W * .3
  ctx.save(); ctx.shadowColor = 'rgba(8,5,7,.92)'; ctx.shadowBlur = 12
  ctx.fillStyle = C.cream; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.font = `700 ${Math.max(13, Math.min(17, W / 60))}px sans-serif`; ctx.fillText('一条身体 · 一群伙伴 · 一起回家', x, H * .29)
  ctx.font = `900 ${Math.min(52, W / 17.8)}px sans-serif`; ctx.fillText('泥 土 小 伙 伴', x, H * .405)
  ctx.restore()
  const ctaW = Math.min(220, W * .24), ctaH = 52, ctaX = x - ctaW / 2, ctaY = H * .535
  ctx.save(); ctx.shadowColor = 'rgba(244,206,76,.35)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4
  ctx.fillStyle = C.cream; rr(ctaX, ctaY, ctaW, ctaH, 26); ctx.shadowColor = 'transparent'
  ctx.strokeStyle = 'rgba(180,137,72,.82)'; ctx.lineWidth = 2; ctx.stroke()
  const unlocked = Math.min(Number(wx.getStorageSync('unlocked')) || 1, LEVELS.length), returning = Boolean(wx.getStorageSync('seenIntro'))
  const cta = returning ? `继续第 ${unlocked} 关` : '开始探索'
  ctx.fillStyle = '#533217'; ctx.font = '900 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(cta, x, ctaY + ctaH / 2)
  ctx.restore()
  addControl(ctaX, ctaY, ctaW, ctaH, () => {
    track('game_start', { source: returning ? 'continue' : 'new' }); wx.setStorageSync('seenIntro', 1); sound('win')
    if (returning) { loadLevel(unlocked - 1); scene = 'play'; transition = 1 }
    else { scene = 'map'; mapNeedsFocus = true }
  }, true)
}

function mapLayout() {
  const metrics = mapMetrics()
  const chapters = []
  LEVELS.forEach((level, index) => {
    let chapter = chapters.find(item => item.number === level.chapter)
    if (!chapter) { chapter = { number: level.chapter, name: level.chapterName, levels: [] }; chapters.push(chapter) }
    chapter.levels.push({ level, index })
  })
  const nodes = [], labels = [], pages = Math.ceil(chapters.length / 2)
  chapters.forEach((chapter, chapterIndex) => {
    const page = Math.floor(chapterIndex / 2), lower = chapterIndex % 2 === 1
    const y = chapterY(chapterIndex, MAP_PAGE_HEIGHT)
    const count = chapter.levels.length
    const edge = Math.max(metrics.node * .62, 54)
    const left = Math.max(SAFE_LEFT + edge, W * .1)
    const right = Math.min(W - SAFE_RIGHT - edge, W * .9)
    labels.push({ chapter, x: left + (right - left) * (lower ? .34 : .29), y: y - metrics.activeNode * .5 - metrics.labelH * .5 - 8 })
    chapter.levels.forEach(({ level, index }, i) => nodes.push({ level, index, page, x: count === 1 ? W * .5 : left + (right - left) * i / (count - 1), y }))
  })
  return { chapters, labels, nodes, pages }
}

function focusMapCurrent() {
  const unlocked = Math.min(Number(wx.getStorageSync('unlocked')) || 1, LEVELS.length), node = mapLayout().nodes[unlocked - 1]
  mapScrollY = Math.max(0, Math.min(mapMaxScroll(), node.y - (MAP_VIEW_TOP + MAP_VIEW_BOTTOM) / 2)); mapVelocityY = 0; mapNeedsFocus = false
}

function mapMaxScroll() { const layout = mapLayout(); return Math.max(0, layout.pages * MAP_PAGE_HEIGHT - (MAP_VIEW_BOTTOM - MAP_VIEW_TOP)) }

function updateMapScroll() {
  if (mapNeedsFocus) focusMapCurrent()
  if (!mapDragging) { mapScrollY += mapVelocityY; mapVelocityY *= .9 }
  const max = mapMaxScroll()
  if (mapScrollY < 0) mapVelocityY += -mapScrollY * .15
  if (mapScrollY > max) mapVelocityY += (max - mapScrollY) * .15
  if (!mapDragging && Math.abs(mapVelocityY) < .05) { mapVelocityY = 0; mapScrollY = Math.max(0, Math.min(max, mapScrollY)) }
}

function mapScreen(time) {
  ctx.fillStyle = '#21191e'; ctx.fillRect(0, 0, W, H); controls = []; updateMapScroll()
  const metrics = mapMetrics(), layout = mapLayout(), nodes = layout.nodes, unlocked = Math.min(Number(wx.getStorageSync('unlocked')) || 1, LEVELS.length), current = unlocked - 1
  const topBlendBottom = Math.max(104, SAFE_TOP + 96)
  // Let the tree artwork continue behind the top safe area while keeping
  // labels and level controls inside the interactive viewport below it.
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip(); ctx.translate(0, -mapScrollY)
  if (MAP_ART.background.width) ctx.drawImage(MAP_ART.background, 0, 0, W, layout.pages * MAP_PAGE_HEIGHT)
  ctx.restore()
  ctx.save(); ctx.beginPath(); ctx.rect(0, MAP_VIEW_TOP, W, MAP_VIEW_BOTTOM - MAP_VIEW_TOP); ctx.clip(); ctx.translate(0, -mapScrollY)
  layout.labels.forEach(({ chapter, x, y }) => {
    const labelW = Math.max(154, Math.min(210, W * .245)), labelH = metrics.labelH
    ctx.fillStyle = 'rgba(20,15,19,.88)'; rr(x - labelW / 2, y - labelH / 2, labelW, labelH, labelH / 2)
    ctx.strokeStyle = 'rgba(247,240,206,.13)'; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = C.cream; ctx.font = `800 ${metrics.chapterFont}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`第${chapter.number}章 · ${chapter.name}`, x, y)
  })
  nodes.forEach(({ level, index: i, x, y }) => {
    const available = i < unlocked, active = i === current
    const size = active ? metrics.activeNode + Math.sin(time / 280) * 3 : metrics.node, sprite = active ? MAP_ART.current : available ? MAP_ART.complete : MAP_ART.locked
    if (sprite.width) ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size)
    else { ctx.fillStyle = active ? C.yellow : available ? C.green : C.deep; ctx.beginPath(); ctx.arc(x, y, size * .34, 0, 7); ctx.fill() }
    ctx.fillStyle = available ? C.ink : 'rgba(247,240,206,.5)'; ctx.font = `900 ${active ? metrics.activeLevelFont : metrics.levelFont}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(i + 1, x, y + 1)
    const difficulty = levelDifficulty(i), badgeX = x + size * .3, badgeY = y - size * .3
    ctx.fillStyle = difficulty === '高难' ? C.rose : difficulty === '进阶' ? C.yellow : C.green; rr(badgeX - 24, badgeY - 10, 48, 20, 10)
    ctx.fillStyle = C.ink; ctx.font = '900 10px sans-serif'; ctx.fillText(difficulty, badgeX, badgeY + .5)
    if (!available) {
      ctx.save(); ctx.strokeStyle = 'rgba(247,240,206,.58)'; ctx.fillStyle = 'rgba(20,15,19,.88)'; ctx.lineWidth = 2.2
      ctx.beginPath(); ctx.arc(x, y + size * .25, 6, Math.PI, 0); ctx.stroke(); rr(x - 7, y + size * .24, 14, 12, 3); ctx.restore()
    }
    if (active || available) {
      const best = Number(wx.getStorageSync(`best_${i}`)), reference = referenceMoves(i), achieved = !active && best && reference && best <= reference
      const text = active ? `继续 · ${level.name}` : achieved ? '' : best && reference ? `最佳 ${best} / 参考 ${reference}` : '已通关', labelW = active ? Math.max(132, Math.min(164, W * .18)) : Math.max(104, metrics.node * 1.06), statusH = metrics.labelH - 2
      ctx.fillStyle = 'rgba(20,15,19,.9)'; rr(x - labelW / 2, y + size * .32, labelW, statusH, statusH / 2)
      ctx.strokeStyle = active ? 'rgba(244,206,76,.52)' : 'rgba(247,240,206,.1)'; ctx.lineWidth = 1; ctx.stroke()
      ctx.fillStyle = active ? C.cream : 'rgba(247,240,206,.72)'; ctx.font = active ? '800 14px sans-serif' : '700 11px sans-serif'
      if (achieved) { ctx.fillStyle = C.yellow; ctx.font = '900 17px sans-serif'; ctx.fillText('★★★', x, y + size * .32 + statusH / 2) }
      else ctx.fillText(fitText(text, labelW - 10), x, y + size * .32 + statusH / 2)
    }
    const screenY = y - mapScrollY
    const hitSize = Math.max(96, size)
    if (available && screenY > SAFE_TOP + 54 && screenY < MAP_VIEW_BOTTOM + hitSize / 2) addControl(x - hitSize / 2, screenY - hitSize / 2, hitSize, hitSize, () => { loadLevel(i); scene = 'play'; transition = 1; sound('select') })
  })
  ctx.restore()
  const topBlend = ctx.createLinearGradient(0, 0, 0, topBlendBottom)
  topBlend.addColorStop(0, 'rgba(33,25,30,.98)')
  topBlend.addColorStop(Math.min(.72, Math.max(.28, (SAFE_TOP + 18) / topBlendBottom)), 'rgba(33,25,30,.72)')
  topBlend.addColorStop(1, 'rgba(33,25,30,0)')
  ctx.fillStyle = topBlend; ctx.fillRect(0, 0, W, topBlendBottom)
  const currentNode = nodes[current], distance = Math.abs(currentNode.y - mapScrollY - (MAP_VIEW_TOP + MAP_VIEW_BOTTOM) / 2)
  ctx.save(); ctx.shadowColor = 'rgba(8,5,7,.9)'; ctx.shadowBlur = 8
  const backX = SAFE_LEFT + 14, backY = SAFE_TOP + 8, headerX = backX + 100
  mapBackButton(backX, backY, () => { scene = 'title'; mapSettingsOpen = false; sound('select') })
  ctx.fillStyle = C.cream; ctx.font = '900 23px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText('生命树', headerX, SAFE_TOP + 28)
  ctx.fillStyle = 'rgba(247,240,206,.72)'; ctx.font = '12px sans-serif'; ctx.fillText('土壤深处，了解根源', headerX, SAFE_TOP + 47)
  ctx.fillStyle = C.yellow; ctx.font = '800 14px sans-serif'; ctx.fillText(`${unlocked} / ${LEVELS.length} 已开放`, headerX, SAFE_TOP + 68); ctx.restore()

  const panelW = metrics.panelW, panelX = W - SAFE_RIGHT - panelW - 8, toolX = Math.min(W - SAFE_RIGHT - 34, PLAY_HEADER_RIGHT - 28), toolTop = SAFE_TOP + 28
  mapSettingsButton(toolX, toolTop, () => { mapSettingsOpen = !mapSettingsOpen; sound('select') })
  if (mapSettingsOpen) {
    const panelY = SAFE_TOP + 58, panelH = H - SAFE_BOTTOM - panelY - 10
    ctx.save(); ctx.shadowColor = 'rgba(8,5,7,.62)'; ctx.shadowBlur = 20; ctx.shadowOffsetX = -7
    ctx.fillStyle = 'rgba(25,19,20,.94)'; rr(panelX, panelY, panelW, panelH, 26)
    ctx.shadowColor = 'transparent'; ctx.strokeStyle = 'rgba(180,137,72,.45)'; ctx.lineWidth = 1.2; ctx.stroke()
    ctx.fillStyle = C.cream; ctx.font = '900 21px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('设置', panelX + 20, panelY + 30)
    addControl(panelX, panelY, panelW, panelH, () => {}, true)
    ctx.strokeStyle = 'rgba(247,240,206,.2)'; ctx.beginPath(); ctx.moveTo(panelX + 18, panelY + 54); ctx.lineTo(panelX + panelW - 18, panelY + 54); ctx.stroke()
    ctx.fillStyle = C.cream; ctx.font = '800 14px sans-serif'; ctx.fillText('辅助键', panelX + 20, panelY + 78)
    mapSegmentedToggle(panelX + 20, panelY + 94, directionButtons, () => { directionButtons = !directionButtons; wx.setStorageSync('directionButtons', directionButtons); sound('select') })
    ctx.textAlign = 'left'; ctx.fillStyle = C.cream
    ctx.fillText('声音', panelX + 20, panelY + 153)
    mapSegmentedToggle(panelX + 20, panelY + 169, !muted, () => { muted = !muted; wx.setStorageSync('muted', muted); if (!muted) sound('select') })
    ctx.restore()
  }
  if (distance > MAP_PAGE_HEIGHT * .55) button('回到当前', 18, H - SAFE_BOTTOM - BUTTON_H - 12, 100, () => { mapNeedsFocus = true; sound('select') })
}

function object(type, x, y, s, t, active = false) {
  const cx = x + s / 2, cy = y + s / 2
  ctx.save()
  const objectScale = {
    apple: 1.3,
    rock: 1.24,
    egg: 1.3,
    conductor: 1.28,
    fusion: 1.16,
    toggle: 1.26,
    shortGate: 1.1,
    longGate: 1.1,
    oneWay: 1.08,
    button: 1.24,
    buddyButton: 1.24,
    headButton: 1.24,
    nest: 1.18,
    scissors: 1.34,
    portal: 1.16,
    acid: 1.28,
    key: 1.22,
    lock: 1.12,
    exit: 1.08
  }[type] || 1
  ctx.translate(cx, cy); ctx.scale(objectScale, objectScale); ctx.translate(-cx, -cy)
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
  if (type === 'conductor') {
    ctx.shadowColor = 'transparent'; ctx.strokeStyle = active ? C.yellow : '#7fe1e8'; ctx.lineWidth = s * .13; ctx.beginPath(); ctx.arc(cx, cy, s * .24, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx - s * .14, cy); ctx.lineTo(cx + s * .14, cy); ctx.moveTo(cx, cy - s * .14); ctx.lineTo(cx, cy + s * .14); ctx.stroke()
  }
  if (type === 'fusion') {
    const bloom = 1 + Math.sin(t / 360) * .055
    ctx.shadowColor = 'transparent'
    ctx.strokeStyle = '#4f7b4d'; ctx.lineWidth = Math.max(2, s * .065); ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(cx, cy + s * .13); ctx.quadraticCurveTo(cx + s * .02, cy + s * .3, cx - s * .03, cy + s * .42); ctx.stroke()
    ctx.fillStyle = '#6fa760'; ctx.beginPath(); ctx.ellipse(cx + s * .09, cy + s * .31, s * .13, s * .07, -.45, 0, 7); ctx.fill()
    ctx.save(); ctx.translate(cx, cy - s * .03); ctx.scale(bloom, bloom)
    ctx.shadowColor = '#d7a8ff'; ctx.shadowBlur = s * .2
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3, px = Math.cos(angle) * s * .2, py = Math.sin(angle) * s * .2
      ctx.fillStyle = i % 2 ? '#a961dc' : '#c882f2'
      ctx.beginPath(); ctx.ellipse(px, py, s * .14, s * .22, angle + Math.PI / 2, 0, 7); ctx.fill()
      ctx.fillStyle = 'rgba(255,221,255,.32)'
      ctx.beginPath(); ctx.ellipse(px * .92, py * .92, s * .055, s * .13, angle + Math.PI / 2, 0, 7); ctx.fill()
    }
    ctx.shadowColor = '#ffe58c'; ctx.shadowBlur = s * .16; ctx.fillStyle = '#f7cf58'
    ctx.beginPath(); ctx.arc(0, 0, s * .16, 0, 7); ctx.fill()
    ctx.shadowColor = 'transparent'; ctx.fillStyle = '#5a3b36'; ctx.font = `900 ${Math.max(9, s * .19)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('合', 0, s * .01)
    ctx.restore()
  }
  if (type === 'toggle') {
    ctx.fillStyle = active ? '#f5cf56' : '#7d6aaa'; ctx.beginPath(); ctx.arc(cx, cy, s * .29, 0, 7); ctx.fill()
    ctx.shadowColor = 'transparent'; ctx.strokeStyle = active ? '#fff2a6' : '#c9b9ef'; ctx.lineWidth = Math.max(2, s * .055); ctx.beginPath(); ctx.arc(cx, cy, s * .2, 0, 7); ctx.stroke()
    ctx.fillStyle = C.ink; ctx.font = `900 ${s * .23}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('T', cx, cy)
  }
  if (type === 'shortGate' || type === 'longGate') {
    ctx.fillStyle = type === 'shortGate' ? '#86d8a0' : '#d6a36b'; rr(x + s * .18, y + s * .08, s * .64, s * .84, s * .14); ctx.shadowColor = 'transparent'; ctx.fillStyle = C.ink; ctx.font = `900 ${s * .24}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(type === 'shortGate' ? '≤2' : '≥4', cx, cy)
  }
  if (type === 'oneWay') {
    ctx.shadowColor = 'transparent'; ctx.fillStyle = 'rgba(111,196,188,.22)'; rr(x + s * .08, y + s * .08, s * .84, s * .84, s * .2)
    const angle = { '>': 0, v: Math.PI / 2, '<': Math.PI, '^': -Math.PI / 2 }[active] || 0
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle); ctx.strokeStyle = '#8de4d6'; ctx.lineWidth = Math.max(2, s * .09); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(-s * .23, 0); ctx.lineTo(s * .2, 0); ctx.moveTo(s * .04, -s * .16); ctx.lineTo(s * .2, 0); ctx.lineTo(s * .04, s * .16); ctx.stroke(); ctx.restore()
  }
  if (['button', 'buddyButton', 'headButton'].includes(type)) {
    if (active) ctx.translate(0, s * .07)
    ctx.fillStyle = '#8e681e'; ctx.beginPath(); ctx.ellipse(cx, cy + s * .17, s * .34, s * .16, 0, 0, 7); ctx.fill()
    ctx.shadowColor = 'transparent'; ctx.fillStyle = type === 'buddyButton' ? '#74d5b1' : type === 'headButton' ? '#8bc7ef' : C.yellow; ctx.beginPath(); ctx.ellipse(cx, cy + s * .04, s * .3, s * .16, 0, 0, 7); ctx.fill()
    ctx.fillStyle = '#ffe783'; ctx.beginPath(); ctx.ellipse(cx - s * .07, cy, s * .13, s * .055, -.15, 0, 7); ctx.fill()
    if (type !== 'button') { ctx.fillStyle = C.ink; ctx.font = `900 ${Math.max(9, s * .2)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(type === 'buddyButton' ? 'P' : 'H', cx, cy + s * .05) }
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
  if (type === 'portal') {
    const spin = t / 560
    ctx.shadowColor = '#bda0ff'; ctx.shadowBlur = s * .28; ctx.strokeStyle = '#cdb9ff'; ctx.lineWidth = Math.max(2, s * .065)
    ctx.beginPath(); ctx.arc(cx, cy, s * .31, 0, 7); ctx.stroke(); ctx.shadowColor = 'transparent'
    for (let i = 0; i < 3; i++) { const a = spin + i * Math.PI * 2 / 3; ctx.fillStyle = i === 1 ? '#7ce3dc' : '#a989ed'; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * s * .23, cy + Math.sin(a) * s * .23, s * .105, s * .055, a, 0, 7); ctx.fill() }
    ctx.fillStyle = '#261f35'; ctx.beginPath(); ctx.arc(cx, cy, s * .16, 0, 7); ctx.fill()
  }
  if (type === 'acid') {
    ctx.fillStyle = '#7fb744'; ctx.beginPath(); ctx.arc(cx, cy + s * .04, s * .27, 0, 7); ctx.fill()
    ctx.shadowColor = 'transparent'; ctx.fillStyle = '#b9df67'; ctx.beginPath(); ctx.arc(cx - s * .07, cy - s * .03, s * .17, 0, 7); ctx.fill()
    ctx.strokeStyle = '#506d35'; ctx.lineWidth = Math.max(2, s * .05); ctx.beginPath(); ctx.moveTo(cx, cy - s * .19); ctx.lineTo(cx + s * .05, cy - s * .34); ctx.stroke()
    ctx.fillStyle = '#f3ffd3'; ctx.font = `900 ${Math.max(10, s * .24)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('−1', cx, cy + s * .06)
  }
  if (type === 'key') {
    ctx.shadowColor = '#ffd36f'; ctx.shadowBlur = s * .2; ctx.strokeStyle = '#ffd36f'; ctx.lineWidth = Math.max(3, s * .1); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.arc(cx - s * .12, cy - s * .06, s * .15, 0, 7); ctx.moveTo(cx, cy + s * .03); ctx.lineTo(cx + s * .28, cy + s * .28); ctx.moveTo(cx + s * .16, cy + s * .16); ctx.lineTo(cx + s * .26, cy + s * .06); ctx.stroke(); ctx.shadowColor = 'transparent'
  }
  if (type === 'lock') {
    ctx.fillStyle = active ? 'rgba(90,66,95,.42)' : '#5a425f'; rr(x + s * .19, y + s * .36, s * .62, s * .48, s * .12)
    ctx.shadowColor = 'transparent'; ctx.strokeStyle = active ? '#8e7c73' : '#e1bd70'; ctx.lineWidth = Math.max(2, s * .07); ctx.beginPath(); ctx.arc(cx + (active ? s * .14 : 0), y + s * .37, s * .19, Math.PI, 0); ctx.stroke()
    ctx.fillStyle = '#f5d788'; ctx.beginPath(); ctx.arc(cx, y + s * .57, s * .055, 0, 7); ctx.fill(); rr(cx - s * .028, y + s * .59, s * .056, s * .12, s * .02)
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
function ensureTeaching() {
  if (teaching) return teaching
  const item = TEACHING.find(([id, collection, tokens]) => !wx.getStorageSync(`taught_${id}`) && game[collection]?.size && game.level === LEVELS.findIndex(level => level.tiles.some(row => [...row].some(cell => tokens.includes(cell)))))
  if (!item) return null
  const [id, collection, , text] = item, position = [...(game[collection].keys?.() || game[collection])][0]
  teaching = { id, text, position: position.split(',').map(Number) }
  return teaching
}
function teachingCard(time) {
  const card = ensureTeaching(); if (!card) return
  const [tx, ty] = card.position, targetX = boardLayout.ox + (tx + .5) * boardLayout.tile, targetY = boardLayout.oy + (ty + .5) * boardLayout.tile
  const w = Math.min(390, W - SAFE_LEFT - SAFE_RIGHT - 32), h = 58, x = (W - w) / 2, y = PLAY_VIEW_BOTTOM - h - 8, pulse = 7 + Math.sin(time / 180) * 3
  ctx.save(); ctx.strokeStyle = C.yellow; ctx.lineWidth = 2.5; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(targetX, targetY); ctx.stroke(); ctx.setLineDash([])
  ctx.beginPath(); ctx.arc(targetX, targetY, boardLayout.tile * .48 + pulse, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = 'rgba(20,15,19,.96)'; rr(x, y, w, h, 18); ctx.strokeStyle = 'rgba(244,206,76,.7)'; ctx.lineWidth = 1.5; ctx.stroke()
  ctx.fillStyle = C.cream; ctx.font = '800 14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(fitText(card.text, w - 92), x + 18, y + h / 2)
  ctx.fillStyle = C.yellow; ctx.textAlign = 'right'; ctx.fillText('知道了', x + w - 18, y + h / 2); ctx.restore()
  addControl(x, y, w, h, () => { wx.setStorageSync(`taught_${card.id}`, 1); teaching = null; sound('select') }, true)
}
function obstacleReason() {
  if (!failedMotion?.reason) return
  const [x, y] = failedMotion.position.split(',').map(Number), px = boardLayout.ox + (x + .5) * boardLayout.tile, py = boardLayout.oy + y * boardLayout.tile
  ctx.save(); ctx.font = '800 12px sans-serif'; const w = Math.min(220, Math.max(118, ctx.measureText(failedMotion.reason).width + 24)), bx = Math.max(SAFE_LEFT + 8, Math.min(W - SAFE_RIGHT - w - 8, px - w / 2)), by = Math.max(PLAY_VIEW_TOP + 4, py - 38)
  ctx.fillStyle = 'rgba(20,15,19,.94)'; rr(bx, by, w, 30, 15); ctx.strokeStyle = 'rgba(244,206,76,.72)'; ctx.lineWidth = 1; ctx.stroke()
  ctx.fillStyle = C.cream; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(fitText(failedMotion.reason, w - 16), bx + w / 2, by + 15); ctx.restore()
}
function characterFeel(worm, index, now) {
  if (game.won) return { celebrate: true }
  if (now - lastActionAt < 900) return {}
  const [hx, hy] = worm[0], other = game.worms.map((w, i) => i === index || game.isExited(w) ? null : w[0]).filter(Boolean).sort((a, b) => Math.abs(a[0] - hx) + Math.abs(a[1] - hy) - Math.abs(b[0] - hx) - Math.abs(b[1] - hy))[0]
  const targets = [...game.apples, ...game.acids, ...game.keys, ...game.portals, ...game.rocks, ...game.eggs, ...game.scissors, ...game.buttons, ...game.buddyButtons, ...game.headButtons, ...game.exits].map(p => p.split(',').map(Number))
  const target = other && Math.abs(other[0] - hx) + Math.abs(other[1] - hy) <= 5 ? other : targets.sort((a, b) => Math.abs(a[0] - hx) + Math.abs(a[1] - hy) - Math.abs(b[0] - hx) - Math.abs(b[1] - hy))[0]
  const idle = now - lastActionAt, yawn = idle > 5000 && (idle - 5000) % 5200 < 1400, nearEgg = [...game.eggs].some(p => { const [x, y] = p.split(',').map(Number); return Math.abs(x - hx) + Math.abs(y - hy) <= 2 })
  return { direction: target ? [target[0] - hx, target[1] - hy] : undefined, yawn, nervous: nearEgg }
}

function play(time) {
  controls = []; ctx.save(); if (shake > 0) { ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake); shake *= .82 }
  const theme = currentChapterTheme(), chapterNumber = LEVELS[game.level]?.chapter || 1
  playBackdrop(theme)
  const availableH = PLAY_VIEW_BOTTOM - PLAY_VIEW_TOP, tile = Math.floor(Math.min((W - 32) / game.w, availableH / game.h)), ox = Math.floor((W - game.w * tile) / 2)
  const oy = PLAY_VIEW_TOP + Math.min(Math.floor(Math.max(0, availableH - game.h * tile) * .15), 16)
  boardLayout = { tile, ox, oy }
  ctx.fillStyle = theme.floor; ctx.strokeStyle = theme.rim; ctx.lineWidth = 1
  for (let y = 0; y < game.h; y++) for (let x = 0; x < game.w; x++) if (!game.walls.has(key([x, y]))) {
    rr(ox + x * tile - 1, oy + y * tile - 1, tile + 2, tile + 2, tile * .19)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,.026)'; ctx.beginPath(); ctx.arc(ox + (x + .25) * tile, oy + (y + .28) * tile, Math.max(1, tile * .025), 0, 7); ctx.fill(); ctx.fillStyle = theme.floor
  }
  ctx.fillStyle = theme.wall; game.walls.forEach(p => { const [x, y] = p.split(',').map(Number); rr(ox + x * tile + 2, oy + y * tile + 3, tile - 4, tile - 5, tile * .14); ctx.fillStyle = theme.rim; rr(ox + x * tile + 5, oy + y * tile + 5, tile - 10, Math.max(2, tile * .08), tile * .04); ctx.fillStyle = theme.wall })
  const now = Date.now()
  if (failedMotion && now - failedMotion.start >= 1400) failedMotion = null
  const occupied = new Set(game.liveWorms().flat().map(key))
  const each = (set, type) => set.forEach(p => {
    if (pushMotion && pushMotion.type === type && p === pushMotion.to) return
    const [x, y] = p.split(',').map(Number), failed = failedMotion && now - failedMotion.start < 230 && failedMotion.type === type && failedMotion.position === p, jitter = failed ? Math.sin((now - failedMotion.start) * .16) * tile * .055 * (1 - (now - failedMotion.start) / 230) : 0
    const entity = game.entityAt.get(p), active = ['button', 'buddyButton', 'headButton'].includes(type) && game.pressureActive(entity.id)
    object(type, ox + x * tile + jitter, oy + y * tile, tile, time, active)
  })
  each(game.buttons, 'button'); each(game.buddyButtons, 'buddyButton'); each(game.headButtons, 'headButton'); each(game.nests, 'nest'); each(game.scissors, 'scissors')
  each(game.portals, 'portal'); each(game.acids, 'acid'); each(game.keys, 'key')
  each(game.locks, 'lock')
  each(game.conductors, 'conductor'); each(game.fusions, 'fusion'); game.toggles.forEach(p => { const [x, y] = p.split(',').map(Number); object('toggle', ox + x * tile, oy + y * tile, tile, time, game.toggleStates.get(p)) }); each(game.shortGates, 'shortGate'); each(game.longGates, 'longGate')
  game.oneWays.forEach((direction, p) => { const [x, y] = p.split(',').map(Number); object('oneWay', ox + x * tile, oy + y * tile, tile, time, direction) })
  game.doors.forEach(p => { const [x, y] = p.split(',').map(Number), px = ox + x * tile, py = oy + y * tile, open = game.doorOpen([x, y]); ctx.shadowColor = open ? C.yellow : 'transparent'; ctx.shadowBlur = tile * .35; ctx.fillStyle = open ? 'rgba(244,206,76,.42)' : C.cream; rr(px + tile * .29, py - tile * .03, tile * .42, tile * 1.06, tile * .11); ctx.shadowColor = 'transparent' })
  game.exits.forEach(p => { const [x, y] = p.split(',').map(Number); object('exit', ox + x * tile, oy + y * tile, tile, time, game.won) })
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
  const exitSuction = game.won && !game.objectives.some(objective => objective.type === 'ALL_EXITS_OCCUPIED')
  const winDuration = exitSuction ? 130 + ((game.worms[game.active]?.length || 1) - 1) * 40 : 260, winReady = game.won && winAt && now - winAt >= winDuration
  game.worms.forEach((worm, i) => {
    if (game.isExited(worm)) return
    if (!visualWorms[i] || visualWorms[i].length !== worm.length) visualWorms[i] = copyWorms([worm])[0]
    const display = copyWorms([visualWorms[i]])[0], activeMotion = motion && i === motion.active, headProgress = activeMotion ? Math.max(0, Math.min(1, (now - motion.start - motion.delay) / 105)) : 0
    let feel = activeMotion ? { direction: motion.direction, turn: motion.turn, amount: Math.sin(Math.PI * headProgress), moving: true, strain: motion.pushed } : {}
    if (!activeMotion) feel = characterFeel(worm, i, now)
    if (exitSuction && i === game.active && winAt) { display.forEach((part, j) => { const progress = ease((now - winAt - j * 40) / 130); part[0] += (game.exit[0] - part[0]) * progress; part[1] += (game.exit[1] - part[1]) * progress }); feel = { direction: [game.exit[0] - display[0][0], game.exit[1] - display[0][1]] }; if (winReady) return }
    else if (game.won) display.forEach((part, j) => { part[0] += Math.sin(time / 115 + j * .8 + i) * .07; part[1] += Math.cos(time / 140 + j * .7 + i) * .06 })
    if (bumpMotion && i === game.active) {
      const progress = Math.min(1, (now - bumpMotion.start) / 170), amount = Math.sin(Math.PI * progress)
      display[0][0] += bumpMotion.direction[0] * amount * .13; display[0][1] += bumpMotion.direction[1] * amount * .13
      feel = { direction: bumpMotion.direction, amount, bump: true, sweat: Boolean(failedMotion?.type), strain: Boolean(failedMotion?.type) }
      if (progress >= 1) bumpMotion = null
    }
    wormBody(display, i, tile, ox, oy, time, feel)
  })
  game.worms.forEach((worm, i) => { if (game.isExited(worm)) return; const [x, y] = worm[0], size = tile * 1.35, offset = (size - tile) / 2; addControl(ox + x * tile - offset, oy + y * tile - offset, size, size, () => { inputQueue = []; game.select(i); wx.setStorageSync('learnedSwitch', 1); sound('select') }) })
  particlesDraw(); ctx.restore(); obstacleReason()

  ctx.save(); ctx.shadowColor = 'rgba(8,5,7,.9)'; ctx.shadowBlur = 10; ctx.font = '800 12px sans-serif'
  const status = `${game.moves} 步 · ${game.liveWorms().length}/${game.worms.length} 伙伴${game.keyCount ? ` · 钥匙 ${game.keyCount}` : ''}`, statusW = Math.min(210, Math.max(104, ctx.measureText(status).width + 24))
  ctx.fillStyle = 'rgba(25,20,24,.88)'; rr(PLAY_HEADER_RIGHT - statusW - 8, PLAY_HEADER_TOP + 7, statusW, 28, 14)
  ctx.shadowColor = 'transparent'; ctx.strokeStyle = theme.accent; ctx.globalAlpha = .56; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = theme.accent; ctx.font = '800 10px sans-serif'; ctx.fillText(`第${chapterNumber}章 · ${game.chapter} · ${theme.motif}`, 22, PLAY_HEADER_TOP + 9)
  ctx.fillStyle = C.cream; ctx.font = '900 17px sans-serif'; ctx.fillText(fitText(`${game.level + 1}. ${game.name}`, PLAY_HEADER_RIGHT - statusW - 42), 22, PLAY_HEADER_TOP + 27)
  ctx.fillStyle = 'rgba(247,240,206,.72)'; ctx.font = '12px sans-serif'; ctx.fillText(fitText(progressiveHint(), PLAY_HEADER_RIGHT - 42), 22, PLAY_HEADER_TOP + 46)
  ctx.fillStyle = theme.accent; ctx.font = '800 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(status, PLAY_HEADER_RIGHT - statusW / 2 - 8, PLAY_HEADER_TOP + 21); ctx.restore()
  if (challenge) {
    const strip = `好友挑战 · 第 ${challenge.level + 1} 关 · 对方 ${challenge.moves} 步`, stripW = 250
    ctx.fillStyle = 'rgba(20,15,19,.94)'; rr(W / 2 - stripW / 2, PLAY_VIEW_TOP + 4, stripW, 30, 15)
    ctx.strokeStyle = C.yellow; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = C.cream; ctx.font = '800 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(strip, W / 2, PLAY_VIEW_TOP + 19)
  }
  const utilityX = directionButtons ? 16 : W / 2 - 112, mapX = directionButtons ? W - 80 : utilityX + 160
  button('撤回', utilityX, FOOTER_Y, 80, undoLevel, false, game.history.length === 0)
  button('重开', utilityX + 88, FOOTER_Y, 64, restartLevel); button(challenge ? '主线' : '地图', mapX, FOOTER_Y, 64, () => { if (challenge) returnToMain(); else { scene = 'map'; mapNeedsFocus = true } })
  const fuseReady = game.canFuse(), showFuseHint = fuseReady && !wx.getStorageSync('learnedFuse')
  if (fuseReady) {
    const heads = new Set(game.liveWorms().map(worm => key(worm[0])))
    const fuseKey = [...game.fusions].find(point => heads.has(point)) || [...game.fusions][0]
    const [flowerX, flowerY] = fuseKey.split(',').map(Number)
    const flowerScreenX = ox + (flowerX + .5) * tile, flowerScreenY = oy + (flowerY + .5) * tile
    const fuseW = 76, preferredY = flowerScreenY - tile * .5 - BUTTON_H - 8
    const fuseX = Math.max(SAFE_LEFT + 8, Math.min(W - SAFE_RIGHT - fuseW - 8, flowerScreenX - fuseW / 2))
    const fuseY = preferredY >= PLAY_VIEW_TOP ? preferredY : flowerScreenY + tile * .5 + 8
    ctx.save(); ctx.fillStyle = C.cream; ctx.globalAlpha = .88
    ctx.beginPath(); ctx.moveTo(flowerScreenX, flowerScreenY); ctx.lineTo(flowerScreenX - 7, fuseY < flowerScreenY ? fuseY + BUTTON_H + 2 : fuseY - 2); ctx.lineTo(flowerScreenX + 7, fuseY < flowerScreenY ? fuseY + BUTTON_H + 2 : fuseY - 2); ctx.closePath(); ctx.fill(); ctx.restore()
    if (showFuseHint) {
      const pulse = .55 + (Math.sin(time / 220) + 1) * .16
      ctx.save()
      ctx.strokeStyle = `rgba(247,240,206,${pulse})`
      ctx.lineWidth = 3
      rr(fuseX - 5, fuseY - 5, fuseW + 10, BUTTON_H + 10, 26)
      ctx.stroke()
      ctx.fillStyle = 'rgba(20,15,19,.9)'
      const hintW = 166, hintX = Math.max(SAFE_LEFT + 8, Math.min(W - SAFE_RIGHT - hintW - 8, flowerScreenX - hintW / 2))
      const hintY = fuseY < flowerScreenY ? fuseY - 36 : fuseY + BUTTON_H + 8
      rr(hintX, hintY, hintW, 28, 14)
      ctx.fillStyle = C.cream
      ctx.font = '700 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('伙伴已在融合花旁会合', hintX + hintW / 2, hintY + 14)
      ctx.restore()
    }
    button('融合', fuseX, fuseY, fuseW, () => {
      if (!game.fuse()) return
      wx.setStorageSync('learnedFuse', 1)
      clearAnimation()
      sound('cut')
    }, true)
  }
  if (directionButtons) { const directions = [['←','left'], ['↑','up'], ['↓','down'], ['→','right']], start = W / 2 - 88; directions.forEach(([label, direction], i) => button(label, start + i * 44, FOOTER_Y, 40, () => enqueue(direction))) }

  if (game.level === 0 && game.moves === 0 && !wx.getStorageSync('learnedSwipe')) {
    const pulse = Math.sin(time / 260) * 8
    ctx.strokeStyle = C.cream; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(W / 2 - 32 + pulse, H / 2); ctx.lineTo(W / 2 + 22 + pulse, H / 2); ctx.lineTo(W / 2 + 10 + pulse, H / 2 - 10); ctx.moveTo(W / 2 + 22 + pulse, H / 2); ctx.lineTo(W / 2 + 10 + pulse, H / 2 + 10); ctx.stroke()
    ctx.fillStyle = C.cream; ctx.font = '700 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('向任意方向滑动', W / 2, H / 2 + 30)
  }
  if (game.worms.length > 1 && !wx.getStorageSync('learnedSwitch')) {
    ctx.fillStyle = 'rgba(20,15,19,.82)'; rr(W / 2 - 118, FOOTER_Y - 47, 236, 34, 17); ctx.fillStyle = C.cream; ctx.font = '700 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('轻触伙伴的脑袋可以切换控制', W / 2, FOOTER_Y - 30)
  }

  if (!game.won) teachingCard(time)

  if (transition > 0) { ctx.fillStyle = `rgba(20,15,19,${transition})`; ctx.fillRect(0, 0, W, H); transition = Math.max(0, transition - .045) }
  if (game.won && winReady) {
    const best = Number(wx.getStorageSync(`best_${game.level}`)) || game.moves
    const panelW = Math.min(540, W - SAFE_LEFT - SAFE_RIGHT - 32)
    ctx.fillStyle = 'rgba(10,7,9,.38)'; ctx.fillRect(0, 0, W, H)
    ctx.shadowColor = 'rgba(8,5,8,.42)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10; ctx.fillStyle = 'rgba(22,17,21,.96)'; rr(W / 2 - panelW / 2, H / 2 - 91, panelW, 182, 28); ctx.shadowColor = 'transparent'
    ctx.fillStyle = theme.accent; ctx.font = '800 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(winMoment || `第 ${game.level + 1} 关完成 · ${theme.motif}`, W / 2, H / 2 - 61)
    ctx.fillStyle = C.cream; ctx.font = '900 28px sans-serif'; ctx.fillText(challenge ? game.moves < challenge.moves ? '你赢过好友了！' : '挑战完成！' : '伙伴们找到路了！', W / 2, H / 2 - 28)
    const result = challenge ? `好友 ${challenge.moves} 步 · 我 ${game.moves} 步` : `${game.moves} 步 · ${game.worms.length} 位伙伴 · 最佳 ${best} 步`
    ctx.font = '13px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.76)'; ctx.fillText(result, W / 2, H / 2 + 1)
    const actions = [[challenge ? '继续我的主线' : '继续深入', () => { if (challenge) returnToMain(); else if (game.level < LEVELS.length - 1) { loadLevel(game.level + 1); wx.setStorageSync('caveLevel', game.level); scene = 'play'; transition = 1 } else { scene = 'map'; mapNeedsFocus = true } }], ['再试一次', () => { loadLevel(game.level); scene = 'play'; transition = 1 }]]
    if (winMoment) actions.push(['挑战好友', shareChallenge])
    const gap = 8, actionW = Math.min(152, Math.floor((panelW - 48 - gap * (actions.length - 1)) / actions.length)), startX = W / 2 - (actionW * actions.length + gap * (actions.length - 1)) / 2
    actions.forEach(([label, action], index) => button(label, startX + index * (actionW + gap), H / 2 + 27, actionW, action, index === 0))
  }
}

function move(direction) {
  lastActionAt = Date.now()
  const interaction = game.interaction(direction)
  if (!visualWorms || visualWorms.length !== game.worms.length) visualWorms = copyWorms(game.worms)
  const fromById = new Map(), movingIndex = game.active, headId = game.worm[0].id, [dx, dy] = DIRS[direction]
  game.worms.forEach((worm, i) => worm.forEach((segment, j) => fromById.set(segment.id, (visualWorms[i]?.[j] || segment).slice())))
  const pushed = ['rock', 'egg'].includes(interaction), pushedFrom = [game.worm[0][0] + dx, game.worm[0][1] + dy]
  const ok = game.move(direction)
  if (ok) {
    const from = game.worms.map(worm => worm.map(segment => (fromById.get(segment.id) || segment.slice()).slice())), to = copyWorms(game.worms)
    const turn = Boolean(lastDirections[headId] && lastDirections[headId] !== direction)
    visualWorms = copyWorms(from); motion = { from, to, active: movingIndex, start: Date.now(), delay: pushed ? 45 : turn ? 45 : 0, direction: [dx, dy], turn, pushed }
    if (pushed) pushMotion = { type: interaction, from: pushedFrom, target: [pushedFrom[0] + dx, pushedFrom[1] + dy], to: key([pushedFrom[0] + dx, pushedFrom[1] + dy]), start: Date.now() }
    lastDirections[headId] = direction
  } else { bumpMotion = { start: Date.now(), direction: [dx, dy] }; failedMotion = { start: Date.now(), type: pushed ? interaction : null, position: key(pushedFrom), reason: game.message }; addFrustration(); inputQueue = [] }
  if (ok) wx.setStorageSync('learnedSwipe', 1)
  sound(ok ? game.event : pushed ? 'fail' : 'bump'); if (ok && game.buttonChanged) sound('button'); if (!ok || game.event === 'cut') { shake = game.event === 'cut' ? 11 : 4; try { wx.vibrateShort({ type: game.event === 'cut' ? 'heavy' : 'light' }) } catch (_) {} }
  if (ok) {
    const h = game.worms[movingIndex][0], px = boardLayout.ox + (h[0] + .5) * boardLayout.tile, py = boardLayout.oy + (h[1] + .5) * boardLayout.tile; burst(px, py, game.event === 'apple' ? '#e64b59' : C.pink, game.event === 'cut' ? 25 : 5)
    if (game.won) {
      winAt = Date.now()
      track('level_complete'); if (challenge) track('challenge_complete', { target_moves: challenge.moves })
      if (!challenge) { const unlocked = Math.max(Number(wx.getStorageSync('unlocked')) || 1, Math.min(LEVELS.length, game.level + 2)); wx.setStorageSync('unlocked', unlocked) }
      const best = Number(wx.getStorageSync(`best_${game.level}`)) || Infinity
      winMoment = challenge ? '' : winHighlight(best); if (!challenge && game.moves < best) wx.setStorageSync(`best_${game.level}`, game.moves)
    }
    if (['cut', 'exit', 'win', 'nest'].includes(game.event)) inputQueue = []
  }
  return ok
}

function tap(x, y) { const c = [...controls].reverse().find(v => x >= v.x && x <= v.x + v.w && y >= v.y && y <= v.y + v.h); if (c) { c.action(); scheduleFrame() } }
function undoLevel() { if (!game.history.length) return false; track('undo'); game.undo(); clearAnimation(); sound('move'); return true }
function restartLevel() { track('restart'); const level = game.level; addFrustration(); game.load(level); teaching = null; clearAnimation() }
function copyWorms(worms) { return worms.map(worm => worm.map(part => part.slice())) }
function swipeDirection(t) {
  return resolveSwipe(t.clientX - touch.x, t.clientY - touch.y, W)
}
function enqueue(direction) { const now = Date.now(); if (scene !== 'play' || game.won || ensureTeaching() || inputQueue.length >= 2 || (direction === lastQueuedDirection && now - lastQueuedAt < 80)) return; inputQueue.push(direction); lastQueuedDirection = direction; lastQueuedAt = now; scheduleFrame() }
function consumeInput() { if (!motion && !pushMotion && !bumpMotion && inputQueue.length && !game.won) move(inputQueue.shift()) }
wx.onTouchStart(e => { const t = e.touches[0], ui = controls.some(c => c.blockSwipe && t.clientX >= c.x && t.clientX <= c.x + c.w && t.clientY >= c.y && t.clientY <= c.y + c.h), now = Date.now(); lastActionAt = now; touch = { x: t.clientX, y: t.clientY, lastY: t.clientY, lastAt: now, ui }; mapDragging = scene === 'map' && !ui; if (mapDragging) { mapVelocityY = 0; scheduleFrame() } })
wx.onTouchMove(e => {
  if (!touch || scene !== 'map' || touch.ui) return
  const t = e.touches[0], now = Date.now(), dy = t.clientY - touch.lastY, elapsed = Math.max(1, now - touch.lastAt), max = mapMaxScroll()
  mapScrollY -= dy * ((mapScrollY < 0 && dy > 0) || (mapScrollY > max && dy < 0) ? .38 : 1)
  mapScrollY = Math.max(-70, Math.min(max + 70, mapScrollY)); mapVelocityY = Math.max(-32, Math.min(32, -dy / elapsed * 16)); touch.lastY = t.clientY; touch.lastAt = now
})
wx.onTouchEnd(e => {
  if (!touch) return
  const t = e.changedTouches[0]
  const distance = Math.hypot(t.clientX - touch.x, t.clientY - touch.y), direction = !touch.ui && scene === 'play' ? swipeDirection(t) : null
  if (direction) enqueue(direction); else if (touch.ui || (distance < 14 && (scene !== 'map' || Math.abs(mapVelocityY) < 2))) tap(t.clientX, t.clientY)
  mapDragging = false; touch = null
})
wx.onTouchCancel(() => { mapDragging = false; touch = null })

try { openChallenge(wx.getLaunchOptionsSync().query) } catch (_) {}
try {
  wx.showShareMenu({ menus: ['shareAppMessage'] })
  wx.onShareAppMessage(() => { track('share_click', { source: 'menu' }); return { title: '一条身体，两颗脑袋？来帮泥土小伙伴回家' } })
  wx.onHide(() => { appVisible = false; renderToken++; clearTimeout(frameTimer); if (!challenge) wx.setStorageSync('caveLevel', game.level); if (audio?.state === 'running') audio.suspend() })
  wx.onShow(options => { appVisible = true; openChallenge(options?.query); if (audio?.state === 'suspended') audio.resume(); scheduleFrame() })
  if (wx.onKeyDown) wx.onKeyDown(({ key }) => {
    const keys = { ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down', ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right' }
    if (scene === 'play' && keys[key]) enqueue(keys[key])
    if (scene === 'play' && (key === 'z' || key === 'Backspace')) undoLevel()
  })
} catch (_) {}

function activeAnimation() {
  return transition > 0 || motion || bumpMotion || pushMotion || failedMotion || particles.length || shake > .1 || inputQueue.length || (scene === 'map' && (mapDragging || Math.abs(mapVelocityY) > .1))
}

function scheduleFrame(delay = 0) {
  clearTimeout(frameTimer); const token = renderToken
  frameTimer = setTimeout(() => requestAnimationFrame(time => { if (appVisible && token === renderToken) loop(time) }), delay)
}

function loop(time) {
  if (scene === 'title') title(); else if (scene === 'map') mapScreen(time); else { play(time); consumeInput() }
  scheduleFrame(activeAnimation() ? 0 : scene === 'title' ? 250 : 67)
}
scheduleFrame()

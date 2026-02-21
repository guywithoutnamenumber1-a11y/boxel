import * as THREE from 'three'
import { World } from './world.js'
import { Player } from './player.js'
import { BLOCKS } from './chunk.js'

// --- Scene setup ---
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x87CEEB)
scene.fog = new THREE.Fog(0x87CEEB, 60, 120)

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.appendChild(renderer.domElement)

// --- Lighting ---
const ambient = new THREE.AmbientLight(0xffffff, 0.6)
scene.add(ambient)

const sun = new THREE.DirectionalLight(0xfffbe0, 1.2)
sun.position.set(100, 200, 100)
sun.castShadow = true
sun.shadow.mapSize.width  = 2048
sun.shadow.mapSize.height = 2048
sun.shadow.camera.near   = 0.5
sun.shadow.camera.far    = 500
sun.shadow.camera.left   = -100
sun.shadow.camera.right  =  100
sun.shadow.camera.top    =  100
sun.shadow.camera.bottom = -100
scene.add(sun)

// --- World & Player ---
const world  = new World(scene)
const player = new Player(camera, world)

// Pre-load spawn area before placing the player (#spawn fix)
for (let dx = -2; dx <= 2; dx++) {
  for (let dz = -2; dz <= 2; dz++) {
    world.loadChunk(dx, dz)
  }
}
player.spawn()

// --- Pointer lock ---
const blocker = document.getElementById('blocker')

blocker.addEventListener('click', () => {
  document.body.requestPointerLock()
})

document.addEventListener('pointerlockchange', () => {
  blocker.style.display = document.pointerLockElement ? 'none' : 'flex'
})

// --- Block selection HUD (#18) ---
const BLOCK_NAMES = {
  [BLOCKS.GRASS]:  'Grass',
  [BLOCKS.DIRT]:   'Dirt',
  [BLOCKS.STONE]:  'Stone',
  [BLOCKS.WOOD]:   'Wood',
  [BLOCKS.LEAVES]: 'Leaves',
  [BLOCKS.SAND]:   'Sand',
}

const hud = document.createElement('div')
hud.style.cssText = `
  position: fixed;
  bottom: 48px;
  left: 50%;
  transform: translateX(-50%);
  color: white;
  font-family: monospace;
  font-size: 15px;
  pointer-events: none;
  text-shadow: 1px 1px 2px black;
  background: rgba(0,0,0,0.35);
  padding: 4px 14px;
  border-radius: 4px;
`
document.body.appendChild(hud)

function updateHUD() {
  hud.textContent = `Block: ${BLOCK_NAMES[player.selectedBlock] ?? 'Unknown'}  [1–6 to switch]`
}
updateHUD()

document.addEventListener('keydown', e => {
  if (e.code.startsWith('Digit')) updateHUD()
})

// --- Window resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// --- Game loop ---
let lastTime = performance.now()

function gameLoop() {
  requestAnimationFrame(gameLoop)

  const now = performance.now()
  const dt  = Math.min((now - lastTime) / 1000, 0.05)
  lastTime  = now

  player.update(dt)
  world.update(player.pos.x, player.pos.z)

  renderer.render(scene, camera)
}

gameLoop()

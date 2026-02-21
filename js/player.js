import * as THREE from 'three'
import { BLOCKS } from './chunk.js'

const GRAVITY       = -28
const WATER_GRAVITY =  -6  // reduced gravity while submerged (#19)
const SWIM_FORCE    =   5  // max upward velocity while swimming (#19)
const WATER_DRAG    =   8  // vertical velocity damping (units/s) while in water (#19)
const JUMP_FORCE    =  10
const MOVE_SPEED    =   6
const PLAYER_HEIGHT =   1.7
const PLAYER_WIDTH  =   0.4
const REACH         =   5

export class Player {
  constructor(camera, world) {
    this.camera = camera
    this.world  = world

    this.pos = new THREE.Vector3(0, 40, 0)
    this.vel = new THREE.Vector3(0, 0, 0)
    this.onGround = false

    this.yaw   = 0
    this.pitch = 0

    this.selectedBlock = BLOCKS.GRASS

    // Reusable vectors — never allocated inside the game loop (#6, #7)
    this._forward = new THREE.Vector3()
    this._right   = new THREE.Vector3()
    this._move    = new THREE.Vector3()
    this._rayDir  = new THREE.Vector3()
    this._rayPos  = new THREE.Vector3()
    this._euler   = new THREE.Euler(0, 0, 0, 'YXZ')

    this.keys = {}
    this.initControls()
  }

  initControls() {
    document.addEventListener('keydown', e => { this.keys[e.code] = true })
    document.addEventListener('keyup',   e => { this.keys[e.code] = false })

    document.addEventListener('mousemove', e => {
      if (!document.pointerLockElement) return
      this.yaw   -= e.movementX * 0.002
      this.pitch -= e.movementY * 0.002
      this.pitch  = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch))
    })

    document.addEventListener('mousedown', e => {
      if (!document.pointerLockElement) return
      if (e.button === 0) this.breakBlock()
      if (e.button === 2) this.placeBlock()
    })

    document.addEventListener('contextmenu', e => e.preventDefault())

    document.addEventListener('keydown', e => {
      const map = {
        Digit1: BLOCKS.GRASS,
        Digit2: BLOCKS.DIRT,
        Digit3: BLOCKS.STONE,
        Digit4: BLOCKS.WOOD,
        Digit5: BLOCKS.LEAVES,
        Digit6: BLOCKS.SAND,
      }
      if (map[e.code] !== undefined) this.selectedBlock = map[e.code]
    })
  }

  spawn() {
    const h = this.world.getSurfaceHeight(0, 0)
    this.pos.set(0, h + 2, 0)
  }

  update(dt) {
    this.updateCamera()
    this.handleMovement(dt)
    this.applyPhysics(dt)
  }

  updateCamera() {
    this.camera.position.copy(this.pos)
    this.camera.position.y += PLAYER_HEIGHT - 0.1
    this.camera.rotation.order = 'YXZ'
    this.camera.rotation.y = this.yaw
    this.camera.rotation.x = this.pitch
  }

  _isInWater() {
    const bx = Math.floor(this.pos.x)
    const by = Math.floor(this.pos.y + PLAYER_HEIGHT * 0.5)
    const bz = Math.floor(this.pos.z)
    return this.world.getBlockWorld(bx, by, bz) === BLOCKS.WATER
  }

  handleMovement(dt) {
    // Reuse class-level vectors (#6)
    this._forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
    this._move.set(0, 0, 0)

    if (this.keys['KeyW']) this._move.add(this._forward)
    if (this.keys['KeyS']) this._move.sub(this._forward)
    if (this.keys['KeyA']) this._move.sub(this._right)
    if (this.keys['KeyD']) this._move.add(this._right)

    if (this._move.lengthSq() > 0) {
      this._move.normalize().multiplyScalar(MOVE_SPEED)
    }

    this.vel.x = this._move.x
    this.vel.z = this._move.z

    const inWater = this._isInWater()

    if (inWater) {
      // Space swims upward while submerged (#19)
      if (this.keys['Space']) {
        this.vel.y = Math.min(this.vel.y + SWIM_FORCE * dt * 20, SWIM_FORCE)
      }
    } else {
      if (this.keys['Space'] && this.onGround) {
        this.vel.y    = JUMP_FORCE
        this.onGround = false
      }
    }
  }

  applyPhysics(dt) {
    const inWater = this._isInWater()

    this.vel.y += (inWater ? WATER_GRAVITY : GRAVITY) * dt

    // Damp vertical velocity in water (#19)
    if (inWater && this.vel.y < 0) {
      this.vel.y += WATER_DRAG * dt
      if (this.vel.y > 0) this.vel.y = 0
    }

    this.pos.x += this.vel.x * dt
    this.collideAxis('x')

    this.pos.y += this.vel.y * dt
    this.collideAxis('y')

    this.pos.z += this.vel.z * dt
    this.collideAxis('z')
  }

  collideAxis(axis) {
    const w = PLAYER_WIDTH / 2

    if (axis === 'y') {
      // Separate feet/head checks so their resolution can't interfere (#3)
      const corners = [[-w, -w], [w, -w], [-w, w], [w, w]]

      if (this.vel.y <= 0) {
        for (const [sx, sz] of corners) {
          const bx    = Math.floor(this.pos.x + sx)
          const by    = Math.floor(this.pos.y)
          const bz    = Math.floor(this.pos.z + sz)
          const block = this.world.getBlockWorld(bx, by, bz)
          if (block !== BLOCKS.AIR && block !== BLOCKS.WATER && block > 0) {
            this.pos.y    = by + 1
            this.vel.y    = 0
            this.onGround = true
            return
          }
        }
      } else {
        for (const [sx, sz] of corners) {
          const bx    = Math.floor(this.pos.x + sx)
          const by    = Math.floor(this.pos.y + PLAYER_HEIGHT)
          const bz    = Math.floor(this.pos.z + sz)
          const block = this.world.getBlockWorld(bx, by, bz)
          if (block !== BLOCKS.AIR && block !== BLOCKS.WATER && block > 0) {
            this.pos.y = by - PLAYER_HEIGHT
            this.vel.y = 0
            return
          }
        }
      }

      if (this.vel.y !== 0) this.onGround = false
      return
    }

    const offsets = []
    if (axis === 'x') {
      for (let dy = 0; dy <= Math.ceil(PLAYER_HEIGHT); dy++) {
        offsets.push([ w, dy, 0], [-w, dy, 0])
      }
    } else {
      for (let dy = 0; dy <= Math.ceil(PLAYER_HEIGHT); dy++) {
        offsets.push([0, dy,  w], [0, dy, -w])
      }
    }

    for (const [ox, oy, oz] of offsets) {
      const bx    = Math.floor(this.pos.x + ox)
      const by    = Math.floor(this.pos.y + oy)
      const bz    = Math.floor(this.pos.z + oz)
      const block = this.world.getBlockWorld(bx, by, bz)

      if (block !== BLOCKS.AIR && block !== BLOCKS.WATER && block > 0) {
        if (axis === 'x') {
          this.pos.x = ox > 0 ? bx - w : bx + 1 + w
          this.vel.x = 0
        } else {
          this.pos.z = oz > 0 ? bz - w : bz + 1 + w
          this.vel.z = 0
        }
        break
      }
    }
  }

  // DDA raycast — exact voxel traversal, no floating point step accumulation (#11)
  raycast() {
    this._euler.set(this.pitch, this.yaw, 0)
    this._rayDir.set(0, 0, -1).applyEuler(this._euler)
    this._rayPos.copy(this.camera.position)

    const dx = this._rayDir.x
    const dy = this._rayDir.y
    const dz = this._rayDir.z

    let ix = Math.floor(this._rayPos.x)
    let iy = Math.floor(this._rayPos.y)
    let iz = Math.floor(this._rayPos.z)

    const stepX = dx >= 0 ? 1 : -1
    const stepY = dy >= 0 ? 1 : -1
    const stepZ = dz >= 0 ? 1 : -1

    const tDeltaX = Math.abs(1 / dx)
    const tDeltaY = Math.abs(1 / dy)
    const tDeltaZ = Math.abs(1 / dz)

    const ox = this._rayPos.x - ix
    const oy = this._rayPos.y - iy
    const oz = this._rayPos.z - iz

    let tMaxX = dx === 0 ? Infinity : (dx > 0 ? 1 - ox : ox) / Math.abs(dx)
    let tMaxY = dy === 0 ? Infinity : (dy > 0 ? 1 - oy : oy) / Math.abs(dy)
    let tMaxZ = dz === 0 ? Infinity : (dz > 0 ? 1 - oz : oz) / Math.abs(dz)

    let lx = ix, ly = iy, lz = iz

    while (Math.min(tMaxX, tMaxY, tMaxZ) < REACH) {
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        lx = ix; ly = iy; lz = iz
        ix += stepX; tMaxX += tDeltaX
      } else if (tMaxY < tMaxZ) {
        lx = ix; ly = iy; lz = iz
        iy += stepY; tMaxY += tDeltaY
      } else {
        lx = ix; ly = iy; lz = iz
        iz += stepZ; tMaxZ += tDeltaZ
      }

      const block = this.world.getBlockWorld(ix, iy, iz)
      if (block !== BLOCKS.AIR && block > 0) {
        return {
          hit:    { x: ix, y: iy, z: iz },
          before: { x: lx, y: ly, z: lz },
        }
      }
    }

    return null
  }

  breakBlock() {
    const result = this.raycast()
    if (result?.hit) {
      const { x, y, z } = result.hit
      this.world.setBlockWorld(x, y, z, BLOCKS.AIR)
    }
  }

  placeBlock() {
    const result = this.raycast()
    if (!result?.before) return

    const { x, y, z } = result.before

    // Full AABB overlap check — prevents placing inside the player (#16)
    const hw = PLAYER_WIDTH / 2
    const overlapX = x + 1 > this.pos.x - hw && x < this.pos.x + hw
    const overlapZ = z + 1 > this.pos.z - hw && z < this.pos.z + hw
    const overlapY = y + 1 > this.pos.y       && y < this.pos.y + PLAYER_HEIGHT
    if (overlapX && overlapZ && overlapY) return

    this.world.setBlockWorld(x, y, z, this.selectedBlock)
  }
}

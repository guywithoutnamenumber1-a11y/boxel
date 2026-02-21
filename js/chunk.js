import * as THREE from 'three'

export const CHUNK_SIZE   = 16
export const CHUNK_HEIGHT = 64

// Block type IDs
export const BLOCKS = {
  AIR:    0,
  GRASS:  1,
  DIRT:   2,
  STONE:  3,
  WOOD:   4,
  LEAVES: 5,
  SAND:   6,
  WATER:  7,
}

// Colors for each block type (replace with textures later)
const BLOCK_COLORS = {
  [BLOCKS.GRASS]:  { top: 0x5a9e32, side: 0x7a5c3a, bottom: 0x7a5c3a },
  [BLOCKS.DIRT]:   { top: 0x7a5c3a, side: 0x7a5c3a, bottom: 0x7a5c3a },
  [BLOCKS.STONE]:  { top: 0x888888, side: 0x888888, bottom: 0x888888 },
  [BLOCKS.WOOD]:   { top: 0x5c4a1e, side: 0x5c4a1e, bottom: 0x5c4a1e },
  [BLOCKS.LEAVES]: { top: 0x2d6e1e, side: 0x2d6e1e, bottom: 0x2d6e1e },
  [BLOCKS.SAND]:   { top: 0xe2d98a, side: 0xe2d98a, bottom: 0xe2d98a },
  [BLOCKS.WATER]:  { top: 0x3a6eaa, side: 0x3a6eaa, bottom: 0x3a6eaa },
}

// The 6 faces of a cube: direction vector, corner offsets, face group for shading
const FACES = [
  { dir: [ 0,  1,  0], corners: [[0,1,0],[1,1,0],[0,1,1],[1,1,1]], face: 'top'    },
  { dir: [ 0, -1,  0], corners: [[1,0,0],[0,0,0],[1,0,1],[0,0,1]], face: 'bottom' },
  { dir: [-1,  0,  0], corners: [[0,0,0],[0,1,0],[0,0,1],[0,1,1]], face: 'side'   },
  { dir: [ 1,  0,  0], corners: [[1,1,0],[1,0,0],[1,1,1],[1,0,1]], face: 'side'   },
  { dir: [ 0,  0, -1], corners: [[1,0,0],[1,1,0],[0,0,0],[0,1,0]], face: 'side'   },
  { dir: [ 0,  0,  1], corners: [[0,0,1],[0,1,1],[1,0,1],[1,1,1]], face: 'side'   },
]

export class Chunk {
  constructor(cx, cz) {
    this.cx   = cx
    this.cz   = cz
    this.data = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE)
    this.mesh = null
  }

  index(x, y, z) {
    return x + CHUNK_SIZE * (y + CHUNK_HEIGHT * z)
  }

  getBlock(x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE)
      return -1
    return this.data[this.index(x, y, z)]
  }

  setBlock(x, y, z, type) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE)
      return
    this.data[this.index(x, y, z)] = type
  }

  buildMesh(scene, getNeighborBlock) {
    if (this.mesh) {
      scene.remove(this.mesh)
      this.mesh.geometry.dispose()
      this.mesh.material.dispose() // (#5) dispose material, not just geometry
      this.mesh = null
    }

    const positions = []
    const colors    = []
    const indices   = []
    let vertCount   = 0

    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const block = this.getBlock(x, y, z)
          if (block === BLOCKS.AIR) continue

          const blockColors = BLOCK_COLORS[block] || BLOCK_COLORS[BLOCKS.STONE]

          for (const { dir, corners, face } of FACES) {
            const nx = x + dir[0]
            const ny = y + dir[1]
            const nz = z + dir[2]

            let neighbor
            if (nx < 0 || nx >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE) {
              neighbor = getNeighborBlock(
                this.cx * CHUNK_SIZE + nx,
                ny,
                this.cz * CHUNK_SIZE + nz
              )
            } else {
              neighbor = this.getBlock(nx, ny, nz)
            }

            // Draw face if neighbor is transparent (air, water) or out of bounds (#water fix)
            const transparent = neighbor === BLOCKS.AIR || neighbor === BLOCKS.WATER || neighbor === -1
            if (!transparent) continue

            const colorHex = blockColors[face]
            const r = ((colorHex >> 16) & 255) / 255
            const g = ((colorHex >> 8)  & 255) / 255
            const b = ((colorHex)       & 255) / 255
            const shade = face === 'top' ? 1.0 : face === 'bottom' ? 0.5 : 0.75

            // Corner variables named ox/oy/oz to avoid shadowing this.cx/this.cz (#14)
            for (const [ox, oy, oz] of corners) {
              positions.push(
                this.cx * CHUNK_SIZE + x + ox,
                y + oy,
                this.cz * CHUNK_SIZE + z + oz
              )
              colors.push(r * shade, g * shade, b * shade)
            }

            indices.push(
              vertCount, vertCount + 1, vertCount + 2,
              vertCount + 2, vertCount + 1, vertCount + 3
            )
            vertCount += 4
          }
        }
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()

    const material = new THREE.MeshLambertMaterial({ vertexColors: true })
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.castShadow    = true
    this.mesh.receiveShadow = true
    scene.add(this.mesh)
  }

  disposeMesh(scene) {
    if (this.mesh) {
      scene.remove(this.mesh)
      this.mesh.geometry.dispose()
      this.mesh.material.dispose()
      this.mesh = null
    }
  }
}

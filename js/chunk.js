import * as THREE from 'three'

export const CHUNK_SIZE = 16
export const CHUNK_HEIGHT = 64
export const BLOCKS = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WOOD: 4,
  LEAVES: 5,
  SAND: 6,
  WATER: 7
}

const BLOCK_COLORS = {
  [BLOCKS.GRASS]:  { top: 0x5a9e32, side: 0x7a5c3a, bottom: 0x7a5c3a },
  [BLOCKS.DIRT]:   { top: 0x7a5c3a, side: 0x7a5c3a, bottom: 0x7a5c3a },
  [BLOCKS.STONE]:  { top: 0x888888, side: 0x888888, bottom: 0x888888 },
  [BLOCKS.WOOD]:   { top: 0x5c4a1e, side: 0x5c4a1e, bottom: 0x5c4a1e },
  [BLOCKS.LEAVES]: { top: 0x2d6e1e, side: 0x2d6e1e, bottom: 0x2d6e1e },
  [BLOCKS.SAND]:   { top: 0xe2d98a, side: 0xe2d98a, bottom: 0xe2d98a },
}

const SOLID_FACES = [
  { dir: [0,  1, 0], corners: [[0,1,0],[1,1,0],[0,1,1],[1,1,1]], face: 'top'    },
  { dir: [0, -1, 0], corners: [[1,0,0],[0,0,0],[1,0,1],[0,0,1]], face: 'bottom' },
  { dir: [-1, 0, 0], corners: [[0,0,0],[0,1,0],[0,0,1],[0,1,1]], face: 'side'   },
  { dir: [1,  0, 0], corners: [[1,1,0],[1,0,0],[1,1,1],[1,0,1]], face: 'side'   },
  { dir: [0,  0,-1], corners: [[1,0,0],[1,1,0],[0,0,0],[0,1,0]], face: 'side'   },
  { dir: [0,  0, 1], corners: [[0,0,1],[0,1,1],[1,0,1],[1,1,1]], face: 'side'   },
]

// Shared water material — transparent blue, double-sided so it's visible from below too
const WATER_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0x2e86de,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
  side: THREE.DoubleSide,
})

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx
    this.cz = cz
    this.data = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE)
    this.mesh = null       // solid terrain mesh
    this.waterMesh = null  // water surface mesh
  }

  index(x, y, z) {
    return x + CHUNK_SIZE * (y + CHUNK_HEIGHT * z)
  }

  getBlock(x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) return -1
    return this.data[this.index(x, y, z)]
  }

  setBlock(x, y, z, type) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) return
    this.data[this.index(x, y, z)] = type
  }

  buildMesh(scene, getNeighborBlock) {
    // --- Dispose existing meshes ---
    if (this.mesh) {
      scene.remove(this.mesh)
      this.mesh.geometry.dispose()
      this.mesh.material.dispose()
      this.mesh = null
    }
    if (this.waterMesh) {
      scene.remove(this.waterMesh)
      this.waterMesh.geometry.dispose()
      // Don't dispose shared WATER_MATERIAL
      this.waterMesh = null
    }

    // --- Solid terrain mesh ---
    const positions = [], colors = [], indices = []
    let vertCount = 0

    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const block = this.getBlock(x, y, z)
          // Skip air and water — water gets its own mesh
          if (block === BLOCKS.AIR || block === BLOCKS.WATER) continue

          const blockColors = BLOCK_COLORS[block] || BLOCK_COLORS[BLOCKS.STONE]

          for (const { dir, corners, face } of SOLID_FACES) {
            const nx = x + dir[0], ny = y + dir[1], nz = z + dir[2]
            let neighbor
            if (nx < 0 || nx >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE) {
              neighbor = getNeighborBlock(this.cx * CHUNK_SIZE + nx, ny, this.cz * CHUNK_SIZE + nz)
            } else {
              neighbor = this.getBlock(nx, ny, nz)
            }
            // Expose face if neighbor is air OR water (water is see-through)
            if (neighbor !== BLOCKS.AIR && neighbor !== BLOCKS.WATER && neighbor !== -1) continue

            const colorHex = blockColors[face]
            const r = ((colorHex >> 16) & 255) / 255
            const g = ((colorHex >> 8)  & 255) / 255
            const b = ((colorHex)       & 255) / 255
            const shade = face === 'top' ? 1.0 : face === 'bottom' ? 0.5 : 0.75

            for (const [ox, oy, oz] of corners) {
              positions.push(this.cx * CHUNK_SIZE + x + ox, y + oy, this.cz * CHUNK_SIZE + z + oz)
              colors.push(r * shade, g * shade, b * shade)
            }
            indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount + 2, vertCount + 1, vertCount + 3)
            vertCount += 4
          }
        }
      }
    }

    if (vertCount > 0) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3))
      geo.setIndex(indices)
      geo.computeVertexNormals()
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true })
      this.mesh = new THREE.Mesh(geo, mat)
      this.mesh.castShadow = true
      this.mesh.receiveShadow = true
      scene.add(this.mesh)
    }

    // --- Water surface mesh ---
    // Only emit a TOP face for each water block that has air directly above it.
    // No side faces, no bottom faces — just the flat ocean surface.
    const wPositions = [], wIndices = []
    let wVert = 0

    // The top face sits at y+1 (top of the water block).
    // We push it down very slightly (y + 0.97) so it doesn't z-fight with
    // the solid block top beneath it and looks like it sits inside the block.
    const WATER_Y_OFFSET = 0.97

    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const block = this.getBlock(x, y, z)
          if (block !== BLOCKS.WATER) continue

          // Only the top surface where air is above
          const above = this.getBlock(x, y + 1, z)
          if (above !== BLOCKS.AIR) continue

          const wx = this.cx * CHUNK_SIZE + x
          const wz = this.cz * CHUNK_SIZE + z
          const wy = y + WATER_Y_OFFSET

          // Two triangles forming the top quad
          wPositions.push(
            wx,     wy, wz,
            wx + 1, wy, wz,
            wx,     wy, wz + 1,
            wx + 1, wy, wz + 1,
          )
          wIndices.push(wVert, wVert + 1, wVert + 2, wVert + 2, wVert + 1, wVert + 3)
          wVert += 4
        }
      }
    }

    if (wVert > 0) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(wPositions, 3))
      geo.setIndex(wIndices)
      this.waterMesh = new THREE.Mesh(geo, WATER_MATERIAL)
      this.waterMesh.renderOrder = 1   // render after opaque geometry
      scene.add(this.waterMesh)
    }
  }

  disposeMesh(scene) {
    if (this.mesh) {
      scene.remove(this.mesh)
      this.mesh.geometry.dispose()
      this.mesh.material.dispose()
      this.mesh = null
    }
    if (this.waterMesh) {
      scene.remove(this.waterMesh)
      this.waterMesh.geometry.dispose()
      this.waterMesh = null
    }
  }
}

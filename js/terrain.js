import { BLOCKS, CHUNK_SIZE, CHUNK_HEIGHT } from './chunk.js'
import { PerlinNoise } from './noise.js'

const noise = new PerlinNoise(42) // change 42 to any number for a different world

const SEA_LEVEL  = 12
const STONE_DEPTH = 4 // how many blocks of dirt before stone

// Deterministic tree check — ~8% of eligible positions get a tree
function treeAt(wx, wz) {
  const h = Math.abs(Math.sin(wx * 127.1 + wz * 311.7) * 43758.5) % 1
  return h > 0.92
}

export function getTerrainHeight(wx, wz) {
  const base   = noise.octaves(wx, wz, 4, 0.5, 0.004) // large scale hills
  const detail = noise.octaves(wx, wz, 2, 0.5, 0.02)  // fine surface detail
  const height = Math.floor(SEA_LEVEL + base * 20 + detail * 5)
  return Math.max(1, Math.min(height, CHUNK_HEIGHT - 10))
}

export function generateChunk(chunk) {
  const { cx, cz } = chunk

  // Height cache — getTerrainHeight called once per column, not twice (#10)
  const heights = new Int32Array(CHUNK_SIZE * CHUNK_SIZE)
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      heights[z * CHUNK_SIZE + x] = getTerrainHeight(
        cx * CHUNK_SIZE + x,
        cz * CHUNK_SIZE + z
      )
    }
  }

  // First pass: terrain blocks
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const terrainH = heights[z * CHUNK_SIZE + x]

      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        let block

        if (y === 0) {
          block = BLOCKS.STONE
        } else if (y < terrainH - STONE_DEPTH) {
          block = BLOCKS.STONE
        } else if (y < terrainH) {
          block = BLOCKS.DIRT
        } else if (y === terrainH) {
          block = terrainH <= SEA_LEVEL + 1 ? BLOCKS.SAND : BLOCKS.GRASS
        } else if (y <= SEA_LEVEL) {
          block = BLOCKS.WATER // (#1) fixed: was `else if (y <= SEA_LEVEL && block === BLOCKS.AIR)`
        } else {
          block = BLOCKS.AIR
        }

        chunk.setBlock(x, y, z, block)
      }
    }
  }

  // Second pass: trees — reads height cache, no recomputation (#10)
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const wx      = cx * CHUNK_SIZE + x
      const wz      = cz * CHUNK_SIZE + z
      const terrainH = heights[z * CHUNK_SIZE + x]

      if (terrainH > SEA_LEVEL + 2 && treeAt(wx, wz)) {
        placeTree(chunk, x, terrainH + 1, z)
      }
    }
  }
}

// Out-of-bounds leaf writes are silently discarded by chunk.setBlock (#4)
function placeTree(chunk, x, y, z) {
  const trunkHeight = 4

  for (let i = 0; i < trunkHeight; i++) {
    chunk.setBlock(x, y + i, z, BLOCKS.WOOD)
  }

  const top = y + trunkHeight
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue
        chunk.setBlock(x + dx, top + dy, z + dz, BLOCKS.LEAVES)
      }
    }
  }
  chunk.setBlock(x, top + 2, z, BLOCKS.LEAVES)
}

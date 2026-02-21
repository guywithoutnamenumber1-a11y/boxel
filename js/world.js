import * as THREE from 'three'
import { Chunk, BLOCKS, CHUNK_SIZE } from './chunk.js'
import { generateChunk, getTerrainHeight } from './terrain.js'

const RENDER_DISTANCE = 4

export class World {
  constructor(scene) {
    this.scene  = scene
    this.chunks = new Map() // key: "cx,cz" -> Chunk

    // Track last chunk position to skip redundant load scans (#8)
    this._lastPCX = null
    this._lastPCZ = null
  }

  chunkKey(cx, cz) {
    return `${cx},${cz}`
  }

  getChunk(cx, cz) {
    return this.chunks.get(this.chunkKey(cx, cz)) || null
  }

  loadChunk(cx, cz) {
    const key = this.chunkKey(cx, cz)
    if (this.chunks.has(key)) return
    const chunk = new Chunk(cx, cz)
    generateChunk(chunk)
    this.chunks.set(key, chunk)
    chunk.buildMesh(this.scene, (wx, wy, wz) => this.getBlockWorld(wx, wy, wz))
  }

  unloadChunk(cx, cz) {
    const key   = this.chunkKey(cx, cz)
    const chunk = this.chunks.get(key)
    if (chunk) {
      chunk.disposeMesh(this.scene)
      this.chunks.delete(key)
    }
  }

  // Only rescans when the player crosses a chunk boundary (#8)
  update(px, pz) {
    const pcx = Math.floor(px / CHUNK_SIZE)
    const pcz = Math.floor(pz / CHUNK_SIZE)

    if (pcx === this._lastPCX && pcz === this._lastPCZ) return
    this._lastPCX = pcx
    this._lastPCZ = pcz

    for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
      for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
        this.loadChunk(pcx + dx, pcz + dz)
      }
    }

    for (const [, chunk] of this.chunks) {
      const distX = Math.abs(chunk.cx - pcx)
      const distZ = Math.abs(chunk.cz - pcz)
      if (distX > RENDER_DISTANCE + 1 || distZ > RENDER_DISTANCE + 1) {
        this.unloadChunk(chunk.cx, chunk.cz)
      }
    }
  }

  getBlockWorld(wx, wy, wz) {
    const cx    = Math.floor(wx / CHUNK_SIZE)
    const cz    = Math.floor(wz / CHUNK_SIZE)
    const chunk = this.getChunk(cx, cz)
    if (!chunk) return BLOCKS.AIR
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    return chunk.getBlock(lx, wy, lz)
  }

  // Rebuild the edited chunk, plus any neighbor chunks the edit touches (#2)
  setBlockWorld(wx, wy, wz, type) {
    const cx    = Math.floor(wx / CHUNK_SIZE)
    const cz    = Math.floor(wz / CHUNK_SIZE)
    const chunk = this.getChunk(cx, cz)
    if (!chunk) return

    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    chunk.setBlock(lx, wy, lz, type)

    const nb = (wx, wy, wz) => this.getBlockWorld(wx, wy, wz)
    chunk.buildMesh(this.scene, nb)

    if (lx === 0)              this._rebuildIfLoaded(cx - 1, cz, nb)
    if (lx === CHUNK_SIZE - 1) this._rebuildIfLoaded(cx + 1, cz, nb)
    if (lz === 0)              this._rebuildIfLoaded(cx, cz - 1, nb)
    if (lz === CHUNK_SIZE - 1) this._rebuildIfLoaded(cx, cz + 1, nb)
  }

  _rebuildIfLoaded(cx, cz, nb) {
    const chunk = this.getChunk(cx, cz)
    if (chunk) chunk.buildMesh(this.scene, nb)
  }

  getSurfaceHeight(wx, wz) {
    return getTerrainHeight(wx, wz)
  }
}

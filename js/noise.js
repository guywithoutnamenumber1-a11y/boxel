// Classic 2D Perlin noise for terrain generation.
// (Renamed from SimplexNoise — this implements Perlin, not Simplex.) (#13)

export class PerlinNoise {
  constructor(seed = Math.random()) {
    this.perm = new Uint8Array(512)
    const p   = new Uint8Array(256)
    for (let i = 0; i < 256; i++) p[i] = i

    // LCG shuffle based on seed (Park-Miller)
    let s = seed * 2147483647 | 0
    if (s === 0) s = 1 // guard: seed=0 degenerates the LCG (#15)
    for (let i = 255; i > 0; i--) {
      s = (s * 16807) % 2147483647
      const j = s % (i + 1)
      ;[p[i], p[j]] = [p[j], p[i]]
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255]
  }

  fade(t) { return t * t * t * (t * (t * 6 - 15) + 10) }
  lerp(a, b, t) { return a + t * (b - a) }

  // 8-direction gradient table — reduces diagonal bias vs the original 4-direction version (#22)
  grad(hash, x, y) {
    switch (hash & 7) {
      case 0: return  x + y
      case 1: return -x + y
      case 2: return  x - y
      case 3: return -x - y
      case 4: return  x
      case 5: return -x
      case 6: return  y
      case 7: return -y
      default: return 0
    }
  }

  noise2D(x, y) {
    const X  = Math.floor(x) & 255
    const Y  = Math.floor(y) & 255
    x -= Math.floor(x)
    y -= Math.floor(y)
    const u  = this.fade(x)
    const v  = this.fade(y)
    const p  = this.perm
    const a  = p[X]     + Y
    const aa = p[a]
    const ab = p[a + 1]
    const b  = p[X + 1] + Y
    const ba = p[b]
    const bb = p[b + 1]
    return this.lerp(
      this.lerp(this.grad(p[aa], x,     y    ), this.grad(p[ba], x - 1, y    ), u),
      this.lerp(this.grad(p[ab], x,     y - 1), this.grad(p[bb], x - 1, y - 1), u),
      v
    )
  }

  // Layered (fractal) noise — normalised to [-1, 1] regardless of octave count
  octaves(x, y, octaves = 4, persistence = 0.5, scale = 0.01) {
    let val = 0, amp = 1, freq = scale, max = 0
    for (let i = 0; i < octaves; i++) {
      val  += this.noise2D(x * freq, y * freq) * amp
      max  += amp
      amp  *= persistence
      freq *= 2
    }
    return val / max
  }
}

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

const loader = new THREE.TextureLoader();
function loadTex(path) {
	const t = loader.load(path);
	t.magFilter = THREE.NearestFilter;
	t.minFilter = THREE.NearestFilter;
	return t;
}

const BLOCK_TEXTURES = {
	[BLOCKS.GRASS]: {
		top: loadTex('https://i.imgur.com/vGihbiB.png'),
		side: loadTex('https://i.imgur.com/2uDKrIn.png'),
		bottom: loadTex('https://i.imgur.com/2uDKrIn.png')
	},
	[BLOCKS.DIRT]: {
		top: loadTex('https://i.imgur.com/2uDKrIn.png'),
		side: loadTex('https://i.imgur.com/2uDKrIn.png'),
		bottom: loadTex('https://i.imgur.com/2uDKrIn.png')
	},
	[BLOCKS.STONE]: {
		top: loadTex('https://i.imgur.com/VX2QBfr.png'),
		side: loadTex('https://i.imgur.com/VX2QBfr.png'),
		bottom: loadTex('https://i.imgur.com/VX2QBfr.png')
	},
	[BLOCKS.WOOD]: {
		top: loadTex('https://i.imgur.com/mUeO1o6.png'),
		side: loadTex('https://i.imgur.com/LWdPZV8.png'),
		bottom: loadTex('https://i.imgur.com/mUeO1o6.png')
	},
	[BLOCKS.LEAVES]: {
		top: loadTex('https://i.imgur.com/dw51br0.png'),
		side: loadTex('https://i.imgur.com/dw51br0.png'),
		bottom: loadTex('https://i.imgur.com/dw51br0.png')
	},
	[BLOCKS.SAND]: {
		top: loadTex('https://i.imgur.com/3KCdLkg.png'),
		side: loadTex('https://i.imgur.com/3KCdLkg.png'),
		bottom: loadTex('https://i.imgur.com/3KCdLkg.png')
	},
}

const FACES = [
	{dir: [0, 1, 0], corners: [[0,1,1],[1,1,1],[0,1,0],[1,1,0]], face: 'top'},
	{dir: [0, -1, 0], corners: [[1,0,1],[0,0,1],[1,0,0],[0,0,0]], face: 'bottom'},
	{dir: [-1, 0, 0], corners: [[0,0,1],[0,1,1],[0,0,0],[0,1,0]], face: 'side'},
	{dir: [1, 0, 0], corners: [[1,1,1],[1,0,1],[1,1,0],[1,0,0]], face: 'side'},
	{dir: [0, 0, -1], corners: [[0,0,0],[0,1,0],[1,0,0],[1,1,0]], face: 'side'},
	{dir: [0, 0, 1], corners: [[1,0,1],[1,1,1],[0,0,1],[0,1,1]], face: 'side'}
]

const UV_COORDS = [0,0, 1,0, 0,1, 1,1];

export class Chunk {
	constructor(cx, cz) {
		this.cx = cx;
		this.cz = cz;
		this.data = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
		this.mesh = null;
	}

	index(x, y, z) {
		return x + CHUNK_SIZE * (y + CHUNK_HEIGHT * z);
	}

	getBlock(x, y, z) {
		if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) return -1;
		return this.data[this.index(x, y, z)];
	}

	setBlock(x, y, z, type) {
		if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) return;
		this.data[this.index(x, y, z)] = type;
	}

	buildMesh(scene, getNeighborBlock) {
		if (this.mesh) {
			if (Array.isArray(this.mesh)) {
				this.mesh.forEach(m => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
			} else {
				scene.remove(this.mesh);
				this.mesh.geometry.dispose();
				this.mesh.material.dispose();
			}
			this.mesh = null;
		}

		// One geometry per unique texture
		const faceGroups = {};

		for (let z = 0; z < CHUNK_SIZE; z++) {
			for (let y = 0; y < CHUNK_HEIGHT; y++) {
				for (let x = 0; x < CHUNK_SIZE; x++) {
					const block = this.getBlock(x, y, z);
					if (block === BLOCKS.AIR || block === BLOCKS.WATER) continue;
					const blockTextures = BLOCK_TEXTURES[block] || BLOCK_TEXTURES[BLOCKS.STONE];

					for (const {dir, corners, face} of FACES) {
						const nx = x + dir[0], ny = y + dir[1], nz = z + dir[2];
						let neighbor;
						if (nx < 0 || nx >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE) {
							neighbor = getNeighborBlock(this.cx * CHUNK_SIZE + nx, ny, this.cz * CHUNK_SIZE + nz);
						} else {
							neighbor = this.getBlock(nx, ny, nz);
						}
						if (neighbor !== BLOCKS.AIR && neighbor !== -1) continue;

						const tex = blockTextures[face];
						const key = tex.uuid;
						if (!faceGroups[key]) faceGroups[key] = { tex, positions: [], uvs: [], indices: [], vertCount: 0 };
						const g = faceGroups[key];

						const shade = face === 'top' ? 1.0 : face === 'bottom' ? 0.5 : 0.75;
						const uvList = [0,0, 1,0, 0,1, 1,1];

						for (let i = 0; i < corners.length; i++) {
							const [ox, oy, oz] = corners[i];
							g.positions.push(this.cx * CHUNK_SIZE + x + ox, y + oy, this.cz * CHUNK_SIZE + z + oz);
							g.uvs.push(uvList[i*2], uvList[i*2+1]);
						}
						g.indices.push(
							g.vertCount, g.vertCount+1, g.vertCount+2,
							g.vertCount+2, g.vertCount+1, g.vertCount+3
						);
						g.vertCount += 4;
					}
				}
			}
		}

		const meshes = [];
		for (const key in faceGroups) {
			const g = faceGroups[key];
			const geometry = new THREE.BufferGeometry();
			geometry.setAttribute('position', new THREE.Float32BufferAttribute(g.positions, 3));
			geometry.setAttribute('uv', new THREE.Float32BufferAttribute(g.uvs, 2));
			geometry.setIndex(g.indices);
			geometry.computeVertexNormals();
			const material = new THREE.MeshLambertMaterial({ map: g.tex });
			const mesh = new THREE.Mesh(geometry, material);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			scene.add(mesh);
			meshes.push(mesh);
		}
		this.mesh = meshes;
	}

	disposeMesh(scene) {
		if (this.mesh) {
			if (Array.isArray(this.mesh)) {
				this.mesh.forEach(m => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
			} else {
				scene.remove(this.mesh);
				this.mesh.geometry.dispose();
				this.mesh.material.dispose();
			}
			this.mesh = null;
		}
	}
}

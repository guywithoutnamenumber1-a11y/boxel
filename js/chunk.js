function buildMesh() {
    const vertices = [];
    const uvs = [];
    const normals = [];
    const indices = [];
    const solidBlocks = [];

    for (let x = 0; x < this.width; x++) {
        for (let y = 0; y < this.height; y++) {
            for (let z = 0; z < this.depth; z++) {
                const block = this.getBlock(x, y, z);

                if (block === "WATER") {
                    // Skip water blocks entirely.
                    continue;
                }

                const isSolid = block !== "AIR";
                const neighbors = this.getNeighbors(x, y, z);

                if (isSolid) {
                    solidBlocks.push({x, y, z});
                }

                // Check neighbors to determine visible faces.
                const visibleFaces = [];
                for (let dir of directions) {
                    const neighbor = neighbors[dir];

                    // Only render faces when neighbor is AIR, not WATER.
                    if (neighbor === "AIR") {
                        visibleFaces.push(dir);
                    }
                }

                // Handle the rendering of visible faces (assuming a function to do so).
                for (let face of visibleFaces) {
                    this.addFace(vertices, uvs, normals, indices, x, y, z, face);
                }
            }
        }
    }
    return {vertices, uvs, normals, indices};
}
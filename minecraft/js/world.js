/**
 * Quản lý cấu trúc dữ liệu voxel, phân chia chunks, sinh địa hình và cây cối,
 * cùng thuật toán tạo Mesh tối ưu (Voxel Meshing - chỉ vẽ mặt lộ thiên).
 */
class World {
    constructor(scene, textureAtlas) {
        this.scene = scene;
        this.textureAtlas = textureAtlas;
        
        this.chunkSize = 16;
        this.worldHeight = 64;
        this.renderDistance = 4; // Bán kính tính theo số lượng Chunks
        
        // Quản lý các Chunks dưới dạng map: "cx,cz" => { data: Uint8Array, mesh: THREE.Mesh }
        this.chunks = new Map();
        
        // Khởi tạo máy phát nhiễu địa hình
        this.noise = new ImprovedNoise();
        
        // Tạo vật liệu dùng chung cho toàn bộ các khối (Texture Atlas)
        // Dùng NearestFilter để giữ hiệu ứng pixel sắc nét kiểu Minecraft
        this.textureAtlas.magFilter = THREE.NearestFilter;
        this.textureAtlas.minFilter = THREE.NearestFilter;
        
        // Dùng MeshLambertMaterial hoặc MeshPhongMaterial để hỗ trợ đổ bóng/ánh sáng
        this.material = new THREE.MeshLambertMaterial({
            map: new THREE.CanvasTexture(this.textureAtlas),
            side: THREE.DoubleSide,
            transparent: true,
            alphaTest: 0.1 // Đục lỗ cho kính và lá cây không bị lỗi chồng đè chiều sâu
        });
    }

    /**
     * Chuyển đổi toạ độ thế giới thành toạ độ Chunk và toạ độ tương đối trong Chunk
     */
    worldToLocal(x, y, z) {
        const cx = Math.floor(x / this.chunkSize);
        const cz = Math.floor(z / this.chunkSize);
        const rx = Math.floor((x % this.chunkSize + this.chunkSize) % this.chunkSize);
        const ry = Math.floor(y);
        const rz = Math.floor((z % this.chunkSize + this.chunkSize) % this.chunkSize);
        return { cx, cz, rx, ry, rz };
    }

    /**
     * Lấy giá trị khối tại vị trí toàn cục (x, y, z)
     */
    getBlock(x, y, z) {
        if (y < 0 || y >= this.worldHeight) return 0; // Giới hạn chiều cao thế giới
        
        const { cx, cz, rx, ry, rz } = this.worldToLocal(x, y, z);
        const chunkKey = `${cx},${cz}`;
        const chunk = this.chunks.get(chunkKey);
        
        if (!chunk) return 0; // Chưa sinh chunk thì coi như không khí
        
        const index = (rx * this.chunkSize + rz) * this.worldHeight + ry;
        return chunk.data[index];
    }

    /**
     * Đặt giá trị khối tại vị trí toàn cục (x, y, z)
     * Đánh dấu cần vẽ lại (dirty) cho chunk hiện tại và các chunk lân cận nếu khối nằm ở biên giới
     */
    setBlock(x, y, z, blockId) {
        if (y < 0 || y >= this.worldHeight) return false;
        
        const { cx, cz, rx, ry, rz } = this.worldToLocal(x, y, z);
        const chunkKey = `${cx},${cz}`;
        let chunk = this.chunks.get(chunkKey);
        
        if (!chunk) {
            // Nếu chưa có chunk, tạo mới
            this.generateChunkData(cx, cz);
            chunk = this.chunks.get(chunkKey);
        }
        
        const index = (rx * this.chunkSize + rz) * this.worldHeight + ry;
        const oldBlockId = chunk.data[index];
        
        if (oldBlockId === blockId) return false; // Không có gì thay đổi
        
        chunk.data[index] = blockId;
        chunk.dirty = true;
        
        // Cập nhật lại các chunk lân cận nếu khối đặt/phá nằm ở mép biên giới chunk
        if (rx === 0) this.markChunkDirty(cx - 1, cz);
        if (rx === this.chunkSize - 1) this.markChunkDirty(cx + 1, cz);
        if (rz === 0) this.markChunkDirty(cx, cz - 1);
        if (rz === this.chunkSize - 1) this.markChunkDirty(cx, cz + 1);
        
        return true;
    }

    markChunkDirty(cx, cz) {
        const chunk = this.chunks.get(`${cx},${cz}`);
        if (chunk) chunk.dirty = true;
    }

    /**
     * Sinh dữ liệu thô (Voxel) cho Chunk cụ thể dựa trên nhiễu Perlin
     */
    generateChunkData(cx, cz) {
        const chunkKey = `${cx},${cz}`;
        if (this.chunks.has(chunkKey)) return;
        
        const data = new Uint8Array(this.chunkSize * this.worldHeight * this.chunkSize);
        this.chunks.set(chunkKey, {
            data: data,
            mesh: null,
            dirty: true,
            cx: cx,
            cz: cz
        });

        // Điền dữ liệu địa hình đồi núi
        for (let rx = 0; rx < this.chunkSize; rx++) {
            for (let rz = 0; rz < this.chunkSize; rz++) {
                const gx = cx * this.chunkSize + rx;
                const gz = cz * this.chunkSize + rz;
                
                // Tính độ cao mặt đất bằng FBM noise
                // Trực quan: Đồi nhấp nhô mượt mà
                const noiseVal = this.noise.fbm2d(gx * 0.015, gz * 0.015, 4, 0.5);
                const height = Math.floor((noiseVal + 1) * 0.5 * 24) + 16; // Chiều cao đất từ 16 đến 40
                
                for (let ry = 0; ry < this.worldHeight; ry++) {
                    const index = (rx * this.chunkSize + rz) * this.worldHeight + ry;
                    
                    if (ry === height) {
                        // Khối trên cùng là Cỏ hoặc Cát ở bãi cát rìa đồi thấp
                        if (height < 22) {
                            data[index] = 8; // Cát (Sand)
                        } else {
                            data[index] = 1; // Cỏ (Grass)
                        }
                    } else if (ry < height && ry >= height - 3) {
                        // Khối trung gian dưới cỏ là Đất
                        data[index] = 2; // Đất (Dirt)
                    } else if (ry < height - 3) {
                        // Sâu hơn nữa là Đá cứng
                        data[index] = 3; // Đá (Stone)
                    } else {
                        data[index] = 0; // Không khí (Air)
                    }
                }
            }
        }

        // Sinh cây cối ngẫu nhiên trên bề mặt (tỷ lệ 1.5% mỗi cột toạ độ)
        for (let rx = 2; rx < this.chunkSize - 2; rx++) {
            for (let rz = 2; rz < this.chunkSize - 2; rz++) {
                if (Math.random() < 0.012) {
                    const gx = cx * this.chunkSize + rx;
                    const gz = cz * this.chunkSize + rz;
                    
                    // Lấy chiều cao mặt đất tại toạ độ này
                    const noiseVal = this.noise.fbm2d(gx * 0.015, gz * 0.015, 4, 0.5);
                    const height = Math.floor((noiseVal + 1) * 0.5 * 24) + 16;
                    
                    // Chỉ mọc cây trên khối Cỏ
                    const blockBelowIndex = (rx * this.chunkSize + rz) * this.worldHeight + height;
                    if (data[blockBelowIndex] === 1) {
                        this.spawnTree(data, rx, height + 1, rz);
                    }
                }
            }
        }
    }

    /**
     * Sinh một cây gỗ sồi với tán lá
     */
    spawnTree(data, rx, ry, rz) {
        const treeHeight = 5 + Math.floor(Math.random() * 2); // Thân cây cao 5-6 khối
        
        // 1. Dựng thân cây Gỗ Sồi
        for (let h = 0; h < treeHeight; h++) {
            const index = (rx * this.chunkSize + rz) * this.worldHeight + (ry + h);
            if (ry + h < this.worldHeight) {
                data[index] = 4; // Khối gỗ (Wood)
            }
        }

        // 2. Dựng tán lá (Leaves) bao quanh phần đỉnh thân cây
        const leafBaseY = ry + treeHeight - 3;
        for (let ly = leafBaseY; ly < ry + treeHeight + 1; ly++) {
            if (ly >= this.worldHeight) continue;
            
            // Bán kính tán lá giảm dần khi lên cao
            const isTopLevel = (ly >= ry + treeHeight - 1);
            const radius = isTopLevel ? 1 : 2;
            
            for (let lx = rx - radius; lx <= rx + radius; lx++) {
                for (let lz = rz - radius; lz <= rz + radius; lz++) {
                    // Tránh các góc của hình vuông tán lá để trông tự nhiên hơn
                    if (Math.abs(lx - rx) === radius && Math.abs(lz - rz) === radius && !isTopLevel && Math.random() > 0.5) {
                        continue;
                    }
                    
                    const lIndex = (lx * this.chunkSize + lz) * this.worldHeight + ly;
                    
                    // Chỉ đặt lá nếu chỗ đó trống (Không đè lên thân gỗ)
                    if (data[lIndex] === 0) {
                        data[lIndex] = 5; // Lá cây (Leaves)
                    }
                }
            }
        }
    }

    /**
     * Cập nhật các Chunk xung quanh vị trí người chơi
     */
    updateChunks(playerX, playerZ) {
        const pCx = Math.floor(playerX / this.chunkSize);
        const pCz = Math.floor(playerZ / this.chunkSize);
        
        // 1. Sinh dữ liệu voxel cho các Chunk trong vùng quan sát
        for (let cx = pCx - this.renderDistance; cx <= pCx + this.renderDistance; cx++) {
            for (let cz = pCz - this.renderDistance; cz <= pCz + this.renderDistance; cz++) {
                this.generateChunkData(cx, cz);
            }
        }

        // 2. Re-mesh (Dựng lại mô hình 3D) cho các chunk bị thay đổi (dirty)
        for (let cx = pCx - this.renderDistance; cx <= pCx + this.renderDistance; cx++) {
            for (let cz = pCz - this.renderDistance; cz <= pCz + this.renderDistance; cz++) {
                const chunkKey = `${cx},${cz}`;
                const chunk = this.chunks.get(chunkKey);
                
                if (chunk && chunk.dirty) {
                    this.buildChunkMesh(chunk);
                }
            }
        }

        // 3. Ẩn/Hiện mesh của Chunks ngoài tầm nhìn để tiết kiệm bộ nhớ GPU
        for (const [key, chunk] of this.chunks.entries()) {
            const distanceX = Math.abs(chunk.cx - pCx);
            const distanceZ = Math.abs(chunk.cz - pCz);
            
            if (distanceX > this.renderDistance || distanceZ > this.renderDistance) {
                // Xoá Mesh khỏi scene nếu xa quá
                if (chunk.mesh) {
                    this.scene.remove(chunk.mesh);
                    chunk.mesh.geometry.dispose();
                    chunk.mesh = null;
                    chunk.dirty = true; // Đánh dấu để dựng lại sau khi quay lại gần
                }
            }
        }
    }

    /**
     * Dựng mô hình 3D (Mesh) tối ưu cho một Chunk
     * Sử dụng kỹ thuật Visible Face Extraction để giảm thiểu số lượng polygon
     */
    buildChunkMesh(chunk) {
        // Xoá mesh cũ nếu có
        if (chunk.mesh) {
            this.scene.remove(chunk.mesh);
            chunk.mesh.geometry.dispose();
            chunk.mesh = null;
        }

        const positions = [];
        const normals = [];
        const uvs = [];
        const indices = [];
        let indexOffset = 0;

        const cx = chunk.cx;
        const cz = chunk.cz;

        // Quét từng voxel trong chunk
        for (let rx = 0; rx < this.chunkSize; rx++) {
            for (let rz = 0; rz < this.chunkSize; rz++) {
                const gx = cx * this.chunkSize + rx;
                const gz = cz * this.chunkSize + rz;
                
                for (let ry = 0; ry < this.worldHeight; ry++) {
                    const blockIndex = (rx * this.chunkSize + rz) * this.worldHeight + ry;
                    const blockId = chunk.data[blockIndex];
                    
                    if (blockId === 0) continue; // Khối Không khí thì bỏ qua

                    // Toạ độ tuyệt đối góc chân khối
                    const x = gx;
                    const y = ry;
                    const z = gz;

                    // Kiểm tra 6 mặt lân cận
                    const neighbors = [
                        this.getBlock(x - 1, y, z), // Trái (-X)
                        this.getBlock(x + 1, y, z), // Phải (+X)
                        this.getBlock(x, y - 1, z), // Dưới (-Y)
                        this.getBlock(x, y + 1, z), // Trên (+Y)
                        this.getBlock(x, y, z - 1), // Trước (-Z)
                        this.getBlock(x, y, z + 1)  // Sau (+Z)
                    ];

                    for (let face = 0; face < 6; face++) {
                        const neighborId = neighbors[face];
                        
                        // Điều kiện hiển thị mặt khối:
                        // Mặt tiếp giáp với không khí (0), kính (7) hoặc lá cây (5) thì mới vẽ
                        // Khối trong suốt (kính) thì vẽ mặt tiếp giáp của khối đặc kề bên
                        let isFaceVisible = (neighborId === 0 || neighborId === 7 || (neighborId === 5 && blockId !== 5));
                        
                        if (blockId === 7 && neighborId === 7) {
                            // Hai khối kính sát nhau không vẽ mặt tiếp xúc chung
                            isFaceVisible = false;
                        }

                        if (isFaceVisible) {
                            // Thêm toạ độ đỉnh 3D của mặt này
                            const faceVertices = this.getFaceVertices(x, y, z, face);
                            positions.push(...faceVertices);

                            // Thêm Vector pháp tuyến (Normal) để tính toán hướng chiếu sáng
                            const faceNorm = this.getFaceNormal(face);
                            for (let v = 0; v < 4; v++) {
                                normals.push(...faceNorm);
                            }

                            // Thêm toạ độ ảnh UV tương ứng với Block ID và mặt
                            const uv = TextureGenerator.getUVCoords(blockId, face);
                            if (uv) {
                                uvs.push(
                                    uv.uMin, uv.vMin,
                                    uv.uMax, uv.vMin,
                                    uv.uMax, uv.vMax,
                                    uv.uMin, uv.vMax
                                );
                            } else {
                                uvs.push(0, 0, 0.25, 0, 0.25, 0.25, 0, 0.25);
                            }

                            // Thêm chỉ số vẽ 2 tam giác của mặt hình vuông
                            indices.push(
                                indexOffset + 0, indexOffset + 1, indexOffset + 2,
                                indexOffset + 2, indexOffset + 3, indexOffset + 0
                            );

                            indexOffset += 4;
                        }
                    }
                }
            }
        }

        // Tạo Three.js BufferGeometry
        if (positions.length > 0) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geometry.setIndex(indices);

            const mesh = new THREE.Mesh(geometry, this.material);
            this.scene.add(mesh);
            chunk.mesh = mesh;
        }
        
        chunk.dirty = false;
    }

    /**
     * Trả về toạ độ 4 đỉnh của mặt hình vuông (mỗi mặt gồm 3 tọa độ X,Y,Z * 4 đỉnh = 12 phần tử)
     */
    getFaceVertices(x, y, z, face) {
        switch (face) {
            case 0: // Trái (-X)
                return [
                    x, y, z,
                    x, y, z + 1,
                    x, y + 1, z + 1,
                    x, y + 1, z
                ];
            case 1: // Phải (+X)
                return [
                    x + 1, y, z + 1,
                    x + 1, y, z,
                    x + 1, y + 1, z,
                    x + 1, y + 1, z + 1
                ];
            case 2: // Dưới (-Y)
                return [
                    x, y, z,
                    x + 1, y, z,
                    x + 1, y, z + 1,
                    x, y, z + 1
                ];
            case 3: // Trên (+Y)
                return [
                    x, y + 1, z + 1,
                    x + 1, y + 1, z + 1,
                    x + 1, y + 1, z,
                    x, y + 1, z
                ];
            case 4: // Trước (-Z)
                return [
                    x, y, z,
                    x + 1, y, z,
                    x + 1, y + 1, z,
                    x, y + 1, z
                ];
            case 5: // Sau (+Z)
                return [
                    x + 1, y, z + 1,
                    x, y, z + 1,
                    x, y + 1, z + 1,
                    x + 1, y + 1, z + 1
                ];
        }
    }

    /**
     * Trả về hướng pháp tuyến của mặt
     */
    getFaceNormal(face) {
        switch (face) {
            case 0: return [-1, 0, 0]; // Trái
            case 1: return [1, 0, 0];  // Phải
            case 2: return [0, -1, 0]; // Dưới
            case 3: return [0, 1, 0];  // Trên
            case 4: return [0, 0, -1]; // Trước
            case 5: return [0, 0, 1];  // Sau
        }
    }

    /**
     * Dọn dẹp tất cả các mesh của thế giới khỏi scene
     */
    clear() {
        for (const [key, chunk] of this.chunks.entries()) {
            if (chunk.mesh) {
                this.scene.remove(chunk.mesh);
                chunk.mesh.geometry.dispose();
            }
        }
        this.chunks.clear();
    }
}

/**
 * Minimap — Bản đồ nhỏ góc trái trên
 * =====================================
 * - Canvas 160×160px hiển thị địa hình từ trên nhìn xuống
 * - Màu theo loại khối bề mặt (cỏ, đất, đá, cát, tuyết...)
 * - Chấm đỏ = người chơi, chấm cam = zombie
 * - Cập nhật terrain mỗi 1.5s, mob realtime
 */
class Minimap {
    constructor(game) {
        this.game        = game;
        this.SIZE        = 160;   // px của canvas
        this.RANGE       = 48;    // số block bán kính hiển thị
        this.canvas      = null;
        this.ctx         = null;
        this.terrainCache = null; // ImageData cache
        this.terrainDirty = true;
        this.updateTimer  = 0;
        this.UPDATE_INTERVAL = 1.5; // giây

        this._build();
    }

    // =========================================================================
    // TẠO DOM
    // =========================================================================
    _build() {
        const wrap = document.createElement('div');
        wrap.id = 'minimapWrap';
        wrap.innerHTML = `
            <div class="mm-header">
                <span class="mm-title">🗺️ Bản đồ</span>
                <span class="mm-coords" id="mmCoords"></span>
                <button class="mm-toggle" id="mmToggle">−</button>
            </div>
            <canvas id="minimapCanvas" width="${this.SIZE}" height="${this.SIZE}"></canvas>
        `;
        document.body.appendChild(wrap);

        this.canvas = document.getElementById('minimapCanvas');
        this.ctx    = this.canvas.getContext('2d');

        // Toggle ẩn/hiện
        let collapsed = false;
        document.getElementById('mmToggle').onclick = () => {
            collapsed = !collapsed;
            this.canvas.style.display = collapsed ? 'none' : 'block';
            document.getElementById('mmToggle').textContent = collapsed ? '+' : '−';
            wrap.style.width = collapsed ? 'auto' : '';
        };
    }

    // =========================================================================
    // UPDATE (gọi từ game.animate)
    // =========================================================================
    update(dt) {
        this.updateTimer += dt;

        const px = Math.floor(this.game.player.position.x);
        const pz = Math.floor(this.game.player.position.z);

        // Cập nhật tọa độ realtime
        const py = Math.floor(this.game.player.position.y);
        const coords = document.getElementById('mmCoords');
        if (coords) coords.textContent = `${px}, ${py}, ${pz}`;

        // Re-render terrain + entities
        if (this.updateTimer >= this.UPDATE_INTERVAL) {
            this.updateTimer = 0;
            this._renderTerrain(px, pz);
        }

        // Vẽ entities (player + zombie) mỗi frame
        if (this.terrainCache) {
            this._renderEntities(px, pz);
        }
    }

    // =========================================================================
    // VẼ ĐỊA HÌNH
    // =========================================================================
    _renderTerrain(cx, cz) {
        const ctx   = this.ctx;
        const S     = this.SIZE;
        const R     = this.RANGE;
        const scale = S / (R * 2);

        // Tạo ImageData để vẽ pixel
        const imgData = ctx.createImageData(S, S);
        const data    = imgData.data;

        for (let dz = -R; dz < R; dz++) {
            for (let dx = -R; dx < R; dx++) {
                const wx = cx + dx;
                const wz = cz + dz;

                // Tìm khối bề mặt (cao nhất không phải không khí)
                let surfaceY = -1;
                let blockId  = 0;
                for (let y = 63; y >= 0; y--) {
                    const b = this.game.world.getBlock(wx, y, wz);
                    if (b > 0) { surfaceY = y; blockId = b; break; }
                }

                const color = this._blockColor(blockId, surfaceY);

                // Pixel position trên canvas
                const px = Math.floor((dx + R) * scale);
                const pz = Math.floor((dz + R) * scale);
                const pw = Math.max(1, Math.ceil(scale));

                for (let sy = 0; sy < pw; sy++) {
                    for (let sx = 0; sx < pw; sx++) {
                        const idx = ((pz + sy) * S + (px + sx)) * 4;
                        if (idx < 0 || idx + 3 >= data.length) continue;
                        // Độ sáng theo chiều cao
                        const bright = Math.min(1, 0.5 + surfaceY / 80);
                        data[idx]   = Math.floor(color[0] * bright);
                        data[idx+1] = Math.floor(color[1] * bright);
                        data[idx+2] = Math.floor(color[2] * bright);
                        data[idx+3] = 255;
                    }
                }
            }
        }

        ctx.putImageData(imgData, 0, 0);
        // Lưu cache terrain
        this.terrainCache = ctx.getImageData(0, 0, S, S);
    }

    // =========================================================================
    // VẼ ENTITIES (player + zombie)
    // =========================================================================
    _renderEntities(cx, cz) {
        const ctx   = this.ctx;
        const S     = this.SIZE;
        const R     = this.RANGE;
        const scale = S / (R * 2);

        // Khôi phục terrain cache
        ctx.putImageData(this.terrainCache, 0, 0);

        // Vẽ vòng tròn la bàn (border)
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth   = 1;
        ctx.strokeRect(0, 0, S, S);

        // Zombie (cam)
        if (this.game.mobManager) {
            ctx.fillStyle = '#ff8c00';
            for (const mob of this.game.mobManager.mobs) {
                if (mob.isDead) continue;
                const dx = (mob.position.x - cx) * scale + S/2;
                const dz = (mob.position.z - cz) * scale + S/2;
                if (dx < 0 || dx > S || dz < 0 || dz > S) continue;
                ctx.beginPath();
                ctx.arc(dx, dz, 3, 0, Math.PI*2);
                ctx.fill();
            }
        }

        // Player (đỏ + hướng nhìn)
        const half   = S / 2;
        const camYaw = this.game.player.camera.rotation.y;

        // Vòng tròn
        ctx.fillStyle = '#ff3344';
        ctx.beginPath();
        ctx.arc(half, half, 4.5, 0, Math.PI*2);
        ctx.fill();

        // Mũi tên hướng nhìn
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.moveTo(half, half);
        ctx.lineTo(
            half + Math.sin(-camYaw) * 10,
            half + Math.cos(-camYaw) * 10
        );
        ctx.stroke();
    }

    // =========================================================================
    // MÀU KHỐI
    // =========================================================================
    _blockColor(blockId, y) {
        // [R, G, B]
        const COLORS = {
            0:  [135, 200, 235], // không khí / nước nhìn từ trên
            1:  [86,  130, 50],  // cỏ xanh
            2:  [121, 85,  58],  // đất nâu
            3:  [120, 120, 120], // đá xám
            4:  [100, 100, 100], // đá Cobblestone
            5:  [180, 130, 70],  // gỗ
            6:  [50,  100, 30],  // lá cây tối
            7:  [50,  50,  50],  // đá phủ rêu (dark stone)
            8:  [230, 210, 150], // cát vàng
            9:  [110, 110, 110], // đá cuội
            10: [45,  100, 45],  // gỗ sồi (tối hơn)
            11: [40,  40,  40],  // than đá
            12: [160, 130, 100], // quặng sắt
            13: [200, 180, 50],  // quặng vàng
            14: [50,  220, 220], // quặng kim cương
            15: [220, 230, 255], // tuyết
            16: [200, 150, 80],  // gỗ đỏ
            17: [200, 200, 200], // đá bóng
            18: [180, 60,  40],  // gạch đỏ
        };
        return COLORS[blockId] || [90, 90, 90];
    }

    destroy() {
        const el = document.getElementById('minimapWrap');
        if (el) el.remove();
    }
}

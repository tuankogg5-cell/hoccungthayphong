/**
 * Trình tạo Texture Atlas động cho các khối và icon cho thanh Hotbar
 * Tránh việc tải ảnh từ ngoài bị lỗi CORS, đảm bảo hoạt động ngoại tuyến và tải tức thì.
 */
const TextureGenerator = {
    // Kích thước của mỗi texture đơn lẻ (pixel)
    tileSize: 32,
    
    // Bản đồ cấu hình vị trí các texture trong Atlas (Grid 4x4)
    // Cú pháp: [Hàng, Cột] từ 0 -> 3
    atlasMap: {
        grass_top:    [0, 0],
        grass_side:   [0, 1],
        dirt:         [0, 2],
        stone:        [0, 3],
        wood_side:    [1, 0],
        wood_top:     [1, 1],
        leaves:       [1, 2],
        brick:        [1, 3],
        glass:        [2, 0],
        sand:         [2, 1],
        cobblestone:  [2, 2],
        planks:       [2, 3]
    },

    // Bản đồ định nghĩa 6 mặt của mỗi block ID sử dụng texture nào
    // Định dạng: [Trái, Phải, Dưới, Trên, Trước, Sau]
    blockTextures: {
        1: ['grass_side', 'grass_side', 'dirt', 'grass_top', 'grass_side', 'grass_side'], // Grass (1)
        2: ['dirt', 'dirt', 'dirt', 'dirt', 'dirt', 'dirt'],                               // Dirt (2)
        3: ['stone', 'stone', 'stone', 'stone', 'stone', 'stone'],                         // Stone (3)
        4: ['wood_side', 'wood_side', 'wood_top', 'wood_top', 'wood_side', 'wood_side'],   // Wood Trunk (4)
        5: ['leaves', 'leaves', 'leaves', 'leaves', 'leaves', 'leaves'],                   // Leaves (5)
        6: ['brick', 'brick', 'brick', 'brick', 'brick', 'brick'],                         // Brick (6)
        7: ['glass', 'glass', 'glass', 'glass', 'glass', 'glass'],                         // Glass (7)
        8: ['sand', 'sand', 'sand', 'sand', 'sand', 'sand'],                               // Sand (8)
        9: ['cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone'], // Cobble (9)
        10: ['planks', 'planks', 'planks', 'planks', 'planks', 'planks']                   // Planks (10)
    },

    // Tên hiển thị tiếng Việt của các khối
    blockNames: {
        1: 'Khối Cỏ',
        2: 'Khối Đất',
        3: 'Khối Đá',
        4: 'Khối Gỗ Sồi',
        5: 'Khối Lá Sồi',
        6: 'Khối Gạch Đỏ',
        7: 'Khối Kính',
        8: 'Khối Cát',
        9: 'Khối Đá Cuội',
        10: 'Khối Ván Gỗ'
    },

    /**
     * Tạo toàn bộ ảnh ghép Texture Atlas (128x128 pixel)
     */
    createAtlasCanvas() {
        const atlasSize = this.tileSize * 4; // 128x128
        const canvas = document.createElement('canvas');
        canvas.width = atlasSize;
        canvas.height = atlasSize;
        const ctx = canvas.getContext('2d');
        
        // Vẽ từng ô texture vào canvas
        for (const [key, coords] of Object.entries(this.atlasMap)) {
            const x = coords[1] * this.tileSize;
            const y = coords[0] * this.tileSize;
            this.drawTexture(ctx, key, x, y, this.tileSize);
        }
        
        return canvas;
    },

    /**
     * Vẽ chi tiết pixel-art cho từng loại vân bề mặt
     */
    drawTexture(ctx, name, x, y, size) {
        ctx.save();
        
        // Hàm sinh màu ngẫu nhiên nhẹ nhàng xung quanh một màu gốc (Tạo hạt/noise)
        const getNoiseColor = (r, g, b, range = 15) => {
            const factor = (Math.random() - 0.5) * range;
            return `rgb(${Math.max(0, Math.min(255, Math.floor(r + factor)))}, 
                        ${Math.max(0, Math.min(255, Math.floor(g + factor)))}, 
                        ${Math.max(0, Math.min(255, Math.floor(b + factor)))})`;
        };

        if (name === 'dirt') {
            // Đất: Nền nâu đậm hạt mịn
            ctx.fillStyle = '#865439';
            ctx.fillRect(x, y, size, size);
            this.drawNoise(ctx, x, y, size, 134, 84, 57, 25);
        } 
        else if (name === 'grass_top') {
            // Mặt cỏ: Nền xanh lá tươi
            ctx.fillStyle = '#558b2f';
            ctx.fillRect(x, y, size, size);
            this.drawNoise(ctx, x, y, size, 85, 139, 47, 30);
        } 
        else if (name === 'grass_side') {
            // Mặt bên cỏ: Phần dưới đất nâu, phần trên rìa cỏ răng cưa xanh lá
            ctx.fillStyle = '#865439'; // Nền đất nâu trước
            ctx.fillRect(x, y, size, size);
            this.drawNoise(ctx, x, y, size, 134, 84, 57, 25);

            // Rìa cỏ răng cưa ở trên cùng
            ctx.fillStyle = '#558b2f';
            const toothHeight = 8;
            for (let px = 0; px < size; px++) {
                // Tạo răng cưa nhấp nhô ngẫu nhiên ở phần đỉnh
                let h = toothHeight + Math.sin(px * 0.8) * 3 + (Math.random() > 0.7 ? 2 : 0);
                h = Math.max(4, Math.min(size - 4, Math.floor(h)));
                
                // Vẽ cột cỏ xanh dọc xuống
                ctx.fillStyle = getNoiseColor(85, 139, 47, 20);
                ctx.fillRect(x + px, y, 1, h);
            }
        } 
        else if (name === 'stone') {
            // Đá: Màu xám thô ráp
            ctx.fillStyle = '#7f8c8d';
            ctx.fillRect(x, y, size, size);
            this.drawNoise(ctx, x, y, size, 127, 140, 141, 20);
            
            // Vẽ các đường nứt/vết đá tối màu
            ctx.fillStyle = '#5f6a6a';
            for (let i = 0; i < 6; i++) {
                ctx.fillRect(x + Math.floor(Math.random() * size), y + Math.floor(Math.random() * size), 3, 2);
            }
        } 
        else if (name === 'wood_side') {
            // Mặt bên gỗ: Vỏ cây nâu sẫm sọc dọc
            ctx.fillStyle = '#5c4033';
            ctx.fillRect(x, y, size, size);
            
            // Vẽ các thớ gỗ dọc tối màu
            ctx.fillStyle = '#3d2b1f';
            for (let px = 0; px < size; px += 4) {
                const offset = Math.floor(Math.sin(px) * 2);
                ctx.fillRect(x + px + offset, y, 2, size);
            }
            this.drawNoise(ctx, x, y, size, 92, 64, 51, 15);
        } 
        else if (name === 'wood_top') {
            // Mặt trên gỗ: Vòng năm tuổi
            ctx.fillStyle = '#d7a15c'; // Màu gỗ lõi sáng
            ctx.fillRect(x, y, size, size);
            
            // Vẽ vỏ nâu xung quanh
            ctx.strokeStyle = '#5c4033';
            ctx.lineWidth = 3;
            ctx.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3);

            // Vòng tròn bên trong đại diện thớ gỗ
            ctx.strokeStyle = '#a67b43';
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 5, y + 5, size - 10, size - 10);
            ctx.strokeRect(x + 10, y + 10, size - 20, size - 20);
        } 
        else if (name === 'leaves') {
            // Lá cây: Nhiều lá lấp lánh và có các pixel trống (trong suốt)
            ctx.fillStyle = '#1e4620';
            ctx.fillRect(x, y, size, size);
            
            // Vẽ các khối lá với độ đậm nhạt khác nhau
            for (let i = 0; i < 150; i++) {
                const px = Math.floor(Math.random() * size);
                const py = Math.floor(Math.random() * size);
                ctx.fillStyle = getNoiseColor(30, 90, 35, 40);
                ctx.fillRect(x + px, y + py, 2, 2);
            }

            // Đục các lỗ trong suốt (alpha = 0) để lá cây có cảm giác thật hơn
            ctx.clearRect(x + 2, y + 4, 2, 2);
            ctx.clearRect(x + 12, y + 8, 2, 2);
            ctx.clearRect(x + 24, y + 2, 2, 2);
            ctx.clearRect(x + 6, y + 20, 2, 2);
            ctx.clearRect(x + 18, y + 25, 2, 2);
            ctx.clearRect(x + 28, y + 16, 2, 2);
        } 
        else if (name === 'brick') {
            // Gạch đỏ: Các viên xếp xen kẽ
            ctx.fillStyle = '#b33939';
            ctx.fillRect(x, y, size, size);
            this.drawNoise(ctx, x, y, size, 179, 57, 57, 15);
            
            // Các đường vữa xám xi măng ngăn cách
            ctx.fillStyle = '#dcdde1';
            
            // Đường ngang
            ctx.fillRect(x, y + 7, size, 1);
            ctx.fillRect(x, y + 15, size, 1);
            ctx.fillRect(x, y + 23, size, 1);
            ctx.fillRect(x, y + 31, size, 1);

            // Đường dọc xen kẽ
            ctx.fillRect(x + 7, y, 1, 7);
            ctx.fillRect(x + 23, y, 1, 7);

            ctx.fillRect(x + 15, y + 8, 1, 7);
            ctx.fillRect(x + 31, y + 8, 1, 7);

            ctx.fillRect(x + 7, y + 16, 1, 7);
            ctx.fillRect(x + 23, y + 16, 1, 7);

            ctx.fillRect(x + 15, y + 24, 1, 7);
            ctx.fillRect(x + 31, y + 24, 1, 7);
        } 
        else if (name === 'glass') {
            // Kính: Khung viền và các tia phản chiếu xéo
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.fillRect(x, y, size, size);
            
            // Vẽ viền kính mỏng màu trắng xám
            ctx.fillStyle = '#f5f6fa';
            ctx.fillRect(x, y, size, 1);
            ctx.fillRect(x, y + size - 1, size, 1);
            ctx.fillRect(x, y, 1, size);
            ctx.fillRect(x + size - 1, y, 1, size);

            // Vẽ tia phản chiếu ánh sáng
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            // Đường chéo chính
            ctx.beginPath();
            ctx.moveTo(x + 4, y + size - 4);
            ctx.lineTo(x + size - 4, y + 4);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Đường chéo phụ ngắn hơn
            ctx.beginPath();
            ctx.moveTo(x + 8, y + size - 4);
            ctx.lineTo(x + size - 4, y + 8);
            ctx.stroke();
        } 
        else if (name === 'sand') {
            // Cát: Màu vàng nhạt, hạt thưa mịn
            ctx.fillStyle = '#f7d794';
            ctx.fillRect(x, y, size, size);
            this.drawNoise(ctx, x, y, size, 247, 215, 148, 15);
        } 
        else if (name === 'cobblestone') {
            // Đá cuội: Tách biệt từng viên cuội màu xám đậm nhạt ghép lại
            ctx.fillStyle = '#57606f';
            ctx.fillRect(x, y, size, size);
            
            // Vẽ các hòn đá nhỏ
            ctx.fillStyle = '#747d8c';
            // Vẽ phác các đa giác ngẫu nhiên đại diện đá cuội
            for (let i = 0; i < 8; i++) {
                const ox = Math.floor(Math.random() * (size - 8)) + x;
                const oy = Math.floor(Math.random() * (size - 8)) + y;
                const w = Math.floor(Math.random() * 6) + 4;
                const h = Math.floor(Math.random() * 6) + 4;
                ctx.fillStyle = getNoiseColor(116, 125, 140, 20);
                ctx.fillRect(ox, oy, w, h);
                // Viền tối màu xung quanh viên cuội
                ctx.strokeStyle = '#2f3542';
                ctx.strokeRect(ox, oy, w, h);
            }
        } 
        else if (name === 'planks') {
            // Ván gỗ: Ván ngang ghép nối
            ctx.fillStyle = '#d5a96c';
            ctx.fillRect(x, y, size, size);
            this.drawNoise(ctx, x, y, size, 213, 169, 108, 15);

            // Đường chia ván gỗ ngang
            ctx.fillStyle = '#78562d';
            ctx.fillRect(x, y + 8, size, 1);
            ctx.fillRect(x, y + 16, size, 1);
            ctx.fillRect(x, y + 24, size, 1);

            // Đường ghép dọc
            ctx.fillRect(x + 10, y, 1, 8);
            ctx.fillRect(x + 24, y + 8, 1, 8);
            ctx.fillRect(x + 8, y + 16, 1, 8);
            ctx.fillRect(x + 20, y + 24, 1, 8);
        }

        ctx.restore();
    },

    /**
     * Thêm hiệu ứng hạt nhiễu (noise) lên mặt khối
     */
    drawNoise(ctx, x, y, size, r, g, b, range) {
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                if (Math.random() > 0.6) {
                    const factor = (Math.random() - 0.5) * range;
                    ctx.fillStyle = `rgb(${Math.max(0, Math.min(255, Math.floor(r + factor)))}, 
                                         ${Math.max(0, Math.min(255, Math.floor(g + factor)))}, 
                                         ${Math.max(0, Math.min(255, Math.floor(b + factor)))})`;
                    ctx.fillRect(x + i, y + j, 1, 1);
                }
            }
        }
    },

    /**
     * Vẽ icon khối dạng 3D Isometric lên các slot Canvas của Hotbar
     */
    drawBlockIcon(canvas, blockId) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        // Lấy tên các texture cho 6 mặt từ cấu hình
        const textures = this.blockTextures[blockId];
        if (!textures) return;

        const topTex = textures[3];  // Mặt trên
        const sideTex = textures[0]; // Mặt bên

        // Vì ta vẽ dạng 3D Isometric giả trên 2D Canvas:
        // Điểm tâm đỉnh: (w/2, h/2 - 4)
        // Ta sẽ vẽ 3 mặt chính: Trên (Top), Trái (Left), Phải (Right)
        const cx = w / 2;
        const cy = h / 2 - 2;
        const radiusX = w * 0.45;
        const radiusY = h * 0.22;
        const height = h * 0.38;

        // 1. Vẽ Mặt Trên (Top) - Hình thoi nghiêng
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx, cy - radiusY);             // Đỉnh trên
        ctx.lineTo(cx + radiusX, cy);             // Đỉnh phải
        ctx.lineTo(cx, cy + radiusY);             // Đỉnh dưới
        ctx.lineTo(cx - radiusX, cy);             // Đỉnh trái
        ctx.closePath();
        
        // Tạo mặt cỏ có màu xanh hoặc tô màu theo Texture
        let topColor = '#558b2f'; // Mặc định xanh cỏ
        if (topTex === 'dirt') topColor = '#865439';
        else if (topTex === 'stone') topColor = '#7f8c8d';
        else if (topTex === 'wood_top') topColor = '#d7a15c';
        else if (topTex === 'leaves') topColor = '#1e4620';
        else if (topTex === 'brick') topColor = '#b33939';
        else if (topTex === 'glass') topColor = 'rgba(245, 246, 250, 0.4)';
        else if (topTex === 'sand') topColor = '#f7d794';
        else if (topTex === 'cobblestone') topColor = '#747d8c';
        else if (topTex === 'planks') topColor = '#d5a96c';
        
        ctx.fillStyle = topColor;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        // 2. Vẽ Mặt Bên Trái (Left Side) - Hình bình hành
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx - radiusX, cy);
        ctx.lineTo(cx, cy + radiusY);
        ctx.lineTo(cx, cy + radiusY + height);
        ctx.lineTo(cx - radiusX, cy + height);
        ctx.closePath();

        let leftColor = '#865439'; // Nâu mặc định
        if (sideTex === 'stone') leftColor = '#6c7a89';
        else if (sideTex === 'wood_side') leftColor = '#4a3329';
        else if (sideTex === 'leaves') leftColor = '#163317';
        else if (sideTex === 'brick') leftColor = '#9a3030';
        else if (sideTex === 'glass') leftColor = 'rgba(200, 200, 200, 0.2)';
        else if (sideTex === 'sand') leftColor = '#dec180';
        else if (sideTex === 'cobblestone') leftColor = '#4b535d';
        else if (sideTex === 'planks') leftColor = '#b38e5b';
        
        // Tạo đổ bóng cho mặt bên trái (Tối hơn mặt trên 15%)
        ctx.fillStyle = leftColor;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.stroke();
        ctx.restore();

        // 3. Vẽ Mặt Bên Phải (Right Side) - Hình bình hành
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx, cy + radiusY);
        ctx.lineTo(cx + radiusX, cy);
        ctx.lineTo(cx + radiusX, cy + height);
        ctx.lineTo(cx, cy + radiusY + height);
        ctx.closePath();

        let rightColor = '#73462f'; // Nâu tối mặc định cho mặt phải
        if (sideTex === 'stone') rightColor = '#5c6975';
        else if (sideTex === 'wood_side') rightColor = '#3a2720';
        else if (sideTex === 'leaves') rightColor = '#0f2410';
        else if (sideTex === 'brick') rightColor = '#7d2626';
        else if (sideTex === 'glass') rightColor = 'rgba(160, 160, 160, 0.3)';
        else if (sideTex === 'sand') rightColor = '#c4aa70';
        else if (sideTex === 'cobblestone') rightColor = '#3b4149';
        else if (sideTex === 'planks') rightColor = '#94754a';

        // Mặt phải tối hơn nữa để tạo chiều sâu 3D (Shadowing)
        ctx.fillStyle = rightColor;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.stroke();
        ctx.restore();
    },

    /**
     * Trả về thông tin toạ độ UV của một mặt cụ thể cho Block ID
     * Phục vụ cho lập trình World Mesher
     * faceIndex: 0: Trái, 1: Phải, 2: Dưới, 3: Trên, 4: Trước, 5: Sau
     */
    getUVCoords(blockId, faceIndex) {
        const textures = this.blockTextures[blockId];
        if (!textures) return null;
        
        const texName = textures[faceIndex];
        const coords = this.atlasMap[texName];
        if (!coords) return null;

        // Toạ độ dòng/cột quy ra UV [0.0 -> 1.0]
        // Vì trục Y của WebGL/Three.js hướng từ dưới lên, ta đảo ngược toạ độ hàng
        const uMin = coords[1] * 0.25;
        const uMax = (coords[1] + 1) * 0.25;
        
        // Hàng 0 nằm trên cùng trong ảnh 2D Canvas (y = 0), quy đổi ra WebGL Y sẽ là 0.75 -> 1.0
        const vMin = (3 - coords[0]) * 0.25;
        const vMax = (4 - coords[0]) * 0.25;

        return { uMin, uMax, vMin, vMax };
    }
};

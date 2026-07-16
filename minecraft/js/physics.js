/**
 * Hệ thống vật lý va chạm và trọng lực cho người chơi (AABB - Axis-Aligned Bounding Box)
 * Giúp người chơi đứng trên đất cứng, nhảy lên, chịu tác động của trọng lực và trượt dọc tường
 */
class Physics {
    constructor(world) {
        this.world = world;
        this.gravity = -32;          // Trọng lực rơi tự do (m/s^2)
        this.terminalVelocity = -50; // Tốc độ rơi tối đa
    }

    /**
     * Xác định xem một khối có cản đường người chơi hay không
     */
    isSolid(blockId) {
        // Khối không khí (0) và lá cây (5) không cản người chơi di chuyển
        return blockId !== 0 && blockId !== 5;
    }

    /**
     * Kiểm tra và thu thập tất cả các hộp bao (AABB) của các khối cứng đang va chạm với người chơi
     */
    checkCollisions(pos, playerWidth, playerHeight, playerDepth) {
        const halfW = playerWidth / 2;
        const halfD = playerDepth / 2;
        
        // Xác định khoảng toạ độ khối bao quanh người chơi
        const minX = Math.floor(pos.x - halfW);
        const maxX = Math.floor(pos.x + halfW);
        const minY = Math.floor(pos.y);
        const maxY = Math.floor(pos.y + playerHeight);
        const minZ = Math.floor(pos.z - halfD);
        const maxZ = Math.floor(pos.z + halfD);

        const collisions = [];

        // Duyệt toàn bộ các khối lân cận
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                for (let z = minZ; z <= maxZ; z++) {
                    const blockId = this.world.getBlock(x, y, z);
                    if (this.isSolid(blockId)) {
                        collisions.push({
                            minX: x, maxX: x + 1,
                            minY: y, maxY: y + 1,
                            minZ: z, maxZ: z + 1
                        });
                    }
                }
            }
        }
        return collisions;
    }

    /**
     * Cập nhật vị trí và vận tốc người chơi dựa trên gia tốc phím bấm và kiểm tra va chạm trục đơn
     */
    update(player, dt) {
        // Đặt giới hạn thời gian dt tối đa tránh tụt khung hình đột ngột làm nhảy xuyên khối
        dt = Math.min(dt, 0.1);

        if (player.flightMode) {
            // 1. Chế độ bay: không có trọng lực, di chuyển đa hướng mượt
            player.position.addScaledVector(player.velocity, dt);
            
            // Áp dụng lực cản/ma sát không khí để dừng lại mượt mà khi nhả phím
            player.velocity.multiplyScalar(0.82);
            player.onGround = false;
            return;
        }

        const halfW = player.width / 2;
        const halfD = player.depth / 2;

        // 2. Chế độ sinh tồn thường (Có trọng lực và va chạm)
        // Áp dụng trọng lực
        player.velocity.y += this.gravity * dt;
        player.velocity.y = Math.max(player.velocity.y, this.terminalVelocity);

        // Di chuyển và sửa lỗi trục Y trước (Đứng trên đất, va chạm trần)
        player.position.y += player.velocity.y * dt;
        
        let collisions = this.checkCollisions(player.position, player.width, player.height, player.depth);
        player.onGround = false;

        for (const block of collisions) {
            if (player.velocity.y < 0) {
                // Rơi đè lên mặt khối -> Tiếp đất thành công
                player.position.y = block.maxY;
                player.velocity.y = 0;
                player.onGround = true;
            } else if (player.velocity.y > 0) {
                // Nhảy cụng đầu vào trần -> Bị đẩy xuống
                player.position.y = block.minY - player.height;
                player.velocity.y = 0;
            }
        }

        // Di chuyển và sửa lỗi trục X (Va chạm tường trái/phải)
        player.position.x += player.velocity.x * dt;
        
        collisions = this.checkCollisions(player.position, player.width, player.height, player.depth);
        for (const block of collisions) {
            if (player.velocity.x > 0) {
                // Di chuyển sang +X đụng tường -> Đẩy ra cạnh trái tường
                player.position.x = block.minX - halfW - 0.001;
            } else if (player.velocity.x < 0) {
                // Di chuyển sang -X đụng tường -> Đẩy ra cạnh phải tường
                player.position.x = block.maxX + halfW + 0.001;
            }
            player.velocity.x = 0;
        }

        // Di chuyển và sửa lỗi trục Z (Va chạm tường trước/sau)
        player.position.z += player.velocity.z * dt;
        
        collisions = this.checkCollisions(player.position, player.width, player.height, player.depth);
        for (const block of collisions) {
            if (player.velocity.z > 0) {
                // Di chuyển sang +Z đụng tường -> Đẩy lùi
                player.position.z = block.minZ - halfD - 0.001;
            } else if (player.velocity.z < 0) {
                // Di chuyển sang -Z đụng tường -> Đẩy tiến
                player.position.z = block.maxZ + halfD + 0.001;
            }
            player.velocity.z = 0;
        }
    }
}

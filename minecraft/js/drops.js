/**
 * Lớp quản lý vật phẩm rơi (Item Drop) trong game Minecraft.
 * Khối bị đập sẽ văng ra một khối nhỏ 3D xoay tròn trên đất,
 * tự động bị hút vào người chơi và cộng vào kho đồ khi ở gần.
 */
class ItemDrop {
    constructor(scene, world, blockId, position) {
        this.scene = scene;
        this.world = world;
        this.blockId = blockId;
        
        // Vị trí trung tâm khối voxel bị đập
        this.position = position.clone().add(new THREE.Vector3(0.5, 0.2, 0.5));
        
        // Vận tốc văng ngẫu nhiên nhẹ theo phương ngang và hướng lên trên
        this.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 1.5,
            Math.random() * 2.0 + 2.0,
            (Math.random() - 0.5) * 1.5
        );
        
        this.isCollected = false;
        
        // Lấy màu sắc đặc trưng của khối từ bảng màu
        const color = ItemDrop.blockColors[blockId] || 0xffffff;
        
        // Tạo Mesh hộp nhỏ đại diện cho vật phẩm rơi (Kích thước 0.18)
        const geometry = new THREE.BoxGeometry(0.18, 0.18, 0.18);
        const material = new THREE.MeshLambertMaterial({ color: color });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.position.copy(this.position);
        
        this.scene.add(this.mesh);
    }
    
    /**
     * Cập nhật chuyển động bay, rơi tự do hoặc lực hút về phía người chơi
     */
    update(player, dt) {
        if (this.isCollected) return;
        
        // Tính khoảng cách tới ngực người chơi (cộng thêm 0.8 để hút về thân người)
        const targetPos = player.position.clone().add(new THREE.Vector3(0, 0.8, 0));
        const dist = this.position.distanceTo(targetPos);
        
        if (dist < 8.0) {
            // 1. Hiệu ứng từ trường hút vật phẩm về phía người chơi khi ở gần
            const direction = new THREE.Vector3().subVectors(targetPos, this.position).normalize();
            
            // Tốc độ hút nhanh dần khi càng gần sát
            const speed = dist < 1.2 ? 9.0 : 6.0;
            this.position.addScaledVector(direction, speed * dt);
            this.mesh.position.copy(this.position);
            
            // Kiểm tra khoảng cách hấp thụ (Nhặt thành công)
            if (dist < 0.8) {
                this.isCollected = true;
                this.collect(player);
                return;
            }
        } else {
            // 2. Vật lý rơi tự do và va chạm mặt đất
            this.velocity.y += -22 * dt; // Gia tốc trọng lực rơi
            this.velocity.y = Math.max(this.velocity.y, -30);
            
            this.position.addScaledVector(this.velocity, dt);
            
            // Định vị toạ độ cột kiểm tra va chạm
            const bx = Math.floor(this.position.x);
            const bz = Math.floor(this.position.z);
            const by = Math.floor(this.position.y);
            
            // Tìm cao độ mặt đất cứng bên dưới vật phẩm
            let groundY = 0;
            for (let y = Math.min(by + 1, 63); y >= 0; y--) {
                const block = this.world.getBlock(bx, y, bz);
                if (block !== 0 && block !== 5) {
                    groundY = y + 1;
                    break;
                }
            }
            
            const dropBottom = groundY + 0.12;
            if (this.position.y <= dropBottom) {
                this.position.y = dropBottom;
                this.velocity.set(0, 0, 0); // Dừng di chuyển vật lý
            }
            
            // Đồng bộ vị trí mesh và tạo hiệu ứng nhấp nhô xoay tròn sinh động
            this.mesh.position.copy(this.position);
            
            // Nếu đã nằm trên đất thì nhấp nhô nhẹ theo thời gian
            if (this.velocity.y === 0) {
                this.mesh.position.y += Math.sin(Date.now() * 0.005) * 0.04;
            }
            
            this.mesh.rotation.y += 1.6 * dt;
            this.mesh.rotation.x += 0.8 * dt;
        }
    }
    
    /**
     * Nhặt vật phẩm và thu gom tài nguyên
     */
    collect(player) {
        // Kích hoạt logic xếp đồ của người chơi
        player.addItem(this.blockId, 1);
        
        // Hủy đối tượng Mesh Three.js giải phóng bộ nhớ
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

// Bảng màu hex biểu tượng đại diện của các loại khối voxel
ItemDrop.blockColors = {
    1: 0x558b2f,  // Cỏ (Xanh lá)
    2: 0x865439,  // Đất (Nâu)
    3: 0x7f8c8d,  // Đá (Xám)
    4: 0x5c4033,  // Gỗ Sồi (Nâu sẫm)
    5: 0x1e4620,  // Lá cây (Xanh lục sẫm)
    6: 0xb33939,  // Gạch đỏ
    7: 0xdcdde1,  // Kính (Trắng trong)
    8: 0xf7d794,  // Cát (Vàng cát)
    9: 0x747d8c,  // Đá Cuội
    10: 0xd5a96c, // Ván Gỗ (Vàng cam sáng)
    11: 0x2c3e50, // Quặng Than (Xám đen)
    12: 0xe15f41, // Quặng Sắt (Đốm rỉ sét)
    13: 0xf5cd79, // Quặng Vàng (Vàng óng)
    14: 0x30cfd0, // Quặng Kim cương (Xanh ngọc sáng)
    15: 0xeb3b5a, // Len Đỏ
    16: 0x4b7bec, // Len Xanh
    17: 0xfed330, // Đá Phát Sáng (Vàng rực)
    18: 0x1e1b29  // Obsidian (Đen tím bóng)
};

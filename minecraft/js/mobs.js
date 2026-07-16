/**
 * Lớp điều khiển Quái vật Zombie 3D (AI di chuyển, Đuổi theo người chơi, Chiến đấu)
 * Phục vụ cho Chế độ Sinh tồn của game Minecraft.
 */

class Zombie {
    constructor(scene, world, position) {
        this.scene = scene;
        this.world = world;
        
        // Vị trí và vận tốc vật lý
        this.position = position.clone();
        this.velocity = new THREE.Vector3(0, 0, 0);
        
        // Thuộc tính chiến đấu
        this.hp = 20;
        this.maxHp = 20;
        this.speed = 1.8;
        this.damage = 2; // 1 tim máu
        this.isDead = false;
        
        // Thời gian chờ đánh tiếp theo (tấn công người chơi)
        this.attackCooldown = 0;
        this.attackDelay = 1.0; // giây
        
        // Các biến điều khiển AI lang thang
        this.wanderTimer = 0;
        this.wanderDirection = new THREE.Vector3(0, 0, 0);
        
        // Tạo mô hình 3D Zombie
        this.mesh = new THREE.Group();
        this.mesh.userData = { zombieInstance: this };
        this.buildModel();
        this.mesh.position.copy(this.position);
        this.scene.add(this.mesh);
    }

    /**
     * Dựng mô hình 3D hình hộp cho Zombie (đầu, thân, hai tay duỗi thẳng, hai chân)
     */
    buildModel() {
        // Tạo các vật liệu riêng lẻ cho mỗi con Zombie để đổi màu đỏ khi trúng đòn không ảnh hưởng nhau
        this.greenMat = new THREE.MeshLambertMaterial({ color: 0x558b2f }); // Da đầu và tay
        this.blueMat = new THREE.MeshLambertMaterial({ color: 0x3c6382 });  // Áo xanh lam
        this.darkMat = new THREE.MeshLambertMaterial({ color: 0x1e272e });  // Quần xanh sẫm

        // Kích thước các bộ phận (Tỉ lệ xấp xỉ người chơi Steve)
        // Đầu (Head)
        const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        this.head = new THREE.Mesh(headGeo, this.greenMat);
        this.head.position.set(0, 0.65, 0);
        this.head.castShadow = true;
        this.mesh.add(this.head);

        // Thân (Body)
        const bodyGeo = new THREE.BoxGeometry(0.5, 0.65, 0.25);
        this.body = new THREE.Mesh(bodyGeo, this.blueMat);
        this.body.position.set(0, 0.08, 0);
        this.body.castShadow = true;
        this.mesh.add(this.body);

        // Hai cánh tay (Arms) - Duỗi thẳng về phía trước
        // Tay trái (Left Arm)
        const armGeo = new THREE.BoxGeometry(0.16, 0.5, 0.16);
        
        this.leftArmPivot = new THREE.Group();
        this.leftArmPivot.position.set(-0.33, 0.35, 0);
        this.leftArm = new THREE.Mesh(armGeo, this.greenMat);
        this.leftArm.position.set(0, -0.22, 0); // Đẩy tâm hình hộp xuống dưới khớp vai
        this.leftArm.castShadow = true;
        this.leftArmPivot.add(this.leftArm);
        this.leftArmPivot.rotation.x = -Math.PI / 2; // Giơ thẳng cánh tay ra trước
        this.mesh.add(this.leftArmPivot);

        // Tay phải (Right Arm)
        this.rightArmPivot = new THREE.Group();
        this.rightArmPivot.position.set(0.33, 0.35, 0);
        this.rightArm = new THREE.Mesh(armGeo, this.greenMat);
        this.rightArm.position.set(0, -0.22, 0);
        this.rightArm.castShadow = true;
        this.rightArmPivot.add(this.rightArm);
        this.rightArmPivot.rotation.x = -Math.PI / 2; // Giơ thẳng cánh tay ra trước
        this.mesh.add(this.rightArmPivot);

        // Hai chân (Legs)
        // Chân trái (Left Leg)
        const legGeo = new THREE.BoxGeometry(0.18, 0.5, 0.18);
        
        this.leftLegPivot = new THREE.Group();
        this.leftLegPivot.position.set(-0.12, -0.25, 0);
        this.leftLeg = new THREE.Mesh(legGeo, this.darkMat);
        this.leftLeg.position.set(0, -0.22, 0); // Khớp hông nằm trên cùng
        this.leftLeg.castShadow = true;
        this.leftLegPivot.add(this.leftLeg);
        this.mesh.add(this.leftLegPivot);

        // Chân phải (Right Leg)
        this.rightLegPivot = new THREE.Group();
        this.rightLegPivot.position.set(0.12, -0.25, 0);
        this.rightLeg = new THREE.Mesh(legGeo, this.darkMat);
        this.rightLeg.position.set(0, -0.22, 0);
        this.rightLeg.castShadow = true;
        this.rightLegPivot.add(this.rightLeg);
        this.mesh.add(this.rightLegPivot);

        // Dịch chuyển mô hình để tâm gốc Y = 0 nằm dưới đáy chân Zombie
        // Zombie cao tổng cộng: 0.5 (Chân) + 0.65 (Thân) + 0.5 (Đầu/2) = 1.4 m
        this.head.position.y += 0.5;
        this.body.position.y += 0.5;
        this.leftArmPivot.position.y += 0.5;
        this.rightArmPivot.position.y += 0.5;
        this.leftLegPivot.position.y += 0.5;
        this.rightLegPivot.position.y += 0.5;
    }

    /**
     * Cập nhật AI di chuyển, Trọng lực và Va chạm địa hình
     */
    update(player, dt) {
        if (this.isDead) return;

        // Giảm thời gian chờ đánh
        if (this.attackCooldown > 0) this.attackCooldown -= dt;

        // 1. Áp dụng trọng lực
        this.velocity.y += -25 * dt;
        this.velocity.y = Math.max(this.velocity.y, -30); // Giới hạn rơi tối đa

        // Tính khoảng cách tới người chơi
        const dist = this.position.distanceTo(player.position);
        
        // Hướng đi mong muốn
        const moveDir = new THREE.Vector3();

        if (dist < 16 && !player.flightMode && player.hp > 0) {
            // A. Đuổi theo người chơi (Survival Mode và đang sống)
            const dx = player.position.x - this.position.x;
            const dz = player.position.z - this.position.z;
            
            // Xoay mặt về hướng người chơi
            this.mesh.rotation.y = Math.atan2(dx, dz);
            
            moveDir.set(dx, 0, dz).normalize();
            
            // Nếu cực kỳ gần sát -> Tấn công người chơi
            if (dist < 1.3) {
                this.attackPlayer(player);
            }
        } else {
            // B. Đi lang thang ngẫu nhiên (Wander AI)
            this.wanderTimer -= dt;
            if (this.wanderTimer <= 0) {
                // Chọn một hướng mới ngẫu nhiên hoặc đứng yên
                this.wanderTimer = 3 + Math.random() * 4;
                if (Math.random() > 0.3) {
                    const angle = Math.random() * Math.PI * 2;
                    this.wanderDirection.set(Math.sin(angle), 0, Math.cos(angle)).normalize();
                    // Xoay mặt về hướng đi
                    this.mesh.rotation.y = angle;
                } else {
                    this.wanderDirection.set(0, 0, 0);
                }
            }
            moveDir.copy(this.wanderDirection);
        }

        // Tốc độ ngang mục tiêu
        const currentSpeed = (moveDir.length() > 0) ? this.speed : 0;
        this.velocity.x += (moveDir.x * currentSpeed - this.velocity.x) * 8 * dt;
        this.velocity.z += (moveDir.z * currentSpeed - this.velocity.z) * 8 * dt;

        // 2. Di chuyển theo X
        this.position.x += this.velocity.x * dt;
        
        // 3. Di chuyển theo Z
        this.position.z += this.velocity.z * dt;

        // 4. Di chuyển theo Y
        this.position.y += this.velocity.y * dt;

        // 5. Giải quyết va chạm voxel đơn giản & Nhảy vượt chướng ngại vật
        const bx = Math.floor(this.position.x);
        const bz = Math.floor(this.position.z);
        const by = Math.floor(this.position.y);

        // Lấy độ cao khối nền đất bên dưới Zombie
        // Vì Zombie cao khoảng 1.4m, ta quét tìm khối đất
        const currentGround = this.getGroundHeight(bx, by, bz);

        if (this.position.y <= currentGround) {
            // Tiếp đất thành công
            this.position.y = currentGround;
            this.velocity.y = 0;
        }

        // Kiểm tra xem có khối cản cứng ngay trước mặt (độ cao bằng hông Zombie) không
        const lookAheadX = this.position.x + Math.sin(this.mesh.rotation.y) * 0.45;
        const lookAheadZ = this.position.z + Math.cos(this.mesh.rotation.y) * 0.45;
        const abx = Math.floor(lookAheadX);
        const abz = Math.floor(lookAheadZ);
        const aby = Math.floor(this.position.y + 0.5); // Quét tầm hông

        const frontBlock = this.world.getBlock(abx, aby, abz);
        const frontBlockAbove = this.world.getBlock(abx, aby + 1, abz);
        
        // Nếu trước mặt có khối và phía trên khối đó trống -> Nhảy nhảy vượt rào!
        if (frontBlock !== 0 && frontBlock !== 5 && frontBlockAbove === 0 && this.position.y <= currentGround + 0.1) {
            this.velocity.y = 8.5; // Lực nhảy Zombie
        }

        // Đồng bộ vị trí mesh Three.js với vị trí logic
        this.mesh.position.copy(this.position);

        // 6. Tạo hoạt họa bước đi (Đung đưa hai chân)
        const speedSq = this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z;
        if (speedSq > 0.05) {
            const cycle = Date.now() * 0.007;
            this.leftLegPivot.rotation.x = Math.sin(cycle) * 0.55;
            this.rightLegPivot.rotation.x = -Math.sin(cycle) * 0.55;
        } else {
            this.leftLegPivot.rotation.x = 0;
            this.rightLegPivot.rotation.x = 0;
        }

        // Nếu rơi xuống hố sâu vô tận (Void) -> Tự chết
        if (this.position.y < -10) {
            this.die();
        }
    }

    /**
     * Tìm độ cao mặt đất vững chắc tại toạ độ cột (x, z) xung quanh cao độ y
     */
    getGroundHeight(bx, by, bz) {
        for (let y = Math.min(by + 2, 63); y >= 0; y--) {
            const block = this.world.getBlock(bx, y, bz);
            // Khối 0 (Không khí) và 5 (Lá cây) không đỡ được chân
            if (block !== 0 && block !== 5) {
                return y + 1; // Mặt trên của khối vững chãi
            }
        }
        return 0;
    }

    /**
     * Tấn công người chơi gây sát thương mất tim và đẩy lùi (Knockback)
     */
    attackPlayer(player) {
        if (this.attackCooldown > 0 || player.hp <= 0) return;
        
        this.attackCooldown = this.attackDelay;

        // Vung tay nhẹ khi tấn công
        this.leftArmPivot.rotation.x = -Math.PI / 1.4;
        setTimeout(() => {
            if (!this.isDead) this.leftArmPivot.rotation.x = -Math.PI / 2;
        }, 150);

        // Gọi hàm gây sát thương của người chơi
        player.takeDamage(this.damage, this.position);
    }

    /**
     * Nhận sát thương khi người chơi đánh trúng
     */
    takeDamage(amount, playerPos) {
        if (this.isDead) return false;
        
        this.hp -= amount;

        // Hiệu ứng nhấp nháy đỏ chớp nhoáng (Hurt Flash)
        this.flashRed();

        // Lực đẩy lùi Zombie ra xa người chơi (Knockback)
        const kbDir = new THREE.Vector3().subVectors(this.position, playerPos);
        kbDir.y = 0;
        kbDir.normalize();
        
        this.velocity.x = kbDir.x * 6.5;
        this.velocity.z = kbDir.z * 6.5;
        this.velocity.y = 4.5; // Nẩy lên nhẹ

        // Kiểm tra xem chết chưa
        if (this.hp <= 0) {
            this.die();
            return true; // Đã chết
        }
        return false;
    }

    /**
     * Đổi tạm thời màu của tất cả bộ phận sang đỏ tươi trong 180ms
     */
    flashRed() {
        const redColor = new THREE.Color(0xff3333);
        this.head.material.color = redColor;
        this.body.material.color = redColor;
        this.leftArm.material.color = redColor;
        this.rightArm.material.color = redColor;
        this.leftLeg.material.color = redColor;
        this.rightLeg.material.color = redColor;

        setTimeout(() => {
            if (this.isDead) return;
            // Khôi phục lại các màu nguyên bản
            this.head.material.color.setHex(0x558b2f);
            this.body.material.color.setHex(0x3c6382);
            this.leftArm.material.color.setHex(0x558b2f);
            this.rightArm.material.color.setHex(0x558b2f);
            this.leftLeg.material.color.setHex(0x1e272e);
            this.rightLeg.material.color.setHex(0x1e272e);
        }, 180);
    }

    /**
     * Xử lý cái chết của Zombie
     */
    die() {
        if (this.isDead) return;
        this.isDead = true;
        
        // Tạo các hạt bụi khói biến mất (Particle effect)
        this.createDeathParticles();

        // Xóa mô hình ra khỏi scene
        this.scene.remove(this.mesh);
    }

    /**
     * Tạo một vài khối hộp nhỏ li ti giả bụi khói tan rã
     */
    createDeathParticles() {
        const particleCount = 10;
        const geometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);
        const material = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.8 });

        for (let i = 0; i < particleCount; i++) {
            const p = new THREE.Mesh(geometry, material);
            p.position.copy(this.position).add(new THREE.Vector3(
                (Math.random() - 0.5) * 0.5,
                Math.random() * 1.0,
                (Math.random() - 0.5) * 0.5
            ));
            this.scene.add(p);

            // Cho các hạt bay tản mát ra
            const pVel = new THREE.Vector3(
                (Math.random() - 0.5) * 3,
                Math.random() * 3 + 2,
                (Math.random() - 0.5) * 3
            );

            const pClock = new THREE.Clock();
            const pInterval = setInterval(() => {
                const pDt = pClock.getDelta() || 0.016;
                p.position.addScaledVector(pVel, pDt);
                pVel.y -= 9.8 * pDt; // Có trọng lực rơi nhẹ
                
                p.scale.multiplyScalar(0.92); // Nhỏ dần
                if (p.scale.x < 0.1) {
                    clearInterval(pInterval);
                    this.scene.remove(p);
                    p.geometry.dispose();
                    p.material.dispose();
                }
            }, 30);
        }
    }
}

/**
 * Trình quản lý danh sách quái vật Zombie bao gồm tự động sinh quái vật
 */
class MobManager {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.mobs = [];
        this.maxZombies = 5; // Duy trì tối đa 5 zombie
        this.spawnTimer = 0;
        this.spawnInterval = 8.0; // Thử sinh quái mỗi 8 giây
    }

    /**
     * Cập nhật toàn bộ quái vật và dọn dẹp quái chết hoặc quá xa
     */
    update(player, dt) {
        // Cập nhật từng con Zombie
        for (let i = this.mobs.length - 1; i >= 0; i--) {
            const mob = this.mobs[i];
            
            // Xoá nếu Zombie bị chết
            if (mob.isDead) {
                this.mobs.splice(i, 1);
                continue;
            }

            // Despawn nếu người chơi đi quá xa Zombie (> 50 khối)
            const dist = mob.position.distanceTo(player.position);
            if (dist > 50) {
                mob.die();
                this.mobs.splice(i, 1);
                continue;
            }

            mob.update(player, dt);
        }

        // Tự động sinh quái vật ngẫu nhiên quanh người chơi
        this.spawnTimer += dt;
        if (this.spawnTimer >= this.spawnInterval) {
            this.spawnTimer = 0;
            
            // Chỉ sinh quái nếu chưa đủ số lượng tối đa và người chơi đang sống
            if (this.mobs.length < this.maxZombies && player.hp > 0) {
                this.spawnRandomZombie(player);
            }
        }
    }

    /**
     * Sinh quái ở vị trí ngẫu nhiên cách người chơi khoảng 15 đến 30 khối
     */
    spawnRandomZombie(player) {
        // Chọn góc ngẫu nhiên và khoảng cách
        const angle = Math.random() * Math.PI * 2;
        const dist = 16 + Math.random() * 14;
        
        const sx = Math.floor(player.position.x + Math.sin(angle) * dist);
        const sz = Math.floor(player.position.z + Math.cos(angle) * dist);
        
        // Quét lấy độ cao bề mặt đất
        let sy = 0;
        for (let y = 63; y >= 0; y--) {
            const block = this.world.getBlock(sx, y, sz);
            if (block !== 0 && block !== 5) {
                sy = y + 1;
                break;
            }
        }
        
        if (sy > 0) {
            const pos = new THREE.Vector3(sx + 0.5, sy + 0.5, sz + 0.5);
            const zombie = new Zombie(this.scene, this.world, pos);
            this.mobs.push(zombie);
        }
    }

    /**
     * Dọn dẹp xoá toàn bộ quái vật khỏi scene (ví dụ khi hồi sinh/đổi chế độ)
     */
    clearAll() {
        for (const mob of this.mobs) {
            mob.isDead = true;
            this.scene.remove(mob.mesh);
        }
        this.mobs = [];
    }
}

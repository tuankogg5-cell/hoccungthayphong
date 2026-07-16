/**
 * Quản lý Camera, Phím di chuyển (WASD, Space, Shift, F), PointerLock điều khiển chuột,
 * và cập nhật góc nhìn của người chơi (Hỗ trợ cảm ứng di động).
 */
class Player {
    constructor(camera, canvas) {
        this.camera = camera;
        this.canvas = canvas;
        
        // Thiết lập thứ tự xoay camera để không bị nghiêng lệch đầu khi quay ngang dọc
        this.camera.rotation.order = 'YXZ';
        
        // Hộp bao vật lý của người chơi (Kích thước chuẩn Steve trong Minecraft: 0.6x1.8x0.6)
        this.width = 0.6;
        this.height = 1.8;
        this.depth = 0.6;
        this.eyeHeight = 1.6; // Chiều cao mắt (Camera) so với chân người chơi
        
        // Vị trí người chơi trong thế giới (Khởi tạo tạm thời, sẽ được đặt lại trên đỉnh địa hình)
        this.position = new THREE.Vector3(0, 45, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        
        // Trạng thái vật lý
        this.onGround = false;
        this.flightMode = false;
        
        // Tốc độ di chuyển
        this.walkSpeed = 5.0;
        this.flightSpeed = 12.0;
        this.jumpForce = 11.0;
        
        // Trạng thái các phím nhấn
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            up: false,
            down: false
        };

        // Phát hiện thiết bị cảm ứng di động
        this.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        
        // Khởi tạo trạng thái vuốt màn hình xoay camera
        this.touchLookActive = false;
        this.touchPrevPos = new THREE.Vector2();
        
        // Khởi tạo bộ điều khiển Joystick ảo
        this.joystickActive = false;
        this.joystickVector = new THREE.Vector2(0, 0);
        this.joystickCenter = new THREE.Vector2(0, 0);
        this.maxJoystickRadius = 45; // Bán kính kéo căng tối đa của cần gạt

        // Khởi tạo bộ điều khiển PointerLock (chỉ dùng cho PC)
        this.controls = new THREE.PointerLockControls(this.camera, this.canvas);
        
        // Chế độ chơi & Lượng máu HP (Survival & Creative)
        this.maxHp = 20; // 10 tim máu
        this.hp = 20;
        this.gameMode = 'creative'; // 'creative' hoặc 'survival'
        this.lastYVelocity = 0;     // Để tính toán sát thương rơi
        this.invulnerableTimer = 0; // Thời gian bất tử sau khi dính đòn

        // Kho đồ & dụng cụ
        this.inventory = {};
        this.initInventory();

        this.setupInput();
    }

    /**
     * Lắng nghe sự kiện phím bấm (PC) và sự kiện cảm ứng chạm (Mobile)
     */
    setupInput() {
        // 1. Phím PC
        const onKeyDown = (event) => {
            switch (event.code) {
                case 'KeyW':
                case 'ArrowUp':
                    this.keys.forward = true;
                    break;
                case 'KeyS':
                case 'ArrowDown':
                    this.keys.backward = true;
                    break;
                case 'KeyA':
                case 'ArrowLeft':
                    this.keys.left = true;
                    break;
                case 'KeyD':
                case 'ArrowRight':
                    this.keys.right = true;
                    break;
                case 'Space':
                    this.keys.up = true;
                    break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    this.keys.down = true;
                    break;
                case 'KeyF':
                    // Nhấn F để bật/tắt chế độ bay
                    this.flightMode = !this.flightMode;
                    this.velocity.set(0, 0, 0); // Reset tốc độ khi đổi chế độ
                    this.showSystemMessage(this.flightMode ? "Đã BẬT chế độ bay (Creative)" : "Đã TẮT chế độ bay (Survival)");
                    break;
            }
        };

        const onKeyUp = (event) => {
            switch (event.code) {
                case 'KeyW':
                case 'ArrowUp':
                    this.keys.forward = false;
                    break;
                case 'KeyS':
                case 'ArrowDown':
                    this.keys.backward = false;
                    break;
                case 'KeyA':
                case 'ArrowLeft':
                    this.keys.left = false;
                    break;
                case 'KeyD':
                case 'ArrowRight':
                    this.keys.right = false;
                    break;
                case 'Space':
                    this.keys.up = false;
                    break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    this.keys.down = false;
                    break;
            }
        };

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);

        // 2. Chạm cảm ứng Mobile
        if (this.isTouchDevice) {
            this.setupTouchInput();
        }
    }

    /**
     * Lập trình thu thập sự kiện Joystick và chạm xoay camera trên di động
     */
    setupTouchInput() {
        // ID ngón tay cảm ứng cho camera xoay nhìn và joystick di chuyển
        this.activeLookTouchId = null;
        this.activeJoystickTouchId = null;

        // A. Xoay góc nhìn camera (Hỗ trợ Đa điểm - Multi-touch)
        window.addEventListener('touchstart', (event) => {
            for (let i = 0; i < event.changedTouches.length; i++) {
                const touch = event.changedTouches[i];
                const target = touch.target;
                
                // Bỏ qua các sự kiện chạm vào UI điều khiển hoặc Menu
                if (target.closest('#joystickZone') || 
                    target.closest('#mobileActionButtons') || 
                    target.closest('#hud') || 
                    target.closest('.modal') || 
                    target.closest('.overlay-screen') ||
                    target.closest('#mobilePauseBtn')) {
                    continue;
                }
                
                // Nếu chưa gán ngón tay nào xoay camera thì nhận chạm này
                if (this.activeLookTouchId === null) {
                    this.activeLookTouchId = touch.identifier;
                    this.touchLookActive = true;
                    this.touchPrevPos.set(touch.clientX, touch.clientY);
                    break;
                }
            }
        }, { passive: true });

        window.addEventListener('touchmove', (event) => {
            if (!this.touchLookActive || this.activeLookTouchId === null) return;
            
            // Tìm ngón tay vuốt xoay camera tương ứng
            let lookTouch = null;
            for (let i = 0; i < event.touches.length; i++) {
                if (event.touches[i].identifier === this.activeLookTouchId) {
                    lookTouch = event.touches[i];
                    break;
                }
            }
            
            if (lookTouch) {
                const deltaX = lookTouch.clientX - this.touchPrevPos.x;
                const deltaY = lookTouch.clientY - this.touchPrevPos.y;
                
                // Xoay camera (Độ nhạy 0.0055)
                const sensitivity = 0.0055;
                this.camera.rotation.y -= deltaX * sensitivity;
                this.camera.rotation.x -= deltaY * sensitivity;
                
                // Giới hạn góc ngước đầu tránh lật ngửa camera
                const maxPitch = Math.PI / 2 - 0.05;
                this.camera.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, this.camera.rotation.x));
                
                this.touchPrevPos.set(lookTouch.clientX, lookTouch.clientY);
            }
        }, { passive: true });

        const endLookTouch = (event) => {
            if (this.activeLookTouchId === null) return;
            
            for (let i = 0; i < event.changedTouches.length; i++) {
                if (event.changedTouches[i].identifier === this.activeLookTouchId) {
                    this.touchLookActive = false;
                    this.activeLookTouchId = null;
                    break;
                }
            }
        };

        window.addEventListener('touchend', endLookTouch, { passive: true });
        window.addEventListener('touchcancel', endLookTouch, { passive: true });

        // B. Nút Nhảy ảo trên di động
        const jumpBtn = document.getElementById('mobileJumpBtn');
        if (jumpBtn) {
            jumpBtn.addEventListener('touchstart', (event) => {
                event.preventDefault();
                this.keys.up = true;
            });
            jumpBtn.addEventListener('touchend', (event) => {
                event.preventDefault();
                this.keys.up = false;
            });
        }

        // C. Cần gạt di chuyển Joystick ảo
        const joystickZone = document.getElementById('joystickZone');
        const joystickContainer = document.getElementById('joystickContainer');
        const joystickHandle = document.getElementById('joystickHandle');
        const mobileControls = document.getElementById('mobileControls');

        if (joystickZone && joystickContainer && joystickHandle && mobileControls) {
            mobileControls.classList.remove('hidden');

            const calculateCenter = () => {
                const rect = joystickContainer.getBoundingClientRect();
                this.joystickCenter.set(rect.left + rect.width / 2, rect.top + rect.height / 2);
            };

            joystickZone.addEventListener('touchstart', (event) => {
                calculateCenter();
                const touch = event.changedTouches[0];
                this.activeJoystickTouchId = touch.identifier;
                this.joystickActive = true;
                this.updateJoystickPosition(touch.clientX, touch.clientY, joystickHandle);
            }, { passive: true });

            joystickZone.addEventListener('touchmove', (event) => {
                if (!this.joystickActive || this.activeJoystickTouchId === null) return;
                
                let joyTouch = null;
                for (let i = 0; i < event.touches.length; i++) {
                    if (event.touches[i].identifier === this.activeJoystickTouchId) {
                        joyTouch = event.touches[i];
                        break;
                    }
                }
                
                if (joyTouch) {
                    this.updateJoystickPosition(joyTouch.clientX, joyTouch.clientY, joystickHandle);
                }
            }, { passive: true });

            const resetJoystick = (event) => {
                if (this.activeJoystickTouchId === null) return;
                
                for (let i = 0; i < event.changedTouches.length; i++) {
                    if (event.changedTouches[i].identifier === this.activeJoystickTouchId) {
                        this.joystickActive = false;
                        this.activeJoystickTouchId = null;
                        this.joystickVector.set(0, 0);
                        joystickHandle.style.transform = 'translate(0px, 0px)';
                        break;
                    }
                }
            };

            joystickZone.addEventListener('touchend', resetJoystick, { passive: true });
            joystickZone.addEventListener('touchcancel', resetJoystick, { passive: true });
        }
    }

    /**
     * Tính toán di dời chấm handle joystick và vector lực kéo
     */
    updateJoystickPosition(clientX, clientY, handleEl) {
        let dx = clientX - this.joystickCenter.x;
        let dy = clientY - this.joystickCenter.y;
        
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Khóa handle không vượt quá bán kính vòng ngoài
        if (distance > this.maxJoystickRadius) {
            dx = (dx / distance) * this.maxJoystickRadius;
            dy = (dy / distance) * this.maxJoystickRadius;
        }
        
        handleEl.style.transform = `translate(${dx}px, ${dy}px)`;
        
        // Trục Y màn hình hướng xuống dưới nên ta đổi dấu lực kéo Y để tiến lên
        this.joystickVector.set(dx / this.maxJoystickRadius, -dy / this.maxJoystickRadius);
    }

    /**
     * Cập nhật lực và vận tốc di chuyển trước khi nạp vào hệ thống vật lý va chạm
     */
    updateInput() {
        // Chỉ cập nhật khi khóa chuột (PC) HOẶC khi đang chơi trên thiết bị di động
        if (!this.controls.isLocked && !this.isTouchDevice) return;

        // Lấy hướng nhìn ngang của camera (chiếu lên mặt phẳng XZ để đi bộ không bị bay lên trời)
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        right.y = 0;
        right.normalize();

        // Vector hướng di chuyển mong muốn
        const moveDir = new THREE.Vector3();

        if (this.isTouchDevice && this.joystickActive) {
            // DI ĐỘNG: Di chuyển theo hướng nghiêng của Joystick
            moveDir.addScaledVector(forward, this.joystickVector.y);
            moveDir.addScaledVector(right, this.joystickVector.x);
            moveDir.normalize();
        } else {
            // MÁY TÍNH: Di chuyển theo WASD
            if (this.keys.forward) moveDir.add(forward);
            if (this.keys.backward) moveDir.sub(forward);
            if (this.keys.right) moveDir.add(right);
            if (this.keys.left) moveDir.sub(right);
            moveDir.normalize();
        }

        const currentSpeed = this.flightMode ? this.flightSpeed : this.walkSpeed;

        if (this.flightMode) {
            // Chế độ bay: Di chuyển tự do theo các phím
            this.velocity.x = moveDir.x * currentSpeed;
            this.velocity.z = moveDir.z * currentSpeed;
            
            this.velocity.y = 0;
            if (this.keys.up) this.velocity.y = currentSpeed;
            if (this.keys.down) this.velocity.y = -currentSpeed;
        } else {
            // Chế độ đi bộ: Chỉ đặt vận tốc ngang
            this.velocity.x = moveDir.x * currentSpeed;
            this.velocity.z = moveDir.z * currentSpeed;
            
            // Xử lý nhảy (Lực tác dụng tức thì một lần khi chạm đất)
            if (this.keys.up && this.onGround) {
                this.velocity.y = this.jumpForce;
                this.onGround = false;
            }
        }
    }

    /**
     * Ghép góc nhìn camera theo sát vị trí đầu của người chơi
     */
    updateCameraPosition() {
        this.camera.position.copy(this.position);
        this.camera.position.y += this.eyeHeight;
    }

    /**
     * Hiện thông báo nhỏ góc màn hình cho người chơi
     */
    showSystemMessage(text) {
        const blockNameDiv = document.getElementById('block-name');
        if (blockNameDiv) {
            blockNameDiv.textContent = text;
            blockNameDiv.classList.add('show');
            
            // Tự tắt sau 2 giây
            if (this.msgTimeout) clearTimeout(this.msgTimeout);
            this.msgTimeout = setTimeout(() => {
                blockNameDiv.classList.remove('show');
            }, 2000);
        }
    }

    /**
     * Cập nhật sau khi di chuyển vật lý xong (Sát thương rơi, Rơi xuống Void, Cập nhật Máu)
     */
    postPhysicsUpdate(dt) {
        // Giảm thời gian bất tử sau dính đòn
        if (this.invulnerableTimer > 0) {
            this.invulnerableTimer -= dt;
        }

        if (this.gameMode === 'survival') {
            // Rơi xuống hố sâu hư vô (Void) -> Mất máu liên tục và chết
            if (this.position.y < -15 && this.hp > 0) {
                this.takeDamage(4, new THREE.Vector3(this.position.x, -25, this.position.z));
            }

            // TÍNH TOÁN SÁT THƯƠNG RƠI
            if (!this.flightMode) {
                // Nếu tiếp đất ở khung hình này
                if (this.onGround) {
                    // Nếu vận tốc rơi ở khung hình trước lớn hơn giới hạn an toàn (-15.5 m/s)
                    if (this.lastYVelocity < -16.5) {
                        const fallVelocity = Math.abs(this.lastYVelocity);
                        // Tính sát thương dựa trên vận tốc đập xuống đất
                        const damage = Math.floor((fallVelocity - 16.5) * 0.7) + 1;
                        
                        this.takeDamage(damage, this.position.clone().add(new THREE.Vector3(0, -1, 0)));
                        this.showSystemMessage(`Ouch! Bạn bị ngã mất ${damage} máu!`);
                    }
                }
            }

            // Đồng bộ vẽ tim máu
            this.updateHealthHUD();
        }

        // Lưu vận tốc trục Y để tính sát thương rơi cho khung hình tiếp theo
        this.lastYVelocity = this.velocity.y;
    }

    /**
     * Nhận sát thương và thực hiện lực đẩy lùi (Knockback)
     */
    takeDamage(amount, sourcePos) {
        if (this.gameMode === 'creative' || this.hp <= 0) return;
        if (this.invulnerableTimer > 0) return; // Đang bất tử tạm thời

        this.hp = Math.max(0, this.hp - amount);
        this.invulnerableTimer = 0.8; // Bất tử trong 0.8 giây tiếp theo

        // Chớp nhấp nháy màn hình đỏ (Damage Flash)
        const flashDiv = document.getElementById('damageFlash');
        if (flashDiv) {
            flashDiv.style.backgroundColor = 'rgba(255, 0, 0, 0.45)';
            setTimeout(() => {
                flashDiv.style.backgroundColor = 'rgba(255, 0, 0, 0)';
            }, 150);
        }

        // Lực đẩy lùi (Knockback) hướng ra xa nguồn sát thương
        if (sourcePos) {
            const kbDir = new THREE.Vector3().subVectors(this.position, sourcePos);
            kbDir.y = 0; // Chỉ đẩy lùi trục ngang
            kbDir.normalize();

            // Đẩy ngang và nẩy dọc nhẹ lên
            this.velocity.x = kbDir.x * 7.5;
            this.velocity.z = kbDir.z * 7.5;
            if (this.onGround) {
                this.velocity.y = 5.5;
                this.onGround = false;
            } else {
                this.velocity.y = 4.5;
            }
        }

        this.updateHealthHUD();

        // Kiểm tra cái chết
        if (this.hp <= 0) {
            this.die();
        }
    }

    /**
     * Người chơi bị hạ gục
     */
    die() {
        this.hp = 0;
        this.velocity.set(0, 0, 0);

        // Hiện màn hình chết You Died
        const deathScreen = document.getElementById('deathScreen');
        if (deathScreen) deathScreen.classList.remove('hidden');

        // Ẩn nút pause di động
        const pauseBtn = document.getElementById('mobilePauseBtn');
        if (pauseBtn) pauseBtn.classList.remove('show-btn');

        // Thoát khóa chuột trên PC
        this.controls.unlock();
    }

    /**
     * Hồi sinh tại điểm chỉ định
     */
    respawn(spawnPoint) {
        this.hp = this.maxHp;
        this.position.copy(spawnPoint);
        this.velocity.set(0, 0, 0);
        this.lastYVelocity = 0;
        this.invulnerableTimer = 0;

        // Ẩn màn hình chết
        const deathScreen = document.getElementById('deathScreen');
        if (deathScreen) deathScreen.classList.add('hidden');

        this.updateHealthHUD();
        this.updateCameraPosition();
    }

    /**
     * Khởi tạo túi đồ rỗng (Chế độ Sinh tồn) hoặc đầy (Chế độ Sáng tạo)
     */
    initInventory() {
        this.inventory = {};
        // 18 loại khối voxel
        for (let i = 1; i <= 18; i++) {
            this.inventory[i] = 0;
        }
        // Các nguyên liệu / dụng cụ phụ trợ
        this.inventory['stick'] = 0;
        this.inventory['stone_sword'] = 0;
        this.inventory['stone_pickaxe'] = 0;
    }

    /**
     * Thêm vật phẩm vào kho đồ (và tự động xếp vào slot Hotbar trống theo thứ tự)
     */
    addItem(itemId, amount = 1) {
        if (!this.inventory[itemId] && this.inventory[itemId] !== 0) {
            this.inventory[itemId] = 0;
        }
        this.inventory[itemId] += amount;
        
        // Hiện thông báo hệ thống nhặt được vật phẩm
        const ItemNames = TextureGenerator.blockNames;
        const name = ItemNames[itemId] || itemId;
        this.showSystemMessage(`+${amount} ${name}`);

        // Chế độ Sinh tồn: Tự động xếp vật phẩm vào Hotbar theo thứ tự từ trái qua phải
        if (this.gameMode === 'survival' && window.gameInstance) {
            const hotbar = window.gameInstance.hotbarBlocks;
            
            // 1. Kiểm tra xem vật phẩm này đã có ô nào sở hữu chưa
            let existsInHotbar = false;
            for (let i = 0; i < 9; i++) {
                if (hotbar[i] === itemId) {
                    existsInHotbar = true;
                    break;
                }
            }
            
            // 2. Nếu là vật phẩm mới hoàn toàn -> Tìm ô trống đầu tiên (null/undefined) để chèn vào
            if (!existsInHotbar) {
                for (let i = 0; i < 9; i++) {
                    if (hotbar[i] === null || hotbar[i] === undefined || hotbar[i] === '') {
                        hotbar[i] = itemId;
                        break;
                    }
                }
            }
        }

        // Cập nhật giao diện Hotbar
        if (window.gameInstance) {
            window.gameInstance.updateHotbarHUD();
        }
    }

    /**
     * Bớt vật phẩm khỏi kho đồ (và dọn trống slot Hotbar nếu hết tài nguyên)
     */
    removeItem(itemId, amount = 1) {
        if (!this.inventory[itemId]) return;
        this.inventory[itemId] = Math.max(0, this.inventory[itemId] - amount);
        
        // Nếu số lượng về 0 -> giải phóng ô Hotbar tương ứng về null (trống trong suốt)
        if (this.gameMode === 'survival' && this.inventory[itemId] === 0 && window.gameInstance) {
            const hotbar = window.gameInstance.hotbarBlocks;
            for (let i = 0; i < 9; i++) {
                if (hotbar[i] === itemId) {
                    hotbar[i] = null;
                    break;
                }
            }
        }

        if (window.gameInstance) {
            window.gameInstance.updateHotbarHUD();
        }
    }

    /**
     * Kiểm tra xem túi đồ có đủ nguyên liệu chế tạo không
     */
    hasIngredients(requires) {
        for (const [itemId, qty] of Object.entries(requires)) {
            const currentQty = this.inventory[itemId] || 0;
            if (currentQty < qty) return false;
        }
        return true;
    }

    /**
     * Thực hiện chế tạo vật phẩm
     */
    craftItem(recipe) {
        if (!this.hasIngredients(recipe.requires)) {
            this.showSystemMessage("Không đủ nguyên liệu chế tạo!");
            return false;
        }

        // Trừ nguyên liệu tiêu hao
        for (const [itemId, qty] of Object.entries(recipe.requires)) {
            this.removeItem(itemId, qty);
        }

        // Cộng sản phẩm nhận được (addItem sẽ tự xếp vào Hotbar)
        for (const [itemId, qty] of Object.entries(recipe.gives)) {
            this.addItem(itemId, qty);
        }

        this.showSystemMessage(`Đã chế tạo thành công: ${recipe.name}`);
        return true;
    }

    /**
     * Chuyển đổi chế độ chơi
     */
    setGameMode(mode) {
        this.gameMode = mode;
        if (mode === 'survival') {
            this.flightMode = false;
            this.hp = this.maxHp;
            this.initInventory(); // Bắt đầu Sinh tồn với 0 block đúng yêu cầu
            
            if (window.gameInstance) {
                // Sinh tồn: Khởi đầu với 9 ô Hotbar trống trơn màu trắng trong suốt
                window.gameInstance.hotbarBlocks = [null, null, null, null, null, null, null, null, null];
            }
        } else {
            this.hp = this.maxHp; // Sáng tạo bất tử
            
            if (window.gameInstance) {
                // Sáng tạo: trang bị sẵn các block cơ bản vào Hotbar
                window.gameInstance.hotbarBlocks = [1, 2, 3, 4, 10, 9, 7, 'stone_sword', 'stone_pickaxe'];
            }
        }
        this.updateHealthHUD();
        if (window.gameInstance) {
            window.gameInstance.updateHotbarHUD();
        }
    }

    /**
     * Cập nhật giao diện 10 quả tim đỏ HUD
     */
    updateHealthHUD() {
        const healthBar = document.getElementById('healthBar');
        if (!healthBar) return;

        if (this.gameMode !== 'survival') {
            healthBar.classList.add('hidden');
            return;
        }

        healthBar.classList.remove('hidden');
        healthBar.innerHTML = ''; // Clear cũ

        const fullHearts = Math.floor(this.hp / 2);
        const hasHalfHeart = (this.hp % 2 === 1);

        for (let i = 0; i < 10; i++) {
            const heart = document.createElement('span');
            heart.className = 'heart-icon';

            if (i < fullHearts) {
                heart.innerHTML = '❤️'; // Quả tim đầy đỏ
            } else if (i === fullHearts && hasHalfHeart) {
                heart.innerHTML = '💔'; // Tim vỡ (nửa tim)
            } else {
                heart.innerHTML = '🖤'; // Tim đen (mất)
                heart.className += ' lost';
            }

            healthBar.appendChild(heart);
        }
    }
}

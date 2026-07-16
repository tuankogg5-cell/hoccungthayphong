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
        // A. Xoay góc nhìn camera (vuốt ngón tay bên ngoài vùng điều khiển)
        window.addEventListener('touchstart', (event) => {
            const target = event.target;
            // Bỏ qua các sự kiện chạm vào joystick, cụm phím hành động di động, hoặc thanh HUD
            if (target.closest('#joystickZone') || target.closest('#mobileActionButtons') || target.closest('#hud') || target.closest('.modal') || target.closest('.overlay-screen')) {
                return;
            }
            
            const touch = event.touches[0];
            this.touchLookActive = true;
            this.touchPrevPos.set(touch.clientX, touch.clientY);
        }, { passive: true });

        window.addEventListener('touchmove', (event) => {
            if (!this.touchLookActive) return;
            
            const touch = event.touches[0];
            const deltaX = touch.clientX - this.touchPrevPos.x;
            const deltaY = touch.clientY - this.touchPrevPos.y;
            
            // Xoay camera (Độ nhạy ngón tay vuốt 0.005)
            const sensitivity = 0.005;
            this.camera.rotation.y -= deltaX * sensitivity;
            this.camera.rotation.x -= deltaY * sensitivity;
            
            // Giới hạn góc ngước lên/cúi xuống đầu (Tránh lộn ngửa camera)
            const maxPitch = Math.PI / 2 - 0.05;
            this.camera.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, this.camera.rotation.x));
            
            this.touchPrevPos.set(touch.clientX, touch.clientY);
        }, { passive: true });

        window.addEventListener('touchend', () => {
            this.touchLookActive = false;
        }, { passive: true });

        // B. Nút Nhảy ảo trên di động
        const jumpBtn = document.getElementById('mobileJumpBtn');
        if (jumpBtn) {
            // Dùng touchstart và touchend để mô phỏng nhấn phím Space
            jumpBtn.addEventListener('touchstart', (event) => {
                event.preventDefault(); // Tránh trễ click 300ms của mobile
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
            // Hiện HUD tay cầm di động
            mobileControls.classList.remove('hidden');

            const calculateCenter = () => {
                const rect = joystickContainer.getBoundingClientRect();
                this.joystickCenter.set(rect.left + rect.width / 2, rect.top + rect.height / 2);
            };

            joystickZone.addEventListener('touchstart', (event) => {
                calculateCenter();
                this.joystickActive = true;
                
                const touch = event.touches[0];
                this.updateJoystickPosition(touch.clientX, touch.clientY, joystickHandle);
            }, { passive: true });

            joystickZone.addEventListener('touchmove', (event) => {
                if (!this.joystickActive) return;
                
                const touch = event.touches[0];
                this.updateJoystickPosition(touch.clientX, touch.clientY, joystickHandle);
            }, { passive: true });

            const resetJoystick = () => {
                this.joystickActive = false;
                this.joystickVector.set(0, 0);
                joystickHandle.style.transform = 'translate(0px, 0px)';
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
}

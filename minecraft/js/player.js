/**
 * Quản lý Camera, Phím di chuyển (WASD, Space, Shift, F), PointerLock điều khiển chuột,
 * và cập nhật góc nhìn của người chơi.
 */
class Player {
    constructor(camera, canvas) {
        this.camera = camera;
        this.canvas = canvas;
        
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

        // Khởi tạo bộ điều khiển PointerLock
        this.controls = new THREE.PointerLockControls(this.camera, this.canvas);
        
        this.setupInput();
    }

    /**
     * Lắng nghe sự kiện bàn phím
     */
    setupInput() {
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
    }

    /**
     * Cập nhật lực và vận tốc di chuyển trước khi nạp vào hệ thống vật lý va chạm
     */
    updateInput() {
        if (!this.controls.isLocked) return;

        // Lấy hướng nhìn ngang của camera (chiếu lên mặt phẳng XZ để đi bộ không bị bay lên trời)
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        right.y = 0;
        right.normalize();

        // Vector hướng di chuyển mong muốn
        const moveDir = new THREE.Vector3();
        if (this.keys.forward) moveDir.add(forward);
        if (this.keys.backward) moveDir.sub(forward);
        if (this.keys.right) moveDir.add(right);
        if (this.keys.left) moveDir.sub(right);
        moveDir.normalize();

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

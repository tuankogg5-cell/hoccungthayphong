/**
 * Game Orchestrator (game.js)
 * Khởi tạo Three.js, liên kết giao diện người dùng (UI), điều khiển âm thanh,
 * vòng lặp game chính, Raycasting phá/đặt khối và chu kỳ Ngày/Đêm.
 */
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        
        // Khởi tạo các biến Three.js
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.sunLight = null;
        this.ambientLight = null;
        
        // Các thành phần logic
        this.world = null;
        this.player = null;
        this.physics = null;
        this.clock = new THREE.Clock();
        
        // Chọn khối hiện tại (Hotbar)
        // Cú pháp: slotIndex (0-8) -> blockId (1-10)
        this.selectedSlot = 0;
        this.hotbarBlocks = [1, 2, 3, 4, 5, 6, 7, 8, 9]; // 9 loại khối ứng với phím 1-9
        
        // Trạng thái Raycasting ngắm bắn khối
        this.targetedBlock = null;
        this.blockOutline = null;
        
        // Trạng thái chơi game trên di động (không dùng PointerLock)
        this.gamePlaying = false;

        // Chu kỳ ngày đêm
        this.dayTime = 0; // Tăng dần từ 0 -> 2*PI
        this.dayNightSpeed = 0.04; // Tốc độ trôi thời gian
        this.dayNightCycleEnabled = true;

        // Quản lý sinh quái và điểm hồi sinh (Spawnpoint)
        this.mobManager = null;
        this.spawnPoint = new THREE.Vector3(8, 0, 8);

        // Cố định màn hình di động: Chặn kéo trang web khi chơi game trên di động
        document.addEventListener('touchmove', (event) => {
            if (this.gamePlaying) {
                event.preventDefault();
            }
        }, { passive: false });

        this.initThree();
        this.initGameComponents();
        this.initUI();
        this.setupHotbarIcons();
        this.setupEventListeners();
        
        // Bắt đầu vòng lặp render
        this.animate();
    }

    /**
     * Khởi tạo đồ hoạ 3D (Three.js)
     */
    initThree() {
        this.scene = new THREE.Scene();
        
        // Bầu trời mặc định
        const skyColor = 0x8fa9ff;
        this.scene.background = new THREE.Color(skyColor);
        
        // Sương mù đẹp mắt hòa vào bầu trời
        this.scene.fog = new THREE.FogExp2(skyColor, 0.015);

        // Thiết lập Camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

        // Thiết lập Renderer
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;

        // Ánh sáng môi trường (Ambient)
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(this.ambientLight);

        // Mặt trời chiếu sáng tạo khối và bóng đổ (Directional)
        this.sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.sunLight.position.set(20, 40, 20);
        this.sunLight.castShadow = true;
        this.scene.add(this.sunLight);

        // Thiết lập khung dây viền hộp ngắm bắn khối (Raycast box outline)
        const outlineGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
        const outlineMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            wireframe: true,
            transparent: true,
            opacity: 0.5
        });
        this.blockOutline = new THREE.Mesh(outlineGeo, outlineMat);
        this.blockOutline.visible = false;
        this.scene.add(this.blockOutline);
    }

    /**
     * Khởi tạo các thành phần logic của Game
     */
    initGameComponents() {
        // 1. Tạo bản đồ vân bề mặt (Texture Atlas)
        const atlasCanvas = TextureGenerator.createAtlasCanvas();
        
        // 2. Tạo thế giới voxel
        this.world = new World(this.scene, atlasCanvas);
        
        // 3. Tạo người chơi
        this.player = new Player(this.camera, this.canvas);
        
        // 4. Tạo bộ xử lý vật lý va chạm
        this.physics = new Physics(this.world);
        
        // Đặt vị trí ban đầu của người chơi ở trên đỉnh địa hình cột tọa độ (8, 8)
        const spawnX = 8;
        const spawnZ = 8;
        const noiseVal = this.world.noise.fbm2d(spawnX * 0.015, spawnZ * 0.015, 4, 0.5);
        const spawnY = Math.floor((noiseVal + 1) * 0.5 * 24) + 16;
        
        this.spawnPoint.set(spawnX, spawnY + 2, spawnZ);
        this.player.position.copy(this.spawnPoint);
        this.player.updateCameraPosition();
        
        // 5. Khởi tạo MobManager quản lý Zombie
        this.mobManager = new MobManager(this.scene, this.world);
        
        // Sinh dữ liệu các chunk ban đầu xung quanh người chơi
        this.world.updateChunks(this.player.position.x, this.player.position.z);
    }

    /**
     * Thiết lập các phần tử giao diện UI và sự kiện nút bấm
     */
    initUI() {
        const startScreen = document.getElementById('startScreen');
        const pauseScreen = document.getElementById('pauseScreen');
        const controlsModal = document.getElementById('controlsModal');
        const settingsModal = document.getElementById('settingsModal');
        
        const playBtn = document.getElementById('playBtn');
        const resumeBtn = document.getElementById('resumeBtn');
        const quitBtn = document.getElementById('quitBtn');
        
        const controlsBtn = document.getElementById('controlsBtn');
        const closeControls = document.getElementById('closeControls');
        
        const settingsBtn = document.getElementById('settingsBtn');
        const pauseSettingsBtn = document.getElementById('pauseSettingsBtn');
        const closeSettings = document.getElementById('closeSettings');
        const saveSettingsBtn = document.getElementById('saveSettingsBtn');
        
        const renderDistanceInput = document.getElementById('renderDistance');
        const renderDistanceVal = document.getElementById('renderDistanceVal');
        const flightModeInput = document.getElementById('flightMode');
        const dayNightInput = document.getElementById('dayNight');
        const fogEnabledInput = document.getElementById('fogEnabled');

        // Phản hồi nút range tầm nhìn
        renderDistanceInput.addEventListener('input', () => {
            renderDistanceVal.textContent = renderDistanceInput.value;
        });

        // Nút "Chơi ngay" & "Tiếp tục" -> Bắt đầu chơi (Bỏ qua khóa chuột nếu là di động)
        const enterGame = () => {
            if (this.player.isTouchDevice) {
                startScreen.classList.add('hidden');
                pauseScreen.classList.add('hidden');
                this.gamePlaying = true;
                
                const pauseBtn = document.getElementById('mobilePauseBtn');
                if (pauseBtn) pauseBtn.classList.add('show-btn');
            } else {
                this.player.controls.lock();
            }
        };
        
        // Cơ chế tạm dừng trên di động
        const pauseGameMobile = () => {
            this.gamePlaying = false;
            pauseScreen.classList.remove('hidden');
            const pauseBtn = document.getElementById('mobilePauseBtn');
            if (pauseBtn) pauseBtn.classList.remove('show-btn');
        };
        
        const mobilePauseBtn = document.getElementById('mobilePauseBtn');
        if (mobilePauseBtn) {
            mobilePauseBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                pauseGameMobile();
            });
        }

        // 1. Chuyển đổi Sáng tạo / Sinh tồn
        const creativeModeBtn = document.getElementById('creativeModeBtn');
        const survivalModeBtn = document.getElementById('survivalModeBtn');

        if (creativeModeBtn && survivalModeBtn) {
            creativeModeBtn.addEventListener('click', () => {
                creativeModeBtn.classList.add('active');
                survivalModeBtn.classList.remove('active');
                this.player.setGameMode('creative');
                if (this.mobManager) this.mobManager.clearAll();
                this.player.showSystemMessage("Đã chuyển sang Sáng tạo");
            });

            survivalModeBtn.addEventListener('click', () => {
                survivalModeBtn.classList.add('active');
                creativeModeBtn.classList.remove('active');
                this.player.setGameMode('survival');
                if (this.mobManager) {
                    this.mobManager.clearAll();
                    // Sinh Zombie ngay lập tức để người chơi kiểm tra Sinh tồn
                    for (let i = 0; i < 3; i++) {
                        this.mobManager.spawnRandomZombie(this.player);
                    }
                }
                this.player.showSystemMessage("Đã chuyển sang Sinh tồn");
            });
        }

        // 2. Các nút ở màn hình cái chết (Death Screen)
        const respawnBtn = document.getElementById('respawnBtn');
        const deathQuitBtn = document.getElementById('deathQuitBtn');

        if (respawnBtn) {
            respawnBtn.addEventListener('click', () => {
                this.player.respawn(this.spawnPoint);
                if (this.mobManager) this.mobManager.clearAll();
                enterGame();
            });
        }

        if (deathQuitBtn) {
            deathQuitBtn.addEventListener('click', () => {
                const deathScreen = document.getElementById('deathScreen');
                if (deathScreen) deathScreen.classList.add('hidden');
                
                if (this.mobManager) this.mobManager.clearAll();
                
                // Trả về màn hình chính
                this.gamePlaying = false;
                startScreen.classList.remove('hidden');
            });
        }

        playBtn.addEventListener('click', enterGame);
        resumeBtn.addEventListener('click', enterGame);

        // Nút "Thoát ra màn hình chính"
        quitBtn.addEventListener('click', () => {
            this.player.controls.unlock();
            this.gamePlaying = false;
            const pauseBtn = document.getElementById('mobilePauseBtn');
            if (pauseBtn) pauseBtn.classList.remove('show-btn');
            if (this.mobManager) this.mobManager.clearAll();
            pauseScreen.classList.add('hidden');
            startScreen.classList.remove('hidden');
        });

        // Bảng hướng dẫn
        controlsBtn.addEventListener('click', () => {
            controlsModal.classList.remove('hidden');
        });
        closeControls.addEventListener('click', () => {
            controlsModal.classList.add('hidden');
        });

        // Bảng cài đặt
        const openSettings = () => {
            renderDistanceInput.value = this.world.renderDistance;
            renderDistanceVal.textContent = this.world.renderDistance;
            flightModeInput.checked = this.player.flightMode;
            dayNightInput.checked = this.dayNightCycleEnabled;
            fogEnabledInput.checked = !!this.scene.fog;
            
            settingsModal.classList.remove('hidden');
        };
        settingsBtn.addEventListener('click', openSettings);
        pauseSettingsBtn.addEventListener('click', openSettings);
        
        closeSettings.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
        });

        // Lưu cài đặt
        saveSettingsBtn.addEventListener('click', () => {
            const rd = parseInt(renderDistanceInput.value);
            this.world.renderDistance = rd;
            this.player.flightMode = flightModeInput.checked;
            this.dayNightCycleEnabled = dayNightInput.checked;
            
            if (fogEnabledInput.checked) {
                this.scene.fog = new THREE.FogExp2(this.scene.background, 0.015);
            } else {
                this.scene.fog = null;
            }
            
            this.world.updateChunks(this.player.position.x, this.player.position.z);
            settingsModal.classList.add('hidden');
            
            this.player.showSystemMessage("Cài đặt đã được cập nhật!");
        });

        // Đóng các bảng bằng phím Esc hoặc click ra ngoài modal
        window.addEventListener('click', (event) => {
            if (event.target === controlsModal) controlsModal.classList.add('hidden');
            if (event.target === settingsModal) settingsModal.classList.add('hidden');
        });
    }

    /**
     * Vẽ 3D icon cho toàn bộ các slot trên thanh Hotbar
     */
    setupHotbarIcons() {
        const slots = document.querySelectorAll('.hotbar-slot');
        slots.forEach(slot => {
            const canvas = slot.querySelector('.slot-icon');
            const blockId = parseInt(slot.dataset.blockId);
            TextureGenerator.drawBlockIcon(canvas, blockId);
            
            // Xử lý sự kiện nhấn chọn slot hotbar bằng chuột
            slot.addEventListener('click', () => {
                const index = parseInt(slot.dataset.slot);
                this.selectHotbarSlot(index);
            });
        });
        
        this.selectHotbarSlot(0);
    }

    /**
     * Kích hoạt slot hotbar được chọn
     */
    selectHotbarSlot(index) {
        this.selectedSlot = index;
        const slots = document.querySelectorAll('.hotbar-slot');
        slots.forEach(slot => {
            if (parseInt(slot.dataset.slot) === index) {
                slot.classList.add('active');
            } else {
                slot.classList.remove('active');
            }
        });
        
        // Hiện tên khối vừa chọn
        const blockId = this.hotbarBlocks[index];
        const blockName = TextureGenerator.blockNames[blockId] || 'Voxel';
        const nameDiv = document.getElementById('block-name');
        nameDiv.textContent = `Đang chọn: ${blockName}`;
        nameDiv.classList.add('show');
        
        // Ẩn tên sau 1.5 giây
        if (this.hotbarTextTimeout) clearTimeout(this.hotbarTextTimeout);
        this.hotbarTextTimeout = setTimeout(() => {
            nameDiv.classList.remove('show');
        }, 1500);
    }

    /**
     * Sự kiện lắng nghe phím chuột bổ sung cho điều khiển chính
     */
    setupEventListeners() {
        const startScreen = document.getElementById('startScreen');
        const pauseScreen = document.getElementById('pauseScreen');

        // Bắt sự kiện PointerLock khi người chơi kích hoạt/thoát (Chỉ trên PC)
        this.player.controls.addEventListener('lock', () => {
            startScreen.classList.add('hidden');
            pauseScreen.classList.add('hidden');
        });

        this.player.controls.addEventListener('unlock', () => {
            if (this.player.isTouchDevice) return; // Di động xử lý nút bấm riêng
            // Nếu không mở màn hình bắt đầu, thì hiện màn hình tạm dừng
            if (startScreen.classList.contains('hidden')) {
                pauseScreen.classList.remove('hidden');
            }
        });

        // Hướng kiểm tra trạng thái tương tác game (PC có khóa chuột, di động có cờ chơi game)
        const isGameInputActive = () => {
            return this.player.controls.isLocked || (this.player.isTouchDevice && this.gamePlaying);
        };

        // 1. Phím số (1-9) để chọn nhanh ô Hotbar
        window.addEventListener('keydown', (event) => {
            if (!isGameInputActive()) return;
            
            if (event.key >= '1' && event.key <= '9') {
                const index = parseInt(event.key) - 1;
                this.selectHotbarSlot(index);
            }
        });

        // 2. Lăn con lăn chuột để chuyển nhanh các ô Hotbar
        window.addEventListener('wheel', (event) => {
            if (!isGameInputActive()) return;
            
            let index = this.selectedSlot;
            if (event.deltaY > 0) {
                // Lăn xuống -> chuyển sang phải
                index = (index + 1) % 9;
            } else {
                // Lăn lên -> chuyển sang trái
                index = (index - 1 + 9) % 9;
            }
            this.selectHotbarSlot(index);
        });

        // 3. Phá/Đặt khối qua click Chuột Trái / Chuột Phải
        window.addEventListener('mousedown', (event) => {
            if (!isGameInputActive()) return;
            
            if (event.button === 0) {
                // Chuột trái -> Đánh quái trước, hụt mới phá đất
                const hitMob = this.handleAttack();
                if (!hitMob) {
                    this.handleBlockBreak();
                }
            } else if (event.button === 2) {
                // Chuột phải -> Đặt khối
                this.handleBlockPlace();
            }
        });

        // 4. Sự kiện chạm nút hành động cảm ứng di động (Đập 🔨 & Đặt 🧱)
        const mobileBreakBtn = document.getElementById('mobileBreakBtn');
        const mobilePlaceBtn = document.getElementById('mobilePlaceBtn');

        if (mobileBreakBtn) {
            mobileBreakBtn.addEventListener('touchstart', (event) => {
                event.preventDefault();
                if (isGameInputActive()) {
                    const hitMob = this.handleAttack();
                    if (!hitMob) this.handleBlockBreak();
                }
            });
        }

        if (mobilePlaceBtn) {
            mobilePlaceBtn.addEventListener('touchstart', (event) => {
                event.preventDefault();
                if (isGameInputActive()) this.handleBlockPlace();
            });
        }

        // Co giãn màn hình trình duyệt (Responsive)
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    /**
     * Bắn tia Raycast định vị khối người chơi đang nhắm mắt tới
     */
    /**
     * Tấn công quái vật bằng tia ngắm bắn Raycast
     */
    handleAttack() {
        const raycaster = new THREE.Raycaster();
        const center = new THREE.Vector2(0, 0); // Giữa tâm camera
        raycaster.setFromCamera(center, this.camera);
        
        if (!this.mobManager || this.mobManager.mobs.length === 0) return false;
        
        // Quét lấy danh sách tất cả mesh của Zombie
        const zombieMeshes = this.mobManager.mobs.map(z => z.mesh);
        
        // Kiểm tra va chạm tia với các mesh quái vật (quét đệ quy)
        const intersects = raycaster.intersectObjects(zombieMeshes, true);
        
        if (intersects.length > 0 && intersects[0].distance < 4.5) {
            // Tìm ngược lại Group gốc chứa userData.zombieInstance
            let parent = intersects[0].object.parent;
            while (parent && !parent.userData.zombieInstance) {
                parent = parent.parent;
            }
            
            if (parent && parent.userData.zombieInstance) {
                const zombie = parent.userData.zombieInstance;
                // Gây sát thương và kiểm tra nếu chết
                zombie.takeDamage(5, this.player.position);
                return true; // Đánh trúng quái vật, không đào khối đất phía sau
            }
        }
        
        return false;
    }

    updateRaycasting() {
        const isGameInputActive = this.player.controls.isLocked || (this.player.isTouchDevice && this.gamePlaying);
        if (!isGameInputActive) {
            this.blockOutline.visible = false;
            this.targetedBlock = null;
            return;
        }

        // Bắn tia từ tâm camera theo hướng nhìn
        const raycaster = new THREE.Raycaster();
        const center = new THREE.Vector2(0, 0); // Giữa màn hình
        raycaster.setFromCamera(center, this.camera);
        
        // Thuật toán quét điểm (Stepping Raycast) để tìm khối voxel chính xác hơn
        const maxDistance = 5.5; // Tầm tương tác tối đa
        const start = this.camera.position;
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        
        const hitInfo = this.voxelRaycast(start, direction, maxDistance);
        
        if (hitInfo.hit) {
            // Định vị khung dây viền đen bao quanh khối
            this.blockOutline.position.set(hitInfo.x + 0.5, hitInfo.y + 0.5, hitInfo.z + 0.5);
            this.blockOutline.visible = true;
            this.targetedBlock = hitInfo;
        } else {
            this.blockOutline.visible = false;
            this.targetedBlock = null;
        }
    }

    /**
     * Thuật toán quét tia số học voxel chính xác
     */
    voxelRaycast(start, direction, maxDistance) {
        const stepSize = 0.05;
        const steps = maxDistance / stepSize;
        
        const prevPos = start.clone();
        const currPos = start.clone();
        
        for (let i = 0; i < steps; i++) {
            currPos.addScaledVector(direction, stepSize);
            
            const bx = Math.floor(currPos.x);
            const by = Math.floor(currPos.y);
            const bz = Math.floor(currPos.z);
            
            const blockId = this.world.getBlock(bx, by, bz);
            
            if (blockId > 0) {
                // Va chạm thành công!
                const px = Math.floor(prevPos.x);
                const py = Math.floor(prevPos.y);
                const pz = Math.floor(prevPos.z);
                
                // Hướng pháp tuyến của mặt tiếp xúc (px - bx)
                let nx = px - bx;
                let ny = py - by;
                let nz = pz - bz;
                
                // Giới hạn trong [-1, 1]
                nx = Math.max(-1, Math.min(1, nx));
                ny = Math.max(-1, Math.min(1, ny));
                nz = Math.max(-1, Math.min(1, nz));
                
                // Tránh trường hợp góc chéo bước đi có 2 trục cùng thay đổi
                if (nx !== 0 && ny !== 0) ny = 0;
                if (nx !== 0 && nz !== 0) nz = 0;
                if (ny !== 0 && nz !== 0) nz = 0;
                
                return {
                    hit: true,
                    x: bx, y: by, z: bz,
                    nx: nx, ny: ny, nz: nz,
                    blockId: blockId
                };
            }
            prevPos.copy(currPos);
        }
        
        return { hit: false };
    }

    /**
     * Xử lý xoá khối khi nhấp chuột trái
     */
    handleBlockBreak() {
        if (this.targetedBlock && this.targetedBlock.hit) {
            const { x, y, z } = this.targetedBlock;
            
            // Đặt khối thành Không khí (0)
            this.world.setBlock(x, y, z, 0);
            
            // Vẽ lại các chunk thay đổi ngay lập tức
            this.world.updateChunks(this.player.position.x, this.player.position.z);
        }
    }

    /**
     * Xử lý đặt khối khi nhấp chuột phải
     */
    handleBlockPlace() {
        if (this.targetedBlock && this.targetedBlock.hit) {
            const { x, y, z, nx, ny, nz } = this.targetedBlock;
            
            // Toạ độ khối mới kế bên khối nhắm bắn dựa trên Vector pháp tuyến
            const px = x + nx;
            const py = y + ny;
            const pz = z + nz;
            
            // Ngăn chặn đặt khối đè lên vị trí người chơi đang đứng (Tránh kẹt người)
            const pBox = {
                minX: this.player.position.x - this.player.width / 2,
                maxX: this.player.position.x + this.player.width / 2,
                minY: this.player.position.y,
                maxY: this.player.position.y + this.player.height,
                minZ: this.player.position.z - this.player.depth / 2,
                maxZ: this.player.position.z + this.player.depth / 2
            };
            
            const bBox = {
                minX: px, maxX: px + 1,
                minY: py, maxY: py + 1,
                minZ: pz, maxZ: pz + 1
            };
            
            const intersects = (pBox.minX < bBox.maxX && pBox.maxX > bBox.minX &&
                                pBox.minY < bBox.maxY && pBox.maxY > bBox.minY &&
                                pBox.minZ < bBox.maxZ && pBox.maxZ > bBox.minZ);
                                
            if (intersects) {
                this.player.showSystemMessage("Không thể đặt khối đè lên người chơi!");
                return;
            }

            // Đặt khối được chọn từ Hotbar
            const blockToPlace = this.hotbarBlocks[this.selectedSlot];
            this.world.setBlock(px, py, pz, blockToPlace);
            
            // Cập nhật thế giới
            this.world.updateChunks(this.player.position.x, this.player.position.z);
        }
    }

    /**
     * Tạo hoạt ảnh quay vòng mặt trời và cập nhật màu bầu trời, sương mù (Chu kỳ Ngày/Đêm)
     */
    updateDayNightCycle(dt) {
        if (!this.dayNightCycleEnabled) {
            // Mặc định ban ngày tĩnh nếu tắt
            this.sunLight.position.set(20, 40, 20);
            this.sunLight.intensity = 0.8;
            this.ambientLight.intensity = 0.6;
            this.scene.background.setHex(0x8fa9ff);
            if (this.scene.fog) this.scene.fog.color.setHex(0x8fa9ff);
            return;
        }

        // Tăng thời gian chu kỳ
        this.dayTime = (this.dayTime + this.dayNightSpeed * dt) % (Math.PI * 2);
        
        // Quỹ đạo mặt trời: Xoay vòng quanh trục Z
        const radius = 60;
        const lx = Math.cos(this.dayTime) * radius;
        const ly = Math.sin(this.dayTime) * radius;
        this.sunLight.position.set(lx, ly, 20);

        // Tính chất bầu trời dựa trên độ cao mặt trời (ly)
        const sunHeight = ly / radius; // [-1.0 -> 1.0]
        
        let skyColor = new THREE.Color();
        let ambientPower = 0.6;
        let sunPower = 0.8;

        if (sunHeight > 0.1) {
            // Ban ngày (Sun up)
            // Màu xanh lam trời tươi sáng
            const t = Math.min(1, (sunHeight - 0.1) * 2.5);
            skyColor.lerpColors(new THREE.Color(0xfbc531), new THREE.Color(0x8fa9ff), t); // Lerp từ cam bình minh lên xanh
            ambientPower = 0.4 + t * 0.2;
            sunPower = t * 0.8;
        } else if (sunHeight <= 0.1 && sunHeight > -0.1) {
            // Bình minh/Hoàng hôn
            // Trộn lẫn sắc cam, tím hồng hoàng hôn quyến rũ
            const t = (sunHeight - (-0.1)) / 0.2; // 0.0 -> 1.0
            skyColor.lerpColors(new THREE.Color(0x1e1e24), new THREE.Color(0xfbc531), t);
            ambientPower = 0.15 + t * 0.25;
            sunPower = t * 0.2;
        } else {
            // Ban đêm (Sun down)
            // Màu chàm/đen sẫm cực đêm đầy bí ẩn
            skyColor.setHex(0x0a0a10);
            ambientPower = 0.15;
            sunPower = 0;
        }

        // Cập nhật lên Three.js Scene
        this.scene.background = skyColor;
        if (this.scene.fog) this.scene.fog.color = skyColor;
        this.ambientLight.intensity = ambientPower;
        
        // Tắt bóng đổ mặt trời khi ban đêm để tối ưu hóa
        this.sunLight.intensity = sunPower;
        this.sunLight.castShadow = (sunPower > 0.05);
    }

    /**
     * Vòng lặp hoạt họa chính (Render Loop)
     */
    animate() {
        requestAnimationFrame(() => this.animate());

        const dt = this.clock.getDelta();

        // 1. Cập nhật phím di chuyển
        this.player.updateInput();

        // 2. Chạy vật lý va chạm và cập nhật vị trí người chơi
        this.physics.update(this.player, dt);

        // 2.5 Cập nhật các trạng thái Sinh tồn (Sát thương rơi, Rơi hư vô, v.v.)
        this.player.postPhysicsUpdate(dt);

        // 2.8 Cập nhật quái vật Zombie
        if (this.mobManager && this.gamePlaying) {
            this.mobManager.update(this.player, dt);
        }

        // 3. Cập nhật vị trí camera theo sát người chơi
        this.player.updateCameraPosition();

        // 4. Quét tia Raycast để ngắm khối
        this.updateRaycasting();

        // 5. Cập nhật chu kỳ ngày đêm
        this.updateDayNightCycle(dt);

        // 6. Cập nhật sinh các mảnh chunk mới quanh người chơi
        const isGameInputActive = this.player.controls.isLocked || (this.player.isTouchDevice && this.gamePlaying);
        if (isGameInputActive) {
            this.world.updateChunks(this.player.position.x, this.player.position.z);
        }

        // 7. Thực hiện vẽ lên màn hình
        this.renderer.render(this.scene, this.camera);
    }
}

// Khởi chạy trò chơi khi trang đã nạp xong
window.addEventListener('DOMContentLoaded', () => {
    window.gameInstance = new Game();
});

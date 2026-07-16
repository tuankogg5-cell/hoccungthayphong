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
        // Cú pháp: slotIndex (0-8) -> blockId (1-18) hoặc dụng cụ
        this.selectedSlot = 0;
        this.hotbarBlocks = [1, 2, 3, 4, 10, 9, 7, 'stone_sword', 'stone_pickaxe']; // Cho phép chứa kiếm và cúp mặc định
        
        // Trạng thái Raycasting ngắm bắn khối
        this.targetedBlock = null;
        this.blockOutline = null;
        
        // Trạng thái đào khối theo độ cứng
        this.miningBlockCoords = null; // {x, y, z}
        this.miningProgress = 0;
        this.miningTimeNeeded = 0;
        this.isMiningPressed = false;
        this.mobileMiningActive = false;

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

        // Hỗ trợ Toàn màn hình (Fullscreen) cho di động để ẩn thanh địa chỉ/tab tìm kiếm
        const enterFullScreen = () => {
            const docElm = document.documentElement;
            if (docElm.requestFullscreen) {
                docElm.requestFullscreen().catch(() => {});
            } else if (docElm.webkitRequestFullscreen) {
                docElm.webkitRequestFullscreen();
            } else if (docElm.mozRequestFullScreen) {
                docElm.mozRequestFullScreen();
            } else if (docElm.msRequestFullscreen) {
                docElm.msRequestFullscreen();
            }
        };

        const exitFullScreen = () => {
            if (document.fullscreenElement || document.webkitFullscreenElement) {
                if (document.exitFullscreen) {
                    document.exitFullscreen().catch(() => {});
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.mozCancelFullScreen) {
                    document.mozCancelFullScreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
            }
        };

        // Nút "Chơi ngay" & "Tiếp tục" -> Bắt đầu chơi (Bỏ qua khóa chuột nếu là di động)
        const enterGame = () => {
            if (this.player.isTouchDevice) {
                startScreen.classList.add('hidden');
                pauseScreen.classList.add('hidden');
                this.gamePlaying = true;
                
                // Kích hoạt toàn màn hình
                enterFullScreen();
                
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
                
                // Thoát toàn màn hình khi thoát game
                exitFullScreen();
                
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
            
            // Thoát toàn màn hình khi về màn hình chính
            exitFullScreen();
            
            pauseScreen.classList.add('hidden');
            startScreen.classList.remove('hidden');
        });

        // 3. Quản lý Modal Kho Đồ & Chế tạo
        const inventoryModal = document.getElementById('inventoryModal');
        const closeInventory = document.getElementById('closeInventory');
        const tabBackpack = document.getElementById('tabBackpack');
        const tabCrafting = document.getElementById('tabCrafting');
        const backpackTabContent = document.getElementById('backpackTabContent');
        const craftingTabContent = document.getElementById('craftingTabContent');

        if (tabBackpack && tabCrafting) {
            tabBackpack.addEventListener('click', () => {
                tabBackpack.classList.add('active');
                tabCrafting.classList.remove('active');
                backpackTabContent.classList.remove('hidden');
                craftingTabContent.classList.add('hidden');
                
                tabBackpack.style.background = 'var(--primary)';
                tabBackpack.style.color = '#fff';
                tabCrafting.style.background = 'rgba(255,255,255,0.1)';
                tabCrafting.style.color = '#ccc';
            });

            tabCrafting.addEventListener('click', () => {
                tabCrafting.classList.add('active');
                tabBackpack.classList.remove('active');
                craftingTabContent.classList.remove('hidden');
                backpackTabContent.classList.add('hidden');
                
                tabCrafting.style.background = 'var(--primary)';
                tabCrafting.style.color = '#fff';
                tabBackpack.style.background = 'rgba(255,255,255,0.1)';
                tabBackpack.style.color = '#ccc';
            });
        }

        if (closeInventory) {
            closeInventory.addEventListener('click', () => {
                this.closeInventoryModal();
            });
        }

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
            if (event.target === inventoryModal) this.closeInventoryModal();
        });
    }

    /**
     * Vẽ 3D icon cho toàn bộ các slot trên thanh Hotbar
     */
    setupHotbarIcons() {
        const slots = document.querySelectorAll('.hotbar-slot');
        slots.forEach(slot => {
            // Xử lý sự kiện nhấn chọn slot hotbar bằng chuột
            slot.addEventListener('click', () => {
                const index = parseInt(slot.dataset.slot);
                this.selectHotbarSlot(index);
            });
        });
        
        this.updateHotbarHUD();
        this.selectHotbarSlot(0);
    }

    /**
     * Đồng bộ hoá hiển thị các icon 3D và số lượng vật phẩm trong Hotbar HUD
     */
    updateHotbarHUD() {
        const slots = document.querySelectorAll('.hotbar-slot');
        slots.forEach(slot => {
            const canvas = slot.querySelector('.slot-icon');
            const index = parseInt(slot.dataset.slot);
            const itemId = this.hotbarBlocks[index];
            const countSpan = slot.querySelector('.slot-count');
            
            const isCreative = (this.player.gameMode === 'creative');
            const qty = isCreative ? Infinity : (this.player.inventory[itemId] || 0);
            
            if (qty > 0 || isCreative) {
                // A. Có đồ hoặc chế độ Sáng tạo -> vẽ icon bình thường
                slot.classList.remove('empty');
                TextureGenerator.drawBlockIcon(canvas, itemId);
                if (countSpan) {
                    countSpan.textContent = isCreative ? '∞' : `x${qty}`;
                }
                slot.style.opacity = '1.0';
            } else {
                // B. Ô trống (chưa có đồ trong Sinh tồn) -> đổi thành màu trắng trong suốt và xóa hình vẽ
                slot.classList.add('empty');
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (countSpan) {
                    countSpan.textContent = ''; // Ẩn nhãn x0 đi
                }
                slot.style.opacity = '1.0'; // Giữ độ sáng ô trắng
            }
        });
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
        if (nameDiv) {
            nameDiv.textContent = `Đang chọn: ${blockName}`;
            nameDiv.classList.add('show');
            
            // Ẩn tên sau 1.5 giây
            if (this.hotbarTextTimeout) clearTimeout(this.hotbarTextTimeout);
            this.hotbarTextTimeout = setTimeout(() => {
                nameDiv.classList.remove('show');
            }, 1500);
        }
    }

    /**
     * Mở modal Balo và Chế tạo (mở khóa chuột trên PC)
     */
    openInventoryModal() {
        // Hủy trạng thái PointerLock của trình duyệt để có thể di chuột click
        this.player.controls.unlock();
        this.gamePlaying = false;
        
        // Nhả giữ phím đào tránh bị kẹt đào
        this.isMiningPressed = false;
        this.mobileMiningActive = false;
        this.resetMining();

        const inventoryModal = document.getElementById('inventoryModal');
        if (!inventoryModal) return;
        inventoryModal.classList.remove('hidden');

        const tabBackpack = document.getElementById('tabBackpack');
        const tabCrafting = document.getElementById('tabCrafting');
        const backpackTabContent = document.getElementById('backpackTabContent');
        const craftingTabContent = document.getElementById('craftingTabContent');

        // Phân phối Tab giao diện dựa trên chế độ chơi hiện tại
        if (this.player.gameMode === 'creative') {
            // Sáng tạo: Chỉ hiện tab Balo khối, ẩn tab Chế tạo
            if (tabBackpack) tabBackpack.classList.remove('hidden');
            if (tabCrafting) tabCrafting.classList.add('hidden');
            
            if (tabBackpack) tabBackpack.click(); // Click chọn tab balo sáng tạo
            
            // Vẽ danh sách 18 khối sáng tạo
            const grid = document.getElementById('creativeBackpackGrid');
            if (grid) {
                grid.innerHTML = '';
                for (let id = 1; id <= 18; id++) {
                    const item = document.createElement('div');
                    item.className = 'inventory-grid-item';
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = 44;
                    canvas.height = 44;
                    TextureGenerator.drawBlockIcon(canvas, id);
                    item.appendChild(canvas);
                    
                    const name = document.createElement('div');
                    name.className = 'inventory-item-name';
                    name.textContent = TextureGenerator.blockNames[id];
                    item.appendChild(name);
                    
                    item.addEventListener('click', () => {
                        // Kéo khối chọn vào slot hotbar hiện hành
                        this.hotbarBlocks[this.selectedSlot] = id;
                        this.updateHotbarHUD();
                        this.closeInventoryModal();
                    });
                    
                    grid.appendChild(item);
                }
            }
        } else {
            // Sinh tồn: Ẩn tab Balo, chỉ hiện tab Chế tạo công cụ/vũ khí
            if (tabBackpack) tabBackpack.classList.add('hidden');
            if (tabCrafting) tabCrafting.classList.remove('hidden');
            
            if (tabCrafting) tabCrafting.click(); // Click chọn tab chế tạo
            
            // Cập nhật nguyên liệu hiện có
            const resourcesGrid = document.getElementById('survivalResourcesGrid');
            if (resourcesGrid) {
                resourcesGrid.innerHTML = '';
                let hasAnyResource = false;
                
                for (const [itemId, qty] of Object.entries(this.player.inventory)) {
                    if (qty > 0) {
                        hasAnyResource = true;
                        const pill = document.createElement('div');
                        pill.className = 'resource-pill';
                        
                        const name = TextureGenerator.blockNames[itemId] || itemId;
                        pill.innerHTML = `<span>${name}:</span> <strong>${qty}</strong>`;
                        resourcesGrid.appendChild(pill);
                    }
                }
                
                if (!hasAnyResource) {
                    resourcesGrid.innerHTML = '<span style="font-size:10px; color:#aaa; font-style:italic;">Trống rỗng (Hãy đi đào gỗ, đào đất...)</span>';
                }
            }

            // Định nghĩa các công thức chế tạo trong Sinh tồn
            const recipes = [
                {
                    id: 'planks',
                    name: 'Ván Gỗ (x4)',
                    requires: { 4: 1 }, // 1 Gỗ Sồi
                    gives: { 10: 4 }   // 4 Ván Gỗ
                },
                {
                    id: 'stick',
                    name: 'Gậy Gỗ (x4)',
                    requires: { 10: 2 }, // 2 Ván Gỗ
                    gives: { 'stick': 4 } // 4 Gậy
                },
                {
                    id: 'stone_sword',
                    name: 'Kiếm Đá (Vũ khí)',
                    requires: { 'stick': 1, 9: 2 }, // 1 Gậy, 2 Đá Cuội
                    gives: { 'stone_sword': 1 }
                },
                {
                    id: 'stone_pickaxe',
                    name: 'Cúp Đá (Công cụ)',
                    requires: { 'stick': 2, 9: 3 }, // 2 Gậy, 3 Đá Cuội
                    gives: { 'stone_pickaxe': 1 }
                }
            ];

            // Vẽ danh sách công thức chế tạo
            const recipesGrid = document.getElementById('craftingRecipesGrid');
            if (recipesGrid) {
                recipesGrid.innerHTML = '';
                
                recipes.forEach(recipe => {
                    const card = document.createElement('div');
                    card.className = 'recipe-card';
                    
                    const info = document.createElement('div');
                    info.className = 'recipe-info';
                    
                    const title = document.createElement('div');
                    title.className = 'recipe-title';
                    title.textContent = recipe.name;
                    info.appendChild(title);
                    
                    const reqs = document.createElement('div');
                    reqs.className = 'recipe-ingredients';
                    
                    const reqParts = [];
                    for (const [reqId, reqQty] of Object.entries(recipe.requires)) {
                        const name = TextureGenerator.blockNames[reqId] || reqId;
                        reqParts.push(`${name} (${reqQty})`);
                    }
                    reqs.textContent = "Yêu cầu: " + reqParts.join(', ');
                    info.appendChild(reqs);
                    
                    card.appendChild(info);
                    
                    const btn = document.createElement('button');
                    btn.className = 'btn-craft';
                    btn.textContent = 'CHẾ TẠO';
                    
                    const canCraft = this.player.hasIngredients(recipe.requires);
                    if (canCraft) {
                        btn.classList.add('active');
                        btn.addEventListener('click', () => {
                            if (this.player.craftItem(recipe)) {
                                // Tự động trang bị công cụ vừa tạo vào Hotbar
                                if (recipe.id === 'stone_sword') {
                                    this.hotbarBlocks[7] = 'stone_sword'; // Ô số 8
                                } else if (recipe.id === 'stone_pickaxe') {
                                    this.hotbarBlocks[8] = 'stone_pickaxe'; // Ô số 9
                                }
                                this.updateHotbarHUD();
                                this.openInventoryModal(); // Vẽ lại giao diện
                            }
                        });
                    }
                    
                    card.appendChild(btn);
                    recipesGrid.appendChild(card);
                });
            }
        }
    }

    /**
     * Đóng modal balo và tiếp tục chơi (Yêu cầu PointerLock nếu là PC)
     */
    closeInventoryModal() {
        const inventoryModal = document.getElementById('inventoryModal');
        if (!inventoryModal) return;
        inventoryModal.classList.add('hidden');

        if (this.player.isTouchDevice) {
            this.gamePlaying = true;
            const pauseBtn = document.getElementById('mobilePauseBtn');
            if (pauseBtn) pauseBtn.classList.add('show-btn');
        } else {
            // Tự động PointerLock lại trên máy tính
            this.player.controls.lock();
        }
    }

    /**
     * Sự kiện lắng nghe phím chuột bổ sung cho điều khiển chính
     */
    setupEventListeners() {
        const startScreen = document.getElementById('startScreen');
        const pauseScreen = document.getElementById('pauseScreen');
        const inventoryModal = document.getElementById('inventoryModal');

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

        // 3. Phá/Đặt khối qua click Chuột Trái / Chuột Phải (Hỗ trợ giữ chuột đào dần)
        window.addEventListener('mousedown', (event) => {
            if (!isGameInputActive()) return;
            
            if (event.button === 0) {
                // Chuột trái -> Đánh quái trước
                const hitMob = this.handleAttack();
                if (hitMob) {
                    this.isMiningPressed = false;
                } else {
                    // Nếu không đánh trúng quái vật -> Kích hoạt đào khối theo thời gian
                    this.isMiningPressed = true;
                }
            } else if (event.button === 2) {
                // Chuột phải -> Đặt khối
                this.handleBlockPlace();
            }
        });

        window.addEventListener('mouseup', (event) => {
            if (event.button === 0) {
                this.isMiningPressed = false;
                this.resetMining();
            }
        });

        // 3.5 Nhả chuột khi mất tập trung hoặc thoát PointerLock
        this.player.controls.addEventListener('unlock', () => {
            this.isMiningPressed = false;
            this.resetMining();
        });

        // 3.8 Phím E mở kho đồ
        window.addEventListener('keydown', (event) => {
            if (event.key.toLowerCase() === 'e') {
                const isPlaying = startScreen.classList.contains('hidden') && 
                                  pauseScreen.classList.contains('hidden') && 
                                  (!document.getElementById('deathScreen') || document.getElementById('deathScreen').classList.contains('hidden'));
                
                const isInventoryOpen = !inventoryModal.classList.contains('hidden');
                
                if (isPlaying || isInventoryOpen) {
                    if (isInventoryOpen) {
                        this.closeInventoryModal();
                    } else {
                        this.openInventoryModal();
                    }
                }
            }
        });

        // 4. Sự kiện chạm nút hành động cảm ứng di động (Đập 🔨, Đặt 🧱, Mở Balo 🎒)
        const mobileBreakBtn = document.getElementById('mobileBreakBtn');
        const mobilePlaceBtn = document.getElementById('mobilePlaceBtn');
        const mobileBackpackBtn = document.getElementById('mobileBackpackBtn');

        if (mobileBreakBtn) {
            mobileBreakBtn.addEventListener('touchstart', (event) => {
                event.preventDefault();
                if (isGameInputActive()) {
                    const hitMob = this.handleAttack();
                    if (hitMob) {
                        this.mobileMiningActive = false;
                    } else {
                        this.mobileMiningActive = true;
                    }
                }
            });

            mobileBreakBtn.addEventListener('touchend', (event) => {
                event.preventDefault();
                this.mobileMiningActive = false;
                this.resetMining();
            });

            mobileBreakBtn.addEventListener('touchcancel', (event) => {
                event.preventDefault();
                this.mobileMiningActive = false;
                this.resetMining();
            });
        }

        if (mobilePlaceBtn) {
            mobilePlaceBtn.addEventListener('touchstart', (event) => {
                event.preventDefault();
                if (isGameInputActive()) this.handleBlockPlace();
            });
        }

        if (mobileBackpackBtn) {
            mobileBackpackBtn.addEventListener('touchstart', (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                if (inventoryModal.classList.contains('hidden')) {
                    this.openInventoryModal();
                } else {
                    this.closeInventoryModal();
                }
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
    /**
     * Xử lý xoá khối và cộng vật phẩm vào kho đồ (Chế độ Sinh tồn)
     */
    handleBlockBreak() {
        if (this.targetedBlock && this.targetedBlock.hit) {
            const { x, y, z } = this.targetedBlock;
            
            // Đọc ID khối chuẩn bị đập trước khi xóa đi
            const brokenBlockId = this.world.getBlock(x, y, z);
            
            // Xóa khối khỏi bản đồ thế giới (Không khí = 0)
            this.world.setBlock(x, y, z, 0);
            
            // Vẽ lại các chunk thay đổi ngay lập tức
            this.world.updateChunks(this.player.position.x, this.player.position.z);

            // Sinh tồn: Nhặt khối đó vào balo túi đồ
            if (this.player.gameMode === 'survival' && brokenBlockId > 0) {
                this.player.addItem(brokenBlockId, 1);
            }
        }
    }

    /**
     * Xử lý đặt khối và tiêu hao vật phẩm trong balo (Chế độ Sinh tồn)
     */
    handleBlockPlace() {
        if (this.targetedBlock && this.targetedBlock.hit) {
            const { x, y, z, nx, ny, nz } = this.targetedBlock;
            
            const blockToPlace = this.hotbarBlocks[this.selectedSlot];

            // 1. Nếu là vũ khí hoặc công cụ thì tuyệt đối KHÔNG cho đặt xuống thế giới
            if (blockToPlace === 'stone_sword' || blockToPlace === 'stone_pickaxe') {
                return;
            }

            // 2. Chế độ Sinh tồn: Kiểm tra số lượng khối trong balo
            if (this.player.gameMode === 'survival') {
                const qty = this.player.inventory[blockToPlace] || 0;
                if (qty <= 0) {
                    this.player.showSystemMessage("Bạn không có khối này để đặt!");
                    return;
                }
            }
            
            // Toạ độ khối mới kề bên khối nhắm bắn dựa trên Vector pháp tuyến mặt chạm
            const px = x + nx;
            const py = y + ny;
            const pz = z + nz;
            
            // 3. Ngăn chặn đặt khối đè lên cơ thể người chơi (Tránh kẹt vật lý)
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

            // Đặt khối
            this.world.setBlock(px, py, pz, blockToPlace);
            
            // Tiêu hao 1 vật phẩm trong túi đồ Sinh tồn
            if (this.player.gameMode === 'survival') {
                this.player.removeItem(blockToPlace, 1);
            }

            // Cập nhật thế giới
            this.world.updateChunks(this.player.position.x, this.player.position.z);
        }
    }

    /**
     * Cập nhật tiến trình đào khối theo thời gian dựa trên độ cứng
     */
    updateMining(dt) {
        const isMiningActive = this.isMiningPressed || this.mobileMiningActive;

        // Nếu không bấm phím đào hoặc không nhắm trúng khối nào
        if (!isMiningActive || !this.targetedBlock || !this.targetedBlock.hit) {
            this.resetMining();
            return;
        }

        const { x, y, z } = this.targetedBlock;
        const blockId = this.world.getBlock(x, y, z);

        // Không đào được không khí
        if (blockId === 0) {
            this.resetMining();
            return;
        }

        // Kiểm tra xem có đang tiếp tục đào khối cũ ở khung hình trước không
        const isSameBlock = this.miningBlockCoords &&
                            this.miningBlockCoords.x === x &&
                            this.miningBlockCoords.y === y &&
                            this.miningBlockCoords.z === z;

        if (!isSameBlock) {
            // Bắt đầu đào khối mới
            this.miningBlockCoords = { x, y, z };
            this.miningProgress = 0;
            this.miningTimeNeeded = this.getBlockHardness(blockId);

            // Sáng tạo phá block ngay lập tức (0 giây)
            if (this.player.gameMode === 'creative') {
                this.miningTimeNeeded = 0;
            }
        }

        // Tích luỹ tiến trình thời gian đào khối
        this.miningProgress += dt;

        // Vẽ đồ họa tiến trình đào (vòng tròn tiến độ SVG)
        const circle = document.getElementById('miningProgressCircle');
        if (circle && this.miningTimeNeeded > 0) {
            const ratio = Math.min(1.0, this.miningProgress / this.miningTimeNeeded);
            // Chu vi hình tròn r=12 là 75.4. Đưa dashoffset từ 75.4 (chưa đào) về 0 (đào xong)
            circle.style.strokeDashoffset = 75.4 - (ratio * 75.4);
        }

        // Đào xong khối
        if (this.miningProgress >= this.miningTimeNeeded) {
            this.handleBlockBreak();
            this.resetMining();
        }
    }

    /**
     * Reset toàn bộ trạng thái đào khối
     */
    resetMining() {
        this.miningBlockCoords = null;
        this.miningProgress = 0;
        this.miningTimeNeeded = 0;

        const circle = document.getElementById('miningProgressCircle');
        if (circle) {
            circle.style.strokeDashoffset = 75.4; // Đưa vòng tiến độ về ẩn hoàn toàn
        }
    }

    /**
     * Lấy độ cứng (thời gian đào - giây) của từng loại khối voxel
     */
    getBlockHardness(blockId) {
        // Kiểm tra xem người chơi có đang cầm Cúp Đá (stone_pickaxe) không
        const activeItem = this.hotbarBlocks[this.selectedSlot];
        const hasPickaxe = (activeItem === 'stone_pickaxe');
        
        // Cúp đá giúp tăng tốc độ khai thác đá và quặng gấp 4 lần (giảm 75% thời gian đào)
        const speedMultiplier = hasPickaxe ? 4.0 : 1.0;

        switch (blockId) {
            case 5:  // Khối Lá sồi
            case 7:  // Khối Kính
                return 0.1; // Khối cực giòn, đào tức thì
            case 15: // Len Đỏ
            case 16: // Len Xanh
                return 0.2;
            case 1:  // Khối Cỏ
            case 2:  // Khối Đất
            case 8:  // Khối Cát
            case 17: // Đá Phát Sáng
                return 0.3;
            case 10: // Khối Ván Gỗ
                return 0.6;
            case 4:  // Khối Gỗ sồi
                return 0.8;
            case 3:  // Khối Đá thường
            case 9:  // Khối Đá cuội
                return 1.5 / speedMultiplier;
            case 6:  // Khối Gạch đỏ
            case 11: // Quặng Than
                return 1.8 / speedMultiplier;
            case 12: // Quặng Sắt
                return 2.0 / speedMultiplier;
            case 13: // Quặng Vàng
                return 2.2 / speedMultiplier;
            case 14: // Quặng Kim cương
                return 2.5 / speedMultiplier;
            case 18: // Đá Hắc Diệu Thạch (Obsidian - khối siêu cứng)
                return 5.0 / speedMultiplier;
            default:
                return 0.5;
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
        const isGameInputActive = this.player.controls.isLocked || (this.player.isTouchDevice && this.gamePlaying);
        if (this.mobManager && isGameInputActive) {
            this.mobManager.update(this.player, dt);
        }

        // 3. Cập nhật vị trí camera theo sát người chơi
        this.player.updateCameraPosition();

        // 4. Quét tia Raycast để ngắm khối
        this.updateRaycasting();

        // 4.5 Cập nhật tiến trình đào khối theo thời gian
        this.updateMining(dt);

        // 5. Cập nhật chu kỳ ngày đêm
        this.updateDayNightCycle(dt);

        // 6. Cập nhật sinh các mảnh chunk mới quanh người chơi
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

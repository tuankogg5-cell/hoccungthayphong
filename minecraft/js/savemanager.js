/**
 * SaveManager — Lưu & Tải thế giới Minecraft vào IndexedDB
 * ==========================================================
 * - Chỉ lưu DELTA (block người chơi thay đổi), không lưu địa hình gốc
 * - Auto-save mỗi 30 giây khi đang chơi
 * - Lưu vị trí player, inventory, HP, gameMode
 */
class SaveManager {
    constructor(game) {
        this.game      = game;
        this.DB_NAME   = 'MinecraftWebDB';
        this.DB_VER    = 1;
        this.db        = null;
        this.autoSaveTimer = 0;
        this.AUTO_SAVE_INTERVAL = 30; // giây
        this.isSaving  = false;
        this.lastSaveTime = null;

        // Track block changes (delta so với địa hình sinh ra)
        // Map: "x,y,z" => blockId
        this.blockChanges = new Map();

        this._open();
    }

    // =========================================================================
    // MỞ DATABASE
    // =========================================================================
    _open() {
        return new Promise((res, rej) => {
            const req = indexedDB.open(this.DB_NAME, this.DB_VER);

            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('worlds'))
                    db.createObjectStore('worlds', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('players'))
                    db.createObjectStore('players', { keyPath: 'id' });
            };

            req.onsuccess = (e) => {
                this.db = e.target.result;
                console.log('[SaveManager] IndexedDB mở thành công.');
                res(this.db);
            };

            req.onerror = (e) => {
                console.error('[SaveManager] Không mở được IndexedDB:', e);
                rej(e);
            };
        });
    }

    // =========================================================================
    // THEO DÕI THAY ĐỔI KHỐI
    // =========================================================================
    recordBlockChange(x, y, z, blockId) {
        this.blockChanges.set(`${x},${y},${z}`, blockId);
    }

    // =========================================================================
    // LƯU GAME
    // =========================================================================
    async save() {
        if (!this.db || this.isSaving) return;
        this.isSaving = true;

        try {
            const player = this.game.player;
            const pos    = player.position;

            // --- Lưu world delta ---
            const worldData = {
                id: 'world1',
                blockChanges: Array.from(this.blockChanges.entries()), // [[key, val], ...]
                savedAt: Date.now()
            };

            // --- Lưu player state ---
            const playerData = {
                id: 'player1',
                x: pos.x, y: pos.y, z: pos.z,
                rotY: player.camera.rotation.y,
                rotX: player.camera.rotation.x,
                hp: player.hp,
                gameMode: player.gameMode,
                inventory: JSON.stringify(player.inventory),
                hotbarBlocks: JSON.stringify(this.game.hotbarBlocks),
                selectedSlot: this.game.selectedSlot,
                flightMode: player.flightMode,
                savedAt: Date.now()
            };

            await this._put('worlds',  worldData);
            await this._put('players', playerData);

            this.lastSaveTime = new Date();
            this._flashSaveIcon('✅ Đã lưu!', '#22cc66');
        } catch (err) {
            console.error('[SaveManager] Lỗi lưu:', err);
            this._flashSaveIcon('❌ Lỗi lưu!', '#cc2222');
        } finally {
            this.isSaving = false;
        }
    }

    // =========================================================================
    // TẢI GAME
    // =========================================================================
    async load() {
        if (!this.db) return false;

        try {
            const worldData  = await this._get('worlds',  'world1');
            const playerData = await this._get('players', 'player1');

            if (!worldData || !playerData) {
                this._flashSaveIcon('📂 Chưa có save!', '#f0a500');
                return false;
            }

            // --- Khôi phục block changes ---
            this.blockChanges = new Map(worldData.blockChanges);
            for (const [key, blockId] of this.blockChanges.entries()) {
                const [x, y, z] = key.split(',').map(Number);
                this.game.world.setBlock(x, y, z, blockId);
            }
            this.game.world.updateChunks(playerData.x, playerData.z);

            // --- Khôi phục player ---
            const player = this.game.player;
            player.position.set(playerData.x, playerData.y, playerData.z);
            player.camera.rotation.y = playerData.rotY;
            player.camera.rotation.x = playerData.rotX;
            player.updateCameraPosition();

            player.hp        = playerData.hp;
            player.flightMode = playerData.flightMode;
            player.inventory = JSON.parse(playerData.inventory);

            const gameMode = playerData.gameMode;
            this.game.hotbarBlocks  = JSON.parse(playerData.hotbarBlocks);
            this.game.selectedSlot  = playerData.selectedSlot;
            player.gameMode = gameMode;
            player.updateHealthHUD();
            this.game.updateHotbarHUD();
            this.game.selectHotbarSlot(playerData.selectedSlot);

            const dt = this._formatTime(worldData.savedAt);
            this._flashSaveIcon(`📂 Đã tải! (${dt})`, '#22aaff');
            return true;
        } catch (err) {
            console.error('[SaveManager] Lỗi tải:', err);
            this._flashSaveIcon('❌ Lỗi tải!', '#cc2222');
            return false;
        }
    }

    // =========================================================================
    // AUTO SAVE (gọi từ game.animate)
    // =========================================================================
    tick(dt) {
        const isActive = this.game.player.controls.isLocked ||
                         (this.game.player.isTouchDevice && this.game.gamePlaying) ||
                         this.game.bodyTrackingMode;
        if (!isActive) return;

        this.autoSaveTimer += dt;
        if (this.autoSaveTimer >= this.AUTO_SAVE_INTERVAL) {
            this.autoSaveTimer = 0;
            this.save();
        }

        // Cập nhật countdown trong UI
        this._updateCountdown();
    }

    // =========================================================================
    // XÓA SAVE
    // =========================================================================
    async deleteSave() {
        if (!this.db) return;
        try {
            await this._delete('worlds',  'world1');
            await this._delete('players', 'player1');
            this.blockChanges.clear();
            this._flashSaveIcon('🗑️ Đã xóa save!', '#f0a500');
        } catch(e) {
            console.error('[SaveManager] Lỗi xóa:', e);
        }
    }

    // =========================================================================
    // INDEXEDDB HELPERS
    // =========================================================================
    _put(storeName, data) {
        return new Promise((res, rej) => {
            const tx  = this.db.transaction(storeName, 'readwrite');
            const req = tx.objectStore(storeName).put(data);
            req.onsuccess = () => res();
            req.onerror   = (e) => rej(e);
        });
    }

    _get(storeName, key) {
        return new Promise((res, rej) => {
            const tx  = this.db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).get(key);
            req.onsuccess = (e) => res(e.target.result);
            req.onerror   = (e) => rej(e);
        });
    }

    _delete(storeName, key) {
        return new Promise((res, rej) => {
            const tx  = this.db.transaction(storeName, 'readwrite');
            const req = tx.objectStore(storeName).delete(key);
            req.onsuccess = () => res();
            req.onerror   = (e) => rej(e);
        });
    }

    // =========================================================================
    // UI HELPERS
    // =========================================================================
    _flashSaveIcon(text, color) {
        const el = document.getElementById('saveStatusMsg');
        if (!el) return;
        el.textContent  = text;
        el.style.color  = color;
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
        clearTimeout(this._flashTimer);
        this._flashTimer = setTimeout(() => {
            el.style.opacity   = '0';
            el.style.transform = 'translateY(-10px)';
        }, 3000);
    }

    _updateCountdown() {
        const el = document.getElementById('autoSaveCountdown');
        if (!el) return;
        const remaining = Math.ceil(this.AUTO_SAVE_INTERVAL - this.autoSaveTimer);
        el.textContent = `Auto-save: ${remaining}s`;
    }

    _formatTime(ts) {
        const d = new Date(ts);
        return `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
    }
}

/**
 * QuestManager — Hệ thống nhiệm vụ
 * ===================================
 * Quest tracker HUD góc phải dưới màn hình.
 * Mỗi quest hoàn thành → animation + phần thưởng.
 */
class QuestManager {
    constructor(game) {
        this.game    = game;
        this.quests  = this._defineQuests();
        this.active  = null;  // quest đang làm
        this.done    = new Set(); // id quest đã xong
        this.panel   = null;

        this._buildUI();
        this._activateNext();
    }

    // =========================================================================
    // ĐỊNH NGHĨA QUEST
    // =========================================================================
    _defineQuests() {
        return [
            {
                id: 'mine_stone',
                icon: '⛏️',
                title: 'Thợ Khai Thác',
                desc: 'Đào 10 khối đá',
                goal: 10,
                progress: 0,
                type: 'break',      // loại sự kiện
                blockIds: [3, 9],   // ID khối cần đào
                reward: { blockId: 9, amount: 8, name: '8 đá cuội' },
            },
            {
                id: 'place_blocks',
                icon: '🧱',
                title: 'Nhà Xây Dựng',
                desc: 'Đặt 15 khối bất kỳ',
                goal: 15,
                progress: 0,
                type: 'place',
                blockIds: null,     // null = bất kỳ khối nào
                reward: { blockId: 5, amount: 10, name: '10 gỗ' },
            },
            {
                id: 'kill_zombies',
                icon: '⚔️',
                title: 'Thợ Săn',
                desc: 'Tiêu diệt 3 zombie',
                goal: 3,
                progress: 0,
                type: 'kill',
                blockIds: null,
                reward: { itemId: 'iron_sword', amount: 1, name: '1 Kiếm Sắt' },
            },
            {
                id: 'build_house',
                icon: '🏗️',
                title: 'Kiến Trúc Sư',
                desc: 'Đặt 25 khối gỗ',
                goal: 25,
                progress: 0,
                type: 'place',
                blockIds: [5, 6, 10, 16],
                reward: { itemId: 'diamond_pickaxe', amount: 1, name: '1 Cuốc Kim Cương' },
            },
            {
                id: 'explorer',
                icon: '🔭',
                title: 'Nhà Khám Phá',
                desc: 'Di chuyển 100 blocks',
                goal: 100,
                progress: 0,
                type: 'walk',
                blockIds: null,
                reward: { blockId: 18, amount: 20, name: '20 gạch đỏ' },
            },
            {
                id: 'mine_diamond',
                icon: '💎',
                title: 'Thợ Mỏ Huyền Thoại',
                desc: 'Tìm 3 quặng kim cương',
                goal: 3,
                progress: 0,
                type: 'break',
                blockIds: [14],
                reward: { itemId: 'diamond_sword', amount: 1, name: '1 Kiếm Kim Cương' },
            },
        ];
    }

    // =========================================================================
    // KÍCH HOẠT QUEST TIẾP THEO
    // =========================================================================
    _activateNext() {
        for (const q of this.quests) {
            if (!this.done.has(q.id)) {
                this.active = q;
                this._renderUI();
                return;
            }
        }
        // Tất cả quest xong
        this.active = null;
        this._renderComplete();
    }

    // =========================================================================
    // CÁC HÀM BÁO SỰ KIỆN (gọi từ game.js)
    // =========================================================================
    onBlockBreak(blockId) {
        if (!this.active || this.active.type !== 'break') return;
        if (this.active.blockIds && !this.active.blockIds.includes(blockId)) return;
        this._increment();
    }

    onBlockPlace(blockId) {
        if (!this.active || this.active.type !== 'place') return;
        if (this.active.blockIds && !this.active.blockIds.includes(blockId)) return;
        this._increment();
    }

    onMobKill() {
        if (!this.active || this.active.type !== 'kill') return;
        this._increment();
    }

    onWalk(distDelta) {
        if (!this.active || this.active.type !== 'walk') return;
        this.active.progress = Math.min(this.active.goal, this.active.progress + distDelta);
        this._renderUI();
        if (this.active.progress >= this.active.goal) this._complete();
    }

    _increment() {
        if (!this.active) return;
        this.active.progress = Math.min(this.active.goal, this.active.progress + 1);
        this._renderUI();
        if (this.active.progress >= this.active.goal) this._complete();
    }

    // =========================================================================
    // HOÀN THÀNH QUEST
    // =========================================================================
    _complete() {
        const q = this.active;
        this.done.add(q.id);

        // Trao phần thưởng
        this._giveReward(q.reward);

        // Thông báo hoàn thành
        this._showCompleteBanner(q);

        // Chuyển quest mới sau 3s
        setTimeout(() => {
            this._activateNext();
        }, 3000);

        this.active = null;
        this._renderUI();
    }

    _giveReward(reward) {
        const player = this.game.player;
        if (!reward) return;

        if (reward.blockId) {
            player.addItem(reward.blockId, reward.amount);
        } else if (reward.itemId) {
            player.addItem(reward.itemId, reward.amount);
            // Gán vào hotbar nếu có thể
            const hotbar = this.game.hotbarBlocks;
            for (let i = 0; i < 9; i++) {
                if (!hotbar[i]) { hotbar[i] = reward.itemId; break; }
            }
            this.game.updateHotbarHUD();
        }
    }

    // =========================================================================
    // UI
    // =========================================================================
    _buildUI() {
        const old = document.getElementById('questPanel');
        if (old) old.remove();

        this.panel = document.createElement('div');
        this.panel.id = 'questPanel';
        this.panel.innerHTML = `
            <div class="qp-header">
                <span class="qp-title">📜 Nhiệm Vụ</span>
                <button class="qp-toggle" id="qpToggle">−</button>
            </div>
            <div id="qpBody"></div>
        `;
        document.body.appendChild(this.panel);

        let collapsed = false;
        document.getElementById('qpToggle').onclick = () => {
            collapsed = !collapsed;
            document.getElementById('qpBody').style.display = collapsed ? 'none' : '';
            document.getElementById('qpToggle').textContent = collapsed ? '+' : '−';
        };
    }

    _renderUI() {
        const body = document.getElementById('qpBody');
        if (!body) return;

        if (!this.active) {
            body.innerHTML = '<div class="qp-empty">✅ Tất cả quest xong!</div>';
            return;
        }

        const q    = this.active;
        const pct  = Math.min(100, Math.floor((q.progress / q.goal) * 100));
        const done = this.done.size;
        const total = this.quests.length;

        body.innerHTML = `
            <div class="qp-progress-overall">${done}/${total} quest hoàn thành</div>
            <div class="qp-quest-card">
                <div class="qp-quest-icon">${q.icon}</div>
                <div class="qp-quest-info">
                    <div class="qp-quest-title">${q.title}</div>
                    <div class="qp-quest-desc">${q.desc}</div>
                    <div class="qp-bar-wrap">
                        <div class="qp-bar" style="width:${pct}%"></div>
                    </div>
                    <div class="qp-count">${Math.floor(q.progress)} / ${q.goal}</div>
                </div>
            </div>
            <div class="qp-reward">
                🎁 Thưởng: <strong>${q.reward.name}</strong>
            </div>
        `;
    }

    _renderComplete() {
        const body = document.getElementById('qpBody');
        if (!body) return;
        body.innerHTML = `
            <div class="qp-all-done">
                🏆 Bạn đã hoàn thành<br>tất cả nhiệm vụ!<br>
                <span style="font-size:28px">🎉</span>
            </div>
        `;
    }

    _showCompleteBanner(q) {
        // Xóa banner cũ nếu có
        const old = document.getElementById('questCompleteBanner');
        if (old) old.remove();

        const banner = document.createElement('div');
        banner.id = 'questCompleteBanner';
        banner.innerHTML = `
            <div class="qcb-inner">
                <div class="qcb-icon">${q.icon}</div>
                <div class="qcb-text">
                    <div class="qcb-label">NHIỆM VỤ HOÀN THÀNH!</div>
                    <div class="qcb-title">${q.title}</div>
                    <div class="qcb-reward">+${q.reward.name}</div>
                </div>
            </div>
        `;
        document.body.appendChild(banner);

        // Animate in
        requestAnimationFrame(() => {
            banner.classList.add('qcb-show');
        });

        // Animate out sau 3s
        setTimeout(() => {
            banner.classList.remove('qcb-show');
            banner.classList.add('qcb-hide');
            setTimeout(() => banner.remove(), 600);
        }, 3000);
    }

    // =========================================================================
    // WALK TRACKING (gọi từ game.animate)
    // =========================================================================
    _lastPos = null;
    tickWalk() {
        if (!this.active || this.active.type !== 'walk') return;
        const pos = this.game.player.position;
        if (this._lastPos) {
            const dx = pos.x - this._lastPos.x;
            const dz = pos.z - this._lastPos.z;
            const d  = Math.sqrt(dx*dx + dz*dz);
            if (d > 0.05 && d < 5) { // tránh teleport
                this.onWalk(d);
            }
        }
        this._lastPos = { x: pos.x, y: pos.y, z: pos.z };
    }
}

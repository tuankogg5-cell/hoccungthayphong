/**
 * BodyTracker - Điều khiển game Minecraft bằng body tracking (MediaPipe Pose)
 * ============================================================================
 * GESTURE MAP:
 *  - Nâng chân TRÁI               -> Đi trái
 *  - Nâng chân PHẢI               -> Đi phải
 *  - Nâng CẢ HAI chân (bước tại chỗ) -> Tiến
 *  - Đánh tay PHẢI nhanh          -> Phá khối (Left Click)
 *  - Đánh tay TRÁI nhanh          -> Đặt khối (Right Click)
 *  - Di chuyển ĐẦU                -> Xoay tầm nhìn camera
 */
class BodyTracker {
    constructor(gameInstance) {
        this.game = gameInstance;
        this.active = false;
        this.initialized = false;

        // ---- Camera & Canvas Preview ----
        this.videoEl = null;
        this.overlayCanvas = null;
        this.overlayCtx = null;

        // ---- MediaPipe Pose ----
        this.pose = null;
        this.landmarks = null;

        // ---- Trạng thái điều khiển truyền ra game ----
        this.controls = {
            forward:  false,
            backward: false,
            left:     false,
            right:    false,
        };

        // ---- Head tracking -> xoay camera ----
        this.headCalibrated  = false;
        this.headNeutralX    = 0.5;
        this.headNeutralY    = 0.35;
        this.headSmoothX     = 0.5;
        this.headSmoothY     = 0.35;

        // ---- Leg: Knee raise ----
        // knee.y < hip.y - threshold => chân đó đang nhấc lên
        this.leftKneeRaised  = false;
        this.rightKneeRaised = false;
        this.KNEE_RAISE_THRESHOLD = 0.07;

        // ---- Punch detection (cổ tay nhanh) ----
        this.rightWristPrev      = null;
        this.leftWristPrev       = null;
        this.rightPunchCooldown  = 0;
        this.leftPunchCooldown   = 0;
        this.PUNCH_COOLDOWN_MS   = 700;
        this.PUNCH_SPEED_THRESHOLD = 0.045;

        // ---- Internal flags ----
        this._punchFired = false;
        this._placeFired = false;
        this.lastFrameTime = 0;

        // ---- UI ----
        this.panel        = null;
        this.statusDot    = null;
        this.gestureLabel = null;
    }

    // =========================================================================
    // KHỞI ĐỘNG
    // =========================================================================
    async init() {
        if (this.initialized) return;
        this.initialized = true;
        this._createUI();
        this._setStatus('loading', 'Đang khởi tạo camera...');

        try {
            await this._setupCamera();
            this._setStatus('loading', 'Đang tải mô hình AI...');
            await this._setupPose();

            this.active = true;
            // Kích hoạt body-tracking mode để game chấp nhận input
            this.game.bodyTrackingMode = true;
            this.game.gamePlaying      = true;

            // Ẩn màn hình bắt đầu / tạm dừng nếu đang hiện
            const startScreen = document.getElementById('startScreen');
            const pauseScreen = document.getElementById('pauseScreen');
            if (startScreen) startScreen.classList.add('hidden');
            if (pauseScreen)  pauseScreen.classList.add('hidden');

            this._setStatus('active', 'Body Tracking đang hoạt động ✓');
            setTimeout(() => this._calibrateHead(), 1500);
        } catch (err) {
            this._setStatus('error', 'Lỗi: ' + err.message);
            console.error('[BodyTracker] Init error:', err);
        }
    }

    // =========================================================================
    // UI PANEL
    // =========================================================================
    _createUI() {
        const old = document.getElementById('bodyTrackingPanel');
        if (old) old.remove();

        this.panel = document.createElement('div');
        this.panel.id = 'bodyTrackingPanel';
        this.panel.innerHTML = `
            <div class="bt-header">
                <span class="bt-dot" id="btDot"></span>
                <span class="bt-title">🕺 Body Tracking</span>
                <button class="bt-calibrate-btn" id="btCalibrateBtn" title="Căn chỉnh vị trí đầu">⊙ Căn</button>
                <button class="bt-close-btn" id="btCloseBtn" title="Tắt">✕</button>
            </div>
            <div class="bt-status" id="btStatus">Đang khởi động...</div>
            <div class="bt-preview-wrap">
                <video id="btVideo" autoplay muted playsinline></video>
                <canvas id="btOverlay"></canvas>
                <div class="bt-gesture-badge" id="btGestureBadge">—</div>
            </div>
            <div class="bt-legend">
                <div class="bt-leg-item"><span class="bt-leg-key">🦵L</span> Đi trái</div>
                <div class="bt-leg-item"><span class="bt-leg-key">🦵R</span> Đi phải</div>
                <div class="bt-leg-item"><span class="bt-leg-key">🦵🦵</span> Tiến</div>
                <div class="bt-leg-item"><span class="bt-leg-key">👊R</span> Phá khối</div>
                <div class="bt-leg-item"><span class="bt-leg-key">👊L</span> Đặt khối</div>
                <div class="bt-leg-item"><span class="bt-leg-key">👤 Đầu</span> Xoay nhìn</div>
            </div>
        `;

        if (!document.getElementById('btStyles')) {
            const style = document.createElement('style');
            style.id = 'btStyles';
            style.textContent = `
                #bodyTrackingPanel {
                    position: fixed;
                    top: 14px; right: 14px;
                    width: 230px;
                    background: rgba(8,10,20,0.92);
                    border: 1px solid rgba(100,200,255,0.28);
                    border-radius: 14px;
                    padding: 12px;
                    z-index: 9999;
                    font-family: 'Outfit', sans-serif;
                    color: #e0eeff;
                    backdrop-filter: blur(12px);
                    box-shadow: 0 8px 32px rgba(0,140,255,0.18), inset 0 0 0 1px rgba(255,255,255,0.04);
                    user-select: none;
                }
                .bt-header { display:flex; align-items:center; gap:7px; margin-bottom:8px; }
                .bt-dot {
                    width:10px; height:10px; border-radius:50%;
                    background:#444; flex-shrink:0; transition:background 0.3s;
                }
                .bt-dot.loading { background:#f0a500; animation:btPulse 0.7s infinite alternate; }
                .bt-dot.active  { background:#22ee77; animation:btPulse 1.4s infinite alternate; }
                .bt-dot.error   { background:#ee3333; }
                @keyframes btPulse { from{opacity:.4} to{opacity:1} }
                .bt-title { font-size:12px; font-weight:700; flex:1; color:#7dc8ff; letter-spacing:.3px; }
                .bt-calibrate-btn, .bt-close-btn {
                    background:rgba(255,255,255,0.07);
                    border:1px solid rgba(255,255,255,0.12);
                    color:#ccc; border-radius:6px;
                    padding:3px 7px; font-size:10px;
                    cursor:pointer; transition:all 0.2s;
                }
                .bt-calibrate-btn:hover { background:rgba(80,200,255,0.22); color:#fff; }
                .bt-close-btn:hover     { background:rgba(255,60,60,0.22);  color:#ff8888; }
                .bt-status { font-size:10.5px; color:#88aacc; margin-bottom:7px; min-height:15px; }
                .bt-preview-wrap {
                    position:relative; width:100%; border-radius:8px;
                    overflow:hidden; background:#000; margin-bottom:8px;
                    box-shadow: 0 2px 12px rgba(0,0,0,0.5);
                }
                #btVideo  { width:100%; display:block; border-radius:8px; transform:scaleX(-1); }
                #btOverlay {
                    position:absolute; top:0; left:0;
                    width:100%; height:100%; pointer-events:none;
                    transform:scaleX(-1);
                }
                .bt-gesture-badge {
                    position:absolute; bottom:6px; left:50%;
                    transform:translateX(-50%);
                    background:rgba(0,0,0,0.72);
                    color:#fff; border-radius:20px;
                    padding:3px 12px; font-size:10px;
                    font-weight:600; white-space:nowrap;
                    pointer-events:none; letter-spacing:.4px;
                    border: 1px solid rgba(100,200,255,0.2);
                }
                .bt-legend { display:grid; grid-template-columns:1fr 1fr; gap:4px 8px; }
                .bt-leg-item { display:flex; align-items:center; gap:5px; font-size:9.5px; color:#7fa8c0; }
                .bt-leg-key {
                    background:rgba(255,255,255,0.09);
                    border:1px solid rgba(255,255,255,0.12);
                    border-radius:4px; padding:1px 5px;
                    font-size:9px; white-space:nowrap;
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(this.panel);

        document.getElementById('btCloseBtn').addEventListener('click', () => this.destroy());
        document.getElementById('btCalibrateBtn').addEventListener('click', () => this._calibrateHead());

        this.statusDot    = document.getElementById('btDot');
        this.gestureLabel = document.getElementById('btGestureBadge');
    }

    _setStatus(state, text) {
        const el = document.getElementById('btStatus');
        if (el) el.textContent = text;
        if (this.statusDot) this.statusDot.className = 'bt-dot ' + state;
    }

    // =========================================================================
    // CAMERA
    // =========================================================================
    async _setupCamera() {
        this.videoEl      = document.getElementById('btVideo');
        this.overlayCanvas = document.getElementById('btOverlay');
        this.overlayCtx    = this.overlayCanvas.getContext('2d');

        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width:320, height:240, facingMode:'user' },
            audio: false
        });
        this.videoEl.srcObject = stream;
        await new Promise(res => this.videoEl.addEventListener('loadeddata', res, { once:true }));
        this.overlayCanvas.width  = this.videoEl.videoWidth  || 320;
        this.overlayCanvas.height = this.videoEl.videoHeight || 240;
    }

    // =========================================================================
    // MEDIAPIPE POSE
    // =========================================================================
    async _setupPose() {
        if (typeof Pose === 'undefined') {
            throw new Error('MediaPipe Pose chưa được tải. Kiểm tra kết nối internet!');
        }
        this.pose = new Pose({
            locateFile: (file) =>
                `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`
        });
        this.pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            enableSegmentation: false,
            minDetectionConfidence: 0.6,
            minTrackingConfidence:  0.6
        });
        this.pose.onResults((r) => this._onPoseResults(r));
        await this.pose.initialize();
        this._startFrameLoop();
    }

    _startFrameLoop() {
        const loop = async () => {
            if (!this.active) return;
            if (this.videoEl && this.videoEl.readyState >= 2) {
                try { await this.pose.send({ image: this.videoEl }); } catch(e) {}
            }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    // =========================================================================
    // XỬ LÝ KẾT QUẢ POSE
    // =========================================================================
    _onPoseResults(results) {
        this._drawOverlay(results);

        if (!results.poseLandmarks || results.poseLandmarks.length < 29) {
            this._clearMovement();
            this._updateGestureLabel('Không thấy người 👤');
            return;
        }

        this.landmarks = results.poseLandmarks;
        const lm = this.landmarks;

        // MediaPipe Pose landmark indices:
        // 0:nose  11:l_shoulder 12:r_shoulder
        // 13:l_elbow 14:r_elbow  15:l_wrist  16:r_wrist
        // 23:l_hip   24:r_hip    25:l_knee   26:r_knee
        // 27:l_ankle 28:r_ankle

        this._processHead(lm[0]);
        this._processLegs(lm[23], lm[24], lm[25], lm[26]);
        this._processPunch(lm[15], lm[16]);  // left_wrist, right_wrist
        this._buildGestureLabel();
    }

    // =========================================================================
    // HEAD -> CAMERA ROTATION
    // =========================================================================
    _processHead(nose) {
        if (!nose || nose.visibility < 0.5) return;
        const alpha = 0.12;
        this.headSmoothX += (nose.x - this.headSmoothX) * alpha;
        this.headSmoothY += (nose.y - this.headSmoothY) * alpha;
        if (!this.headCalibrated) return;

        const dx = this.headSmoothX - this.headNeutralX;
        const dy = this.headSmoothY - this.headNeutralY;
        const dz = 0.025;
        const sensitivity = 1.5;

        const camDX = Math.abs(dx) > dz ? -(dx - Math.sign(dx) * dz) * sensitivity : 0;
        const camDY = Math.abs(dy) > dz ? -(dy - Math.sign(dy) * dz) * sensitivity : 0;

        if (this.game && this.game.player) {
            const cam = this.game.player.camera;
            cam.rotation.y += camDX * 0.012;
            cam.rotation.x += camDY * 0.012;
            const maxPitch = Math.PI / 2 - 0.05;
            cam.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, cam.rotation.x));
        }
    }

    _calibrateHead() {
        if (this.landmarks) {
            const nose = this.landmarks[0];
            if (nose && nose.visibility > 0.5) {
                this.headNeutralX = nose.x;
                this.headNeutralY = nose.y;
            }
        } else {
            this.headNeutralX = this.headSmoothX;
            this.headNeutralY = this.headSmoothY;
        }
        this.headCalibrated = true;
        this._setStatus('active', '✓ Đã căn chỉnh tầm nhìn!');
        setTimeout(() => this._setStatus('active', 'Body Tracking đang hoạt động ✓'), 2000);
    }

    // =========================================================================
    // LEGS -> MOVEMENT
    // =========================================================================
    _processLegs(leftHip, rightHip, leftKnee, rightKnee) {
        const T = this.KNEE_RAISE_THRESHOLD;

        this.leftKneeRaised  = !!(leftKnee  && leftHip  && leftKnee.visibility  > 0.4 && leftHip.visibility  > 0.4
                                  && (leftHip.y  - leftKnee.y)  > T);
        this.rightKneeRaised = !!(rightKnee && rightHip && rightKnee.visibility > 0.4 && rightHip.visibility > 0.4
                                  && (rightHip.y - rightKnee.y) > T);

        // Cả hai chân nhấc -> tiến
        if (this.leftKneeRaised && this.rightKneeRaised) {
            this.controls.forward  = true;
            this.controls.left     = false;
            this.controls.right    = false;
            this.controls.backward = false;
        }
        // Chỉ chân TRÁI nhấc -> đi trái (video mirrored -> trái camera = phải người)
        else if (this.leftKneeRaised) {
            this.controls.forward  = false;
            this.controls.right    = false;
            this.controls.left     = true;
            this.controls.backward = false;
        }
        // Chỉ chân PHẢI nhấc -> đi phải
        else if (this.rightKneeRaised) {
            this.controls.forward  = false;
            this.controls.left     = false;
            this.controls.right    = true;
            this.controls.backward = false;
        }
        // Không nhấc -> dừng
        else {
            this.controls.forward  = false;
            this.controls.backward = false;
            this.controls.left     = false;
            this.controls.right    = false;
        }
    }

    // =========================================================================
    // PUNCH -> BREAK / PLACE BLOCK
    // =========================================================================
    _processPunch(leftWrist, rightWrist) {
        const now = performance.now();

        // Tay PHẢI (rightWrist) -> Phá khối
        if (rightWrist && rightWrist.visibility > 0.5) {
            if (this.rightWristPrev) {
                const dx = rightWrist.x - this.rightWristPrev.x;
                const dy = rightWrist.y - this.rightWristPrev.y;
                const speed = Math.sqrt(dx*dx + dy*dy);
                if (speed > this.PUNCH_SPEED_THRESHOLD && now - this.rightPunchCooldown > this.PUNCH_COOLDOWN_MS) {
                    this.rightPunchCooldown = now;
                    this._doPunch();
                }
            }
            this.rightWristPrev = { x: rightWrist.x, y: rightWrist.y };
        }

        // Tay TRÁI (leftWrist) -> Đặt khối
        if (leftWrist && leftWrist.visibility > 0.5) {
            if (this.leftWristPrev) {
                const dx = leftWrist.x - this.leftWristPrev.x;
                const dy = leftWrist.y - this.leftWristPrev.y;
                const speed = Math.sqrt(dx*dx + dy*dy);
                if (speed > this.PUNCH_SPEED_THRESHOLD && now - this.leftPunchCooldown > this.PUNCH_COOLDOWN_MS) {
                    this.leftPunchCooldown = now;
                    this._doPlace();
                }
            }
            this.leftWristPrev = { x: leftWrist.x, y: leftWrist.y };
        }
    }

    _doPunch() {
        if (!this.game || this._punchFired) return;
        this._punchFired = true;
        // Kích hoạt đào khối giống mousedown
        const hitMob = this.game.handleAttack();
        if (!hitMob) {
            this.game.isMiningPressed = true;
            setTimeout(() => {
                this.game.isMiningPressed = false;
                this.game.resetMining && this.game.resetMining();
                this._punchFired = false;
            }, 350);
        } else {
            this._punchFired = false;
        }
    }

    _doPlace() {
        if (!this.game || this._placeFired) return;
        this._placeFired = true;
        this.game.handleBlockPlace();
        setTimeout(() => { this._placeFired = false; }, 500);
    }

    // =========================================================================
    // ÁP DỤNG CONTROLS VÀO GAME (gọi mỗi frame từ animate loop)
    // =========================================================================
    applyToGame() {
        if (!this.active || !this.game || !this.game.player) return;
        const k = this.game.player.keys;
        k.forward  = this.controls.forward;
        k.backward = this.controls.backward;
        k.left     = this.controls.left;
        k.right    = this.controls.right;
    }

    // =========================================================================
    // VẼ SKELETON OVERLAY
    // =========================================================================
    _drawOverlay(results) {
        const ctx = this.overlayCtx;
        const w   = this.overlayCanvas.width;
        const h   = this.overlayCanvas.height;
        ctx.clearRect(0, 0, w, h);

        if (!results.poseLandmarks) return;
        const lm = results.poseLandmarks;

        const connections = [
            [11,12],[11,13],[13,15],[12,14],[14,16],
            [11,23],[12,24],[23,24],
            [23,25],[25,27],[24,26],[26,28]
        ];

        ctx.strokeStyle = 'rgba(80,200,255,0.82)';
        ctx.lineWidth = 2;
        for (const [a, b] of connections) {
            if (!lm[a] || !lm[b] || lm[a].visibility < 0.3 || lm[b].visibility < 0.3) continue;
            ctx.beginPath();
            ctx.moveTo(lm[a].x * w, lm[a].y * h);
            ctx.lineTo(lm[b].x * w, lm[b].y * h);
            ctx.stroke();
        }

        const keyPoints = [0,11,12,13,14,15,16,23,24,25,26,27,28];
        for (const idx of keyPoints) {
            const p = lm[idx];
            if (!p || p.visibility < 0.3) continue;
            const active = (idx === 25 && this.leftKneeRaised) || (idx === 26 && this.rightKneeRaised);
            ctx.beginPath();
            ctx.arc(p.x * w, p.y * h, active ? 7 : 4, 0, Math.PI*2);
            ctx.fillStyle = active ? '#ffdd00' : 'rgba(255,255,255,0.9)';
            ctx.fill();
        }
        // Mũi màu đỏ cho head tracking
        const nose = lm[0];
        if (nose && nose.visibility > 0.4) {
            ctx.beginPath();
            ctx.arc(nose.x*w, nose.y*h, 6, 0, Math.PI*2);
            ctx.fillStyle = '#ff5577';
            ctx.fill();
        }
    }

    // =========================================================================
    // LABEL
    // =========================================================================
    _buildGestureLabel() {
        const parts = [];
        if (this.controls.forward)  parts.push('🚶 Tiến');
        if (this.controls.left)     parts.push('⬅️ Trái');
        if (this.controls.right)    parts.push('➡️ Phải');
        if (this.controls.backward) parts.push('🔙 Lùi');
        this._updateGestureLabel(parts.length ? parts.join(' | ') : '— Đứng yên —');
    }

    _updateGestureLabel(text) {
        if (this.gestureLabel) this.gestureLabel.textContent = text;
    }

    _clearMovement() {
        this.controls.forward = this.controls.backward = false;
        this.controls.left    = this.controls.right    = false;
        if (this.game && this.game.player) {
            const k = this.game.player.keys;
            k.forward = k.backward = k.left = k.right = false;
        }
    }

    // =========================================================================
    // HỦY
    // =========================================================================
    destroy() {
        this.active = false;
        this._clearMovement();
        if (this.game) {
            this.game.bodyTrackingMode = false;
        }
        if (this.videoEl && this.videoEl.srcObject) {
            this.videoEl.srcObject.getTracks().forEach(t => t.stop());
        }
        if (this.panel) this.panel.remove();
        if (this.pose) {
            try { this.pose.close(); } catch(e) {}
        }
        window.bodyTrackerInstance = null;
        console.log('[BodyTracker] Destroyed.');
    }
}

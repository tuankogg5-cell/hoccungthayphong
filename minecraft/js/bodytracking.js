/**
 * BodyTracker v2 - TensorFlow.js MoveNet
 * ============================================
 * Dùng MoveNet (Lightning) thay vì MediaPipe để tracking ổn định hơn.
 *
 * GESTURE MAP:
 *  - Nâng chân TRÁI               -> Đi trái
 *  - Nâng chân PHẢI               -> Đi phải
 *  - Nâng CẢ HAI chân             -> Tiến
 *  - Vung tay PHẢI nhanh          -> Phá khối
 *  - Vung tay TRÁI nhanh          -> Đặt khối
 *  - Di chuyển ĐẦU (mũi)          -> Xoay tầm nhìn camera
 *
 * MoveNet keypoint index:
 *  0:nose  1:l_eye  2:r_eye  3:l_ear  4:r_ear
 *  5:l_shoulder  6:r_shoulder
 *  7:l_elbow     8:r_elbow
 *  9:l_wrist     10:r_wrist
 *  11:l_hip      12:r_hip
 *  13:l_knee     14:r_knee
 *  15:l_ankle    16:r_ankle
 */
class BodyTracker {
    constructor(gameInstance) {
        this.game        = gameInstance;
        this.active      = false;
        this.initialized = false;

        // ---- Media elements ----
        this.videoEl       = null;
        this.overlayCanvas = null;
        this.overlayCtx    = null;

        // ---- TF Detector ----
        this.detector   = null;
        this.keypoints  = null;
        this._rafId     = null;

        // ---- Movement controls ----
        this.controls = { forward:false, backward:false, left:false, right:false };

        // ---- Head tracking ----
        this.headCalibrated = false;
        this.headNeutralX   = 0.5;
        this.headNeutralY   = 0.35;
        this.headSmoothX    = 0.5;
        this.headSmoothY    = 0.35;

        // ---- Knee raise ----
        this.leftKneeRaised  = false;
        this.rightKneeRaised = false;
        this.KNEE_THRESHOLD  = 0.06; // hip.y - knee.y > threshold => raised

        // ---- Punch ----
        this.rightWristPrev     = null;
        this.leftWristPrev      = null;
        this.rightPunchCooldown = 0;
        this.leftPunchCooldown  = 0;
        this.PUNCH_COOLDOWN_MS  = 650;
        this.PUNCH_SPEED_THR    = 0.04;
        this._punchFired        = false;
        this._placeFired        = false;

        // ---- UI ----
        this.panel        = null;
        this.statusDot    = null;
        this.gestureLabel = null;
    }

    // =========================================================================
    // INIT
    // =========================================================================
    async init() {
        if (this.initialized) return;
        this.initialized = true;
        this._buildUI();
        this._setStatus('loading', 'Đang bật camera...');

        try {
            await this._startCamera();
            this._setStatus('loading', 'Đang tải mô hình AI (MoveNet)...');
            await this._loadDetector();

            this.active                  = true;
            this.game.bodyTrackingMode   = true;
            this.game.gamePlaying        = true;

            // Ẩn menu
            ['startScreen','pauseScreen'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add('hidden');
            });

            this._setStatus('active', '✅ Body Tracking đang chạy!');
            this._runLoop();
            setTimeout(() => this._calibrateHead(), 2000);

        } catch (err) {
            this._setStatus('error', '❌ Lỗi: ' + err.message);
            console.error('[BodyTracker]', err);
        }
    }

    // =========================================================================
    // CAMERA
    // =========================================================================
    async _startCamera() {
        this.videoEl       = document.getElementById('btVideo');
        this.overlayCanvas = document.getElementById('btOverlay');
        this.overlayCtx    = this.overlayCanvas.getContext('2d');

        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width:320, height:240, facingMode:'user' },
            audio: false
        });
        this.videoEl.srcObject = stream;
        await new Promise((res, rej) => {
            this.videoEl.onloadeddata = res;
            setTimeout(() => rej(new Error('Camera timeout')), 10000);
        });
        this.overlayCanvas.width  = this.videoEl.videoWidth  || 320;
        this.overlayCanvas.height = this.videoEl.videoHeight || 240;
    }

    // =========================================================================
    // TF MOVENET DETECTOR
    // =========================================================================
    async _loadDetector() {
        if (typeof poseDetection === 'undefined') {
            throw new Error('poseDetection chưa load. Kiểm tra CDN!');
        }
        await tf.ready();
        const model   = poseDetection.SupportedModels.MoveNet;
        const config  = {
            modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
            enableSmoothing: true,
        };
        this.detector = await poseDetection.createDetector(model, config);
    }

    // =========================================================================
    // MAIN LOOP
    // =========================================================================
    async _runLoop() {
        if (!this.active) return;

        if (this.videoEl && this.videoEl.readyState >= 2 && this.detector) {
            try {
                const poses = await this.detector.estimatePoses(this.videoEl, {
                    maxPoses: 1,
                    flipHorizontal: true  // mirror vì camera selfie
                });
                if (poses && poses.length > 0) {
                    this.keypoints = poses[0].keypoints;
                    this._processAll(this.keypoints);
                    this._drawOverlay(this.keypoints);
                } else {
                    this._clearMovement();
                    this._updateGestureLabel('Không thấy người 👤');
                    this._clearCanvas();
                }
            } catch (e) {
                // bỏ qua lỗi frame riêng lẻ
            }
        }

        this._rafId = requestAnimationFrame(() => this._runLoop());
    }

    // =========================================================================
    // PROCESS ALL GESTURES
    // =========================================================================
    _processAll(kp) {
        const get = (idx) => (kp[idx] && kp[idx].score > 0.3) ? kp[idx] : null;

        const nose      = get(0);
        const lHip      = get(11), rHip  = get(12);
        const lKnee     = get(13), rKnee = get(14);
        const lWrist    = get(9),  rWrist = get(10);

        this._processHead(nose);
        this._processLegs(lHip, rHip, lKnee, rKnee);
        this._processPunch(lWrist, rWrist);
        this._buildGestureLabel();
    }

    // =========================================================================
    // HEAD -> CAMERA ROTATION
    // =========================================================================
    _processHead(nose) {
        if (!nose) return;

        // MoveNet trả tọa độ pixel, chuẩn hóa về [0,1]
        const nx = nose.x / (this.overlayCanvas.width  || 320);
        const ny = nose.y / (this.overlayCanvas.height || 240);

        const alpha = 0.14;
        this.headSmoothX += (nx - this.headSmoothX) * alpha;
        this.headSmoothY += (ny - this.headSmoothY) * alpha;

        if (!this.headCalibrated) return;

        const dx = this.headSmoothX - this.headNeutralX;
        const dy = this.headSmoothY - this.headNeutralY;
        const dz = 0.025; // dead zone

        const camDX = Math.abs(dx) > dz ? -(dx - Math.sign(dx)*dz) * 1.6 : 0;
        const camDY = Math.abs(dy) > dz ? -(dy - Math.sign(dy)*dz) * 1.6 : 0;

        if (this.game && this.game.player) {
            const cam = this.game.player.camera;
            cam.rotation.y += camDX * 0.013;
            cam.rotation.x += camDY * 0.013;
            const maxP = Math.PI / 2 - 0.05;
            cam.rotation.x = Math.max(-maxP, Math.min(maxP, cam.rotation.x));
        }
    }

    _calibrateHead() {
        if (this.keypoints) {
            const nose = this.keypoints[0];
            if (nose && nose.score > 0.3) {
                this.headNeutralX = nose.x / (this.overlayCanvas.width  || 320);
                this.headNeutralY = nose.y / (this.overlayCanvas.height || 240);
                this.headSmoothX  = this.headNeutralX;
                this.headSmoothY  = this.headNeutralY;
            }
        }
        this.headCalibrated = true;
        this._setStatus('active', '✅ Đã căn chỉnh! Bắt đầu chơi!');
        setTimeout(() => this._setStatus('active', '✅ Body Tracking đang chạy!'), 2500);
    }

    // =========================================================================
    // LEGS -> MOVEMENT
    // =========================================================================
    _processLegs(lHip, rHip, lKnee, rKnee) {
        // MoveNet tọa độ Y: nhỏ = trên, lớn = dưới
        // Khi nhấc chân lên: knee.y < hip.y
        const T = this.KNEE_THRESHOLD * (this.overlayCanvas.height || 240);

        this.leftKneeRaised  = !!(lHip && lKnee && (lHip.y - lKnee.y) > T);
        this.rightKneeRaised = !!(rHip && rKnee && (rHip.y - rKnee.y) > T);

        if (this.leftKneeRaised && this.rightKneeRaised) {
            // Cả hai chân -> tiến
            this.controls.forward  = true;
            this.controls.backward = false;
            this.controls.left     = false;
            this.controls.right    = false;
        } else if (this.leftKneeRaised) {
            // Chỉ chân trái -> đi trái
            this.controls.forward  = false;
            this.controls.backward = false;
            this.controls.left     = true;
            this.controls.right    = false;
        } else if (this.rightKneeRaised) {
            // Chỉ chân phải -> đi phải
            this.controls.forward  = false;
            this.controls.backward = false;
            this.controls.left     = false;
            this.controls.right    = true;
        } else {
            this.controls.forward  = false;
            this.controls.backward = false;
            this.controls.left     = false;
            this.controls.right    = false;
        }
    }

    // =========================================================================
    // PUNCH DETECTION
    // =========================================================================
    _processPunch(lWrist, rWrist) {
        const now = performance.now();
        const W   = this.overlayCanvas.width  || 320;
        const H   = this.overlayCanvas.height || 240;

        // Tay PHẢI -> phá khối
        if (rWrist) {
            const rx = rWrist.x / W, ry = rWrist.y / H;
            if (this.rightWristPrev) {
                const dx = rx - this.rightWristPrev.x;
                const dy = ry - this.rightWristPrev.y;
                if (Math.sqrt(dx*dx+dy*dy) > this.PUNCH_SPEED_THR &&
                    now - this.rightPunchCooldown > this.PUNCH_COOLDOWN_MS) {
                    this.rightPunchCooldown = now;
                    this._doPunch();
                }
            }
            this.rightWristPrev = { x:rx, y:ry };
        }

        // Tay TRÁI -> đặt khối
        if (lWrist) {
            const lx = lWrist.x / W, ly = lWrist.y / H;
            if (this.leftWristPrev) {
                const dx = lx - this.leftWristPrev.x;
                const dy = ly - this.leftWristPrev.y;
                if (Math.sqrt(dx*dx+dy*dy) > this.PUNCH_SPEED_THR &&
                    now - this.leftPunchCooldown > this.PUNCH_COOLDOWN_MS) {
                    this.leftPunchCooldown = now;
                    this._doPlace();
                }
            }
            this.leftWristPrev = { x:lx, y:ly };
        }
    }

    _doPunch() {
        if (!this.game || this._punchFired) return;
        this._punchFired = true;
        const hitMob = this.game.handleAttack();
        if (!hitMob) {
            this.game.isMiningPressed = true;
            setTimeout(() => {
                this.game.isMiningPressed = false;
                if (this.game.resetMining) this.game.resetMining();
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
    // ÁP DỤNG VÀO GAME (gọi mỗi frame)
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
    // VẼ SKELETON
    // =========================================================================
    _drawOverlay(kp) {
        const ctx = this.overlayCtx;
        const W   = this.overlayCanvas.width;
        const H   = this.overlayCanvas.height;
        ctx.clearRect(0, 0, W, H);

        const CONNECTIONS = [
            [5,6],[5,7],[7,9],[6,8],[8,10],      // tay
            [5,11],[6,12],[11,12],                 // vai-hông
            [11,13],[13,15],[12,14],[14,16]        // chân
        ];

        ctx.strokeStyle = 'rgba(80,210,255,0.85)';
        ctx.lineWidth   = 2;
        for (const [a,b] of CONNECTIONS) {
            const pa = kp[a], pb = kp[b];
            if (!pa || !pb || pa.score < 0.3 || pb.score < 0.3) continue;
            ctx.beginPath();
            ctx.moveTo(pa.x, pa.y);
            ctx.lineTo(pb.x, pb.y);
            ctx.stroke();
        }

        // Vẽ điểm
        const special = new Set([13,14,9,10]);
        for (let i = 0; i < kp.length; i++) {
            const p = kp[i];
            if (!p || p.score < 0.3) continue;
            const active =
                (i === 13 && this.leftKneeRaised) ||
                (i === 14 && this.rightKneeRaised);
            ctx.beginPath();
            ctx.arc(p.x, p.y, active ? 8 : (special.has(i) ? 5 : 3.5), 0, Math.PI*2);
            ctx.fillStyle = active ? '#ffdd00'
                          : (i === 0) ? '#ff5577'
                          : (special.has(i)) ? '#00ffcc'
                          : 'rgba(255,255,255,0.88)';
            ctx.fill();
        }
    }

    _clearCanvas() {
        if (this.overlayCtx)
            this.overlayCtx.clearRect(0,0,this.overlayCanvas.width,this.overlayCanvas.height);
    }

    // =========================================================================
    // GESTURE LABEL
    // =========================================================================
    _buildGestureLabel() {
        const p = [];
        if (this.controls.forward)  p.push('🚶 Tiến');
        if (this.controls.left)     p.push('⬅️ Trái');
        if (this.controls.right)    p.push('➡️ Phải');
        if (this.controls.backward) p.push('🔙 Lùi');
        this._updateGestureLabel(p.length ? p.join(' | ') : '— Đứng yên —');
    }

    _updateGestureLabel(t) {
        if (this.gestureLabel) this.gestureLabel.textContent = t;
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
    // STATUS
    // =========================================================================
    _setStatus(state, text) {
        const el = document.getElementById('btStatus');
        if (el) el.textContent = text;
        if (this.statusDot) this.statusDot.className = 'bt-dot ' + state;
    }

    // =========================================================================
    // UI PANEL
    // =========================================================================
    _buildUI() {
        const old = document.getElementById('bodyTrackingPanel');
        if (old) old.remove();

        this.panel = document.createElement('div');
        this.panel.id = 'bodyTrackingPanel';
        this.panel.innerHTML = `
            <div class="bt-header">
                <span class="bt-dot" id="btDot"></span>
                <span class="bt-title">🕺 Body Tracking</span>
                <button class="bt-cal-btn" id="btCalBtn">⊙ Căn</button>
                <button class="bt-x-btn"  id="btXBtn">✕</button>
            </div>
            <div class="bt-status" id="btStatus">Đang khởi động...</div>
            <div class="bt-wrap">
                <video id="btVideo" autoplay muted playsinline></video>
                <canvas id="btOverlay"></canvas>
                <div class="bt-badge" id="btBadge">—</div>
            </div>
            <div class="bt-legend">
                <div><span class="btk">🦵L</span> Đi trái</div>
                <div><span class="btk">🦵R</span> Đi phải</div>
                <div><span class="btk">🦵🦵</span> Tiến</div>
                <div><span class="btk">👊R</span> Phá khối</div>
                <div><span class="btk">👊L</span> Đặt khối</div>
                <div><span class="btk">👤</span> Xoay nhìn</div>
            </div>`;

        if (!document.getElementById('btCSS')) {
            const s = document.createElement('style');
            s.id = 'btCSS';
            s.textContent = `
            #bodyTrackingPanel{position:fixed;top:12px;right:12px;width:228px;
              background:rgba(7,10,20,.93);border:1px solid rgba(100,200,255,.3);
              border-radius:14px;padding:11px;z-index:9999;
              font-family:'Outfit',sans-serif;color:#ddeeff;
              backdrop-filter:blur(14px);
              box-shadow:0 8px 30px rgba(0,140,255,.2),inset 0 1px 0 rgba(255,255,255,.06);
              user-select:none;}
            .bt-header{display:flex;align-items:center;gap:6px;margin-bottom:7px;}
            .bt-dot{width:9px;height:9px;border-radius:50%;background:#444;flex-shrink:0;transition:background .3s;}
            .bt-dot.loading{background:#f0a500;animation:btp .7s infinite alternate;}
            .bt-dot.active{background:#22ee77;animation:btp 1.5s infinite alternate;}
            .bt-dot.error{background:#ee3333;}
            @keyframes btp{from{opacity:.35}to{opacity:1}}
            .bt-title{font-size:11.5px;font-weight:700;flex:1;color:#70ccff;letter-spacing:.3px;}
            .bt-cal-btn,.bt-x-btn{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);
              color:#bbb;border-radius:6px;padding:3px 7px;font-size:10px;cursor:pointer;transition:all .2s;}
            .bt-cal-btn:hover{background:rgba(80,200,255,.22);color:#fff;}
            .bt-x-btn:hover{background:rgba(255,60,60,.22);color:#f88;}
            .bt-status{font-size:10px;color:#7fa8cc;margin-bottom:6px;min-height:14px;}
            .bt-wrap{position:relative;width:100%;border-radius:8px;overflow:hidden;background:#000;margin-bottom:7px;
              box-shadow:0 2px 10px rgba(0,0,0,.5);}
            #btVideo{width:100%;display:block;border-radius:8px;transform:scaleX(-1);}
            #btOverlay{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;transform:scaleX(-1);}
            .bt-badge{position:absolute;bottom:5px;left:50%;transform:translateX(-50%);
              background:rgba(0,0,0,.75);color:#fff;border-radius:20px;padding:2px 11px;
              font-size:10px;font-weight:600;white-space:nowrap;pointer-events:none;
              border:1px solid rgba(100,200,255,.2);}
            .bt-legend{display:grid;grid-template-columns:1fr 1fr;gap:4px 6px;font-size:9.5px;color:#7fa8c0;}
            .btk{background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.12);
              border-radius:4px;padding:1px 5px;font-size:9px;}`;
            document.head.appendChild(s);
        }

        document.body.appendChild(this.panel);
        this.statusDot    = document.getElementById('btDot');
        this.gestureLabel = document.getElementById('btBadge');

        document.getElementById('btXBtn').onclick   = () => this.destroy();
        document.getElementById('btCalBtn').onclick = () => this._calibrateHead();
    }

    // =========================================================================
    // DESTROY
    // =========================================================================
    destroy() {
        this.active = false;
        this._clearMovement();
        if (this._rafId) cancelAnimationFrame(this._rafId);
        if (this.game) this.game.bodyTrackingMode = false;
        if (this.videoEl && this.videoEl.srcObject)
            this.videoEl.srcObject.getTracks().forEach(t => t.stop());
        if (this.detector) {
            try { this.detector.dispose(); } catch(e){}
        }
        if (this.panel) this.panel.remove();
        window.bodyTrackerInstance = null;
    }
}

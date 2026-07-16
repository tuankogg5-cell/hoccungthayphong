/**
 * Thư viện sinh nhiễu Perlin cải tiến (Improved Noise)
 * Phục vụ cho việc tạo địa hình 3D ngẫu nhiên tự nhiên (đồi núi, thung lũng, độ cao nhấp nhô)
 */
class ImprovedNoise {
    constructor() {
        this.p = new Uint8Array(512);
        // Bảng hoán vị ngẫu nhiên chuẩn (Permutation Table)
        const permutation = [
            151,160,137,91,90,15,131,13,201,95,96,53,194,233, 7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,
            190, 6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,
            136,171,168, 68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,
            46,245,40,244,102,143,54, 65,25,63,161, 1,216,80,73,209,76,132,187,208, 89,18,169,200,196,135,130,116,188,189,
            141,1,120,16,142,63,80,56,57,58,3,101,246,50,254,18,141,15,223,84,186,172,244,47,125,44,45,69,
            124,78,206,95,95,62,179,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,
            8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,
            33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,
            229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,
            132,187,208,89,18,169,200,196,135,130,116,188,189,141,101,246,50,254
        ];
        
        // Tạo bảng nhân đôi để tránh kiểm tra tràn mảng khi tra cứu
        for (let i = 0; i < 256; i++) {
            this.p[i] = permutation[i];
            this.p[256 + i] = permutation[i];
        }
    }

    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    lerp(t, a, b) {
        return a + t * (b - a);
    }

    grad(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    /**
     * Hàm sinh giá trị nhiễu 3D từ toạ độ x, y, z
     * Trả về giá trị trong khoảng [-1.0, 1.0]
     */
    noise(x, y, z = 0) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;

        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);

        const u = this.fade(x);
        const v = this.fade(y);
        const w = this.fade(z);

        const A = this.p[X] + Y;
        const AA = this.p[A & 255] + Z;
        const AB = this.p[(A + 1) & 255] + Z;
        const B = this.p[(X + 1) & 255] + Y;
        const BA = this.p[B & 255] + Z;
        const BB = this.p[(B + 1) & 255] + Z;

        return this.lerp(w, this.lerp(v, this.lerp(u, this.grad(this.p[AA & 255], x, y, z),
                                                      this.grad(this.p[BA & 255], x - 1, y, z)),
                                         this.lerp(u, this.grad(this.p[AB & 255], x, y - 1, z),
                                                      this.grad(this.p[BB & 255], x - 1, y - 1, z))),
                            this.lerp(v, this.lerp(u, this.grad(this.p[(AA + 1) & 255], x, y, z - 1),
                                                      this.grad(this.p[(BA + 1) & 255], x - 1, y, z - 1)),
                                         this.lerp(u, this.grad(this.p[(AB + 1) & 255], x, y - 1, z - 1),
                                                      this.grad(this.p[(BB + 1) & 255], x - 1, y - 1, z - 1))));
    }

    /**
     * Hàm tính tổng nhiễu FBM (Fractional Brownian Motion)
     * Thường dùng để kết hợp nhiều tầng nhiễu (octaves) cho chi tiết địa hình
     */
    fbm2d(x, y, octaves = 4, persistence = 0.5) {
        let total = 0;
        let frequency = 1;
        let amplitude = 1;
        let maxValue = 0; // Để chuẩn hoá về [0.0, 1.0] hoặc [-1.0, 1.0]

        for (let i = 0; i < octaves; i++) {
            total += this.noise(x * frequency, y * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= 2;
        }

        return total / maxValue;
    }
}

const SHA256_BLOCK_BYTES = 64;
const SHA256_LENGTH_BYTES = 8;

const INITIAL_HASH = new Uint32Array([
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
]);

const ROUND_CONSTANTS = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotateRight(value: number, bits: number) {
    return (value >>> bits) | (value << (32 - bits));
}

function choice(x: number, y: number, z: number) {
    return (x & y) ^ (~x & z);
}

function majority(x: number, y: number, z: number) {
    return (x & y) ^ (x & z) ^ (y & z);
}

function bigSigma0(value: number) {
    return rotateRight(value, 2) ^ rotateRight(value, 13) ^ rotateRight(value, 22);
}

function bigSigma1(value: number) {
    return rotateRight(value, 6) ^ rotateRight(value, 11) ^ rotateRight(value, 25);
}

function smallSigma0(value: number) {
    return rotateRight(value, 7) ^ rotateRight(value, 18) ^ (value >>> 3);
}

function smallSigma1(value: number) {
    return rotateRight(value, 17) ^ rotateRight(value, 19) ^ (value >>> 10);
}

function writeUint32BigEndian(target: Uint8Array, offset: number, value: number) {
    target[offset] = value >>> 24;
    target[offset + 1] = value >>> 16;
    target[offset + 2] = value >>> 8;
    target[offset + 3] = value;
}

function wordToHex(value: number) {
    return value.toString(16).padStart(8, "0");
}

export class Sha256 {
    private readonly hash = new Uint32Array(INITIAL_HASH);
    private readonly block = new Uint8Array(SHA256_BLOCK_BYTES);
    private readonly words = new Uint32Array(64);
    private blockLength = 0;
    private bytesHashed = 0;
    private finalized = false;

    update(data: Uint8Array) {
        if (this.finalized) {
            throw new Error("Cannot update a finalized SHA-256 digest.");
        }

        let offset = 0;
        this.bytesHashed += data.byteLength;

        if (this.blockLength > 0) {
            const bytesToCopy = Math.min(SHA256_BLOCK_BYTES - this.blockLength, data.byteLength);
            this.block.set(data.subarray(0, bytesToCopy), this.blockLength);
            this.blockLength += bytesToCopy;
            offset += bytesToCopy;

            if (this.blockLength === SHA256_BLOCK_BYTES) {
                this.processBlock(this.block, 0);
                this.blockLength = 0;
            }
        }

        while (offset + SHA256_BLOCK_BYTES <= data.byteLength) {
            this.processBlock(data, offset);
            offset += SHA256_BLOCK_BYTES;
        }

        if (offset < data.byteLength) {
            this.block.set(data.subarray(offset), 0);
            this.blockLength = data.byteLength - offset;
        }

        return this;
    }

    digestHex() {
        if (this.finalized) {
            throw new Error("SHA-256 digest has already been finalized.");
        }

        const bitLengthHigh = Math.floor(this.bytesHashed / 0x20000000);
        const bitLengthLow = (this.bytesHashed * 8) >>> 0;

        this.block[this.blockLength] = 0x80;
        this.blockLength += 1;

        if (this.blockLength > SHA256_BLOCK_BYTES - SHA256_LENGTH_BYTES) {
            this.block.fill(0, this.blockLength, SHA256_BLOCK_BYTES);
            this.processBlock(this.block, 0);
            this.blockLength = 0;
        }

        this.block.fill(0, this.blockLength, SHA256_BLOCK_BYTES - SHA256_LENGTH_BYTES);
        writeUint32BigEndian(this.block, 56, bitLengthHigh);
        writeUint32BigEndian(this.block, 60, bitLengthLow);
        this.processBlock(this.block, 0);
        this.finalized = true;

        return Array.from(this.hash, wordToHex).join("");
    }

    private processBlock(chunk: Uint8Array, offset: number) {
        for (let index = 0; index < 16; index += 1) {
            const chunkOffset = offset + index * 4;
            this.words[index] = (
                (chunk[chunkOffset] << 24) |
                (chunk[chunkOffset + 1] << 16) |
                (chunk[chunkOffset + 2] << 8) |
                chunk[chunkOffset + 3]
            ) >>> 0;
        }

        for (let index = 16; index < 64; index += 1) {
            this.words[index] = (
                smallSigma1(this.words[index - 2]) +
                this.words[index - 7] +
                smallSigma0(this.words[index - 15]) +
                this.words[index - 16]
            ) >>> 0;
        }

        let a = this.hash[0];
        let b = this.hash[1];
        let c = this.hash[2];
        let d = this.hash[3];
        let e = this.hash[4];
        let f = this.hash[5];
        let g = this.hash[6];
        let h = this.hash[7];

        for (let index = 0; index < 64; index += 1) {
            const temp1 = (
                h +
                bigSigma1(e) +
                choice(e, f, g) +
                ROUND_CONSTANTS[index] +
                this.words[index]
            ) >>> 0;
            const temp2 = (bigSigma0(a) + majority(a, b, c)) >>> 0;

            h = g;
            g = f;
            f = e;
            e = (d + temp1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (temp1 + temp2) >>> 0;
        }

        this.hash[0] = (this.hash[0] + a) >>> 0;
        this.hash[1] = (this.hash[1] + b) >>> 0;
        this.hash[2] = (this.hash[2] + c) >>> 0;
        this.hash[3] = (this.hash[3] + d) >>> 0;
        this.hash[4] = (this.hash[4] + e) >>> 0;
        this.hash[5] = (this.hash[5] + f) >>> 0;
        this.hash[6] = (this.hash[6] + g) >>> 0;
        this.hash[7] = (this.hash[7] + h) >>> 0;
    }
}

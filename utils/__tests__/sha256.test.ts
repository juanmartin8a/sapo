import { describe, expect, it } from "@jest/globals";

import { Sha256 } from "../sha256";

function asciiBytes(value: string) {
    return new Uint8Array(Array.from(value, (character) => character.charCodeAt(0)));
}

function repeatedByte(value: string, length: number) {
    return new Uint8Array(length).fill(value.charCodeAt(0));
}

describe("Sha256", () => {
    it("hashes known test vectors", () => {
        expect(new Sha256().digestHex()).toBe(
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        expect(new Sha256().update(asciiBytes("abc")).digestHex()).toBe(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        expect(new Sha256().update(asciiBytes("The quick brown fox jumps over the lazy dog")).digestHex()).toBe(
            "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592"
        );
        expect(new Sha256().update(asciiBytes("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).digestHex()).toBe(
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
        );
        expect(new Sha256().update(repeatedByte("a", 1_000_000)).digestHex()).toBe(
            "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0"
        );
    });

    it("hashes chunked input consistently", () => {
        const hash = new Sha256();

        hash.update(asciiBytes("The quick "));
        hash.update(asciiBytes("brown fox "));
        hash.update(asciiBytes("jumps over "));
        hash.update(asciiBytes("the lazy dog"));

        expect(hash.digestHex()).toBe(
            "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592"
        );
    });
});

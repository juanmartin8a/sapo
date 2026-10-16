import { describe, expect, it } from "@jest/globals";

import { getCharacterCount, getInputLimit } from "@/utils/inputLimits";

describe("input limits", () => {
    it("keeps entitlement loading distinct from free access", () => {
        expect(getInputLimit("translate", null)).toBeNull();
        expect(getInputLimit("translate", false)).toBe(500);
        expect(getInputLimit("respell", false)).toBeNull();
    });

    it("returns the paid per-request limits", () => {
        expect(getInputLimit("translate", true)).toBe(10_000);
        expect(getInputLimit("respell", true)).toBe(2_000);
    });

    it("allows local translations independently of entitlement state", () => {
        expect(getInputLimit("translate", null, true)).toBe(2_000);
        expect(getInputLimit("translate", false, true)).toBe(2_000);
        expect(getInputLimit("translate", true, true)).toBe(2_000);
    });

    it("counts Unicode code points consistently with server validation", () => {
        expect(getCharacterCount("a😀b")).toBe(3);
    });
});

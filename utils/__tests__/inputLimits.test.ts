import { describe, expect, it } from "@jest/globals";

import { getCharacterCount, getInputLimit } from "@/utils/inputLimits";

describe("input limits", () => {
    it("keeps entitlement loading distinct from free access", () => {
        expect(getInputLimit("translate", null)).toBeNull();
        expect(getInputLimit("translate", false)).toBe(10);
        expect(getInputLimit("respell", false)).toBe(10);
    });

    it("returns the paid per-request limits", () => {
        expect(getInputLimit("translate", true)).toBe(1_000);
        expect(getInputLimit("respell", true)).toBe(300);
    });

    it("counts Unicode code points consistently with server validation", () => {
        expect(getCharacterCount("a😀b")).toBe(3);
    });
});

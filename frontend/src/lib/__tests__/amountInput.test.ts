import { describe, expect, it } from "vitest";

import { sanitizeAmountInput } from "../amountInput";

describe("sanitizeAmountInput", () => {
    it("removes letters and symbols", () => {
        expect(sanitizeAmountInput("a1b2c-3e+4")).toBe("1234");
    });

    it("keeps only the first decimal point", () => {
        expect(sanitizeAmountInput("1.2.3.4")).toBe("1.234");
    });

    it("limits fractional digits when decimals are provided", () => {
        expect(sanitizeAmountInput("1.234567", 4)).toBe("1.2345");
    });

    it("blocks fractional input for zero-decimal tokens", () => {
        expect(sanitizeAmountInput("123.45", 0)).toBe("123");
    });

    it("allows empty and decimal-starting values while typing", () => {
        expect(sanitizeAmountInput("")).toBe("");
        expect(sanitizeAmountInput(".5")).toBe(".5");
    });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchTokenList } from "../tokenListService";

describe("fetchTokenList", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.unstubAllGlobals();
    });

    it("loads valid tokens for the requested chain", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                name: "Test List",
                timestamp: "2026-01-01T00:00:00Z",
                tokens: [
                    { chainId: 1, address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", name: "USD Coin", symbol: "USDC", decimals: 6 },
                    { chainId: 11155111, address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", name: "Sepolia USDC", symbol: "USDC", decimals: 6 },
                    { chainId: 1, address: "not-an-address", name: "Broken", symbol: "BAD", decimals: 18 },
                ],
            }),
        }));

        const tokens = await fetchTokenList("https://example.com/tokens.json", 1);

        expect(tokens).toHaveLength(1);
        expect(tokens[0]).toMatchObject({ symbol: "USDC", chainId: 1, decimals: 6, source: "external" });
    });

    it("uses the local cache for repeated requests", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                name: "Test List",
                timestamp: "2026-01-01T00:00:00Z",
                tokens: [
                    { chainId: 1, address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", name: "USD Coin", symbol: "USDC", decimals: 6 },
                ],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        await fetchTokenList("https://example.com/tokens.json", 1);
        await fetchTokenList("https://example.com/tokens.json", 1);

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

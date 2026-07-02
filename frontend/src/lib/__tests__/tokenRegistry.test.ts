import { describe, expect, it } from "vitest";
import {
    SUPPORTED_TOKENS,
    getSupportedTokens,
    getTokenKey,
    deduplicateTokens,
    normalizeAddress,
    isSupportedToken,
    findSupportedToken,
    getWethAddress,
    filterTokens,
    isNativeEth,
    NATIVE_ETH_ADDRESS,
} from "../tokenRegistry";
import type { SupportedToken } from "../tokenRegistry";

const MAINNET = 1;
const SEPOLIA = 11155111;
const UNKNOWN_CHAIN = 999999;

const nativeEth: SupportedToken = { type: "native", chainId: MAINNET, address: null, name: "Ethereum", symbol: "ETH", decimals: 18 };
const wethMainnet: SupportedToken = { type: "erc20", chainId: MAINNET, address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", name: "Wrapped Ether", symbol: "WETH", decimals: 18 };
const wethSepolia: SupportedToken = { type: "erc20", chainId: SEPOLIA, address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", name: "Wrapped Ether", symbol: "WETH", decimals: 18 };
const usdcMainnet: SupportedToken = { type: "erc20", chainId: MAINNET, address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", name: "USD Coin", symbol: "USDC", decimals: 6 };

describe("getSupportedTokens", () => {
    it("returns tokens for mainnet", () => {
        const tokens = getSupportedTokens(MAINNET);
        expect(tokens.length).toBeGreaterThan(0);
        expect(tokens.some((t) => t.type === "native" && t.symbol === "ETH")).toBe(true);
        expect(tokens.some((t) => t.type === "erc20" && t.symbol === "WETH")).toBe(true);
    });

    it("returns tokens for sepolia", () => {
        const tokens = getSupportedTokens(SEPOLIA);
        expect(tokens.length).toBeGreaterThan(0);
        expect(tokens.some((t) => t.symbol === "ETH")).toBe(true);
        expect(tokens.some((t) => t.symbol === "WETH")).toBe(true);
    });

    it("returns empty array for unknown chain", () => {
        expect(getSupportedTokens(UNKNOWN_CHAIN)).toEqual([]);
    });
});

describe("getTokenKey", () => {
    it("uses chainId:native for native tokens", () => {
        expect(getTokenKey(nativeEth)).toBe(`${MAINNET}:native`);
    });

    it("uses chainId:lowercaseAddress for ERC-20 tokens", () => {
        const expected = `${MAINNET}:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2`;
        expect(getTokenKey(wethMainnet)).toBe(expected);
    });

    it("normalizes address to lowercase in key", () => {
        const checksumWeth: SupportedToken = {
            type: "erc20",
            chainId: MAINNET,
            address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            name: "Wrapped Ether",
            symbol: "WETH",
            decimals: 18,
        };
        const lowercaseWeth: SupportedToken = {
            ...checksumWeth,
            address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" as `0x${string}`,
        };
        expect(getTokenKey(checksumWeth)).toBe(getTokenKey(lowercaseWeth));
    });
});

describe("deduplicateTokens", () => {
    it("removes duplicate address with different checksum", () => {
        const duplicate: SupportedToken = {
            ...wethMainnet,
            address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" as `0x${string}`,
        };
        const result = deduplicateTokens([wethMainnet, duplicate], MAINNET);
        expect(result).toHaveLength(1);
    });

    it("keeps tokens with different addresses even if same symbol", () => {
        const result = deduplicateTokens([wethMainnet, wethSepolia], MAINNET);
        expect(result).toHaveLength(2);
    });

    it("keeps native and ERC-20 with same chainId", () => {
        const result = deduplicateTokens([nativeEth, wethMainnet, usdcMainnet], MAINNET);
        expect(result).toHaveLength(3);
    });

    it("handles empty array", () => {
        expect(deduplicateTokens([], MAINNET)).toEqual([]);
    });
});

describe("normalizeAddress", () => {
    it("returns lowercase for valid hex address", () => {
        const result = normalizeAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
        expect(result).toBe("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
    });

    it("returns null for invalid address", () => {
        expect(normalizeAddress("")).toBeNull();
        expect(normalizeAddress("not-an-address")).toBeNull();
        expect(normalizeAddress("0x123")).toBeNull();
        expect(normalizeAddress("0xzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz")).toBeNull();
    });

    it("does not crash for undefined or null", () => {
        expect(normalizeAddress("")).toBeNull();
    });
});

describe("isSupportedToken", () => {
    it("returns true for known ERC-20 on correct chain", () => {
        expect(isSupportedToken(MAINNET, wethMainnet.address!)).toBe(true);
    });

    it("returns false for ERC-20 on wrong chain", () => {
        expect(isSupportedToken(SEPOLIA, wethMainnet.address!)).toBe(false);
    });

    it("returns false for unknown address", () => {
        expect(isSupportedToken(MAINNET, "0x0000000000000000000000000000000000000001")).toBe(false);
    });

    it("returns false for invalid address", () => {
        expect(isSupportedToken(MAINNET, "")).toBe(false);
        expect(isSupportedToken(MAINNET, "0xdead")).toBe(false);
    });

    it("is case insensitive", () => {
        expect(isSupportedToken(MAINNET, wethMainnet.address!.toLowerCase())).toBe(true);
        expect(isSupportedToken(MAINNET, wethMainnet.address!.toUpperCase())).toBe(true);
    });
});

describe("findSupportedToken", () => {
    it("finds token by address on correct chain", () => {
        const result = findSupportedToken(MAINNET, wethMainnet.address!);
        expect(result).toBeDefined();
        expect(result!.symbol).toBe("WETH");
    });

    it("returns undefined for token on wrong chain", () => {
        expect(findSupportedToken(SEPOLIA, wethMainnet.address!)).toBeUndefined();
    });

    it("returns undefined for invalid address", () => {
        expect(findSupportedToken(MAINNET, "")).toBeUndefined();
    });
});

describe("getWethAddress", () => {
    it("returns WETH address for mainnet", () => {
        expect(getWethAddress(MAINNET)).toBe(wethMainnet.address);
    });

    it("returns WETH address for sepolia", () => {
        expect(getWethAddress(SEPOLIA)).toBe(wethSepolia.address);
    });

    it("returns undefined for chain without WETH", () => {
        expect(getWethAddress(UNKNOWN_CHAIN)).toBeUndefined();
    });
});

describe("filterTokens", () => {
    const tokens = [nativeEth, wethMainnet, usdcMainnet];

    it("returns all tokens for empty query", () => {
        const result = filterTokens(tokens, "");
        expect(result).toHaveLength(tokens.length);
    });

    it("filters by symbol", () => {
        const result = filterTokens(tokens, "WETH");
        expect(result).toHaveLength(1);
        expect(result[0].symbol).toBe("WETH");
    });

    it("filters by name", () => {
        const result = filterTokens(tokens, "Wrapped");
        expect(result).toHaveLength(1);
        expect(result[0].symbol).toBe("WETH");
    });

    it("filters by exact address", () => {
        const result = filterTokens(tokens, wethMainnet.address!);
        expect(result).toHaveLength(1);
        expect(result[0].symbol).toBe("WETH");
    });

    it("returns empty when no match", () => {
        const result = filterTokens(tokens, "UNKNOWN");
        expect(result).toHaveLength(0);
    });

    it("is case insensitive", () => {
        const result = filterTokens(tokens, "weth");
        expect(result).toHaveLength(1);
    });

    it("ETH native dan WETH muncul dengan filter 'eth' (substring match)", () => {
        const result = filterTokens(tokens, "eth");
        expect(result.length).toBeGreaterThanOrEqual(1);
        expect(result.some((t) => t.type === "native" && t.symbol === "ETH")).toBe(true);
        expect(result.some((t) => t.symbol === "WETH")).toBe(true);
    });
});

describe("isNativeEth", () => {
    it("returns true for native token", () => {
        expect(isNativeEth(nativeEth)).toBe(true);
    });

    it("returns false for ERC-20 token", () => {
        expect(isNativeEth(wethMainnet)).toBe(false);
    });
});

describe("NATIVE_ETH_ADDRESS", () => {
    it("is the canonical sentinel address", () => {
        expect(NATIVE_ETH_ADDRESS).toBe("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE");
    });
});

describe("SUPPORTED_TOKENS structure", () => {
    it("each chain has at most one native token", () => {
        for (const tokens of Object.values(SUPPORTED_TOKENS)) {
            const natives = tokens.filter((t) => t.type === "native");
            expect(natives.length).toBeLessThanOrEqual(1);
        }
    });

    it("all ERC-20 tokens have a valid address", () => {
        for (const tokens of Object.values(SUPPORTED_TOKENS)) {
            for (const token of tokens) {
                if (token.type === "erc20") {
                    expect(token.address).toBeTruthy();
                    expect(token.address!).toMatch(/^0x[0-9a-fA-F]{40}$/);
                }
            }
        }
    });

    it("no duplicate token keys within the same chain", () => {
        for (const tokens of Object.values(SUPPORTED_TOKENS)) {
            const keys = tokens.map((t) => getTokenKey(t));
            expect(new Set(keys).size).toBe(keys.length);
        }
    });
});

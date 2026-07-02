import type { Address } from "viem";

export type TokenType = "native" | "erc20";
export type TokenSource = "default" | "deployment" | "external" | "custom";

export type SupportedToken = {
    type: TokenType;
    chainId: number;
    address: Address | null;
    name: string;
    symbol: string;
    decimals: number;
    source?: TokenSource;
};

export const NATIVE_ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as Address;

export const SUPPORTED_TOKENS: Record<number, SupportedToken[]> = {
    1: [
        { type: "native", chainId: 1, address: null, name: "Ethereum", symbol: "ETH", decimals: 18 },
        { type: "erc20", chainId: 1, address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", name: "Wrapped Ether", symbol: "WETH", decimals: 18 },
        { type: "erc20", chainId: 1, address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", name: "USD Coin", symbol: "USDC", decimals: 6 },
        { type: "erc20", chainId: 1, address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", name: "Tether USD", symbol: "USDT", decimals: 6 },
        { type: "erc20", chainId: 1, address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", name: "Wrapped Bitcoin", symbol: "WBTC", decimals: 8 },
        { type: "erc20", chainId: 1, address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", name: "Dai Stablecoin", symbol: "DAI", decimals: 18 },
    ],
    10: [
        { type: "native", chainId: 10, address: null, name: "Ethereum", symbol: "ETH", decimals: 18 },
        { type: "erc20", chainId: 10, address: "0x4200000000000000000000000000000000000006", name: "Wrapped Ether", symbol: "WETH", decimals: 18 },
        { type: "erc20", chainId: 10, address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", name: "USD Coin", symbol: "USDC", decimals: 6 },
        { type: "erc20", chainId: 10, address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", name: "Tether USD", symbol: "USDT", decimals: 6 },
    ],
    137: [
        { type: "native", chainId: 137, address: null, name: "Polygon", symbol: "MATIC", decimals: 18 },
        { type: "erc20", chainId: 137, address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", name: "Wrapped Ether", symbol: "WETH", decimals: 18 },
        { type: "erc20", chainId: 137, address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", name: "USD Coin", symbol: "USDC", decimals: 6 },
        { type: "erc20", chainId: 137, address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", name: "Tether USD", symbol: "USDT", decimals: 6 },
    ],
    42161: [
        { type: "native", chainId: 42161, address: null, name: "Ethereum", symbol: "ETH", decimals: 18 },
        { type: "erc20", chainId: 42161, address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", name: "Wrapped Ether", symbol: "WETH", decimals: 18 },
        { type: "erc20", chainId: 42161, address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", name: "USD Coin", symbol: "USDC", decimals: 6 },
        { type: "erc20", chainId: 42161, address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", name: "Tether USD", symbol: "USDT", decimals: 6 },
    ],
    11155111: [
        { type: "native", chainId: 11155111, address: null, name: "Ethereum", symbol: "ETH", decimals: 18 },
        { type: "erc20", chainId: 11155111, address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", name: "Wrapped Ether", symbol: "WETH", decimals: 18 },
        { type: "erc20", chainId: 11155111, address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", name: "USD Coin", symbol: "USDC", decimals: 6 },
    ],
    31337: [
        { type: "native", chainId: 31337, address: null, name: "Ethereum", symbol: "ETH", decimals: 18 },
        { type: "erc20", chainId: 31337, address: "0x5FbDB2315678afecb367f032d93F642f64180aa3", name: "Wrapped Ether", symbol: "WETH", decimals: 18 },
    ],
};

export function getSupportedTokens(chainId: number): SupportedToken[] {
    return SUPPORTED_TOKENS[chainId] ?? [];
}

export function getTokenKey(token: SupportedToken): string {
    if (token.type === "native") {
        return `${token.chainId}:native`;
    }
    return `${token.chainId}:${token.address!.toLowerCase()}`;
}

export function deduplicateTokens(tokens: SupportedToken[], _chainId: number): SupportedToken[] {
    void _chainId;
    const seen = new Set<string>();
    return tokens.filter((token) => {
        const key = getTokenKey(token);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function normalizeAddress(address: string): string | null {
    const cleaned = address.startsWith("0x") || address.startsWith("0X")
        ? `0x${address.slice(2)}`
        : address;
    if (!/^0x[0-9a-fA-F]{40}$/.test(cleaned)) return null;
    return cleaned.toLowerCase();
}

export function isSupportedToken(chainId: number, address: string): boolean {
    const normalized = normalizeAddress(address);
    if (!normalized) return false;
    return (SUPPORTED_TOKENS[chainId] ?? []).some(
        (token) => token.type === "erc20" && token.address?.toLowerCase() === normalized,
    );
}

export function findSupportedToken(chainId: number, address: string): SupportedToken | undefined {
    const normalized = normalizeAddress(address);
    if (!normalized) return undefined;
    return (SUPPORTED_TOKENS[chainId] ?? []).find(
        (token) => token.type === "erc20" && token.address?.toLowerCase() === normalized,
    );
}

export function getWethAddress(chainId: number): Address | undefined {
    const weth = (SUPPORTED_TOKENS[chainId] ?? []).find(
        (t) => t.type === "erc20" && t.symbol === "WETH",
    );
    return weth?.address ?? undefined;
}

export function isNativeAddress(address: string): boolean {
    return address.toLowerCase() === NATIVE_ETH_ADDRESS.toLowerCase();
}

export function resolveNativeAddress(address: string, wethAddress?: Address): Address | undefined {
    if (isNativeAddress(address)) return wethAddress;
    const normalized = normalizeAddress(address);
    return normalized ? (normalized as Address) : undefined;
}

export function filterTokens(tokens: SupportedToken[], query: string): SupportedToken[] {
    const q = query.trim().toLowerCase();
    if (!q) return tokens;
    return tokens.filter((token) => {
        if (token.symbol.toLowerCase().includes(q)) return true;
        if (token.name.toLowerCase().includes(q)) return true;
        if (token.address && token.address.toLowerCase() === q) return true;
        return false;
    });
}

export function isNativeEth(token: SupportedToken): boolean {
    return token.type === "native";
}

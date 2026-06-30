import { isAddress, type Address } from "viem";

import type { SupportedToken } from "./tokenRegistry";

const CACHE_KEY = "externalTokenList";
const CACHE_DURATION_MS = 1000 * 60 * 60; // 1 hour
export const DEFAULT_TOKEN_LIST_URL = import.meta.env.VITE_TOKEN_LIST_URL ?? "";

type UniswapTokenInfo = {
    address: string;
    chainId: number;
    name: string;
    symbol: string;
    decimals: number;
    logoURI?: string;
};

type UniswapTokenList = {
    name: string;
    timestamp: string;
    tokens: UniswapTokenInfo[];
};

type CachedList = {
    url: string;
    chainId: number;
    fetchedAt: number;
    tokens: SupportedToken[];
};

function loadCached(url: string, chainId: number): SupportedToken[] | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const cached: CachedList = JSON.parse(raw);
        if (cached.url !== url) return null;
        if (cached.chainId !== chainId) return null;
        if (Date.now() - cached.fetchedAt > CACHE_DURATION_MS) return null;
        return cached.tokens;
    } catch {
        return null;
    }
}

function saveCache(url: string, chainId: number, tokens: SupportedToken[]) {
    try {
        const cached: CachedList = { url, chainId, fetchedAt: Date.now(), tokens };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
    } catch {
        // storage full or unavailable
    }
}

export async function fetchTokenList(url: string, chainId: number): Promise<SupportedToken[]> {
    const cached = loadCached(url, chainId);
    if (cached) return cached;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch token list: ${response.statusText}`);

    const list: UniswapTokenList = await response.json();
    const tokens: SupportedToken[] = [];

    for (const token of list.tokens) {
        if (token.chainId !== chainId) continue;
        if (!isAddress(token.address)) continue;
        if (token.decimals === undefined || token.decimals < 0 || token.decimals > 78) continue;
        if (!token.symbol || !token.name) continue;

        tokens.push({
            type: "erc20",
            chainId,
            address: token.address as Address,
            name: token.name,
            symbol: token.symbol,
            decimals: token.decimals,
            source: "external",
        });
    }

    saveCache(url, chainId, tokens);
    return tokens;
}

export function clearTokenListCache() {
    try {
        localStorage.removeItem(CACHE_KEY);
    } catch {
        // ignore
    }
}

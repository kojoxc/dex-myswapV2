export const STORAGE_KEYS = {
    router: "myswap:v2:router",
    tokenIn: "myswap:v2:tokenIn",
    tokenOut: "myswap:v2:tokenOut",
    slippageBps: "myswap:v2:slippageBps",
    deadlineMinutes: "myswap:v2:deadlineMinutes",
};

export const DEFAULT_SLIPPAGE_BPS = 50;
export const DEFAULT_DEADLINE_MINUTES = 20;
export const DEFAULT_ROUTER_ADDRESS = import.meta.env.VITE_ROUTER_ADDRESS ?? "";
export const DEFAULT_TOKEN_IN_ADDRESS = import.meta.env.VITE_TOKEN_IN_ADDRESS ?? "";
export const DEFAULT_TOKEN_OUT_ADDRESS = import.meta.env.VITE_TOKEN_OUT_ADDRESS ?? "";

export function sanitizeSlippageBps(value: number) {
    if (!Number.isFinite(value)) return DEFAULT_SLIPPAGE_BPS;
    return Math.min(9_900, Math.max(0, Math.round(value)));
}

export function sanitizeDeadlineMinutes(value: number) {
    if (!Number.isFinite(value)) return DEFAULT_DEADLINE_MINUTES;
    return Math.max(1, Math.floor(value));
}

export function loadStorage(key: string, fallback = "") {
    return localStorage.getItem(key) ?? fallback;
}

export function persist(key: string, value: string) {
    localStorage.setItem(key, value);
}

export function applySlippage(value: bigint, slippageBps: number) {
    const sanitized = BigInt(sanitizeSlippageBps(slippageBps));
    return (value * (10_000n - sanitized)) / 10_000n;
}

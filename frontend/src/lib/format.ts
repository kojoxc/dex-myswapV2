import { formatUnits } from "viem";

export function compactAddress(value?: string) {
    if (!value) return "";
    return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function formatTokenAmount(value?: bigint, decimals = 18, maxDecimals = 6) {
    if (value === undefined) return "-";
    const formatted = formatUnits(value, decimals);
    const [whole, fraction = ""] = formatted.split(".");
    const trimmed = fraction.slice(0, maxDecimals).replace(/0+$/, "");
    return trimmed ? `${whole}.${trimmed}` : whole;
}

export function safeNumber(value: string) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

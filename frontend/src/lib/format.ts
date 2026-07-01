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

export function formatDisplayAmount(value: string | undefined, maxDecimals = 6): string {
    if (!value || value === "") return "";
    const cleaned = value.replace(/[,\s]/g, "");
    if (/^0+\.?0*$/.test(cleaned)) return "0";
    const [whole, fraction = ""] = cleaned.split(".");
    const normalized = whole.replace(/^0+(?=\d)/, "");
    const grouped = normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (!fraction) return grouped || "0";
    const leadingZeros = fraction.match(/^0*/)?.[0]?.length ?? 0;
    const sigDecimals = leadingZeros + maxDecimals;
    const trimmed = fraction.slice(0, sigDecimals).replace(/0+$/, "");
    return trimmed ? `${grouped || "0"}.${trimmed}` : grouped || "0";
}

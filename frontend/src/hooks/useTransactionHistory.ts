import { useCallback, useState } from "react";
import type { Address } from "viem";

const STORAGE_KEY = "transactionHistory";
const MAX_HISTORY = 20;

export type HistoryEntry = {
    hash: Address;
    type: "swap" | "addLiquidity" | "removeLiquidity" | "approve";
    timestamp: number;
    label: string;
};

function loadHistory(): HistoryEntry[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as HistoryEntry[];
    } catch {
        return [];
    }
}

function saveHistory(entries: HistoryEntry[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
        // storage full or unavailable
    }
}

export function useTransactionHistory() {
    const [entries, setEntries] = useState<HistoryEntry[]>(() => loadHistory());

    const addEntry = useCallback((entry: HistoryEntry) => {
        setEntries((prev) => {
            const next = [entry, ...prev].slice(0, MAX_HISTORY);
            saveHistory(next);
            return next;
        });
    }, []);

    const clearHistory = useCallback(() => {
        setEntries([]);
        saveHistory([]);
    }, []);

    return { entries, addEntry, clearHistory };
}

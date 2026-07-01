import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, usePublicClient } from "wagmi";

const MAX_HISTORY = 50;

export type HistoryStatus = "awaitingWallet" | "submitted" | "pending" | "confirmed" | "failed" | "reverted" | "rejected";

export type HistoryEntry = {
    hash: `0x${string}`;
    type: "swap" | "addLiquidity" | "removeLiquidity" | "approve";
    timestamp: number;
    label: string;
    pairLabel?: string;
    amountLabel?: string;
    status?: HistoryStatus;
    blockNumber?: string;
    transactionIndex?: number;
};

function cacheKey(chainId?: number, address?: string) {
    return chainId && address ? `activity:${chainId}:${address.toLowerCase()}` : undefined;
}

function dedupeAndSort(entries: HistoryEntry[]) {
    const byHash = new Map<string, HistoryEntry>();

    for (const entry of entries) {
        const key = entry.hash.toLowerCase();
        const existing = byHash.get(key);
        if (!existing || entry.timestamp >= existing.timestamp || entry.status === "confirmed") {
            byHash.set(key, { ...existing, ...entry });
        }
    }

    return [...byHash.values()]
        .sort((left, right) => {
            const leftBlock = left.blockNumber ? BigInt(left.blockNumber) : undefined;
            const rightBlock = right.blockNumber ? BigInt(right.blockNumber) : undefined;
            if (leftBlock !== undefined && rightBlock !== undefined && leftBlock !== rightBlock) return leftBlock > rightBlock ? -1 : 1;
            if (left.transactionIndex !== undefined && right.transactionIndex !== undefined && left.transactionIndex !== right.transactionIndex) return right.transactionIndex - left.transactionIndex;
            return right.timestamp - left.timestamp;
        })
        .slice(0, MAX_HISTORY);
}

function loadHistory(key?: string): HistoryEntry[] {
    if (!key) return [];
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        return dedupeAndSort(JSON.parse(raw) as HistoryEntry[]);
    } catch {
        return [];
    }
}

function saveHistory(key: string | undefined, entries: HistoryEntry[]) {
    if (!key) return;
    try {
        localStorage.setItem(key, JSON.stringify(dedupeAndSort(entries)));
    } catch {
        // storage full or unavailable
    }
}

export function useTransactionHistory() {
    const { address } = useAccount();
    const chainId = useChainId();
    const publicClient = usePublicClient();
    const key = useMemo(() => cacheKey(chainId, address), [address, chainId]);
    const [entries, setEntries] = useState<HistoryEntry[]>(() => loadHistory(key));
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string>();
    const [nonce, setNonce] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const cached = loadHistory(key);
        setEntries(cached);
        setError(undefined);

        async function verifyReceipts() {
            if (!key || !publicClient || cached.length === 0) {
                setIsLoading(false);
                return;
            }

            setIsLoading(true);
            try {
                const verified = await Promise.all(cached.map(async (entry) => {
                    try {
                        const receipt = await publicClient.getTransactionReceipt({ hash: entry.hash });
                        return {
                            ...entry,
                            status: receipt.status === "success" ? "confirmed" : "reverted",
                            blockNumber: receipt.blockNumber.toString(),
                            transactionIndex: receipt.transactionIndex,
                        } satisfies HistoryEntry;
                    } catch {
                        return entry.status === "confirmed" ? entry : { ...entry, status: "pending" as const };
                    }
                }));

                if (!cancelled) {
                    const next = dedupeAndSort(verified);
                    setEntries(next);
                    saveHistory(key, next);
                }
            } catch (caught) {
                if (!cancelled) setError(caught instanceof Error ? caught.message : "Activity could not be refreshed");
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        verifyReceipts();

        return () => {
            cancelled = true;
        };
    }, [key, publicClient, nonce]);

    const addEntry = useCallback((entry: HistoryEntry) => {
        setEntries((prev) => {
            const next = dedupeAndSort([{ status: "confirmed", ...entry }, ...prev]);
            saveHistory(key, next);
            return next;
        });
    }, [key]);

    return {
        entries: key ? entries : [],
        addEntry,
        isLoading,
        error,
        refetch: () => setNonce((value) => value + 1),
    };
}

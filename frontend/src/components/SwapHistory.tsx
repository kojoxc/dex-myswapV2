import { useAccount } from "wagmi";

import type { HistoryEntry } from "../hooks/useTransactionHistory";
import { compactAddress } from "../lib/format";

type SwapHistoryProps = {
    entries: HistoryEntry[];
    onClear: () => void;
};

const typeLabels: Record<HistoryEntry["type"], string> = {
    swap: "Swap",
    addLiquidity: "Add Liq",
    removeLiquidity: "Remove Liq",
    approve: "Approve",
};

export function SwapHistory({ entries, onClear }: SwapHistoryProps) {
    const { chain } = useAccount();

    if (entries.length === 0) return null;

    return (
        <section className="mt-4 min-w-0 w-[min(100%,440px)] max-w-full rounded-[1.5rem] border border-white/10 bg-[#101624] p-4">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-300">Transaction history</h3>
                <button
                    type="button"
                    onClick={onClear}
                    className="text-xs text-slate-500 hover:text-slate-300"
                >
                    Clear
                </button>
            </div>
            <div className="grid gap-2">
                {entries.map((entry) => {
                    const explorerUrl =
                        entry.hash && chain?.blockExplorers?.default.url
                            ? `${chain.blockExplorers.default.url}/tx/${entry.hash}`
                            : undefined;
                    const timeAgo = formatTimeAgo(entry.timestamp);

                    return (
                        <div
                            key={`${entry.hash}-${entry.timestamp}`}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm"
                        >
                            <div className="min-w-0">
                                <p className="truncate text-slate-200">
                                    <span className="font-bold text-pink-100">{typeLabels[entry.type]}</span>{" "}
                                    {entry.label}
                                </p>
                                <p className="text-xs text-slate-500">{timeAgo}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <span className="text-xs text-slate-500">{compactAddress(entry.hash)}</span>
                                {explorerUrl ? (
                                    <a
                                        href={explorerUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs font-bold text-pink-100 underline-offset-4 hover:underline"
                                    >
                                        View
                                    </a>
                                ) : null}
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

function formatTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

import { useEffect, useRef, useState, type RefObject } from "react";
import { useAccount } from "wagmi";

import type { HistoryEntry, HistoryStatus } from "../hooks/useTransactionHistory";
import { compactAddress } from "../lib/format";

type ActivityFilter = "all" | "swap" | "liquidity";

type ActivityDrawerProps = {
    open: boolean;
    entries: HistoryEntry[];
    isLoading?: boolean;
    error?: string;
    onRetry: () => void;
    onClose: () => void;
    returnFocusRef: RefObject<HTMLButtonElement>;
};

const focusableSelector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
].join(",");

function isLiquidityType(type: HistoryEntry["type"]) {
    return type === "addLiquidity" || type === "removeLiquidity";
}

function typeLabel(type: HistoryEntry["type"]) {
    if (type === "swap") return "Swap";
    if (type === "addLiquidity") return "Add liquidity";
    if (type === "removeLiquidity") return "Remove liquidity";
    return "Approve";
}

function statusLabel(status?: HistoryStatus) {
    if (status === "awaitingWallet") return "Awaiting wallet";
    if (status === "submitted") return "Submitted";
    if (status === "pending") return "Pending";
    if (status === "failed") return "Failed";
    if (status === "reverted") return "Reverted";
    if (status === "rejected") return "Rejected";
    return "Confirmed";
}

function statusTone(status?: HistoryStatus) {
    if (status === "pending" || status === "submitted" || status === "awaitingWallet") return "is-pending";
    if (status === "failed" || status === "reverted") return "is-failed";
    if (status === "rejected") return "is-rejected";
    return "is-confirmed";
}

function formatTimeAgo(timestamp: number) {
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function dateGroup(timestamp: number) {
    const date = new Date(timestamp);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return "Today";
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return "Earlier";
}

function XIcon() {
    return (
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

function ActivityItem({ entry }: { entry: HistoryEntry }) {
    const { chain } = useAccount();
    const explorerUrl = entry.hash && chain?.blockExplorers?.default.url ? `${chain.blockExplorers.default.url}/tx/${entry.hash}` : undefined;
    const icon = entry.type === "swap" ? "↔" : entry.type === "addLiquidity" ? "+" : entry.type === "removeLiquidity" ? "−" : "✓";
    const status = statusLabel(entry.status);

    return (
        <div className="activity-item">
            <span className="activity-icon" aria-hidden="true">{icon}</span>
            <div className="activity-main">
                <div className="activity-type">{typeLabel(entry.type)}</div>
                <div className="activity-pair">{entry.pairLabel ?? entry.label}</div>
                <div className="activity-amount">{entry.amountLabel ?? "Amounts unavailable"}</div>
                <div className="activity-meta" aria-live={entry.status === "pending" ? "polite" : undefined}>
                    <span className={`activity-status ${statusTone(entry.status)}`}>● {status}</span>
                    <span>{formatTimeAgo(entry.timestamp)}</span>
                </div>
            </div>
            <div className="activity-side">
                <span className="activity-time">{formatTimeAgo(entry.timestamp)}</span>
                {explorerUrl ? (
                    <a href={explorerUrl} target="_blank" rel="noreferrer" className="activity-explorer-link" aria-label={`View transaction ${compactAddress(entry.hash)} in explorer`}>
                        {compactAddress(entry.hash)} ↗
                    </a>
                ) : <span className="activity-explorer-link">{compactAddress(entry.hash)}</span>}
            </div>
        </div>
    );
}

function ActivitySkeleton() {
    return (
        <div className="activity-item" aria-hidden="true">
            <span className="activity-icon" />
            <div className="activity-main">
                <div className="activity-skeleton w-24" />
                <div className="activity-skeleton w-32" />
                <div className="activity-skeleton w-44" />
            </div>
            <div className="activity-side">
                <span className="activity-skeleton w-10" />
                <span className="activity-skeleton w-20" />
            </div>
        </div>
    );
}

export function ActivityDrawer({ open, entries, isLoading, error, onRetry, onClose, returnFocusRef }: ActivityDrawerProps) {
    const drawerRef = useRef<HTMLElement>(null);
    const [filter, setFilter] = useState<ActivityFilter>("all");
    const { address, chain, isConnected } = useAccount();

    useEffect(() => {
        if (!open) return;

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        drawerRef.current?.focus();

        function onKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
                return;
            }

            if (event.key !== "Tab" || !drawerRef.current) return;

            const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(focusableSelector)).filter(
                (element) => element.offsetParent !== null || element === document.activeElement,
            );
            if (focusable.length === 0) {
                event.preventDefault();
                drawerRef.current.focus();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }

        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            document.body.style.overflow = originalOverflow;
            returnFocusRef.current?.focus();
        };
    }, [open, onClose, returnFocusRef]);

    if (!open) return null;

    const filteredEntries = entries.filter((entry) => {
        if (filter === "all") return true;
        if (filter === "liquidity") return isLiquidityType(entry.type);
        return entry.type === "swap";
    });
    const grouped = filteredEntries.reduce<Record<string, HistoryEntry[]>>((acc, entry) => {
        const group = dateGroup(entry.timestamp);
        acc[group] = [...(acc[group] ?? []), entry];
        return acc;
    }, {});
    const subtitle = isConnected && address ? `Transactions for ${compactAddress(address)}` : "Your recent on-chain activity";
    const network = chain?.name ?? "Unknown network";

    return (
        <div className="fixed inset-0 z-50" role="presentation">
            <button type="button" aria-label="Close activity drawer" className="absolute inset-0 h-full w-full bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <aside ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby="activity-title" tabIndex={-1} className="activity-drawer outline-none">
                <header className="activity-header">
                    <div className="activity-title-row">
                        <div>
                            <h2 id="activity-title" className="activity-title">Activity</h2>
                            <p className="activity-subtitle">{subtitle}<br />{network}</p>
                        </div>
                        <button type="button" aria-label="Close activity" onClick={onClose} className="activity-close-button">
                            <XIcon />
                        </button>
                    </div>

                    <div className="activity-tabs" role="tablist" aria-label="Activity filter">
                        {([
                            ["all", "All"],
                            ["swap", "Swaps"],
                            ["liquidity", "Liquidity"],
                        ] as const).map(([item, label]) => (
                            <button key={item} type="button" role="tab" aria-selected={filter === item} onClick={() => setFilter(item)} className={filter === item ? "is-active" : ""}>
                                {label}
                            </button>
                        ))}
                    </div>
                </header>

                <div className="activity-list">
                    {!isConnected ? (
                        <div className="activity-empty-state">
                            <strong>Connect wallet to view activity</strong>
                            <span>Your on-chain transactions will appear here.</span>
                        </div>
                    ) : error ? (
                        <div className="activity-empty-state" role="alert">
                            <strong>Activity refresh failed</strong>
                            <span>{error}</span>
                            <button type="button" onClick={onRetry}>Retry</button>
                        </div>
                    ) : isLoading && entries.length === 0 ? (
                        <>
                            <ActivitySkeleton />
                            <ActivitySkeleton />
                            <ActivitySkeleton />
                        </>
                    ) : filteredEntries.length === 0 ? (
                        <div className="activity-empty-state">
                            <strong>No activity yet</strong>
                            <span>Your swaps and liquidity transactions will appear here.</span>
                        </div>
                    ) : (
                        Object.entries(grouped).map(([group, groupEntries]) => (
                            <section key={group} className="activity-date-group" aria-label={group}>
                                <div className="activity-date-label">{group}</div>
                                {groupEntries.map((entry) => <ActivityItem key={entry.hash.toLowerCase()} entry={entry} />)}
                            </section>
                        ))
                    )}
                </div>
            </aside>
        </div>
    );
}

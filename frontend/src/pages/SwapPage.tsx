import { SwapCard } from "../components/SwapCard";
import { TradePageShell } from "../components/TradePageShell";
import { useOutletContext } from "react-router-dom";
import type { TradeOutletContext } from "../components/Layout";
import { useTransactionHistory } from "../hooks/useTransactionHistory";

export function SwapPage() {
    const fallbackHistory = useTransactionHistory();
    const outletHistory = useOutletContext<TradeOutletContext | null>();
    const { entries, addEntry } = outletHistory ?? fallbackHistory;

    return (
        <TradePageShell>
            <SwapCard historyEntries={entries} onAddHistoryEntry={addEntry} />
        </TradePageShell>
    );
}

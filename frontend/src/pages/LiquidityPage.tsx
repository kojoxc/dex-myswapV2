import { LiquidityCard } from "../components/LiquidityCard";
import { TradePageShell } from "../components/TradePageShell";
import { useOutletContext, useSearchParams } from "react-router-dom";
import type { TradeOutletContext } from "../components/Layout";
import { useTransactionHistory } from "../hooks/useTransactionHistory";

export function LiquidityPage() {
    const [searchParams] = useSearchParams();
    const fallbackHistory = useTransactionHistory();
    const outletHistory = useOutletContext<TradeOutletContext | null>();
    const { addEntry } = outletHistory ?? fallbackHistory;
    const mode = searchParams.get("mode") === "remove" ? "remove" : "add";

    return (
        <TradePageShell>
            <LiquidityCard defaultMode={mode} onAddHistoryEntry={addEntry} />
        </TradePageShell>
    );
}

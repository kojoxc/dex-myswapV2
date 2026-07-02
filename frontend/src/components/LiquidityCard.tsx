import { useState } from "react";

import { useTransactionHistory, type HistoryEntry } from "../hooks/useTransactionHistory";
import { AddLiquidityCard } from "./AddLiquidityCard";
import { RemoveLiquidityCard } from "./RemoveLiquidityCard";

type LiquidityMode = "add" | "remove";

type LiquidityCardProps = {
    defaultMode?: LiquidityMode;
    onAddHistoryEntry?: (entry: HistoryEntry) => void;
};

export function LiquidityCard({ defaultMode = "add", onAddHistoryEntry: extAddHistoryEntry }: LiquidityCardProps) {
    const [mode, setMode] = useState<LiquidityMode>(defaultMode);
    const internalHistory = useTransactionHistory();
    const addHistoryEntry = extAddHistoryEntry ?? internalHistory.addEntry;

    return (
        <div className="liquidity-wrapper">
            <div className="liquidity-mode-tabs" role="tablist" aria-label="Liquidity mode">
                <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "add"}
                    className={mode === "add" ? "is-active" : ""}
                    onClick={() => setMode("add")}
                >
                    Add
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "remove"}
                    className={mode === "remove" ? "is-active" : ""}
                    onClick={() => setMode("remove")}
                >
                    Remove
                </button>
            </div>

            {mode === "add" ? (
                <AddLiquidityCard onAddHistoryEntry={addHistoryEntry} />
            ) : (
                <RemoveLiquidityCard onAddHistoryEntry={addHistoryEntry} />
            )}
        </div>
    );
}

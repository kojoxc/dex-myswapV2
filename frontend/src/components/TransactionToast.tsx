import type { TransactionState } from "../types";
import { compactAddress } from "../lib/format";

type TransactionToastProps = {
    tx: TransactionState;
};

export function TransactionToast({ tx }: TransactionToastProps) {
    if (tx.status === "idle") return null;

    const tone = tx.status === "success" ? "border-emerald-400/30 bg-emerald-400/10" : tx.status === "error" ? "border-red-400/30 bg-red-400/10" : "border-violet-400/30 bg-violet-400/10";

    return (
        <div className={`fixed bottom-5 left-4 right-4 z-50 rounded-3xl border p-4 shadow-2xl backdrop-blur-xl sm:left-auto sm:max-w-sm ${tone}`}>
            <p className="font-black">{tx.title}</p>
            {tx.message ? <p className="mt-1 text-sm text-slate-300">{tx.message}</p> : null}
            {tx.hash ? <p className="mt-2 text-xs text-slate-400">Tx: {compactAddress(tx.hash)}</p> : null}
        </div>
    );
}

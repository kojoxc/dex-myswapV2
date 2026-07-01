import { useAccount } from "wagmi";

import type { TransactionState } from "../types";
import { compactAddress } from "../lib/format";

type TransactionToastProps = {
    tx: TransactionState;
};

export function TransactionToast({ tx }: TransactionToastProps) {
    const { chain } = useAccount();

    if (tx.status === "idle") return null;

    const tone = tx.status === "success" ? "border-emerald-400/30 bg-emerald-400/10" : tx.status === "error" ? "border-danger/30 bg-danger/10" : "border-violet-400/30 bg-violet-400/10";
    const explorerUrl = tx.hash && chain?.blockExplorers?.default.url ? `${chain.blockExplorers.default.url}/tx/${tx.hash}` : undefined;

    return (
        <div role="status" aria-live="polite" className={`fixed bottom-24 left-3 right-3 z-50 rounded-lg border p-3 shadow-toast backdrop-blur-xl sm:bottom-5 sm:left-auto sm:right-5 sm:max-w-xs ${tone}`}>
            <p className="text-sm font-black text-primary">{tx.title}</p>
            {tx.message ? <p className="mt-0.5 text-xs text-secondary">{tx.message}</p> : null}
            {tx.hash ? (
                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
                    <span>{compactAddress(tx.hash)}</span>
                    {explorerUrl ? (
                        <a href={explorerUrl} target="_blank" rel="noreferrer" className="font-black text-pink-100 underline-offset-4 hover:underline">
                            View
                        </a>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

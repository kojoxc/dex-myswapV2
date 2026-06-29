import { useAccount } from "wagmi";

import type { TransactionState } from "../types";
import { compactAddress } from "../lib/format";

type TransactionToastProps = {
    tx: TransactionState;
};

export function TransactionToast({ tx }: TransactionToastProps) {
    const { chain } = useAccount();

    if (tx.status === "idle") return null;

    const tone = tx.status === "success" ? "border-emerald-400/30 bg-emerald-400/10" : tx.status === "error" ? "border-red-400/30 bg-red-400/10" : "border-violet-400/30 bg-violet-400/10";
    const explorerUrl = tx.hash && chain?.blockExplorers?.default.url ? `${chain.blockExplorers.default.url}/tx/${tx.hash}` : undefined;
    const steps = tx.status === "success" ? ["Confirmed", "Indexed", "Balances"] : tx.status === "error" ? ["Failed", "Review", "Retry"] : ["Wallet", "Submitted", "Confirming"];

    return (
        <div className={`fixed bottom-20 left-4 right-4 z-50 rounded-3xl border p-4 shadow-2xl backdrop-blur-xl sm:bottom-5 sm:left-auto sm:max-w-sm ${tone}`}>
            <p className="font-black">{tx.title}</p>
            {tx.message ? <p className="mt-1 text-sm text-slate-300">{tx.message}</p> : null}
            <div className="mt-3 grid grid-cols-3 gap-1" aria-label="Transaction progress">
                {steps.map((step, index) => (
                    <div key={step} className="min-w-0">
                        <div className={`h-1 rounded-full ${tx.status === "pending" && index > 0 ? "animate-pulse bg-white/20" : tx.status === "error" ? "bg-red-200/60" : "bg-emerald-200/70"}`} />
                        <p className="mt-1 truncate text-[0.65rem] font-bold text-slate-300">{step}</p>
                    </div>
                ))}
            </div>
            {tx.hash ? (
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-400">
                    <span>Tx: {compactAddress(tx.hash)}</span>
                    {explorerUrl ? (
                        <a href={explorerUrl} target="_blank" rel="noreferrer" className="font-black text-pink-100 underline-offset-4 hover:underline">
                            Explorer
                        </a>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

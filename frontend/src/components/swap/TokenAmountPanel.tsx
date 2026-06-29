import type { TokenInfo } from "../../types";
import { formatTokenAmount } from "../../lib/format";

type TokenAmountPanelProps = {
    label: string;
    amount: string;
    token?: TokenInfo;
    balance?: bigint;
    readOnly?: boolean;
    isLoading?: boolean;
    showMax?: boolean;
    tokenTone: "pay" | "receive";
    onAmountChange?: (value: string) => void;
    onMax?: () => void;
    onTokenClick: () => void;
};

function tokenInitials(token?: TokenInfo) {
    return token?.symbol?.slice(0, 2).toUpperCase() ?? "--";
}

export function TokenAmountPanel(props: TokenAmountPanelProps) {
    const gradient = props.tokenTone === "pay" ? "from-pink-500 to-blue-500" : "from-blue-500 to-cyan-400";
    const inputId = props.tokenTone === "pay" ? "pay-amount" : "receive-amount";

    return (
        <section className="min-w-0 w-full max-w-full rounded-[1.25rem] bg-[#151b29] p-4 shadow-inner" aria-label={`${props.label} panel`}>
            <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                    <label id={`${inputId}-label`} htmlFor={inputId} className="text-sm font-bold text-slate-300">
                        {props.label}
                    </label>
                    <p className="mt-1 truncate text-xs text-slate-500">
                        Balance: {formatTokenAmount(props.balance, props.token?.decimals ?? 18)} {props.token?.symbol ?? ""}
                    </p>
                </div>

                {props.showMax ? (
                    <button
                        type="button"
                        onClick={props.onMax}
                        className="rounded-full bg-pink-500/15 px-3 py-1 text-xs font-black text-pink-100 transition hover:bg-pink-500/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                    >
                        MAX
                    </button>
                ) : null}
            </div>

            <div className="mt-4 flex min-w-0 w-full max-w-full items-center gap-2">
                <input
                    id={inputId}
                    value={props.isLoading ? "..." : props.amount}
                    type="text"
                    inputMode="decimal"
                    readOnly={props.readOnly}
                    onChange={(event) => props.onAmountChange?.(event.target.value)}
                    placeholder="0"
                    aria-label={props.label}
                    className="min-w-0 w-0 flex-1 bg-transparent text-4xl font-black leading-none tracking-tight text-white outline-none placeholder:text-slate-700 sm:text-5xl"
                />

                <button
                    type="button"
                    onClick={props.onTokenClick}
                    aria-label={`Select ${props.tokenTone === "pay" ? "pay" : "receive"} token`}
                    className="flex min-w-0 shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.07] py-1.5 pl-1.5 pr-2.5 transition hover:border-pink-300/40 hover:bg-white/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                >
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br ${gradient} text-[0.6rem] font-black text-white`}>
                        {tokenInitials(props.token)}
                    </span>
                    <span className="max-w-[5.5rem] truncate text-sm font-black text-white">{props.token?.symbol ?? "Select"}</span>
                    <span aria-hidden="true" className="text-slate-500">
                        v
                    </span>
                </button>
            </div>
        </section>
    );
}

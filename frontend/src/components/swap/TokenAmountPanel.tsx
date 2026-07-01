import { useState } from "react";

import type { TokenInfo } from "../../types";
import { sanitizeAmountInput } from "../../lib/amountInput";
import { formatDisplayAmount, formatTokenAmount } from "../../lib/format";
import { Skeleton } from "../Skeleton";

type TokenAmountPanelProps = {
    label: string;
    amount: string;
    token?: TokenInfo;
    balance?: bigint;
    fiatValue?: string;
    readOnly?: boolean;
    isLoading?: boolean;
    showMax?: boolean;
    disabled?: boolean;
    tokenTone: "pay" | "receive";
    onAmountChange?: (value: string) => void;
    onMax?: () => void;
    onSelectToken: () => void;
};

function tokenInitials(token?: TokenInfo) {
    return token?.symbol?.slice(0, 2).toUpperCase() ?? "--";
}

function ChevronDownIcon() {
    return (
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 7.5 10 12.5l5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function WalletIcon() {
    return (
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M3.5 6.5h13v9h-13a2 2 0 0 1-2-2v-9a2 2 0 0 0 2 2Zm0 0h11.5v-2h-11.5a2 2 0 0 0 0 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13.5 11h1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

function amountSizeClass(display: string): string {
    const len = display.replace(/,/g, "").length;
    if (len > 12) return "amount-long";
    if (len > 9) return "amount-medium";
    return "amount-short";
}

export function TokenAmountPanel(props: TokenAmountPanelProps) {
    const [isAmountFocused, setIsAmountFocused] = useState(false);
    const gradient = props.tokenTone === "pay" ? "from-pink-500 to-blue-500" : "from-blue-500 to-cyan-400";
    const inputId = props.tokenTone === "pay" ? "pay-amount" : "receive-amount";
    const raw = props.amount;
    const displayAmount = props.readOnly || !isAmountFocused ? formatDisplayAmount(raw, 6) : raw;
    const formattedBalance = formatDisplayAmount(formatTokenAmount(props.balance, props.token?.decimals ?? 18), 6);
    const inputClass = `${amountSizeClass(displayAmount || "0")} ${props.readOnly ? "token-amount-value" : "token-amount-input"}`;

    return (
        <section className="token-input-panel min-w-0 w-full max-w-full" aria-label={`${props.label} panel`}>
            <label id={`${inputId}-label`} htmlFor={inputId} className="token-panel-label">
                {props.label}
            </label>

            <div className="token-panel-main">
                {props.isLoading ? (
                    <Skeleton className="h-12 w-40" />
                ) : (
                    <input
                        id={inputId}
                        value={displayAmount}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        readOnly={props.readOnly}
                        disabled={props.disabled}
                        onChange={(event) => props.onAmountChange?.(sanitizeAmountInput(event.target.value, props.token?.decimals))}
                        onFocus={() => setIsAmountFocused(true)}
                        onBlur={() => setIsAmountFocused(false)}
                        placeholder="0"
                        aria-label={props.label}
                        className={inputClass}
                    />
                )}

                {props.isLoading && !props.token ? (
                    <Skeleton className="h-[52px] w-28" />
                ) : (
                    <button
                        type="button"
                        onClick={props.onSelectToken}
                        disabled={props.disabled}
                        aria-label={`Select ${props.label} token`}
                        className="token-selector"
                    >
                        <span className={`token-icon grid shrink-0 place-items-center bg-gradient-to-br ${gradient} font-black text-white`}>
                            {tokenInitials(props.token)}
                        </span>
                        <span className="max-w-[5.5rem] truncate">{props.token?.symbol ?? "Select"}</span>
                        <ChevronDownIcon />
                    </button>
                )}
            </div>

            <div className="token-panel-footer">
                <span className="fiat-value">{props.fiatValue ?? "$0.00"}</span>
                <div className="balance-group">
                    <button type="button" className="balance-action" onClick={props.showMax ? props.onMax : undefined} disabled={!props.showMax || props.disabled}>
                        <WalletIcon />
                        <span>Balance: {formattedBalance}</span>
                    </button>
                    {props.showMax ? (
                        <button type="button" className="max-action" onClick={props.onMax} disabled={props.disabled}>
                            Max
                        </button>
                    ) : null}
                </div>
            </div>
        </section>
    );
}

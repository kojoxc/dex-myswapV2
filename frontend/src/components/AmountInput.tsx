import { formatTokenAmount } from "../lib/format";

type AmountInputProps = {
    label: string;
    value: string;
    symbol?: string;
    balance?: bigint;
    decimals?: number;
    readOnly?: boolean;
    onChange?: (value: string) => void;
    onMax?: () => void;
};

export function AmountInput(props: AmountInputProps) {
    return (
        <div className="input-shell rounded-3xl p-4">
            <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
                <span>{props.label}</span>
                <span>
                    Balance: {formatTokenAmount(props.balance, props.decimals ?? 18)} {props.symbol ?? ""}
                </span>
            </div>
            <div className="flex items-center gap-3">
                <input
                    value={props.value}
                    type={props.readOnly ? "text" : "number"}
                    min={props.readOnly ? undefined : "0"}
                    step={props.readOnly ? undefined : "any"}
                    inputMode={props.readOnly ? "text" : "decimal"}
                    readOnly={props.readOnly}
                    onChange={(event) => props.onChange?.(event.target.value)}
                    placeholder="0.0"
                    className="w-full bg-transparent text-3xl font-black outline-none placeholder:text-slate-600"
                />
                {props.onMax ? (
                    <button
                        type="button"
                        onClick={props.onMax}
                        className="rounded-full bg-violet-500/15 px-3 py-1 text-xs font-black text-violet-200 transition hover:bg-violet-500/25"
                    >
                        MAX
                    </button>
                ) : null}
            </div>
        </div>
    );
}

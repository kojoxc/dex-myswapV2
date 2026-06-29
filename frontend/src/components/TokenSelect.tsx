import type { TokenInfo } from "../types";
import { compactAddress } from "../lib/format";

type TokenSelectProps = {
    label: string;
    value: string;
    token?: TokenInfo;
    isLoading?: boolean;
    error?: string;
    onChange: (value: string) => void;
};

export function TokenSelect(props: TokenSelectProps) {
    return (
        <label className="grid gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{props.label}</span>
            <div className="input-shell rounded-2xl px-4 py-3">
                <input
                    value={props.value}
                    onChange={(event) => props.onChange(event.target.value)}
                    placeholder="0x token address"
                    spellCheck={false}
                    className="mb-3 w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
                />
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="font-black">{props.token?.symbol ?? (props.isLoading ? "Loading..." : "Select token")}</p>
                        <p className="text-xs text-slate-400">
                            {props.token ? `${props.token.name} • ${compactAddress(props.token.address)}` : "Paste ERC20 address"}
                        </p>
                    </div>
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-violet-500/80 to-cyan-400/80 text-sm font-black">
                        {props.token?.symbol?.slice(0, 2) ?? "--"}
                    </div>
                </div>
                {props.error ? <p className="mt-3 text-xs text-red-300">Invalid token or RPC error.</p> : null}
            </div>
        </label>
    );
}

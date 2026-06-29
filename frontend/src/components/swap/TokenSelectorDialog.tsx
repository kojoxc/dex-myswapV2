import type { TokenInfo } from "../../types";
import { compactAddress } from "../../lib/format";
import { Dialog } from "./Dialog";

type TokenSelectorDialogProps = {
    open: boolean;
    title: string;
    value: string;
    token?: TokenInfo;
    isValidAddress: boolean;
    isLoading?: boolean;
    error?: string;
    onChange: (value: string) => void;
    onClose: () => void;
};

function tokenInitials(token?: TokenInfo) {
    return token?.symbol?.slice(0, 2).toUpperCase() ?? "--";
}

export function TokenSelectorDialog(props: TokenSelectorDialogProps) {
    return (
        <Dialog open={props.open} title={props.title} onClose={props.onClose}>
            <div className="grid gap-4">
                <label className="grid gap-2 text-sm font-bold text-slate-300">
                    Token contract address
                    <input
                        value={props.value}
                        onChange={(event) => props.onChange(event.target.value)}
                        placeholder="0x token contract"
                        spellCheck={false}
                        aria-invalid={Boolean(props.value) && !props.isValidAddress}
                        className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-pink-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                    />
                </label>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-blue-500 text-sm font-black">
                            {tokenInitials(props.token)}
                        </div>
                        <div className="min-w-0">
                            <p className="font-black text-white">{props.token?.symbol ?? (props.isLoading ? "Loading..." : "Token preview")}</p>
                            <p className="truncate text-sm text-slate-400">
                                {props.token ? `${props.token.name} • ${compactAddress(props.token.address)}` : "Paste an ERC20 contract address."}
                            </p>
                        </div>
                    </div>

                    {props.error ? (
                        <p role="alert" className="mt-3 text-sm text-red-200">
                            Token is not supported or the RPC could not load its metadata.
                        </p>
                    ) : null}
                    {props.value && !props.isValidAddress ? <p className="mt-3 text-sm text-amber-100">Enter a valid EVM address.</p> : null}
                </div>

                <button
                    type="button"
                    onClick={props.onClose}
                    className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                >
                    Done
                </button>
            </div>
        </Dialog>
    );
}

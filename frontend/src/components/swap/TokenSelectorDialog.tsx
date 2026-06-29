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
    tokens?: TokenInfo[];
    tokenListLoading?: boolean;
    onChange: (value: string) => void;
    onClose: () => void;
};

function tokenInitials(token?: TokenInfo) {
    return token?.symbol?.slice(0, 2).toUpperCase() ?? "--";
}

export function TokenSelectorDialog(props: TokenSelectorDialogProps) {
    const listedTokens = props.tokens?.filter((token) => token.address.toLowerCase() !== props.value.toLowerCase()) ?? [];

    return (
        <Dialog open={props.open} title={props.title} onClose={props.onClose}>
            <div className="grid gap-4">
                <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-3" aria-label="Known tokens">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-black text-white">Token list</p>
                            <p className="mt-1 text-xs text-slate-500">Loaded from deployment, env, and recent route.</p>
                        </div>
                        {props.tokenListLoading ? <span className="rounded-full bg-white/[0.06] px-2 py-1 text-xs font-bold text-slate-300">Loading</span> : null}
                    </div>

                    {listedTokens.length > 0 ? (
                        <div className="mt-3 grid max-h-52 gap-2 overflow-y-auto pr-1">
                            {listedTokens.map((listedToken) => (
                                <button
                                    key={listedToken.address}
                                    type="button"
                                    onClick={() => props.onChange(listedToken.address)}
                                    className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/[0.08] bg-black/10 p-3 text-left transition hover:border-pink-300/40 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                                >
                                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-blue-500 text-xs font-black text-white">
                                        {tokenInitials(listedToken)}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-black text-white">{listedToken.symbol}</span>
                                        <span className="block truncate text-xs text-slate-500">{listedToken.name} • {compactAddress(listedToken.address)}</span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="mt-3 rounded-2xl border border-dashed border-white/10 bg-black/10 p-3 text-sm text-slate-400">
                            No saved tokens yet. Paste an ERC20 address below or add deployment tokens.
                        </p>
                    )}
                </section>

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

import { Dialog } from "./Dialog";

type SwapSettingsDialogProps = {
    open: boolean;
    title?: string;
    routeTitle?: string;
    tokenInLabel?: string;
    tokenOutLabel?: string;
    routerAddress: string;
    tokenInAddress: string;
    tokenOutAddress: string;
    slippageBps: number;
    deadlineMinutes: number;
    hasValidRouter: boolean;
    hasValidTokenInAddress: boolean;
    hasValidTokenOutAddress: boolean;
    onClose: () => void;
    onRouterChange: (value: string) => void;
    onTokenInChange: (value: string) => void;
    onTokenOutChange: (value: string) => void;
    onSlippageChange: (value: number) => void;
    onDeadlineChange: (value: number) => void;
};

type ContractInputProps = {
    label: string;
    value: string;
    placeholder: string;
    isValid: boolean;
    onChange: (value: string) => void;
};

function ContractInput({ label, value, placeholder, isValid, onChange }: ContractInputProps) {
    return (
        <label className="grid gap-2">
            <span className="flex items-center justify-between gap-3 text-sm font-bold text-slate-300">
                {label}
                <span aria-hidden="true" className="text-xs text-slate-500">{isValid ? "Configured" : "Required"}</span>
            </span>
            <input
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                spellCheck={false}
                aria-label={label}
                aria-invalid={!isValid}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-pink-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
            />
        </label>
    );
}

export function SwapSettingsDialog(props: SwapSettingsDialogProps) {
    const slippagePercent = props.slippageBps / 100;
    const hasHighSlippage = props.slippageBps > 5_000;
    const title = props.title ?? "Swap settings";
    const routeTitle = props.routeTitle ?? "Route configuration";
    const tokenInLabel = props.tokenInLabel ?? "Pay token address";
    const tokenOutLabel = props.tokenOutLabel ?? "Receive token address";

    return (
        <Dialog open={props.open} title={title} onClose={props.onClose}>
            <div className="grid gap-5">
                <section className="grid gap-3" aria-labelledby="route-settings-title">
                    <div>
                        <h3 id="route-settings-title" className="text-sm font-black text-white">
                            {routeTitle}
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-slate-400">Only needed for local or development deployments.</p>
                    </div>

                    <ContractInput
                        label="Router address"
                        value={props.routerAddress}
                        placeholder="0x router contract"
                        isValid={props.hasValidRouter}
                        onChange={props.onRouterChange}
                    />
                    <ContractInput
                        label={tokenInLabel}
                        value={props.tokenInAddress}
                        placeholder="0x token contract"
                        isValid={props.hasValidTokenInAddress}
                        onChange={props.onTokenInChange}
                    />
                    <ContractInput
                        label={tokenOutLabel}
                        value={props.tokenOutAddress}
                        placeholder="0x token contract"
                        isValid={props.hasValidTokenOutAddress}
                        onChange={props.onTokenOutChange}
                    />
                </section>

                <section className="grid gap-3 border-t border-white/10 pt-5" aria-labelledby="advanced-settings-title">
                    <div>
                        <h3 id="advanced-settings-title" className="text-sm font-black text-white">
                            Advanced settings
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-slate-400">Defaults are safe for normal swaps.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <label className="grid gap-2 text-sm font-bold text-slate-300">
                            Slippage %
                            <input
                                value={slippagePercent}
                                type="number"
                                min="0"
                                step="0.1"
                                onChange={(event) => props.onSlippageChange(Number(event.target.value) * 100)}
                                aria-invalid={hasHighSlippage}
                                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none focus:border-pink-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                            />
                        </label>

                        <label className="grid gap-2 text-sm font-bold text-slate-300">
                            Deadline min
                            <input
                                value={props.deadlineMinutes}
                                type="number"
                                min="1"
                                step="1"
                                onChange={(event) => props.onDeadlineChange(Number(event.target.value))}
                                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none focus:border-pink-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                            />
                        </label>
                    </div>

                    {hasHighSlippage ? (
                        <p role="alert" className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
                            Slippage is very high. Your received amount may be much lower than quoted.
                        </p>
                    ) : null}
                </section>
            </div>
        </Dialog>
    );
}

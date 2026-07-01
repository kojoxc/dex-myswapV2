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
            <span className="flex items-center justify-between gap-3 text-sm font-bold text-secondary">
                {label}
                <span aria-hidden="true" className="text-xs text-muted">{isValid ? "Configured" : "Required"}</span>
            </span>
            <input
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                spellCheck={false}
                aria-label={label}
                aria-invalid={!isValid}
                className="rounded-lg surface-input px-4 py-3 text-sm text-primary outline-none placeholder:text-slate-600 focus:border-white/20"
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
                        <h3 id="route-settings-title" className="text-sm font-black text-primary">
                            {routeTitle}
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-secondary">Only needed for local or development deployments.</p>
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
                        <h3 id="advanced-settings-title" className="text-sm font-black text-primary">
                            Advanced settings
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-secondary">Defaults are safe for normal swaps.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="min-w-0 grid gap-2 text-sm font-bold text-secondary">
                                Slippage %
                                <div className="flex gap-2">
                                    {[0.1, 0.5, 1.0].map((preset) => (
                                        <button
                                            key={preset}
                                            type="button"
                                            onClick={() => props.onSlippageChange(preset * 100)}
                                            className={`min-h-[38px] flex-1 rounded-lg border px-3 text-xs font-bold transition ${
                                                slippagePercent === preset ? "border-pink-400/50 bg-pink-400/10 text-pink-200" : "border-white/10 bg-white/[0.04] text-secondary hover:bg-white/[0.08]"
                                            }`}
                                        >
                                            {preset}%
                                        </button>
                                    ))}
                                </div>
                                <input
                                    value={slippagePercent}
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    onChange={(event) => props.onSlippageChange(Number(event.target.value) * 100)}
                                    aria-invalid={hasHighSlippage}
                                    className="w-full min-w-0 rounded-lg surface-input px-4 py-3 text-primary outline-none focus:border-white/20"
                                />
                        </label>

                        <label className="min-w-0 grid gap-2 text-sm font-bold text-secondary">
                                Deadline min
                                <input
                                    value={props.deadlineMinutes}
                                    type="number"
                                    min="1"
                                    step="1"
                                    onChange={(event) => props.onDeadlineChange(Number(event.target.value))}
                                    className="w-full min-w-0 rounded-lg surface-input px-4 py-3 text-primary outline-none focus:border-white/20"
                                />
                        </label>
                    </div>

                    {hasHighSlippage ? (
                        <p role="alert" className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
                            Slippage is very high. Your received amount may be much lower than quoted.
                        </p>
                    ) : null}
                </section>
            </div>
        </Dialog>
    );
}

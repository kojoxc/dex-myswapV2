type SettingsDrawerProps = {
    routerAddress: string;
    slippageBps: number;
    deadlineMinutes: number;
    onRouterChange: (value: string) => void;
    onSlippageChange: (value: number) => void;
    onDeadlineChange: (value: number) => void;
};

export function SettingsDrawer(props: SettingsDrawerProps) {
    return (
        <details className="group rounded-3xl border border-white/10 bg-white/[0.035] p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-black text-slate-200">
                Settings
                <span className="text-slate-500 transition group-open:rotate-180">⌄</span>
            </summary>

            <div className="mt-4 grid gap-4">
                <label className="grid gap-2 text-sm text-slate-300">
                    Router address
                    <input
                        value={props.routerAddress}
                        onChange={(event) => props.onRouterChange(event.target.value)}
                        placeholder="0x router address"
                        className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none focus:border-violet-400"
                    />
                </label>

                <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-2 text-sm text-slate-300">
                        Slippage %
                        <input
                            value={props.slippageBps / 100}
                            type="number"
                            min="0"
                            step="0.1"
                            onChange={(event) => props.onSlippageChange(Number(event.target.value) * 100)}
                            className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none focus:border-violet-400"
                        />
                    </label>
                    <label className="grid gap-2 text-sm text-slate-300">
                        Deadline minutes
                        <input
                            value={props.deadlineMinutes}
                            type="number"
                            min="1"
                            step="1"
                            onChange={(event) => props.onDeadlineChange(Number(event.target.value))}
                            className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none focus:border-violet-400"
                        />
                    </label>
                </div>
            </div>
        </details>
    );
}

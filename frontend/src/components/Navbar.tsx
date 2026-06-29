import { ConnectButton } from "@rainbow-me/rainbowkit";
import { NavLink } from "react-router-dom";

export function Navbar() {
    return (
        <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:h-[72px] sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-pink-500 via-fuchsia-500 to-blue-500 font-black shadow-glow">
                    M
                </div>
                <div className="hidden min-w-0 sm:block">
                    <p className="text-sm font-black tracking-wide text-white">MySwap</p>
                </div>

                <nav className="ml-0 rounded-full border border-white/10 bg-white/[0.04] p-1 sm:ml-4">
                    <NavLink
                        to="/swap"
                        className={({ isActive }) =>
                            `rounded-full px-3 py-2 text-sm font-black transition sm:px-4 ${
                                isActive ? "bg-white text-slate-950" : "text-slate-300 hover:text-white"
                            }`
                        }
                    >
                        Swap
                    </NavLink>
                    <NavLink
                        to="/liquidity"
                        className={({ isActive }) =>
                            `rounded-full px-3 py-2 text-sm font-black transition sm:px-4 ${
                                isActive ? "bg-white text-slate-950" : "text-slate-300 hover:text-white"
                            }`
                        }
                    >
                        Liquidity
                    </NavLink>
                    <NavLink
                        to="/pools"
                        className={({ isActive }) =>
                            `rounded-full px-3 py-2 text-sm font-black transition sm:px-4 ${
                                isActive ? "bg-white text-slate-950" : "text-slate-300 hover:text-white"
                            }`
                        }
                    >
                        Pools
                    </NavLink>
                </nav>
            </div>

            <ConnectButton.Custom>
                {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
                    const connected = mounted && account && chain;

                    return (
                        <div className="flex shrink-0 items-center gap-2" aria-hidden={!mounted}>
                            <button
                                type="button"
                                disabled={!connected}
                                onClick={openChainModal}
                                className="hidden h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 text-sm font-black text-slate-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300 min-[420px]:flex"
                            >
                                <span className={chain?.unsupported ? "h-2 w-2 rounded-full bg-red-300" : "h-2 w-2 rounded-full bg-emerald-300"} />
                                <span className="max-w-28 truncate">{chain?.unsupported ? "Wrong network" : chain?.name ?? "Network"}</span>
                            </button>

                            <button
                                type="button"
                                onClick={connected ? openAccountModal : openConnectModal}
                                className="h-10 rounded-full bg-white px-3 text-sm font-black text-slate-950 transition hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300 sm:px-4"
                            >
                                {connected ? account.displayName : <><span className="sm:hidden">Connect</span><span className="hidden sm:inline">Connect Wallet</span></>}
                            </button>
                        </div>
                    );
                }}
            </ConnectButton.Custom>
        </header>
    );
}

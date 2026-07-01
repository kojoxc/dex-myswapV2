import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { RefObject } from "react";
import { NavLink } from "react-router-dom";

type NavbarProps = {
    activityOpen: boolean;
    pendingCount?: number;
    onActivityClick: () => void;
    activityButtonRef: RefObject<HTMLButtonElement>;
};

function ActivityIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
        </svg>
    );
}

export function Navbar({ activityOpen, pendingCount = 0, onActivityClick, activityButtonRef }: NavbarProps) {
    const linkClass = ({ isActive }: { isActive: boolean }) =>
        isActive ? "is-active" : "";

    return (
        <header className="app-header">
            <div className="app-header-inner">
                <div className="brand-group">
                    <img src="/logo.png" alt="MySwap" className="brand-mark" />
                    <span className="brand-name">MySwap</span>
                </div>

                <nav className="primary-nav" aria-label="Primary">
                    <NavLink to="/swap" className={linkClass}>
                        Swap
                    </NavLink>
                    <NavLink to="/liquidity" className={linkClass}>
                        Liquidity
                    </NavLink>
                    <NavLink to="/pools" className={linkClass}>
                        Pools
                    </NavLink>
                </nav>

                <ConnectButton.Custom>
                    {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
                        const connected = mounted && account && chain;

                        return (
                            <div className="header-actions" aria-hidden={!mounted}>
                                <button
                                    type="button"
                                    disabled={!connected}
                                    onClick={openChainModal}
                                    className="network-control"
                                    aria-label="Switch network"
                                >
                                    <span className={`network-dot${chain?.unsupported ? " is-unsupported" : ""}`} />
                                    <span className="network-label-long">{chain?.unsupported ? "Wrong network" : (chain?.name ?? "Network")}</span>
                                    <span className="network-label-short">{chain?.unsupported ? "Wrong" : (chain?.name ?? "Network")}</span>
                                </button>

                                <button
                                    ref={activityButtonRef}
                                    type="button"
                                    aria-label="Open activity drawer"
                                    aria-expanded={activityOpen}
                                    onClick={onActivityClick}
                                    className="activity-control"
                                >
                                    <ActivityIcon />
                                    <span className="activity-label">Activity</span>
                                    {pendingCount > 0 ? (
                                        <span className="badge-pending">{pendingCount}</span>
                                    ) : null}
                                </button>

                                <button
                                    type="button"
                                    onClick={connected ? openAccountModal : openConnectModal}
                                    className="wallet-control"
                                    aria-label={connected ? "Account" : "Connect wallet"}
                                >
                                    {connected ? account.displayName : "Connect"}
                                </button>
                            </div>
                        );
                    }}
                </ConnectButton.Custom>
            </div>
        </header>
    );
}

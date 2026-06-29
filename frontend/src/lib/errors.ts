export function normalizeTransactionError(caught: unknown, fallback: string) {
    if (!(caught instanceof Error)) return fallback;

    const message = caught.message.toLowerCase();
    if (message.includes("user rejected") || message.includes("user denied") || message.includes("rejected the request")) {
        return "Transaction was rejected in your wallet.";
    }
    if (message.includes("insufficient funds")) return "Wallet does not have enough gas to submit the transaction.";
    if (message.includes("timeout") || message.includes("timed out")) return "RPC timeout. Try again or switch RPC/network.";
    if (message.includes("revert") || message.includes("reverted")) return "Transaction reverted on-chain. Check liquidity, route, and minimum received.";
    if (message.includes("network") || message.includes("chain")) return "Unsupported network or RPC unavailable.";

    return fallback;
}

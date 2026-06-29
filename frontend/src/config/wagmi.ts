import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";
import { mainnet, sepolia } from "wagmi/chains";

export const anvil = defineChain({
    id: 31337,
    name: "Anvil Localhost",
    nativeCurrency: {
        decimals: 18,
        name: "Ether",
        symbol: "ETH",
    },
    rpcUrls: {
        default: {
            http: [import.meta.env.VITE_RPC_URL ?? "http://127.0.0.1:8545"],
        },
    },
});

export const wagmiConfig = getDefaultConfig({
    appName: "MySwap V2",
    projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "myswap-v2-local-dev",
    chains: [mainnet, sepolia, anvil],
    ssr: false,
});

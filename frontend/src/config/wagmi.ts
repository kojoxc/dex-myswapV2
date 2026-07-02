import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http, createConfig } from "wagmi";
import { defineChain } from "viem";
import { mainnet, sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

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

const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

export const wagmiConfig = walletConnectProjectId
    ? getDefaultConfig({
          appName: "MySwap V2",
          projectId: walletConnectProjectId,
          chains: [anvil, mainnet, sepolia],
          ssr: false,
      })
    : createConfig({
          chains: [anvil, mainnet, sepolia],
          transports: {
              [anvil.id]: http(),
              [mainnet.id]: http(),
              [sepolia.id]: http(),
          },
          connectors: [injected()],
          ssr: false,
      });

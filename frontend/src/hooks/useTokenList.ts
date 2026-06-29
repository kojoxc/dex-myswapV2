import { useEffect, useMemo, useState } from "react";
import { type Address, isAddress } from "viem";
import { usePublicClient } from "wagmi";

import { erc20Abi } from "../abis";
import {
    DEFAULT_TOKEN_IN_ADDRESS,
    DEFAULT_TOKEN_OUT_ADDRESS,
    STORAGE_KEYS,
    loadStorage,
} from "../lib/tradeConfig";
import type { TokenInfo } from "../types";
import type { DeploymentConfig } from "./useDeploymentConfig";

function uniqueAddresses(values: Array<string | undefined>) {
    const seen = new Set<string>();
    const addresses: Address[] = [];

    for (const value of values) {
        if (!value || !isAddress(value)) continue;
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        addresses.push(value as Address);
    }

    return addresses;
}

export function useTokenList(args: { deployment?: DeploymentConfig; extraAddresses?: string[] }) {
    const publicClient = usePublicClient();
    const [tokens, setTokens] = useState<TokenInfo[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string>();
    const extraAddressKey = args.extraAddresses?.join("|") ?? "";

    const addresses = useMemo(
        () =>
            uniqueAddresses([
                DEFAULT_TOKEN_IN_ADDRESS,
                DEFAULT_TOKEN_OUT_ADDRESS,
                loadStorage(STORAGE_KEYS.tokenIn),
                loadStorage(STORAGE_KEYS.tokenOut),
                args.deployment?.weth,
                ...(args.deployment?.tokens.map((token) => token.address) ?? []),
                ...(args.extraAddresses ?? []),
            ]),
        [args.deployment, extraAddressKey],
    );

    useEffect(() => {
        let cancelled = false;

        async function loadTokens() {
            setTokens([]);
            setError(undefined);

            if (!publicClient || addresses.length === 0) {
                setIsLoading(false);
                return;
            }

            setIsLoading(true);

            try {
                const nextTokens = await Promise.all(
                    addresses.map(async (address) => {
                        const [name, symbol, decimals] = await Promise.all([
                            publicClient.readContract({ address, abi: erc20Abi, functionName: "name" }),
                            publicClient.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
                            publicClient.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
                        ]);

                        return { address, name, symbol, decimals };
                    }),
                );

                if (!cancelled) setTokens(nextTokens);
            } catch (caught) {
                if (!cancelled) setError(caught instanceof Error ? caught.message : "Failed to load token list");
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        loadTokens();

        return () => {
            cancelled = true;
        };
    }, [addresses, publicClient]);

    return { tokens, isLoading, error };
}

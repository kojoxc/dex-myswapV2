import { useEffect, useMemo, useState } from "react";
import { type Address, isAddress } from "viem";
import { useAccount, usePublicClient } from "wagmi";

import { erc20Abi } from "../abis";
import type { TokenInfo } from "../types";

type UseTokenResult = {
    token?: TokenInfo;
    balance?: bigint;
    allowance?: bigint;
    isLoading: boolean;
    error?: string;
    refetch: () => void;
};

export function useToken(tokenAddress: string, spender?: string): UseTokenResult {
    const { address: owner } = useAccount();
    const publicClient = usePublicClient();
    const [nonce, setNonce] = useState(0);
    const [token, setToken] = useState<TokenInfo>();
    const [balance, setBalance] = useState<bigint>();
    const [allowance, setAllowance] = useState<bigint>();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string>();

    const normalizedAddress = useMemo(() => {
        const value = tokenAddress.trim();
        return isAddress(value) ? (value as Address) : undefined;
    }, [tokenAddress]);

    useEffect(() => {
        let cancelled = false;

        async function loadToken() {
            setError(undefined);
            setToken(undefined);
            setBalance(undefined);
            setAllowance(undefined);

            if (!normalizedAddress || !publicClient) {
                setIsLoading(false);
                return;
            }

            setIsLoading(true);

            try {
                const calls = [
                    publicClient.readContract({ address: normalizedAddress, abi: erc20Abi, functionName: "name" }),
                    publicClient.readContract({ address: normalizedAddress, abi: erc20Abi, functionName: "symbol" }),
                    publicClient.readContract({ address: normalizedAddress, abi: erc20Abi, functionName: "decimals" }),
                ] as const;

                const [name, symbol, decimals] = await Promise.all(calls);
                const nextToken = {
                    address: normalizedAddress,
                    name,
                    symbol,
                    decimals,
                };

                let nextBalance: bigint | undefined;
                let nextAllowance: bigint | undefined;

                if (owner) {
                    nextBalance = await publicClient.readContract({
                        address: normalizedAddress,
                        abi: erc20Abi,
                        functionName: "balanceOf",
                        args: [owner],
                    });
                }

                if (owner && spender && isAddress(spender)) {
                    nextAllowance = await publicClient.readContract({
                        address: normalizedAddress,
                        abi: erc20Abi,
                        functionName: "allowance",
                        args: [owner, spender as Address],
                    });
                }

                if (!cancelled) {
                    setToken(nextToken);
                    setBalance(nextBalance);
                    setAllowance(nextAllowance);
                }
            } catch (caught) {
                if (!cancelled) {
                    setError(caught instanceof Error ? caught.message : "Failed to load token");
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        loadToken();

        return () => {
            cancelled = true;
        };
    }, [normalizedAddress, owner, publicClient, spender, nonce]);

    return {
        token,
        balance,
        allowance,
        isLoading,
        error,
        refetch: () => setNonce((value) => value + 1),
    };
}

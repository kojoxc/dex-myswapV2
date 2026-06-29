import { useEffect, useState } from "react";
import { type Address, isAddress } from "viem";
import { useAccount, usePublicClient } from "wagmi";

import { erc20Abi, factoryAbi, pairAbi, routerAbi } from "../abis";
import type { TokenInfo } from "../types";

export type PoolInfo = {
    pairAddress: Address;
    tokenA: TokenInfo;
    tokenB: TokenInfo;
    reserveA: bigint;
    reserveB: bigint;
    totalSupply: bigint;
    userLpBalance?: bigint;
};

async function loadToken(publicClient: NonNullable<ReturnType<typeof usePublicClient>>, address: Address): Promise<TokenInfo> {
    const [name, symbol, decimals] = await Promise.all([
        publicClient.readContract({ address, abi: erc20Abi, functionName: "name" }),
        publicClient.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
        publicClient.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
    ]);

    return { address, name, symbol, decimals };
}

export function usePools(routerAddress: string) {
    const publicClient = usePublicClient();
    const { address: account } = useAccount();
    const [pools, setPools] = useState<PoolInfo[]>([]);
    const [factoryAddress, setFactoryAddress] = useState<Address>();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string>();
    const [nonce, setNonce] = useState(0);

    useEffect(() => {
        let cancelled = false;

        async function loadPools() {
            setPools([]);
            setFactoryAddress(undefined);
            setError(undefined);

            if (!publicClient || !isAddress(routerAddress)) {
                setIsLoading(false);
                return;
            }

            setIsLoading(true);

            try {
                const factory = await publicClient.readContract({ address: routerAddress as Address, abi: routerAbi, functionName: "factory" });
                const pairCount = await publicClient.readContract({ address: factory, abi: factoryAbi, functionName: "allPairsLength" });
                const cappedPairCount = Math.min(Number(pairCount), 50);
                const pairIndexes = Array.from({ length: cappedPairCount }, (_, index) => BigInt(index));

                const pairAddresses = await Promise.all(
                    pairIndexes.map((index) => publicClient.readContract({ address: factory, abi: factoryAbi, functionName: "allPairs", args: [index] })),
                );

                const nextPools = await Promise.all(
                    pairAddresses.map(async (pairAddress) => {
                        const [token0, token1, reserves, totalSupply, userLpBalance] = await Promise.all([
                            publicClient.readContract({ address: pairAddress, abi: pairAbi, functionName: "token0" }),
                            publicClient.readContract({ address: pairAddress, abi: pairAbi, functionName: "token1" }),
                            publicClient.readContract({ address: pairAddress, abi: pairAbi, functionName: "getReserves" }),
                            publicClient.readContract({ address: pairAddress, abi: erc20Abi, functionName: "totalSupply" }),
                            account
                                ? publicClient.readContract({ address: pairAddress, abi: erc20Abi, functionName: "balanceOf", args: [account] })
                                : Promise.resolve(undefined),
                        ]);

                        const [tokenA, tokenB] = await Promise.all([loadToken(publicClient, token0), loadToken(publicClient, token1)]);
                        const [reserveA, reserveB] = reserves;

                        return {
                            pairAddress,
                            tokenA,
                            tokenB,
                            reserveA,
                            reserveB,
                            totalSupply,
                            userLpBalance,
                        };
                    }),
                );

                if (!cancelled) {
                    setFactoryAddress(factory);
                    setPools(nextPools);
                }
            } catch (caught) {
                if (!cancelled) setError(caught instanceof Error ? caught.message : "Failed to load pools");
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        loadPools();

        return () => {
            cancelled = true;
        };
    }, [account, nonce, publicClient, routerAddress]);

    return { pools, factoryAddress, isLoading, error, refetch: () => setNonce((value) => value + 1) };
}

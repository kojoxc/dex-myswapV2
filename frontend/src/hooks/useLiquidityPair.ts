import { useEffect, useState } from "react";
import { type Address, isAddress } from "viem";
import { useChainId, usePublicClient } from "wagmi";

import { erc20Abi, factoryAbi, pairAbi, routerAbi } from "../abis";
import { getWethAddress, resolveNativeAddress } from "../lib/tokenRegistry";
import type { TokenInfo } from "../types";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type UseLiquidityPairResult = {
    factoryAddress?: Address;
    pairAddress?: Address;
    reserveA?: bigint;
    reserveB?: bigint;
    totalSupply?: bigint;
    isLoading: boolean;
    error?: string;
    refetch: () => void;
};

export function useLiquidityPair(args: { routerAddress: string; tokenA?: TokenInfo; tokenB?: TokenInfo; wethAddress?: Address }): UseLiquidityPairResult {
    const publicClient = usePublicClient();
    const chainId = useChainId();
    const [nonce, setNonce] = useState(0);
    const [factoryAddress, setFactoryAddress] = useState<Address>();
    const [pairAddress, setPairAddress] = useState<Address>();
    const [reserveA, setReserveA] = useState<bigint>();
    const [reserveB, setReserveB] = useState<bigint>();
    const [totalSupply, setTotalSupply] = useState<bigint>();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string>();

    const wethAddress = args.wethAddress ?? getWethAddress(chainId);
    const tokenAAddress = args.tokenA ? resolveNativeAddress(args.tokenA.address, wethAddress) : undefined;
    const tokenBAddress = args.tokenB ? resolveNativeAddress(args.tokenB.address, wethAddress) : undefined;

    useEffect(() => {
        let cancelled = false;

        async function loadPair() {
            setFactoryAddress(undefined);
            setPairAddress(undefined);
            setReserveA(undefined);
            setReserveB(undefined);
            setTotalSupply(undefined);
            setError(undefined);

            if (!publicClient || !isAddress(args.routerAddress) || !tokenAAddress || !tokenBAddress || tokenAAddress.toLowerCase() === tokenBAddress.toLowerCase()) {
                setIsLoading(false);
                return;
            }

            setIsLoading(true);

            try {
                const factory = await publicClient.readContract({
                    address: args.routerAddress as Address,
                    abi: routerAbi,
                    functionName: "factory",
                });

                const pair = await publicClient.readContract({
                    address: factory,
                    abi: factoryAbi,
                    functionName: "getPair",
                    args: [tokenAAddress, tokenBAddress],
                });

                if (cancelled) return;

                setFactoryAddress(factory);

                if (pair.toLowerCase() === ZERO_ADDRESS) {
                    setPairAddress(undefined);
                    return;
                }

                const [token0, reserves, supply] = await Promise.all([
                    publicClient.readContract({ address: pair, abi: pairAbi, functionName: "token0" }),
                    publicClient.readContract({ address: pair, abi: pairAbi, functionName: "getReserves" }),
                    publicClient.readContract({ address: pair, abi: erc20Abi, functionName: "totalSupply" }),
                ]);

                if (cancelled) return;

                const [reserve0, reserve1] = reserves;
                const tokenAIsToken0 = tokenAAddress.toLowerCase() === token0.toLowerCase();

                setPairAddress(pair);
                setReserveA(tokenAIsToken0 ? reserve0 : reserve1);
                setReserveB(tokenAIsToken0 ? reserve1 : reserve0);
                setTotalSupply(supply);
            } catch (caught) {
                if (!cancelled) setError(caught instanceof Error ? caught.message : "Failed to load liquidity pool");
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        loadPair();

        return () => {
            cancelled = true;
        };
    }, [args.routerAddress, nonce, publicClient, tokenAAddress, tokenBAddress]);

    return {
        factoryAddress,
        pairAddress,
        reserveA,
        reserveB,
        totalSupply,
        isLoading,
        error,
        refetch: () => setNonce((value) => value + 1),
    };
}

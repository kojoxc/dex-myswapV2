import { useEffect, useMemo, useState } from "react";
import { type Address, isAddress } from "viem";
import { useChainId } from "wagmi";

import { DEFAULT_TOKEN_LIST_URL, fetchTokenList } from "../lib/tokenListService";
import { deduplicateTokens, filterTokens, getSupportedTokens } from "../lib/tokenRegistry";
import type { SupportedToken } from "../lib/tokenRegistry";
import type { DeploymentConfig } from "./useDeploymentConfig";

function deploymentTokens(deployment?: DeploymentConfig): SupportedToken[] {
    if (!deployment) return [];

    const tokens: SupportedToken[] = [];

    if (deployment.weth && isAddress(deployment.weth)) {
        tokens.push({
            type: "erc20",
            chainId: deployment.chainId,
            address: deployment.weth,
            name: "Wrapped Ether",
            symbol: "WETH",
            decimals: 18,
            source: "deployment",
        });
    }

    for (const token of deployment.tokens) {
        if (!isAddress(token.address)) continue;
        tokens.push({
            type: "erc20",
            chainId: deployment.chainId,
            address: token.address as Address,
            name: token.name ?? token.symbol ?? "Token",
            symbol: token.symbol ?? "TOKEN",
            decimals: Number.isInteger(token.decimals) && token.decimals !== undefined && token.decimals >= 0 && token.decimals <= 78 ? token.decimals : 18,
            source: "deployment",
        });
    }

    return tokens;
}

export function useTokenList(args?: { deployment?: DeploymentConfig; query?: string }) {
    const chainId = useChainId();
    const [externalTokens, setExternalTokens] = useState<SupportedToken[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string>();

    useEffect(() => {
        let cancelled = false;
        const tokenListUrl = DEFAULT_TOKEN_LIST_URL.trim();

        if (!tokenListUrl) {
            setExternalTokens([]);
            setIsLoading(false);
            setError(undefined);
            return;
        }

        async function loadExternalTokens() {
            setIsLoading(true);
            setError(undefined);

            try {
                const tokens = await fetchTokenList(tokenListUrl, chainId);
                if (!cancelled) setExternalTokens(tokens);
            } catch (caught) {
                if (!cancelled) {
                    setExternalTokens([]);
                    setError(caught instanceof Error ? caught.message : "Failed to load token list");
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        loadExternalTokens();

        return () => {
            cancelled = true;
        };
    }, [chainId]);

    const supportedTokens = useMemo(
        () => deduplicateTokens([
            ...getSupportedTokens(chainId).map((token) => ({ ...token, source: token.source ?? ("default" as const) })),
            ...deploymentTokens(args?.deployment),
            ...externalTokens,
        ], chainId),
        [args?.deployment, chainId, externalTokens],
    );

    const tokens = useMemo(() => {
        if (!args?.query) return supportedTokens;
        return filterTokens(supportedTokens, args.query);
    }, [supportedTokens, args?.query]);

    return { tokens: tokens as SupportedToken[], isLoading, error };
}

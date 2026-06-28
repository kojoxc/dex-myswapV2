import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.13.5/+esm";

const ERC20_ABI = [
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
];

const ROUTER_ABI = [
    "function addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256) returns (uint256,uint256,uint256)",
    "function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns (uint256[])",
    "function getAmountsOut(uint256,address[]) view returns (uint256[])",
];

const $ = (id) => document.getElementById(id);
const fields = ["router", "factory", "tokenA", "tokenB"];
let provider;
let signer;
let account;

loadConfig();

$("connectWallet").addEventListener("click", connectWallet);
$("saveConfig").addEventListener("click", saveConfig);
$("refreshBalances").addEventListener("click", refreshBalances);
$("approve").addEventListener("click", approve);
$("addLiquidity").addEventListener("click", addLiquidity);
$("swap").addEventListener("click", swapExactTokens);

function loadConfig() {
    for (const field of fields) {
        $(field).value = localStorage.getItem(`myswap:${field}`) || "";
    }
}

function saveConfig() {
    for (const field of fields) {
        localStorage.setItem(`myswap:${field}`, $(field).value.trim());
    }

    setStatus("Config saved.");
}

async function connectWallet() {
    if (!window.ethereum) throw new Error("No injected wallet found.");

    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    account = await signer.getAddress();

    setStatus(`Connected: ${account}`);
    await refreshBalances();
}

async function refreshBalances() {
    requireWallet();
    const tokenA = token($("tokenA").value);
    const tokenB = token($("tokenB").value);
    const [symbolA, symbolB, decimalsA, decimalsB, balanceA, balanceB] = await Promise.all([
        tokenA.symbol(),
        tokenB.symbol(),
        tokenA.decimals(),
        tokenB.decimals(),
        tokenA.balanceOf(account),
        tokenB.balanceOf(account),
    ]);

    setStatus([
        `Connected: ${account}`,
        `${symbolA}: ${ethers.formatUnits(balanceA, decimalsA)}`,
        `${symbolB}: ${ethers.formatUnits(balanceB, decimalsB)}`,
    ].join("\n"));
}

async function approve() {
    requireWallet();
    const selected = $("approveToken").value === "A" ? $("tokenA").value : $("tokenB").value;
    const erc20 = token(selected);
    const decimals = await erc20.decimals();
    const amount = ethers.parseUnits($("approveAmount").value, decimals);

    setStatus("Approving...");
    const tx = await erc20.approve($("router").value, amount);
    await tx.wait();
    setStatus(`Approved. Tx: ${tx.hash}`);
}

async function addLiquidity() {
    requireWallet();
    const tokenA = token($("tokenA").value);
    const tokenB = token($("tokenB").value);
    const [decimalsA, decimalsB] = await Promise.all([tokenA.decimals(), tokenB.decimals()]);
    const amountA = ethers.parseUnits($("liquidityA").value, decimalsA);
    const amountB = ethers.parseUnits($("liquidityB").value, decimalsB);
    const deadline = Math.floor(Date.now() / 1000) + 20 * 60;

    setStatus("Adding liquidity...");
    const tx = await router().addLiquidity($("tokenA").value, $("tokenB").value, amountA, amountB, 0, 0, account, deadline);
    await tx.wait();
    setStatus(`Liquidity added. Tx: ${tx.hash}`);
    await refreshBalances();
}

async function swapExactTokens() {
    requireWallet();
    const aToB = $("swapDirection").value === "A_B";
    const input = aToB ? token($("tokenA").value) : token($("tokenB").value);
    const output = aToB ? token($("tokenB").value) : token($("tokenA").value);
    const path = aToB ? [$("tokenA").value, $("tokenB").value] : [$("tokenB").value, $("tokenA").value];
    const [inputDecimals, outputDecimals] = await Promise.all([input.decimals(), output.decimals()]);
    const amountIn = ethers.parseUnits($("swapAmountIn").value, inputDecimals);
    const amountOutMin = ethers.parseUnits($("swapAmountOutMin").value, outputDecimals);
    const deadline = Math.floor(Date.now() / 1000) + 20 * 60;

    setStatus("Swapping...");
    const tx = await router().swapExactTokensForTokens(amountIn, amountOutMin, path, account, deadline);
    await tx.wait();
    setStatus(`Swap complete. Tx: ${tx.hash}`);
    await refreshBalances();
}

function token(address) {
    return new ethers.Contract(address, ERC20_ABI, signer);
}

function router() {
    return new ethers.Contract($("router").value, ROUTER_ABI, signer);
}

function requireWallet() {
    if (!signer || !account) throw new Error("Connect wallet first.");
}

function setStatus(message) {
    $("status").textContent = message;
}

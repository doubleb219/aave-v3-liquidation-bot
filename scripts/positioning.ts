import { ethers, Contract } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

// ABIs
const POOL_ADDRESS_PROVIDER_ABI = [
    'function getPool() external view returns (address)'
]

const POOL_ABI = [
    'function supply( address asset, uint256 amount, address onBehalfOf, uint16 referralCode ) public'
]

const ERC20_ABI = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function balanceOf(address account) external view returns (uint256)',
    'function transfer(address recipient, uint256 amount) external returns (bool)',
    'function allowance(address _owner, address _spender) external view returns (uint256)'
];

const ROUTER_ABI = [
    'function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB)'
]

async function main() {
    const supplyAmount = ethers.utils.parseEther("1000"); // Example supply amount
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || "", provider);
    const router = new ethers.Contract(
        "0x636f6407B90661b73b1C0F7e24F4C79f624d0738",
        ROUTER_ABI,
        wallet
    )
    const lp = new ethers.Contract(
        "0x685f1dEEC077caDFff61Ad8A589Fda4f53F420Ba",
        ERC20_ABI,
        wallet
    );

    const token0 = new ethers.Contract(
        "0x219Ac131A00a7C5D8ee19D178B81a63575e3E23c",
        ERC20_ABI,
        wallet
    );

    const token1 = new ethers.Contract(
        "0x685f1dEEC077caDFff61Ad8A589Fda4f53F420Ba",
        ERC20_ABI,
        wallet
    );
    // const balanceOfToken0 = await token0.balanceOf("0xF5285A842F3a7B68199913505AdBb4bA980eA757");
    // const balanceOfToken1 = await token1.balanceOf("0xF5285A842F3a7B68199913505AdBb4bA980eA757");
    // console.log("Balance of Token0:", ethers.utils.formatEther(balanceOfToken0));
    // console.log("Balance of Token1:", ethers.utils.formatEther(balanceOfToken1));
    // const approveTx = await lp.approve("0x636f6407B90661b73b1C0F7e24F4C79f624d0738", supplyAmount);
    // await approveTx.wait(1);
    // console.log("Approved LP tokens for Aave pool", approveTx.hash);
    const approveAllowance = await lp.balanceOf("0xBD67B26982f65afc88aCd74Be21961ce3456134d");
    console.log("Allowance after approval:", ethers.utils.formatEther(approveAllowance));
    // const removeLiquidityTx = await router.removeLiquidity(
    //     "0x219Ac131A00a7C5D8ee19D178B81a63575e3E23c", // token A address
    //     "0x685f1dEEC077caDFff61Ad8A589Fda4f53F420Ba", // token B address
    //     10,
    //     0, // Min amount of LP tokens to remove
    //     0, // Min amount of WETH to receive
    //     wallet.address, // Recipient address
    //     Math.floor(Date.now() / 1000) + 60 * 20 // Deadline (20 minutes from now)
    // );
    // const receipt = await removeLiquidityTx.wait(1);
    // console.log("Liquidity removed successfully:", receipt.transactionHash);

}

main().catch(error => {
    console.error("Unhandled error in main:", error);
    process.exit(1);
});
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
    'function transfer(address recipient, uint256 amount) external returns (bool)'
];

async function main() {
    const supplyAmount = ethers.utils.parseEther("1000"); // Example supply amount
    const provider = new ethers.providers.JsonRpcProvider(process.env.PULS_RPC_URL);
    const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY || "", provider);
    const addressProvider = new ethers.Contract(
        process.env.AAVE_POOL_ADDRESS_PROVIDER || "",
        POOL_ADDRESS_PROVIDER_ABI,
        provider
    )
    const pool = new ethers.Contract(
        process.env.AAVE_POOL_ADDRESS || "",
        POOL_ABI,
        wallet
    )
    const poolAddress = await addressProvider.getPool();
    console.log("Pool Address:", poolAddress);

    // const lp = new ethers.Contract(
    //     process.env.LP_ADDRESS || "",
    //     ERC20_ABI,
    //     wallet
    // );
    // const approveTx = await lp.approve(poolAddress, supplyAmount);
    // await approveTx.wait(1);
    // console.log("Approved LP tokens for Aave pool", approveTx.hash);
    // const supplyTx = await pool.supply(
    //     process.env.LP_ADDRESS || "",
    //     supplyAmount,
    //     wallet.address,
    //     0, // referral code
    //     {
    //         gasLimit: 1000000,
    //         gasPrice: await provider.getGasPrice()
    //     }
    // );
    // console.log("Supply transaction hash:", supplyTx.hash);

}

main().catch(error => {
    console.error("Unhandled error in main:", error);
    process.exit(1);
});
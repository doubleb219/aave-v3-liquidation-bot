// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IFlashLoanReceiver} from "@aave/core-v3/contracts/flashloan/interfaces/IFlashLoanReceiver.sol";
import {IERC20} from "@aave/core-v3/contracts/dependencies/openzeppelin/contracts/IERC20.sol";
import {SafeERC20} from "@aave/core-v3/contracts/dependencies/openzeppelin/contracts/SafeERC20.sol";
import "./IPulseXRouter02.sol";
import "./IPulseXPair.sol";
/**
 * @title FlashLoanLiquidator
 * @dev Contract to execute liquidations using Aave flash loans
 */
contract FlashLoanLiquidator is IFlashLoanReceiver {
    using SafeERC20 for IERC20;

    address public immutable owner;
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;
    IPool public immutable POOL;
    IPulseXRouter02 pulsexV2Router;
    IPulseXPair pulsexPair;

    /**
     * @dev Constructor
     * @param provider The address of the Aave PoolAddressesProvider contract
     */
    constructor(address provider, IPulseXRouter02 _pulsexV2Router) {
        owner = msg.sender;
        ADDRESSES_PROVIDER = IPoolAddressesProvider(provider);
        POOL = IPool(IPoolAddressesProvider(provider).getPool());
        
        // initialize the PulseX router
        pulsexV2Router = IPulseXRouter02(_pulsexV2Router);
    }

    /**
     * @dev Restricts calls to owner
     */
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    /**
     * @dev Called by Aave after the flash loan is provided
     * @param assets The addresses of the assets borrowed
     * @param amounts The amounts of the assets borrowed
     * @param premiums The fees that will need to be paid on top of the borrowed amounts
     * @param initiator The address that initiated the flash loan
     * @param params Encoded parameters for the liquidation
     * @return boolean indicating if the execution was successful
     */
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        // Ensure call is from the Aave pool
        require(msg.sender == address(POOL), "Callback only from POOL");
        require(initiator == owner, "Initiator must be owner");

        // Decode the params
        (
            address collateralAsset,
            address debtAsset,
            address user,
            uint256 debtToCover,
            bool receiveAToken
        ) = abi.decode(params, (address, address, address, uint256, bool));

        // Approve the debt asset to be spent by the pool for liquidation
        IERC20(debtAsset).safeApprove(address(POOL), debtToCover);

        // Execute the liquidation
        POOL.liquidationCall(
            collateralAsset,
            debtAsset,
            user,
            debtToCover,
            receiveAToken
        );

        // Break LP tokensa
        _breakLPTokenAndSwapToDebt(collateralAsset,  debtAsset);

        // Calculate total amount to repay
        uint256 amountOwing = amounts[0] + premiums[0];

        // Approve the repayment of the flash loan
        IERC20(assets[0]).safeApprove(address(POOL), amountOwing);

        // Return any excess collateral to the owner
        _returnFunds(assets[0], amountOwing);

        return true;
    }

    /**
     * @dev Return excess funds to the owner after liquidation
     * @param asset The address of the collateral asset
     * @param amountOwing The amount to repay
     */
    function _returnFunds(address asset, uint256 amountOwing) internal {
        // Transfer any remaining collateral to the owner
        uint256 balance = IERC20(asset).balanceOf(address(this));
        if (balance - amountOwing > 0) {
            IERC20(asset).safeTransfer(msg.sender, balance - amountOwing);
        }
    }

    /**
     * @dev Break LP tokens by removing liquidity and swap to debt asset
     * @param lpAddress The address of the LP token contract
     * @param debtAsset The amount of LP tokens to approve for removal
     */
    function _breakLPTokenAndSwapToDebt (address lpAddress, address debtAsset) internal {
        // Break LP tokens by removing liquidity
        uint256 liquidity = IERC20(lpAddress).balanceOf(address(this));
        IERC20(lpAddress).safeApprove(address(pulsexV2Router), liquidity);
        pulsexPair = IPulseXPair(lpAddress);

        (address tokenA, address tokenB) = (pulsexPair.token0(), pulsexPair.token1());
        (uint256 amountAMin, uint256 amountBMin) = (0, 0);
        (uint256 amountA, uint256 amountB) = pulsexV2Router.removeLiquidity(
            tokenA,
            tokenB,
            liquidity,
            amountAMin,
            amountBMin,
            address(this),
            block.timestamp + 1000
        );
        if (tokenA == debtAsset) {
            // If tokenA is the debt asset, we only need to swap tokenB
            _swapToDebtAsset(tokenB, amountB, debtAsset);
        } else if (tokenB == debtAsset) {
            // If tokenB is the debt asset, we only need to swap tokenA
            _swapToDebtAsset(tokenA, amountA, debtAsset);
        } else {
            // If neither token is the debt asset, we need to swap both
            _swapToDebtAsset(tokenB, amountB, debtAsset);
            _swapToDebtAsset(tokenA, amountA, debtAsset);
        }

    }

    /**
     * @dev swap token to exact token
     * @param inputToken the address of input token
     * @param amountIn the amount of input token
     * @param outputToken the amount of output token
     */

    function _swapToDebtAsset( address inputToken, uint256 amountIn, address outputToken ) internal {

        // Approve the router to spend the tokens
        IERC20(inputToken).safeApprove(address(pulsexV2Router), amountIn);

        // Define the path for the swap
        address[] memory path = new address[](2);
        path[0] = inputToken; // Token to swap from
        path[1] = outputToken; // Token to swap to

        // Swap tokens using the PulseX router
        pulsexV2Router.swapExactTokensForTokens(amountIn, 0, path, address(this), block.timestamp + 1000);
    }

    /**
     * @dev Allows the owner to rescue any tokens accidentally sent to the contract
     * @param token The address of the token to rescue
     */
    function rescueTokens(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(token).safeTransfer(owner, balance);
        }
    }


    /**
     * @dev Allows receiving ETH
     */
    receive() external payable {}
} 
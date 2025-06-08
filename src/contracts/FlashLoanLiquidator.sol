// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IFlashLoanReceiver} from "@aave/core-v3/contracts/flashloan/interfaces/IFlashLoanReceiver.sol";
import {IERC20} from "@aave/core-v3/contracts/dependencies/openzeppelin/contracts/IERC20.sol";
import {SafeERC20} from "@aave/core-v3/contracts/dependencies/openzeppelin/contracts/SafeERC20.sol";
/**
 * @title FlashLoanLiquidator
 * @dev Contract to execute liquidations using Aave flash loans
 */
contract FlashLoanLiquidator is IFlashLoanReceiver {
    using SafeERC20 for IERC20;

    address public immutable owner;
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;
    IPool public immutable POOL;

    /**
     * @dev Constructor
     * @param provider The address of the Aave PoolAddressesProvider contract
     */
    constructor(address provider) {
        owner = msg.sender;
        ADDRESSES_PROVIDER = IPoolAddressesProvider(provider);
        POOL = IPool(IPoolAddressesProvider(provider).getPool());
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

        // Calculate total amount to repay
        uint256 amountOwing = amounts[0] + premiums[0];

        // Approve the repayment of the flash loan
        IERC20(assets[0]).safeApprove(address(POOL), amountOwing);

        // Return any excess collateral to the owner
        _returnFunds(collateralAsset, debtAsset);

        return true;
    }

    /**
     * @dev Return excess funds to the owner after liquidation
     * @param collateralAsset The address of the collateral asset
     * @param debtAsset The address of the debt asset
     */
    function _returnFunds(address collateralAsset, address debtAsset) internal {
        // Transfer any remaining collateral to the owner
        uint256 collateralBalance = IERC20(collateralAsset).balanceOf(address(this));
        if (collateralBalance > 0) {
            IERC20(collateralAsset).safeTransfer(owner, collateralBalance);
        }

        // In case we have any excess debt tokens too
        uint256 debtBalance = IERC20(debtAsset).balanceOf(address(this));
        if (debtBalance > 0) {
            IERC20(debtAsset).safeTransfer(owner, debtBalance);
        }
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
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract LoanVault is Ownable {
    error InvalidProofGuard(address caller);
    error ProofGuardAlreadyConfigured();
    error LoanAlreadyReleased(bytes32 positionId);
    error InsufficientVaultBalance(uint256 requested, uint256 available);
    error TransferFailed();

    address public proofGuard;
    mapping(bytes32 positionId => uint256 amount) public releasedLoans;

    event ProofGuardConfigured(address indexed proofGuard);
    event VaultFunded(address indexed sender, uint256 amount);
    event LoanReleased(bytes32 indexed positionId, address indexed borrower, uint256 amount);
    event TreasuryWithdrawal(address indexed recipient, uint256 amount);

    constructor(address initialOwner) Ownable(initialOwner) { }

    receive() external payable {
        emit VaultFunded(msg.sender, msg.value);
    }

    modifier onlyProofGuard() {
        if (msg.sender != proofGuard) revert InvalidProofGuard(msg.sender);
        _;
    }

    function configureProofGuard(address proofGuard_) external onlyOwner {
        if (proofGuard != address(0)) revert ProofGuardAlreadyConfigured();
        if (proofGuard_ == address(0)) revert InvalidProofGuard(proofGuard_);
        proofGuard = proofGuard_;
        emit ProofGuardConfigured(proofGuard_);
    }

    function releaseLoan(bytes32 positionId, address payable borrower, uint256 amount)
        external
        onlyProofGuard
    {
        if (releasedLoans[positionId] != 0) revert LoanAlreadyReleased(positionId);
        if (amount > address(this).balance) {
            revert InsufficientVaultBalance(amount, address(this).balance);
        }

        releasedLoans[positionId] = amount;
        (bool success,) = borrower.call{ value: amount }("");
        if (!success) revert TransferFailed();
        emit LoanReleased(positionId, borrower, amount);
    }

    function withdrawTreasury(address payable recipient, uint256 amount) external onlyOwner {
        if (amount > address(this).balance) {
            revert InsufficientVaultBalance(amount, address(this).balance);
        }
        (bool success,) = recipient.call{ value: amount }("");
        if (!success) revert TransferFailed();
        emit TreasuryWithdrawal(recipient, amount);
    }
}

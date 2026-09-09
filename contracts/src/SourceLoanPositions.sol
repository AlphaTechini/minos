// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Sepolia source contract for the one-position FullFile demonstration.
contract SourceLoanPositions is Ownable {
    error UnknownPosition(bytes32 positionId);
    error DuplicatePosition(bytes32 positionId);
    error DuplicateRepayment(bytes32 repaymentId);
    error RepaymentAlreadyReversed(bytes32 repaymentId);
    error InvalidAmount();
    error InvalidTermsHash();
    error InvalidReasonHash();
    error UnauthorizedBorrower(address caller);

    struct Position {
        address borrower;
        uint256 principal;
        bytes32 termsHash;
        bytes32 repaymentId;
        bool exists;
    }

    struct Repayment {
        bytes32 positionId;
        uint256 amount;
        bool reversed;
    }

    mapping(bytes32 positionId => Position) public positions;
    mapping(bytes32 repaymentId => Repayment) public repayments;

    event PositionOpened(
        bytes32 indexed positionId, address indexed borrower, uint256 principal, bytes32 termsHash
    );
    event RepaymentRecorded(
        bytes32 indexed positionId, bytes32 indexed repaymentId, uint256 amount
    );
    event RepaymentReversed(
        bytes32 indexed positionId, bytes32 indexed repaymentId, bytes32 indexed reasonHash
    );

    constructor(address initialOwner) Ownable(initialOwner) { }

    function openPosition(bytes32 positionId, uint256 principal, bytes32 termsHash) external {
        if (positions[positionId].exists) revert DuplicatePosition(positionId);
        if (principal == 0) revert InvalidAmount();
        if (termsHash == bytes32(0)) revert InvalidTermsHash();

        positions[positionId] = Position({
            borrower: msg.sender,
            principal: principal,
            termsHash: termsHash,
            repaymentId: bytes32(0),
            exists: true
        });

        emit PositionOpened(positionId, msg.sender, principal, termsHash);
    }

    function recordRepayment(bytes32 positionId, bytes32 repaymentId, uint256 amount) external {
        if (!positions[positionId].exists) revert UnknownPosition(positionId);
        if (repayments[repaymentId].positionId != bytes32(0)) {
            revert DuplicateRepayment(repaymentId);
        }
        if (repaymentId == bytes32(0) || amount != positions[positionId].principal) {
            revert InvalidAmount();
        }
        if (msg.sender != positions[positionId].borrower) revert UnauthorizedBorrower(msg.sender);
        if (positions[positionId].repaymentId != bytes32(0)) revert DuplicatePosition(positionId);

        positions[positionId].repaymentId = repaymentId;
        repayments[repaymentId] =
            Repayment({ positionId: positionId, amount: amount, reversed: false });
        emit RepaymentRecorded(positionId, repaymentId, amount);
    }

    function reverseRepayment(bytes32 positionId, bytes32 repaymentId, bytes32 reasonHash)
        external
        onlyOwner
    {
        if (!positions[positionId].exists) revert UnknownPosition(positionId);
        Repayment storage repayment = repayments[repaymentId];
        if (repayment.positionId != positionId) revert DuplicateRepayment(repaymentId);
        if (repayment.reversed) revert RepaymentAlreadyReversed(repaymentId);
        if (reasonHash == bytes32(0)) revert InvalidReasonHash();

        repayment.reversed = true;
        emit RepaymentReversed(positionId, repaymentId, reasonHash);
    }
}

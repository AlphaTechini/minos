// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { EvmV1Decoder } from "@gluwa/usc-contracts/decoding/EvmV1Decoder.sol";
import { FullFile } from "./FullFile.sol";
import { LoanPolicyRegistry } from "./LoanPolicyRegistry.sol";
import { LoanVault } from "./LoanVault.sol";
import { INativeQueryVerifier, NativeQueryVerifierLib } from "./VerifierInterface.sol";

contract ProofGuard is ReentrancyGuard {
    enum Action {
        OpenPosition,
        RecordRepayment,
        ReverseRepayment
    }

    struct DecisionReceipt {
        bool exists;
        bytes32 decisionId;
        bytes32 policyId;
        uint64 policyVersion;
        bytes32 positionId;
        uint64 fullFileVersion;
        bytes32 candidateEventId;
        address destinationApplication;
        bytes32 action;
        uint64 coverageThrough;
        FullFile.CoverageStatus coverageStatus;
        bool eligible;
        bytes32 authorizationNullifier;
        uint64 createdAt;
    }

    error InvalidPolicy(bytes32 policyId);
    error InvalidSourceChain(uint64 chainKey);
    error InvalidSourceContract(address emitter);
    error InvalidReceiptStatus();
    error InvalidTransactionType();
    error InvalidReceiptLogIndex(uint32 logIndex);
    error InvalidEventSignature(bytes32 expected, bytes32 actual);
    error InvalidEventShape();
    error InvalidEventValue();
    error EventAlreadyProcessed(bytes32 eventId);
    error PositionIneligible(FullFile.EligibilityReason reason);
    error AuthorizationAlreadyUsed(bytes32 nullifier);

    bytes32 public constant POSITION_OPENED_SIGNATURE =
        keccak256("PositionOpened(bytes32,address,uint256,bytes32)");
    bytes32 public constant REPAYMENT_RECORDED_SIGNATURE =
        keccak256("RepaymentRecorded(bytes32,bytes32,uint256)");
    bytes32 public constant REPAYMENT_REVERSED_SIGNATURE =
        keccak256("RepaymentReversed(bytes32,bytes32,bytes32)");
    bytes32 public constant RELEASE_LOAN_ACTION = keccak256("RELEASE_TCTC_LOAN");

    INativeQueryVerifier public immutable verifier;
    LoanPolicyRegistry public immutable registry;
    FullFile public immutable fullFile;
    LoanVault public immutable vault;

    mapping(bytes32 eventId => bool) public processedEvents;
    mapping(bytes32 nullifier => bool) public usedAuthorizations;
    mapping(bytes32 decisionId => DecisionReceipt) private decisions;

    event ProofGuardAccepted(
        bytes32 indexed eventId,
        bytes32 indexed policyId,
        bytes32 indexed positionId,
        Action action,
        uint64 sourceBlock,
        uint64 transactionIndex,
        uint32 logIndex
    );
    event DecisionRecorded(
        bytes32 indexed decisionId,
        bytes32 indexed policyId,
        bytes32 indexed positionId,
        bytes32 candidateEventId,
        bytes32 authorizationNullifier,
        uint256 amount
    );

    constructor(address registry_, address fullFile_, address vault_) {
        registry = LoanPolicyRegistry(registry_);
        fullFile = FullFile(fullFile_);
        vault = LoanVault(payable(vault_));
        verifier = NativeQueryVerifierLib.getVerifier();
    }

    function execute(
        bytes32 policyId,
        Action action,
        uint32 receiptLogIndex,
        uint64 chainKey,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        bytes32 merkleRoot,
        INativeQueryVerifier.MerkleProofEntry[] calldata siblings,
        bytes32 lowerEndpointDigest,
        bytes32[] calldata continuityRoots
    ) external returns (bytes32 eventId) {
        LoanPolicyRegistry.Policy memory policy = _activePolicy(policyId);
        if (chainKey != policy.sourceChainKey) revert InvalidSourceChain(chainKey);

        INativeQueryVerifier.MerkleProof memory merkleProof =
            INativeQueryVerifier.MerkleProof({ root: merkleRoot, siblings: siblings });
        uint64 transactionIndex = verifier.calculateTxIndex(merkleProof);
        eventId = keccak256(
            abi.encode(
                policyId,
                address(this),
                action,
                chainKey,
                blockHeight,
                transactionIndex,
                receiptLogIndex
            )
        );
        if (processedEvents[eventId]) revert EventAlreadyProcessed(eventId);

        INativeQueryVerifier.ContinuityProof memory continuityProof =
            INativeQueryVerifier.ContinuityProof({
                lowerEndpointDigest: lowerEndpointDigest, roots: continuityRoots
            });
        if (!verifier.verifyAndEmit(
                chainKey, blockHeight, encodedTransaction, merkleProof, continuityProof
            )) revert InvalidReceiptStatus();

        EvmV1Decoder.LogEntry memory sourceLog =
            _requiredLog(policy.sourceContract, action, encodedTransaction, receiptLogIndex);
        FullFile.SourceCoordinates memory source = FullFile.SourceCoordinates({
            blockNumber: blockHeight, transactionIndex: transactionIndex, logIndex: receiptLogIndex
        });
        bytes32 positionId =
            _applyEvent(policy, action, eventId, sourceLog, source, keccak256(encodedTransaction));

        processedEvents[eventId] = true;
        emit ProofGuardAccepted(
            eventId, policyId, positionId, action, blockHeight, transactionIndex, receiptLogIndex
        );
    }

    function evaluateLoan(bytes32 policyId, bytes32 positionId, bytes32 candidateEventId)
        external
        view
        returns (bool eligible, FullFile.EligibilityReason reason)
    {
        LoanPolicyRegistry.Policy memory policy = registry.getPolicy(policyId);
        if (!policy.active || policy.sourcePaused) {
            return (false, FullFile.EligibilityReason.PolicyMismatch);
        }
        return
            fullFile.evaluate(policyId, positionId, candidateEventId, policy.maxCoverageAgeBlocks);
    }

    function authorizeLoan(bytes32 policyId, bytes32 positionId, bytes32 candidateEventId)
        external
        nonReentrant
        returns (bytes32 decisionId, uint256 amount)
    {
        LoanPolicyRegistry.Policy memory policy = _activePolicy(policyId);
        (bool eligible, FullFile.EligibilityReason reason) =
            fullFile.evaluate(policyId, positionId, candidateEventId, policy.maxCoverageAgeBlocks);
        if (!eligible) revert PositionIneligible(reason);

        FullFile.Position memory position = fullFile.getPosition(positionId);
        if (msg.sender != position.borrower) {
            revert PositionIneligible(FullFile.EligibilityReason.CandidateEventMismatch);
        }

        bytes32 nullifier = keccak256(
            abi.encode(
                policyId,
                policy.destinationApplication,
                RELEASE_LOAN_ACTION,
                positionId,
                candidateEventId
            )
        );
        if (usedAuthorizations[nullifier]) revert AuthorizationAlreadyUsed(nullifier);
        usedAuthorizations[nullifier] = true;

        amount = position.principal * policy.loanRatioBps / 10_000;
        vault.releaseLoan(positionId, payable(position.borrower), amount);

        FullFile.Coverage memory currentCoverage = fullFile.getCoverage(positionId);
        decisionId = keccak256(abi.encode(nullifier, position.stateVersion, block.number));
        decisions[decisionId] = DecisionReceipt({
            exists: true,
            decisionId: decisionId,
            policyId: policyId,
            policyVersion: policy.policyVersion,
            positionId: positionId,
            fullFileVersion: position.stateVersion,
            candidateEventId: candidateEventId,
            destinationApplication: policy.destinationApplication,
            action: RELEASE_LOAN_ACTION,
            coverageThrough: currentCoverage.throughSourceBlock,
            coverageStatus: currentCoverage.status,
            eligible: true,
            authorizationNullifier: nullifier,
            createdAt: uint64(block.timestamp)
        });
        emit DecisionRecorded(decisionId, policyId, positionId, candidateEventId, nullifier, amount);
    }

    function getDecision(bytes32 decisionId) external view returns (DecisionReceipt memory) {
        return decisions[decisionId];
    }

    function _applyEvent(
        LoanPolicyRegistry.Policy memory policy,
        Action action,
        bytes32 eventId,
        EvmV1Decoder.LogEntry memory sourceLog,
        FullFile.SourceCoordinates memory source,
        bytes32 proofPayloadHash
    ) internal returns (bytes32 positionId) {
        positionId = sourceLog.topics[1];
        if (action == Action.OpenPosition) {
            if (sourceLog.topics.length != 3 || sourceLog.data.length != 64) {
                revert InvalidEventShape();
            }
            address borrower = address(uint160(uint256(sourceLog.topics[2])));
            (uint256 principal, bytes32 termsHash) = abi.decode(sourceLog.data, (uint256, bytes32));
            if (
                borrower == address(0) || termsHash == bytes32(0) || principal < policy.minPrincipal
                    || principal > policy.maxPrincipal
            ) revert InvalidEventValue();
            fullFile.applyPositionOpened(
                eventId,
                policy.policyId,
                positionId,
                borrower,
                principal,
                termsHash,
                source,
                proofPayloadHash
            );
            return positionId;
        }

        if (action == Action.RecordRepayment) {
            if (sourceLog.topics.length != 3 || sourceLog.data.length != 32) {
                revert InvalidEventShape();
            }
            bytes32 repaymentId = sourceLog.topics[2];
            uint256 amount = abi.decode(sourceLog.data, (uint256));
            fullFile.applyRepayment(
                eventId, positionId, repaymentId, amount, source, proofPayloadHash
            );
            return positionId;
        }

        if (sourceLog.topics.length != 4 || sourceLog.data.length != 0) {
            revert InvalidEventShape();
        }
        fullFile.applyReversal(
            eventId, positionId, sourceLog.topics[2], sourceLog.topics[3], source, proofPayloadHash
        );
    }

    function _requiredLog(
        address sourceContract,
        Action action,
        bytes memory encodedTransaction,
        uint32 receiptLogIndex
    ) internal pure returns (EvmV1Decoder.LogEntry memory sourceLog) {
        uint8 transactionType = EvmV1Decoder.getTransactionType(encodedTransaction);
        if (!EvmV1Decoder.isValidTransactionType(transactionType)) revert InvalidTransactionType();

        EvmV1Decoder.ReceiptFields memory receipt =
            EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        if (receipt.receiptStatus != 1) revert InvalidReceiptStatus();
        if (receiptLogIndex >= receipt.receiptLogs.length) {
            revert InvalidReceiptLogIndex(receiptLogIndex);
        }

        sourceLog = receipt.receiptLogs[receiptLogIndex];
        if (sourceLog.address_ != sourceContract) revert InvalidSourceContract(sourceLog.address_);
        if (sourceLog.topics.length == 0) revert InvalidEventShape();

        bytes32 expected = _eventSignature(action);
        if (sourceLog.topics[0] != expected) {
            revert InvalidEventSignature(expected, sourceLog.topics[0]);
        }
    }

    function _activePolicy(bytes32 policyId)
        internal
        view
        returns (LoanPolicyRegistry.Policy memory policy)
    {
        policy = registry.getPolicy(policyId);
        if (!policy.active || policy.sourcePaused) revert InvalidPolicy(policyId);
    }

    function _eventSignature(Action action) internal pure returns (bytes32) {
        if (action == Action.OpenPosition) return POSITION_OPENED_SIGNATURE;
        if (action == Action.RecordRepayment) return REPAYMENT_RECORDED_SIGNATURE;
        return REPAYMENT_REVERSED_SIGNATURE;
    }
}

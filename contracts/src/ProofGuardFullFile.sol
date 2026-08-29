// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { EvmV1Decoder } from "@gluwa/usc-contracts/decoding/EvmV1Decoder.sol";
import { INativeQueryVerifier, NativeQueryVerifierLib } from "./VerifierInterface.sol";

/// @notice Attestcoin policy enforcement and ordered position state for the live demo.
contract ProofGuardFullFile is Ownable {
    enum Action {
        OpenPosition,
        RecordRepayment,
        ReverseRepayment
    }

    enum PositionState {
        None,
        Open,
        Repaid,
        Reversed
    }

    enum CoverageStatus {
        Incomplete,
        Current,
        Stale
    }

    struct Position {
        address borrower;
        uint256 principal;
        uint256 repaidAmount;
        PositionState state;
        uint64 lastSourceBlock;
        uint64 lastTransactionIndex;
        uint64 stateVersion;
        bytes32 lastQueryId;
    }

    struct Coverage {
        uint64 throughSourceBlock;
        uint64 updatedAtCreditcoinBlock;
        CoverageStatus status;
    }

    error InvalidWorker(address caller);
    error InvalidSourceChain(uint64 chainKey);
    error InvalidSourceContract(address emitter);
    error InvalidReceiptStatus();
    error InvalidTransactionType();
    error MissingRequiredEvent(bytes32 signature);
    error InvalidEventShape();
    error QueryAlreadyProcessed(bytes32 queryId);
    error PositionAlreadyExists(bytes32 positionId);
    error UnknownPosition(bytes32 positionId);
    error InvalidEventOrder(bytes32 positionId);
    error InvalidPositionState(bytes32 positionId, PositionState state);
    error CoverageNotCurrent(bytes32 positionId, CoverageStatus status);
    error CreditAlreadyAuthorized(bytes32 positionId);
    error UnauthorizedBorrower(address caller);

    bytes32 public constant POSITION_OPENED_SIGNATURE =
        keccak256("PositionOpened(bytes32,address,uint256,bytes32)");
    bytes32 public constant REPAYMENT_RECORDED_SIGNATURE =
        keccak256("RepaymentRecorded(bytes32,bytes32,uint256)");
    bytes32 public constant REPAYMENT_REVERSED_SIGNATURE =
        keccak256("RepaymentReversed(bytes32,bytes32,bytes32)");

    INativeQueryVerifier public immutable verifier;
    uint64 public immutable sourceChainKey;
    address public immutable sourcePositionContract;
    address public worker;

    mapping(bytes32 queryId => bool) public processedQueries;
    mapping(bytes32 positionId => Position) public positions;
    mapping(bytes32 positionId => Coverage) public coverage;
    mapping(bytes32 positionId => bool) public creditAuthorized;
    mapping(bytes32 positionId => uint256) public creditLimits;

    event WorkerUpdated(address indexed previousWorker, address indexed nextWorker);
    event ProofGuardAccepted(
        bytes32 indexed queryId,
        bytes32 indexed positionId,
        Action indexed action,
        uint64 sourceBlock,
        uint64 transactionIndex
    );
    event FullFileVersionCreated(
        bytes32 indexed positionId, uint64 indexed version, PositionState state, bytes32 queryId
    );
    event CoverageAdvanced(bytes32 indexed positionId, uint64 throughSourceBlock);
    event CoverageMarkedStale(bytes32 indexed positionId);
    event CreditAuthorized(
        bytes32 indexed positionId,
        address indexed borrower,
        uint256 creditLimit,
        uint64 fullFileVersion,
        bytes32 decisionId
    );

    constructor(uint64 sourceChainKey_, address sourcePositionContract_, address worker_)
        Ownable(msg.sender)
    {
        sourceChainKey = sourceChainKey_;
        sourcePositionContract = sourcePositionContract_;
        worker = worker_;
        verifier = NativeQueryVerifierLib.getVerifier();
    }

    modifier onlyWorker() {
        if (msg.sender != worker) revert InvalidWorker(msg.sender);
        _;
    }

    function setWorker(address nextWorker) external onlyOwner {
        emit WorkerUpdated(worker, nextWorker);
        worker = nextWorker;
    }

    function execute(
        Action action,
        uint64 chainKey,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        bytes32 merkleRoot,
        INativeQueryVerifier.MerkleProofEntry[] calldata siblings,
        bytes32 lowerEndpointDigest,
        bytes32[] calldata continuityRoots
    ) external returns (bool) {
        if (chainKey != sourceChainKey) {
            revert InvalidSourceChain(chainKey);
        }

        (bytes32 queryId, uint64 transactionIndex) =
            _computeQueryId(chainKey, blockHeight, merkleRoot, siblings);
        if (processedQueries[queryId]) revert QueryAlreadyProcessed(queryId);

        INativeQueryVerifier.MerkleProof memory merkleProof =
            INativeQueryVerifier.MerkleProof({ root: merkleRoot, siblings: siblings });
        INativeQueryVerifier.ContinuityProof memory continuityProof =
            INativeQueryVerifier.ContinuityProof({
                lowerEndpointDigest: lowerEndpointDigest, roots: continuityRoots
            });

        if (!verifier.verifyAndEmit(
                chainKey, blockHeight, encodedTransaction, merkleProof, continuityProof
            )) {
            revert InvalidReceiptStatus();
        }

        processedQueries[queryId] = true;
        bytes32 positionId = _applyValidatedEvent(
            action, encodedTransaction, blockHeight, transactionIndex, queryId
        );
        emit ProofGuardAccepted(queryId, positionId, action, blockHeight, transactionIndex);
        return true;
    }

    function advanceCoverage(bytes32 positionId, uint64 throughSourceBlock) external onlyWorker {
        Position storage position = positions[positionId];
        if (position.state == PositionState.None) revert UnknownPosition(positionId);
        if (throughSourceBlock < coverage[positionId].throughSourceBlock) {
            revert InvalidEventOrder(positionId);
        }

        coverage[positionId] = Coverage({
            throughSourceBlock: throughSourceBlock,
            updatedAtCreditcoinBlock: uint64(block.number),
            status: CoverageStatus.Current
        });
        emit CoverageAdvanced(positionId, throughSourceBlock);
    }

    function markCoverageStale(bytes32 positionId) external onlyWorker {
        if (positions[positionId].state == PositionState.None) revert UnknownPosition(positionId);
        coverage[positionId].status = CoverageStatus.Stale;
        coverage[positionId].updatedAtCreditcoinBlock = uint64(block.number);
        emit CoverageMarkedStale(positionId);
    }

    function authorizeCredit(bytes32 positionId) external returns (uint256 creditLimit) {
        Position storage position = positions[positionId];
        if (position.state != PositionState.Repaid) {
            revert InvalidPositionState(positionId, position.state);
        }
        if (msg.sender != position.borrower) revert UnauthorizedBorrower(msg.sender);
        if (coverage[positionId].status != CoverageStatus.Current) {
            revert CoverageNotCurrent(positionId, coverage[positionId].status);
        }
        if (creditAuthorized[positionId]) revert CreditAlreadyAuthorized(positionId);

        creditLimit = position.principal / 2;
        creditAuthorized[positionId] = true;
        creditLimits[positionId] = creditLimit;

        bytes32 decisionId = keccak256(
            abi.encode(
                positionId,
                position.lastQueryId,
                position.stateVersion,
                coverage[positionId].throughSourceBlock
            )
        );
        emit CreditAuthorized(
            positionId, position.borrower, creditLimit, position.stateVersion, decisionId
        );
    }

    function _applyValidatedEvent(
        Action action,
        bytes memory encodedTransaction,
        uint64 sourceBlock,
        uint64 transactionIndex,
        bytes32 queryId
    ) internal returns (bytes32 positionId) {
        if (action == Action.OpenPosition) {
            return _openPosition(encodedTransaction, sourceBlock, transactionIndex, queryId);
        }
        if (action == Action.RecordRepayment) {
            return _recordRepayment(encodedTransaction, sourceBlock, transactionIndex, queryId);
        }
        return _reverseRepayment(encodedTransaction, sourceBlock, transactionIndex, queryId);
    }

    function _openPosition(
        bytes memory encodedTransaction,
        uint64 sourceBlock,
        uint64 transactionIndex,
        bytes32 queryId
    ) internal returns (bytes32 positionId) {
        EvmV1Decoder.LogEntry memory log =
            _requiredLog(encodedTransaction, POSITION_OPENED_SIGNATURE);
        if (log.topics.length != 3 || log.data.length != 64) revert InvalidEventShape();

        positionId = log.topics[1];
        if (positions[positionId].state != PositionState.None) {
            revert PositionAlreadyExists(positionId);
        }

        (uint256 principal,) = abi.decode(log.data, (uint256, bytes32));
        positions[positionId] = Position({
            borrower: address(uint160(uint256(log.topics[2]))),
            principal: principal,
            repaidAmount: 0,
            state: PositionState.Open,
            lastSourceBlock: sourceBlock,
            lastTransactionIndex: transactionIndex,
            stateVersion: 1,
            lastQueryId: queryId
        });
        coverage[positionId].status = CoverageStatus.Incomplete;
        emit FullFileVersionCreated(positionId, 1, PositionState.Open, queryId);
    }

    function _recordRepayment(
        bytes memory encodedTransaction,
        uint64 sourceBlock,
        uint64 transactionIndex,
        bytes32 queryId
    ) internal returns (bytes32 positionId) {
        EvmV1Decoder.LogEntry memory log =
            _requiredLog(encodedTransaction, REPAYMENT_RECORDED_SIGNATURE);
        if (log.topics.length != 3 || log.data.length != 32) revert InvalidEventShape();

        positionId = log.topics[1];
        Position storage position = positions[positionId];
        if (position.state != PositionState.Open) {
            revert InvalidPositionState(positionId, position.state);
        }
        _assertNextEvent(position, positionId, sourceBlock, transactionIndex);

        position.repaidAmount += abi.decode(log.data, (uint256));
        if (position.repaidAmount >= position.principal) position.state = PositionState.Repaid;
        position.lastSourceBlock = sourceBlock;
        position.lastTransactionIndex = transactionIndex;
        position.lastQueryId = queryId;
        position.stateVersion += 1;
        emit FullFileVersionCreated(positionId, position.stateVersion, position.state, queryId);
    }

    function _reverseRepayment(
        bytes memory encodedTransaction,
        uint64 sourceBlock,
        uint64 transactionIndex,
        bytes32 queryId
    ) internal returns (bytes32 positionId) {
        EvmV1Decoder.LogEntry memory log =
            _requiredLog(encodedTransaction, REPAYMENT_REVERSED_SIGNATURE);
        if (log.topics.length != 4 || log.data.length != 0) revert InvalidEventShape();

        positionId = log.topics[1];
        Position storage position = positions[positionId];
        if (position.state != PositionState.Repaid) {
            revert InvalidPositionState(positionId, position.state);
        }
        _assertNextEvent(position, positionId, sourceBlock, transactionIndex);

        position.state = PositionState.Reversed;
        position.lastSourceBlock = sourceBlock;
        position.lastTransactionIndex = transactionIndex;
        position.lastQueryId = queryId;
        position.stateVersion += 1;
        emit FullFileVersionCreated(
            positionId, position.stateVersion, PositionState.Reversed, queryId
        );
    }

    function _requiredLog(bytes memory encodedTransaction, bytes32 eventSignature)
        internal
        view
        returns (EvmV1Decoder.LogEntry memory)
    {
        uint8 transactionType = EvmV1Decoder.getTransactionType(encodedTransaction);
        if (!EvmV1Decoder.isValidTransactionType(transactionType)) revert InvalidTransactionType();

        EvmV1Decoder.ReceiptFields memory receipt =
            EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        if (receipt.receiptStatus != 1) revert InvalidReceiptStatus();

        EvmV1Decoder.LogEntry[] memory logs =
            EvmV1Decoder.getLogsByEventSignature(receipt, eventSignature);
        for (uint256 index = 0; index < logs.length; index++) {
            if (logs[index].address_ == sourcePositionContract) return logs[index];
        }

        if (logs.length > 0) revert InvalidSourceContract(logs[0].address_);
        revert MissingRequiredEvent(eventSignature);
    }

    function _assertNextEvent(
        Position storage position,
        bytes32 positionId,
        uint64 sourceBlock,
        uint64 transactionIndex
    ) internal view {
        bool isLaterBlock = sourceBlock > position.lastSourceBlock;
        bool isLaterTransaction = sourceBlock == position.lastSourceBlock
            && transactionIndex > position.lastTransactionIndex;
        if (!isLaterBlock && !isLaterTransaction) revert InvalidEventOrder(positionId);
    }

    function _computeQueryId(
        uint64 chainKey,
        uint64 blockHeight,
        bytes32 merkleRoot,
        INativeQueryVerifier.MerkleProofEntry[] calldata siblings
    ) internal view returns (bytes32 queryId, uint64 transactionIndex) {
        INativeQueryVerifier.MerkleProof memory merkleProof =
            INativeQueryVerifier.MerkleProof({ root: merkleRoot, siblings: siblings });
        transactionIndex = verifier.calculateTxIndex(merkleProof);
        queryId = keccak256(abi.encodePacked(chainKey, blockHeight, transactionIndex));
    }
}

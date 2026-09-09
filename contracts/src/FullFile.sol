// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract FullFile is Ownable {
    enum PositionState {
        None,
        Open,
        Repaid,
        Reversed,
        Disputed,
        Closed,
        Unsupported
    }

    enum CoverageStatus {
        Incomplete,
        Current,
        Stale
    }

    enum EventType {
        PositionOpened,
        RepaymentRecorded,
        RepaymentReversed
    }

    enum EligibilityReason {
        Eligible,
        UnknownPosition,
        PolicyMismatch,
        StateNotRepaid,
        CandidateEventMismatch,
        CoverageNotCurrent,
        CoverageBehindState,
        CoverageExpired
    }

    struct SourceCoordinates {
        uint64 blockNumber;
        uint64 transactionIndex;
        uint32 logIndex;
    }

    struct EventRecord {
        bool exists;
        bytes32 eventId;
        bytes32 policyId;
        bytes32 positionId;
        EventType eventType;
        SourceCoordinates source;
        address participant;
        uint256 value;
        bytes32 eventReference;
        bytes32 proofPayloadHash;
        uint64 predecessorVersion;
        uint64 resultingVersion;
    }

    struct StateVersion {
        bool exists;
        uint64 version;
        uint64 predecessor;
        bytes32 eventId;
        bytes32 policyId;
        PositionState state;
        SourceCoordinates source;
        uint64 coverageThrough;
        CoverageStatus coverageStatus;
        bytes32 stateCommitment;
        uint64 createdAt;
    }

    struct Position {
        bytes32 policyId;
        address borrower;
        uint256 principal;
        uint256 repaidAmount;
        bytes32 termsHash;
        bytes32 qualifyingRepaymentId;
        bytes32 qualifyingRepaymentEventId;
        PositionState state;
        SourceCoordinates lastSource;
        uint64 stateVersion;
        uint64 enrollmentBlock;
    }

    struct Coverage {
        uint64 throughSourceBlock;
        uint64 updatedAtCreditcoinBlock;
        CoverageStatus status;
    }

    error InvalidProofGuard(address caller);
    error InvalidWorker(address caller);
    error ProofGuardAlreadyConfigured();
    error InvalidEvent(bytes32 eventId);
    error PositionAlreadyExists(bytes32 positionId);
    error UnknownPosition(bytes32 positionId);
    error InvalidEventOrder(bytes32 positionId);
    error InvalidPositionState(bytes32 positionId, PositionState state);
    error InvalidRepayment(bytes32 repaymentId);
    error InvalidCoverage(bytes32 positionId, uint64 throughSourceBlock);

    address public proofGuard;
    address public worker;

    mapping(bytes32 positionId => Position) private positions;
    mapping(bytes32 positionId => Coverage) private coverage;
    mapping(bytes32 eventId => EventRecord) private eventRecords;
    mapping(bytes32 positionId => mapping(uint64 version => StateVersion)) private stateVersions;

    event ProofGuardConfigured(address indexed proofGuard);
    event WorkerUpdated(address indexed previousWorker, address indexed nextWorker);
    event EventRecorded(
        bytes32 indexed eventId,
        bytes32 indexed positionId,
        EventType indexed eventType,
        uint64 resultingVersion
    );
    event FullFileVersionCreated(
        bytes32 indexed positionId,
        uint64 indexed version,
        PositionState state,
        bytes32 eventId,
        bytes32 stateCommitment
    );
    event CoverageAdvanced(bytes32 indexed positionId, uint64 throughSourceBlock);
    event CoverageStatusChanged(
        bytes32 indexed positionId, CoverageStatus status, uint64 throughSourceBlock
    );

    constructor(address initialOwner, address initialWorker) Ownable(initialOwner) {
        if (initialWorker == address(0)) revert InvalidWorker(initialWorker);
        worker = initialWorker;
    }

    modifier onlyProofGuard() {
        if (msg.sender != proofGuard) revert InvalidProofGuard(msg.sender);
        _;
    }

    modifier onlyWorker() {
        if (msg.sender != worker) revert InvalidWorker(msg.sender);
        _;
    }

    function configureProofGuard(address proofGuard_) external onlyOwner {
        if (proofGuard != address(0)) revert ProofGuardAlreadyConfigured();
        if (proofGuard_ == address(0)) revert InvalidProofGuard(proofGuard_);
        proofGuard = proofGuard_;
        emit ProofGuardConfigured(proofGuard_);
    }

    function setWorker(address nextWorker) external onlyOwner {
        if (nextWorker == address(0)) revert InvalidWorker(nextWorker);
        emit WorkerUpdated(worker, nextWorker);
        worker = nextWorker;
    }

    function applyPositionOpened(
        bytes32 eventId,
        bytes32 policyId,
        bytes32 positionId,
        address borrower,
        uint256 principal,
        bytes32 termsHash,
        SourceCoordinates calldata source,
        bytes32 proofPayloadHash
    ) external onlyProofGuard {
        if (eventRecords[eventId].exists || eventId == bytes32(0)) {
            revert InvalidEvent(eventId);
        }
        if (positions[positionId].state != PositionState.None) {
            revert PositionAlreadyExists(positionId);
        }

        Position storage position = positions[positionId];
        position.policyId = policyId;
        position.borrower = borrower;
        position.principal = principal;
        position.termsHash = termsHash;
        position.state = PositionState.Open;
        position.lastSource = source;
        position.stateVersion = 1;
        position.enrollmentBlock = source.blockNumber;
        coverage[positionId] = Coverage({
            throughSourceBlock: source.blockNumber - 1,
            updatedAtCreditcoinBlock: uint64(block.number),
            status: CoverageStatus.Incomplete
        });

        _recordEvent(
            eventId,
            policyId,
            positionId,
            EventType.PositionOpened,
            source,
            borrower,
            principal,
            termsHash,
            proofPayloadHash,
            0,
            1
        );
        _storeVersion(positionId, eventId);
    }

    function applyRepayment(
        bytes32 eventId,
        bytes32 positionId,
        bytes32 repaymentId,
        uint256 amount,
        SourceCoordinates calldata source,
        bytes32 proofPayloadHash
    ) external onlyProofGuard {
        Position storage position = positions[positionId];
        if (position.state == PositionState.None) revert UnknownPosition(positionId);
        if (position.state != PositionState.Open) {
            revert InvalidPositionState(positionId, position.state);
        }
        if (eventRecords[eventId].exists || eventId == bytes32(0)) revert InvalidEvent(eventId);
        if (repaymentId == bytes32(0) || amount != position.principal) {
            revert InvalidRepayment(repaymentId);
        }
        _assertNextEvent(position, positionId, source);

        uint64 predecessor = position.stateVersion;
        position.repaidAmount = amount;
        position.qualifyingRepaymentId = repaymentId;
        position.qualifyingRepaymentEventId = eventId;
        position.state = PositionState.Repaid;
        position.lastSource = source;
        position.stateVersion = predecessor + 1;
        _invalidateCoverage(positionId);

        _recordEvent(
            eventId,
            position.policyId,
            positionId,
            EventType.RepaymentRecorded,
            source,
            position.borrower,
            amount,
            repaymentId,
            proofPayloadHash,
            predecessor,
            position.stateVersion
        );
        _storeVersion(positionId, eventId);
    }

    function applyReversal(
        bytes32 eventId,
        bytes32 positionId,
        bytes32 repaymentId,
        bytes32 reasonHash,
        SourceCoordinates calldata source,
        bytes32 proofPayloadHash
    ) external onlyProofGuard {
        Position storage position = positions[positionId];
        if (position.state == PositionState.None) revert UnknownPosition(positionId);
        if (position.state != PositionState.Repaid) {
            revert InvalidPositionState(positionId, position.state);
        }
        if (eventRecords[eventId].exists || eventId == bytes32(0)) revert InvalidEvent(eventId);
        if (repaymentId != position.qualifyingRepaymentId || reasonHash == bytes32(0)) {
            revert InvalidRepayment(repaymentId);
        }
        _assertNextEvent(position, positionId, source);

        uint64 predecessor = position.stateVersion;
        position.state = PositionState.Reversed;
        position.lastSource = source;
        position.stateVersion = predecessor + 1;
        _invalidateCoverage(positionId);

        _recordEvent(
            eventId,
            position.policyId,
            positionId,
            EventType.RepaymentReversed,
            source,
            position.borrower,
            position.repaidAmount,
            repaymentId,
            proofPayloadHash,
            predecessor,
            position.stateVersion
        );
        _storeVersion(positionId, eventId);
    }

    function advanceCoverage(bytes32 positionId, uint64 throughSourceBlock) external onlyWorker {
        Position storage position = positions[positionId];
        if (position.state == PositionState.None) revert UnknownPosition(positionId);
        if (
            throughSourceBlock < position.lastSource.blockNumber
                || throughSourceBlock < coverage[positionId].throughSourceBlock
        ) revert InvalidCoverage(positionId, throughSourceBlock);

        coverage[positionId] = Coverage({
            throughSourceBlock: throughSourceBlock,
            updatedAtCreditcoinBlock: uint64(block.number),
            status: CoverageStatus.Current
        });
        emit CoverageAdvanced(positionId, throughSourceBlock);
    }

    function markCoverageIncomplete(bytes32 positionId, uint64 observedSourceBlock)
        external
        onlyWorker
    {
        if (positions[positionId].state == PositionState.None) {
            revert UnknownPosition(positionId);
        }
        Coverage storage currentCoverage = coverage[positionId];
        if (observedSourceBlock > 0 && observedSourceBlock <= currentCoverage.throughSourceBlock) {
            currentCoverage.throughSourceBlock = observedSourceBlock - 1;
        }
        currentCoverage.updatedAtCreditcoinBlock = uint64(block.number);
        currentCoverage.status = CoverageStatus.Incomplete;
        emit CoverageStatusChanged(
            positionId, CoverageStatus.Incomplete, currentCoverage.throughSourceBlock
        );
    }

    function markCoverageStale(bytes32 positionId) external onlyWorker {
        if (positions[positionId].state == PositionState.None) revert UnknownPosition(positionId);
        coverage[positionId].updatedAtCreditcoinBlock = uint64(block.number);
        coverage[positionId].status = CoverageStatus.Stale;
        emit CoverageStatusChanged(
            positionId, CoverageStatus.Stale, coverage[positionId].throughSourceBlock
        );
    }

    function evaluate(
        bytes32 policyId,
        bytes32 positionId,
        bytes32 candidateRepaymentEventId,
        uint64 maxCoverageAgeBlocks
    ) external view returns (bool eligible, EligibilityReason reason) {
        Position storage position = positions[positionId];
        if (position.state == PositionState.None) {
            return (false, EligibilityReason.UnknownPosition);
        }
        if (position.policyId != policyId) return (false, EligibilityReason.PolicyMismatch);
        if (position.state != PositionState.Repaid) {
            return (false, EligibilityReason.StateNotRepaid);
        }
        if (position.qualifyingRepaymentEventId != candidateRepaymentEventId) {
            return (false, EligibilityReason.CandidateEventMismatch);
        }

        Coverage storage currentCoverage = coverage[positionId];
        if (currentCoverage.status != CoverageStatus.Current) {
            return (false, EligibilityReason.CoverageNotCurrent);
        }
        if (currentCoverage.throughSourceBlock < position.lastSource.blockNumber) {
            return (false, EligibilityReason.CoverageBehindState);
        }
        if (block.number > currentCoverage.updatedAtCreditcoinBlock + maxCoverageAgeBlocks) {
            return (false, EligibilityReason.CoverageExpired);
        }
        return (true, EligibilityReason.Eligible);
    }

    function getPosition(bytes32 positionId) external view returns (Position memory) {
        return positions[positionId];
    }

    function getCoverage(bytes32 positionId) external view returns (Coverage memory) {
        return coverage[positionId];
    }

    function getEventRecord(bytes32 eventId) external view returns (EventRecord memory) {
        return eventRecords[eventId];
    }

    function getStateVersion(bytes32 positionId, uint64 version)
        external
        view
        returns (StateVersion memory)
    {
        return stateVersions[positionId][version];
    }

    function _invalidateCoverage(bytes32 positionId) internal {
        coverage[positionId].status = CoverageStatus.Incomplete;
        coverage[positionId].updatedAtCreditcoinBlock = uint64(block.number);
        emit CoverageStatusChanged(
            positionId, CoverageStatus.Incomplete, coverage[positionId].throughSourceBlock
        );
    }

    function _recordEvent(
        bytes32 eventId,
        bytes32 policyId,
        bytes32 positionId,
        EventType eventType,
        SourceCoordinates calldata source,
        address participant,
        uint256 value,
        bytes32 eventReference,
        bytes32 proofPayloadHash,
        uint64 predecessorVersion,
        uint64 resultingVersion
    ) internal {
        eventRecords[eventId] = EventRecord({
            exists: true,
            eventId: eventId,
            policyId: policyId,
            positionId: positionId,
            eventType: eventType,
            source: source,
            participant: participant,
            value: value,
            eventReference: eventReference,
            proofPayloadHash: proofPayloadHash,
            predecessorVersion: predecessorVersion,
            resultingVersion: resultingVersion
        });
        emit EventRecorded(eventId, positionId, eventType, resultingVersion);
    }

    function _storeVersion(bytes32 positionId, bytes32 eventId) internal {
        Position storage position = positions[positionId];
        Coverage storage currentCoverage = coverage[positionId];
        bytes32 commitment = keccak256(
            abi.encode(
                positionId,
                position.policyId,
                position.stateVersion,
                position.state,
                eventId,
                position.lastSource.blockNumber,
                position.lastSource.transactionIndex,
                position.lastSource.logIndex,
                currentCoverage.throughSourceBlock,
                currentCoverage.status
            )
        );
        stateVersions[positionId][position.stateVersion] = StateVersion({
            exists: true,
            version: position.stateVersion,
            predecessor: position.stateVersion - 1,
            eventId: eventId,
            policyId: position.policyId,
            state: position.state,
            source: position.lastSource,
            coverageThrough: currentCoverage.throughSourceBlock,
            coverageStatus: currentCoverage.status,
            stateCommitment: commitment,
            createdAt: uint64(block.timestamp)
        });
        emit FullFileVersionCreated(
            positionId, position.stateVersion, position.state, eventId, commitment
        );
    }

    function _assertNextEvent(
        Position storage position,
        bytes32 positionId,
        SourceCoordinates calldata source
    ) internal view {
        bool laterBlock = source.blockNumber > position.lastSource.blockNumber;
        bool laterTransaction = source.blockNumber == position.lastSource.blockNumber
            && source.transactionIndex > position.lastSource.transactionIndex;
        bool laterLog = source.blockNumber == position.lastSource.blockNumber
            && source.transactionIndex == position.lastSource.transactionIndex
            && source.logIndex > position.lastSource.logIndex;
        if (!laterBlock && !laterTransaction && !laterLog) revert InvalidEventOrder(positionId);
    }
}

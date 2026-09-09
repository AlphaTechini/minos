// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract LoanPolicyRegistry is Ownable {
    struct PolicyInput {
        bytes32 compilerVersion;
        uint64 policyVersion;
        bytes32 predecessor;
        uint64 sourceChainKey;
        uint256 sourceEvmChainId;
        address sourceContract;
        bytes32 sourceCodeHash;
        address sourceOwner;
        uint64 sourceStartBlock;
        address destinationApplication;
        uint64 maxCoverageAgeBlocks;
        uint16 loanRatioBps;
        uint256 minPrincipal;
        uint256 maxPrincipal;
        bytes32 rulesHash;
    }

    struct Policy {
        bytes32 policyId;
        bytes32 compilerVersion;
        uint64 policyVersion;
        bytes32 predecessor;
        uint64 sourceChainKey;
        uint256 sourceEvmChainId;
        address sourceContract;
        bytes32 sourceCodeHash;
        address sourceOwner;
        uint64 sourceStartBlock;
        address destinationApplication;
        uint64 maxCoverageAgeBlocks;
        uint16 loanRatioBps;
        uint256 minPrincipal;
        uint256 maxPrincipal;
        bytes32 rulesHash;
        bool active;
        bool sourcePaused;
    }

    error InvalidMonitor(address caller);
    error InvalidPolicy();
    error PolicyAlreadyExists(bytes32 policyId);
    error UnknownPolicy(bytes32 policyId);

    address public monitor;
    mapping(bytes32 policyId => Policy) private policies;

    event MonitorUpdated(address indexed previousMonitor, address indexed nextMonitor);
    event PolicyRegistered(
        bytes32 indexed policyId,
        uint64 indexed policyVersion,
        address indexed sourceContract,
        address destinationApplication
    );
    event PolicyStatusChanged(bytes32 indexed policyId, bool active);
    event SourceChangeReported(
        bytes32 indexed policyId, bytes32 observedCodeHash, address observedOwner
    );
    event UnsupportedSourceEventReported(
        bytes32 indexed policyId, bytes32 indexed eventSignature, uint64 sourceBlock
    );

    constructor(address initialOwner, address initialMonitor) Ownable(initialOwner) {
        if (initialMonitor == address(0)) revert InvalidPolicy();
        monitor = initialMonitor;
    }

    modifier onlyMonitor() {
        if (msg.sender != monitor) revert InvalidMonitor(msg.sender);
        _;
    }

    function setMonitor(address nextMonitor) external onlyOwner {
        if (nextMonitor == address(0)) revert InvalidPolicy();
        emit MonitorUpdated(monitor, nextMonitor);
        monitor = nextMonitor;
    }

    function computePolicyId(PolicyInput calldata input) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                input.compilerVersion,
                input.policyVersion,
                input.predecessor,
                input.sourceChainKey,
                input.sourceEvmChainId,
                input.sourceContract,
                input.sourceCodeHash,
                input.sourceOwner,
                input.sourceStartBlock,
                input.destinationApplication,
                input.maxCoverageAgeBlocks,
                input.loanRatioBps,
                input.minPrincipal,
                input.maxPrincipal,
                input.rulesHash
            )
        );
    }

    function registerPolicy(PolicyInput calldata input)
        external
        onlyOwner
        returns (bytes32 policyId)
    {
        if (
            input.compilerVersion == bytes32(0) || input.policyVersion == 0
                || input.sourceChainKey == 0 || input.sourceEvmChainId == 0
                || input.sourceContract == address(0) || input.sourceCodeHash == bytes32(0)
                || input.sourceOwner == address(0) || input.sourceStartBlock == 0
                || input.destinationApplication == address(0) || input.maxCoverageAgeBlocks == 0
                || input.loanRatioBps == 0 || input.loanRatioBps > 10_000 || input.minPrincipal == 0
                || input.maxPrincipal < input.minPrincipal || input.rulesHash == bytes32(0)
        ) revert InvalidPolicy();

        policyId = computePolicyId(input);
        if (policies[policyId].policyId != bytes32(0)) revert PolicyAlreadyExists(policyId);

        policies[policyId] = Policy({
            policyId: policyId,
            compilerVersion: input.compilerVersion,
            policyVersion: input.policyVersion,
            predecessor: input.predecessor,
            sourceChainKey: input.sourceChainKey,
            sourceEvmChainId: input.sourceEvmChainId,
            sourceContract: input.sourceContract,
            sourceCodeHash: input.sourceCodeHash,
            sourceOwner: input.sourceOwner,
            sourceStartBlock: input.sourceStartBlock,
            destinationApplication: input.destinationApplication,
            maxCoverageAgeBlocks: input.maxCoverageAgeBlocks,
            loanRatioBps: input.loanRatioBps,
            minPrincipal: input.minPrincipal,
            maxPrincipal: input.maxPrincipal,
            rulesHash: input.rulesHash,
            active: true,
            sourcePaused: false
        });

        emit PolicyRegistered(
            policyId, input.policyVersion, input.sourceContract, input.destinationApplication
        );
    }

    function getPolicy(bytes32 policyId) external view returns (Policy memory policy) {
        policy = policies[policyId];
        if (policy.policyId == bytes32(0)) revert UnknownPolicy(policyId);
    }

    function setPolicyActive(bytes32 policyId, bool active) external onlyOwner {
        Policy storage policy = policies[policyId];
        if (policy.policyId == bytes32(0)) revert UnknownPolicy(policyId);
        policy.active = active;
        emit PolicyStatusChanged(policyId, active);
    }

    function reportSourceChange(bytes32 policyId, bytes32 observedCodeHash, address observedOwner)
        external
        onlyMonitor
    {
        Policy storage policy = policies[policyId];
        if (policy.policyId == bytes32(0)) revert UnknownPolicy(policyId);
        policy.sourcePaused = true;
        emit SourceChangeReported(policyId, observedCodeHash, observedOwner);
    }

    function reportUnsupportedSourceEvent(
        bytes32 policyId,
        bytes32 eventSignature,
        uint64 sourceBlock
    ) external onlyMonitor {
        Policy storage policy = policies[policyId];
        if (policy.policyId == bytes32(0)) revert UnknownPolicy(policyId);
        policy.sourcePaused = true;
        emit UnsupportedSourceEventReported(policyId, eventSignature, sourceBlock);
    }

    function resumeSource(bytes32 policyId) external onlyOwner {
        Policy storage policy = policies[policyId];
        if (policy.policyId == bytes32(0)) revert UnknownPolicy(policyId);
        policy.sourcePaused = false;
    }
}

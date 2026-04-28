// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract VerifierReceiptRegistry {
    struct VerifierReceipt {
        bytes32 receiptId;
        bytes32 eventId;
        bytes32 policyHash;
        bytes32 proofHash;
        bytes32 nullifier;
        bool approved;
        uint64 expiresAt;
        address verifier;
        string auditURI;
    }

    error NotRecorder(address caller);
    error ReceiptAlreadyExists(bytes32 receiptId);
    error ReceiptDoesNotExist(bytes32 receiptId);
    error EmptyReceiptField();
    error ZeroAddress();

    address public recorder;
    mapping(bytes32 => VerifierReceipt) private receiptsById;

    event RecorderChanged(address indexed recorder);
    event VerifierReceiptRecorded(
        bytes32 indexed receiptId,
        bytes32 indexed eventId,
        bytes32 indexed nullifier,
        bytes32 policyHash,
        bytes32 proofHash,
        bool approved,
        uint64 expiresAt,
        string auditURI
    );

    constructor(address initialRecorder) {
        if (initialRecorder == address(0)) {
            revert ZeroAddress();
        }

        recorder = initialRecorder;
        emit RecorderChanged(initialRecorder);
    }

    modifier onlyRecorder() {
        if (msg.sender != recorder) {
            revert NotRecorder(msg.sender);
        }
        _;
    }

    function setRecorder(address nextRecorder) external onlyRecorder {
        if (nextRecorder == address(0)) {
            revert ZeroAddress();
        }

        recorder = nextRecorder;
        emit RecorderChanged(nextRecorder);
    }

    function recordReceipt(VerifierReceipt calldata receipt) external onlyRecorder {
        if (
            receipt.receiptId == bytes32(0) || receipt.eventId == bytes32(0) || receipt.policyHash == bytes32(0)
                || receipt.proofHash == bytes32(0) || receipt.nullifier == bytes32(0)
        ) {
            revert EmptyReceiptField();
        }
        if (receiptsById[receipt.receiptId].receiptId != bytes32(0)) {
            revert ReceiptAlreadyExists(receipt.receiptId);
        }

        receiptsById[receipt.receiptId] = VerifierReceipt({
            receiptId: receipt.receiptId,
            eventId: receipt.eventId,
            policyHash: receipt.policyHash,
            proofHash: receipt.proofHash,
            nullifier: receipt.nullifier,
            approved: receipt.approved,
            expiresAt: receipt.expiresAt,
            verifier: msg.sender,
            auditURI: receipt.auditURI
        });

        emit VerifierReceiptRecorded(
            receipt.receiptId,
            receipt.eventId,
            receipt.nullifier,
            receipt.policyHash,
            receipt.proofHash,
            receipt.approved,
            receipt.expiresAt,
            receipt.auditURI
        );
    }

    function getReceipt(bytes32 receiptId) external view returns (VerifierReceipt memory) {
        VerifierReceipt memory receipt = receiptsById[receiptId];
        if (receipt.receiptId == bytes32(0)) {
            revert ReceiptDoesNotExist(receiptId);
        }

        return receipt;
    }
}

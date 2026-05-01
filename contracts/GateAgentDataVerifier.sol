// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IERC7857DataVerifier, TransferValidityProof, TransferValidityProofOutput} from "./IERC7857.sol";

contract GateAgentDataVerifier is IERC7857DataVerifier {
    using ECDSA for bytes32;

    struct TransferReceipt {
        bytes32 oldDataHash;
        bytes32 newDataHash;
        string oldMetadataURI;
        string newMetadataURI;
        string[] dataDescriptions;
        bytes32[] dataHashes;
        address from;
        address to;
        uint256 tokenId;
        uint256 expiresAt;
        bytes32 nonce;
        string attestationURI;
        bytes signature;
    }

    error InvalidAttestor(address recovered);
    error InvalidReceipt();
    error ProofExpired(uint256 expiresAt);
    error ProofAlreadyUsed(bytes32 nonce);

    address public immutable attestor;
    mapping(bytes32 => bool) public usedProofs;

    event TransferValidityVerified(
        bytes32 indexed oldDataHash,
        bytes32 indexed newDataHash,
        address indexed to,
        uint256 tokenId,
        bytes32 nonce,
        string newMetadataURI,
        string attestationURI
    );

    constructor(address initialAttestor) {
        if (initialAttestor == address(0)) {
            revert InvalidReceipt();
        }
        attestor = initialAttestor;
    }

    function verifyTransferValidity(TransferValidityProof[] calldata proofs)
        external
        override
        returns (TransferValidityProofOutput[] memory outputs)
    {
        outputs = new TransferValidityProofOutput[](proofs.length);
        for (uint256 i = 0; i < proofs.length; i++) {
            TransferReceipt memory receipt = decodeTransferReceipt(proofs[i]);
            _verifyReceipt(proofs[i], receipt);

            bytes32 accessNonce = keccak256(proofs[i].accessProof.nonce);
            bytes32 ownershipNonce = keccak256(proofs[i].ownershipProof.nonce);
            if (usedProofs[accessNonce] || usedProofs[ownershipNonce]) {
                revert ProofAlreadyUsed(receipt.nonce);
            }
            usedProofs[accessNonce] = true;
            usedProofs[ownershipNonce] = true;

            outputs[i] = TransferValidityProofOutput({
                oldDataHash: proofs[i].accessProof.oldDataHash,
                newDataHash: proofs[i].accessProof.newDataHash,
                sealedKey: proofs[i].ownershipProof.sealedKey,
                encryptedPubKey: proofs[i].ownershipProof.encryptedPubKey,
                wantedKey: "",
                accessAssistant: receipt.to,
                accessProofNonce: proofs[i].accessProof.nonce,
                ownershipProofNonce: proofs[i].ownershipProof.nonce
            });

            emit TransferValidityVerified(
                proofs[i].accessProof.oldDataHash,
                proofs[i].accessProof.newDataHash,
                receipt.to,
                receipt.tokenId,
                receipt.nonce,
                receipt.newMetadataURI,
                receipt.attestationURI
            );
        }
    }

    function decodeTransferReceipt(TransferValidityProof calldata proof)
        public
        pure
        returns (TransferReceipt memory)
    {
        return abi.decode(
            proof.ownershipProof.proof,
            (TransferReceipt)
        );
    }

    function hashReceipt(TransferReceipt memory receipt) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("GateAgentTransferReceipt(bytes32 oldDataHash,bytes32 newDataHash,string oldMetadataURI,string newMetadataURI,address from,address to,uint256 tokenId,uint256 expiresAt,bytes32 nonce,string attestationURI)"),
                receipt.oldDataHash,
                receipt.newDataHash,
                keccak256(bytes(receipt.oldMetadataURI)),
                keccak256(bytes(receipt.newMetadataURI)),
                receipt.from,
                receipt.to,
                receipt.tokenId,
                receipt.expiresAt,
                receipt.nonce,
                keccak256(bytes(receipt.attestationURI))
            )
        );
    }

    function dataRoot(string[] memory descriptions, bytes32[] memory dataHashes, string memory metadataURI)
        external
        pure
        returns (bytes32)
    {
        return _dataRoot(descriptions, dataHashes, metadataURI);
    }

    function _verifyReceipt(TransferValidityProof calldata proof, TransferReceipt memory receipt) internal view {
        bytes32 newDataHash = _dataRoot(receipt.dataDescriptions, receipt.dataHashes, receipt.newMetadataURI);
        if (
            receipt.from == address(0) || receipt.to == address(0) || receipt.tokenId == 0
                || receipt.expiresAt < block.timestamp || receipt.nonce == bytes32(0)
                || proof.accessProof.oldDataHash != proof.ownershipProof.oldDataHash
                || proof.accessProof.newDataHash != proof.ownershipProof.newDataHash
                || proof.accessProof.oldDataHash != receipt.oldDataHash
                || proof.accessProof.newDataHash != receipt.newDataHash
                || proof.accessProof.oldDataHash == bytes32(0)
                || proof.accessProof.newDataHash != newDataHash
        ) {
            if (receipt.expiresAt < block.timestamp) {
                revert ProofExpired(receipt.expiresAt);
            }
            revert InvalidReceipt();
        }

        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(hashReceipt(receipt));
        address recovered = ECDSA.recover(digest, receipt.signature);
        if (recovered != attestor) {
            revert InvalidAttestor(recovered);
        }
    }

    function _dataRoot(string[] memory descriptions, bytes32[] memory dataHashes, string memory metadataURI)
        internal
        pure
        returns (bytes32)
    {
        if (descriptions.length == 0 || descriptions.length != dataHashes.length) {
            revert InvalidReceipt();
        }
        bytes32[] memory itemHashes = new bytes32[](descriptions.length);
        for (uint256 i = 0; i < descriptions.length; i++) {
            if (bytes(descriptions[i]).length == 0 || dataHashes[i] == bytes32(0)) {
                revert InvalidReceipt();
            }
            itemHashes[i] = keccak256(abi.encode(keccak256(bytes(descriptions[i])), dataHashes[i]));
        }
        return keccak256(abi.encode(keccak256(bytes(metadataURI)), itemHashes));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {EventRegistry} from "./EventRegistry.sol";
import {NullifierRegistry} from "./NullifierRegistry.sol";
import {VerifierReceiptRegistry} from "./VerifierReceiptRegistry.sol";

contract EventPassSBT is ERC721 {
    struct TokenRecord {
        uint256 tokenId;
        bytes32 eventId;
        bytes32 policyHash;
        bytes32 proofHash;
        bytes32 nullifier;
        bytes32 receiptId;
        string tokenURI;
    }

    error ZeroAddress();
    error TokenDoesNotExist(uint256 tokenId);
    error EventInactive(bytes32 eventId);
    error WrongPolicyHash(bytes32 expected, bytes32 actual);
    error ReceiptNotApproved(bytes32 receiptId);
    error ReceiptExpired(bytes32 receiptId);
    error TransferDisabled();

    EventRegistry public eventRegistry;
    NullifierRegistry public nullifierRegistry;
    VerifierReceiptRegistry public verifierReceiptRegistry;
    uint256 public nextTokenId = 1;

    mapping(uint256 => TokenRecord) private tokenRecords;
    mapping(uint256 => string) private tokenURIs;

    event EventPassMinted(
        uint256 indexed tokenId,
        address indexed recipient,
        bytes32 indexed eventId,
        bytes32 receiptId,
        bytes32 nullifier,
        string tokenURI
    );

    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        address eventRegistryAddress,
        address nullifierRegistryAddress,
        address verifierReceiptRegistryAddress
    ) ERC721(tokenName, tokenSymbol) {
        if (
            eventRegistryAddress == address(0) || nullifierRegistryAddress == address(0)
                || verifierReceiptRegistryAddress == address(0)
        ) {
            revert ZeroAddress();
        }

        eventRegistry = EventRegistry(eventRegistryAddress);
        nullifierRegistry = NullifierRegistry(nullifierRegistryAddress);
        verifierReceiptRegistry = VerifierReceiptRegistry(verifierReceiptRegistryAddress);
    }

    function tokenRecord(uint256 tokenId) external view returns (TokenRecord memory) {
        _requireOwned(tokenId);

        return tokenRecords[tokenId];
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        return tokenURIs[tokenId];
    }

    function approve(address, uint256) public pure override {
        revert TransferDisabled();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert TransferDisabled();
    }

    function mintWithVerifiedReceipt(address recipient, bytes32 receiptId, string calldata passTokenURI)
        external
        returns (uint256 tokenId)
    {
        if (recipient == address(0)) {
            revert ZeroAddress();
        }

        VerifierReceiptRegistry.VerifierReceipt memory receipt = verifierReceiptRegistry.getReceipt(receiptId);
        EventRegistry.EventConfig memory gateEvent = eventRegistry.getEvent(receipt.eventId);

        if (!gateEvent.active) {
            revert EventInactive(receipt.eventId);
        }
        if (gateEvent.policyHash != receipt.policyHash) {
            revert WrongPolicyHash(gateEvent.policyHash, receipt.policyHash);
        }
        if (!receipt.approved) {
            revert ReceiptNotApproved(receiptId);
        }
        if (receipt.expiresAt != 0 && receipt.expiresAt < block.timestamp) {
            revert ReceiptExpired(receiptId);
        }

        nullifierRegistry.useNullifier(receipt.nullifier);

        tokenId = nextTokenId;
        nextTokenId++;
        _safeMint(recipient, tokenId);
        tokenRecords[tokenId] = TokenRecord({
            tokenId: tokenId,
            eventId: receipt.eventId,
            policyHash: receipt.policyHash,
            proofHash: receipt.proofHash,
            nullifier: receipt.nullifier,
            receiptId: receiptId,
            tokenURI: passTokenURI
        });
        tokenURIs[tokenId] = passTokenURI;

        emit EventPassMinted(tokenId, recipient, receipt.eventId, receiptId, receipt.nullifier, passTokenURI);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert TransferDisabled();
        }

        return super._update(to, tokenId, auth);
    }
}

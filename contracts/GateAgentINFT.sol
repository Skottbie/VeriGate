// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {
    IERC7857,
    IERC7857DataVerifier,
    IERC7857Metadata,
    IntelligentData,
    TransferValidityProof,
    TransferValidityProofOutput
} from "./IERC7857.sol";
import {GateAgentDataVerifier} from "./GateAgentDataVerifier.sol";

contract GateAgentINFT is ERC721, IERC7857 {
    struct GateAgentRecord {
        uint256 tokenId;
        bytes32 eventId;
        bytes32 policyHash;
        bytes32 memoryRoot;
        bytes32 dataRoot;
        string encryptedMetadataURI;
        uint64 createdAt;
    }

    error ZeroAddress();
    error EmptyField();
    error TokenDoesNotExist(uint256 tokenId);
    error NotTokenController(address caller, uint256 tokenId);
    error UnauthorizedExecutor(address executor, uint256 tokenId);
    error InvalidTransferReceipt();

    IERC7857DataVerifier private immutable dataVerifier;
    uint256 public nextTokenId = 1;

    mapping(uint256 => GateAgentRecord) private agentRecords;
    mapping(uint256 => IntelligentData[]) private tokenData;
    mapping(uint256 => address[]) private authorizedUsers;
    mapping(uint256 => mapping(address => bool)) private isAuthorizedUser;
    mapping(address => address) private delegateAccessByUser;

    event GateAgentMinted(
        uint256 indexed tokenId,
        address indexed owner,
        bytes32 indexed eventId,
        bytes32 policyHash,
        bytes32 memoryRoot,
        bytes32 dataRoot,
        string encryptedMetadataURI
    );
    event GateAgentDataUpdated(
        uint256 indexed tokenId,
        bytes32 indexed oldDataRoot,
        bytes32 indexed newDataRoot,
        string encryptedMetadataURI
    );

    constructor(string memory tokenName, string memory tokenSymbol, address verifierAddress)
        ERC721(tokenName, tokenSymbol)
    {
        if (verifierAddress == address(0)) {
            revert ZeroAddress();
        }
        dataVerifier = IERC7857DataVerifier(verifierAddress);
    }

    function name() public view override(ERC721, IERC7857Metadata) returns (string memory) {
        return super.name();
    }

    function symbol() public view override(ERC721, IERC7857Metadata) returns (string memory) {
        return super.symbol();
    }

    function ownerOf(uint256 tokenId) public view override(ERC721, IERC7857) returns (address) {
        return super.ownerOf(tokenId);
    }

    function getApproved(uint256 tokenId) public view override(ERC721, IERC7857) returns (address) {
        return super.getApproved(tokenId);
    }

    function isApprovedForAll(address owner, address operator)
        public
        view
        override(ERC721, IERC7857)
        returns (bool)
    {
        return super.isApprovedForAll(owner, operator);
    }

    function verifier() external view override returns (IERC7857DataVerifier) {
        return dataVerifier;
    }

    function mintGateAgent(
        address to,
        bytes32 eventId,
        bytes32 policyHash,
        bytes32 memoryRoot,
        string calldata encryptedMetadataURI,
        IntelligentData[] calldata data,
        address[] calldata initialExecutors
    ) external returns (uint256 tokenId) {
        if (to == address(0)) {
            revert ZeroAddress();
        }
        if (
            eventId == bytes32(0) || policyHash == bytes32(0) || memoryRoot == bytes32(0)
                || bytes(encryptedMetadataURI).length == 0 || data.length == 0
        ) {
            revert EmptyField();
        }

        tokenId = nextTokenId;
        nextTokenId++;
        bytes32 dataRoot = _dataRoot(data, encryptedMetadataURI);
        agentRecords[tokenId] = GateAgentRecord({
            tokenId: tokenId,
            eventId: eventId,
            policyHash: policyHash,
            memoryRoot: memoryRoot,
            dataRoot: dataRoot,
            encryptedMetadataURI: encryptedMetadataURI,
            createdAt: uint64(block.timestamp)
        });
        _replaceIntelligentData(tokenId, data);
        _safeMint(to, tokenId);

        for (uint256 i = 0; i < initialExecutors.length; i++) {
            _authorize(tokenId, initialExecutors[i], to);
        }

        emit GateAgentMinted(tokenId, to, eventId, policyHash, memoryRoot, dataRoot, encryptedMetadataURI);
    }

    function iTransfer(address to, uint256 tokenId, TransferValidityProof[] calldata proofs) external override {
        address from = ownerOf(tokenId);
        _requireTokenController(tokenId);
        GateAgentDataVerifier.TransferReceipt memory receipt = _verifyAndLoadReceipt(to, tokenId, proofs);
        _applyDataUpdate(tokenId, receipt);
        _transfer(from, to, tokenId);
        emit Transferred(tokenId, from, to);
    }

    function iClone(address to, uint256 tokenId, TransferValidityProof[] calldata proofs)
        external
        override
        returns (uint256 newTokenId)
    {
        address from = ownerOf(tokenId);
        _requireTokenController(tokenId);
        GateAgentDataVerifier.TransferReceipt memory receipt = _verifyAndLoadReceipt(to, tokenId, proofs);
        GateAgentRecord memory source = agentRecords[tokenId];

        newTokenId = nextTokenId;
        nextTokenId++;
        agentRecords[newTokenId] = GateAgentRecord({
            tokenId: newTokenId,
            eventId: source.eventId,
            policyHash: source.policyHash,
            memoryRoot: source.memoryRoot,
            dataRoot: receipt.newDataHash,
            encryptedMetadataURI: receipt.newMetadataURI,
            createdAt: uint64(block.timestamp)
        });
        _replaceIntelligentDataFromReceipt(newTokenId, receipt);
        _safeMint(to, newTokenId);

        emit Cloned(tokenId, newTokenId, from, to);
        emit GateAgentMinted(
            newTokenId,
            to,
            source.eventId,
            source.policyHash,
            source.memoryRoot,
            receipt.newDataHash,
            receipt.newMetadataURI
        );
    }

    function authorizeUsage(uint256 tokenId, address user) external override {
        _requireTokenController(tokenId);
        _authorize(tokenId, user, ownerOf(tokenId));
    }

    function revokeAuthorization(uint256 tokenId, address user) external override {
        _requireTokenController(tokenId);
        if (isAuthorizedUser[tokenId][user]) {
            isAuthorizedUser[tokenId][user] = false;
            emit AuthorizationRevoked(ownerOf(tokenId), user, tokenId);
        }
    }

    function delegateAccess(address assistant) external override {
        if (assistant == address(0)) {
            revert ZeroAddress();
        }
        delegateAccessByUser[msg.sender] = assistant;
        emit DelegateAccess(msg.sender, assistant);
    }

    function assertAuthorizedUsage(uint256 tokenId, address executor) external view returns (bool) {
        _requireOwned(tokenId);
        if (!_isAuthorized(tokenId, executor)) {
            revert UnauthorizedExecutor(executor, tokenId);
        }
        return true;
    }

    function authorizedUsersOf(uint256 tokenId) external view override returns (address[] memory) {
        _requireOwned(tokenId);
        uint256 count = 0;
        address[] storage users = authorizedUsers[tokenId];
        for (uint256 i = 0; i < users.length; i++) {
            if (isAuthorizedUser[tokenId][users[i]]) {
                count++;
            }
        }
        address[] memory active = new address[](count);
        uint256 cursor = 0;
        for (uint256 i = 0; i < users.length; i++) {
            if (isAuthorizedUser[tokenId][users[i]]) {
                active[cursor] = users[i];
                cursor++;
            }
        }
        return active;
    }

    function getDelegateAccess(address user) external view override returns (address) {
        return delegateAccessByUser[user];
    }

    function intelligentDataOf(uint256 tokenId) external view override returns (IntelligentData[] memory) {
        _requireOwned(tokenId);
        IntelligentData[] storage stored = tokenData[tokenId];
        IntelligentData[] memory copy = new IntelligentData[](stored.length);
        for (uint256 i = 0; i < stored.length; i++) {
            copy[i] = stored[i];
        }
        return copy;
    }

    function gateAgentRecord(uint256 tokenId) external view returns (GateAgentRecord memory) {
        _requireOwned(tokenId);
        return agentRecords[tokenId];
    }

    function encryptedMetadataURIOf(uint256 tokenId) external view returns (string memory) {
        _requireOwned(tokenId);
        return agentRecords[tokenId].encryptedMetadataURI;
    }

    function isUsageAuthorized(uint256 tokenId, address executor) external view returns (bool) {
        _requireOwned(tokenId);
        return _isAuthorized(tokenId, executor);
    }

    function computeDataRoot(IntelligentData[] calldata data, string calldata encryptedMetadataURI)
        external
        pure
        returns (bytes32)
    {
        return _dataRoot(data, encryptedMetadataURI);
    }

    function _verifyAndLoadReceipt(address to, uint256 tokenId, TransferValidityProof[] calldata proofs)
        internal
        returns (GateAgentDataVerifier.TransferReceipt memory receipt)
    {
        if (to == address(0) || proofs.length != 1) {
            revert InvalidTransferReceipt();
        }
        GateAgentRecord memory record = agentRecords[tokenId];
        TransferValidityProofOutput[] memory outputs = dataVerifier.verifyTransferValidity(proofs);
        if (outputs.length != 1 || outputs[0].oldDataHash != record.dataRoot) {
            revert InvalidTransferReceipt();
        }

        receipt = GateAgentDataVerifier(address(dataVerifier)).decodeTransferReceipt(proofs[0]);
        if (
            receipt.from != ownerOf(tokenId) || receipt.to != to || receipt.tokenId != tokenId
                || keccak256(bytes(receipt.oldMetadataURI)) != keccak256(bytes(record.encryptedMetadataURI))
                || outputs[0].newDataHash != receipt.newDataHash
                || _dataRoot(receipt.dataDescriptions, receipt.dataHashes, receipt.newMetadataURI) != receipt.newDataHash
        ) {
            revert InvalidTransferReceipt();
        }
    }

    function _applyDataUpdate(uint256 tokenId, GateAgentDataVerifier.TransferReceipt memory receipt) internal {
        bytes32 oldDataRoot = agentRecords[tokenId].dataRoot;
        agentRecords[tokenId].dataRoot = receipt.newDataHash;
        agentRecords[tokenId].encryptedMetadataURI = receipt.newMetadataURI;
        _replaceIntelligentDataFromReceipt(tokenId, receipt);
        emit GateAgentDataUpdated(tokenId, oldDataRoot, receipt.newDataHash, receipt.newMetadataURI);
    }

    function _authorize(uint256 tokenId, address user, address from) internal {
        if (user == address(0)) {
            revert ZeroAddress();
        }
        if (!isAuthorizedUser[tokenId][user]) {
            isAuthorizedUser[tokenId][user] = true;
            authorizedUsers[tokenId].push(user);
            emit Authorization(from, user, tokenId);
        }
    }

    function _replaceIntelligentData(uint256 tokenId, IntelligentData[] calldata data) internal {
        delete tokenData[tokenId];
        for (uint256 i = 0; i < data.length; i++) {
            if (bytes(data[i].dataDescription).length == 0 || data[i].dataHash == bytes32(0)) {
                revert EmptyField();
            }
            tokenData[tokenId].push(data[i]);
        }
    }

    function _replaceIntelligentDataFromReceipt(uint256 tokenId, GateAgentDataVerifier.TransferReceipt memory receipt)
        internal
    {
        if (receipt.dataDescriptions.length == 0 || receipt.dataDescriptions.length != receipt.dataHashes.length) {
            revert InvalidTransferReceipt();
        }
        delete tokenData[tokenId];
        for (uint256 i = 0; i < receipt.dataDescriptions.length; i++) {
            if (bytes(receipt.dataDescriptions[i]).length == 0 || receipt.dataHashes[i] == bytes32(0)) {
                revert InvalidTransferReceipt();
            }
            tokenData[tokenId].push(IntelligentData({
                dataDescription: receipt.dataDescriptions[i],
                dataHash: receipt.dataHashes[i]
            }));
        }
    }

    function _requireTokenController(uint256 tokenId) internal view {
        address owner = ownerOf(tokenId);
        if (
            msg.sender != owner && getApproved(tokenId) != msg.sender
                && !isApprovedForAll(owner, msg.sender)
        ) {
            revert NotTokenController(msg.sender, tokenId);
        }
    }

    function _isAuthorized(uint256 tokenId, address executor) internal view returns (bool) {
        address owner = ownerOf(tokenId);
        return executor == owner || isAuthorizedUser[tokenId][executor]
            || delegateAccessByUser[owner] == executor;
    }

    function _dataRoot(IntelligentData[] calldata data, string memory encryptedMetadataURI)
        internal
        pure
        returns (bytes32)
    {
        bytes32[] memory itemHashes = new bytes32[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            if (bytes(data[i].dataDescription).length == 0 || data[i].dataHash == bytes32(0)) {
                revert EmptyField();
            }
            itemHashes[i] = keccak256(abi.encode(keccak256(bytes(data[i].dataDescription)), data[i].dataHash));
        }
        return keccak256(abi.encode(keccak256(bytes(encryptedMetadataURI)), itemHashes));
    }

    function _dataRoot(string[] memory descriptions, bytes32[] memory dataHashes, string memory encryptedMetadataURI)
        internal
        pure
        returns (bytes32)
    {
        if (descriptions.length == 0 || descriptions.length != dataHashes.length) {
            revert InvalidTransferReceipt();
        }
        bytes32[] memory itemHashes = new bytes32[](descriptions.length);
        for (uint256 i = 0; i < descriptions.length; i++) {
            if (bytes(descriptions[i]).length == 0 || dataHashes[i] == bytes32(0)) {
                revert InvalidTransferReceipt();
            }
            itemHashes[i] = keccak256(abi.encode(keccak256(bytes(descriptions[i])), dataHashes[i]));
        }
        return keccak256(abi.encode(keccak256(bytes(encryptedMetadataURI)), itemHashes));
    }
}

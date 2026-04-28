// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract EventRegistry {
    struct EventConfig {
        bytes32 eventId;
        bytes32 policyHash;
        address organizer;
        bool active;
        string metadataURI;
        uint64 createdAt;
    }

    error EventAlreadyExists(bytes32 eventId);
    error EventDoesNotExist(bytes32 eventId);
    error NotOrganizer(bytes32 eventId, address caller);
    error EmptyPolicyHash();

    mapping(bytes32 => EventConfig) private eventsById;

    event GateEventCreated(
        bytes32 indexed eventId,
        bytes32 indexed policyHash,
        address indexed organizer,
        string metadataURI
    );
    event GateEventStatusChanged(bytes32 indexed eventId, bool active);

    function createEvent(bytes32 eventId, bytes32 policyHash, string calldata metadataURI) external {
        if (policyHash == bytes32(0)) {
            revert EmptyPolicyHash();
        }
        if (eventsById[eventId].createdAt != 0) {
            revert EventAlreadyExists(eventId);
        }

        eventsById[eventId] = EventConfig({
            eventId: eventId,
            policyHash: policyHash,
            organizer: msg.sender,
            active: true,
            metadataURI: metadataURI,
            createdAt: uint64(block.timestamp)
        });

        emit GateEventCreated(eventId, policyHash, msg.sender, metadataURI);
    }

    function setEventActive(bytes32 eventId, bool active) external {
        EventConfig storage gateEvent = eventsById[eventId];
        if (gateEvent.createdAt == 0) {
            revert EventDoesNotExist(eventId);
        }
        if (gateEvent.organizer != msg.sender) {
            revert NotOrganizer(eventId, msg.sender);
        }

        gateEvent.active = active;
        emit GateEventStatusChanged(eventId, active);
    }

    function getEvent(bytes32 eventId) external view returns (EventConfig memory) {
        EventConfig memory gateEvent = eventsById[eventId];
        if (gateEvent.createdAt == 0) {
            revert EventDoesNotExist(eventId);
        }

        return gateEvent;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract NullifierRegistry {
    error NotController(address caller);
    error NullifierAlreadyUsed(bytes32 nullifier);
    error ZeroAddress();
    error EmptyNullifier();

    address public controller;
    mapping(bytes32 => bool) public usedNullifiers;

    event ControllerChanged(address indexed controller);
    event NullifierUsed(bytes32 indexed nullifier, address indexed caller);

    constructor(address initialController) {
        if (initialController == address(0)) {
            revert ZeroAddress();
        }

        controller = initialController;
        emit ControllerChanged(initialController);
    }

    modifier onlyController() {
        if (msg.sender != controller) {
            revert NotController(msg.sender);
        }
        _;
    }

    function setController(address nextController) external onlyController {
        if (nextController == address(0)) {
            revert ZeroAddress();
        }

        controller = nextController;
        emit ControllerChanged(nextController);
    }

    function useNullifier(bytes32 nullifier) external onlyController {
        if (nullifier == bytes32(0)) {
            revert EmptyNullifier();
        }
        if (usedNullifiers[nullifier]) {
            revert NullifierAlreadyUsed(nullifier);
        }

        usedNullifiers[nullifier] = true;
        emit NullifierUsed(nullifier, msg.sender);
    }
}

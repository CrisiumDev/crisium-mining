// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.6.0) (token/ERC721/extensions/draft-ERC721Votes.sol)

pragma solidity 0.8.10;

import "../IMissionChecker.sol";

/**
 * @title MockMissionChecker
 * @dev An IMissionChecker that allows the boolean evaluation to be set in advance
 * (the same evaluation will be given until this setting is changed). For ease of
 * use there are no access restrictions on the `setComplete` call.
 */
contract MockMissionChecker is IMissionChecker {
    bool result;

    constructor() {

    }

    function setResult(bool _result) public {
        result = _result;
    }

    function checkMission(
        address,
        uint256[] calldata,
        address,
        uint256[] calldata,
        address,
        uint256[] calldata
    ) external view returns (bool) {
        return result;
    }
}

// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

/**
 * @title A validity/completeness checker for staked or candidate mining missions.
 * @dev
 */
interface IMissionChecker {

    /**
     * Check the specified mission according to the Checker's internal standard,
     * returning whether it passes. The meaning of the return value depends on
     * the purpose of the Checker, e.g. to evaluate validity, completeness, etc.
     */
    function checkMission(
        address landerToken,
        uint256[] calldata landers,
        address landingSiteToken,
        uint256[] calldata landingSites,
        address payloadToken,
        uint256[] calldata payloads
    ) external view returns (bool);

}

// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @title A value appraiser for non-fungible tokens (e.g. ERC721, ERC1155)
 * @dev Appraises (reports value) tokenIds for specific token contracts,
 * reporting a value for each tokenId. The definition of this "appraisal"
 * varies by context; it may be exchange value in a reference currency,
 * staking power in a mining contract, etc.
 */
interface INFTAppraiser {

    /**
     * @dev Whether the appraiser supports the indicated token contract.
     * If true, `appraisalOf` will not fail.
     */
    function appraises(address token) external view returns (bool);

    /**
     * @dev Provides a value appraisal for the indicated token. Behavior for
     * unsupported tokens is unspecified; however, if `appraises(token)` is true,
     * this function should not fail.
     */
    function appraisalOf(address token, uint256 tokenId) external view returns (uint256 appraisal);

    /**
     * @dev Provides a value appraisal for the indicated token. Behavior for
     * unsupported tokens is unspecified; however, if `appraises(token)` is true,
     * this function should not fail.
     */
    function appraisalsOf(address _token, uint256[] calldata _tokenIds) external view returns (uint256[] memory);

    /**
     * @dev Provides a value appraisal for the indicated token and returns the total.
     * Behavior for unsupported tokens is unspecified; however, if `appraises(token)` is true,
     * this function should not fail.
     */
    function totalAppraisalOf(address _token, uint256[] calldata _tokenIds) external view returns (uint256 appraisal);
}

// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

/**
 * @title IERC20Faucet
 * @dev This interface allows ERC20 tokens to be allocated and released to recipients.
 * The specific rules governing distribution are left to implementations --
 * a fixed sum being divided up, a minting process with a rate limiter, etc.
 *
 * Faucets use a "pull" model, with the recipient making the call, but also
 * include "push" calls when a 3rd party pushes funds from the faucet to another
 * recipient. Depending on context, "push" may or may not be supported.
 */
interface IERC20Faucet {
    /**
     * @dev Logs the release of funds from the faucet.
     */
    event Released(address indexed from, address indexed to, uint256 amount);

    /**
     * @dev The ERC20 token this faucet releases.
     */
    function token() external view returns (address);

    /**
     * @dev Query the total quantity of tokens released by this faucet.
     */
    function totalReleased() external view returns (uint256);
    /**
     * @dev Query the amount of tokens already released from the indicated amount.
     */
    function released(address from) external view returns (uint256);

    /**
     * @dev Query the amount of tokens releasable from the indicated account.
     */
    function releasable(address from) external view returns (uint256);

    /**
     * @dev Release all owed tokens from the indicated account, sending them to
     * the designated address. Depending on the faucet design, `from` and/or
     * `to` may need to be the message sender.
     */
    function release(address from, address to) external returns (uint256);

    /**
     * @dev Release the indicated token quantity from the indicated account, sending it to
     * the designated address. Depending on the faucet design, `from` and/or
     * `to` may need to be the message sender. If `amount` exceeds {releasable},
     *
     */
    function release(address from, address to, uint256 amount) external;
}

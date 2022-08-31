// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.6.0) (token/ERC721/extensions/draft-ERC721Votes.sol)

pragma solidity 0.8.10;

import "../IERC20Faucet.sol";

/**
 * @title BaseERC20Faucet
 * @dev An abstract IERC20Faucet implementation that handles most bookkeeping,
 * allowing subcontracts to implement transfers (e.g. transfers of held tokens,
 * minting of new ones, etc.). Subcontracts must also implement {_allocated},
 * indicating the total lifetime amount allocated to a given account (subtracting
 * {released} from this gives {releasable}).
 */
abstract contract BaseERC20Faucet is IERC20Faucet {

    uint256 private _totalReleased;
    mapping(address => uint256) private _released;

    function totalReleased() public view override returns (uint256) {
        return _totalReleased;
    }

    function released(address from) public view override returns (uint256) {
        return _released[from];
    }

    /**
     * @dev Query the amount of tokens releasable from the indicated account.
     */
    function releasable(address from) external view override returns (uint256) {
        return _allocated(from) - _released[from];
    }

    /**
     * @dev Release all owed tokens from the indicated account, sending them to
     * the designated address. Depending on the faucet design, `from` and/or
     * `to` may need to be the message sender.
     */
    function release(address from, address to) external override returns (uint256 amount) {
        _update();
        _updateRecipient(from);

        amount = _allocated(from) - _released[from];
        _release(from, to, amount);
    }

    /**
     * @dev Release the indicated token quantity from the indicated account, sending it to
     * the designated address. Depending on the faucet design, `from` and/or
     * `to` may need to be the message sender. If `amount` exceeds {releasable},
     *
     */
    function release(address from, address to, uint256 amount) public override {
        _update();
        _updateRecipient(from);

        uint256 available = _allocated(from) - _released[from];
        require(available >= amount, "BaseERC20Faucet: Insufficient releasable allocation");

        _release(from, to, amount);
    }

    function _release(address from, address to, uint256 amount) private {
        require(
            _canRelease(msg.sender, from, to, amount),
            "BaseERC20Faucet: Not authorized to release"
        );

        _transfer(from, to, amount);
        _released[from] += amount;
        _totalReleased += amount;
        emit Released(from, to, amount);
    }

    /**
     * @dev Return whether the indicated account `user` is permitted to release that quantity
     * of tokens from the indicated account `from` to the indicated account `to`.
     * Assume that `amount` is within the valid allocation for account `from`, but
     * other limits may apply based on message sender and recipient.
     *
     * It is acceptable for this function to return a `true/false` response. It is
     * also acceptable, for non-allowed calls where `false` would be  returned,
     * to instead revert with an appropriate error message.
     */
    function _canRelease(address user, address from, address to, uint256 amount) internal view virtual returns (bool);

    /**
     * @dev Returns the total quantity of tokens allocated to the indicated account,
     * both released and not.
     */
    function _allocated(address from) internal view virtual returns (uint256);

    /**
     * @dev Transfer `amount` tokens to address `to`.
     */
    function _transfer(address from, address to, uint256 amount) internal virtual;

    /**
     * @dev Perform any internal updates, e.g. in response to block number changes.
     */
    function _update() internal virtual;

    /**
     * @dev Perform any internal updates in  bookkeeping for the indicated recipient
     * e.g. in response to block number changes.
     */
    function _updateRecipient(address from) internal virtual;
}

// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.6.0) (token/ERC721/extensions/draft-ERC721Votes.sol)

pragma solidity 0.8.10;

import "../base/BaseERC20Faucet.sol";
import "../IERC20Token.sol";

/**
 * @title MockERC20Faucet
 * @dev An ERC20Faucet that allows manual allocation of funds. As a Mock faucet,
 * has no access restrictions (anyone can allocate or release arbitrary amounts,\
 * for ease of use).
 */
contract MockERC20Faucet is BaseERC20Faucet {

    address public override token;
    mapping(address => uint256) private _owed;

    constructor(
        address _token
    ) BaseERC20Faucet() {
        token = _token;
    }

    function setOwed(address _addr, uint256 _amount) public {
        _owed[_addr] = _amount;
    }

    function addOwed(address _addr, uint256 _amount) public {
        _owed[_addr] += _amount;
    }

    function setAllocated(address _addr, uint256 _amount) public {
        _owed[_addr] = _amount - released(_addr);
    }

    function addAllocated(address _addr, uint256 _amount) public {
        _owed[_addr] += _amount;
    }

    function _canRelease(address, address, address, uint256) internal pure override returns (bool) {
        return true;
    }

    /**
     * @dev Returns the total quantity of tokens allocated to the indicated account,
     * both released and not.
     */
    function _allocated(address from) internal view override returns (uint256) {
        return released(from) + _owed[from];
    }

    /**
     * @dev Transfer `amount` tokens to address `to`.
     */
    function _transfer(address from, address to, uint256 amount) internal override {
        _owed[from] -= amount;
        IERC20Token(token).transfer(to, amount);
    }

    /**
     * @dev Perform any internal updates, e.g. in response to block number changes.
     */
    function _update() internal override {
        // nothing to do
    }

    /**
     * @dev Perform any internal updates in  bookkeeping for the indicated recipient
     * e.g. in response to block number changes.
     */
    function _updateRecipient(address) internal override {
        // nothing to do
    }
}

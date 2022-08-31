// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.6.0) (token/ERC721/extensions/draft-ERC721Votes.sol)

pragma solidity 0.8.10;

import "../base/BaseDripShareERC20Faucet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DripShareERC20Faucet
 * @dev An ERC20Faucet that allocates from its own balance of ERC20 tokens, dividing
 * them between a small number of accounts according to set allocation shares.
 * Is Owned: the owner can update drip rate, recipients, and even impose a
 * temporary "pause" by setting new "startBlocks" (if already started, this
 * retains already allocated funds but does not release more until that block
 * is reached).
 *
 * Note that anyone can transfer ERC20 tokens into the faucet, but this does
 * not affect the drip rate, only how long the rate can be maintained. Depositing
 * funds into an empty faucet can cause a sudden surge of tokens; to avoid this,
 * use `fund(from, amount)` which transfers tokens into the Faucet and update()s
 * at the same time.
 *
 * If too much is deposited in the faucet, or planned drip periods / total released amount
 * changes, the owner may retrieve any unallocated funds (funds may be allocated but
 * not yet released) using `defund`. Note that the Owner already has a techincal
 * ability to retrieve these funds by updating recipients and drip rate, so adding
 * this function does not grant additional power to the Owner.
 */
contract DripShareERC20Faucet is BaseDripShareERC20Faucet, Ownable {
    constructor(
        address _token,
        uint256 _tokensPerBlock,
        uint256 _startBlock,
        address[] memory _recipients,
        uint256[] memory _shares
    ) BaseDripShareERC20Faucet(_token, _tokensPerBlock, _startBlock, _recipients, _shares) {
        // nothing else to do
    }

    /**
     * Manually update all bookkeeping.
     */
    function update() external {
        _updateAll();
    }

    function fund(address from, uint256 amount) external {
        _updateAll();
        IERC20Token(token).transferFrom(from, address(this), amount);
    }

    function defund(address to) external onlyOwner {
        uint256 funded = IERC20Token(token).balanceOf(address(this)) + totalReleased();
        uint256 reserved = totalAllocated();
        if (funded > reserved) {
            IERC20Token(token).transfer(to, funded - reserved);
        }
    }

    function defund(address to, uint256 amount) external onlyOwner {
        uint256 funded = IERC20Token(token).balanceOf(address(this)) + totalReleased();
        uint256 reserved = totalAllocated();
        require(funded >= reserved + amount, "DripShareERC20Faucet: insufficient funds");
        IERC20Token(token).transfer(to, amount);
    }

    /**
     * @dev Sets the start block for the faucet. If in the past, equivalent to
     * setting it to the current block. If in the future, the faucet will be
     * paused until that block is reached (does not "reclaim" tokens already allocated).
     */
    function setStartBlock(uint256 startBlock) external onlyOwner {
        _setStartBlock(startBlock);
    }

    /**
     * @dev Set the drip rate: tokens per block.
     */
    function setTokensPerBlock(uint256 _tokensPerBlock) external onlyOwner {
        _setTokensPerBlock(_tokensPerBlock);
    }

    /**
     * @dev Set the recipients and shares.
     */
    function setRecipients(address[] memory recipients, uint256[] memory shares) external onlyOwner {
        _setRecipients(recipients, shares);
    }

    /**
     * @dev Update the shares set for this recipient.
     */
    function setRecipientShares(address recipient, uint256 shares) external onlyOwner {
        _setRecipientShares(recipient, shares);
    }

    /**
     * @dev To aid recipient bookkeeping, recipients can pull their own funds
     * (to anywhere). Owners can also push, but only to the intended recipient,
     * not others.
     */
    function _canRelease(address user, address from, address to, uint256) internal view override returns (bool) {
        return (user == from) || (user == owner() && from == to);
    }
}

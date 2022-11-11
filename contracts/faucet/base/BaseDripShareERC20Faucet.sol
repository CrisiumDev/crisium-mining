// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.6.0) (token/ERC721/extensions/draft-ERC721Votes.sol)

pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./BaseERC20Faucet.sol";

/**
 * @title BaseDripShareERC20Faucet
 * @dev An ERC20Faucet that allocates from its own balance of ERC20 tokens, dividing
 * them between a small number of accounts according to set allocation shares.
 *
 * WARNING: do not fund the Faucet by transferring ERC20 tokens, especially after
 * allocation has begun. This will result in inconsistent allocation rates and
 * possibly non-proportional allocations among recipients. Instead, use
 * {fund}, which transfers tokens and simultaneously supdates internal bookkeeping.
 */
abstract contract BaseDripShareERC20Faucet is BaseERC20Faucet {
    using SafeERC20 for IERC20;

    uint256 private constant PRECISION = 1e20;

    // Info of each faucet target.
    struct RecipientInfo {
      uint256 shares;                       // ERC20 share
      uint256 allocated;                    // tokens owed to this target from before lastUpdateBlock
      uint256 totalAllocatedAtLastUpdate;   // value of `totalAllocate` in `lastUpdateBlock`
      uint256 lastUpdateBlock;              // last block this target received Rara or updated allocation
      uint256 activeRecipientsIndex;        // index into activeRecipients where this recipient is listed (if shares > 0)
    }

    address public override immutable token;
    uint256 public tokensPerBlock;    // drip rate

    uint256 public totalShares;
    uint256 public lastUpdateBlock;
    uint256 private _totalAllocated;

    mapping(address => RecipientInfo) public recipientInfo;
    address[] public activeRecipients;


    constructor(
        address _token,
        uint256 _tokensPerBlock,
        uint256 _startBlock,
        address[] memory _recipients,
        uint256[] memory _shares
    ) {
        token = _token;
        tokensPerBlock = _tokensPerBlock;
        lastUpdateBlock = _startBlock > block.number ? _startBlock : block.number;
        _setRecipients(_recipients, _shares);
    }

    function activeRecipientCount() external view returns (uint256) {
        return activeRecipients.length;
    }

    function totalAllocated() public view returns (uint256 amount) {
        amount = _totalAllocated;
        if (totalShares > 0 && block.number > lastUpdateBlock) {
            amount += tokensPerBlock * (block.number - lastUpdateBlock);
            uint256 available = IERC20(token).balanceOf(address(this)) + totalReleased();
            if (amount > available) {
                amount = available;
            }
        }
    }

    /**
     * @dev Returns the total quantity of tokens allocated to the indicated account,
     * both released and not.
     */
    function _allocated(address from) internal view override returns (uint256 amount) {
        RecipientInfo storage info = recipientInfo[from];
        amount = info.allocated;
        if (info.shares > 0 && block.number > info.lastUpdateBlock) {
            uint256 total = totalAllocated();
            if (info.totalAllocatedAtLastUpdate < total) {
                uint256 delta = total - info.totalAllocatedAtLastUpdate;
                amount += (delta * info.shares * PRECISION) / (totalShares * PRECISION);
            }
        }
    }

    /**
     * @dev Transfer `amount` tokens to address `to`.
     */
    function _transfer(address from, address to, uint256 amount) internal override {
        _updateRecipient(from);
        IERC20(token).safeTransfer(to, amount);
    }

    function _update() internal override {
        if (block.number > lastUpdateBlock) {
            _totalAllocated = totalAllocated();
            lastUpdateBlock = block.number;
        }
    }

    function _updateRecipient(address recipient) internal override {
        RecipientInfo storage info = recipientInfo[recipient];
        if (info.shares > 0 && lastUpdateBlock > info.lastUpdateBlock) {
            info.allocated = _allocated(recipient);
            info.totalAllocatedAtLastUpdate = _totalAllocated;
            info.lastUpdateBlock = block.number;
        }
    }

    function _updateAll() internal {
        _update();
        for (uint256 i = 0; i < activeRecipients.length; i++) {
            _updateRecipient(activeRecipients[i]);
        }
    }

    /**
     * @dev Sets the start block for the faucet. If in the past, equivalent to
     * setting it to the current block. If in the future, the faucet will be
     * paused until that block is reached (does not "reclaim" tokens already allocated).
     */
    function _setStartBlock(uint256 startBlock) internal {
        // update all: note any allocated funds
        _updateAll();

        // manually update update blocks, including recipients'
        lastUpdateBlock = startBlock > block.number ? startBlock : block.number;
        for (uint256 i = 0; i < activeRecipients.length; i++) {
            address recipient = activeRecipients[i];
            recipientInfo[recipient].totalAllocatedAtLastUpdate = _totalAllocated;
            recipientInfo[recipient].lastUpdateBlock = lastUpdateBlock;
        }
    }

    /**
     * @dev Set the drip rate: tokens per block.
     */
    function _setTokensPerBlock(uint256 _tokensPerBlock) internal {
        _updateAll();
        tokensPerBlock = _tokensPerBlock;
    }

    /**
     * @dev Set the recipients and shares.
     */
    function _setRecipients(address[] memory recipients, uint256[] memory shares) internal {
        require(recipients.length == shares.length, "BaseDripShareERC20Faucet: arrays must match length");
        _updateAll();

        // remove previous recipients...
        while (activeRecipients.length > 0) {
            RecipientInfo storage info = recipientInfo[activeRecipients[activeRecipients.length - 1]];
            info.shares = 0;
            info.activeRecipientsIndex = 0;
            activeRecipients.pop();
        }

        uint256 total = 0;
        for (uint i = 0; i < recipients.length; i++) {
            RecipientInfo storage info = recipientInfo[recipients[i]];

            require(shares[i] > 0, "BaseDripShareERC20Faucet: recipients must have nonzero shares");
            require(info.shares == 0, "BaseDripShareERC20Faucet: recipients must not repeat");
            info.shares = shares[i];
            info.lastUpdateBlock = lastUpdateBlock;
            info.totalAllocatedAtLastUpdate = _totalAllocated;
            info.activeRecipientsIndex = activeRecipients.length;
            activeRecipients.push(recipients[i]);
            total += shares[i];
        }
        totalShares = total;
    }

    /**
     * @dev Update the shares set for this recipient.
     */
    function _setRecipientShares(address recipient, uint256 shares) internal {
        _updateAll();

        RecipientInfo storage info = recipientInfo[recipient];

        bool added = info.shares == 0 && shares > 0;
        bool removed = info.shares > 0 && shares == 0;

        totalShares = (totalShares + shares) - info.shares;
        info.shares = shares;

        if (added) {
            // add to activeRecipients and update
            info.totalAllocatedAtLastUpdate = _totalAllocated;
            info.lastUpdateBlock = lastUpdateBlock;
            info.activeRecipientsIndex = activeRecipients.length;
            activeRecipients.push(recipient);
        } else if (removed) {
            // remove from activeRecipients (replace with final entry)
            address replacementAddr = activeRecipients[activeRecipients.length - 1];
            RecipientInfo storage replacement = recipientInfo[replacementAddr];

            activeRecipients[info.activeRecipientsIndex] = replacementAddr;
            activeRecipients.pop();

            replacement.activeRecipientsIndex = info.activeRecipientsIndex;
            info.activeRecipientsIndex = 0;
        }
    }
}

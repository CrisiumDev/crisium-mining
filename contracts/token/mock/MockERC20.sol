import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

pragma solidity ^0.8.0;
contract MockERC20 is ERC20 {
    constructor(
        string memory name,
        string memory symbol,
        uint256 supply
    ) ERC20(name, symbol) {
        _mint(msg.sender, supply);
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}

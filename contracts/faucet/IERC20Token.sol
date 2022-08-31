pragma solidity 0.8.10;

/**
 * @title IERC20Token
 * @dev A thinner, feature-sparse ERC20 interface useful for ERC20Faucets to refer
 * to. It is expected that these functions are all that is needed to implement
 * a faucet; if not, feel free to extend, but you probably don't need he entire
 * interface available.
 */
interface IERC20Token {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

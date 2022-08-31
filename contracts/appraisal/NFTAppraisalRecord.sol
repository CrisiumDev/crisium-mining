// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./INFTAppraiser.sol";
import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title A value appraiser for non-fungible tokens (e.g. ERC721, ERC1155)
 * @dev Appraises (reports value) tokenIds for specific token contracts,
 * reporting a value for each tokenId. The definition of this "appraisal"
 * varies by context; it may be exchange value in a reference currency,
 * staking power in a mining contract, etc.
 *
 * An NFTAppraisalRecord reports stored appraisal values, set by an external
 * appraiser.
 */
contract NFTAppraisalRecord is Context, ERC165, AccessControlEnumerable, INFTAppraiser {

    struct ContractInfo {
        uint256 defaultAppraisal;
        bool appraises;
    }

    struct TokenInfo {
        uint256 appraisal;
        bool recorded;
    }

    bytes32 public constant RECORDER_ROLE = keccak256("RECORDER_ROLE");

    mapping(address => ContractInfo) public contractInfo;
    mapping(address => mapping(uint256 => TokenInfo)) public tokenInfo;

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(RECORDER_ROLE, _msgSender());
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, AccessControlEnumerable) returns (bool) {
        return
            interfaceId == type(INFTAppraiser).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function appraises(address _token) external view override virtual returns (bool) {
        return contractInfo[_token].appraises;
    }

    function appraisalOf(address _token, uint256 _tokenId) public view override virtual returns (uint256) {
        ContractInfo storage cinfo = contractInfo[_token];
        require(cinfo.appraises, "NFTAppraisalRecord: invalid token address");

        TokenInfo storage info = tokenInfo[_token][_tokenId];
        return info.recorded ? info.appraisal : cinfo.defaultAppraisal;
    }

    function appraisalsOf(address _token, uint256[] calldata _tokenIds) public view override virtual returns (uint256[] memory) {
        uint256[] memory appraisals = new uint256[](_tokenIds.length);

        ContractInfo storage cinfo = contractInfo[_token];
        require(cinfo.appraises, "NFTAppraisalRecord: invalid token address");

        for (uint256 i = 0; i < _tokenIds.length; i++) {
            TokenInfo storage info = tokenInfo[_token][_tokenIds[i]];
            appraisals[i] = info.recorded ? info.appraisal : cinfo.defaultAppraisal;
        }
        return appraisals;
    }

    function totalAppraisalOf(address _token, uint256[] calldata  _tokenIds) public view override virtual returns (uint256) {
        uint256 total = 0;
        ContractInfo storage cinfo = contractInfo[_token];
        require(cinfo.appraises, "NFTAppraisalRecord: invalid token address");

        for (uint256 i = 0; i < _tokenIds.length; i++) {
            TokenInfo storage info = tokenInfo[_token][_tokenIds[i]];
            total += info.recorded ? info.appraisal : cinfo.defaultAppraisal;
        }
        return total;
    }

    function setAppraises(address _token, bool _appraises, uint256 _defaultAppraisal) external {
        require(hasRole(RECORDER_ROLE, _msgSender()), "NFTAppraisalRecord: must have recorder role to set appraises");
        ContractInfo storage cinfo =  contractInfo[_token];
        cinfo.appraises = _appraises;
        cinfo.defaultAppraisal = _defaultAppraisal;
    }

    function setAppraisal(address _token, uint256 _tokenId, bool _record, uint256 _appraisal) external {
        require(hasRole(RECORDER_ROLE, _msgSender()), "NFTAppraisalRecord: must have recorder role to set appraisal");
        TokenInfo storage info = tokenInfo[_token][_tokenId];
        info.appraisal =  _appraisal;
        info.recorded  = _record;
    }

    function setAppraisals(address _token, uint256[] calldata _tokenIds, uint256[] calldata _appraisals) external {
        require(hasRole(RECORDER_ROLE, _msgSender()), "NFTAppraisalRecord: must have recorder role to set appraisal");
        require(
            _tokenIds.length == _appraisals.length || _appraisals.length == 1,
            "NFTAppraisalRecord: array lengths must match or _appraisals must have length 1"
        );

        for (uint256 i = 0; i < _tokenIds.length; i++) {
            uint256 appraisal = _appraisals.length == 1 ? _appraisals[0] : _appraisals[i];
            TokenInfo storage info = tokenInfo[_token][_tokenIds[i]];
            info.appraisal =  appraisal;
            info.recorded = true;
        }
    }

    function unsetAppraisals(address _token, uint256[] calldata _tokenIds) external {
        require(hasRole(RECORDER_ROLE, _msgSender()), "NFTAppraisalRecord: must have recorder role to set appraisal");

        for (uint256 i = 0; i < _tokenIds.length; i++) {
            TokenInfo storage info = tokenInfo[_token][_tokenIds[i]];
            info.appraisal =  0;
            info.recorded = false;
        }
    }

}

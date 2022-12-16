// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "./IMissionChecker.sol";
import "../faucet/IERC20Faucet.sol";
import "../appraisal/INFTAppraiser.sol";

interface IERC721Token {
    function transferFrom(address from, address to, uint256 tokenId) external;
}

interface IERC20Token {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
}

/**
 * @title IMSpaceMissionMining
 * @dev A mining contract allowing users to stake IMSpace mission tokens in sets,
 * which are evaluated for mining power based on mission composition. Valid
 * missions are: 1 Lander, 0 or 1 Landing Sites, and 0..N Payloads.
 *
 * Mining rate is controlled externally, via an IERC20Faucet; any funds received
 * are proportionally divided among all staked users according to the total
 * mining power of their staked missions. For consistency, this contract implements
 * the IERC20Faucet interface for querying or retrieving rewards.
 */
contract IMSpaceMissionMining is Context, AccessControlEnumerable, Pausable, IERC20Faucet {
    using SafeCast for uint256;
    using SafeCast for int256;

    uint256 private constant PRECISION = 1e20;

    // Role capable of withdrawing excess funds and set token addresses
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    uint256 public constant MAX_PAYLOADS = 8;

    /// @notice Info of each user who is or has previously staked a mission
    struct UserInfo {
        uint256 miningPower;
        uint256 released;
        int256 rewardDebt;
    }

    /// @notice Info of mission that is or has been staked
    struct MissionInfo {
        // mission details
        address user;
        uint256 miningPower;
        uint256[] landers;
        uint256[] landingSites;
        uint256[] payloads;
        uint256 userMissionsIndex;
        uint256 stakedMissionsIndex;
        // staking status
        bool staked;
        uint256 stakedBlock;
        uint256 stakedTime;
        uint256 unstakedBlock;
        uint256 unstakedTime;
    }

    /// @notice Address of Crisium token contract.
    address public immutable token;
    uint256 private _totalMined;   // totalMined() includes to-be-received from faucet
    /// @notice Total amount of Crisium released to miners
    uint256 public override totalReleased;

    /// @notice Accumulated reward per unit of Mining Power
    uint256 public accRewardPerMP;
    /// @notice Total Mining Power currently staked
    uint256 public totalMiningPower;

    /// @notice Address of the Lander NFT
    address public landerToken;
    /// @notice Address of the Landing Site NFT
    address public landingSiteToken;
    /// @notice Address of the Payload NFT
    address public payloadToken;

    /// @notice Address of originating faucet
    IERC20Faucet public immutable faucet;
    /// @notice Address of mission appraiser and mission tokens
    INFTAppraiser public appraiser;
    /// @notice Address of mission completeness checker (if zero, default check used)
    IMissionChecker public completeMissionChecker;
    uint256 private completeMissionMultiplierPrec = PRECISION;

    /// @notice Info of each current and former mission staker
    mapping (address => UserInfo) public userInfo;
    /// @notice Mission IDs currently staked by each user
    mapping (address => uint256[]) public userMissions;

    /// @notice Info of each mission
    MissionInfo[] public missionInfo;
    /// @notice Info of each currently staked mission
    uint256[] public stakedMissions;

    event MissionLaunched(address user, uint256 indexed missionId, address indexed to, uint256 miningPower);
    event MissionRecalled(address user, uint256 indexed missionId, address indexed to, uint256 miningPower);
    event MissionAppraised(uint256 indexed missionId, address indexed to, uint256 previousMiningPower, uint256 miningPower);
    event MissionAppraiserChanged(address indexed previousAppraiser, address indexed appraiser);
    event MissionCompleteCheckerChanged(address indexed previousChecker, address checker);
    event MissionCompleteMultiplierUpdated(uint256 numerator, uint256 denominator);

    /// @param _token The reward token address
    /// @param _faucet The faucet address
    /// @param _appraiser The mission token appraiser address
    constructor(address _token, IERC20Faucet _faucet, INFTAppraiser _appraiser) {
        token = _token;
        faucet = _faucet;
        appraiser = _appraiser;

        // require a contract for _token, as low-level "call" is used
        require(_token.code.length > 0, "IMSMM: _token not a contract");

        // set up roles
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());   // admin; can add/remove managers
        _setupRole(MANAGER_ROLE, _msgSender());         // manager; can withdraw excess funds

        emit MissionAppraiserChanged(address(0), address(_appraiser));
    }

    // *******************************
    // IERC20 Faucet Implementation

    /**
     * @notice The total quantity of tokens mined from this contract, so far.
     * Includes tokens not yet released, and those available from the source faucet.
     */
    function totalMined() external view returns (uint256 amount) {
        amount = _totalMined;
        if (!paused() && totalMiningPower > 0) {
            amount += faucet.releasable(address(this));
        }
    }

    /**
     * @notice The quantity of mining token rewards released for the indicated mining user.
     */
    function released(address _user) external view override returns (uint256 amount) {
        amount = userInfo[_user].released;
    }

    /**
     * @notice Query the amount of tokens releasable from the indicated account.
     */
    function releasable(address _user) external view override returns (uint256 amount) {
        UserInfo storage user = userInfo[_user];
        uint256 rewardPerMP = accRewardPerMP;

        uint256 additionalReward = paused() ? 0 : faucet.releasable(address(this));
        if (additionalReward > 0 && totalMiningPower > 0) {
            rewardPerMP += (additionalReward * PRECISION) / totalMiningPower;
        }

        amount = (
            ((user.miningPower * rewardPerMP) / PRECISION).toInt256() - user.rewardDebt
        ).toUint256();
    }

    /**
     * @notice Release mining rewards from the indicated user, sending them `to`
     * the specified address.
     *
     * Condition: the caller must be `from`. This function signature is derived
     * from the IERC20Faucet interface.
     */
    function release(address from, address to) external override returns (uint256 amount) {
        require(_msgSender() == from, "IMSMM: !auth");
        update();

        // calculate reward pending
        UserInfo storage user = userInfo[from];
        amount = _releaseAmount(user);

        _release(user, from, to, amount);
    }

    /**
     * @notice Release mining rewards from the indicated user, sending them `to`
     * the specified address.
     *
     * Condition: the caller must be `from`. This function signature is derived
     * from the IERC20Faucet interface.
     */
    function release(address from, address to, uint256 amount) external override {
        require(_msgSender() == from, "IMSMM: !auth");
        update();

        // calculate reward pending
        UserInfo storage user = userInfo[from];
        uint256 pendingReward = _releaseAmount(user);

        require(amount <= pendingReward, "IMSMM: amount > releasable");
        _release(user, from, to, amount);
    }

    /**
     * Calculate and return the reward amount that could be released for this
     * user at the present moment (without fetching more tokens from the faucet).
     */
    function _releaseAmount(UserInfo storage user) internal view returns (uint256) {
        return (
            ((user.miningPower * accRewardPerMP)  / PRECISION).toInt256() - user.rewardDebt
        ).toUint256();
    }

    /**
     * Release the indicated token quantity from the indicated user, transferring
     * it to `to`.
     *
     * Precondition: `amount` is no more than `releaseAmount(user)`, the reward
     * available to that user at this time.
     */
    function _release(UserInfo storage user, address from, address to, uint256 amount) internal {
        // update internal records
        user.rewardDebt += amount.toInt256();
        user.released += amount;
        totalReleased += amount;

        if (amount > 0) {
            _safeTransfer(to, amount);
        }

        emit Released(from, to, amount);
    }

    // *******************************
    // Manager Controls

    /**
     * @notice Transfer any "excess" funds to the specified address. Any tokens
     * received by this contract from sources other than the faucet, or released
     * from the faucet while no users were mining, are considered "excess".
     *
     * Only the managers may make this call.
     */
    function transferExcess(address to) external onlyManager {
        update();

        // excess funds should be zero, but it's possible for tokens to be
        // transferred into this contract accidentally, or for the faucet to
        // allocate funds before any's mission tokens are staked
        uint256 balance = IERC20Token(token).balanceOf(address(this));
        uint256 amount = (balance + totalReleased) - _totalMined;
        _safeTransfer(to, amount);
    }

    /**
     * @notice Set the Lander token address. May only be called once, and only
     * by a manager.
     */
    function setMissionLanderToken(address _token) external onlyManager onlyUnset(landerToken) {
        landerToken = _token;
    }

    /**
     * @notice Set the Landing Site token address. May only be called once, and only
     * by a manager.
     */
    function setMissionLandingSiteToken(address _token) external onlyManager onlyUnset(landingSiteToken) {
        landingSiteToken = _token;
    }

    /**
     * @notice Set the Payload token address. May only be called once, and only
     * by a manager.
     */
    function setMissionPayloadToken(address _token) external onlyManager onlyUnset(payloadToken) {
        payloadToken = _token;
    }

    /**
     * @notice Updates the INFTAppraiser address, used to assess the value of staked
     * mission components. Only callable by a manager. Does not automatically update
     * the mining power of currently-staked missions.
     */
    function setAppraiser(INFTAppraiser _appraiser) external onlyManager {
        address previousAppraiser = address(appraiser);
        appraiser = _appraiser;
        emit MissionAppraiserChanged(previousAppraiser, address(appraiser));
    }

    /**
     * @notice Updates the IMissionChecker address used to check for mission completeness.
     * Complete missions receive a mining bonus, applied as a multiplier against
     *
     */
    function setMissionCompleteChecker(IMissionChecker _checker) external onlyManager {
        address previousChecker = address(completeMissionChecker);
        completeMissionChecker = address(_checker) == address(this) ? IMissionChecker(address(0)) : _checker;
        emit MissionCompleteCheckerChanged(previousChecker, address(completeMissionChecker));
    }

    /**
     * @notice Updates the mining power multiplier applied to "complete" missions,
     * those which have at least one of each component type. Only callable by a manager.
     * Does not automatically update the mining power of currently-staked missions.
     */
    function setMissionCompleteMultiplier(uint256 numerator, uint256 denominator) external onlyManager {
        require(numerator >= denominator, "IMSMM: ratio not >= 1");
        completeMissionMultiplierPrec = (numerator * PRECISION) / denominator;
        emit MissionCompleteMultiplierUpdated(numerator, denominator);
    }

    /**
     * @notice Pauses mining.
     *
     * Effects: no additional reward tokens will be accumulated by this contract
     * while paused, although any rewards accumulated up to this point will remain
     * retrievable. While paused, new missions cannot be staked; however, any
     * already staked mission may be recalled or reappraised.
     *
     * Intended use: when adjusting mining power (by changes to the INFTAppraiser
     * or complete mission multiplier) pause mining, make the necessary changes
     * and `reappraiseMission` for all staked missions, then unpause.
     *
     * Only callable by a manager.
     */
    function pause() external onlyManager {
        update();
        _pause();
    }

    /**
     * @notice Unpauses mining.
     *
     * Effects: any mining reward accumulating during the paused state will become
     * retrievable (as if mining had continued during pause), divided proportionally
     * based on current mining power (not mining power at time of pause). New missions
     * again become launchable.
     *
     * Only callable by a manager.
     */
    function unpause() external onlyManager {
        _unpause();
        update();
    }

    modifier onlyManager() {
        require(hasRole(MANAGER_ROLE, _msgSender()), "IMSMM: !auth");
        _;
    }

    modifier onlyUnset(address addr) {
        require(addr == address(0), "IMSMM: already set");
        _;
    }

    // *******************************
    // Missions

    /// @notice Returns the number of missions launched (length of  `missionInfo`).
    function missionCount() external view returns (uint256 missions) {
        missions = missionInfo.length;
    }

    /// @notice Returns the number of missions currently staked (length of `stakedMissions`).
    function stakedMissionCount() external view returns (uint256 missions) {
        missions = stakedMissions.length;
    }

    /// @notice Returns the number of missions staked by the indicated user (length of `userMissions`).
    function userMissionCount(address user) external view returns (uint256 missions) {
        missions = userMissions[user].length;
    }

    /// @notice Returns the status of the mission: owner, mining power, staking status
    /// and staking period.
    /// @param user The user who staked this mission
    /// @param miningPower The mining power of this mission, as of its last audit
    /// @param staked Is the mission currently staked? Missions cannot be re-staked;
    ///   once unstaked, the same tokens restaked will be designated as a new mission.
    /// @param stakeDuration The number of seconds which this mission has been staked.
    ///   If `staked`, this number continuously increases; otherwise it becomes fixed.
    function missionStatus(uint256 missionId) external view returns (address user, uint256 miningPower, bool staked, uint256 stakeDuration) {
        MissionInfo storage mission = missionInfo[missionId];

        user = mission.user;
        miningPower = mission.miningPower;
        staked = mission.staked;
        stakeDuration = (mission.staked ? block.timestamp : mission.unstakedTime) - mission.stakedTime;
    }

    /// @notice Returns the tokenIds comprising the indicated mission
    /// @param landers tokenIds for lander tokens staked in the mission
    /// @param landingSites tokenIds for landing site tokens staked in the mission
    /// @param payloads tokenIds for payload tokens stsaked in the mission
    function missionTokens(uint256 missionId) external view returns (uint256[] memory landers, uint256[] memory landingSites, uint256[] memory payloads) {
        MissionInfo storage mission = missionInfo[missionId];

        landers = new uint256[](mission.landers.length);
        landingSites = new uint256[](mission.landingSites.length);
        payloads = new uint256[](mission.payloads.length);

        for (uint256 i = 0; i < mission.landers.length; i++) {
            landers[i] = mission.landers[i];
        }
        for (uint256 i = 0; i < mission.landingSites.length; i++) {
            landingSites[i] = mission.landingSites[i];
        }
        for (uint256 i = 0; i < mission.payloads.length; i++) {
            payloads[i] = mission.payloads[i];
        }
    }

    function _transferMissionNFTs(MissionInfo storage mission, address from, address to) internal {
        _transferNFTs(landerToken,  mission.landers, from, to);
        _transferNFTs(landingSiteToken, mission.landingSites, from, to);
        _transferNFTs(payloadToken, mission.payloads, from, to);
    }

    function _transferNFTs(address nftToken, uint256[] storage tokenIds, address from, address to) internal {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            IERC721Token(nftToken).transferFrom(from, to, tokenIds[i]);
        }
    }

    /// @notice Update internal state, pulling tokens from the faucet if appropriate.
    function update() public {
        if (!paused() && faucet.releasable(address(this)) > 0) {
            uint256 mined = faucet.release(address(this), address(this));

            if (totalMiningPower > 0) {
                accRewardPerMP += (mined * PRECISION) / totalMiningPower;
                _totalMined += mined;
            }
        }
    }

    /**
     * @notice Evaluate a candidate mission for staking. Returns a tuple giving
     * whether the speciied set of tokens represents a valid mission, and its
     * mining power if staked.
     */
    function evaluateMissionCandidate(uint256[] calldata landers, uint256[] calldata landingSites, uint256[] calldata payloads) public view returns (bool valid, uint256 miningPower) {
        // valid missions: must have exactly one lander, 0-1 landing sites, 0-n payloads.
        // any provided components must have a non-zero-address nft token.
        valid = true;
        if (landers.length != 1 || landerToken == address(0)) {
            valid = false;
        } else if (landingSites.length > 1) {
            valid = false;
        } else if (landingSites.length == 1 && landingSiteToken == address(0)) {
            valid = false;
        } else if (payloads.length > MAX_PAYLOADS) {
            valid = false;
        } else if (payloads.length > 0 && payloadToken == address(0)) {
            valid = false;
        }

        if (valid) {
            // mining power is the sum of all component tokens, scaled by a multiplier
            // if complete.
            miningPower = _getMissionAppraisal(landers, landingSites, payloads);
        }
    }

    /**
     * @notice Updates the appraised mining power of the indicated (staked) mission.
     * Has no effect if component appraisals and complete mission multiplier are
     * unchanged.
     *
     * Examine the return value or the emitted `MissionAppraised` event to determine
     * the newly appraised mission mining power.
     */
    function reappraiseMission(uint256 missionId) external returns (uint256 appraisal) {
        MissionInfo storage mission = missionInfo[missionId];
        UserInfo storage user = userInfo[mission.user];

        require(mission.staked, "IMSMM: mission not staked");

        update();

        uint256 previousAppraisal = mission.miningPower;
        appraisal = _getMissionAppraisal(mission.landers, mission.landingSites, mission.payloads);
        _applyAppraisal(mission, user, appraisal);
        emit MissionAppraised(missionId, mission.user, previousAppraisal, appraisal);
    }

    function _getMissionAppraisal(
        uint256[] memory landers,
        uint256[] memory landingSites,
        uint256[] memory payloads
    ) internal view returns (uint256 miningPower) {
        // mining power is the sum of all component tokens, scaled by a multiplier
        // if complete.
        miningPower = (
            _getTokenAppraisal(landerToken, landers) +
            _getTokenAppraisal(landingSiteToken, landingSites) +
            _getTokenAppraisal(payloadToken, payloads)
        );

        if (_isMissionComplete(landers, landingSites, payloads)) {
            miningPower = (miningPower * completeMissionMultiplierPrec) / PRECISION;
        }
    }

    function _applyAppraisal(MissionInfo storage mission, UserInfo storage user, uint256 appraisal) internal {
        uint256 previousAppraisal = mission.miningPower;
        int256 appraisalChange = appraisal.toInt256() - previousAppraisal.toInt256();

        mission.miningPower = appraisal;

        if (mission.staked) {
            user.miningPower = (user.miningPower + appraisal) - previousAppraisal;
            user.rewardDebt += (appraisalChange * accRewardPerMP.toInt256()) / PRECISION.toInt256();
            totalMiningPower = (totalMiningPower.toInt256() + appraisalChange).toUint256();
        }
    }

    function _getTokenAppraisal(address _token, uint256[] memory _tokenIds) internal view returns (uint256 miningPower) {
        miningPower = _tokenIds.length > 0
            ? appraiser.totalAppraisalOf(_token, _tokenIds)
            : 0;
    }

    function _isMissionComplete(
        uint256[] memory landers,
        uint256[] memory landingSites,
        uint256[] memory payloads
    ) internal view returns (bool complete) {
        // if a completeness checker is set, defer to it. Otherwise simply
        // verify that at least one of each token type is provided.
        if (address(completeMissionChecker) != address(0)) {
            return completeMissionChecker.checkMission(
                landerToken,
                landers,
                landingSiteToken,
                landingSites,
                payloadToken,
                payloads
            );
        } else {
            return landers.length > 0 && landingSites.length > 0 && payloads.length > 0;
        }
    }

    /**
     * @notice Launch a new mining mission! The provided tokenIds will be transferred
     * from the user's wallet into this contract. The mission will be credited
     * to user `to` (typically the message sender) who will have the ability
     * to harvest rewards and recall the mission.
     *
     * After this call the mining power of the launched misssion will be added
     * to `to`'s record and immediately applied to future mining rewards.
     *
     * Examine the return value and/or emitted MissionLaunched event to find the
     * new mission's missionId.
     */
    function launchMission(uint256[] calldata landers, uint256[] calldata landingSites, uint256[] calldata payloads, address to) external whenNotPaused returns (uint256 missionId) {
        update();

        (bool valid, uint256 miningPower) = evaluateMissionCandidate(landers, landingSites, payloads);
        require(valid, "IMSMM: invalid mission");

        // Make a mission
        missionId = missionInfo.length;
        missionInfo.push(MissionInfo({
            // mission details
            user: to,
            miningPower: 0,
            userMissionsIndex: userMissions[to].length,
            stakedMissionsIndex: stakedMissions.length,
            landers: landers,
            landingSites: landingSites,
            payloads: payloads,
            // staking status
            staked: true,
            stakedBlock: block.number,
            stakedTime: block.timestamp,
            unstakedBlock: 0,
            unstakedTime: 0
        }));
        stakedMissions.push(missionId);
        userMissions[to].push(missionId);

        MissionInfo storage mission = missionInfo[missionId];
        UserInfo storage user = userInfo[to];

        // Update mining power totals
        _applyAppraisal(mission, user, miningPower);

        // Transfer mission tokens
        _transferMissionNFTs(mission, _msgSender(), address(this));

        // Emit event
        emit MissionLaunched(_msgSender(), missionId, to, miningPower);
    }

    /**
     * Recall the indicated mission, unstaking it for mining. The mission tokens
     * will be transferred to `to`, usually the message sender. After this call
     * the mission will no longer accumulate mining rewards, but already-mined
     * rewards remain retrievable.
     */
    function recallMission(uint256 missionId, address to) external {
        MissionInfo storage mission = missionInfo[missionId];
        UserInfo storage user = userInfo[mission.user];

        require(mission.staked, "IMSMM: mission not staked");
        require(_msgSender() == mission.user, "IMSMM: not mission controller");

        update();

        // unstake mission; update mining power
        uint256 missionPower = mission.miningPower;
        user.rewardDebt = user.rewardDebt - ((missionPower * accRewardPerMP) / PRECISION).toInt256();
        user.miningPower -= missionPower;
        totalMiningPower -= missionPower;
        mission.staked = false;
        mission.unstakedBlock = block.number;
        mission.unstakedTime = block.timestamp;

        // cleanup user mission list and mission record
        {
            uint256 replacementMissionId = userMissions[mission.user][userMissions[mission.user].length - 1];
            MissionInfo storage replacementMission = missionInfo[replacementMissionId];
            userMissions[mission.user][mission.userMissionsIndex] = replacementMissionId;
            userMissions[mission.user].pop();
            replacementMission.userMissionsIndex = mission.userMissionsIndex;
        }

        // cleanup staked mission list
        {
            uint256 replacementMissionId = stakedMissions[stakedMissions.length - 1];
            MissionInfo storage replacementMission = missionInfo[replacementMissionId];
            stakedMissions[mission.stakedMissionsIndex] = replacementMissionId;
            stakedMissions.pop();
            replacementMission.stakedMissionsIndex = mission.stakedMissionsIndex;
        }

        // transsfer mission tokens
        _transferMissionNFTs(mission, address(this), to);

        emit MissionRecalled(_msgSender(), missionId, to, missionPower);
    }

    /**
     * @dev Wrapper around ERC20 `transfer` that throw on failure (when the token
     * contract returns false). Tokens that return no value (and instead revert or
     * throw on failure) are also supported, non-reverting calls are assumed to be
     * successful.
     *
     * Modified from OpenZeppelin (Copyright (c) 2016-2022 zOS Global Limited and contributors
     * under MIT license)'s Address and SafeERC20 implementations; optimized for
     * size as only one such operation is needed.
     */
    function _safeTransfer(address to, uint256 amount) internal {
        // encode transfer function
        bytes memory data = abi.encodeWithSelector(IERC20Token(token).transfer.selector, to, amount);

        // low-level invocation
        (bool success, bytes memory returndata) = token.call{value: 0}(data);

        // if unsuccessful, unpack error message
        if (!success) {
            if (returndata.length > 0) {
                /// @solidity memory-safe-assembly
                assembly {
                    let returndata_size := mload(returndata)
                    revert(add(32, returndata), returndata_size)
                }
            } else {
                revert("SafeERC20: low-level call failed");
            }
        }

        if (returndata.length > 0) {
            // Return data is optional
            require(abi.decode(returndata, (bool)), "SafeERC20: ERC20 operation did not succeed");
        }
    }
}

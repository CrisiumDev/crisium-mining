// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;


import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "../faucet/IERC20Faucet.sol";
import "../faucet/IERC20Token.sol";
import "../appraisal/INFTAppraiser.sol";

interface NFT {
    function transferFrom(address from, address to, uint256 tokenId) external;
}

/**
 * @title IMSpaceMissionMining
 * @dev A mining contract allowing users to stake IMSpace mission tokens in sets,
 * which are evaluated for mining power based on mission composition. Valid
 * missions are: 1 Lander, 0 or 1 Landing Sites, and 0..N Payloads.
 *
 * Mining rate is controlled externally, via an IERC20Faucet; any funds received
 * are proportionally divided among all staked users according to the total
 * mining power of their staked missions. For consistency, the
 */
contract IMSpaceMissionMining is Context, AccessControlEnumerable, Pausable, IERC20Faucet {
    uint256 private constant MAX_256 = 2**256 - 1;
    uint256 private constant PRECISION = 1e20;

    // Role capable of withdrawing excess funds and set token addresses
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    uint256 public constant MAX_PAYLOADS = 8;

    /// @notice Info of each mission staking user.
    struct UserInfo {
        uint256 miningPower;
        uint256 released;
        int256 rewardDebt;
    }

    struct MissionInfo {
        bool staked;
        address user;
        uint256 miningPower;
        uint256 userMissionsIndex;
        uint256 stakedMissionsIndex;
        uint256[] landers;
        uint256[] landingSites;
        uint256[] payloads;
    }

    /// @notice Address of Crisium token contract.
    address public immutable token;
    uint256 public _totalMined;   // totalMined() includes to-be-received from faucet
    uint256 public override totalReleased;

    /// @notice Inforamtion about ongoing mining
    uint256 public accRewardPerMP;
    uint256 public totalMiningPower;

    /// @notice Addresses of mission tokens
    address public landerToken;
    address public landingSiteToken;
    address public payloadToken;

    /// @notice Address of originating faucet
    IERC20Faucet public immutable faucet;
    /// @notice Address of mission appraiser and mission tokens
    INFTAppraiser public appraiser;
    uint256 private completeMissionMultiplierPrec = PRECISION;

    /// @notice Info of each current and former mission staker
    mapping (address => UserInfo) public userInfo;
    /// @notice Mission IDs currently staked by each user
    mapping (address => uint256[]) public userMissions;

    // @notice Info of each mission
    MissionInfo[] public missionInfo;
    uint256[] public stakedMissions;

    event MissionLaunched(address user, uint256 indexed missionId, address indexed to, uint256 miningPower);
    event MissionRecalled(address user, uint256 indexed missionId, address indexed to, uint256 miningPower);
    event MissionAppraised(uint256 indexed missionId, address indexed to, uint256 previousMiningPower, uint256 miningPower);
    event MissionAppraiserChanged(address indexed previousAppraiser, address indexed appraiser);
    event MissionCompleteMultiplierUpdated(uint256 numerator, uint256 denominator);

    /// @param _token The reward token address
    /// @param _faucet The faucet address
    /// @param _appraiser The mission token appraiser address
    constructor(address _token, IERC20Faucet _faucet, INFTAppraiser _appraiser) {
        token = _token;
        faucet = _faucet;
        appraiser = _appraiser;

        // set up roles
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());   // admin; can add/remove managers
        _setupRole(MANAGER_ROLE, _msgSender());         // manager; can withdraw excess funds

        emit MissionAppraiserChanged(address(0), address(_appraiser));
    }

    // *******************************
    // IERC20 Faucet Implementation

    function totalMined() external view returns (uint256 amount) {
        amount = _totalMined;
        if (!paused() && totalMiningPower > 0) {
            amount += faucet.releasable(address(this));
        }
    }

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

        amount = uint256(int256((user.miningPower * rewardPerMP) / PRECISION) - user.rewardDebt);
    }

    function release(address from, address to) external override returns (uint256 amount) {
        require(_msgSender() == from, "IMSpaceMissionMining: not authorized");
        update();

        // calculate reward pending
        UserInfo storage user = userInfo[from];
        int256 accumulatedReward = int256((user.miningPower * accRewardPerMP)  / PRECISION);
        amount = uint256(accumulatedReward - user.rewardDebt);

        _release(user, from, to, amount);
    }

    function release(address from, address to, uint256 amount) external override {
        require(_msgSender() == from, "IMSpaceMissionMining: not authorized");
        update();

        // calculate reward pending
        UserInfo storage user = userInfo[from];
        uint256 accumulatedReward = (user.miningPower * accRewardPerMP)  / PRECISION;
        uint256 pendingReward = uint256(int256(accumulatedReward) - user.rewardDebt);

        require(amount <= pendingReward, "IMSpaceMissionMining: amount > releasable");
        _release(user, from, to, amount);
    }

    function _release(UserInfo storage user, address from, address to, uint256 amount) internal {
        // update internal records
        user.rewardDebt += int256(amount);
        user.released += amount;
        totalReleased += amount;

        if (amount > 0) {
            _transfer(to, amount);
        }

        emit Released(from, to, amount);
    }

    // *******************************
    // Manager Controls

    function transferExcess(address to) external onlyManager {
        update();

        // excess funds should be zero, but it's possible for tokens to be
        // transferred into this contract accidentally, or for the faucet to
        // allocate funds before any's mission tokens are staked
        uint256 balance = IERC20Token(token).balanceOf(address(this));
        uint256 amount = (balance + totalReleased) - _totalMined;
        _transfer(to, amount);
    }

    function setMissionLanderToken(address _token) external onlyManager onlyUnset(landerToken) {
        landerToken = _token;
    }

    function setMissionLandingSiteToken(address _token) external onlyManager onlyUnset(landingSiteToken) {
        landingSiteToken = _token;
    }

    function setMissionPayloadToken(address _token) external onlyManager onlyUnset(payloadToken) {
        payloadToken = _token;
    }

    function setAppraiser(INFTAppraiser _appraiser) external onlyManager {
        address previousAppraiser = address(appraiser);
        appraiser = _appraiser;
        emit MissionAppraiserChanged(previousAppraiser, address(appraiser));
    }

    function setMissionCompleteMultiplier(uint256 numerator, uint256 denominator) external onlyManager {
        require(numerator >= denominator, "IMSpaceMissionMining: ratio not >= 1");
        completeMissionMultiplierPrec = (numerator * PRECISION) / denominator;
        emit MissionCompleteMultiplierUpdated(numerator, denominator);
    }

    function pause() external onlyManager {
        update();
        _pause();
    }

    function unpause() external onlyManager {
        _unpause();
        update();
    }

    modifier onlyManager() {
        require(hasRole(MANAGER_ROLE, _msgSender()), "IMSpaceMissionMining: not authorized");
        _;
    }

    modifier onlyUnset(address addr) {
        require(addr == address(0), "IMSpaceMissionMining: already set");
        _;
    }

    // *******************************
    // Missions

    /// @notice Returns the number of RMP pools.
    function missionCount() external view returns (uint256 missions) {
        missions = missionInfo.length;
    }

    function stakedMissionCount() external view returns (uint256 missions) {
        missions = stakedMissions.length;
    }

    function userMissionCount(address user) external view returns (uint256 missions) {
        missions = userMissions[user].length;
    }

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
            NFT(nftToken).transferFrom(from, to, tokenIds[i]);
        }
    }

    function update() public {
        if (!paused() && faucet.releasable(address(this)) > 0) {
            uint256 mined = faucet.release(address(this), address(this));

            if (totalMiningPower > 0) {
                accRewardPerMP += (mined * PRECISION) / totalMiningPower;
                _totalMined += mined;
            }
        }
    }

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
            miningPower += landers.length > 0
                ? appraiser.totalAppraisalOf(landerToken, landers)
                : 0;
            miningPower += landingSites.length > 0
                ? appraiser.totalAppraisalOf(landingSiteToken, landingSites)
                : 0;
            miningPower += payloads.length > 0
                ? appraiser.totalAppraisalOf(payloadToken, payloads)
                : 0;

            if (landers.length > 0 && landingSites.length > 0 && payloads.length > 0) {
                // mission is complete
                miningPower = (miningPower * completeMissionMultiplierPrec) / PRECISION;
            }
        }
    }

    function reappraiseMission(uint256 missionId) external {
        MissionInfo storage mission = missionInfo[missionId];
        UserInfo storage user = userInfo[mission.user];

        require(mission.staked, "IMSpaceMissionMining: mission not staked");

        update();

        uint256 appraisal = _getMissionAppraisal(mission);
        uint256 previousAppraisal = mission.miningPower;
        int256 appraisalChange = int256(appraisal) - int256(previousAppraisal);

        user.miningPower = (user.miningPower + appraisal) - previousAppraisal;
        user.rewardDebt += (appraisalChange * int256(accRewardPerMP)) / int256(PRECISION);

        mission.miningPower = appraisal;
        totalMiningPower = uint256(int256(totalMiningPower) + appraisalChange);
        emit MissionAppraised(missionId, mission.user, previousAppraisal, appraisal);
    }

    function _getMissionAppraisal(MissionInfo storage mission) internal view returns (uint256 miningPower) {
        // mining power is the sum of all component tokens, scaled by a multiplier
        // if complete.
        miningPower += mission.landers.length > 0
            ? appraiser.totalAppraisalOf(landerToken, mission.landers)
            : 0;
        miningPower += mission.landingSites.length > 0
            ? appraiser.totalAppraisalOf(landingSiteToken, mission.landingSites)
            : 0;
        miningPower += mission.payloads.length > 0
            ? appraiser.totalAppraisalOf(payloadToken, mission.payloads)
            : 0;

        if (mission.landers.length > 0 && mission.landingSites.length > 0 && mission.payloads.length > 0) {
            // mission is complete
            miningPower = (miningPower * completeMissionMultiplierPrec) / PRECISION;
        }
    }

    function launchMission(uint256[] calldata landers, uint256[] calldata landingSites, uint256[] calldata payloads, address to) external whenNotPaused returns (uint256 missionId) {
        update();

        (bool valid, uint256 miningPower) = evaluateMissionCandidate(landers, landingSites, payloads);
        require(valid, "IMSpaceMissionMining: invalid mission");

        // Make a mission
        missionId = missionInfo.length;
        missionInfo.push(MissionInfo({
            staked: true,
            user: to,
            miningPower: miningPower,
            userMissionsIndex: userMissions[to].length,
            stakedMissionsIndex: stakedMissions.length,
            landers: landers,
            landingSites: landingSites,
            payloads: payloads
        }));
        stakedMissions.push(missionId);
        userMissions[to].push(missionId);

        MissionInfo storage mission = missionInfo[missionId];
        UserInfo storage user = userInfo[to];

        // Update mining power totals
        user.miningPower += miningPower;
        user.rewardDebt += int256((miningPower * accRewardPerMP) / PRECISION);
        totalMiningPower += miningPower;

        // Transfer mission tokens
        _transferMissionNFTs(mission, _msgSender(), address(this));

        // Emit event
        emit MissionLaunched(_msgSender(), missionId, to, miningPower);
    }

    function recallMission(uint256 missionId, address to) external {
        MissionInfo storage mission = missionInfo[missionId];
        UserInfo storage user = userInfo[mission.user];

        require(mission.staked, "IMSpaceMissionMining: mission not staked");
        require(_msgSender() == mission.user, "IMSpaceMissionMining: not mission controller");

        update();

        // unstake mission; update mining power
        uint256 missionPower = mission.miningPower;
        user.rewardDebt = user.rewardDebt - int256((missionPower * accRewardPerMP) / PRECISION);
        user.miningPower -= missionPower;
        totalMiningPower -= missionPower;
        mission.staked = false;

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

    /// @dev Transfer the indicated reward to the indicated recipient, or as
    /// much of it as possible.
    function _transfer(address _to, uint256 _amount) internal {
        uint256 balance = IERC20Token(token).balanceOf(address(this));
        if (_amount > balance) {
            IERC20Token(token).transfer(_to, balance);
        } else {
            IERC20Token(token).transfer(_to, _amount);
        }
    }
}

const { expectRevert, expectEvent, time } = require('@openzeppelin/test-helpers');
const NFTAppraisalRecord = artifacts.require('NFTAppraisalRecord');
const IMSpaceMissionMining = artifacts.require('IMSpaceMissionMining');
const MockMissionChecker = artifacts.require('MockMissionChecker');
const MockERC20Faucet = artifacts.require('MockERC20Faucet');
const MockERC20 = artifacts.require('MockERC20');
const MockERC721 = artifacts.require('MockERC721');

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';

contract('IMSpaceMissionMining', ([alice, bob, carol, dave, deployer, manager]) => {
    const MANAGER_ROLE = web3.utils.soliditySha3('MANAGER_ROLE');

    beforeEach(async () => {
      this.token = await MockERC20.new("Mock Token", "MT", 0);
      this.faucet = await MockERC20Faucet.new(this.token.address);
      this.appraiser = await NFTAppraisalRecord.new({ from:deployer });

      this.mining = await IMSpaceMissionMining.new(this.token.address, this.faucet.address, this.appraiser.address, { from:deployer });
      await this.mining.grantRole(MANAGER_ROLE, manager, { from:deployer });
    });

    it('should set correct state variables', async () => {
      const { token, faucet, appraiser, mining } = this;
      assert.equal(await (mining.token()).valueOf(),  token.address);
      assert.equal(await (mining.faucet()).valueOf(),  faucet.address);
      assert.equal(await (mining.appraiser()).valueOf(),  appraiser.address);

      assert.equal(await mining.totalMined(), '0');
      assert.equal(await mining.totalReleased(), '0');

      assert.equal(await mining.totalMiningPower(), '0');

      assert.equal(await mining.landerToken(), ADDRESS_ZERO);
      assert.equal(await mining.landingSiteToken(), ADDRESS_ZERO);
      assert.equal(await mining.payloadToken(), ADDRESS_ZERO);
    });

    it('should report correct initial faucet state', async () => {
      const { token, faucet, appraiser, mining } = this;

      assert.equal(await mining.totalReleased(), '0');
      assert.equal(await mining.released(alice), '0');
      assert.equal(await mining.released(bob), '0');

      assert.equal(await mining.releasable(alice), '0');
      assert.equal(await mining.releasable(bob), '0');
    });

    it('should report correct initial mining state', async () => {
      const { token, faucet, appraiser, mining } = this;

      assert.equal(await mining.missionCount(), '0');
      assert.equal(await mining.userMissionCount(alice), '0');
      assert.equal(await mining.userMissionCount(bob), '0');
    });

    context('transferExcess', () => {
      it('reverts for non-manager', async () => {
        const { mining } = this;

        await expectRevert(
          mining.transferExcess(alice, { from:alice }),
          "IMSMM: !auth"
        );

        await expectRevert(
          mining.transferExcess(bob, { from:carol }),
          "IMSMM: !auth"
        );
      });

      it('transfers ERC20 funds as expected', async () => {
        const { token, mining } = this;

        await token.mint(mining.address, 1000);
        await mining.transferExcess(alice, { from:deployer });
        assert.equal(await token.balanceOf(alice), '1000');

        await token.mint(mining.address, 500);
        await mining.transferExcess(bob, { from:manager });
        assert.equal(await token.balanceOf(bob), '500');
      });
    });

    context('setMission[..]Token', () => {
      let nft;

      beforeEach(async () => {
        nft = await MockERC721.new("Component", "C");
      });

      it('reverts for non-manager', async () => {
        const { mining } = this;

        await expectRevert(
          mining.setMissionLanderToken(nft.address, { from:alice }),
          "IMSMM: !auth"
        );

        await expectRevert(
          mining.setMissionLandingSiteToken(nft.address, { from:bob }),
          "IMSMM: !auth"
        );

        await expectRevert(
          mining.setMissionPayloadToken(nft.address, { from:carol }),
          "IMSMM: !auth"
        );
      });

      it('setMissionLanderToken set expected field', async () => {
        const { mining } = this;
        await mining.setMissionLanderToken(nft.address, { from:deployer });
        assert.equal(await mining.landerToken(), nft.address);
        assert.equal(await mining.landingSiteToken(), ADDRESS_ZERO);
        assert.equal(await mining.payloadToken(), ADDRESS_ZERO);
      });

      it('setMissionLandingSiteToken set expected field', async () => {
        const { mining } = this;
        await mining.setMissionLandingSiteToken(nft.address, { from:manager });
        assert.equal(await mining.landerToken(), ADDRESS_ZERO);
        assert.equal(await mining.landingSiteToken(), nft.address);
        assert.equal(await mining.payloadToken(), ADDRESS_ZERO);
      });

      it('setMissionPayloadToken set expected field', async () => {
        const { mining } = this;
        await mining.setMissionPayloadToken(nft.address, { from:manager });
        assert.equal(await mining.landerToken(), ADDRESS_ZERO);
        assert.equal(await mining.landingSiteToken(), ADDRESS_ZERO);
        assert.equal(await mining.payloadToken(), nft.address);
      });

      it('only settable once per type', async () => {
        const { mining } = this;

        await mining.setMissionLanderToken(nft.address, { from:manager });
        await expectRevert(
          mining.setMissionLanderToken(alice, { from:manager }),
          "IMSMM: already set"
        );
        await expectRevert(
          mining.setMissionLanderToken(alice, { from:deployer }),
          "IMSMM: already set"
        );

        await mining.setMissionLandingSiteToken(nft.address, { from:deployer });
        await expectRevert(
          mining.setMissionLandingSiteToken(alice, { from:manager }),
          "IMSMM: already set"
        );
        await expectRevert(
          mining.setMissionLandingSiteToken(alice, { from:deployer }),
          "IMSMM: already set"
        );

        const nft2 = await MockERC721.new("Mission Component 2", "MC2");
        await mining.setMissionPayloadToken(nft2.address, { from:manager });
        await expectRevert(
          mining.setMissionPayloadToken(nft.address, { from:deployer }),
          "IMSMM: already set"
        );
        await expectRevert(
          mining.setMissionPayloadToken(alice, { from:manager }),
          "IMSMM: already set"
        );
      });
    });

    context('setAppraiser', () => {
      let appraiser2;

      beforeEach(async () => {
        appraiser2 = await NFTAppraisalRecord.new();
      });

      it('reverts for non-manager', async () => {
        const { mining } = this;

        await expectRevert(
          mining.setAppraiser(appraiser2.address, { from:alice }),
          "IMSMM: !auth"
        );

        await expectRevert(
          mining.setAppraiser(appraiser2.address, { from:bob }),
          "IMSMM: !auth"
        );
      });

      it('updates "appraiser"', async () => {
        const { mining, appraiser } = this;

        await mining.setAppraiser(appraiser2.address, { from:manager });
        assert.equal(await mining.appraiser(), appraiser2.address);

        await mining.setAppraiser(appraiser.address, { from:deployer });
        assert.equal(await mining.appraiser(), appraiser.address);
      });

      it('emits "MissionAppraiserChanged"', async () => {
        const { mining, appraiser } = this;
        let res;

        res = await mining.setAppraiser(appraiser2.address, { from:manager });
        await expectEvent.inTransaction(res.tx, mining, "MissionAppraiserChanged", {
          previousAppraiser: appraiser.address,
          appraiser: appraiser2.address
        });

        res = await mining.setAppraiser(appraiser.address, { from:deployer });
        await expectEvent.inTransaction(res.tx, mining, "MissionAppraiserChanged", {
          previousAppraiser: appraiser2.address,
          appraiser: appraiser.address
        });
      });
    });

    context('setMissionCompleteChecker', () => {
      let checker, checker2;

      beforeEach(async () => {
        checker = await MockMissionChecker.new();
        checker2 = await MockMissionChecker.new();
      });

      it('reverts for non-manager', async () => {
        const { mining } = this;

        await expectRevert(
          mining.setMissionCompleteChecker(checker.address, { from:alice }),
          "IMSMM: !auth"
        );

        await expectRevert(
          mining.setMissionCompleteChecker(checker.address, { from:bob }),
          "IMSMM: !auth"
        );
      });

      it('updates "completeMissionChecker"', async () => {
        const { mining } = this;

        await mining.setMissionCompleteChecker(checker.address, { from:manager });
        assert.equal(await mining.completeMissionChecker(), checker.address);

        await mining.setMissionCompleteChecker(checker2.address, { from:deployer });
        assert.equal(await mining.completeMissionChecker(), checker2.address);

        await mining.setMissionCompleteChecker(mining.address, { from:manager });
        assert.equal(await mining.completeMissionChecker(), ADDRESS_ZERO);

        await mining.setMissionCompleteChecker(checker2.address, { from:deployer });
        assert.equal(await mining.completeMissionChecker(), checker2.address);

        await mining.setMissionCompleteChecker(ADDRESS_ZERO, { from:manager });
        assert.equal(await mining.completeMissionChecker(), ADDRESS_ZERO);
      });

      it('emits "MissionAppraiserChanged"', async () => {
        const { mining, appraiser } = this;
        let res;

        res = await mining.setMissionCompleteChecker(checker.address, { from:manager });
        await expectEvent.inTransaction(res.tx, mining, "MissionCompleteCheckerChanged", {
          previousChecker: ADDRESS_ZERO,
          checker: checker.address
        });

        res = await mining.setMissionCompleteChecker(checker2.address, { from:deployer });
        await expectEvent.inTransaction(res.tx, mining, "MissionCompleteCheckerChanged", {
          previousChecker: checker.address,
          checker: checker2.address
        });

        res = await mining.setMissionCompleteChecker(mining.address, { from:manager });
        await expectEvent.inTransaction(res.tx, mining, "MissionCompleteCheckerChanged", {
          previousChecker: checker2.address,
          checker: ADDRESS_ZERO
        });

        res = await mining.setMissionCompleteChecker(checker2.address, { from:deployer });
        await expectEvent.inTransaction(res.tx, mining, "MissionCompleteCheckerChanged", {
          previousChecker: ADDRESS_ZERO,
          checker: checker2.address
        });

        res = await mining.setMissionCompleteChecker(ADDRESS_ZERO, { from:manager });
        await expectEvent.inTransaction(res.tx, mining, "MissionCompleteCheckerChanged", {
          previousChecker: checker2.address,
          checker: ADDRESS_ZERO
        });
      });
    });

    context('setMissionCompleteMultiplier', () => {
      it('reverts for non-manager', async () => {
        const { mining } = this;

        await expectRevert(
          mining.setMissionCompleteMultiplier(10, 1, { from:alice }),
          "IMSMM: !auth"
        );

        await expectRevert(
          mining.setMissionCompleteMultiplier(1, 1, { from:bob }),
          "IMSMM: !auth"
        );
      });

      it('reverts for ratio < 1', async () => {
        const { mining } = this;

        await expectRevert(
          mining.setMissionCompleteMultiplier(999, 1000, { from:manager }),
          "IMSMM: ratio not >= 1"
        );

        await expectRevert(
          mining.setMissionCompleteMultiplier(1, 1000, { from:deployer }),
          "IMSMM: ratio not >= 1"
        );
      });

      it('emits "MissionCompleteMultiplierUpdated"', async () => {
        const { mining } = this;
        let res;

        res = await mining.setMissionCompleteMultiplier(5, 1, { from:manager });
        await expectEvent.inTransaction(res.tx, mining, "MissionCompleteMultiplierUpdated", {
          numerator: '5',
          denominator: '1'
        });

        res = await mining.setMissionCompleteMultiplier(999, 14, { from:manager });
        await expectEvent.inTransaction(res.tx, mining, "MissionCompleteMultiplierUpdated", {
          numerator: '999',
          denominator: '14'
        });
      });
    });

    context('pause / unpause', () => {
      it('reverts for non-manager', async () => {
        const { mining } = this;

        await expectRevert(
          mining.pause({ from:alice }),
          "IMSMM: !auth"
        );

        await expectRevert(
          mining.pause({ from:bob }),
          "IMSMM: !auth"
        );

        await mining.pause({ from:manager });

        await expectRevert(
          mining.unpause({ from:alice }),
          "IMSMM: !auth"
        );

        await expectRevert(
          mining.unpause({ from:bob }),
          "IMSMM: !auth"
        );

        await mining.unpause({ from:manager });
      });

      it('toggles "paused" state', async () => {
        const { mining } = this;

        assert.equal(await mining.paused(), false);

        await mining.pause({ from:deployer });
        assert.equal(await mining.paused(), true);
        await mining.unpause({ from:deployer });
        assert.equal(await mining.paused(), false);

        await mining.pause({ from:manager });
        assert.equal(await mining.paused(), true);
        await mining.unpause({ from:manager });
        assert.equal(await mining.paused(), false);
      });

      it('emits "Paused" / "Unpaused" event', async () => {
        const { mining } = this;
        let res;

        res = await mining.pause({ from:deployer });
        await expectEvent.inTransaction(res.tx, mining, "Paused", { account:deployer });
        res = await mining.unpause({ from:deployer });
        await expectEvent.inTransaction(res.tx, mining, "Unpaused", { account:deployer });

        res = await mining.pause({ from:manager });
        await expectEvent.inTransaction(res.tx, mining, "Paused", { account:manager });
        res = await mining.unpause({ from:manager });
        await expectEvent.inTransaction(res.tx, mining, "Unpaused", { account:manager });
      });
    });

    context('With Lander and Payload tokens', async () => {
      beforeEach(async () => {
        const { appraiser, mining } = this;
        this.lander = await MockERC721.new("Mission Lander", "ML");
        this.landingSite = await MockERC721.new("Mission Landing Site", "MLS");
        this.payload = await MockERC721.new("Mission Payload", "MP");

        await mining.setMissionLanderToken(this.lander.address, { from:manager });
        await mining.setMissionPayloadToken(this.payload.address, { from:manager });

        await appraiser.setAppraises(this.lander.address, true, '100', { from:deployer });
        await appraiser.setAppraises(this.landingSite.address, true, '50', { from:deployer });
        await appraiser.setAppraises(this.payload.address, true, '10', { from:deployer });
      });

      context('evaluateMissionCandidate', () => {
        it('valid, incomplete mission', async () => {
          const { mining, lander, landingSite, payload, appraiser } = this;
          let res;

          // note: the appraiser does not actually check for token existence; any tokenId
          // will provide default appraisal
          res = await mining.evaluateMissionCandidate([0], [], []);
          assert.equal(res.valid, true);
          assert.equal(res.miningPower, '100');

          res = await mining.evaluateMissionCandidate([10], [], [1, 2, 3]);
          assert.equal(res.valid, true);
          assert.equal(res.miningPower, '130');

          // with some non-default values
          await appraiser.setAppraisals(lander.address, [1, 2, 3], [1000, 2000, 3000], { from:deployer });
          await appraiser.setAppraisals(payload.address, [1, 2, 3, 4, 5], [10, 20, 30, 40, 50], { from:deployer });

          res = await mining.evaluateMissionCandidate([1], [], []);
          assert.equal(res.valid, true);
          assert.equal(res.miningPower, '1000');

          res = await mining.evaluateMissionCandidate([2], [], [2, 4]);
          assert.equal(res.valid, true);
          assert.equal(res.miningPower, '2060');

          res = await mining.evaluateMissionCandidate([3], [], [1, 2, 3, 5, 6]);
          assert.equal(res.valid, true);
          assert.equal(res.miningPower, '3120');

          await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

          res = await mining.evaluateMissionCandidate([1], [], []);
          assert.equal(res.valid, true);
          assert.equal(res.miningPower, '1000');

          res = await mining.evaluateMissionCandidate([2], [], [2, 4]);
          assert.equal(res.valid, true);
          assert.equal(res.miningPower, '2060');

          res = await mining.evaluateMissionCandidate([3], [], [1, 2, 3, 5, 6]);
          assert.equal(res.valid, true);
          assert.equal(res.miningPower, '3120');
        });

        it('complete mission', async () => {
          const { mining, lander, landingSite, payload, appraiser } = this;
          let res;

          await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });
          await mining.setMissionCompleteMultiplier(3, 2, { from:deployer });   // 150%

          res = await mining.evaluateMissionCandidate([0], [0], [0]); // (100 + 50 + 10) * 1.5
          assert.equal(res.valid, true);
          assert.equal(res.miningPower, '240');

          res = await mining.evaluateMissionCandidate([10], [20], [1, 2, 3, 4]); // (100 + 50 + 40) * 1.5
          assert.equal(res.valid, true);
          assert.equal(res.miningPower, '285');

          // with some non-default values
          await appraiser.setAppraisals(lander.address, [1, 2, 3], [1000, 2000, 3000], { from:deployer });
          await appraiser.setAppraisals(landingSite.address, [1, 2, 3], [10000, 20000, 30000], { from:deployer });
          await appraiser.setAppraisals(payload.address, [1, 2, 3, 4, 5], [10, 20, 30, 40, 50], { from:deployer });

          res = await mining.evaluateMissionCandidate([2], [3], [1, 2, 3]); // (2000 + 30000 + 60) * 1.5
          assert.equal(res.valid, true);
          assert.equal(res.miningPower, '48090');

          await mining.setMissionCompleteMultiplier(9, 7, { from:deployer });   // 128.5714%
          res = await mining.evaluateMissionCandidate([3], [1], [1, 4, 5, 10]); // (3000 + 10000 + 110) * 1.285714
          assert.equal(res.valid, true);
          assert.equal(res.miningPower, '16855');
        });

        context('with completeMissionChecker', () => {
          let checker;

          beforeEach(async () => {
            const { mining } = this;

            checker = await MockMissionChecker.new();
            await mining.setMissionCompleteChecker(checker.address, { from:deployer });
          });

          it('valid, incomplete mission, checked as incomplete', async () => {
            const { mining, lander, landingSite, payload, appraiser } = this;
            let res;

            await mining.setMissionCompleteMultiplier(3, 2, { from:deployer });   // 150%

            // note: the appraiser does not actually check for token existence; any tokenId
            // will provide default appraisal
            res = await mining.evaluateMissionCandidate([0], [], []);
            assert.equal(res.valid, true);
            assert.equal(res.miningPower, '100');

            res = await mining.evaluateMissionCandidate([10], [], [1, 2, 3]);
            assert.equal(res.valid, true);
            assert.equal(res.miningPower, '130');

            // with some non-default values
            await appraiser.setAppraisals(lander.address, [1, 2, 3], [1000, 2000, 3000], { from:deployer });
            await appraiser.setAppraisals(payload.address, [1, 2, 3, 4, 5], [10, 20, 30, 40, 50], { from:deployer });

            res = await mining.evaluateMissionCandidate([1], [], []);
            assert.equal(res.valid, true);
            assert.equal(res.miningPower, '1000');

            res = await mining.evaluateMissionCandidate([2], [], [2, 4]);
            assert.equal(res.valid, true);
            assert.equal(res.miningPower, '2060');

            res = await mining.evaluateMissionCandidate([3], [], [1, 2, 3, 5, 6]);
            assert.equal(res.valid, true);
            assert.equal(res.miningPower, '3120');

            await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

            res = await mining.evaluateMissionCandidate([1], [], []);
            assert.equal(res.valid, true);
            assert.equal(res.miningPower, '1000');

            res = await mining.evaluateMissionCandidate([2], [], [2, 4]);
            assert.equal(res.valid, true);
            assert.equal(res.miningPower, '2060');

            res = await mining.evaluateMissionCandidate([3], [], [1, 2, 3, 5, 6]);
            assert.equal(res.valid, true);
            assert.equal(res.miningPower, '3120');
          });

          it('valid, incomplete mission, checked as complete', async () => {
            const { mining, lander, landingSite, payload, appraiser } = this;
            let res;

            await mining.setMissionCompleteMultiplier(3, 2, { from:deployer });   // 150%
            await checker.setResult(true);

            // note: the appraiser does not actually check for token existence; any tokenId
            // will provide default appraisal
            res = await mining.evaluateMissionCandidate([0], [], []);
            assert.equal(res.valid, true);
            assert.equal(res.miningPower, '150');

            res = await mining.evaluateMissionCandidate([10], [], [1, 2, 3]);
            assert.equal(res.valid, true);
            assert.equal(res.miningPower, '195');

            // with some non-default values
            await appraiser.setAppraisals(lander.address, [1, 2, 3], [1000, 2000, 3000], { from:deployer });
            await appraiser.setAppraisals(payload.address, [1, 2, 3, 4, 5], [10, 20, 30, 40, 50], { from:deployer });

            res = await mining.evaluateMissionCandidate([1], [], []);
            assert.equal(res.valid, true);
            assert.equal(res.miningPower, '1500');

            res = await mining.evaluateMissionCandidate([2], [], [2, 4]);
            assert.equal(res.valid, true);
            assert.equal(res.miningPower, '3090');

            res = await mining.evaluateMissionCandidate([3], [], [1, 2, 3, 5, 6]);
            assert.equal(res.valid, true);
            assert.equal(res.miningPower, '4680');

            await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

            res = await mining.evaluateMissionCandidate([1], [], []);
            assert.equal(res.valid, true);
            assert.equal(res.miningPower, '1500');

            res = await mining.evaluateMissionCandidate([2], [], [2, 4]);
            assert.equal(res.valid, true);
            assert.equal(res.miningPower, '3090');

            res = await mining.evaluateMissionCandidate([3], [], [1, 2, 3, 5, 6]);
            assert.equal(res.valid, true);
            assert.equal(res.miningPower, '4680');
          });

          it('complete mission, checked as incomplete', async () => {
            const { mining, lander, landingSite, payload, appraiser } = this;
            let res;

            await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });
            await mining.setMissionCompleteMultiplier(3, 2, { from:deployer });   // 150%

            res = await mining.evaluateMissionCandidate([0], [0], [0]); // (100 + 50 + 10)
            assert.equal(res.valid, true);
            assert.equal(res.miningPower, '160');

            res = await mining.evaluateMissionCandidate([10], [20], [1, 2, 3, 4]); // (100 + 50 + 40)
            assert.equal(res.valid, true);
            assert.equal(res.miningPower, '190');

            // with some non-default values
            await appraiser.setAppraisals(lander.address, [1, 2, 3], [1000, 2000, 3000], { from:deployer });
            await appraiser.setAppraisals(landingSite.address, [1, 2, 3], [10000, 20000, 30000], { from:deployer });
            await appraiser.setAppraisals(payload.address, [1, 2, 3, 4, 5], [10, 20, 30, 40, 50], { from:deployer });

            res = await mining.evaluateMissionCandidate([2], [3], [1, 2, 3]); // (2000 + 30000 + 60)
            assert.equal(res.valid, true);
            assert.equal(res.miningPower, '32060');

            await mining.setMissionCompleteMultiplier(9, 7, { from:deployer });   // 128.5714%
            res = await mining.evaluateMissionCandidate([3], [1], [1, 4, 5, 10]); // (3000 + 10000 + 110)
            assert.equal(res.valid, true);
            assert.equal(res.miningPower, '13110');
          });

          it('complete mission, checked as complete', async () => {
            const { mining, lander, landingSite, payload, appraiser } = this;
            let res;

            await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });
            await mining.setMissionCompleteMultiplier(3, 2, { from:deployer });   // 150%
            await checker.setResult(true);

            res = await mining.evaluateMissionCandidate([0], [0], [0]); // (100 + 50 + 10) * 1.5
            assert.equal(res.valid, true);
            assert.equal(res.miningPower, '240');

            res = await mining.evaluateMissionCandidate([10], [20], [1, 2, 3, 4]); // (100 + 50 + 40) * 1.5
            assert.equal(res.valid, true);
            assert.equal(res.miningPower, '285');

            // with some non-default values
            await appraiser.setAppraisals(lander.address, [1, 2, 3], [1000, 2000, 3000], { from:deployer });
            await appraiser.setAppraisals(landingSite.address, [1, 2, 3], [10000, 20000, 30000], { from:deployer });
            await appraiser.setAppraisals(payload.address, [1, 2, 3, 4, 5], [10, 20, 30, 40, 50], { from:deployer });

            res = await mining.evaluateMissionCandidate([2], [3], [1, 2, 3]); // (2000 + 30000 + 60) * 1.5
            assert.equal(res.valid, true);
            assert.equal(res.miningPower, '48090');

            await mining.setMissionCompleteMultiplier(9, 7, { from:deployer });   // 128.5714%
            res = await mining.evaluateMissionCandidate([3], [1], [1, 4, 5, 10]); // (3000 + 10000 + 110) * 1.285714
            assert.equal(res.valid, true);
            assert.equal(res.miningPower, '16855');
          });
        });

        it('invalid mission', async () => {
          const { mining, lander, landingSite, payload, appraiser } = this;
          let res;

          // note: the appraiser does not actually check for token existence; any tokenId
          // will provide default appraisal
          res = await mining.evaluateMissionCandidate([], [], []);
          assert.equal(res.valid, false);
          assert.equal(res.miningPower, '0');

          res = await mining.evaluateMissionCandidate([1, 2], [], []);
          assert.equal(res.valid, false);
          assert.equal(res.miningPower, '0');

          res = await mining.evaluateMissionCandidate([], [], [1, 2, 3]);
          assert.equal(res.valid, false);
          assert.equal(res.miningPower, '0');

          res = await mining.evaluateMissionCandidate([1], [], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
          assert.equal(res.valid, false);
          assert.equal(res.miningPower, '0');

          res = await mining.evaluateMissionCandidate([1], [2], [1, 2, 3]);
          assert.equal(res.valid, false);
          assert.equal(res.miningPower, '0');

          await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

          res = await mining.evaluateMissionCandidate([1], [1, 2], []);
          assert.equal(res.valid, false);
          assert.equal(res.miningPower, '0');

          res = await mining.evaluateMissionCandidate([1], [1, 2], [1, 2, 3]);
          assert.equal(res.valid, false);
          assert.equal(res.miningPower, '0');

          const miningBackup = await IMSpaceMissionMining.new(this.token.address, this.faucet.address, this.appraiser.address, { from:deployer });
          res = await miningBackup.evaluateMissionCandidate([], [], []);
          assert.equal(res.valid, false);
          assert.equal(res.miningPower, '0');

          res = await miningBackup.evaluateMissionCandidate([0], [], []);
          assert.equal(res.valid, false);
          assert.equal(res.miningPower, '0');

          await miningBackup.setMissionLanderToken(lander.address, { from:deployer });
          res = await miningBackup.evaluateMissionCandidate([1], [], [1, 2, 3]);
          assert.equal(res.valid, false);
          assert.equal(res.miningPower, '0');
        });
      });

      context('with tokens', () => {
        beforeEach(async () => {
          const { lander, landingSite, payload, mining } = this;

          // give each user ten of each token
          await lander.mintBatch(alice, 10);
          await lander.mintBatch(bob, 10);
          await lander.mintBatch(carol, 10);

          await landingSite.mintBatch(alice, 10);
          await landingSite.mintBatch(bob, 10);
          await landingSite.mintBatch(carol, 10);

          await payload.mintBatch(alice, 10);
          await payload.mintBatch(bob, 10);
          await payload.mintBatch(carol, 10);

          await lander.setUniversalApproval(true);
          await landingSite.setUniversalApproval(true);
          await payload.setUniversalApproval(true);
        });

        context('launchMission', () => {
          it('reverts for invalid missions', async () => {
            const { mining, landingSite } = this;
            await expectRevert(
              mining.launchMission([], [], [1], alice, { from:alice }),
              "IMSMM: invalid mission"
            );

            await expectRevert(
              mining.launchMission([1, 2], [], [1], alice, { from:alice }),
              "IMSMM: invalid mission"
            );

            await expectRevert(
              mining.launchMission([1], [0], [], alice, { from:alice }),
              "IMSMM: invalid mission"
            );

            await expectRevert(
              mining.launchMission([2], [], [1, 2, 3, 4, 5, 6, 7, 8, 9], alice, { from:alice }),
              "IMSMM: invalid mission"
            );

            await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

            await expectRevert(
              mining.launchMission([], [1], [], alice, { from:alice }),
              "IMSMM: invalid mission"
            );

            await expectRevert(
              mining.launchMission([2], [1, 2], [], alice, { from:alice }),
              "IMSMM: invalid mission"
            );
          });

          it('reverts for nonexistent tokens', async () => {
            const { mining, lander, landingSite, payload } = this;

            await expectRevert.unspecified(
              mining.launchMission([30], [], [], alice, { from:alice })
            );

            await expectRevert.unspecified(
              mining.launchMission([1], [], [30, 1, 2, 3], alice, { from:alice })
            );

            await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

            await expectRevert.unspecified(
              mining.launchMission([10], [45], [12, 14, 16], carol, { from:bob })
            );

            await expectRevert.unspecified(
              mining.launchMission([42], [], [], carol, { from:bob })
            );
          });

          it('reverts for unowned tokens', async () => {
            const { mining, lander, landingSite, payload } = this;

            await expectRevert.unspecified(
              mining.launchMission([0], [], [], alice, { from:bob })
            );

            await expectRevert.unspecified(
              mining.launchMission([1], [], [0, 1, 2, 3], carol, { from:carol })
            );

            await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

            await expectRevert.unspecified(
              mining.launchMission([10], [15], [12, 14, 16], carol, { from:carol })
            );

            await expectRevert.unspecified(
              mining.launchMission([12], [], [], bob, { from:alice })
            );
          });

          it('reverts for already-staked tokens', async () => {
            const { mining, lander, landingSite, payload } = this;

            await mining.launchMission([0], [], [], alice, { from:alice });
            await expectRevert.unspecified(
              mining.launchMission([0], [], [], alice, { from:alice })
            );

            await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });
            await expectRevert.unspecified(
              mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice })
            );

            await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

            await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });
            await expectRevert.unspecified(
              mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob })
            );

            await mining.launchMission([12], [], [], carol, { from:bob });
            await expectRevert.unspecified(
              mining.launchMission([12], [], [], carol, { from:bob })
            );
          });

          it('reverts when paused', async () => {
            const { mining, lander, landingSite, payload } = this;

            await mining.pause({ from:deployer });
            await expectRevert(
              mining.launchMission([0], [], [], alice, { from:alice }),
              "Pausable: paused"
            );
            await mining.unpause({ from:manager });

            await mining.pause({ from:manager });
            await expectRevert(
              mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice }),
              "Pausable: paused"
            );
            await mining.unpause({ from:manager });
            await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });

            await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

            await mining.pause({ from:deployer });
            await expectRevert(
              mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob }),
              "Pausable: paused"
            );
            await mining.unpause({ from:deployer });
            await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });

            await mining.pause({ from:manager });
            await expectRevert(
              mining.launchMission([12], [], [], carol, { from:bob }),
              "Pausable: paused"
            );
            await mining.unpause({ from:deployer });
            await mining.launchMission([12], [], [], carol, { from:bob });
          });

          it('transfers indicated tokens into mining contract', async () => {
            const { mining, lander, landingSite, payload } = this;

            await mining.launchMission([0], [], [], alice, { from:alice });
            assert.equal(await lander.ownerOf(0), mining.address);
            assert.equal(await lander.ownerOf(1), alice);

            await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });
            assert.equal(await lander.ownerOf(1), mining.address);
            assert.equal(await lander.ownerOf(2), alice);
            assert.equal(await payload.ownerOf(0), mining.address);
            assert.equal(await payload.ownerOf(1), mining.address);
            assert.equal(await payload.ownerOf(2), mining.address);
            assert.equal(await payload.ownerOf(3), mining.address);
            assert.equal(await payload.ownerOf(4), alice);

            await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

            await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });
            assert.equal(await lander.ownerOf(10), mining.address);
            assert.equal(await lander.ownerOf(11), bob);
            assert.equal(await landingSite.ownerOf(15), mining.address);
            assert.equal(await landingSite.ownerOf(16), bob);
            assert.equal(await payload.ownerOf(12), mining.address);
            assert.equal(await payload.ownerOf(13), bob);
            assert.equal(await payload.ownerOf(14), mining.address);
            assert.equal(await payload.ownerOf(15), bob);
            assert.equal(await payload.ownerOf(16), mining.address);

            await mining.launchMission([12], [], [], carol, { from:bob });
            assert.equal(await lander.ownerOf(12), mining.address);
            assert.equal(await lander.ownerOf(13), bob);
          });

          it('records mission details in "missionStatus" response', async () => {
            const { mining, landingSite } = this;
            let res;

            // time-sensitive testing is iffy. Allow 1 second wiggle-room
            const assertTimeEqual = (real, expected) => {
                realStr = real.toString();
                assert.ok(
                  realStr == `${expected}` || realStr == `${expected + 1}`,
                  `AssertionError: expected ${real} (as ${realStr}) to ~equal '${expected}'`
                );
            }

            await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

            await mining.launchMission([0], [], [], alice, { from:alice });
            const missionTime0 = await time.latest();

            res = await mining.missionStatus(0);
            assert.equal(res.user, alice)
            assert.equal(res.miningPower, '100')
            assert.equal(res.staked, true)
            assertTimeEqual(res.stakeDuration, 0)

            // time-sensitive testing is iffy. Allow 1 second wiggle-room

            await time.increase(14)
            res = await mining.missionStatus(0);
            assert.equal(res.user, alice)
            assert.equal(res.miningPower, '100')
            assert.equal(res.staked, true)
            assertTimeEqual(res.stakeDuration, 14)

            await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });
            const missionTime1 = await time.latest();

            res = await mining.missionStatus(1);
            assert.equal(res.user, alice)
            assert.equal(res.miningPower, '140')
            assert.equal(res.staked, true)
            assertTimeEqual(res.stakeDuration, 0)

            await time.increase(8)
            await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });
            const missionTime2 = await time.latest();

            res = await mining.missionStatus(2);
            assert.equal(res.user, carol)
            assert.equal(res.miningPower, '180')
            assert.equal(res.staked, true)
            assertTimeEqual(res.stakeDuration, 0)

            await time.increase(20)
            await mining.launchMission([12], [], [], carol, { from:bob });
            const missionTime3 = await time.latest();

            res = await mining.missionStatus(3);
            assert.equal(res.user, carol)
            assert.equal(res.miningPower, '100')
            assert.equal(res.staked, true)
            assertTimeEqual(res.stakeDuration, 0)

            await time.increase(2)
            const t = await time.latest()
            assertTimeEqual((await mining.missionStatus(0)).stakeDuration, t - missionTime0);
            assertTimeEqual((await mining.missionStatus(1)).stakeDuration, t - missionTime1);
            assertTimeEqual((await mining.missionStatus(2)).stakeDuration, t - missionTime2);
            assertTimeEqual((await mining.missionStatus(3)).stakeDuration, t - missionTime3);
          });

          it('records transferred tokens in "missionTokens" response', async () => {
            const { mining, lander, landingSite, payload } = this;
            let res;

            await mining.launchMission([0], [], [], alice, { from:alice });
            res = await mining.missionTokens(0);
            assert.deepEqual(res.landers.map(a => a.toString()), ["0"]);
            assert.deepEqual(res.landingSites, []);
            assert.deepEqual(res.payloads, []);

            await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });
            res = await mining.missionTokens(1);
            assert.deepEqual(res.landers.map(a => a.toString()), ["1"]);
            assert.deepEqual(res.landingSites, []);
            assert.deepEqual(res.payloads.map(a => a.toString()), ["0", "1", "2", "3"]);

            await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

            await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });
            res = await mining.missionTokens(2);
            assert.deepEqual(res.landers.map(a => a.toString()), ["10"]);
            assert.deepEqual(res.landingSites.map(a => a.toString()), ["15"]);
            assert.deepEqual(res.payloads.map(a => a.toString()), ["12", "14", "16"]);

            await mining.launchMission([12], [], [], carol, { from:bob });
            res = await mining.missionTokens(3);
            assert.deepEqual(res.landers.map(a => a.toString()), ["12"]);
            assert.deepEqual(res.landingSites, []);
            assert.deepEqual(res.payloads, []);
          });

          it('emits "MissionLaunched" event', async () => {
            const { mining, lander, landingSite, payload } = this;
            let res;

            res = await mining.launchMission([0], [], [], alice, { from:alice });
            await expectEvent.inTransaction(res.tx, mining, "MissionLaunched", {
              user: alice,
              missionId: '0',
              to: alice,
              miningPower: '100'
            });

            res = await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });
            await expectEvent.inTransaction(res.tx, mining, "MissionLaunched", {
              user: alice,
              missionId: '1',
              to: alice,
              miningPower: '140'
            });

            await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

            res = await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });
            await expectEvent.inTransaction(res.tx, mining, "MissionLaunched", {
              user: bob,
              missionId: '2',
              to: carol,
              miningPower: '180'
            });

            res = await mining.launchMission([12], [], [], carol, { from:bob });
            await expectEvent.inTransaction(res.tx, mining, "MissionLaunched", {
              user: bob,
              missionId: '3',
              to: carol,
              miningPower: '100'
            });
          });

          it('updates internal records as expected', async () => {
            const { mining, lander, landingSite, payload } = this;

            let user, mission;

            await mining.launchMission([0], [], [], alice, { from:alice });
            assert.equal(await mining.totalMiningPower(), '100');
            assert.equal(await mining.missionCount(), '1');
            assert.equal(await mining.stakedMissionCount(), '1');
            assert.equal(await mining.stakedMissions(0), '0');
            assert.equal(await mining.userMissionCount(alice), '1');
            assert.equal(await mining.userMissions(alice, 0), '0');

            user = await mining.userInfo(alice);
            assert.equal(user.miningPower, '100');
            assert.equal(user.released, '0');

            mission = await mining.missionInfo(0);
            assert.equal(mission.staked, true);
            assert.equal(mission.user, alice);
            assert.equal(mission.userMissionsIndex, '0');
            assert.equal(mission.miningPower, '100');

            await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });
            // test mission 1, power 140
            assert.equal(await mining.totalMiningPower(), '240');
            assert.equal(await mining.missionCount(), '2');
            assert.equal(await mining.stakedMissionCount(), '2');
            assert.equal(await mining.stakedMissions(0), '0');
            assert.equal(await mining.stakedMissions(1), '1');
            assert.equal(await mining.userMissionCount(alice), '2');
            assert.equal(await mining.userMissions(alice, 0), '0');
            assert.equal(await mining.userMissions(alice, 1), '1');

            user = await mining.userInfo(alice);
            assert.equal(user.miningPower, '240');
            assert.equal(user.released, '0');

            mission = await mining.missionInfo(1);
            assert.equal(mission.staked, true);
            assert.equal(mission.user, alice);
            assert.equal(mission.userMissionsIndex, '1');
            assert.equal(mission.miningPower, '140');

            await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

            await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });
            // test mission 2, power 180
            assert.equal(await mining.totalMiningPower(), '420');
            assert.equal(await mining.missionCount(), '3');
            assert.equal(await mining.stakedMissionCount(), '3');
            assert.equal(await mining.stakedMissions(0), '0');
            assert.equal(await mining.stakedMissions(1), '1');
            assert.equal(await mining.stakedMissions(2), '2');
            assert.equal(await mining.userMissionCount(alice), '2');
            assert.equal(await mining.userMissionCount(carol), '1');
            assert.equal(await mining.userMissions(alice, 0), '0');
            assert.equal(await mining.userMissions(alice, 1), '1');
            assert.equal(await mining.userMissions(carol, 0), '2');

            user = await mining.userInfo(carol);
            assert.equal(user.miningPower, '180');
            assert.equal(user.released, '0');

            mission = await mining.missionInfo(2);
            assert.equal(mission.staked, true);
            assert.equal(mission.user, carol);
            assert.equal(mission.userMissionsIndex, '0');
            assert.equal(mission.miningPower, '180');

            await mining.launchMission([12], [], [], carol, { from:bob });
            // test mission 3, power 100
            assert.equal(await mining.totalMiningPower(), '520');
            assert.equal(await mining.missionCount(), '4');
            assert.equal(await mining.stakedMissionCount(), '4');
            assert.equal(await mining.stakedMissions(0), '0');
            assert.equal(await mining.stakedMissions(1), '1');
            assert.equal(await mining.stakedMissions(2), '2');
            assert.equal(await mining.stakedMissions(3), '3');
            assert.equal(await mining.userMissionCount(alice), '2');
            assert.equal(await mining.userMissionCount(carol), '2');
            assert.equal(await mining.userMissions(alice, 0), '0');
            assert.equal(await mining.userMissions(alice, 1), '1');
            assert.equal(await mining.userMissions(carol, 0), '2');
            assert.equal(await mining.userMissions(carol, 1), '3');

            user = await mining.userInfo(carol);
            assert.equal(user.miningPower, '280');
            assert.equal(user.released, '0');

            mission = await mining.missionInfo(3);
            assert.equal(mission.staked, true);
            assert.equal(mission.user, carol);
            assert.equal(mission.userMissionsIndex, '1');
            assert.equal(mission.miningPower, '100');
          });

          context('with complete checker evaluating missions', () => {
            let checker;

            beforeEach(async () => {
              const { mining } = this;
              checker = await MockMissionChecker.new();
              await mining.setMissionCompleteChecker(checker.address, { from:manager });
              await mining.setMissionCompleteMultiplier(3, 2, { from:manager });  // 150%
            });

            it('reverts for invalid missions', async () => {
              const { mining, landingSite } = this;
              await expectRevert(
                mining.launchMission([], [], [1], alice, { from:alice }),
                "IMSMM: invalid mission"
              );

              await expectRevert(
                mining.launchMission([1, 2], [], [1], alice, { from:alice }),
                "IMSMM: invalid mission"
              );

              await expectRevert(
                mining.launchMission([1], [0], [], alice, { from:alice }),
                "IMSMM: invalid mission"
              );

              await checker.setResult(true);

              await expectRevert(
                mining.launchMission([2], [], [1, 2, 3, 4, 5, 6, 7, 8, 9], alice, { from:alice }),
                "IMSMM: invalid mission"
              );

              await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

              await expectRevert(
                mining.launchMission([], [1], [], alice, { from:alice }),
                "IMSMM: invalid mission"
              );

              await expectRevert(
                mining.launchMission([2], [1, 2], [], alice, { from:alice }),
                "IMSMM: invalid mission"
              );
            });

            it('reverts for nonexistent tokens', async () => {
              const { mining, lander, landingSite, payload } = this;

              await expectRevert.unspecified(
                mining.launchMission([30], [], [], alice, { from:alice })
              );

              await expectRevert.unspecified(
                mining.launchMission([1], [], [30, 1, 2, 3], alice, { from:alice })
              );

              await checker.setResult(true);
              await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

              await expectRevert.unspecified(
                mining.launchMission([10], [45], [12, 14, 16], carol, { from:bob })
              );

              await expectRevert.unspecified(
                mining.launchMission([42], [], [], carol, { from:bob })
              );
            });

            it('reverts for unowned tokens', async () => {
              const { mining, lander, landingSite, payload } = this;

              await expectRevert.unspecified(
                mining.launchMission([0], [], [], alice, { from:bob })
              );

              await expectRevert.unspecified(
                mining.launchMission([1], [], [0, 1, 2, 3], carol, { from:carol })
              );

              await checker.setResult(true);
              await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

              await expectRevert.unspecified(
                mining.launchMission([10], [15], [12, 14, 16], carol, { from:carol })
              );

              await expectRevert.unspecified(
                mining.launchMission([12], [], [], bob, { from:alice })
              );
            });

            it('reverts for already-staked tokens', async () => {
              const { mining, lander, landingSite, payload } = this;

              await mining.launchMission([0], [], [], alice, { from:alice });
              await expectRevert.unspecified(
                mining.launchMission([0], [], [], alice, { from:alice })
              );

              await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });
              await expectRevert.unspecified(
                mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice })
              );

              await checker.setResult(true);
              await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

              await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });
              await expectRevert.unspecified(
                mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob })
              );

              await mining.launchMission([12], [], [], carol, { from:bob });
              await expectRevert.unspecified(
                mining.launchMission([12], [], [], carol, { from:bob })
              );
            });

            it('reverts when paused', async () => {
              const { mining, lander, landingSite, payload } = this;

              await mining.pause({ from:deployer });
              await expectRevert(
                mining.launchMission([0], [], [], alice, { from:alice }),
                "Pausable: paused"
              );
              await mining.unpause({ from:manager });

              await mining.pause({ from:manager });
              await expectRevert(
                mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice }),
                "Pausable: paused"
              );
              await mining.unpause({ from:manager });
              await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });

              await checker.setResult(true);
              await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

              await mining.pause({ from:deployer });
              await expectRevert(
                mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob }),
                "Pausable: paused"
              );
              await mining.unpause({ from:deployer });
              await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });

              await mining.pause({ from:manager });
              await expectRevert(
                mining.launchMission([12], [], [], carol, { from:bob }),
                "Pausable: paused"
              );
              await mining.unpause({ from:deployer });
              await mining.launchMission([12], [], [], carol, { from:bob });
            });

            it('transfers indicated tokens into mining contract', async () => {
              const { mining, lander, landingSite, payload } = this;

              await mining.launchMission([0], [], [], alice, { from:alice });
              assert.equal(await lander.ownerOf(0), mining.address);
              assert.equal(await lander.ownerOf(1), alice);

              await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });
              assert.equal(await lander.ownerOf(1), mining.address);
              assert.equal(await lander.ownerOf(2), alice);
              assert.equal(await payload.ownerOf(0), mining.address);
              assert.equal(await payload.ownerOf(1), mining.address);
              assert.equal(await payload.ownerOf(2), mining.address);
              assert.equal(await payload.ownerOf(3), mining.address);
              assert.equal(await payload.ownerOf(4), alice);

              await checker.setResult(true);
              await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

              await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });
              assert.equal(await lander.ownerOf(10), mining.address);
              assert.equal(await lander.ownerOf(11), bob);
              assert.equal(await landingSite.ownerOf(15), mining.address);
              assert.equal(await landingSite.ownerOf(16), bob);
              assert.equal(await payload.ownerOf(12), mining.address);
              assert.equal(await payload.ownerOf(13), bob);
              assert.equal(await payload.ownerOf(14), mining.address);
              assert.equal(await payload.ownerOf(15), bob);
              assert.equal(await payload.ownerOf(16), mining.address);

              await mining.launchMission([12], [], [], carol, { from:bob });
              assert.equal(await lander.ownerOf(12), mining.address);
              assert.equal(await lander.ownerOf(13), bob);
            });

            it('records mission details in "missionStatus" response', async () => {
              const { mining, landingSite } = this;
              let res;

              // time-sensitive testing is iffy. Allow 1 second wiggle-room
              const assertTimeEqual = (real, expected) => {
                  realStr = real.toString();
                  assert.ok(
                    realStr == `${expected}` || realStr == `${expected + 1}`,
                    `AssertionError: expected ${real} (as ${realStr}) to ~equal '${expected}'`
                  );
              }

              await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

              await checker.setResult(true);
              await mining.launchMission([0], [], [], alice, { from:alice });
              const missionTime0 = await time.latest();

              res = await mining.missionStatus(0);
              assert.equal(res.user, alice)
              assert.equal(res.miningPower, '150')
              assert.equal(res.staked, true)
              assertTimeEqual(res.stakeDuration, 0)

              // time-sensitive testing is iffy. Allow 1 second wiggle-room

              await time.increase(14)
              res = await mining.missionStatus(0);
              assert.equal(res.user, alice)
              assert.equal(res.miningPower, '150')
              assert.equal(res.staked, true)
              assertTimeEqual(res.stakeDuration, 14)

              await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });
              const missionTime1 = await time.latest();

              res = await mining.missionStatus(1);
              assert.equal(res.user, alice)
              assert.equal(res.miningPower, '210')
              assert.equal(res.staked, true)
              assertTimeEqual(res.stakeDuration, 0)

              await time.increase(8)
              await checker.setResult(false);
              await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });
              const missionTime2 = await time.latest();

              res = await mining.missionStatus(2);
              assert.equal(res.user, carol)
              assert.equal(res.miningPower, '180')
              assert.equal(res.staked, true)
              assertTimeEqual(res.stakeDuration, 0)

              await time.increase(20)
              await mining.launchMission([12], [], [], carol, { from:bob });
              const missionTime3 = await time.latest();

              res = await mining.missionStatus(3);
              assert.equal(res.user, carol)
              assert.equal(res.miningPower, '100')
              assert.equal(res.staked, true)
              assertTimeEqual(res.stakeDuration, 0)

              await time.increase(2)
              const t = await time.latest()
              assertTimeEqual((await mining.missionStatus(0)).stakeDuration, t - missionTime0);
              assertTimeEqual((await mining.missionStatus(1)).stakeDuration, t - missionTime1);
              assertTimeEqual((await mining.missionStatus(2)).stakeDuration, t - missionTime2);
              assertTimeEqual((await mining.missionStatus(3)).stakeDuration, t - missionTime3);
            });

            it('records transferred tokens in "missionTokens" response', async () => {
              const { mining, lander, landingSite, payload } = this;
              let res;

              await mining.launchMission([0], [], [], alice, { from:alice });
              res = await mining.missionTokens(0);
              assert.deepEqual(res.landers.map(a => a.toString()), ["0"]);
              assert.deepEqual(res.landingSites, []);
              assert.deepEqual(res.payloads, []);

              await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });
              res = await mining.missionTokens(1);
              assert.deepEqual(res.landers.map(a => a.toString()), ["1"]);
              assert.deepEqual(res.landingSites, []);
              assert.deepEqual(res.payloads.map(a => a.toString()), ["0", "1", "2", "3"]);

              await checker.setResult(true);
              await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

              await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });
              res = await mining.missionTokens(2);
              assert.deepEqual(res.landers.map(a => a.toString()), ["10"]);
              assert.deepEqual(res.landingSites.map(a => a.toString()), ["15"]);
              assert.deepEqual(res.payloads.map(a => a.toString()), ["12", "14", "16"]);

              await mining.launchMission([12], [], [], carol, { from:bob });
              res = await mining.missionTokens(3);
              assert.deepEqual(res.landers.map(a => a.toString()), ["12"]);
              assert.deepEqual(res.landingSites, []);
              assert.deepEqual(res.payloads, []);
            });

            it('emits "MissionLaunched" event', async () => {
              const { mining, lander, landingSite, payload } = this;
              let res;

              await checker.setResult(true);
              res = await mining.launchMission([0], [], [], alice, { from:alice });
              await expectEvent.inTransaction(res.tx, mining, "MissionLaunched", {
                user: alice,
                missionId: '0',
                to: alice,
                miningPower: '150'
              });

              res = await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });
              await expectEvent.inTransaction(res.tx, mining, "MissionLaunched", {
                user: alice,
                missionId: '1',
                to: alice,
                miningPower: '210'
              });

              await checker.setResult(false);
              await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

              res = await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });
              await expectEvent.inTransaction(res.tx, mining, "MissionLaunched", {
                user: bob,
                missionId: '2',
                to: carol,
                miningPower: '180'
              });

              res = await mining.launchMission([12], [], [], carol, { from:bob });
              await expectEvent.inTransaction(res.tx, mining, "MissionLaunched", {
                user: bob,
                missionId: '3',
                to: carol,
                miningPower: '100'
              });
            });

            it('updates internal records as expected', async () => {
              const { mining, lander, landingSite, payload } = this;

              let user, mission;

              await checker.setResult(true);
              await mining.launchMission([0], [], [], alice, { from:alice });
              assert.equal(await mining.totalMiningPower(), '150');
              assert.equal(await mining.missionCount(), '1');
              assert.equal(await mining.stakedMissionCount(), '1');
              assert.equal(await mining.stakedMissions(0), '0');
              assert.equal(await mining.userMissionCount(alice), '1');
              assert.equal(await mining.userMissions(alice, 0), '0');

              user = await mining.userInfo(alice);
              assert.equal(user.miningPower, '150');
              assert.equal(user.released, '0');

              mission = await mining.missionInfo(0);
              assert.equal(mission.staked, true);
              assert.equal(mission.user, alice);
              assert.equal(mission.userMissionsIndex, '0');
              assert.equal(mission.miningPower, '150');

              await checker.setResult(false);
              await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });
              // test mission 1, power 140
              assert.equal(await mining.totalMiningPower(), '290');
              assert.equal(await mining.missionCount(), '2');
              assert.equal(await mining.stakedMissionCount(), '2');
              assert.equal(await mining.stakedMissions(0), '0');
              assert.equal(await mining.stakedMissions(1), '1');
              assert.equal(await mining.userMissionCount(alice), '2');
              assert.equal(await mining.userMissions(alice, 0), '0');
              assert.equal(await mining.userMissions(alice, 1), '1');

              user = await mining.userInfo(alice);
              assert.equal(user.miningPower, '290');
              assert.equal(user.released, '0');

              mission = await mining.missionInfo(1);
              assert.equal(mission.staked, true);
              assert.equal(mission.user, alice);
              assert.equal(mission.userMissionsIndex, '1');
              assert.equal(mission.miningPower, '140');

              await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

              await checker.setResult(true);
              await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });
              // test mission 2, power 180 * 1.5 = 270
              assert.equal(await mining.totalMiningPower(), '560');
              assert.equal(await mining.missionCount(), '3');
              assert.equal(await mining.stakedMissionCount(), '3');
              assert.equal(await mining.stakedMissions(0), '0');
              assert.equal(await mining.stakedMissions(1), '1');
              assert.equal(await mining.stakedMissions(2), '2');
              assert.equal(await mining.userMissionCount(alice), '2');
              assert.equal(await mining.userMissionCount(carol), '1');
              assert.equal(await mining.userMissions(alice, 0), '0');
              assert.equal(await mining.userMissions(alice, 1), '1');
              assert.equal(await mining.userMissions(carol, 0), '2');

              user = await mining.userInfo(carol);
              assert.equal(user.miningPower, '270');
              assert.equal(user.released, '0');

              mission = await mining.missionInfo(2);
              assert.equal(mission.staked, true);
              assert.equal(mission.user, carol);
              assert.equal(mission.userMissionsIndex, '0');
              assert.equal(mission.miningPower, '270');

              await checker.setResult(false);
              await mining.launchMission([12], [], [], carol, { from:bob });
              // test mission 3, power 100
              assert.equal(await mining.totalMiningPower(), '660');
              assert.equal(await mining.missionCount(), '4');
              assert.equal(await mining.stakedMissionCount(), '4');
              assert.equal(await mining.stakedMissions(0), '0');
              assert.equal(await mining.stakedMissions(1), '1');
              assert.equal(await mining.stakedMissions(2), '2');
              assert.equal(await mining.stakedMissions(3), '3');
              assert.equal(await mining.userMissionCount(alice), '2');
              assert.equal(await mining.userMissionCount(carol), '2');
              assert.equal(await mining.userMissions(alice, 0), '0');
              assert.equal(await mining.userMissions(alice, 1), '1');
              assert.equal(await mining.userMissions(carol, 0), '2');
              assert.equal(await mining.userMissions(carol, 1), '3');

              user = await mining.userInfo(carol);
              assert.equal(user.miningPower, '370');
              assert.equal(user.released, '0');

              mission = await mining.missionInfo(3);
              assert.equal(mission.staked, true);
              assert.equal(mission.user, carol);
              assert.equal(mission.userMissionsIndex, '1');
              assert.equal(mission.miningPower, '100');
            });
          });
        });

        context('recallMission', () => {
          beforeEach(async () => {
            const { mining, lander, landingSite, payload } = this;
            await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });
          });

          it('revert for unstaked mission IDs', async () => {
            const { mining, lander, landingSite, payload } = this;

            await expectRevert(
              mining.recallMission(0, alice, { from:alice }),
              "Panic: Index out of bounds."
            );

            await expectRevert(
              mining.recallMission(3, bob, { from:carol }),
              "Panic: Index out of bounds."
            );

            await mining.launchMission([0], [], [], alice, { from:alice });
            await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });
            await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });
            await mining.launchMission([12], [], [], carol, { from:bob });

            await expectRevert(
              mining.recallMission(4, alice, { from:alice }),
              "Panic: Index out of bounds."
            );

            await expectRevert(
              mining.recallMission(5, bob, { from:carol }),
              "Panic: Index out of bounds."
            );

            await mining.recallMission(0, alice, { from:alice });
            await expectRevert(
              mining.recallMission(0, alice, { from:alice }),
              "IMSMM: mission not staked"
            );
          });

          it('revert for unowned mission IDs', async () => {
            const { mining, lander, landingSite, payload } = this;

            await mining.launchMission([0], [], [], alice, { from:alice });
            await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });
            await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });
            await mining.launchMission([12], [], [], carol, { from:bob });

            await expectRevert(
              mining.recallMission(0, alice, { from:bob }),
              "IMSMM: not mission controller"
            );

            await expectRevert(
              mining.recallMission(1, bob, { from:bob }),
              "IMSMM: not mission controller"
            );

            await expectRevert(
              mining.recallMission(2, carol, { from:bob }),
              "IMSMM: not mission controller"
            );

            await expectRevert(
              mining.recallMission(3, carol, { from:deployer }),
              "IMSMM: not mission controller"
            );
          });

          it('transfers mission tokens from the mining contract', async () => {
            const { mining, lander, landingSite, payload } = this;

            await mining.launchMission([0], [], [], alice, { from:alice });
            await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });
            await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });
            await mining.launchMission([12], [], [], carol, { from:bob });

            await mining.recallMission(2, carol, { from:carol });
            assert.equal(await lander.ownerOf(0), mining.address);
            assert.equal(await lander.ownerOf(1), mining.address);
            assert.equal(await lander.ownerOf(10), carol);
            assert.equal(await lander.ownerOf(12), mining.address);
            assert.equal(await landingSite.ownerOf(15), carol);
            assert.equal(await payload.ownerOf(12), carol);
            assert.equal(await payload.ownerOf(13), bob);
            assert.equal(await payload.ownerOf(14), carol);
            assert.equal(await payload.ownerOf(15), bob);
            assert.equal(await payload.ownerOf(16), carol);

            await mining.recallMission(0, dave, { from:alice });
            assert.equal(await lander.ownerOf(0), dave);
            assert.equal(await lander.ownerOf(1), mining.address);
            assert.equal(await lander.ownerOf(10), carol);
            assert.equal(await lander.ownerOf(12), mining.address);

            await mining.recallMission(1, dave, { from:alice });
            assert.equal(await lander.ownerOf(0), dave);
            assert.equal(await lander.ownerOf(1), dave);
            assert.equal(await lander.ownerOf(10), carol);
            assert.equal(await lander.ownerOf(12), mining.address);
            assert.equal(await payload.ownerOf(0), dave);
            assert.equal(await payload.ownerOf(1), dave);
            assert.equal(await payload.ownerOf(2), dave);
            assert.equal(await payload.ownerOf(3), dave);
            assert.equal(await payload.ownerOf(4), alice);

            await mining.recallMission(3, alice, { from:carol });
            assert.equal(await lander.ownerOf(0), dave);
            assert.equal(await lander.ownerOf(1), dave);
            assert.equal(await lander.ownerOf(10), carol);
            assert.equal(await lander.ownerOf(12), alice);
          });

          it('updates "missionStatus" response', async () => {
            const { mining, lander, landingSite, payload } = this;
            let res, t;

            // launch times: 0, 12, 17, 28
            await mining.launchMission([0], [], [], alice, { from:alice });
            const missionTime0 = await time.latest();

            await time.increase(12);
            await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });
            const missionTime1 = await time.latest();

            await time.increase(5);
            await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });
            const missionTime2 = await time.latest();

            await time.increase(11);
            await mining.launchMission([12], [], [], carol, { from:bob });
            const missionTime3 = await time.latest();

            // verify staked durations times at 30
            await time.increase(2)
            t = await time.latest();
            assert.equal((await mining.missionStatus(0)).stakeDuration, `${t - missionTime0}`)
            assert.equal((await mining.missionStatus(1)).stakeDuration, `${t - missionTime1}`)
            assert.equal((await mining.missionStatus(2)).stakeDuration, `${t - missionTime2}`)
            assert.equal((await mining.missionStatus(3)).stakeDuration, `${t - missionTime3}`)

            // recall times: 43, 48, 33, 54
            await time.increase(3);
            await mining.recallMission(2, carol, { from:carol });
            const recallTime2 = await time.latest()

            await time.increase(10);
            await mining.recallMission(0, dave, { from:alice });
            const recallTime0 = await time.latest()

            await time.increase(5);
            await mining.recallMission(1, dave, { from:alice });
            const recallTime1 = await time.latest()

            await time.increase(6);
            await mining.recallMission(3, alice, { from:carol });
            const recallTime3 = await time.latest()

            // verify staked durations, et al., at 60
            await time.increase(6);

            res = await mining.missionStatus(0);
            assert.equal(res.user, alice)
            assert.equal(res.miningPower, '100')
            assert.equal(res.staked, false)
            assert.equal(res.stakeDuration, `${recallTime0 - missionTime0}`)

            res = await mining.missionStatus(1);
            assert.equal(res.user, alice)
            assert.equal(res.miningPower, '140')
            assert.equal(res.staked, false)
            assert.equal(res.stakeDuration, `${recallTime1 - missionTime1}`)

            res = await mining.missionStatus(2);
            assert.equal(res.user, carol)
            assert.equal(res.miningPower, '180')
            assert.equal(res.staked, false)
            assert.equal(res.stakeDuration, `${recallTime2 - missionTime2}`)

            res = await mining.missionStatus(3);
            assert.equal(res.user, carol)
            assert.equal(res.miningPower, '100')
            assert.equal(res.staked, false)
            assert.equal(res.stakeDuration, `${recallTime3 - missionTime3}`)
          });

          it('emits "MissionRecalled" event', async () => {
            const { mining, lander, landingSite, payload } = this;
            let res;

            await mining.launchMission([0], [], [], alice, { from:alice });
            await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });
            await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });
            await mining.launchMission([12], [], [], carol, { from:bob });

            res = await mining.recallMission(2, carol, { from:carol });
            await expectEvent.inTransaction(res.tx, mining, "MissionRecalled", {
              user: carol,
              missionId: '2',
              to: carol,
              miningPower: '180'
            });

            res = await mining.recallMission(0, dave, { from:alice });
            await expectEvent.inTransaction(res.tx, mining, "MissionRecalled", {
              user: alice,
              missionId: '0',
              to: dave,
              miningPower: '100'
            });

            res = await mining.recallMission(1, dave, { from:alice });
            await expectEvent.inTransaction(res.tx, mining, "MissionRecalled", {
              user: alice,
              missionId: '1',
              to: dave,
              miningPower: '140'
            });

            res = await mining.recallMission(3, alice, { from:carol });
            await expectEvent.inTransaction(res.tx, mining, "MissionRecalled", {
              user: carol,
              missionId: '3',
              to: alice,
              miningPower: '100'
            });
          });

          it('updates internal records as expected', async () => {
            const { mining, lander, landingSite, payload } = this;

            await mining.launchMission([0], [], [], alice, { from:alice });
            await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });
            await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });
            await mining.launchMission([12], [], [], carol, { from:bob });

            // at this point:
            // 4 missions, all staked.
            // 2 for alice, 2 for carol
            // total mining power 520: 100, 140, 180, 100
            // alice power: 240
            // carol power: 280

            await mining.recallMission(2, carol, { from:carol });
            assert.equal(await mining.totalMiningPower(), '340');
            assert.equal(await mining.missionCount(), '4');
            assert.equal(await mining.stakedMissionCount(), '3');
            assert.equal(await mining.stakedMissions(0), '0');
            assert.equal(await mining.stakedMissions(1), '1');
            assert.equal(await mining.stakedMissions(2), '3');
            assert.equal(await mining.userMissionCount(alice), '2');
            assert.equal(await mining.userMissionCount(carol), '1');
            assert.equal(await mining.userMissions(alice, 0), '0');
            assert.equal(await mining.userMissions(alice, 1), '1');
            assert.equal(await mining.userMissions(carol, 0), '3');

            user = await mining.userInfo(carol);
            assert.equal(user.miningPower, '100');
            assert.equal(user.released, '0');

            mission = await mining.missionInfo(2);
            assert.equal(mission.staked, false);
            assert.equal(mission.user, carol);
            assert.equal(mission.userMissionsIndex, '0');
            assert.equal(mission.miningPower, '180');

            await mining.recallMission(0, dave, { from:alice });
            assert.equal(await mining.totalMiningPower(), '240');
            assert.equal(await mining.missionCount(), '4');
            assert.equal(await mining.stakedMissionCount(), '2');
            assert.equal(await mining.stakedMissions(0), '3');
            assert.equal(await mining.stakedMissions(1), '1');
            assert.equal(await mining.userMissionCount(alice), '1');
            assert.equal(await mining.userMissionCount(carol), '1');
            assert.equal(await mining.userMissions(alice, 0), '1');
            assert.equal(await mining.userMissions(carol, 0), '3');

            user = await mining.userInfo(alice);
            assert.equal(user.miningPower, '140');
            assert.equal(user.released, '0');

            mission = await mining.missionInfo(0);
            assert.equal(mission.staked, false);
            assert.equal(mission.user, alice);
            assert.equal(mission.userMissionsIndex, '0');
            assert.equal(mission.miningPower, '100');

            await mining.recallMission(1, dave, { from:alice });
            assert.equal(await mining.totalMiningPower(), '100');
            assert.equal(await mining.missionCount(), '4');
            assert.equal(await mining.stakedMissionCount(), '1');
            assert.equal(await mining.stakedMissions(0), '3');
            assert.equal(await mining.userMissionCount(alice), '0');
            assert.equal(await mining.userMissionCount(carol), '1');
            assert.equal(await mining.userMissions(carol, 0), '3');

            user = await mining.userInfo(alice);
            assert.equal(user.miningPower, '0');
            assert.equal(user.released, '0');

            mission = await mining.missionInfo(1);
            assert.equal(mission.staked, false);
            assert.equal(mission.user, alice);
            assert.equal(mission.userMissionsIndex, '0');
            assert.equal(mission.miningPower, '140');

            await mining.recallMission(3, alice, { from:carol });
            assert.equal(await mining.totalMiningPower(), '0');
            assert.equal(await mining.missionCount(), '4');
            assert.equal(await mining.stakedMissionCount(), '0');
            assert.equal(await mining.userMissionCount(alice), '0');
            assert.equal(await mining.userMissionCount(carol), '0');

            user = await mining.userInfo(carol);
            assert.equal(user.miningPower, '0');
            assert.equal(user.released, '0');

            mission = await mining.missionInfo(3);
            assert.equal(mission.staked, false);
            assert.equal(mission.user, carol);
            assert.equal(mission.userMissionsIndex, '0');
            assert.equal(mission.miningPower, '100');
          });
        });

        context('reappraiseMission', () => {
          beforeEach(async () => {
            const { mining, lander, landingSite, payload } = this;
            await mining.setMissionLandingSiteToken(landingSite.address, { from:deployer });

            await mining.launchMission([0], [], [], alice, { from:alice });
            await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });
            await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });
            await mining.launchMission([12], [], [], carol, { from:bob });
          });

          it('reverts for unstaked mission', async () => {
            const { mining, lander, landingSite, payload } = this;
            await expectRevert(
              mining.reappraiseMission(4, { from:dave }),
              "Panic: Index out of bounds."
            );

            await expectRevert(
              mining.reappraiseMission(10, { from:deployer }),
              "Panic: Index out of bounds."
            );

            await mining.recallMission(0, alice, { from:alice });
            await mining.recallMission(2, carol, { from:carol });

            await expectRevert(
              mining.reappraiseMission(0, { from:alice }),
              "IMSMM: mission not staked"
            );

            await expectRevert(
              mining.reappraiseMission(2, { from:carol }),
              "IMSMM: mission not staked"
            );
          });

          it('keeps current internal state', async () => {
            const { mining, lander, landingSite, payload } = this;

            await mining.reappraiseMission(0, { from:alice });
            assert.equal(await mining.totalMiningPower(), '520');
            assert.equal(await mining.missionCount(), '4');
            assert.equal(await mining.stakedMissionCount(), '4');
            assert.equal(await mining.stakedMissions(0), '0');
            assert.equal(await mining.stakedMissions(1), '1');
            assert.equal(await mining.stakedMissions(2), '2');
            assert.equal(await mining.stakedMissions(3), '3');
            assert.equal(await mining.userMissionCount(alice), '2');
            assert.equal(await mining.userMissionCount(carol), '2');
            assert.equal(await mining.userMissions(alice, 0), '0');
            assert.equal(await mining.userMissions(alice, 1), '1');
            assert.equal(await mining.userMissions(carol, 0), '2');
            assert.equal(await mining.userMissions(carol, 1), '3');

            user = await mining.userInfo(alice);
            assert.equal(user.miningPower, '240');
            assert.equal(user.released, '0');

            mission = await mining.missionInfo(0);
            assert.equal(mission.staked, true);
            assert.equal(mission.user, alice);
            assert.equal(mission.userMissionsIndex, '0');
            assert.equal(mission.miningPower, '100');

            await mining.reappraiseMission(1, { from:dave });
            assert.equal(await mining.totalMiningPower(), '520');
            assert.equal(await mining.missionCount(), '4');
            assert.equal(await mining.stakedMissionCount(), '4');
            assert.equal(await mining.stakedMissions(0), '0');
            assert.equal(await mining.stakedMissions(1), '1');
            assert.equal(await mining.stakedMissions(2), '2');
            assert.equal(await mining.stakedMissions(3), '3');
            assert.equal(await mining.userMissionCount(alice), '2');
            assert.equal(await mining.userMissionCount(carol), '2');
            assert.equal(await mining.userMissions(alice, 0), '0');
            assert.equal(await mining.userMissions(alice, 1), '1');
            assert.equal(await mining.userMissions(carol, 0), '2');
            assert.equal(await mining.userMissions(carol, 1), '3');

            user = await mining.userInfo(alice);
            assert.equal(user.miningPower, '240');
            assert.equal(user.released, '0');

            mission = await mining.missionInfo(1);
            assert.equal(mission.staked, true);
            assert.equal(mission.user, alice);
            assert.equal(mission.userMissionsIndex, '1');
            assert.equal(mission.miningPower, '140');

            await mining.reappraiseMission(2, { from:carol });
            assert.equal(await mining.totalMiningPower(), '520');
            assert.equal(await mining.missionCount(), '4');
            assert.equal(await mining.stakedMissionCount(), '4');
            assert.equal(await mining.stakedMissions(0), '0');
            assert.equal(await mining.stakedMissions(1), '1');
            assert.equal(await mining.stakedMissions(2), '2');
            assert.equal(await mining.stakedMissions(3), '3');
            assert.equal(await mining.userMissionCount(alice), '2');
            assert.equal(await mining.userMissionCount(carol), '2');
            assert.equal(await mining.userMissions(alice, 0), '0');
            assert.equal(await mining.userMissions(alice, 1), '1');
            assert.equal(await mining.userMissions(carol, 0), '2');
            assert.equal(await mining.userMissions(carol, 1), '3');

            user = await mining.userInfo(carol);
            assert.equal(user.miningPower, '280');
            assert.equal(user.released, '0');

            mission = await mining.missionInfo(2);
            assert.equal(mission.staked, true);
            assert.equal(mission.user, carol);
            assert.equal(mission.userMissionsIndex, '0');
            assert.equal(mission.miningPower, '180');

            await mining.reappraiseMission(3, { from:carol });
            assert.equal(await mining.totalMiningPower(), '520');
            assert.equal(await mining.missionCount(), '4');
            assert.equal(await mining.stakedMissionCount(), '4');
            assert.equal(await mining.stakedMissions(0), '0');
            assert.equal(await mining.stakedMissions(1), '1');
            assert.equal(await mining.stakedMissions(2), '2');
            assert.equal(await mining.stakedMissions(3), '3');
            assert.equal(await mining.userMissionCount(alice), '2');
            assert.equal(await mining.userMissionCount(carol), '2');
            assert.equal(await mining.userMissions(alice, 0), '0');
            assert.equal(await mining.userMissions(alice, 1), '1');
            assert.equal(await mining.userMissions(carol, 0), '2');
            assert.equal(await mining.userMissions(carol, 1), '3');

            user = await mining.userInfo(carol);
            assert.equal(user.miningPower, '280');
            assert.equal(user.released, '0');

            mission = await mining.missionInfo(3);
            assert.equal(mission.staked, true);
            assert.equal(mission.user, carol);
            assert.equal(mission.userMissionsIndex, '1');
            assert.equal(mission.miningPower, '100');
          });

          it('emits "MissionAppraised" event', async () => {
            const { mining, lander, landingSite, payload } = this;
            let res;

            res = await mining.reappraiseMission(0, { from:alice });
            await expectEvent.inTransaction(res.tx, mining, "MissionAppraised", {
              missionId: '0',
              to: alice,
              previousMiningPower: '100',
              miningPower: '100'
            });

            res = await mining.reappraiseMission(1, { from:dave });
            await expectEvent.inTransaction(res.tx, mining, "MissionAppraised", {
              missionId: '1',
              to: alice,
              previousMiningPower: '140',
              miningPower: '140'
            });

            res = await mining.reappraiseMission(2, { from:carol });
            await expectEvent.inTransaction(res.tx, mining, "MissionAppraised", {
              missionId: '2',
              to: carol,
              previousMiningPower: '180',
              miningPower: '180'
            });

            res = await mining.reappraiseMission(3, { from:deployer });
            await expectEvent.inTransaction(res.tx, mining, "MissionAppraised", {
              missionId: '3',
              to: carol,
              previousMiningPower: '100',
              miningPower: '100'
            });
          });

          context('with updated token appraisals', () => {
            beforeEach(async () => {
              const { lander, landingSite, payload, appraiser, mining, token, faucet } = this;

              await appraiser.setAppraises(lander.address, true, '80', { from:deployer });
              await appraiser.setAppraises(landingSite.address, true, '40', { from:deployer });
              await appraiser.setAppraises(payload.address,  true, '20', { from:deployer  });

              await appraiser.setAppraisals(lander.address, [0, 1, 2], [150, 200, 250], { from:deployer });
              await appraiser.setAppraisals(landingSite.address, [15], [1000], { from:deployer });
              await appraiser.setAppraisals(payload.address, [0, 1, 12, 13], [0, 10, 120, 130], { from:deployer });

              await mining.setMissionCompleteMultiplier(10, 9, { from:deployer });

              await token.mint(faucet.address, 100000000000);

              // mission 0: power 100 -> 150
              // await mining.launchMission([0], [], [], alice, { from:alice });

              // mission 1: power 140 -> 250
              // await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });

              // mission 2: power 180 -> 1377
              // await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });

              // mission 3:  power 100 -> 80
              // await mining.launchMission([12], [], [], carol, { from:bob });
            });

            it('updates internal state', async () => {
              const { mining, lander, landingSite, payload } = this;

              // 100 -> 150
              await mining.reappraiseMission(0, { from:alice });
              assert.equal(await mining.totalMiningPower(), '570');
              assert.equal(await mining.missionCount(), '4');
              assert.equal(await mining.stakedMissionCount(), '4');
              assert.equal(await mining.stakedMissions(0), '0');
              assert.equal(await mining.stakedMissions(1), '1');
              assert.equal(await mining.stakedMissions(2), '2');
              assert.equal(await mining.stakedMissions(3), '3');
              assert.equal(await mining.userMissionCount(alice), '2');
              assert.equal(await mining.userMissionCount(carol), '2');
              assert.equal(await mining.userMissions(alice, 0), '0');
              assert.equal(await mining.userMissions(alice, 1), '1');
              assert.equal(await mining.userMissions(carol, 0), '2');
              assert.equal(await mining.userMissions(carol, 1), '3');

              user = await mining.userInfo(alice);
              assert.equal(user.miningPower, '290');
              assert.equal(user.released, '0');

              mission = await mining.missionInfo(0);
              assert.equal(mission.staked, true);
              assert.equal(mission.user, alice);
              assert.equal(mission.userMissionsIndex, '0');
              assert.equal(mission.miningPower, '150');

              // 140 -> 250
              await mining.reappraiseMission(1, { from:dave });
              assert.equal(await mining.totalMiningPower(), '680');
              assert.equal(await mining.missionCount(), '4');
              assert.equal(await mining.stakedMissionCount(), '4');
              assert.equal(await mining.stakedMissions(0), '0');
              assert.equal(await mining.stakedMissions(1), '1');
              assert.equal(await mining.stakedMissions(2), '2');
              assert.equal(await mining.stakedMissions(3), '3');
              assert.equal(await mining.userMissionCount(alice), '2');
              assert.equal(await mining.userMissionCount(carol), '2');
              assert.equal(await mining.userMissions(alice, 0), '0');
              assert.equal(await mining.userMissions(alice, 1), '1');
              assert.equal(await mining.userMissions(carol, 0), '2');
              assert.equal(await mining.userMissions(carol, 1), '3');

              user = await mining.userInfo(alice);
              assert.equal(user.miningPower, '400');
              assert.equal(user.released, '0');

              mission = await mining.missionInfo(1);
              assert.equal(mission.staked, true);
              assert.equal(mission.user, alice);
              assert.equal(mission.userMissionsIndex, '1');
              assert.equal(mission.miningPower, '250');

              // 180 -> 1377
              await mining.reappraiseMission(2, { from:carol });
              assert.equal(await mining.totalMiningPower(), '1877');
              assert.equal(await mining.missionCount(), '4');
              assert.equal(await mining.stakedMissionCount(), '4');
              assert.equal(await mining.stakedMissions(0), '0');
              assert.equal(await mining.stakedMissions(1), '1');
              assert.equal(await mining.stakedMissions(2), '2');
              assert.equal(await mining.stakedMissions(3), '3');
              assert.equal(await mining.userMissionCount(alice), '2');
              assert.equal(await mining.userMissionCount(carol), '2');
              assert.equal(await mining.userMissions(alice, 0), '0');
              assert.equal(await mining.userMissions(alice, 1), '1');
              assert.equal(await mining.userMissions(carol, 0), '2');
              assert.equal(await mining.userMissions(carol, 1), '3');

              user = await mining.userInfo(carol);
              assert.equal(user.miningPower, '1477');
              assert.equal(user.released, '0');

              mission = await mining.missionInfo(2);
              assert.equal(mission.staked, true);
              assert.equal(mission.user, carol);
              assert.equal(mission.userMissionsIndex, '0');
              assert.equal(mission.miningPower, '1377');

              // 100 -> 80
              await mining.reappraiseMission(3, { from:carol });
              assert.equal(await mining.totalMiningPower(), '1857');
              assert.equal(await mining.missionCount(), '4');
              assert.equal(await mining.stakedMissionCount(), '4');
              assert.equal(await mining.stakedMissions(0), '0');
              assert.equal(await mining.stakedMissions(1), '1');
              assert.equal(await mining.stakedMissions(2), '2');
              assert.equal(await mining.stakedMissions(3), '3');
              assert.equal(await mining.userMissionCount(alice), '2');
              assert.equal(await mining.userMissionCount(carol), '2');
              assert.equal(await mining.userMissions(alice, 0), '0');
              assert.equal(await mining.userMissions(alice, 1), '1');
              assert.equal(await mining.userMissions(carol, 0), '2');
              assert.equal(await mining.userMissions(carol, 1), '3');

              user = await mining.userInfo(carol);
              assert.equal(user.miningPower, '1457');
              assert.equal(user.released, '0');

              mission = await mining.missionInfo(3);
              assert.equal(mission.staked, true);
              assert.equal(mission.user, carol);
              assert.equal(mission.userMissionsIndex, '1');
              assert.equal(mission.miningPower, '80');
            });

            it('does not affect already-mined rewards', async () => {
              const { mining, lander, landingSite, payload, faucet } = this;

              // total: 520, alice: 240, carol; 280
              await faucet.setOwed(mining.address, 1040);
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');

              // reappraise
              await mining.reappraiseMission(0, { from:alice });
              await mining.reappraiseMission(1, { from:dave });
              await mining.reappraiseMission(2, { from:carol });
              await mining.reappraiseMission(3, { from:carol });

              // total: 1857, alice: 400, carol: 1457
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');
            });

            it('does not affect already-released rewards', async () => {
              const { mining, lander, landingSite, payload, faucet, token } = this;

              // total: 520, alice: 240, carol; 280
              await faucet.setOwed(mining.address, 1040);
              await mining.methods["release(address,address,uint256)"](alice, alice, 400, { from:alice });
              await mining.methods["release(address,address,uint256)"](carol, carol, 500, { from:carol });
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '80');
              assert.equal(await mining.releasable(carol), '60');
              assert.equal(await token.balanceOf(alice), '400');
              assert.equal(await token.balanceOf(carol), '500');

              // reappraise
              await mining.reappraiseMission(0, { from:alice });
              await mining.reappraiseMission(1, { from:dave });
              await mining.reappraiseMission(2, { from:carol });
              await mining.reappraiseMission(3, { from:carol });

              // total: 1857, alice: 400, carol: 1457
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '80');
              assert.equal(await mining.releasable(carol), '60');
              await mining.release(alice, alice, { from:alice });
              await mining.release(carol, carol, { from:carol });
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '0');
              assert.equal(await mining.releasable(carol), '0');
              assert.equal(await token.balanceOf(alice), '480');
              assert.equal(await token.balanceOf(carol), '560');
            });

            it('affects rewards mined after reappraisal', async () => {
              const { mining, lander, landingSite, payload, faucet } = this;

              // total: 520, alice: 240, carol; 280
              await faucet.setOwed(mining.address, 1040);
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');

              // reappraise
              await mining.reappraiseMission(0, { from:alice });
              await mining.reappraiseMission(1, { from:dave });
              await mining.reappraiseMission(2, { from:carol });
              await mining.reappraiseMission(3, { from:carol });

              // total: 1857, alice: 400, carol: 1457
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');

              await faucet.addOwed(mining.address, 1857);
              assert.equal(await mining.totalMined(), '2897');
              assert.equal(await mining.releasable(alice), '880');
              assert.equal(await mining.releasable(carol), '2017');
            });

            it('affects rewards accumulating during "pause" after pause ends', async () => {
              const { mining, lander, landingSite, payload, faucet } = this;

              // total: 520, alice: 240, carol; 280
              await faucet.setOwed(mining.address, 1040);
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');

              await mining.pause({ from:manager });
              await faucet.addOwed(mining.address, 1857);
              // no effect on reported mining
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');

              // reappraise
              await mining.reappraiseMission(0, { from:alice });
              await mining.reappraiseMission(1, { from:dave });
              await mining.reappraiseMission(2, { from:carol });
              await mining.reappraiseMission(3, { from:carol });

              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');

              await mining.unpause({ from:manager });
              assert.equal(await mining.totalMined(), '2897');
              assert.equal(await mining.releasable(alice), '880');
              assert.equal(await mining.releasable(carol), '2017');
            });

            it('does not affect already-released rewards', async () => {
              const { mining, lander, landingSite, payload, faucet, token } = this;

              // total: 520, alice: 240, carol; 280
              await faucet.setOwed(mining.address, 1040);
              await mining.methods["release(address,address,uint256)"](alice, alice, 400, { from:alice });
              await mining.methods["release(address,address,uint256)"](carol, carol, 500, { from:carol });
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '80');
              assert.equal(await mining.releasable(carol), '60');
              assert.equal(await token.balanceOf(alice), '400');
              assert.equal(await token.balanceOf(carol), '500');

              // reappraise
              await mining.reappraiseMission(0, { from:alice });
              await mining.reappraiseMission(1, { from:dave });
              await mining.reappraiseMission(2, { from:carol });
              await mining.reappraiseMission(3, { from:carol });

              // total: 1857, alice: 250, carol: 1457
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '80');
              assert.equal(await mining.releasable(carol), '60');
              await mining.release(alice, alice, { from:alice });
              await mining.release(carol, carol, { from:carol });
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '0');
              assert.equal(await mining.releasable(carol), '0');
              assert.equal(await token.balanceOf(alice), '480');
              assert.equal(await token.balanceOf(carol), '560');
            });

            it('emits "MissionAppraised" event', async () => {
              const { mining, lander, landingSite, payload } = this;
              let res;

              // 100 -> 150
              res = await mining.reappraiseMission(0, { from:alice });
              await expectEvent.inTransaction(res.tx, mining, "MissionAppraised", {
                missionId: '0',
                to: alice,
                previousMiningPower: '100',
                miningPower: '150'
              });

              // 140 -> 250
              res = await mining.reappraiseMission(1, { from:dave });
              await expectEvent.inTransaction(res.tx, mining, "MissionAppraised", {
                missionId: '1',
                to: alice,
                previousMiningPower: '140',
                miningPower: '250'
              });

              // 180 -> 1377
              res = await mining.reappraiseMission(2, { from:carol });
              await expectEvent.inTransaction(res.tx, mining, "MissionAppraised", {
                missionId: '2',
                to: carol,
                previousMiningPower: '180',
                miningPower: '1377'
              });

              // 100 -> 80
              res = await mining.reappraiseMission(3, { from:carol });
              await expectEvent.inTransaction(res.tx, mining, "MissionAppraised", {
                missionId: '3',
                to: carol,
                previousMiningPower: '100',
                miningPower: '80'
              });
            });
          });

          context('with updated token appraisals and complete checker reporting accurately', () => {
            let checker;

            beforeEach(async () => {
              const { lander, landingSite, payload, appraiser, mining, token, faucet } = this;

              checker = await MockMissionChecker.new();

              await mining.setMissionCompleteChecker(checker.address, { from:manager });

              await appraiser.setAppraises(lander.address, true, '80', { from:deployer });
              await appraiser.setAppraises(landingSite.address, true, '40', { from:deployer });
              await appraiser.setAppraises(payload.address,  true, '20', { from:deployer  });

              await appraiser.setAppraisals(lander.address, [0, 1, 2], [150, 200, 250], { from:deployer });
              await appraiser.setAppraisals(landingSite.address, [15], [1000], { from:deployer });
              await appraiser.setAppraisals(payload.address, [0, 1, 12, 13], [0, 10, 120, 130], { from:deployer });

              await mining.setMissionCompleteMultiplier(10, 9, { from:deployer });

              await token.mint(faucet.address, 100000000000);

              // mission 0: power 100 -> 150
              // await mining.launchMission([0], [], [], alice, { from:alice });

              // mission 1: power 140 -> 250
              // await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });

              // mission 2: power 180 -> 1377
              // await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });

              // mission 3:  power 100 -> 80
              // await mining.launchMission([12], [], [], carol, { from:bob });
            });

            it('updates internal state', async () => {
              const { mining, lander, landingSite, payload } = this;

              // 100 -> 150
              await mining.reappraiseMission(0, { from:alice });
              assert.equal(await mining.totalMiningPower(), '570');
              assert.equal(await mining.missionCount(), '4');
              assert.equal(await mining.stakedMissionCount(), '4');
              assert.equal(await mining.stakedMissions(0), '0');
              assert.equal(await mining.stakedMissions(1), '1');
              assert.equal(await mining.stakedMissions(2), '2');
              assert.equal(await mining.stakedMissions(3), '3');
              assert.equal(await mining.userMissionCount(alice), '2');
              assert.equal(await mining.userMissionCount(carol), '2');
              assert.equal(await mining.userMissions(alice, 0), '0');
              assert.equal(await mining.userMissions(alice, 1), '1');
              assert.equal(await mining.userMissions(carol, 0), '2');
              assert.equal(await mining.userMissions(carol, 1), '3');

              user = await mining.userInfo(alice);
              assert.equal(user.miningPower, '290');
              assert.equal(user.released, '0');

              mission = await mining.missionInfo(0);
              assert.equal(mission.staked, true);
              assert.equal(mission.user, alice);
              assert.equal(mission.userMissionsIndex, '0');
              assert.equal(mission.miningPower, '150');

              // 140 -> 250
              await mining.reappraiseMission(1, { from:dave });
              assert.equal(await mining.totalMiningPower(), '680');
              assert.equal(await mining.missionCount(), '4');
              assert.equal(await mining.stakedMissionCount(), '4');
              assert.equal(await mining.stakedMissions(0), '0');
              assert.equal(await mining.stakedMissions(1), '1');
              assert.equal(await mining.stakedMissions(2), '2');
              assert.equal(await mining.stakedMissions(3), '3');
              assert.equal(await mining.userMissionCount(alice), '2');
              assert.equal(await mining.userMissionCount(carol), '2');
              assert.equal(await mining.userMissions(alice, 0), '0');
              assert.equal(await mining.userMissions(alice, 1), '1');
              assert.equal(await mining.userMissions(carol, 0), '2');
              assert.equal(await mining.userMissions(carol, 1), '3');

              user = await mining.userInfo(alice);
              assert.equal(user.miningPower, '400');
              assert.equal(user.released, '0');

              mission = await mining.missionInfo(1);
              assert.equal(mission.staked, true);
              assert.equal(mission.user, alice);
              assert.equal(mission.userMissionsIndex, '1');
              assert.equal(mission.miningPower, '250');

              // 180 -> 1377
              await checker.setResult(true);
              await mining.reappraiseMission(2, { from:carol });
              await checker.setResult(false);
              assert.equal(await mining.totalMiningPower(), '1877');
              assert.equal(await mining.missionCount(), '4');
              assert.equal(await mining.stakedMissionCount(), '4');
              assert.equal(await mining.stakedMissions(0), '0');
              assert.equal(await mining.stakedMissions(1), '1');
              assert.equal(await mining.stakedMissions(2), '2');
              assert.equal(await mining.stakedMissions(3), '3');
              assert.equal(await mining.userMissionCount(alice), '2');
              assert.equal(await mining.userMissionCount(carol), '2');
              assert.equal(await mining.userMissions(alice, 0), '0');
              assert.equal(await mining.userMissions(alice, 1), '1');
              assert.equal(await mining.userMissions(carol, 0), '2');
              assert.equal(await mining.userMissions(carol, 1), '3');

              user = await mining.userInfo(carol);
              assert.equal(user.miningPower, '1477');
              assert.equal(user.released, '0');

              mission = await mining.missionInfo(2);
              assert.equal(mission.staked, true);
              assert.equal(mission.user, carol);
              assert.equal(mission.userMissionsIndex, '0');
              assert.equal(mission.miningPower, '1377');

              // 100 -> 80
              await mining.reappraiseMission(3, { from:carol });
              assert.equal(await mining.totalMiningPower(), '1857');
              assert.equal(await mining.missionCount(), '4');
              assert.equal(await mining.stakedMissionCount(), '4');
              assert.equal(await mining.stakedMissions(0), '0');
              assert.equal(await mining.stakedMissions(1), '1');
              assert.equal(await mining.stakedMissions(2), '2');
              assert.equal(await mining.stakedMissions(3), '3');
              assert.equal(await mining.userMissionCount(alice), '2');
              assert.equal(await mining.userMissionCount(carol), '2');
              assert.equal(await mining.userMissions(alice, 0), '0');
              assert.equal(await mining.userMissions(alice, 1), '1');
              assert.equal(await mining.userMissions(carol, 0), '2');
              assert.equal(await mining.userMissions(carol, 1), '3');

              user = await mining.userInfo(carol);
              assert.equal(user.miningPower, '1457');
              assert.equal(user.released, '0');

              mission = await mining.missionInfo(3);
              assert.equal(mission.staked, true);
              assert.equal(mission.user, carol);
              assert.equal(mission.userMissionsIndex, '1');
              assert.equal(mission.miningPower, '80');
            });

            it('does not affect already-mined rewards', async () => {
              const { mining, lander, landingSite, payload, faucet } = this;

              // total: 520, alice: 240, carol; 280
              await faucet.setOwed(mining.address, 1040);
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');

              // reappraise
              await mining.reappraiseMission(0, { from:alice });
              await mining.reappraiseMission(1, { from:dave });
              await checker.setResult(true);
              await mining.reappraiseMission(2, { from:carol });
              await checker.setResult(false);
              await mining.reappraiseMission(3, { from:carol });

              // total: 1857, alice: 400, carol: 1457
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');
            });

            it('does not affect already-released rewards', async () => {
              const { mining, lander, landingSite, payload, faucet, token } = this;

              // total: 520, alice: 240, carol; 280
              await faucet.setOwed(mining.address, 1040);
              await mining.methods["release(address,address,uint256)"](alice, alice, 400, { from:alice });
              await mining.methods["release(address,address,uint256)"](carol, carol, 500, { from:carol });
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '80');
              assert.equal(await mining.releasable(carol), '60');
              assert.equal(await token.balanceOf(alice), '400');
              assert.equal(await token.balanceOf(carol), '500');

              // reappraise
              await mining.reappraiseMission(0, { from:alice });
              await mining.reappraiseMission(1, { from:dave });
              await checker.setResult(true);
              await mining.reappraiseMission(2, { from:carol });
              await checker.setResult(false);
              await mining.reappraiseMission(3, { from:carol });

              // total: 1857, alice: 400, carol: 1457
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '80');
              assert.equal(await mining.releasable(carol), '60');
              await mining.release(alice, alice, { from:alice });
              await mining.release(carol, carol, { from:carol });
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '0');
              assert.equal(await mining.releasable(carol), '0');
              assert.equal(await token.balanceOf(alice), '480');
              assert.equal(await token.balanceOf(carol), '560');
            });

            it('affects rewards mined after reappraisal', async () => {
              const { mining, lander, landingSite, payload, faucet } = this;

              // total: 520, alice: 240, carol; 280
              await faucet.setOwed(mining.address, 1040);
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');

              // reappraise
              await mining.reappraiseMission(0, { from:alice });
              await mining.reappraiseMission(1, { from:dave });
              await checker.setResult(true);
              await mining.reappraiseMission(2, { from:carol });
              await checker.setResult(false);
              await mining.reappraiseMission(3, { from:carol });

              // total: 1857, alice: 400, carol: 1457
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');

              await faucet.addOwed(mining.address, 1857);
              assert.equal(await mining.totalMined(), '2897');
              assert.equal(await mining.releasable(alice), '880');
              assert.equal(await mining.releasable(carol), '2017');
            });

            it('affects rewards accumulating during "pause" after pause ends', async () => {
              const { mining, lander, landingSite, payload, faucet } = this;

              // total: 520, alice: 240, carol; 280
              await faucet.setOwed(mining.address, 1040);
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');

              await mining.pause({ from:manager });
              await faucet.addOwed(mining.address, 1857);
              // no effect on reported mining
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');

              // reappraise
              await mining.reappraiseMission(0, { from:alice });
              await mining.reappraiseMission(1, { from:dave });
              await checker.setResult(true);
              await mining.reappraiseMission(2, { from:carol });
              await checker.setResult(false);
              await mining.reappraiseMission(3, { from:carol });

              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');

              await mining.unpause({ from:manager });
              assert.equal(await mining.totalMined(), '2897');
              assert.equal(await mining.releasable(alice), '880');
              assert.equal(await mining.releasable(carol), '2017');
            });

            it('does not affect already-released rewards', async () => {
              const { mining, lander, landingSite, payload, faucet, token } = this;

              // total: 520, alice: 240, carol; 280
              await faucet.setOwed(mining.address, 1040);
              await mining.methods["release(address,address,uint256)"](alice, alice, 400, { from:alice });
              await mining.methods["release(address,address,uint256)"](carol, carol, 500, { from:carol });
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '80');
              assert.equal(await mining.releasable(carol), '60');
              assert.equal(await token.balanceOf(alice), '400');
              assert.equal(await token.balanceOf(carol), '500');

              // reappraise
              await mining.reappraiseMission(0, { from:alice });
              await mining.reappraiseMission(1, { from:dave });
              await checker.setResult(true);
              await mining.reappraiseMission(2, { from:carol });
              await checker.setResult(false);
              await mining.reappraiseMission(3, { from:carol });

              // total: 1857, alice: 250, carol: 1457
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '80');
              assert.equal(await mining.releasable(carol), '60');
              await mining.release(alice, alice, { from:alice });
              await mining.release(carol, carol, { from:carol });
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '0');
              assert.equal(await mining.releasable(carol), '0');
              assert.equal(await token.balanceOf(alice), '480');
              assert.equal(await token.balanceOf(carol), '560');
            });

            it('emits "MissionAppraised" event', async () => {
              const { mining, lander, landingSite, payload } = this;
              let res;

              // 100 -> 150
              res = await mining.reappraiseMission(0, { from:alice });
              await expectEvent.inTransaction(res.tx, mining, "MissionAppraised", {
                missionId: '0',
                to: alice,
                previousMiningPower: '100',
                miningPower: '150'
              });

              // 140 -> 250
              res = await mining.reappraiseMission(1, { from:dave });
              await expectEvent.inTransaction(res.tx, mining, "MissionAppraised", {
                missionId: '1',
                to: alice,
                previousMiningPower: '140',
                miningPower: '250'
              });

              // 180 -> 1377
              await checker.setResult(true);
              res = await mining.reappraiseMission(2, { from:carol });
              await checker.setResult(false);
              await expectEvent.inTransaction(res.tx, mining, "MissionAppraised", {
                missionId: '2',
                to: carol,
                previousMiningPower: '180',
                miningPower: '1377'
              });

              // 100 -> 80
              res = await mining.reappraiseMission(3, { from:carol });
              await expectEvent.inTransaction(res.tx, mining, "MissionAppraised", {
                missionId: '3',
                to: carol,
                previousMiningPower: '100',
                miningPower: '80'
              });
            });
          });

          context('with updated token appraisals and complete checker reporting "no"', () => {
            let checker;

            beforeEach(async () => {
              const { lander, landingSite, payload, appraiser, mining, token, faucet } = this;

              checker = await MockMissionChecker.new();

              await mining.setMissionCompleteChecker(checker.address, { from:manager });

              await appraiser.setAppraises(lander.address, true, '80', { from:deployer });
              await appraiser.setAppraises(landingSite.address, true, '40', { from:deployer });
              await appraiser.setAppraises(payload.address,  true, '20', { from:deployer  });

              await appraiser.setAppraisals(lander.address, [0, 1, 2], [150, 200, 250], { from:deployer });
              await appraiser.setAppraisals(landingSite.address, [15], [1000], { from:deployer });
              await appraiser.setAppraisals(payload.address, [0, 1, 12, 13], [0, 10, 120, 130], { from:deployer });

              await mining.setMissionCompleteMultiplier(10, 9, { from:deployer });

              await token.mint(faucet.address, 100000000000);

              // mission 0: power 100 -> 150
              // await mining.launchMission([0], [], [], alice, { from:alice });

              // mission 1: power 140 -> 250
              // await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });

              // mission 2: power 180 -> 1240
              // await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });

              // mission 3:  power 100 -> 80
              // await mining.launchMission([12], [], [], carol, { from:bob });
            });

            it('updates internal state', async () => {
              const { mining, lander, landingSite, payload } = this;

              // 100 -> 150
              await mining.reappraiseMission(0, { from:alice });
              assert.equal(await mining.totalMiningPower(), '570');
              assert.equal(await mining.missionCount(), '4');
              assert.equal(await mining.stakedMissionCount(), '4');
              assert.equal(await mining.stakedMissions(0), '0');
              assert.equal(await mining.stakedMissions(1), '1');
              assert.equal(await mining.stakedMissions(2), '2');
              assert.equal(await mining.stakedMissions(3), '3');
              assert.equal(await mining.userMissionCount(alice), '2');
              assert.equal(await mining.userMissionCount(carol), '2');
              assert.equal(await mining.userMissions(alice, 0), '0');
              assert.equal(await mining.userMissions(alice, 1), '1');
              assert.equal(await mining.userMissions(carol, 0), '2');
              assert.equal(await mining.userMissions(carol, 1), '3');

              user = await mining.userInfo(alice);
              assert.equal(user.miningPower, '290');
              assert.equal(user.released, '0');

              mission = await mining.missionInfo(0);
              assert.equal(mission.staked, true);
              assert.equal(mission.user, alice);
              assert.equal(mission.userMissionsIndex, '0');
              assert.equal(mission.miningPower, '150');

              // 140 -> 250
              await mining.reappraiseMission(1, { from:dave });
              assert.equal(await mining.totalMiningPower(), '680');
              assert.equal(await mining.missionCount(), '4');
              assert.equal(await mining.stakedMissionCount(), '4');
              assert.equal(await mining.stakedMissions(0), '0');
              assert.equal(await mining.stakedMissions(1), '1');
              assert.equal(await mining.stakedMissions(2), '2');
              assert.equal(await mining.stakedMissions(3), '3');
              assert.equal(await mining.userMissionCount(alice), '2');
              assert.equal(await mining.userMissionCount(carol), '2');
              assert.equal(await mining.userMissions(alice, 0), '0');
              assert.equal(await mining.userMissions(alice, 1), '1');
              assert.equal(await mining.userMissions(carol, 0), '2');
              assert.equal(await mining.userMissions(carol, 1), '3');

              user = await mining.userInfo(alice);
              assert.equal(user.miningPower, '400');
              assert.equal(user.released, '0');

              mission = await mining.missionInfo(1);
              assert.equal(mission.staked, true);
              assert.equal(mission.user, alice);
              assert.equal(mission.userMissionsIndex, '1');
              assert.equal(mission.miningPower, '250');

              // 180 -> 1240
              await mining.reappraiseMission(2, { from:carol });
              assert.equal(await mining.totalMiningPower(), '1740');
              assert.equal(await mining.missionCount(), '4');
              assert.equal(await mining.stakedMissionCount(), '4');
              assert.equal(await mining.stakedMissions(0), '0');
              assert.equal(await mining.stakedMissions(1), '1');
              assert.equal(await mining.stakedMissions(2), '2');
              assert.equal(await mining.stakedMissions(3), '3');
              assert.equal(await mining.userMissionCount(alice), '2');
              assert.equal(await mining.userMissionCount(carol), '2');
              assert.equal(await mining.userMissions(alice, 0), '0');
              assert.equal(await mining.userMissions(alice, 1), '1');
              assert.equal(await mining.userMissions(carol, 0), '2');
              assert.equal(await mining.userMissions(carol, 1), '3');

              user = await mining.userInfo(carol);
              assert.equal(user.miningPower, '1340');
              assert.equal(user.released, '0');

              mission = await mining.missionInfo(2);
              assert.equal(mission.staked, true);
              assert.equal(mission.user, carol);
              assert.equal(mission.userMissionsIndex, '0');
              assert.equal(mission.miningPower, '1240');

              // 100 -> 80
              await mining.reappraiseMission(3, { from:carol });
              assert.equal(await mining.totalMiningPower(), '1720');
              assert.equal(await mining.missionCount(), '4');
              assert.equal(await mining.stakedMissionCount(), '4');
              assert.equal(await mining.stakedMissions(0), '0');
              assert.equal(await mining.stakedMissions(1), '1');
              assert.equal(await mining.stakedMissions(2), '2');
              assert.equal(await mining.stakedMissions(3), '3');
              assert.equal(await mining.userMissionCount(alice), '2');
              assert.equal(await mining.userMissionCount(carol), '2');
              assert.equal(await mining.userMissions(alice, 0), '0');
              assert.equal(await mining.userMissions(alice, 1), '1');
              assert.equal(await mining.userMissions(carol, 0), '2');
              assert.equal(await mining.userMissions(carol, 1), '3');

              user = await mining.userInfo(carol);
              assert.equal(user.miningPower, '1320');
              assert.equal(user.released, '0');

              mission = await mining.missionInfo(3);
              assert.equal(mission.staked, true);
              assert.equal(mission.user, carol);
              assert.equal(mission.userMissionsIndex, '1');
              assert.equal(mission.miningPower, '80');
            });

            it('does not affect already-mined rewards', async () => {
              const { mining, lander, landingSite, payload, faucet } = this;

              // total: 520, alice: 240, carol; 280
              await faucet.setOwed(mining.address, 1040);
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');

              // reappraise
              await mining.reappraiseMission(0, { from:alice });
              await mining.reappraiseMission(1, { from:dave });
              await mining.reappraiseMission(2, { from:carol });
              await mining.reappraiseMission(3, { from:carol });

              // total: 1720, alice: 400, carol: 1320
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');
            });

            it('does not affect already-released rewards', async () => {
              const { mining, lander, landingSite, payload, faucet, token } = this;

              // total: 520, alice: 240, carol; 280
              await faucet.setOwed(mining.address, 1040);
              await mining.methods["release(address,address,uint256)"](alice, alice, 400, { from:alice });
              await mining.methods["release(address,address,uint256)"](carol, carol, 500, { from:carol });
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '80');
              assert.equal(await mining.releasable(carol), '60');
              assert.equal(await token.balanceOf(alice), '400');
              assert.equal(await token.balanceOf(carol), '500');

              // reappraise
              await mining.reappraiseMission(0, { from:alice });
              await mining.reappraiseMission(1, { from:dave });
              await mining.reappraiseMission(2, { from:carol });
              await mining.reappraiseMission(3, { from:carol });

              // total: 1720, alice: 400, carol: 1320
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '80');
              assert.equal(await mining.releasable(carol), '60');
              await mining.release(alice, alice, { from:alice });
              await mining.release(carol, carol, { from:carol });
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '0');
              assert.equal(await mining.releasable(carol), '0');
              assert.equal(await token.balanceOf(alice), '480');
              assert.equal(await token.balanceOf(carol), '560');
            });

            it('affects rewards mined after reappraisal', async () => {
              const { mining, lander, landingSite, payload, faucet } = this;

              // total: 520, alice: 240, carol; 280
              await faucet.setOwed(mining.address, 1040);
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');

              // reappraise
              await mining.reappraiseMission(0, { from:alice });
              await mining.reappraiseMission(1, { from:dave });
              await mining.reappraiseMission(2, { from:carol });
              await mining.reappraiseMission(3, { from:carol });

              // total: 1720, alice: 400, carol: 1320
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');

              await faucet.addOwed(mining.address, 1720);
              assert.equal(await mining.totalMined(), '2760');
              assert.equal(await mining.releasable(alice), '880');
              assert.equal(await mining.releasable(carol), '1880');
            });

            it('affects rewards accumulating during "pause" after pause ends', async () => {
              const { mining, lander, landingSite, payload, faucet } = this;

              // total: 520, alice: 240, carol; 280
              await faucet.setOwed(mining.address, 1040);
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');

              await mining.pause({ from:manager });
              await faucet.addOwed(mining.address, 1720);
              // no effect on reported mining
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');

              // reappraise
              await mining.reappraiseMission(0, { from:alice });
              await mining.reappraiseMission(1, { from:dave });
              await mining.reappraiseMission(2, { from:carol });
              await mining.reappraiseMission(3, { from:carol });

              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');

              await mining.unpause({ from:manager });
              assert.equal(await mining.totalMined(), '2760');
              assert.equal(await mining.releasable(alice), '880');
              assert.equal(await mining.releasable(carol), '1880');
            });

            it('does not affect already-released rewards', async () => {
              const { mining, lander, landingSite, payload, faucet, token } = this;

              // total: 520, alice: 240, carol; 280
              await faucet.setOwed(mining.address, 1040);
              await mining.methods["release(address,address,uint256)"](alice, alice, 400, { from:alice });
              await mining.methods["release(address,address,uint256)"](carol, carol, 500, { from:carol });
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '80');
              assert.equal(await mining.releasable(carol), '60');
              assert.equal(await token.balanceOf(alice), '400');
              assert.equal(await token.balanceOf(carol), '500');

              // reappraise
              await mining.reappraiseMission(0, { from:alice });
              await mining.reappraiseMission(1, { from:dave });
              await mining.reappraiseMission(2, { from:carol });
              await mining.reappraiseMission(3, { from:carol });

              // total: 1720, alice: 250, carol: 1320
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '80');
              assert.equal(await mining.releasable(carol), '60');
              await mining.release(alice, alice, { from:alice });
              await mining.release(carol, carol, { from:carol });
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '0');
              assert.equal(await mining.releasable(carol), '0');
              assert.equal(await token.balanceOf(alice), '480');
              assert.equal(await token.balanceOf(carol), '560');
            });

            it('emits "MissionAppraised" event', async () => {
              const { mining, lander, landingSite, payload } = this;
              let res;

              // 100 -> 150
              res = await mining.reappraiseMission(0, { from:alice });
              await expectEvent.inTransaction(res.tx, mining, "MissionAppraised", {
                missionId: '0',
                to: alice,
                previousMiningPower: '100',
                miningPower: '150'
              });

              // 140 -> 250
              res = await mining.reappraiseMission(1, { from:dave });
              await expectEvent.inTransaction(res.tx, mining, "MissionAppraised", {
                missionId: '1',
                to: alice,
                previousMiningPower: '140',
                miningPower: '250'
              });

              // 180 -> 1240
              res = await mining.reappraiseMission(2, { from:carol });
              await expectEvent.inTransaction(res.tx, mining, "MissionAppraised", {
                missionId: '2',
                to: carol,
                previousMiningPower: '180',
                miningPower: '1240'
              });

              // 100 -> 80
              res = await mining.reappraiseMission(3, { from:carol });
              await expectEvent.inTransaction(res.tx, mining, "MissionAppraised", {
                missionId: '3',
                to: carol,
                previousMiningPower: '100',
                miningPower: '80'
              });
            });
          });

          context('with updated token appraisals and complete checker reporting "yes"', () => {
            let checker;

            beforeEach(async () => {
              const { lander, landingSite, payload, appraiser, mining, token, faucet } = this;

              checker = await MockMissionChecker.new();

              await mining.setMissionCompleteChecker(checker.address, { from:manager });
              await checker.setResult(true);

              await appraiser.setAppraises(lander.address, true, '80', { from:deployer });
              await appraiser.setAppraises(landingSite.address, true, '40', { from:deployer });
              await appraiser.setAppraises(payload.address,  true, '20', { from:deployer  });

              await appraiser.setAppraisals(lander.address, [0, 1, 2], [150, 200, 250], { from:deployer });
              await appraiser.setAppraisals(landingSite.address, [15], [1000], { from:deployer });
              await appraiser.setAppraisals(payload.address, [0, 1, 12, 13], [0, 10, 120, 130], { from:deployer });

              await mining.setMissionCompleteMultiplier(10, 9, { from:deployer });

              await token.mint(faucet.address, 100000000000);

              // mission 0: power 100 -> 166 (150)
              // await mining.launchMission([0], [], [], alice, { from:alice });

              // mission 1: power 140 -> 277 (250)
              // await mining.launchMission([1], [], [0, 1, 2, 3], alice, { from:alice });

              // mission 2: power 180 -> 1377 (1377)
              // await mining.launchMission([10], [15], [12, 14, 16], carol, { from:bob });

              // mission 3:  power 100 -> 88 (80)
              // await mining.launchMission([12], [], [], carol, { from:bob });
            });

            it('updates internal state', async () => {
              const { mining, lander, landingSite, payload } = this;

              // 100 -> 166 (150)
              await mining.reappraiseMission(0, { from:alice });
              assert.equal(await mining.totalMiningPower(), '586');
              assert.equal(await mining.missionCount(), '4');
              assert.equal(await mining.stakedMissionCount(), '4');
              assert.equal(await mining.stakedMissions(0), '0');
              assert.equal(await mining.stakedMissions(1), '1');
              assert.equal(await mining.stakedMissions(2), '2');
              assert.equal(await mining.stakedMissions(3), '3');
              assert.equal(await mining.userMissionCount(alice), '2');
              assert.equal(await mining.userMissionCount(carol), '2');
              assert.equal(await mining.userMissions(alice, 0), '0');
              assert.equal(await mining.userMissions(alice, 1), '1');
              assert.equal(await mining.userMissions(carol, 0), '2');
              assert.equal(await mining.userMissions(carol, 1), '3');

              user = await mining.userInfo(alice);
              assert.equal(user.miningPower, '306');
              assert.equal(user.released, '0');

              mission = await mining.missionInfo(0);
              assert.equal(mission.staked, true);
              assert.equal(mission.user, alice);
              assert.equal(mission.userMissionsIndex, '0');
              assert.equal(mission.miningPower, '166');

              // 140 -> 277 (250)
              await mining.reappraiseMission(1, { from:dave });
              assert.equal(await mining.totalMiningPower(), '723');
              assert.equal(await mining.missionCount(), '4');
              assert.equal(await mining.stakedMissionCount(), '4');
              assert.equal(await mining.stakedMissions(0), '0');
              assert.equal(await mining.stakedMissions(1), '1');
              assert.equal(await mining.stakedMissions(2), '2');
              assert.equal(await mining.stakedMissions(3), '3');
              assert.equal(await mining.userMissionCount(alice), '2');
              assert.equal(await mining.userMissionCount(carol), '2');
              assert.equal(await mining.userMissions(alice, 0), '0');
              assert.equal(await mining.userMissions(alice, 1), '1');
              assert.equal(await mining.userMissions(carol, 0), '2');
              assert.equal(await mining.userMissions(carol, 1), '3');

              user = await mining.userInfo(alice);
              assert.equal(user.miningPower, '443');
              assert.equal(user.released, '0');

              mission = await mining.missionInfo(1);
              assert.equal(mission.staked, true);
              assert.equal(mission.user, alice);
              assert.equal(mission.userMissionsIndex, '1');
              assert.equal(mission.miningPower, '277');

              // 180 -> 1377
              await mining.reappraiseMission(2, { from:carol });
              assert.equal(await mining.totalMiningPower(), '1920');
              assert.equal(await mining.missionCount(), '4');
              assert.equal(await mining.stakedMissionCount(), '4');
              assert.equal(await mining.stakedMissions(0), '0');
              assert.equal(await mining.stakedMissions(1), '1');
              assert.equal(await mining.stakedMissions(2), '2');
              assert.equal(await mining.stakedMissions(3), '3');
              assert.equal(await mining.userMissionCount(alice), '2');
              assert.equal(await mining.userMissionCount(carol), '2');
              assert.equal(await mining.userMissions(alice, 0), '0');
              assert.equal(await mining.userMissions(alice, 1), '1');
              assert.equal(await mining.userMissions(carol, 0), '2');
              assert.equal(await mining.userMissions(carol, 1), '3');

              user = await mining.userInfo(carol);
              assert.equal(user.miningPower, '1477');
              assert.equal(user.released, '0');

              mission = await mining.missionInfo(2);
              assert.equal(mission.staked, true);
              assert.equal(mission.user, carol);
              assert.equal(mission.userMissionsIndex, '0');
              assert.equal(mission.miningPower, '1377');

              // 100 -> 88 (80)
              await mining.reappraiseMission(3, { from:carol });
              assert.equal(await mining.totalMiningPower(), '1908');
              assert.equal(await mining.missionCount(), '4');
              assert.equal(await mining.stakedMissionCount(), '4');
              assert.equal(await mining.stakedMissions(0), '0');
              assert.equal(await mining.stakedMissions(1), '1');
              assert.equal(await mining.stakedMissions(2), '2');
              assert.equal(await mining.stakedMissions(3), '3');
              assert.equal(await mining.userMissionCount(alice), '2');
              assert.equal(await mining.userMissionCount(carol), '2');
              assert.equal(await mining.userMissions(alice, 0), '0');
              assert.equal(await mining.userMissions(alice, 1), '1');
              assert.equal(await mining.userMissions(carol, 0), '2');
              assert.equal(await mining.userMissions(carol, 1), '3');

              user = await mining.userInfo(carol);
              assert.equal(user.miningPower, '1465');
              assert.equal(user.released, '0');

              mission = await mining.missionInfo(3);
              assert.equal(mission.staked, true);
              assert.equal(mission.user, carol);
              assert.equal(mission.userMissionsIndex, '1');
              assert.equal(mission.miningPower, '88');
            });

            it('does not affect already-mined rewards', async () => {
              const { mining, lander, landingSite, payload, faucet } = this;

              // total: 520, alice: 240, carol; 280
              await faucet.setOwed(mining.address, 1040);
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');

              // reappraise
              await mining.reappraiseMission(0, { from:alice });
              await mining.reappraiseMission(1, { from:dave });
              await mining.reappraiseMission(2, { from:carol });
              await mining.reappraiseMission(3, { from:carol });

              // total: 1720, alice: 400, carol: 1320
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');
            });

            it('does not affect already-released rewards', async () => {
              const { mining, lander, landingSite, payload, faucet, token } = this;

              // total: 520, alice: 240, carol; 280
              await faucet.setOwed(mining.address, 1040);
              await mining.methods["release(address,address,uint256)"](alice, alice, 400, { from:alice });
              await mining.methods["release(address,address,uint256)"](carol, carol, 500, { from:carol });
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '80');
              assert.equal(await mining.releasable(carol), '60');
              assert.equal(await token.balanceOf(alice), '400');
              assert.equal(await token.balanceOf(carol), '500');

              // reappraise
              await mining.reappraiseMission(0, { from:alice });
              await mining.reappraiseMission(1, { from:dave });
              await mining.reappraiseMission(2, { from:carol });
              await mining.reappraiseMission(3, { from:carol });

              // total: 1720, alice: 400, carol: 1320
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '80');
              assert.equal(await mining.releasable(carol), '60');
              await mining.release(alice, alice, { from:alice });
              await mining.release(carol, carol, { from:carol });
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '0');
              assert.equal(await mining.releasable(carol), '0');
              assert.equal(await token.balanceOf(alice), '480');
              assert.equal(await token.balanceOf(carol), '560');
            });

            it('affects rewards mined after reappraisal', async () => {
              const { mining, lander, landingSite, payload, faucet } = this;

              // total: 520, alice: 240, carol; 280
              await faucet.setOwed(mining.address, 1040);
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');

              // reappraise
              await mining.reappraiseMission(0, { from:alice });
              await mining.reappraiseMission(1, { from:dave });
              await mining.reappraiseMission(2, { from:carol });
              await mining.reappraiseMission(3, { from:carol });

              // total: 1908, alice: 443, carol: 1465
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');

              await faucet.addOwed(mining.address, 1908);
              assert.equal(await mining.totalMined(), '2948');
              assert.equal(await mining.releasable(alice), '923');
              assert.equal(await mining.releasable(carol), '2025');
            });

            it('affects rewards accumulating during "pause" after pause ends', async () => {
              const { mining, lander, landingSite, payload, faucet } = this;

              // total: 520, alice: 240, carol; 280
              await faucet.setOwed(mining.address, 1040);
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');

              await mining.pause({ from:manager });
              await faucet.addOwed(mining.address, 1908);
              // no effect on reported mining
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');

              // reappraise
              await mining.reappraiseMission(0, { from:alice });
              await mining.reappraiseMission(1, { from:dave });
              await mining.reappraiseMission(2, { from:carol });
              await mining.reappraiseMission(3, { from:carol });

              // total: 1908, alice: 443, carol: 1465
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '480');
              assert.equal(await mining.releasable(carol), '560');

              await mining.unpause({ from:manager });
              assert.equal(await mining.totalMined(), '2948');
              assert.equal(await mining.releasable(alice), '923');
              assert.equal(await mining.releasable(carol), '2025');
            });

            it('does not affect already-released rewards', async () => {
              const { mining, lander, landingSite, payload, faucet, token } = this;

              // total: 520, alice: 240, carol; 280
              await faucet.setOwed(mining.address, 1040);
              await mining.methods["release(address,address,uint256)"](alice, alice, 400, { from:alice });
              await mining.methods["release(address,address,uint256)"](carol, carol, 500, { from:carol });
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '80');
              assert.equal(await mining.releasable(carol), '60');
              assert.equal(await token.balanceOf(alice), '400');
              assert.equal(await token.balanceOf(carol), '500');

              // reappraise
              await mining.reappraiseMission(0, { from:alice });
              await mining.reappraiseMission(1, { from:dave });
              await mining.reappraiseMission(2, { from:carol });
              await mining.reappraiseMission(3, { from:carol });

              // total: 1908, alice: 443, carol: 1465
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '80');
              assert.equal(await mining.releasable(carol), '60');
              await mining.release(alice, alice, { from:alice });
              await mining.release(carol, carol, { from:carol });
              assert.equal(await mining.totalMined(), '1040');
              assert.equal(await mining.releasable(alice), '0');
              assert.equal(await mining.releasable(carol), '0');
              assert.equal(await token.balanceOf(alice), '480');
              assert.equal(await token.balanceOf(carol), '560');
            });

            it('emits "MissionAppraised" event', async () => {
              const { mining, lander, landingSite, payload } = this;
              let res;

              // 100 -> 150
              res = await mining.reappraiseMission(0, { from:alice });
              await expectEvent.inTransaction(res.tx, mining, "MissionAppraised", {
                missionId: '0',
                to: alice,
                previousMiningPower: '100',
                miningPower: '166'
              });

              // 140 -> 250
              res = await mining.reappraiseMission(1, { from:dave });
              await expectEvent.inTransaction(res.tx, mining, "MissionAppraised", {
                missionId: '1',
                to: alice,
                previousMiningPower: '140',
                miningPower: '277'
              });

              // 180 -> 1240
              res = await mining.reappraiseMission(2, { from:carol });
              await expectEvent.inTransaction(res.tx, mining, "MissionAppraised", {
                missionId: '2',
                to: carol,
                previousMiningPower: '180',
                miningPower: '1377'
              });

              // 100 -> 80
              res = await mining.reappraiseMission(3, { from:carol });
              await expectEvent.inTransaction(res.tx, mining, "MissionAppraised", {
                missionId: '3',
                to: carol,
                previousMiningPower: '100',
                miningPower: '88'
              });
            });
          });
        });

        context('without miners', () => {
          beforeEach(async () => {
            const { faucet, token } = this;

            await token.mint(faucet.address,  100000000000);
          })

          it('update() pulls funds from faucet but does not register them as mined', async () => {
            const { faucet, mining, token } = this;

            await faucet.setOwed(mining.address, '100');
            await mining.update();

            assert.equal(await token.balanceOf(mining.address), '100');
            assert.equal(await mining.totalMined(), '0');
            assert.equal(await mining.totalReleased(), '0');

            await faucet.setOwed(mining.address, '525');
            await mining.update();
            assert.equal(await token.balanceOf(mining.address), '625');
            assert.equal(await mining.totalMined(), '0');
            assert.equal(await mining.totalReleased(), '0');
          });

          it('update() pulls funds from faucet that can be retrieved using transferExcess', async () => {
            const { faucet, mining, token } = this;

            await faucet.setOwed(mining.address, '100');
            await mining.update();

            await mining.transferExcess(alice, { from:deployer });
            assert.equal(await token.balanceOf(alice), '100');
            assert.equal(await mining.totalMined(), '0');
            assert.equal(await mining.totalReleased(), '0');

            await faucet.setOwed(mining.address, '525');
            await mining.update();
            await mining.transferExcess(bob, { from:deployer });
            assert.equal(await token.balanceOf(alice), '100');
            assert.equal(await token.balanceOf(bob), '525');
            assert.equal(await mining.totalMined(), '0');
            assert.equal(await mining.totalReleased(), '0');
          });
        });

        context('with one miner', () => {
          beforeEach(async () => {
            const { faucet, token } = this;

            await token.mint(faucet.address,  100000000000);
          });

          it('launchMission invokes update() but does not credit tokens to new miner', async () => {
            const { faucet, mining, token } = this;

            await faucet.setOwed(mining.address, '100');
            await mining.launchMission([0], [], [], alice, { from:alice });
            assert.equal(await token.balanceOf(mining.address), '100');
            assert.equal(await mining.totalMined(), '0');
            assert.equal(await mining.totalReleased(), '0');
            assert.equal(await mining.releasable(alice), '0');
          });

          it('launchMission invokes update() and tokens received are retrievable using transferExcess', async () => {
            const { faucet, mining, token } = this;

            await faucet.setOwed(mining.address, '100');
            await mining.launchMission([0], [], [], alice, { from:alice });
            await mining.transferExcess(bob, { from:manager })
            assert.equal(await token.balanceOf(bob), '100');
            assert.equal(await mining.totalMined(), '0');
            assert.equal(await mining.totalReleased(), '0');
            assert.equal(await mining.releasable(alice), '0');
          });

          it('update() after a mission is launched will pull tokens and allocate for the miner', async () => {
            const { faucet, mining, token } = this;

            await mining.launchMission([0], [], [], alice, { from:alice });
            await faucet.setOwed(mining.address, '100');

            await mining.update();
            assert.equal(await token.balanceOf(mining.address), '100');
            assert.equal(await mining.totalMined(), '100');
            assert.equal(await mining.totalReleased(), '0');
            assert.equal(await mining.releasable(alice), '100');
            assert.equal(await mining.released(alice), '0');

            await faucet.setOwed(mining.address, '225');

            await mining.update();
            assert.equal(await token.balanceOf(mining.address), '325');
            assert.equal(await mining.totalMined(), '325');
            assert.equal(await mining.totalReleased(), '0');
            assert.equal(await mining.releasable(alice), '325');
            assert.equal(await mining.released(alice), '0');
          });

          it('pause() after a mission is launched will pull tokens and allocate for the miner', async () => {
            const { faucet, mining, token } = this;

            await mining.launchMission([0], [], [], alice, { from:alice });
            await faucet.setOwed(mining.address, '100');

            await mining.pause({ from:manager });
            assert.equal(await token.balanceOf(mining.address), '100');
            assert.equal(await mining.totalMined(), '100');
            assert.equal(await mining.totalReleased(), '0');
            assert.equal(await mining.releasable(alice), '100');
            assert.equal(await mining.released(alice), '0');
          });

          it('update() does not pull tokens when paused', async () => {
            const { faucet, mining, token } = this;

            await mining.launchMission([0], [], [], alice, { from:alice });
            await faucet.setOwed(mining.address, '100');

            await mining.pause({ from:manager });
            assert.equal(await token.balanceOf(mining.address), '100');
            assert.equal(await mining.totalMined(), '100');
            assert.equal(await mining.totalReleased(), '0');
            assert.equal(await mining.releasable(alice), '100');
            assert.equal(await mining.released(alice), '0');

            await faucet.setOwed(mining.address, '225');

            await mining.update();
            assert.equal(await token.balanceOf(mining.address), '100');
            assert.equal(await mining.totalMined(), '100');
            assert.equal(await mining.totalReleased(), '0');
            assert.equal(await mining.releasable(alice), '100');
            assert.equal(await mining.released(alice), '0');
            assert.equal(await faucet.releasable(mining.address), '225');
          });

          it('unpause() pulls any tokens available from faucet', async () => {
            const { faucet, mining, token } = this;

            await mining.launchMission([0], [], [], alice, { from:alice });
            await faucet.setOwed(mining.address, '100');

            await mining.pause({ from:manager });
            assert.equal(await token.balanceOf(mining.address), '100');
            assert.equal(await mining.totalMined(), '100');
            assert.equal(await mining.totalReleased(), '0');
            assert.equal(await mining.releasable(alice), '100');
            assert.equal(await mining.released(alice), '0');

            await faucet.setOwed(mining.address, '225');

            await mining.unpause({ from:manager });
            assert.equal(await token.balanceOf(mining.address), '325');
            assert.equal(await mining.totalMined(), '325');
            assert.equal(await mining.totalReleased(), '0');
            assert.equal(await mining.releasable(alice), '325');
            assert.equal(await mining.released(alice), '0');
          });

          it('launchMission() after another mission is launched will pull tokens and allocate for the miner', async () => {
            const { faucet, mining, token } = this;

            await mining.launchMission([0], [], [], alice, { from:alice });
            await faucet.setOwed(mining.address, '100');

            await mining.launchMission([1], [], [], alice, { from:alice });
            assert.equal(await token.balanceOf(mining.address), '100');
            assert.equal(await mining.totalMined(), '100');
            assert.equal(await mining.totalReleased(), '0');
            assert.equal(await mining.releasable(alice), '100');
            assert.equal(await mining.released(alice), '0');

            await faucet.setOwed(mining.address, '225');

            await mining.launchMission([2], [], [], alice, { from:alice });
            assert.equal(await token.balanceOf(mining.address), '325');
            assert.equal(await mining.totalMined(), '325');
            assert.equal(await mining.totalReleased(), '0');
            assert.equal(await mining.releasable(alice), '325');
            assert.equal(await mining.released(alice), '0');
          });

          it('recallMission() invokes update() but prevents future mining if last missison', async () => {
            const { faucet, mining, token } = this;

            await mining.launchMission([0], [], [], bob, { from:alice });
            await mining.launchMission([1], [], [], bob, { from:alice });
            await faucet.setOwed(mining.address, '100');

            await mining.recallMission(0, carol, { from:bob });
            assert.equal(await token.balanceOf(mining.address), '100');
            assert.equal(await mining.totalMined(), '100');
            assert.equal(await mining.totalReleased(), '0');
            assert.equal(await mining.releasable(alice), '0');
            assert.equal(await mining.releasable(bob), '100');
            assert.equal(await mining.releasable(carol), '0');

            await faucet.setOwed(mining.address, '225');

            await mining.recallMission(1, carol, { from:bob });
            assert.equal(await token.balanceOf(mining.address), '325');
            assert.equal(await mining.totalMined(), '325');
            assert.equal(await mining.totalReleased(), '0');
            assert.equal(await mining.releasable(alice), '0');
            assert.equal(await mining.releasable(bob), '325');
            assert.equal(await mining.releasable(carol), '0');

            await faucet.setOwed(mining.address, '50');

            await mining.update();
            assert.equal(await token.balanceOf(mining.address), '375');
            assert.equal(await mining.totalMined(), '325');
            assert.equal(await mining.totalReleased(), '0');
            assert.equal(await mining.releasable(alice), '0');
            assert.equal(await mining.releasable(bob), '325');
            assert.equal(await mining.releasable(carol), '0');

            await mining.transferExcess(dave, { from:manager });
            assert.equal(await token.balanceOf(mining.address), '325');
            assert.equal(await mining.totalMined(), '325');
            assert.equal(await mining.totalReleased(), '0');
            assert.equal(await mining.releasable(alice), '0');
            assert.equal(await mining.releasable(bob), '325');
            assert.equal(await mining.releasable(carol), '0');
            assert.equal(await token.balanceOf(dave), '50');
          });

          it('alternating between mining (launchMission) and not-mining (recallMission) behaves as expected', async () => {
            const { faucet, mining, token } = this;

            await faucet.setOwed(mining.address, '100');
            await mining.launchMission([0], [], [], bob, { from:alice });
            assert.equal(await token.balanceOf(mining.address), '100');
            assert.equal(await mining.totalMined(), '0');
            assert.equal(await mining.totalReleased(), '0');
            assert.equal(await mining.releasable(alice), '0');
            assert.equal(await mining.releasable(bob), '0');
            assert.equal(await mining.releasable(carol), '0');

            await faucet.setOwed(mining.address, '120');
            await mining.recallMission(0, alice, { from:bob });
            assert.equal(await token.balanceOf(mining.address), '220');
            assert.equal(await mining.totalMined(), '120');
            assert.equal(await mining.totalReleased(), '0');
            assert.equal(await mining.releasable(alice), '0');
            assert.equal(await mining.releasable(bob), '120');
            assert.equal(await mining.releasable(carol), '0');

            await faucet.setOwed(mining.address, '130');
            await mining.launchMission([2], [], [], carol, { from:alice });
            assert.equal(await token.balanceOf(mining.address), '350');
            assert.equal(await mining.totalMined(), '120');
            assert.equal(await mining.totalReleased(), '0');
            assert.equal(await mining.releasable(alice), '0');
            assert.equal(await mining.releasable(bob), '120');
            assert.equal(await mining.releasable(carol), '0');

            await faucet.setOwed(mining.address, '140');
            await mining.recallMission(1, alice, { from:carol });
            assert.equal(await token.balanceOf(mining.address), '490');
            assert.equal(await mining.totalMined(), '260');
            assert.equal(await mining.totalReleased(), '0');
            assert.equal(await mining.releasable(alice), '0');
            assert.equal(await mining.releasable(bob), '120');
            assert.equal(await mining.releasable(carol), '140');
          });

          it('"releasable" includes to-be-retrieved (from faucet) funds', async () => {
            const { faucet, mining, token } = this;

            await faucet.setOwed(mining.address, '100');
            assert.equal(await mining.releasable(alice), '0');
            assert.equal(await mining.releasable(bob), '0');
            assert.equal(await mining.releasable(carol), '0');
            await mining.launchMission([0], [], [], bob, { from:alice });
            assert.equal(await token.balanceOf(mining.address), '100');
            assert.equal(await mining.totalMined(), '0');
            assert.equal(await mining.totalReleased(), '0');

            await faucet.setOwed(mining.address, '120');
            assert.equal(await mining.releasable(alice), '0');
            assert.equal(await mining.releasable(bob), '120');
            assert.equal(await mining.releasable(carol), '0');
            await mining.recallMission(0, alice, { from:bob });
            assert.equal(await token.balanceOf(mining.address), '220');
            assert.equal(await mining.totalMined(), '120');
            assert.equal(await mining.totalReleased(), '0');

            await faucet.setOwed(mining.address, '130');
            assert.equal(await mining.releasable(alice), '0');
            assert.equal(await mining.releasable(bob), '120');
            assert.equal(await mining.releasable(carol), '0');
            await mining.launchMission([2], [], [], carol, { from:alice });
            assert.equal(await token.balanceOf(mining.address), '350');
            assert.equal(await mining.totalMined(), '120');
            assert.equal(await mining.totalReleased(), '0');

            await faucet.setOwed(mining.address, '140');
            assert.equal(await mining.releasable(alice), '0');
            assert.equal(await mining.releasable(bob), '120');
            assert.equal(await mining.releasable(carol), '140');
            await mining.recallMission(1, alice, { from:carol });
            assert.equal(await token.balanceOf(mining.address), '490');
            assert.equal(await mining.totalMined(), '260');
            assert.equal(await mining.totalReleased(), '0');
          });

          it('"release(address,address)" retrieves funds owed to caller', async () => {
            const { faucet, mining, token } = this;

            await faucet.setOwed(mining.address, '100');
            await mining.launchMission([0], [], [], bob, { from:alice });
            assert.equal(await token.balanceOf(mining.address), '100');
            assert.equal(await mining.totalMined(), '0');
            assert.equal(await mining.totalReleased(), '0');
            assert.equal(await mining.releasable(alice), '0');
            assert.equal(await mining.releasable(bob), '0');
            assert.equal(await mining.releasable(carol), '0');

            await faucet.setOwed(mining.address, '120');
            await mining.recallMission(0, alice, { from:bob });
            await mining.methods["release(address,address)"](bob, dave, { from:bob });
            assert.equal(await token.balanceOf(mining.address), '100');
            assert.equal(await mining.totalReleased(), '120');
            assert.equal(await mining.released(bob), '120');
            assert.equal(await mining.releasable(alice), '0');
            assert.equal(await mining.releasable(bob), '0');
            assert.equal(await mining.releasable(carol), '0');
            assert.equal(await token.balanceOf(dave), '120');

            await faucet.setOwed(mining.address, '130');
            await mining.launchMission([2], [], [], carol, { from:alice });
            await mining.methods["release(address,address)"](bob, dave, { from:bob });
            await mining.methods["release(address,address)"](carol, dave, { from:carol });
            assert.equal(await token.balanceOf(mining.address), '230');
            assert.equal(await mining.totalReleased(), '120');
            assert.equal(await mining.released(bob), '120');
            assert.equal(await mining.released(carol), '0');
            assert.equal(await mining.releasable(alice), '0');
            assert.equal(await mining.releasable(bob), '0');
            assert.equal(await mining.releasable(carol), '0');
            assert.equal(await token.balanceOf(dave), '120');

            await faucet.setOwed(mining.address, '140');
            await mining.recallMission(1, alice, { from:carol });
            await mining.methods["release(address,address)"](bob, dave, { from:bob });
            await mining.methods["release(address,address)"](carol, dave, { from:carol });
            assert.equal(await token.balanceOf(mining.address), '230');
            assert.equal(await mining.totalMined(), '260');
            assert.equal(await mining.totalReleased(), '260');
            assert.equal(await mining.released(bob), '120');
            assert.equal(await mining.released(carol), '140');
            assert.equal(await mining.releasable(alice), '0');
            assert.equal(await mining.releasable(bob), '0');
            assert.equal(await mining.releasable(carol), '0');
            assert.equal(await token.balanceOf(dave), '260');
          });

          it('"release(address,address,amount)" retrieves funds owed to caller', async () => {
            const { faucet, mining, token } = this;

            await faucet.setOwed(mining.address, '100');
            await mining.launchMission([0], [], [], bob, { from:alice });
            assert.equal(await token.balanceOf(mining.address), '100');
            assert.equal(await mining.totalMined(), '0');
            assert.equal(await mining.totalReleased(), '0');
            assert.equal(await mining.releasable(alice), '0');
            assert.equal(await mining.releasable(bob), '0');
            assert.equal(await mining.releasable(carol), '0');

            await faucet.setOwed(mining.address, '120');
            await mining.recallMission(0, alice, { from:bob });
            await mining.methods["release(address,address,uint256)"](bob, dave, 50, { from:bob });
            assert.equal(await token.balanceOf(mining.address), '170');
            assert.equal(await mining.totalReleased(), '50');
            assert.equal(await mining.released(bob), '50');
            assert.equal(await mining.releasable(alice), '0');
            assert.equal(await mining.releasable(bob), '70');
            assert.equal(await mining.releasable(carol), '0');
            assert.equal(await token.balanceOf(dave), '50');

            await faucet.setOwed(mining.address, '130');
            await mining.launchMission([2], [], [], carol, { from:alice });

            await faucet.setOwed(mining.address, '140');
            await mining.recallMission(1, alice, { from:carol });
            await mining.methods["release(address,address,uint256)"](carol, dave, '60', { from:carol });
            assert.equal(await token.balanceOf(mining.address), '380');
            assert.equal(await mining.totalReleased(), '110');
            assert.equal(await mining.released(bob), '50');
            assert.equal(await mining.released(carol), '60');
            assert.equal(await mining.releasable(alice), '0');
            assert.equal(await mining.releasable(bob), '70');
            assert.equal(await mining.releasable(carol), '80');
            assert.equal(await token.balanceOf(dave), '110');
          });
        });

        context('with multiple miners', () => {
          beforeEach(async () => {
            const { faucet, token, mining, appraiser } = this;

            await mining.setMissionLandingSiteToken(this.landingSite.address, { from:manager });
            await mining.setMissionCompleteMultiplier(3, 2, { from:manager });   // 150%

            // base score: 100 lander, 50 landing site, 10 payload. Set some bonuses
            // lucky number 7 landers
            await appraiser.setAppraisals(this.lander.address, [7, 17, 27],  [700, 700, 700], { from:deployer });
            // landing sites: numbers 1, 2, 3 high-rankeds
            await appraiser.setAppraisals(this.landingSite.address, [1, 2, 3],  [100, 90, 70], { from:deployer });
            // payloads: evens get a bonus
            await appraiser.setAppraisals(
              this.payload.address,
              [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28],
              [20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20],
              { from:deployer }
            );

            await token.mint(faucet.address, 100000000000);
          });

          it('launchMission updates mining power as expected', async () => {
            const { faucet, mining, token } = this;

            await mining.launchMission([0], [], [], alice, { from:alice }); // 0, 100
            // alice: 100
            assert.equal(await mining.totalMiningPower(), '100');
            assert.equal((await mining.userInfo(alice)).miningPower, '100');
            assert.equal((await mining.userInfo(bob)).miningPower, '0');
            assert.equal((await mining.userInfo(carol)).miningPower, '0');
            assert.equal((await mining.userInfo(dave)).miningPower, '0');
            await mining.launchMission([10], [10], [10, 11, 12], bob, { from:bob });  // 1, 300
            // alice: 100, bob: 300
            assert.equal(await mining.totalMiningPower(), '400');
            assert.equal((await mining.userInfo(alice)).miningPower, '100');
            assert.equal((await mining.userInfo(bob)).miningPower, '300');
            assert.equal((await mining.userInfo(carol)).miningPower, '0');
            assert.equal((await mining.userInfo(dave)).miningPower, '0');
            await mining.launchMission([27], [], [20, 21], carol, { from:carol });  // 2, 730
            // alice: 100, bob: 300, carol: 730
            assert.equal(await mining.totalMiningPower(), '1130');
            assert.equal((await mining.userInfo(alice)).miningPower, '100');
            assert.equal((await mining.userInfo(bob)).miningPower, '300');
            assert.equal((await mining.userInfo(carol)).miningPower, '730');
            assert.equal((await mining.userInfo(dave)).miningPower, '0');
            await mining.launchMission([1], [1], [], alice, { from:alice });  // 3, 200
            // alice: 300, bob: 300, carol: 730
            assert.equal(await mining.totalMiningPower(), '1330');
            assert.equal((await mining.userInfo(alice)).miningPower, '300');
            assert.equal((await mining.userInfo(bob)).miningPower, '300');
            assert.equal((await mining.userInfo(carol)).miningPower, '730');
            assert.equal((await mining.userInfo(dave)).miningPower, '0');
            await mining.launchMission([7], [2], [5, 6, 7, 8], dave, { from:alice }); // 4, 1275
            // alice: 300, bob: 300, carol: 730, dave: 1275
            assert.equal(await mining.totalMiningPower(), '2605');
            assert.equal((await mining.userInfo(alice)).miningPower, '300');
            assert.equal((await mining.userInfo(bob)).miningPower, '300');
            assert.equal((await mining.userInfo(carol)).miningPower, '730');
            assert.equal((await mining.userInfo(dave)).miningPower, '1275');
            await mining.launchMission([14], [14], [14], dave, { from:bob });  // 5, 255
            // alice: 300, bob: 300, carol: 730, dave: 1530
            assert.equal(await mining.totalMiningPower(), '2860');
            assert.equal((await mining.userInfo(alice)).miningPower, '300');
            assert.equal((await mining.userInfo(bob)).miningPower, '300');
            assert.equal((await mining.userInfo(carol)).miningPower, '730');
            assert.equal((await mining.userInfo(dave)).miningPower, '1530');
          });

          it('launchMission / recallMission flow updates mining power as expected', async () => {
            const { faucet, mining, token } = this;

            await mining.launchMission([0], [], [], alice, { from:alice }); // 0, 100
            // alice: 100
            await mining.launchMission([10], [10], [10, 11, 12], bob, { from:bob });  // 1, 300
            // alice: 100, bob: 300
            await mining.launchMission([27], [], [20, 21], carol, { from:carol });  // 2, 730
            // alice: 100, bob: 300, carol: 730
            await mining.launchMission([1], [1], [], alice, { from:alice });  // 3, 200
            // alice: 300, bob: 300, carol: 730
            await mining.recallMission(0, alice, { from:alice });
            // alice: 200, bob: 300, carol: 730
            assert.equal(await mining.totalMiningPower(), '1230');
            assert.equal((await mining.userInfo(alice)).miningPower, '200');
            assert.equal((await mining.userInfo(bob)).miningPower, '300');
            assert.equal((await mining.userInfo(carol)).miningPower, '730');
            assert.equal((await mining.userInfo(dave)).miningPower, '0');

            await mining.launchMission([7], [2], [5, 6, 7, 8], dave, { from:alice }); // 4, 1275
            // alice: 200, bob: 300, carol: 730, dave: 1275
            assert.equal(await mining.totalMiningPower(), '2505');
            assert.equal((await mining.userInfo(alice)).miningPower, '200');
            assert.equal((await mining.userInfo(bob)).miningPower, '300');
            assert.equal((await mining.userInfo(carol)).miningPower, '730');
            assert.equal((await mining.userInfo(dave)).miningPower, '1275');

            await mining.launchMission([14], [14], [14], dave, { from:bob });  // 5, 255
            // alice: 200, bob: 300, carol: 730, dave: 1530
            assert.equal(await mining.totalMiningPower(), '2760');
            assert.equal((await mining.userInfo(alice)).miningPower, '200');
            assert.equal((await mining.userInfo(bob)).miningPower, '300');
            assert.equal((await mining.userInfo(carol)).miningPower, '730');
            assert.equal((await mining.userInfo(dave)).miningPower, '1530');

            await mining.recallMission(2, carol, { from:carol });
            // alice: 200, bob: 300, carol: 0, dave: 1530
            assert.equal(await mining.totalMiningPower(), '2030');
            assert.equal((await mining.userInfo(alice)).miningPower, '200');
            assert.equal((await mining.userInfo(bob)).miningPower, '300');
            assert.equal((await mining.userInfo(carol)).miningPower, '0');
            assert.equal((await mining.userInfo(dave)).miningPower, '1530');

            await mining.recallMission(4, alice, { from:dave });
            // alice: 200, bob: 300, carol: 0, dave: 255
            assert.equal(await mining.totalMiningPower(), '755');
            assert.equal((await mining.userInfo(alice)).miningPower, '200');
            assert.equal((await mining.userInfo(bob)).miningPower, '300');
            assert.equal((await mining.userInfo(carol)).miningPower, '0');
            assert.equal((await mining.userInfo(dave)).miningPower, '255');

            await mining.launchMission([27], [25], [28], bob, { from:carol });  // 6, 1155
            // alice: 200, bob: 1455, carol: 0, dave: 255
            assert.equal(await mining.totalMiningPower(), '1910');
            assert.equal((await mining.userInfo(alice)).miningPower, '200');
            assert.equal((await mining.userInfo(bob)).miningPower, '1455');
            assert.equal((await mining.userInfo(carol)).miningPower, '0');
            assert.equal((await mining.userInfo(dave)).miningPower, '255');

            await mining.recallMission(6, carol, { from:bob });  // 6, 1155
            // alice: 200, bob: 300, carol: 0, dave: 255
            assert.equal(await mining.totalMiningPower(), '755');
            assert.equal((await mining.userInfo(alice)).miningPower, '200');
            assert.equal((await mining.userInfo(bob)).miningPower, '300');
            assert.equal((await mining.userInfo(carol)).miningPower, '0');
            assert.equal((await mining.userInfo(dave)).miningPower, '255');
          });

          context('with launch/recall flow and proportional funding', () => {
            it('updating mined and releasable', async () => {
              const { faucet, mining, token } = this;

              await faucet.setOwed(mining.address, 1000);
              await mining.launchMission([0], [], [], alice, { from:alice }); // 0, 100
              assert.equal(await mining.totalMined(), '0');
              assert.equal(await mining.releasable(alice), '0');
              assert.equal(await mining.releasable(bob), '0');
              assert.equal(await mining.releasable(carol), '0');
              assert.equal(await mining.releasable(dave), '0');
              // total: 100, alice: 100

              await faucet.setOwed(mining.address, 100);
              await mining.launchMission([10], [10], [10, 11, 12], bob, { from:bob });  // 1, 300
              assert.equal(await mining.totalMined(), '100');
              assert.equal(await mining.releasable(alice), '100');
              assert.equal(await mining.releasable(bob), '0');
              assert.equal(await mining.releasable(carol), '0');
              assert.equal(await mining.releasable(dave), '0');
              // total: 400, alice: 100, bob: 300

              await faucet.setOwed(mining.address, 100);
              await mining.launchMission([27], [], [20, 21], carol, { from:carol });  // 2, 730
              assert.equal(await mining.totalMined(), '200');
              assert.equal(await mining.releasable(alice), '125');
              assert.equal(await mining.releasable(bob), '75');
              assert.equal(await mining.releasable(carol), '0');
              assert.equal(await mining.releasable(dave), '0');
              // total: 1130, alice: 100, bob: 300, carol: 730

              await faucet.setOwed(mining.address, 2260);
              await mining.launchMission([1], [1], [], alice, { from:alice });  // 3, 200
              assert.equal(await mining.totalMined(), '2460');
              assert.equal(await mining.releasable(alice), '325');
              assert.equal(await mining.releasable(bob), '675');
              assert.equal(await mining.releasable(carol), '1460');
              assert.equal(await mining.releasable(dave), '0');
              // total: 1330, alice: 300, bob: 300, carol: 730

              await faucet.setOwed(mining.address, 133);
              await mining.recallMission(0, alice, { from:alice });
              assert.equal(await mining.totalMined(), '2593');
              assert.equal(await mining.releasable(alice), '355');
              assert.equal(await mining.releasable(bob), '705');
              assert.equal(await mining.releasable(carol), '1533');
              assert.equal(await mining.releasable(dave), '0');
              // total 1230, alice: 200, bob: 300, carol: 730

              await faucet.setOwed(mining.address, 1230);
              await mining.launchMission([7], [2], [5, 6, 7, 8], dave, { from:alice }); // 4, 1275
              assert.equal(await mining.totalMined(), '3823');
              assert.equal(await mining.releasable(alice), '555');
              assert.equal(await mining.releasable(bob), '1005');
              assert.equal(await mining.releasable(carol), '2263');
              assert.equal(await mining.releasable(dave), '0');
              // total: 2505, alice: 200, bob: 300, carol: 730, dave: 1275

              await faucet.setOwed(mining.address, 2505);
              await mining.launchMission([14], [14], [14], dave, { from:bob });  // 5, 255
              assert.equal(await mining.totalMined(), '6328');
              assert.equal(await mining.releasable(alice), '755');
              assert.equal(await mining.releasable(bob), '1305');
              assert.equal(await mining.releasable(carol), '2993');
              assert.equal(await mining.releasable(dave), '1275');
              // total: 2760, alice: 200, bob: 300, carol: 730, dave: 1530

              await faucet.setOwed(mining.address, 276);
              await mining.recallMission(2, carol, { from:carol });
              assert.equal(await mining.totalMined(), '6604');
              assert.equal(await mining.releasable(alice), '775');
              assert.equal(await mining.releasable(bob), '1335');
              assert.equal(await mining.releasable(carol), '3066');
              assert.equal(await mining.releasable(dave), '1428');
              // total: 2030, alice: 200, bob: 300, carol: 0, dave: 1530

              await faucet.setOwed(mining.address, 203);
              await mining.recallMission(4, alice, { from:dave });
              assert.equal(await mining.totalMined(), '6807');
              assert.equal(await mining.releasable(alice), '795');
              assert.equal(await mining.releasable(bob), '1365');
              assert.equal(await mining.releasable(carol), '3066');
              assert.equal(await mining.releasable(dave), '1581');
              // total: 755, alice: 200, bob: 300, carol: 0, dave: 255

              await faucet.setOwed(mining.address, 755);
              await mining.launchMission([27], [25], [28], bob, { from:carol });  // 6, 1155
              assert.equal(await mining.totalMined(), '7562');
              assert.equal(await mining.releasable(alice), '995');
              assert.equal(await mining.releasable(bob), '1665');
              assert.equal(await mining.releasable(carol), '3066');
              assert.equal(await mining.releasable(dave), '1836');
              // total: 1910, alice: 200, bob: 1455, carol: 0, dave: 255

              await faucet.setOwed(mining.address, 3820);
              await mining.recallMission(6, carol, { from:bob });  // 6, 1155
              assert.equal(await mining.totalMined(), '11382');
              assert.equal(await mining.releasable(alice), '1395');
              assert.equal(await mining.releasable(bob), '4575');
              assert.equal(await mining.releasable(carol), '3066');
              assert.equal(await mining.releasable(dave), '2346');
              // alice: 200, bob: 300, carol: 0, dave: 255
            });

            it('releasing rewards with release(address,address)', async () => {
              const { faucet, mining, token } = this;

              await faucet.setOwed(mining.address, 1000);
              await mining.launchMission([0], [], [], alice, { from:alice }); // 0, 100
              await mining.release(alice, alice, { from:alice });
              assert.equal(await mining.totalReleased(), '0');
              assert.equal(await mining.released(alice), '0');
              assert.equal(await mining.released(bob), '0');
              assert.equal(await mining.released(carol), '0');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(mining.address), '1000');
              assert.equal(await token.balanceOf(alice), '0');
              assert.equal(await token.balanceOf(bob), '0');
              assert.equal(await token.balanceOf(carol), '0');
              assert.equal(await token.balanceOf(dave), '0');
              // total: 100, alice: 100
              // funds +1000, mined + 0, alice: +0

              await faucet.setOwed(mining.address, 100);
              await mining.launchMission([10], [10], [10, 11, 12], bob, { from:bob });  // 1, 300
              await mining.release(alice, alice, { from:alice });
              assert.equal(await mining.totalReleased(), '100');
              assert.equal(await mining.released(alice), '100');
              assert.equal(await mining.released(bob), '0');
              assert.equal(await mining.released(carol), '0');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(mining.address), '1000');
              assert.equal(await token.balanceOf(alice), '100');
              assert.equal(await token.balanceOf(bob), '0');
              assert.equal(await token.balanceOf(carol), '0');
              assert.equal(await token.balanceOf(dave), '0');
              // total: 400, alice: 100, bob: 300
              // funds +100, mined + 100, alice: +100, bob: +0

              await faucet.setOwed(mining.address, 100);
              await mining.launchMission([27], [], [20, 21], carol, { from:carol });  // 2, 730
              await mining.release(bob, bob, { from:bob });
              assert.equal(await mining.totalReleased(), '175');
              assert.equal(await mining.released(alice), '100');
              assert.equal(await mining.released(bob), '75');
              assert.equal(await mining.released(carol), '0');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(mining.address), '1025');
              assert.equal(await token.balanceOf(alice), '100');
              assert.equal(await token.balanceOf(bob), '75');
              assert.equal(await token.balanceOf(carol), '0');
              assert.equal(await token.balanceOf(dave), '0');
              // total: 1130, alice: 100, bob: 300, carol: 730
              // funds: +100, mined: +100, alice: +25, bob: +75

              await faucet.setOwed(mining.address, 2260);
              await mining.launchMission([1], [1], [], alice, { from:alice });  // 3, 200
              await mining.release(carol, carol, { from:carol });
              assert.equal(await mining.totalReleased(), '1635');
              assert.equal(await mining.released(alice), '100');
              assert.equal(await mining.released(bob), '75');
              assert.equal(await mining.released(carol), '1460');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(mining.address), '1825');
              assert.equal(await token.balanceOf(alice), '100');
              assert.equal(await token.balanceOf(bob), '75');
              assert.equal(await token.balanceOf(carol), '1460');
              assert.equal(await token.balanceOf(dave), '0');
              // total: 1330, alice: 300, bob: 300, carol: 730
              // funds: +2260, mined: +2260, alice: +200, bob: +600, carol +1460

              await faucet.setOwed(mining.address, 133);
              await mining.recallMission(0, alice, { from:alice });
              await mining.release(dave, dave, { from:dave });
              assert.equal(await mining.totalReleased(), '1635');
              assert.equal(await mining.released(alice), '100');
              assert.equal(await mining.released(bob), '75');
              assert.equal(await mining.released(carol), '1460');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(mining.address), '1958');
              assert.equal(await token.balanceOf(alice), '100');
              assert.equal(await token.balanceOf(bob), '75');
              assert.equal(await token.balanceOf(carol), '1460');
              assert.equal(await token.balanceOf(dave), '0');
              // total 1230, alice: 200, bob: 300, carol: 730
              // funds: +133, mined: +133, alice: +30, bob: +30, carol +73

              await faucet.setOwed(mining.address, 1230);
              await mining.launchMission([7], [2], [5, 6, 7, 8], dave, { from:alice }); // 4, 1275
              await mining.release(alice, alice, { from:alice });
              assert.equal(await mining.totalReleased(), '2090');
              assert.equal(await mining.released(alice), '555');
              assert.equal(await mining.released(bob), '75');
              assert.equal(await mining.released(carol), '1460');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(mining.address), '2733');
              assert.equal(await token.balanceOf(alice), '555');
              assert.equal(await token.balanceOf(bob), '75');
              assert.equal(await token.balanceOf(carol), '1460');
              assert.equal(await token.balanceOf(dave), '0');
              // total: 2505, alice: 200, bob: 300, carol: 730, dave: 1275
              // funds: +1230, mined: +1230, alice: +200, bob: +300, carol +730

              await faucet.setOwed(mining.address, 2505);
              await mining.launchMission([14], [14], [14], dave, { from:bob });  // 5, 255
              await mining.release(bob, bob, { from:bob });
              assert.equal(await mining.totalReleased(), '3320');
              assert.equal(await mining.released(alice), '555');
              assert.equal(await mining.released(bob), '1305');
              assert.equal(await mining.released(carol), '1460');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(mining.address), '4008');
              assert.equal(await token.balanceOf(alice), '555');
              assert.equal(await token.balanceOf(bob), '1305');
              assert.equal(await token.balanceOf(carol), '1460');
              assert.equal(await token.balanceOf(dave), '0');
              // total: 2760, alice: 200, bob: 300, carol: 730, dave: 1530
              // funds: +2505, mined: +2505, alice: +200, bob: +300, carol +730, dave +1275

              await faucet.setOwed(mining.address, 276);
              await mining.recallMission(2, carol, { from:carol });
              await mining.release(carol, carol, { from:carol }); // 1606
              assert.equal(await mining.totalReleased(), '4926');
              assert.equal(await mining.released(alice), '555');
              assert.equal(await mining.released(bob), '1305');
              assert.equal(await mining.released(carol), '3066');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(mining.address), '2678');
              assert.equal(await token.balanceOf(alice), '555');
              assert.equal(await token.balanceOf(bob), '1305');
              assert.equal(await token.balanceOf(carol), '3066');
              assert.equal(await token.balanceOf(dave), '0');
              // total: 2030, alice: 200, bob: 300, carol: 0, dave: 1530
              // funds: +276, mined: +276, alice: +20, bob: +30, carol +73, dave +153

              await faucet.setOwed(mining.address, 203);
              await mining.recallMission(4, alice, { from:dave });
              await mining.release(dave, dave, { from:dave });   // 1581
              assert.equal(await mining.totalReleased(), '6507');
              assert.equal(await mining.released(alice), '555');
              assert.equal(await mining.released(bob), '1305');
              assert.equal(await mining.released(carol), '3066');
              assert.equal(await mining.released(dave), '1581');
              assert.equal(await token.balanceOf(mining.address), '1300');
              assert.equal(await token.balanceOf(alice), '555');
              assert.equal(await token.balanceOf(bob), '1305');
              assert.equal(await token.balanceOf(carol), '3066');
              assert.equal(await token.balanceOf(dave), '1581');
              // total: 755, alice: 200, bob: 300, carol: 0, dave: 255
              // funds: +203, mined: +203, alice: +20, bob: +30, carol +0, dave +153

              await faucet.setOwed(mining.address, 755);
              await mining.launchMission([27], [25], [28], bob, { from:carol });  // 6, 1155
              await mining.release(alice, alice, { from:alice });   // 440
              assert.equal(await mining.totalReleased(), '6947');
              assert.equal(await mining.released(alice), '995');
              assert.equal(await mining.released(bob), '1305');
              assert.equal(await mining.released(carol), '3066');
              assert.equal(await mining.released(dave), '1581');
              assert.equal(await token.balanceOf(mining.address), '1615');
              assert.equal(await token.balanceOf(alice), '995');
              assert.equal(await token.balanceOf(bob), '1305');
              assert.equal(await token.balanceOf(carol), '3066');
              assert.equal(await token.balanceOf(dave), '1581');
              // total: 1910, alice: 200, bob: 1455, carol: 0, dave: 255
              // funds: +755, mined: +755, alice: +200, bob: +300, carol +0, dave +255

              await faucet.setOwed(mining.address, 3820);
              await mining.recallMission(6, carol, { from:bob });  // 6, 1155
              await mining.release(bob, bob, { from:bob });   // 3270
              assert.equal(await mining.totalReleased(), '10217');
              assert.equal(await mining.released(alice), '995');
              assert.equal(await mining.released(bob), '4575');
              assert.equal(await mining.released(carol), '3066');
              assert.equal(await mining.released(dave), '1581');
              assert.equal(await token.balanceOf(mining.address), '2165');
              assert.equal(await token.balanceOf(alice), '995');
              assert.equal(await token.balanceOf(bob), '4575');
              assert.equal(await token.balanceOf(carol), '3066');
              assert.equal(await token.balanceOf(dave), '1581');
              // total: 755, alice: 200, bob: 300, carol: 0, dave: 255
              // funds: +3820, mined: +400, alice: +400, bob: +2910, carol +0, dave +510

              await faucet.setOwed(mining.address, 755);
              await mining.release(carol, carol, {  from:carol });
              assert.equal(await mining.totalReleased(), '10217');
              assert.equal(await mining.released(alice), '995');
              assert.equal(await mining.released(bob), '4575');
              assert.equal(await mining.released(carol), '3066');
              assert.equal(await mining.released(dave), '1581');
              assert.equal(await token.balanceOf(mining.address), '2920');
              assert.equal(await token.balanceOf(alice), '995');
              assert.equal(await token.balanceOf(bob), '4575');
              assert.equal(await token.balanceOf(carol), '3066');
              assert.equal(await token.balanceOf(dave), '1581');
              // funds: +755, mined: +755, alice: +200, bob: +300, carol: +0, dave: +255

              await faucet.setOwed(mining.address, 1510);
              await mining.release(dave, dave, {  from:dave });
              assert.equal(await mining.totalReleased(), '11747');
              assert.equal(await mining.released(alice), '995');
              assert.equal(await mining.released(bob), '4575');
              assert.equal(await mining.released(carol), '3066');
              assert.equal(await mining.released(dave), '3111');
              assert.equal(await token.balanceOf(mining.address), '2900');
              assert.equal(await token.balanceOf(alice), '995');
              assert.equal(await token.balanceOf(bob), '4575');
              assert.equal(await token.balanceOf(carol), '3066');
              assert.equal(await token.balanceOf(dave), '3111');
              // funds: +1510, mined: +1510, alice: +400, bob: +600, carol: +0, dave: +510
            });

            it('releasing rewards with release(address,address,uint256)', async () => {
              const { faucet, mining, token } = this;

              await faucet.setOwed(mining.address, 1000);
              await mining.launchMission([0], [], [], alice, { from:alice }); // 0, 100
              await mining.methods["release(address,address,uint256)"](alice, alice, 0, { from:alice });
              assert.equal(await mining.totalReleased(), '0');
              assert.equal(await mining.released(alice), '0');
              assert.equal(await mining.released(bob), '0');
              assert.equal(await mining.released(carol), '0');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(mining.address), '1000');
              assert.equal(await token.balanceOf(alice), '0');
              assert.equal(await token.balanceOf(bob), '0');
              assert.equal(await token.balanceOf(carol), '0');
              assert.equal(await token.balanceOf(dave), '0');
              // total: 100, alice: 100
              // funds +1000, mined + 0, alice: +0

              await faucet.setOwed(mining.address, 100);
              await mining.launchMission([10], [10], [10, 11, 12], bob, { from:bob });  // 1, 300
              await mining.methods["release(address,address,uint256)"](alice, alice, 50, { from:alice });
              assert.equal(await mining.totalReleased(), '50');
              assert.equal(await mining.released(alice), '50');
              assert.equal(await mining.released(bob), '0');
              assert.equal(await mining.released(carol), '0');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(mining.address), '1050');
              assert.equal(await token.balanceOf(alice), '50');
              assert.equal(await token.balanceOf(bob), '0');
              assert.equal(await token.balanceOf(carol), '0');
              assert.equal(await token.balanceOf(dave), '0');
              // total: 400, alice: 100, bob: 300
              // funds +100, mined + 100, alice: +100, bob: +0

              await faucet.setOwed(mining.address, 100);
              await mining.launchMission([27], [], [20, 21], carol, { from:carol });  // 2, 730
              await mining.methods["release(address,address,uint256)"](bob, bob, 25, { from:bob });
              assert.equal(await mining.totalReleased(), '75');
              assert.equal(await mining.released(alice), '50');
              assert.equal(await mining.released(bob), '25');
              assert.equal(await mining.released(carol), '0');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(mining.address), '1125');
              assert.equal(await token.balanceOf(alice), '50');
              assert.equal(await token.balanceOf(bob), '25');
              assert.equal(await token.balanceOf(carol), '0');
              assert.equal(await token.balanceOf(dave), '0');
              // total: 1130, alice: 100, bob: 300, carol: 730
              // funds: +100, mined: +100, alice: +25, bob: +75

              await faucet.setOwed(mining.address, 2260);
              await mining.launchMission([1], [1], [], alice, { from:alice });  // 3, 200
              await mining.methods["release(address,address,uint256)"](carol, carol, 1410, { from:carol });
              assert.equal(await mining.totalReleased(), '1485');
              assert.equal(await mining.released(alice), '50');
              assert.equal(await mining.released(bob), '25');
              assert.equal(await mining.released(carol), '1410');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(mining.address), '1975');
              assert.equal(await token.balanceOf(alice), '50');
              assert.equal(await token.balanceOf(bob), '25');
              assert.equal(await token.balanceOf(carol), '1410');
              assert.equal(await token.balanceOf(dave), '0');
              // total: 1330, alice: 300, bob: 300, carol: 730
              // funds: +2260, mined: +2260, alice: +200, bob: +600, carol +1460
              // released 150 less, kept 150 more

              await faucet.setOwed(mining.address, 133);
              await mining.recallMission(0, alice, { from:alice });
              await mining.methods["release(address,address,uint256)"](dave, dave, 0, { from:dave });
              assert.equal(await mining.totalReleased(), '1485');
              assert.equal(await mining.released(alice), '50');
              assert.equal(await mining.released(bob), '25');
              assert.equal(await mining.released(carol), '1410');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(mining.address), '2108');
              assert.equal(await token.balanceOf(alice), '50');
              assert.equal(await token.balanceOf(bob), '25');
              assert.equal(await token.balanceOf(carol), '1410');
              assert.equal(await token.balanceOf(dave), '0');
              // total 1230, alice: 200, bob: 300, carol: 730
              // funds: +133, mined: +133, alice: +30, bob: +30, carol +73
              // released 150 less, kept 150 more

              await faucet.setOwed(mining.address, 1230);
              await mining.launchMission([7], [2], [5, 6, 7, 8], dave, { from:alice }); // 4, 1275
              await mining.methods["release(address,address,uint256)"](alice, alice, 405, { from:alice });
              assert.equal(await mining.totalReleased(), '1890');
              assert.equal(await mining.released(alice), '455');
              assert.equal(await mining.released(bob), '25');
              assert.equal(await mining.released(carol), '1410');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(mining.address), '2933');
              assert.equal(await token.balanceOf(alice), '455');
              assert.equal(await token.balanceOf(bob), '25');
              assert.equal(await token.balanceOf(carol), '1410');
              assert.equal(await token.balanceOf(dave), '0');
              // total: 2505, alice: 200, bob: 300, carol: 730, dave: 1275
              // funds: +1230, mined: +1230, alice: +200, bob: +300, carol +730
              // released 200 less, kept 200 more

              await faucet.setOwed(mining.address, 2505);
              await mining.launchMission([14], [14], [14], dave, { from:bob });  // 5, 255
              await mining.methods["release(address,address,uint256)"](bob, bob, 1180, { from:bob });
              assert.equal(await mining.totalReleased(), '3070');
              assert.equal(await mining.released(alice), '455');
              assert.equal(await mining.released(bob), '1205');
              assert.equal(await mining.released(carol), '1410');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(mining.address), '4258');
              assert.equal(await token.balanceOf(alice), '455');
              assert.equal(await token.balanceOf(bob), '1205');
              assert.equal(await token.balanceOf(carol), '1410');
              assert.equal(await token.balanceOf(dave), '0');
              // total: 2760, alice: 200, bob: 300, carol: 730, dave: 1530
              // funds: +2505, mined: +2505, alice: +200, bob: +300, carol +730, dave +1275
              // released 250 less, kept 250 more

              await faucet.setOwed(mining.address, 276);
              await mining.recallMission(2, carol, { from:carol });
              await mining.methods["release(address,address,uint256)"](carol, carol, 1556, { from:carol }); // 1606
              assert.equal(await mining.totalReleased(), '4626');
              assert.equal(await mining.released(alice), '455');
              assert.equal(await mining.released(bob), '1205');
              assert.equal(await mining.released(carol), '2966');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(mining.address), '2978');
              assert.equal(await token.balanceOf(alice), '455');
              assert.equal(await token.balanceOf(bob), '1205');
              assert.equal(await token.balanceOf(carol), '2966');
              assert.equal(await token.balanceOf(dave), '0');
              // total: 2030, alice: 200, bob: 300, carol: 0, dave: 1530
              // funds: +276, mined: +276, alice: +20, bob: +30, carol +73, dave +153
              // released 300 less, kept 300 more

              await faucet.setOwed(mining.address, 203);
              await mining.recallMission(4, alice, { from:dave });
              await mining.methods["release(address,address,uint256)"](dave, dave, 1531, { from:dave });   // 1581
              assert.equal(await mining.totalReleased(), '6157');
              assert.equal(await mining.released(alice), '455');
              assert.equal(await mining.released(bob), '1205');
              assert.equal(await mining.released(carol), '2966');
              assert.equal(await mining.released(dave), '1531');
              assert.equal(await token.balanceOf(mining.address), '1650');
              assert.equal(await token.balanceOf(alice), '455');
              assert.equal(await token.balanceOf(bob), '1205');
              assert.equal(await token.balanceOf(carol), '2966');
              assert.equal(await token.balanceOf(dave), '1531');
              // total: 755, alice: 200, bob: 300, carol: 0, dave: 255
              // funds: +203, mined: +203, alice: +20, bob: +30, carol +0, dave +153
              // released 350 less, kept 300 more

              await faucet.setOwed(mining.address, 755);
              await mining.launchMission([27], [25], [28], bob, { from:carol });  // 6, 1155
              await mining.methods["release(address,address,uint256)"](alice, alice, 410, { from:alice });   // 440
              assert.equal(await mining.totalReleased(), '6567');
              assert.equal(await mining.released(alice), '865');
              assert.equal(await mining.released(bob), '1205');
              assert.equal(await mining.released(carol), '2966');
              assert.equal(await mining.released(dave), '1531');
              assert.equal(await token.balanceOf(mining.address), '1995');
              assert.equal(await token.balanceOf(alice), '865');
              assert.equal(await token.balanceOf(bob), '1205');
              assert.equal(await token.balanceOf(carol), '2966');
              assert.equal(await token.balanceOf(dave), '1531');
              // total: 1910, alice: 200, bob: 1455, carol: 0, dave: 255
              // funds: +755, mined: +755, alice: +200, bob: +300, carol +0, dave +255
              // released 400 less, kept 400 more

              await faucet.setOwed(mining.address, 3820);
              await mining.recallMission(6, carol, { from:bob });  // 6, 1155
              await mining.methods["release(address,address,uint256)"](bob, bob, 3220, { from:bob });   // 3270
              assert.equal(await mining.totalReleased(), '9787');
              assert.equal(await mining.released(alice), '865');
              assert.equal(await mining.released(bob), '4425');
              assert.equal(await mining.released(carol), '2966');
              assert.equal(await mining.released(dave), '1531');
              assert.equal(await token.balanceOf(mining.address), '2595');
              assert.equal(await token.balanceOf(alice), '865');
              assert.equal(await token.balanceOf(bob), '4425');
              assert.equal(await token.balanceOf(carol), '2966');
              assert.equal(await token.balanceOf(dave), '1531');
              // total: 755, alice: 200, bob: 300, carol: 0, dave: 255
              // funds: +3820, mined: +400, alice: +400, bob: +2910, carol +0, dave +510
              // released 450 less, kept 450 more

              await faucet.setOwed(mining.address, 755);
              await mining.methods["release(address,address,uint256)"](carol, carol, 50, {  from:carol });
              assert.equal(await mining.totalReleased(), '9837');
              assert.equal(await mining.released(alice), '865');
              assert.equal(await mining.released(bob), '4425');
              assert.equal(await mining.released(carol), '3016');
              assert.equal(await mining.released(dave), '1531');
              assert.equal(await token.balanceOf(mining.address), '3300');
              assert.equal(await token.balanceOf(alice), '865');
              assert.equal(await token.balanceOf(bob), '4425');
              assert.equal(await token.balanceOf(carol), '3016');
              assert.equal(await token.balanceOf(dave), '1531');
              // funds: +755, mined: +755, alice: +200, bob: +300, carol: +0, dave: +255
              // released 400 less, kept 400 more

              await faucet.setOwed(mining.address, 1510);
              await mining.methods["release(address,address,uint256)"](dave, dave, 1500, {  from:dave });
              assert.equal(await mining.totalReleased(), '11337');
              assert.equal(await mining.released(alice), '865');
              assert.equal(await mining.released(bob), '4425');
              assert.equal(await mining.released(carol), '3016');
              assert.equal(await mining.released(dave), '3031');
              assert.equal(await token.balanceOf(mining.address), '3310');
              assert.equal(await token.balanceOf(alice), '865');
              assert.equal(await token.balanceOf(bob), '4425');
              assert.equal(await token.balanceOf(carol), '3016');
              assert.equal(await token.balanceOf(dave), '3031');
              // funds: +1510, mined: +1510, alice: +400, bob: +600, carol: +0, dave: +510
              // released 430 less, kept 430 more
            });
          });

          context('with launch/recall flow and non-proportional funding', () => {
            it('updating mined and releasable', async () => {
              const { faucet, mining, token } = this;

              await faucet.setOwed(mining.address, 1000);
              // T_PER -- 0
              // POWER -- total: 0
              // MINED -- total: 0, alice: 0, bob: 0, carol: 0, dave: 0
              // TOKEN -- total: 0, alice: 0, bob: 0, carol: 0, dave: 0
              assert.equal(await mining.totalMined(), '0');
              assert.equal(await mining.releasable(alice), '0');
              assert.equal(await mining.releasable(bob), '0');
              assert.equal(await mining.releasable(carol), '0');
              assert.equal(await mining.releasable(dave), '0');


              await mining.launchMission([0], [], [], alice, { from:alice }); // 0, alice + 100
              await faucet.setOwed(mining.address, 1000); // + 10 per
              // T_PER -- 10
              // POWER -- total: 100, alice: 100
              // MINED -- total: 1000, alice: 1000, bob: 0, carol: 0, dave: 0
              // TOKEN -- total: 0, alice: 0, bob: 0, carol: 0, dave: 0
              assert.equal(await mining.totalMined(), '1000');
              assert.equal(await mining.releasable(alice), '1000');
              assert.equal(await mining.releasable(bob), '0');
              assert.equal(await mining.releasable(carol), '0');
              assert.equal(await mining.releasable(dave), '0');


              await mining.launchMission([10], [10], [10, 11, 12], bob, { from:bob });  // 1, bob + 300
              await faucet.setOwed(mining.address, 1000); //  + 2.5 per
              // T_PER -- 12.5
              // POWER -- total: 400, alice: 100, bob: 300
              // MINED -- total: 2000, alice: 1250, bob: 750, carol: 0, dave: 0
              // TOKEN -- total: 0, alice: 0, bob: 0, carol: 0, dave: 0
              assert.equal(await mining.totalMined(), '2000');
              assert.equal(await mining.releasable(alice), '1250');
              assert.equal(await mining.releasable(bob), '750');
              assert.equal(await mining.releasable(carol), '0');
              assert.equal(await mining.releasable(dave), '0');

              await mining.launchMission([27], [], [20, 21], carol, { from:carol });  // 2, 730
              await faucet.setOwed(mining.address, 1000); // + 0.88495575 per
              // T_PER -- 13.38495575
              // POWER -- total: 1130, alice: 100, bob: 300, carol: 730
              // MINED -- total: 3000, alice: 1338, bob: 1015, carol: 646, dave: 0
              // TOKEN -- total: 0, alice: 0, bob: 0, carol: 0, dave: 0
              assert.equal(await mining.totalMined(), '3000');
              assert.equal(await mining.releasable(alice), '1338');
              assert.equal(await mining.releasable(bob), '1015');
              assert.equal(await mining.releasable(carol), '646');
              assert.equal(await mining.releasable(dave), '0');


              await mining.launchMission([1], [1], [], alice, { from:alice });  // 3, 200
              await faucet.setOwed(mining.address, 1000); // + 0.751879699 per
              // T_PER -- 14.136835449
              // POWER -- total: 1330, alice: 300, bob: 300, carol: 730
              // MINED -- total: 4000, alice: 1565, bob: 1241, carol: 1194, dave: 0
              // TOKEN -- total: 0, alice: 0, bob: 0, carol: 0, dave: 0
              assert.equal(await mining.totalMined(), '4000');
              assert.equal(await mining.releasable(alice), '1565');
              assert.equal(await mining.releasable(bob), '1241');
              assert.equal(await mining.releasable(carol), '1194');
              assert.equal(await mining.releasable(dave), '0');


              await mining.recallMission(0, alice, { from:alice }); // 0, alice - 100
              await faucet.setOwed(mining.address, 1000); // + 0.8130081300813 per
              // T_PER -- 14.946916749813
              // POWER -- total: 1230, alice: 200, bob: 300, carol: 730
              // MINED -- total: 5000, alice: 1726, bob: 1484, carol: 1788, dave: 0
              // TOKEN -- total: 0, alice: 0, bob: 0, carol: 0, dave: 0
              assert.equal(await mining.totalMined(), '5000');
              assert.equal(await mining.releasable(alice), '1726');
              assert.equal(await mining.releasable(bob), '1484');
              assert.equal(await mining.releasable(carol), '1788');
              assert.equal(await mining.releasable(dave), '0');


              await mining.launchMission([7], [2], [5, 6, 7, 8], dave, { from:alice }); // 4, 1275
              await faucet.setOwed(mining.address, 1000);  // + 0.3992015968063872 per
              // T_PER -- 15.346118346619386
              // POWER -- total: 2505, alice: 200, bob: 300, carol: 730, dave: 1275
              // MINED -- total: 6000, alice: 1806, bob: 1604, carol: 2079, dave: 509
              // TOKEN -- total: 0, alice: 0, bob: 0, carol: 0, dave: 0
              assert.equal(await mining.totalMined(), '6000');
              assert.equal(await mining.releasable(alice), '1806');
              assert.equal(await mining.releasable(bob), '1604');
              assert.equal(await mining.releasable(carol), '2079');
              assert.equal(await mining.releasable(dave), '509');


              await mining.launchMission([14], [14], [14], dave, { from:bob });  // 5, 255
              await faucet.setOwed(mining.address, 1000); // + 0.36231884057971014 per
              // T_PER -- 15.708437187199097
              // POWER -- total: 2760, alice: 200, bob: 300, carol: 730, dave: 1530
              // MINED -- total: 7000, alice: 1879, bob: 1713, carol: 2344, dave: 1063
              // TOKEN -- total: 0, alice: 0, bob: 0, carol: 0, dave: 0
              assert.equal(await mining.totalMined(), '7000');
              assert.equal(await mining.releasable(alice), '1879');
              assert.equal(await mining.releasable(bob), '1713');
              assert.equal(await mining.releasable(carol), '2344');
              assert.equal(await mining.releasable(dave), '1063');


              await mining.recallMission(2, carol, { from:carol });   // - 730 from carol
              await faucet.setOwed(mining.address, 1000); // + 0.49261083743842365 per
              // T_PER -- 16.201048024637522
              // POWER -- total: 2030, alice: 200, bob: 300, carol: 0, dave: 1530
              // MINED -- total: 8000, alice: 1977, bob: 1861, carol: 2344, dave: 1817
              // TOKEN -- total: 0, alice: 0, bob: 0, carol: 0, dave: 0
              assert.equal(await mining.totalMined(), '8000');
              assert.equal(await mining.releasable(alice), '1977');
              assert.equal(await mining.releasable(bob), '1861');
              assert.equal(await mining.releasable(carol), '2344');
              assert.equal(await mining.releasable(dave), '1817');


              await mining.recallMission(4, alice, { from:dave });  // - 1275 from dave
              await faucet.setOwed(mining.address, 1000); // + 1.3245033112582782 per
              // T_PER -- 17.525551335895802
              // POWER -- total: 755, alice: 200, bob: 300, carol: 0, dave: 255
              // MINED -- total: 9000, alice: 2242, bob: 2258, carol: 2344, dave: 2154
              // TOKEN -- total: 0, alice: 0, bob: 0, carol: 0, dave: 0
              assert.equal(await mining.totalMined(), '9000');
              assert.equal(await mining.releasable(alice), '2242');
              assert.equal(await mining.releasable(bob), '2258');
              assert.equal(await mining.releasable(carol), '2344');
              assert.equal(await mining.releasable(dave), '2154');

              await mining.launchMission([27], [25], [28], bob, { from:carol });  // 6, 1155
              await faucet.setOwed(mining.address, 1000);  // 0.5235602094240838 per
              // T_PER -- 18.049111545319885
              // POWER -- total: 1910, alice: 200, bob: 1455, carol: 0, dave: 255
              // MINED -- total: 10000, alice: 2347, bob: 3020, carol: 2344, dave: 2288
              // TOKEN -- total: 0, alice: 0, bob: 0, carol: 0, dave: 0
              assert.equal(await mining.totalMined(), '10000');
              assert.equal(await mining.releasable(alice), '2347');
              assert.equal(await mining.releasable(bob), '3020');
              assert.equal(await mining.releasable(carol), '2344');
              assert.equal(await mining.releasable(dave), '2288');


              await mining.recallMission(6, carol, { from:bob });  // 6, 1155
              await faucet.setOwed(mining.address, 1000); // + 1.3245033112582782 per
              // T_PER -- 19.373614856578165
              // POWER -- total: 755, alice: 200, bob: 300, carol: 0, dave: 255
              // MINED -- total: 11000, alice: 2612, bob: 3417, carol: 2344, dave: 2626
              // TOKEN -- total: 0, alice: 0, bob: 0, carol: 0, dave: 0
              assert.equal(await mining.totalMined(), '11000');
              assert.equal(await mining.releasable(alice), '2612');
              assert.equal(await mining.releasable(bob), '3417');
              assert.equal(await mining.releasable(carol), '2344');
              assert.equal(await mining.releasable(dave), '2626');


              await faucet.addOwed(mining.address, 1000); // + 1.3245033112582782 per
              // T_PER -- 20.698118167836444
              // POWER -- total: 755, alice: 200, bob: 300, carol: 0, dave: 255
              // MINED -- total: 12000, alice: 2877, bob: 3815, carol: 2344, dave: 2963
              // TOKEN -- total: 0, alice: 0, bob: 0, carol: 0, dave: 0
              assert.equal(await mining.totalMined(), '12000');
              assert.equal(await mining.releasable(alice), '2877');
              assert.equal(await mining.releasable(bob), '3815');
              assert.equal(await mining.releasable(carol), '2344');
              assert.equal(await mining.releasable(dave), '2963');
            });

            it('releasing rewards with release(address,address)', async () => {
              const { faucet, mining, token } = this;

              await faucet.setOwed(mining.address, 1000);
              await mining.release(alice, alice, { from:alice });
              // T_PER -- 0
              // POWER -- total: 0
              // MINED -- total: 0, alice: 0, bob: 0, carol: 0, dave: 0
              // TOKEN -- total: 0, alice: 0, bob: 0, carol: 0, dave: 0
              assert.equal(await mining.totalReleased(), '0');
              assert.equal(await mining.released(alice), '0');
              assert.equal(await token.balanceOf(alice), '0');
              assert.equal(await mining.released(bob), '0');
              assert.equal(await token.balanceOf(bob), '0');
              assert.equal(await mining.released(carol), '0');
              assert.equal(await token.balanceOf(carol), '0');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(dave), '0');


              await mining.launchMission([0], [], [], alice, { from:alice }); // 0, alice + 100
              await faucet.setOwed(mining.address, 1000); // + 10 per
              await mining.release(alice, alice, { from:alice });
              // T_PER -- 10
              // POWER -- total: 100, alice: 100
              // MINED -- total: 1000, alice: 1000, bob: 0, carol: 0, dave: 0
              // TOKEN -- total: 1000, alice: 1000, bob: 0, carol: 0, dave: 0
              assert.equal(await mining.totalReleased(), '1000');
              assert.equal(await mining.released(alice), '1000');
              assert.equal(await token.balanceOf(alice), '1000');
              assert.equal(await mining.released(bob), '0');
              assert.equal(await token.balanceOf(bob), '0');
              assert.equal(await mining.released(carol), '0');
              assert.equal(await token.balanceOf(carol), '0');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(dave), '0');


              await mining.launchMission([10], [10], [10, 11, 12], bob, { from:bob });  // 1, bob + 300
              await faucet.setOwed(mining.address, 1000); //  + 2.5 per
              await mining.release(bob, bob, { from:bob });
              // T_PER -- 12.5
              // POWER -- total: 400, alice: 100, bob: 300
              // MINED -- total: 2000, alice: 1250, bob: 750, carol: 0, dave: 0
              // TOKEN -- total: 1750, alice: 1000, bob: 750, carol: 0, dave: 0
              assert.equal(await mining.totalReleased(), '1750');
              assert.equal(await mining.released(alice), '1000');
              assert.equal(await token.balanceOf(alice), '1000');
              assert.equal(await mining.released(bob), '750');
              assert.equal(await token.balanceOf(bob), '750');
              assert.equal(await mining.released(carol), '0');
              assert.equal(await token.balanceOf(carol), '0');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(dave), '0');

              await mining.launchMission([27], [], [20, 21], carol, { from:carol });  // 2, 730
              await faucet.setOwed(mining.address, 1000); // + 0.88495575 per
              await mining.release(carol, carol, { from:carol });
              // T_PER -- 13.38495575
              // POWER -- total: 1130, alice: 100, bob: 300, carol: 730
              // MINED -- total: 3000, alice: 1338, bob: 1015, carol: 646, dave: 0
              // TOKEN -- total: 2396, alice: 1000, bob: 750, carol: 646, dave: 0
              assert.equal(await mining.totalReleased(), '2396');
              assert.equal(await mining.released(alice), '1000');
              assert.equal(await token.balanceOf(alice), '1000');
              assert.equal(await mining.released(bob), '750');
              assert.equal(await token.balanceOf(bob), '750');
              assert.equal(await mining.released(carol), '646');
              assert.equal(await token.balanceOf(carol), '646');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(dave), '0');


              await mining.launchMission([1], [1], [], alice, { from:alice });  // 3, 200
              await faucet.setOwed(mining.address, 1000); // + 0.751879699 per
              await mining.release(dave, dave, { from:dave });
              // T_PER -- 14.136835449
              // POWER -- total: 1330, alice: 300, bob: 300, carol: 730
              // MINED -- total: 4000, alice: 1565, bob: 1241, carol: 1194, dave: 0
              // TOKEN -- total: 2396, alice: 1000, bob: 750, carol: 646, dave: 0
              assert.equal(await mining.totalReleased(), '2396');
              assert.equal(await mining.released(alice), '1000');
              assert.equal(await token.balanceOf(alice), '1000');
              assert.equal(await mining.released(bob), '750');
              assert.equal(await token.balanceOf(bob), '750');
              assert.equal(await mining.released(carol), '646');
              assert.equal(await token.balanceOf(carol), '646');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(dave), '0');


              await mining.recallMission(0, alice, { from:alice }); // 0, alice - 100
              await faucet.setOwed(mining.address, 1000); // + 0.8130081300813 per
              await mining.release(alice, alice, { from:alice });
              // T_PER -- 14.946916749813
              // POWER -- total: 1230, alice: 200, bob: 300, carol: 730
              // MINED -- total: 5000, alice: 1726, bob: 1484, carol: 1788, dave: 0
              // TOKEN -- total: 3122, alice: 1726, bob: 750, carol: 646, dave: 0
              assert.equal(await mining.totalReleased(), '3122');
              assert.equal(await mining.released(alice), '1726');
              assert.equal(await token.balanceOf(alice), '1726');
              assert.equal(await mining.released(bob), '750');
              assert.equal(await token.balanceOf(bob), '750');
              assert.equal(await mining.released(carol), '646');
              assert.equal(await token.balanceOf(carol), '646');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(dave), '0');


              await mining.launchMission([7], [2], [5, 6, 7, 8], dave, { from:alice }); // 4, 1275
              await faucet.setOwed(mining.address, 1000);  // + 0.3992015968063872 per
              await mining.release(bob, bob, { from:bob });
              // T_PER -- 15.346118346619386
              // POWER -- total: 2505, alice: 200, bob: 300, carol: 730, dave: 1275
              // MINED -- total: 6000, alice: 1806, bob: 1604, carol: 2079, dave: 509
              // TOKEN -- total: 3976, alice: 1726, bob: 1604, carol: 646, dave: 0
              assert.equal(await mining.totalReleased(), '3976');
              assert.equal(await mining.released(alice), '1726');
              assert.equal(await token.balanceOf(alice), '1726');
              assert.equal(await mining.released(bob), '1604');
              assert.equal(await token.balanceOf(bob), '1604');
              assert.equal(await mining.released(carol), '646');
              assert.equal(await token.balanceOf(carol), '646');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(dave), '0');


              await mining.launchMission([14], [14], [14], dave, { from:bob });  // 5, 255
              await faucet.setOwed(mining.address, 1000); // + 0.36231884057971014 per
              await mining.release(carol, carol, { from:carol });
              // T_PER -- 15.708437187199097
              // POWER -- total: 2760, alice: 200, bob: 300, carol: 730, dave: 1530
              // MINED -- total: 7000, alice: 1879, bob: 1713, carol: 2344, dave: 1063
              // TOKEN -- total: 5674, alice: 1726, bob: 1604, carol: 2344, dave: 0
              assert.equal(await mining.totalReleased(), '5674');
              assert.equal(await mining.released(alice), '1726');
              assert.equal(await token.balanceOf(alice), '1726');
              assert.equal(await mining.released(bob), '1604');
              assert.equal(await token.balanceOf(bob), '1604');
              assert.equal(await mining.released(carol), '2344');
              assert.equal(await token.balanceOf(carol), '2344');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(dave), '0');


              await mining.recallMission(2, carol, { from:carol });   // - 730 from carol
              await faucet.setOwed(mining.address, 1000); // + 0.49261083743842365 per
              await mining.release(dave, dave, { from:dave });
              // T_PER -- 16.201048024637522
              // POWER -- total: 2030, alice: 200, bob: 300, carol: 0, dave: 1530
              // MINED -- total: 8000, alice: 1977, bob: 1861, carol: 2344, dave: 1817
              // TOKEN -- total: 7491, alice: 1726, bob: 1604, carol: 2344, dave: 1817
              assert.equal(await mining.totalReleased(), '7491');
              assert.equal(await mining.released(alice), '1726');
              assert.equal(await token.balanceOf(alice), '1726');
              assert.equal(await mining.released(bob), '1604');
              assert.equal(await token.balanceOf(bob), '1604');
              assert.equal(await mining.released(carol), '2344');
              assert.equal(await token.balanceOf(carol), '2344');
              assert.equal(await mining.released(dave), '1817');
              assert.equal(await token.balanceOf(dave), '1817');


              await mining.recallMission(4, alice, { from:dave });  // - 1275 from dave
              await faucet.setOwed(mining.address, 1000); // + 1.3245033112582782 per
              await mining.release(alice, alice, { from:alice });
              // T_PER -- 17.525551335895802
              // POWER -- total: 755, alice: 200, bob: 300, carol: 0, dave: 255
              // MINED -- total: 9000, alice: 2242, bob: 2258, carol: 2344, dave: 2154
              // TOKEN -- total: 8007, alice: 2242, bob: 1604, carol: 2344, dave: 1817
              assert.equal(await mining.totalReleased(), '8007');
              assert.equal(await mining.released(alice), '2242');
              assert.equal(await token.balanceOf(alice), '2242');
              assert.equal(await mining.released(bob), '1604');
              assert.equal(await token.balanceOf(bob), '1604');
              assert.equal(await mining.released(carol), '2344');
              assert.equal(await token.balanceOf(carol), '2344');
              assert.equal(await mining.released(dave), '1817');
              assert.equal(await token.balanceOf(dave), '1817');

              await mining.launchMission([27], [25], [28], bob, { from:carol });  // 6, 1155
              await faucet.setOwed(mining.address, 1000);  // 0.5235602094240838 per
              await mining.release(bob, bob, { from:bob });
              // T_PER -- 18.049111545319885
              // POWER -- total: 1910, alice: 200, bob: 1455, carol: 0, dave: 255
              // MINED -- total: 10000, alice: 2347, bob: 3020, carol: 2344, dave: 2288
              // TOKEN -- total: 9423, alice: 2242, bob: 3020, carol: 2344, dave: 1817
              assert.equal(await mining.totalReleased(), '9423');
              assert.equal(await mining.released(alice), '2242');
              assert.equal(await token.balanceOf(alice), '2242');
              assert.equal(await mining.released(bob), '3020');
              assert.equal(await token.balanceOf(bob), '3020');
              assert.equal(await mining.released(carol), '2344');
              assert.equal(await token.balanceOf(carol), '2344');
              assert.equal(await mining.released(dave), '1817');
              assert.equal(await token.balanceOf(dave), '1817');


              await mining.recallMission(6, carol, { from:bob });  // 6, 1155
              await faucet.setOwed(mining.address, 1000); // + 1.3245033112582782 per
              await mining.release(carol, carol, { from:carol });
              // T_PER -- 19.373614856578165
              // POWER -- total: 755, alice: 200, bob: 300, carol: 0, dave: 255
              // MINED -- total: 10000, alice: 2612, bob: 3417, carol: 2344, dave: 2626
              // TOKEN -- total: 9423, alice: 2242, bob: 3020, carol: 2344, dave: 1817
              assert.equal(await mining.totalReleased(), '9423');
              assert.equal(await mining.released(alice), '2242');
              assert.equal(await token.balanceOf(alice), '2242');
              assert.equal(await mining.released(bob), '3020');
              assert.equal(await token.balanceOf(bob), '3020');
              assert.equal(await mining.released(carol), '2344');
              assert.equal(await token.balanceOf(carol), '2344');
              assert.equal(await mining.released(dave), '1817');
              assert.equal(await token.balanceOf(dave), '1817');


              await faucet.addOwed(mining.address, 1000); // + 1.3245033112582782 per
              await mining.release(dave, dave, { from:dave });
              // T_PER -- 20.698118167836444
              // POWER -- total: 755, alice: 200, bob: 300, carol: 0, dave: 255
              // MINED -- total: 12000, alice: 2877, bob: 3815, carol: 2344, dave: 2963
              // TOKEN -- total: 10569, alice: 2242, bob: 3020, carol: 2344, dave: 2963
              assert.equal(await mining.totalReleased(), '10569');
              assert.equal(await mining.released(alice), '2242');
              assert.equal(await token.balanceOf(alice), '2242');
              assert.equal(await mining.released(bob), '3020');
              assert.equal(await token.balanceOf(bob), '3020');
              assert.equal(await mining.released(carol), '2344');
              assert.equal(await token.balanceOf(carol), '2344');
              assert.equal(await mining.released(dave), '2963');
              assert.equal(await token.balanceOf(dave), '2963');
            });

            it('releasing rewards with release(address,address,uint256)', async () => {
              const { faucet, mining, token } = this;

              await faucet.setOwed(mining.address, 1000);
              await mining.methods["release(address,address,uint256)"](alice, alice, 0, { from:alice });
              // T_PER -- 0
              // POWER -- total: 0
              // MINED -- total: 0, alice: 0, bob: 0, carol: 0, dave: 0
              // TOKEN -- total: 0, alice: 0, bob: 0, carol: 0, dave: 0
              assert.equal(await mining.totalReleased(), '0');
              assert.equal(await mining.released(alice), '0');
              assert.equal(await token.balanceOf(alice), '0');
              assert.equal(await mining.released(bob), '0');
              assert.equal(await token.balanceOf(bob), '0');
              assert.equal(await mining.released(carol), '0');
              assert.equal(await token.balanceOf(carol), '0');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(dave), '0');


              await mining.launchMission([0], [], [], alice, { from:alice }); // 0, alice + 100
              await faucet.setOwed(mining.address, 1000); // + 10 per
              await mining.methods["release(address,address,uint256)"](alice, alice, 900, { from:alice });
              // T_PER -- 10
              // POWER -- total: 100, alice: 100
              // MINED -- total: 1000, alice: 1000, bob: 0, carol: 0, dave: 0
              // TOKEN -- total: 900, alice: 900, bob: 0, carol: 0, dave: 0
              assert.equal(await mining.totalReleased(), '900');
              assert.equal(await mining.released(alice), '900');
              assert.equal(await token.balanceOf(alice), '900');
              assert.equal(await mining.released(bob), '0');
              assert.equal(await token.balanceOf(bob), '0');
              assert.equal(await mining.released(carol), '0');
              assert.equal(await token.balanceOf(carol), '0');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(dave), '0');


              await mining.launchMission([10], [10], [10, 11, 12], bob, { from:bob });  // 1, bob + 300
              await faucet.setOwed(mining.address, 1000); //  + 2.5 per
              await mining.methods["release(address,address,uint256)"](bob, bob, 650, { from:bob });
              // T_PER -- 12.5
              // POWER -- total: 400, alice: 100, bob: 300
              // MINED -- total: 2000, alice: 1250, bob: 750, carol: 0, dave: 0
              // TOKEN -- total: 1550, alice: 900, bob: 650, carol: 0, dave: 0
              assert.equal(await mining.totalReleased(), '1550');
              assert.equal(await mining.released(alice), '900');
              assert.equal(await token.balanceOf(alice), '900');
              assert.equal(await mining.released(bob), '650');
              assert.equal(await token.balanceOf(bob), '650');
              assert.equal(await mining.released(carol), '0');
              assert.equal(await token.balanceOf(carol), '0');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(dave), '0');

              await mining.launchMission([27], [], [20, 21], carol, { from:carol });  // 2, 730
              await faucet.setOwed(mining.address, 1000); // + 0.88495575 per
              await mining.methods["release(address,address,uint256)"](carol, carol, 546, { from:carol });
              // T_PER -- 13.38495575
              // POWER -- total: 1130, alice: 100, bob: 300, carol: 730
              // MINED -- total: 3000, alice: 1338, bob: 1015, carol: 646, dave: 0
              // TOKEN -- total: 2096, alice: 900, bob: 650, carol: 546, dave: 0
              assert.equal(await mining.totalReleased(), '2096');
              assert.equal(await mining.released(alice), '900');
              assert.equal(await token.balanceOf(alice), '900');
              assert.equal(await mining.released(bob), '650');
              assert.equal(await token.balanceOf(bob), '650');
              assert.equal(await mining.released(carol), '546');
              assert.equal(await token.balanceOf(carol), '546');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(dave), '0');


              await mining.launchMission([1], [1], [], alice, { from:alice });  // 3, 200
              await faucet.setOwed(mining.address, 1000); // + 0.751879699 per
              await mining.methods["release(address,address,uint256)"](dave, dave, 0, { from:dave });
              // T_PER -- 14.136835449
              // POWER -- total: 1330, alice: 300, bob: 300, carol: 730
              // MINED -- total: 4000, alice: 1565, bob: 1241, carol: 1194, dave: 0
              // TOKEN -- total: 2096, alice: 900, bob: 650, carol: 546, dave: 0
              assert.equal(await mining.totalReleased(), '2096');
              assert.equal(await mining.released(alice), '900');
              assert.equal(await token.balanceOf(alice), '900');
              assert.equal(await mining.released(bob), '650');
              assert.equal(await token.balanceOf(bob), '650');
              assert.equal(await mining.released(carol), '546');
              assert.equal(await token.balanceOf(carol), '546');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(dave), '0');


              await mining.recallMission(0, alice, { from:alice }); // 0, alice - 100
              await faucet.setOwed(mining.address, 1000); // + 0.8130081300813 per
              await mining.methods["release(address,address,uint256)"](alice, alice, 626, { from:alice });
              // T_PER -- 14.946916749813
              // POWER -- total: 1230, alice: 200, bob: 300, carol: 730
              // MINED -- total: 5000, alice: 1726, bob: 1484, carol: 1788, dave: 0
              // TOKEN -- total: 2722, alice: 1526, bob: 750, carol: 546, dave: 0
              assert.equal(await mining.totalReleased(), '2722');
              assert.equal(await mining.released(alice), '1526');
              assert.equal(await token.balanceOf(alice), '1526');
              assert.equal(await mining.released(bob), '650');
              assert.equal(await token.balanceOf(bob), '650');
              assert.equal(await mining.released(carol), '546');
              assert.equal(await token.balanceOf(carol), '546');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(dave), '0');


              await mining.launchMission([7], [2], [5, 6, 7, 8], dave, { from:alice }); // 4, 1275
              await faucet.setOwed(mining.address, 1000);  // + 0.3992015968063872 per
              await mining.methods["release(address,address,uint256)"](bob, bob, 754, { from:bob });
              // T_PER -- 15.346118346619386
              // POWER -- total: 2505, alice: 200, bob: 300, carol: 730, dave: 1275
              // MINED -- total: 6000, alice: 1806, bob: 1604, carol: 2079, dave: 509
              // TOKEN -- total: 3476, alice: 1526, bob: 1404, carol: 546, dave: 0
              assert.equal(await mining.totalReleased(), '3476');
              assert.equal(await mining.released(alice), '1526');
              assert.equal(await token.balanceOf(alice), '1526');
              assert.equal(await mining.released(bob), '1404');
              assert.equal(await token.balanceOf(bob), '1404');
              assert.equal(await mining.released(carol), '546');
              assert.equal(await token.balanceOf(carol), '546');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(dave), '0');


              await mining.launchMission([14], [14], [14], dave, { from:bob });  // 5, 255
              await faucet.setOwed(mining.address, 1000); // + 0.36231884057971014 per
              await mining.methods["release(address,address,uint256)"](carol, carol, 1598, { from:carol });
              // T_PER -- 15.708437187199097
              // POWER -- total: 2760, alice: 200, bob: 300, carol: 730, dave: 1530
              // MINED -- total: 7000, alice: 1879, bob: 1713, carol: 2344, dave: 1063
              // TOKEN -- total: 5074, alice: 1526, bob: 1404, carol: 2144, dave: 0
              assert.equal(await mining.totalReleased(), '5074');
              assert.equal(await mining.released(alice), '1526');
              assert.equal(await token.balanceOf(alice), '1526');
              assert.equal(await mining.released(bob), '1404');
              assert.equal(await token.balanceOf(bob), '1404');
              assert.equal(await mining.released(carol), '2144');
              assert.equal(await token.balanceOf(carol), '2144');
              assert.equal(await mining.released(dave), '0');
              assert.equal(await token.balanceOf(dave), '0');


              await mining.recallMission(2, carol, { from:carol });   // - 730 from carol
              await faucet.setOwed(mining.address, 1000); // + 0.49261083743842365 per
              await mining.methods["release(address,address,uint256)"](dave, dave, 1617, { from:dave });
              // T_PER -- 16.201048024637522
              // POWER -- total: 2030, alice: 200, bob: 300, carol: 0, dave: 1530
              // MINED -- total: 8000, alice: 1977, bob: 1861, carol: 2344, dave: 1817
              // TOKEN -- total: 6691, alice: 1526, bob: 1404, carol: 2144, dave: 1617
              assert.equal(await mining.totalReleased(), '6691');
              assert.equal(await mining.released(alice), '1526');
              assert.equal(await token.balanceOf(alice), '1526');
              assert.equal(await mining.released(bob), '1404');
              assert.equal(await token.balanceOf(bob), '1404');
              assert.equal(await mining.released(carol), '2144');
              assert.equal(await token.balanceOf(carol), '2144');
              assert.equal(await mining.released(dave), '1617');
              assert.equal(await token.balanceOf(dave), '1617');


              await mining.recallMission(4, alice, { from:dave });  // - 1275 from dave
              await faucet.setOwed(mining.address, 1000); // + 1.3245033112582782 per
              await mining.methods["release(address,address,uint256)"](alice, alice, 416, { from:alice });
              // T_PER -- 17.525551335895802
              // POWER -- total: 755, alice: 200, bob: 300, carol: 0, dave: 255
              // MINED -- total: 9000, alice: 2242, bob: 2258, carol: 2344, dave: 2154
              // TOKEN -- total: 7107, alice: 1942, bob: 1404, carol: 2144, dave: 1617
              assert.equal(await mining.totalReleased(), '7107');
              assert.equal(await mining.released(alice), '1942');
              assert.equal(await token.balanceOf(alice), '1942');
              assert.equal(await mining.released(bob), '1404');
              assert.equal(await token.balanceOf(bob), '1404');
              assert.equal(await mining.released(carol), '2144');
              assert.equal(await token.balanceOf(carol), '2144');
              assert.equal(await mining.released(dave), '1617');
              assert.equal(await token.balanceOf(dave), '1617');


              await mining.launchMission([27], [25], [28], bob, { from:carol });  // 6, 1155
              await faucet.setOwed(mining.address, 1000);  // 0.5235602094240838 per
              await mining.methods["release(address,address,uint256)"](bob, bob, 1316, { from:bob });
              // T_PER -- 18.049111545319885
              // POWER -- total: 1910, alice: 200, bob: 1455, carol: 0, dave: 255
              // MINED -- total: 10000, alice: 2347, bob: 3020, carol: 2344, dave: 2288
              // TOKEN -- total: 8723, alice: 1942, bob: 2720, carol: 2144, dave: 1617
              assert.equal(await mining.totalReleased(), '8423');
              assert.equal(await mining.released(alice), '1942');
              assert.equal(await token.balanceOf(alice), '1942');
              assert.equal(await mining.released(bob), '2720');
              assert.equal(await token.balanceOf(bob), '2720');
              assert.equal(await mining.released(carol), '2144');
              assert.equal(await token.balanceOf(carol), '2144');
              assert.equal(await mining.released(dave), '1617');
              assert.equal(await token.balanceOf(dave), '1617');


              await mining.recallMission(6, carol, { from:bob });  // 6, 1155
              await faucet.setOwed(mining.address, 1000); // + 1.3245033112582782 per
              await mining.methods["release(address,address,uint256)"](carol, carol, 0, { from:carol });
              // T_PER -- 19.373614856578165
              // POWER -- total: 755, alice: 200, bob: 300, carol: 0, dave: 255
              // MINED -- total: 10000, alice: 2612, bob: 3417, carol: 2344, dave: 2626
              // TOKEN -- total: 8723, alice: 1942, bob: 2720, carol: 2144, dave: 1617
              assert.equal(await mining.totalReleased(), '8423');
              assert.equal(await mining.released(alice), '1942');
              assert.equal(await token.balanceOf(alice), '1942');
              assert.equal(await mining.released(bob), '2720');
              assert.equal(await token.balanceOf(bob), '2720');
              assert.equal(await mining.released(carol), '2144');
              assert.equal(await token.balanceOf(carol), '2144');
              assert.equal(await mining.released(dave), '1617');
              assert.equal(await token.balanceOf(dave), '1617');


              await faucet.addOwed(mining.address, 1000); // + 1.3245033112582782 per
              await mining.methods["release(address,address,uint256)"](dave, dave, 1046, { from:dave });
              // T_PER -- 20.698118167836444
              // POWER -- total: 755, alice: 200, bob: 300, carol: 0, dave: 255
              // MINED -- total: 12000, alice: 2877, bob: 3815, carol: 2344, dave: 2963
              // TOKEN -- total: 9769, alice: 1942, bob: 2720, carol: 2144, dave: 2662
              assert.equal(await mining.totalReleased(), '9469');
              assert.equal(await mining.released(alice), '1942');
              assert.equal(await token.balanceOf(alice), '1942');
              assert.equal(await mining.released(bob), '2720');
              assert.equal(await token.balanceOf(bob), '2720');
              assert.equal(await mining.released(carol), '2144');
              assert.equal(await token.balanceOf(carol), '2144');
              assert.equal(await mining.released(dave), '2663');
              assert.equal(await token.balanceOf(dave), '2663');
            });
          });
        });

        context('release(from, to)', () => {
          beforeEach(async () => {
            const { mining, faucet, token } = this;

            await token.mint(faucet.address,  100000000000);

            await mining.launchMission([0], [], [], alice, { from:alice });
            await faucet.setOwed(mining.address, 1000);
            await mining.recallMission(0, alice, { from:alice });

            await mining.launchMission([10], [], [], bob, { from:bob });
            await faucet.setOwed(mining.address, 3000);
            await mining.recallMission(1, bob, { from:bob });

            await mining.launchMission([20], [], [], carol, { from:carol });
            await faucet.setOwed(mining.address, 5000);
            await mining.recallMission(2, carol, { from:carol });

            // now owed:
            // 1000 to alice
            // 3000 to bob
            // 5000 to carol
          });

          it('reverts for "from" != caller', async () => {
            const { mining } = this;

            await expectRevert(
              mining.methods["release(address,address)"](bob, alice, { from:alice }),
              "IMSMM: !auth"
            );

            await expectRevert(
              mining.methods["release(address,address)"](alice, alice, { from:bob }),
              "IMSMM: !auth"
            );

            await expectRevert(
              mining.methods["release(address,address)"](alice, alice, { from:deployer }),
              "IMSMM: !auth"
            );

            await expectRevert(
              mining.methods["release(address,address)"](carol, carol, { from:manager }),
              "IMSMM: !auth"
            );
          });

          it('updates internal records as expected', async () => {
            const { mining } = this;

            assert.equal(await mining.totalMined(), '9000');
            assert.equal(await mining.totalReleased(), '0');
            assert.equal(await mining.releasable(alice), '1000');
            assert.equal(await mining.releasable(bob), '3000');
            assert.equal(await mining.releasable(carol), '5000');
            assert.equal(await mining.releasable(dave), '0');
            assert.equal(await mining.released(alice), '0');
            assert.equal(await mining.released(bob), '0');
            assert.equal(await mining.released(carol), '0');
            assert.equal(await mining.released(dave), '0');

            await mining.methods["release(address,address)"](bob, bob, { from:bob });
            assert.equal(await mining.totalMined(), '9000');
            assert.equal(await mining.totalReleased(), '3000');
            assert.equal(await mining.releasable(alice), '1000');
            assert.equal(await mining.releasable(bob), '0');
            assert.equal(await mining.releasable(carol), '5000');
            assert.equal(await mining.releasable(dave), '0');
            assert.equal(await mining.released(alice), '0');
            assert.equal(await mining.released(bob), '3000');
            assert.equal(await mining.released(carol), '0');
            assert.equal(await mining.released(dave), '0');

            await mining.methods["release(address,address)"](bob, bob, { from:bob });
            assert.equal(await mining.totalMined(), '9000');
            assert.equal(await mining.totalReleased(), '3000');
            assert.equal(await mining.releasable(alice), '1000');
            assert.equal(await mining.releasable(bob), '0');
            assert.equal(await mining.releasable(carol), '5000');
            assert.equal(await mining.releasable(dave), '0');
            assert.equal(await mining.released(alice), '0');
            assert.equal(await mining.released(bob), '3000');
            assert.equal(await mining.released(carol), '0');
            assert.equal(await mining.released(dave), '0');

            await mining.methods["release(address,address)"](carol, dave, { from:carol });
            assert.equal(await mining.totalMined(), '9000');
            assert.equal(await mining.totalReleased(), '8000');
            assert.equal(await mining.releasable(alice), '1000');
            assert.equal(await mining.releasable(bob), '0');
            assert.equal(await mining.releasable(carol), '0');
            assert.equal(await mining.releasable(dave), '0');
            assert.equal(await mining.released(alice), '0');
            assert.equal(await mining.released(bob), '3000');
            assert.equal(await mining.released(carol), '5000');
            assert.equal(await mining.released(dave), '0');

            await mining.methods["release(address,address)"](dave, alice, { from:dave });
            assert.equal(await mining.totalMined(), '9000');
            assert.equal(await mining.totalReleased(), '8000');
            assert.equal(await mining.releasable(alice), '1000');
            assert.equal(await mining.releasable(bob), '0');
            assert.equal(await mining.releasable(carol), '0');
            assert.equal(await mining.releasable(dave), '0');
            assert.equal(await mining.released(alice), '0');
            assert.equal(await mining.released(bob), '3000');
            assert.equal(await mining.released(carol), '5000');
            assert.equal(await mining.released(dave), '0');

            await mining.methods["release(address,address)"](alice, carol, { from:alice });
            assert.equal(await mining.totalMined(), '9000');
            assert.equal(await mining.totalReleased(), '9000');
            assert.equal(await mining.releasable(alice), '0');
            assert.equal(await mining.releasable(bob), '0');
            assert.equal(await mining.releasable(carol), '0');
            assert.equal(await mining.releasable(dave), '0');
            assert.equal(await mining.released(alice), '1000');
            assert.equal(await mining.released(bob), '3000');
            assert.equal(await mining.released(carol), '5000');
            assert.equal(await mining.released(dave), '0');
          });

          it('updates token balances as expected', async () => {
            const { mining, token } = this;

            assert.equal(await token.balanceOf(mining.address), '9000');
            assert.equal(await token.balanceOf(alice), '0');
            assert.equal(await token.balanceOf(bob), '0');
            assert.equal(await token.balanceOf(carol), '0');
            assert.equal(await token.balanceOf(dave), '0');

            await mining.methods["release(address,address)"](bob, bob, { from:bob });
            assert.equal(await token.balanceOf(mining.address), '6000');
            assert.equal(await token.balanceOf(alice), '0');
            assert.equal(await token.balanceOf(bob), '3000');
            assert.equal(await token.balanceOf(carol), '0');
            assert.equal(await token.balanceOf(dave), '0');

            await mining.methods["release(address,address)"](bob, bob, { from:bob });
            assert.equal(await token.balanceOf(mining.address), '6000');
            assert.equal(await token.balanceOf(alice), '0');
            assert.equal(await token.balanceOf(bob), '3000');
            assert.equal(await token.balanceOf(carol), '0');
            assert.equal(await token.balanceOf(dave), '0');

            await mining.methods["release(address,address)"](carol, dave, { from:carol });
            assert.equal(await token.balanceOf(mining.address), '1000');
            assert.equal(await token.balanceOf(alice), '0');
            assert.equal(await token.balanceOf(bob), '3000');
            assert.equal(await token.balanceOf(carol), '0');
            assert.equal(await token.balanceOf(dave), '5000');

            await mining.methods["release(address,address)"](dave, alice, { from:dave });
            assert.equal(await token.balanceOf(mining.address), '1000');
            assert.equal(await token.balanceOf(alice), '0');
            assert.equal(await token.balanceOf(bob), '3000');
            assert.equal(await token.balanceOf(carol), '0');
            assert.equal(await token.balanceOf(dave), '5000');

            await mining.methods["release(address,address)"](alice, carol, { from:alice });
            assert.equal(await token.balanceOf(mining.address), '0');
            assert.equal(await token.balanceOf(alice), '0');
            assert.equal(await token.balanceOf(bob), '3000');
            assert.equal(await token.balanceOf(carol), '1000');
            assert.equal(await token.balanceOf(dave), '5000');
          });

          it('emits "Released" event', async () => {
            const { mining, token } = this;
            let res;

            res = await mining.methods["release(address,address)"](bob, bob, { from:bob });
            await expectEvent.inTransaction(res.tx, mining, "Released", {
              from: bob,
              to: bob,
              amount: '3000'
            });

            res = await mining.methods["release(address,address)"](bob, bob, { from:bob });
            await expectEvent.inTransaction(res.tx, mining, "Released", {
              from: bob,
              to: bob,
              amount: '0'
            });

            res = await mining.methods["release(address,address)"](carol, dave, { from:carol });
            await expectEvent.inTransaction(res.tx, mining, "Released", {
              from: carol,
              to: dave,
              amount: '5000'
            });

            res = await mining.methods["release(address,address)"](dave, alice, { from:dave });
            await expectEvent.inTransaction(res.tx, mining, "Released", {
              from: dave,
              to: alice,
              amount: '0'
            });

            res = await mining.methods["release(address,address)"](alice, carol, { from:alice });
            await expectEvent.inTransaction(res.tx, mining, "Released", {
              from: alice,
              to: carol,
              amount: '1000'
            });
          });
        });

        context('release(from, to, amount)', () => {
          beforeEach(async () => {
            const { mining, faucet, token } = this;

            await token.mint(faucet.address, 100000000000);

            await mining.launchMission([0], [], [], alice, { from:alice });
            await faucet.setOwed(mining.address, 1000);
            await mining.recallMission(0, alice, { from:alice });

            await mining.launchMission([10], [], [], bob, { from:bob });
            await faucet.setOwed(mining.address, 3000);
            await mining.recallMission(1, bob, { from:bob });

            await mining.launchMission([20], [], [], carol, { from:carol });
            await faucet.setOwed(mining.address, 5000);
            await mining.recallMission(2, carol, { from:carol });

            // now owed:
            // 1000 to alice
            // 3000 to bob
            // 5000 to carol
          });

          it('reverts for "from" != caller', async () => {
            const { mining } = this;

            await expectRevert(
              mining.methods["release(address,address,uint256)"](bob, alice, 100, { from:alice }),
              "IMSMM: !auth"
            );

            await expectRevert(
              mining.methods["release(address,address,uint256)"](alice, alice, 500, { from:bob }),
              "IMSMM: !auth"
            );

            await expectRevert(
              mining.methods["release(address,address,uint256)"](alice, alice, 0, { from:deployer }),
              "IMSMM: !auth"
            );

            await expectRevert(
              mining.methods["release(address,address,uint256)"](carol, carol, 1, { from:manager }),
              "IMSMM: !auth"
            );
          });

          it('reverts for "amount" > releasable', async () => {
            const { mining } = this;

            await expectRevert.unspecified(
              mining.methods["release(address,address,uint256)"](bob, alice, 3001, { from:bob })
            );

            await expectRevert.unspecified(
              mining.methods["release(address,address,uint256)"](alice, bob, 2000, { from:alice })
            );

            await expectRevert.unspecified(
              mining.methods["release(address,address,uint256)"](alice, alice, 1001, { from:alice })
            );

            await expectRevert.unspecified(
              mining.methods["release(address,address,uint256)"](dave, dave, 1, { from:dave })
            );
          });

          it('updates internal records as expected', async () => {
            const { mining } = this;

            assert.equal(await mining.totalMined(), '9000');
            assert.equal(await mining.totalReleased(), '0');
            assert.equal(await mining.releasable(alice), '1000');
            assert.equal(await mining.releasable(bob), '3000');
            assert.equal(await mining.releasable(carol), '5000');
            assert.equal(await mining.releasable(dave), '0');
            assert.equal(await mining.released(alice), '0');
            assert.equal(await mining.released(bob), '0');
            assert.equal(await mining.released(carol), '0');
            assert.equal(await mining.released(dave), '0');

            await mining.methods["release(address,address,uint256)"](bob, bob, 1000, { from:bob });
            assert.equal(await mining.totalMined(), '9000');
            assert.equal(await mining.totalReleased(), '1000');
            assert.equal(await mining.releasable(alice), '1000');
            assert.equal(await mining.releasable(bob), '2000');
            assert.equal(await mining.releasable(carol), '5000');
            assert.equal(await mining.releasable(dave), '0');
            assert.equal(await mining.released(alice), '0');
            assert.equal(await mining.released(bob), '1000');
            assert.equal(await mining.released(carol), '0');
            assert.equal(await mining.released(dave), '0');

            await mining.methods["release(address,address,uint256)"](bob, bob, 2000, { from:bob });
            assert.equal(await mining.totalMined(), '9000');
            assert.equal(await mining.totalReleased(), '3000');
            assert.equal(await mining.releasable(alice), '1000');
            assert.equal(await mining.releasable(bob), '0');
            assert.equal(await mining.releasable(carol), '5000');
            assert.equal(await mining.releasable(dave), '0');
            assert.equal(await mining.released(alice), '0');
            assert.equal(await mining.released(bob), '3000');
            assert.equal(await mining.released(carol), '0');
            assert.equal(await mining.released(dave), '0');

            await mining.methods["release(address,address,uint256)"](carol, dave, 1, { from:carol });
            assert.equal(await mining.totalMined(), '9000');
            assert.equal(await mining.totalReleased(), '3001');
            assert.equal(await mining.releasable(alice), '1000');
            assert.equal(await mining.releasable(bob), '0');
            assert.equal(await mining.releasable(carol), '4999');
            assert.equal(await mining.releasable(dave), '0');
            assert.equal(await mining.released(alice), '0');
            assert.equal(await mining.released(bob), '3000');
            assert.equal(await mining.released(carol), '1');
            assert.equal(await mining.released(dave), '0');

            await mining.methods["release(address,address,uint256)"](dave, alice, 0, { from:dave });
            assert.equal(await mining.totalMined(), '9000');
            assert.equal(await mining.totalReleased(), '3001');
            assert.equal(await mining.releasable(alice), '1000');
            assert.equal(await mining.releasable(bob), '0');
            assert.equal(await mining.releasable(carol), '4999');
            assert.equal(await mining.releasable(dave), '0');
            assert.equal(await mining.released(alice), '0');
            assert.equal(await mining.released(bob), '3000');
            assert.equal(await mining.released(carol), '1');
            assert.equal(await mining.released(dave), '0');

            await mining.methods["release(address,address,uint256)"](alice, carol, 500, { from:alice });
            assert.equal(await mining.totalMined(), '9000');
            assert.equal(await mining.totalReleased(), '3501');
            assert.equal(await mining.releasable(alice), '500');
            assert.equal(await mining.releasable(bob), '0');
            assert.equal(await mining.releasable(carol), '4999');
            assert.equal(await mining.releasable(dave), '0');
            assert.equal(await mining.released(alice), '500');
            assert.equal(await mining.released(bob), '3000');
            assert.equal(await mining.released(carol), '1');
            assert.equal(await mining.released(dave), '0');
          });

          it('updates token balances as expected', async () => {
            const { mining, token } = this;

            assert.equal(await token.balanceOf(mining.address), '9000');
            assert.equal(await token.balanceOf(alice), '0');
            assert.equal(await token.balanceOf(bob), '0');
            assert.equal(await token.balanceOf(carol), '0');
            assert.equal(await token.balanceOf(dave), '0');

            await mining.methods["release(address,address,uint256)"](bob, bob, 1000, { from:bob });
            assert.equal(await token.balanceOf(mining.address), '8000');
            assert.equal(await token.balanceOf(alice), '0');
            assert.equal(await token.balanceOf(bob), '1000');
            assert.equal(await token.balanceOf(carol), '0');
            assert.equal(await token.balanceOf(dave), '0');

            await mining.methods["release(address,address,uint256)"](bob, bob, 2000, { from:bob });
            assert.equal(await token.balanceOf(mining.address), '6000');
            assert.equal(await token.balanceOf(alice), '0');
            assert.equal(await token.balanceOf(bob), '3000');
            assert.equal(await token.balanceOf(carol), '0');
            assert.equal(await token.balanceOf(dave), '0');

            await mining.methods["release(address,address,uint256)"](carol, dave, 1, { from:carol });
            assert.equal(await token.balanceOf(mining.address), '5999');
            assert.equal(await token.balanceOf(alice), '0');
            assert.equal(await token.balanceOf(bob), '3000');
            assert.equal(await token.balanceOf(carol), '0');
            assert.equal(await token.balanceOf(dave), '1');

            await mining.methods["release(address,address,uint256)"](dave, alice, 0, { from:dave });
            assert.equal(await token.balanceOf(mining.address), '5999');
            assert.equal(await token.balanceOf(alice), '0');
            assert.equal(await token.balanceOf(bob), '3000');
            assert.equal(await token.balanceOf(carol), '0');
            assert.equal(await token.balanceOf(dave), '1');

            await mining.methods["release(address,address,uint256)"](alice, carol, 500, { from:alice });
            assert.equal(await token.balanceOf(mining.address), '5499');
            assert.equal(await token.balanceOf(alice), '0');
            assert.equal(await token.balanceOf(bob), '3000');
            assert.equal(await token.balanceOf(carol), '500');
            assert.equal(await token.balanceOf(dave), '1');
          });

          it('emits "Released" event', async () => {
            const { mining, token } = this;
            let res;

            res = await mining.methods["release(address,address,uint256)"](bob, bob, 1000, { from:bob });
            await expectEvent.inTransaction(res.tx, mining, "Released", {
              from: bob,
              to: bob,
              amount: '1000'
            });

            res = await mining.methods["release(address,address,uint256)"](bob, bob, 2000, { from:bob });
            await expectEvent.inTransaction(res.tx, mining, "Released", {
              from: bob,
              to: bob,
              amount: '2000'
            });

            res = await mining.methods["release(address,address,uint256)"](carol, dave, 1, { from:carol });
            await expectEvent.inTransaction(res.tx, mining, "Released", {
              from: carol,
              to: dave,
              amount: '1'
            });

            res = await mining.methods["release(address,address,uint256)"](dave, alice, 0, { from:dave });
            await expectEvent.inTransaction(res.tx, mining, "Released", {
              from: dave,
              to: alice,
              amount: '0'
            });

            res = await mining.methods["release(address,address,uint256)"](alice, carol, 500, { from:alice });
            await expectEvent.inTransaction(res.tx, mining, "Released", {
              from: alice,
              to: carol,
              amount: '500'
            });
          });
        });
      });
    });
  });

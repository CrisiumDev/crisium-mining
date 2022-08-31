const { expectRevert, expectEvent, time } = require('@openzeppelin/test-helpers');
const NFTAppraisalRecord = artifacts.require('NFTAppraisalRecord');

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';

contract('NFTAppraisalRecord', ([alice, bob, token0, token1, token2, token3, deployer, recorder]) => {
    const RECORDER_ROLE = web3.utils.soliditySha3('RECORDER_ROLE');

    beforeEach(async () => {
        this.record = await NFTAppraisalRecord.new({ from:deployer });
        await this.record.grantRole(RECORDER_ROLE, recorder, { from:deployer });
    });

    it('appraises() should be "false" by default', async () => {
      assert.equal(await this.record.appraises(token0), false);
      assert.equal(await this.record.appraises(token1), false);
      assert.equal(await this.record.appraises(token2), false);
      assert.equal(await this.record.appraises(token3), false);

      assert.equal(await this.record.appraises(alice), false);
      assert.equal(await this.record.appraises(deployer), false);
      assert.equal(await this.record.appraises(recorder), false);
      assert.equal(await this.record.appraises(this.record.address), false);
    });

    context('setAppraises()', () => {
      it('should revert for non-recorder', async () => {
        await expectRevert(
          this.record.setAppraises(token0, true, 0, { from:alice }),
          "NFTAppraisalRecord: must have recorder role to set appraises"
        );

        await expectRevert(
          this.record.setAppraises(token1, false, 1, { from:bob }),
          "NFTAppraisalRecord: must have recorder role to set appraises"
        );
      });

      it('should update "appraises"', async () => {
        await this.record.setAppraises(token0, true, 0, { from:deployer });
        assert.equal(await this.record.appraises(token0), true);

        await this.record.setAppraises(token1, false, 1, { from:recorder });
        assert.equal(await this.record.appraises(token1), false);

        await this.record.setAppraises(token1, true, 2, { from:recorder });
        assert.equal(await this.record.appraises(token1), true);

        await this.record.setAppraises(token1, false, 0, { from:deployer });
        assert.equal(await this.record.appraises(token1), false);
      });

      it('should update internal record', async () => {
        await this.record.setAppraises(token0, true, 0, { from:deployer });
        let info = await this.record.contractInfo(token0);
        assert.equal(info.defaultAppraisal, '0');
        assert.equal(info.appraises, true);

        await this.record.setAppraises(token1, false, 1, { from:recorder });
        info = await this.record.contractInfo(token1);
        assert.equal(info.defaultAppraisal, '1');
        assert.equal(info.appraises, false);

        await this.record.setAppraises(token1, true, 2, { from:recorder });
        info = await this.record.contractInfo(token1);
        assert.equal(info.defaultAppraisal, '2');
        assert.equal(info.appraises, true);

        await this.record.setAppraises(token1, false, 0, { from:deployer });
        info = await this.record.contractInfo(token1);
        assert.equal(info.defaultAppraisal, '0');
        assert.equal(info.appraises, false);
      });

      it('appraisalOf() should only succeed if "appraises" is set', async () => {
        const { record } = this;

        await expectRevert(record.appraisalOf(token0, 0), "NFTAppraisalRecord: invalid token address");
        await expectRevert(record.appraisalOf(token0, 1), "NFTAppraisalRecord: invalid token address");
        await expectRevert(record.appraisalOf(token1, 0), "NFTAppraisalRecord: invalid token address");
        await expectRevert(record.appraisalOf(token1, 1), "NFTAppraisalRecord: invalid token address");

        await record.setAppraises(token0, true, 10, { from:deployer });
        await record.appraisalOf(token0, 0);
        await record.appraisalOf(token0, 1);
        await expectRevert(record.appraisalOf(token1, 0), "NFTAppraisalRecord: invalid token address");
        await expectRevert(record.appraisalOf(token1, 1), "NFTAppraisalRecord: invalid token address");

        await record.setAppraises(token0, false, 0, { from:deployer });
        await record.setAppraises(token1, true, 1, { from:recorder });
        await expectRevert(record.appraisalOf(token0, 0), "NFTAppraisalRecord: invalid token address");
        await expectRevert(record.appraisalOf(token0, 1), "NFTAppraisalRecord: invalid token address");
        await record.appraisalOf(token1, 0);
        await record.appraisalOf(token1, 1);
      });

      it('appraisalOf() should provide default appraisal if "appraises" is set', async () => {
        const { record } = this;

        await record.setAppraises(token0, true, 10, { from:deployer });
        await record.setAppraises(token1, true, 7, { from:recorder });

        assert.equal(await record.appraisalOf(token0, 0), '10');
        assert.equal(await record.appraisalOf(token0, 1), '10');
        assert.equal(await record.appraisalOf(token0, 7777), '10');
        assert.equal(await record.appraisalOf(token1, 0), '7');
        assert.equal(await record.appraisalOf(token1, 1), '7');
        assert.equal(await record.appraisalOf(token1, 7777), '7');
      });

      it('appraisalsOf() should only succeed if "appraises" is set', async () => {
        const { record } = this;

        await record.setAppraises(token0, true, 10, { from:deployer });

        let appraisals = await record.appraisalsOf(token0, [0, 1, 7777]);
        assert.equal(appraisals[0], '10');
        assert.equal(appraisals[1], '10');
        assert.equal(appraisals[2], '10');
        await expectRevert(record.appraisalsOf(token1, [0, 1, 7777]), "NFTAppraisalRecord: invalid token address");

        await record.setAppraises(token0, false, 0, { from:deployer });
        await record.setAppraises(token1, true, 7, { from:recorder });

        await expectRevert(record.appraisalsOf(token0, [0, 1, 7777]), "NFTAppraisalRecord: invalid token address");
        appraisals = await record.appraisalsOf(token1, [0, 1, 7777]);
        assert.equal(appraisals[0], '7');
        assert.equal(appraisals[1], '7');
        assert.equal(appraisals[2], '7');
      });

      it('appraisalsOf should provide default appraisal if "appraises" is set', async () => {
        const { record } = this;

        await record.setAppraises(token0, true, 10, { from:deployer });
        await record.setAppraises(token1, true, 7, { from:deployer });
        let appraisals = await record.appraisalsOf(token0, [0, 1, 7777]);
        assert.deepEqual(appraisals.map(a => a.toString()), ['10', '10', '10']);

        appraisals = await record.appraisalsOf(token1, [0, 1, 7777]);
        assert.deepEqual(appraisals.map(a => a.toString()), ['7', '7', '7']);
      });
    });

    context('setAppraisal()', async () => {
      it('should revert for non-recorder', async () => {
        await expectRevert(
          this.record.setAppraisal(token0, 0, true, 10, { from:alice }),
          "NFTAppraisalRecord: must have recorder role to set appraisal"
        );

        await expectRevert(
          this.record.setAppraisal(token0, 1, false, 0, { from:bob }),
          "NFTAppraisalRecord: must have recorder role to set appraisal"
        );
      });

      it('should not change "appraises"', async () => {
        await this.record.setAppraisal(token0, 0, true, 10, { from:deployer });
        assert.equal(await this.record.appraises(token0), false);

        await this.record.setAppraisal(token1, 0, true, 7, { from:recorder });
        assert.equal(await this.record.appraises(token1), false);

        await this.record.setAppraises(token0, true, 0, { from:recorder });
        await this.record.setAppraises(token1, true, 0, { from:recorder });
        await this.record.setAppraisal(token0, 0, false, 0, { from:deployer });
        await this.record.setAppraisal(token1, 0, false, 0, { from:deployer });

        assert.equal(await this.record.appraises(token0), true);
        assert.equal(await this.record.appraises(token1), true);
      });

      it('should update internal record', async () => {
        await this.record.setAppraisal(token0, 0, true, 0, { from:deployer });
        let info = await this.record.tokenInfo(token0, 0);
        assert.equal(info.appraisal, '0');
        assert.equal(info.recorded, true);

        await this.record.setAppraisal(token0, 7, true, 10, { from:deployer });
        info = await this.record.tokenInfo(token0, 7);
        assert.equal(info.appraisal, '10');
        assert.equal(info.recorded, true);

        await this.record.setAppraisal(token0, 7, true, 8, { from:recorder });
        info = await this.record.tokenInfo(token0, 7);
        assert.equal(info.appraisal, '8');
        assert.equal(info.recorded, true);

        await this.record.setAppraisal(token0, 7, false, 0, { from:recorder });
        info = await this.record.tokenInfo(token0, 7);
        assert.equal(info.appraisal, '0');
        assert.equal(info.recorded, false);

        await this.record.setAppraisal(token1, 1, false, 0, { from:deployer });
        info = await this.record.tokenInfo(token1, 1);
        assert.equal(info.appraisal, '0');
        assert.equal(info.recorded, false);

        await this.record.setAppraisal(token1, 8, true, 10, { from:deployer });
        info = await this.record.tokenInfo(token1, 8);
        assert.equal(info.appraisal, '10');
        assert.equal(info.recorded, true);

        await this.record.setAppraisal(token1, 8, true, 8, { from:recorder });
        info = await this.record.tokenInfo(token1, 8);
        assert.equal(info.appraisal, '8');
        assert.equal(info.recorded, true);

        await this.record.setAppraisal(token1, 8, false, 0, { from:recorder });
        info = await this.record.tokenInfo(token1, 8);
        assert.equal(info.appraisal, '0');
        assert.equal(info.recorded, false);
      });

      it('appraisalOf() should provide custom appraisal if "appraisal" is recorded', async () => {
        const { record } = this;

        await record.setAppraises(token0, true, 0, { from:deployer });
        await record.setAppraises(token1, true, 1, { from:recorder });

        await record.setAppraisal(token0, 1, true, 101, { from:deployer });
        await record.setAppraisal(token0, 2, true, 102, { from:deployer });
        await record.setAppraisal(token0, 3, true, 103, { from:deployer });

        await record.setAppraisal(token1, 2, true, 202, { from:recorder });
        await record.setAppraisal(token1, 3, true, 203, { from:recorder });
        await record.setAppraisal(token1, 5, true, 205, { from:recorder });

        assert.equal(await record.appraisalOf(token0, 0), '0');
        assert.equal(await record.appraisalOf(token0, 7777), '0');
        assert.equal(await record.appraisalOf(token0, 100), '0');
        assert.equal(await record.appraisalOf(token0, 1), '101');
        assert.equal(await record.appraisalOf(token0, 2), '102');
        assert.equal(await record.appraisalOf(token0, 3), '103');

        assert.equal(await record.appraisalOf(token1, 0), '1');
        assert.equal(await record.appraisalOf(token1, 7777), '1');
        assert.equal(await record.appraisalOf(token1, 100), '1');
        assert.equal(await record.appraisalOf(token1, 1), '1');
        assert.equal(await record.appraisalOf(token1, 2), '202');
        assert.equal(await record.appraisalOf(token1, 3), '203');
        assert.equal(await record.appraisalOf(token1, 4), '1');
        assert.equal(await record.appraisalOf(token1, 5), '205');
      });

      it('appraisalOf() should provide default appraisal if "appraisal" is not recorded', async () => {
        const { record } = this;

        await record.setAppraises(token0, true, 0, { from:deployer });
        await record.setAppraises(token1, true, 1, { from:recorder });

        await record.setAppraisal(token0, 1, false, 101, { from:deployer });
        await record.setAppraisal(token0, 2, true, 102, { from:deployer });
        await record.setAppraisal(token0, 2, false, 102, { from:deployer });
        await record.setAppraisal(token0, 3, true, 103, { from:deployer });

        await record.setAppraisal(token1, 2, false, 202, { from:recorder });
        await record.setAppraisal(token1, 3, true, 203, { from:recorder });
        await record.setAppraisal(token1, 3, false, 203, { from:recorder });
        await record.setAppraisal(token1, 5, true, 205, { from:recorder });

        assert.equal(await record.appraisalOf(token0, 0), '0');
        assert.equal(await record.appraisalOf(token0, 7777), '0');
        assert.equal(await record.appraisalOf(token0, 100), '0');
        assert.equal(await record.appraisalOf(token0, 1), '0');
        assert.equal(await record.appraisalOf(token0, 2), '0');
        assert.equal(await record.appraisalOf(token0, 3), '103');

        assert.equal(await record.appraisalOf(token1, 0), '1');
        assert.equal(await record.appraisalOf(token1, 7777), '1');
        assert.equal(await record.appraisalOf(token1, 100), '1');
        assert.equal(await record.appraisalOf(token1, 1), '1');
        assert.equal(await record.appraisalOf(token1, 2), '1');
        assert.equal(await record.appraisalOf(token1, 3), '1');
        assert.equal(await record.appraisalOf(token1, 4), '1');
        assert.equal(await record.appraisalOf(token1, 5), '205');
      });

      it('appraisalsOf() should only succeed if "appraises" is set', async () => {
        const { record } = this;

        await record.setAppraises(token0, true, 10, { from:deployer });

        let appraisals = await record.appraisalsOf(token0, [0, 1, 7777]);
        assert.equal(appraisals[0], '10');
        assert.equal(appraisals[1], '10');
        assert.equal(appraisals[2], '10');
        await expectRevert(record.appraisalsOf(token1, [0, 1, 7777]), "NFTAppraisalRecord: invalid token address");

        await record.setAppraises(token0, false, 0, { from:deployer });
        await record.setAppraises(token1, true, 7, { from:recorder });

        await expectRevert(record.appraisalsOf(token0, [0, 1, 7777]), "NFTAppraisalRecord: invalid token address");
        appraisals = await record.appraisalsOf(token1, [0, 1, 7777]);
        assert.equal(appraisals[0], '7');
        assert.equal(appraisals[1], '7');
        assert.equal(appraisals[2], '7');
      });

      it('appraisalsOf should provide default appraisal if "appraises" is set', async () => {
        const { record } = this;

        await record.setAppraises(token0, true, 10, { from:deployer });
        await record.setAppraises(token1, true, 7, { from:deployer });
        let appraisals = await record.appraisalsOf(token0, [0, 1, 7777]);
        assert.deepEqual(appraisals.map(a => a.toString()), ['10', '10', '10']);

        appraisals = await record.appraisalsOf(token1, [0, 1, 7777]);
        assert.deepEqual(appraisals.map(a => a.toString()), ['7', '7', '7']);
      });

      it('appraisalsOf() should provide custom appraisal if "appraisal" is recorded', async () => {
        const { record } = this;

        await record.setAppraises(token0, true, 0, { from:deployer });
        await record.setAppraises(token1, true, 1, { from:recorder });

        await record.setAppraisal(token0, 1, true, 101, { from:deployer });
        await record.setAppraisal(token0, 2, true, 102, { from:deployer });
        await record.setAppraisal(token0, 3, true, 103, { from:deployer });

        await record.setAppraisal(token1, 2, true, 202, { from:recorder });
        await record.setAppraisal(token1, 3, true, 203, { from:recorder });
        await record.setAppraisal(token1, 5, true, 205, { from:recorder });

        let appraisals = await record.appraisalsOf(token0, [0, 1, 2, 3, 4, 5, 100, 7777]);
        assert.deepEqual(appraisals.map(a => a.toString()), ['0', '101', '102', '103', '0', '0', '0', '0']);

        appraisals = await record.appraisalsOf(token1, [0, 1, 2, 3, 4, 5, 100, 7777]);
        assert.deepEqual(appraisals.map(a => a.toString()), ['1', '1', '202', '203', '1', '205', '1', '1']);
      });

      it('appraisalsOf() should provide default appraisal if "appraisal" is not recorded', async () => {
        const { record } = this;

        await record.setAppraises(token0, true, 0, { from:deployer });
        await record.setAppraises(token1, true, 1, { from:recorder });

        await record.setAppraisal(token0, 1, false, 101, { from:deployer });
        await record.setAppraisal(token0, 2, true, 102, { from:deployer });
        await record.setAppraisal(token0, 2, false, 102, { from:deployer });
        await record.setAppraisal(token0, 3, true, 103, { from:deployer });

        await record.setAppraisal(token1, 2, false, 202, { from:recorder });
        await record.setAppraisal(token1, 3, true, 203, { from:recorder });
        await record.setAppraisal(token1, 3, false, 203, { from:recorder });
        await record.setAppraisal(token1, 5, true, 205, { from:recorder });

        let appraisals = await record.appraisalsOf(token0, [0, 1, 2, 3, 4, 5, 100, 7777]);
        assert.deepEqual(appraisals.map(a => a.toString()), ['0', '0', '0', '103', '0', '0', '0', '0']);

        appraisals = await record.appraisalsOf(token1, [0, 1, 2, 3, 4, 5, 100, 7777]);
        assert.deepEqual(appraisals.map(a => a.toString()), ['1', '1', '1', '1', '1', '205', '1', '1']);

      });
    });

    context('setAppraisals()', async () => {
      it('should revert for non-recorder', async () => {
        await expectRevert(
          this.record.setAppraisals(token0, [0, 1], [10, 11], { from:alice }),
          "NFTAppraisalRecord: must have recorder role to set appraisal"
        );

        await expectRevert(
          this.record.setAppraisals(token0, [1, 2], [0, 1], { from:bob }),
          "NFTAppraisalRecord: must have recorder role to set appraisal"
        );
      });

      it('should not change "appraises"', async () => {
        await this.record.setAppraisals(token0, [0], [10], { from:deployer });
        assert.equal(await this.record.appraises(token0), false);

        await this.record.setAppraisals(token1, [0], [7], { from:recorder });
        assert.equal(await this.record.appraises(token1), false);

        await this.record.setAppraises(token0, true, 0, { from:recorder });
        await this.record.setAppraises(token1, true, 0, { from:recorder });
        await this.record.setAppraisals(token0, [0], [0], { from:deployer });
        await this.record.setAppraisals(token1, [0], [0], { from:deployer });

        assert.equal(await this.record.appraises(token0), true);
        assert.equal(await this.record.appraises(token1), true);
      });

      it('should update internal record', async () => {
        await this.record.setAppraisals(token0, [0, 7, 8], [0, 10, 8], { from:deployer });
        let info = await this.record.tokenInfo(token0, 0);
        assert.equal(info.appraisal, '0');
        assert.equal(info.recorded, true);

        info = await this.record.tokenInfo(token0, 7);
        assert.equal(info.appraisal, '10');
        assert.equal(info.recorded, true);

        info = await this.record.tokenInfo(token0, 8);
        assert.equal(info.appraisal, '8');
        assert.equal(info.recorded, true);

        await this.record.setAppraisals(token1, [1, 8, 9], [0, 10, 8], { from:deployer });
        info = await this.record.tokenInfo(token1, 1);
        assert.equal(info.appraisal, '0');
        assert.equal(info.recorded, true);

        info = await this.record.tokenInfo(token1, 8);
        assert.equal(info.appraisal, '10');
        assert.equal(info.recorded, true);

        info = await this.record.tokenInfo(token1, 9);
        assert.equal(info.appraisal, '8');
        assert.equal(info.recorded, true);
      });

      it('appraisalOf() should provide custom appraisal if "appraisal" is recorded', async () => {
        const { record } = this;

        await record.setAppraises(token0, true, 0, { from:deployer });
        await record.setAppraises(token1, true, 1, { from:recorder });

        await record.setAppraisals(token0, [1, 2, 3], [101, 102, 103], { from:deployer });
        await record.setAppraisals(token1, [2, 3, 5], [202, 203, 205], { from:recorder });

        assert.equal(await record.appraisalOf(token0, 0), '0');
        assert.equal(await record.appraisalOf(token0, 7777), '0');
        assert.equal(await record.appraisalOf(token0, 100), '0');
        assert.equal(await record.appraisalOf(token0, 1), '101');
        assert.equal(await record.appraisalOf(token0, 2), '102');
        assert.equal(await record.appraisalOf(token0, 3), '103');

        assert.equal(await record.appraisalOf(token1, 0), '1');
        assert.equal(await record.appraisalOf(token1, 7777), '1');
        assert.equal(await record.appraisalOf(token1, 100), '1');
        assert.equal(await record.appraisalOf(token1, 1), '1');
        assert.equal(await record.appraisalOf(token1, 2), '202');
        assert.equal(await record.appraisalOf(token1, 3), '203');
        assert.equal(await record.appraisalOf(token1, 4), '1');
        assert.equal(await record.appraisalOf(token1, 5), '205');
      });

      it('appraisalOf() should provide custom appraisal if "appraisal" is recorded', async () => {
        const { record } = this;

        await record.setAppraises(token0, true, 0, { from:deployer });
        await record.setAppraises(token1, true, 1, { from:recorder });

        await record.setAppraisals(token0, [1, 2, 3], [101, 102, 103], { from:deployer });
        await record.setAppraisals(token1, [2, 3, 5], [202, 203, 205], { from:recorder });

        let appraisals = await record.appraisalsOf(token0, [0, 1, 2, 3, 4, 5, 100, 7777]);
        assert.deepEqual(appraisals.map(a => a.toString()), ['0', '101', '102', '103', '0', '0', '0', '0']);

        appraisals = await record.appraisalsOf(token1, [0, 1, 2, 3, 4, 5, 100, 7777]);
        assert.deepEqual(appraisals.map(a => a.toString()), ['1', '1', '202', '203', '1', '205', '1', '1']);
      });
    });

    context('unsetAppraisals()', async () => {
      it('should revert for non-recorder', async () => {
        await expectRevert(
          this.record.unsetAppraisals(token0, [0, 1], { from:alice }),
          "NFTAppraisalRecord: must have recorder role to set appraisal"
        );

        await expectRevert(
          this.record.unsetAppraisals(token0, [1, 2], { from:bob }),
          "NFTAppraisalRecord: must have recorder role to set appraisal"
        );

        await this.record.setAppraisals(token0, [0, 1], [10, 11], { from:recorder });
        await expectRevert(
          this.record.unsetAppraisals(token0, [0, 1], { from:alice }),
          "NFTAppraisalRecord: must have recorder role to set appraisal"
        );
      });

      it('should not change "appraises"', async () => {
        await this.record.unsetAppraisals(token0, [0], { from:deployer });
        assert.equal(await this.record.appraises(token0), false);

        await this.record.unsetAppraisals(token1, [0], { from:recorder });
        assert.equal(await this.record.appraises(token1), false);

        await this.record.setAppraisals(token0, [0, 1, 2], [0, 10, 11], { from:deployer });
        await this.record.setAppraisals(token1, [0, 1, 2], [0, 8, 9], { from:deployer });
        await this.record.unsetAppraisals(token0, [1], { from:deployer });
        await this.record.unsetAppraisals(token1, [1], { from:recorder });

        assert.equal(await this.record.appraises(token0), false);
        assert.equal(await this.record.appraises(token1), false);

        await this.record.setAppraises(token0, true, 0, { from:recorder });
        await this.record.setAppraises(token1, true, 0, { from:recorder });

        assert.equal(await this.record.appraises(token0), true);
        assert.equal(await this.record.appraises(token1), true);
      });

      it('should update internal record', async () => {
        await this.record.setAppraisals(token0, [0, 1, 2, 3, 4], [100, 101, 102,  103, 104], { from:deployer });
        await this.record.unsetAppraisals(token0, [1], { from:recorder });

        let info = await this.record.tokenInfo(token0, 1);
        assert.equal(info.appraisal, '0');
        assert.equal(info.recorded, false);

        await this.record.unsetAppraisals(token0, [0, 4], { from:deployer });

        info = await this.record.tokenInfo(token0, 0);
        assert.equal(info.appraisal, '0');
        assert.equal(info.recorded, false);

        info = await this.record.tokenInfo(token0, 4);
        assert.equal(info.appraisal, '0');
        assert.equal(info.recorded, false);
      });

      it('appraisalOf() should provide default appraisal if "appraisal" is not recorded', async () => {
        const { record } = this;

        await record.setAppraises(token0, true, 0, { from:deployer });
        await record.setAppraises(token1, true, 1, { from:recorder });

        await record.setAppraisals(token0, [1, 2, 3], [101, 102, 103], { from:deployer });
        await record.setAppraisals(token1, [2, 3, 5], [202, 203, 205], { from:recorder });

        await record.unsetAppraisals(token0, [1, 3], { from:deployer });
        await record.unsetAppraisals(token1, [2, 3], { from:deployer });

        assert.equal(await record.appraisalOf(token0, 0), '0');
        assert.equal(await record.appraisalOf(token0, 7777), '0');
        assert.equal(await record.appraisalOf(token0, 100), '0');
        assert.equal(await record.appraisalOf(token0, 1), '0');
        assert.equal(await record.appraisalOf(token0, 2), '102');
        assert.equal(await record.appraisalOf(token0, 3), '0');

        assert.equal(await record.appraisalOf(token1, 0), '1');
        assert.equal(await record.appraisalOf(token1, 7777), '1');
        assert.equal(await record.appraisalOf(token1, 100), '1');
        assert.equal(await record.appraisalOf(token1, 1), '1');
        assert.equal(await record.appraisalOf(token1, 2), '1');
        assert.equal(await record.appraisalOf(token1, 3), '1');
        assert.equal(await record.appraisalOf(token1, 4), '1');
        assert.equal(await record.appraisalOf(token1, 5), '205');
      });

      it('appraisalsOf() should provide custom appraisal if "appraisal" is recorded', async () => {
        const { record } = this;

        await record.setAppraises(token0, true, 0, { from:deployer });
        await record.setAppraises(token1, true, 1, { from:recorder });

        await record.setAppraisals(token0, [1, 2, 3], [101, 102, 103], { from:deployer });
        await record.setAppraisals(token1, [2, 3, 5], [202, 203, 205], { from:recorder });

        await record.unsetAppraisals(token0, [1, 3], { from:deployer });
        await record.unsetAppraisals(token1, [2, 3], { from:deployer });

        let appraisals = await record.appraisalsOf(token0, [0, 1, 2, 3, 4, 5, 100, 7777]);
        assert.deepEqual(appraisals.map(a => a.toString()), ['0', '0', '102', '0', '0', '0', '0', '0']);

        appraisals = await record.appraisalsOf(token1, [0, 1, 2, 3, 4, 5, 100, 7777]);
        assert.deepEqual(appraisals.map(a => a.toString()), ['1', '1', '1', '1', '1', '205', '1', '1']);
      });
    });
  });

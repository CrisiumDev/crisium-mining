const { expectRevert, expectEvent, time } = require('@openzeppelin/test-helpers');
const DripShareERC20Faucet = artifacts.require('DripShareERC20Faucet');
const MockERC20 = artifacts.require('MockERC20');

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';

contract('DripShareERC20Faucet', ([alice, bob, carol, dave, edith, fred, owner]) => {
    let startBlock;

    beforeEach(async () => {
        this.token = await MockERC20.new("Mock Token", "MT", 0);
        startBlock = (await web3.eth.getBlockNumber()) + 10;
    });

    it('should set correct state variables', async () => {
        this.faucet = await DripShareERC20Faucet.new(this.token.address, 100, startBlock, [alice, bob, carol], [5, 3, 2], { from: owner });
        assert.equal(await this.faucet.token(), this.token.address);
        assert.equal(await this.faucet.owner(), owner);

        assert.equal(await this.faucet.totalReleased(), '0');
        assert.equal(await this.faucet.released(bob), '0');
        assert.equal(await this.faucet.releasable(bob), '0');

        assert.equal(await this.faucet.totalShares(), '10');
        assert.equal(await this.faucet.lastUpdateBlock(), `${startBlock}`);

        assert.equal(await this.faucet.activeRecipientCount(), '3');
        assert.equal(await this.faucet.activeRecipients(0), alice);
        assert.equal(await this.faucet.activeRecipients(1), bob);
        assert.equal(await this.faucet.activeRecipients(2), carol);
    });

    it('should set recipientInfo as expected', async () => {
        this.faucet = await DripShareERC20Faucet.new(this.token.address, 100, startBlock, [alice, bob, carol], [5, 3, 2], { from: owner });

        let info =  await this.faucet.recipientInfo(alice);
        assert.equal(info.shares, '5');
        assert.equal(info.allocated, '0');
        assert.equal(info.totalAllocatedAtLastUpdate, '0');
        assert.equal(info.lastUpdateBlock, `${startBlock}`);

        info =  await this.faucet.recipientInfo(bob);
        assert.equal(info.shares, '3');
        assert.equal(info.allocated, '0');
        assert.equal(info.totalAllocatedAtLastUpdate, '0');
        assert.equal(info.lastUpdateBlock, `${startBlock}`);

        info =  await this.faucet.recipientInfo(carol);
        assert.equal(info.shares, '2');
        assert.equal(info.allocated, '0');
        assert.equal(info.totalAllocatedAtLastUpdate, '0');
        assert.equal(info.lastUpdateBlock, `${startBlock}`);
    });

    context('setStartBlock()', () => {
      it('reverts for non-owner', async () => {
        this.faucet = await DripShareERC20Faucet.new(this.token.address, 100, startBlock, [alice, bob, carol], [5, 3, 2], { from: owner });

        await expectRevert(
          this.faucet.setStartBlock(startBlock + 10, { from:alice }),
          "Ownable: caller is not the owner"
        );

        await this.faucet.transferOwnership(bob, { from:owner });
        await expectRevert(
          this.faucet.setStartBlock(startBlock + 10, { from:owner }),
          "Ownable: caller is not the owner"
        );
      });

      it('should update last update blocks as expected', async () => {
        this.faucet = await DripShareERC20Faucet.new(this.token.address, 100, startBlock, [alice, bob, carol], [5, 3, 2], { from: owner });

        // set start in the future (pause any allocation until reached)
        await this.faucet.setStartBlock(startBlock + 100, { from:owner });
        assert.equal(await this.faucet.lastUpdateBlock(), `${startBlock + 100}`);
        let info =  await this.faucet.recipientInfo(alice);
        assert.equal(info.lastUpdateBlock, `${startBlock + 100}`);

        info =  await this.faucet.recipientInfo(bob);
        assert.equal(info.lastUpdateBlock, `${startBlock + 100}`);

        info =  await this.faucet.recipientInfo(carol);
        assert.equal(info.lastUpdateBlock, `${startBlock + 100}`);

        // set start in the past (altered to start at "current block"; doesn't retroactively change allocation)
        const block = await web3.eth.getBlockNumber();
        await this.faucet.setStartBlock(block - 5, { from:owner });
        assert.equal(await this.faucet.lastUpdateBlock(), `${block + 1}`);
        info =  await this.faucet.recipientInfo(alice);
        assert.equal(info.lastUpdateBlock, `${block + 1}`);

        info =  await this.faucet.recipientInfo(bob);
        assert.equal(info.lastUpdateBlock, `${block + 1}`);

        info =  await this.faucet.recipientInfo(carol);
        assert.equal(info.lastUpdateBlock, `${block + 1}`);

        // set start in the future (pause any allocation until reached)
        await this.faucet.setStartBlock(startBlock + 100, { from:owner });
        assert.equal(await this.faucet.lastUpdateBlock(), `${startBlock + 100}`);
        info =  await this.faucet.recipientInfo(alice);
        assert.equal(info.lastUpdateBlock, `${startBlock + 100}`);

        info =  await this.faucet.recipientInfo(bob);
        assert.equal(info.lastUpdateBlock, `${startBlock + 100}`);

        info =  await this.faucet.recipientInfo(carol);
        assert.equal(info.lastUpdateBlock, `${startBlock + 100}`);
      });
    });

    context('setTokensPerBlock()', () => {
      it('reverts for non-owner', async () => {
        this.faucet = await DripShareERC20Faucet.new(this.token.address, 100, startBlock, [alice, bob, carol], [5, 3, 2], { from: owner });

        await expectRevert(
          this.faucet.setTokensPerBlock(1000, { from:alice }),
          "Ownable: caller is not the owner"
        );

        await this.faucet.transferOwnership(bob, { from:owner });
        await expectRevert(
          this.faucet.setTokensPerBlock(2000, { from:owner }),
          "Ownable: caller is not the owner"
        );
      });

      it('should update tokensPerBlock as expected', async () => {
        this.faucet = await DripShareERC20Faucet.new(this.token.address, 100, startBlock, [alice, bob, carol], [5, 3, 2], { from: owner });

        await this.faucet.setTokensPerBlock(10, { from:owner });
        assert.equal(await this.faucet.tokensPerBlock(), '10');

        await this.faucet.transferOwnership(bob, { from:owner });
        await this.faucet.setTokensPerBlock(177, { from:bob });
        assert.equal(await this.faucet.tokensPerBlock(), '177');
      });
    });

    context('setRecipients()', () => {
      it('reverts for non-owner', async () => {
        this.faucet = await DripShareERC20Faucet.new(this.token.address, 100, startBlock, [alice, bob, carol], [5, 3, 2], { from: owner });

        await expectRevert(
          this.faucet.setRecipients([bob, dave], [10, 1], { from:alice }),
          "Ownable: caller is not the owner"
        );

        await this.faucet.transferOwnership(bob, { from:owner });
        await expectRevert(
          this.faucet.setRecipients([bob, dave], [10, 1], { from:owner }),
          "Ownable: caller is not the owner"
        );
      });

      it('should update recipients and shares as expected', async () => {
        this.faucet = await DripShareERC20Faucet.new(this.token.address, 100, startBlock, [alice, bob, carol], [5, 3, 2], { from: owner });

        await this.faucet.setRecipients([carol, dave], [1, 2], { from:owner });
        let info =  await this.faucet.recipientInfo(alice);
        assert.equal(info.shares, '0');
        assert.equal(info.allocated, '0');
        assert.equal(info.totalAllocatedAtLastUpdate, '0');
        assert.equal(info.lastUpdateBlock, `${startBlock}`);

        info =  await this.faucet.recipientInfo(bob);
        assert.equal(info.shares, '0');
        assert.equal(info.allocated, '0');
        assert.equal(info.totalAllocatedAtLastUpdate, '0');
        assert.equal(info.lastUpdateBlock, `${startBlock}`);

        info =  await this.faucet.recipientInfo(carol);
        assert.equal(info.shares, '1');
        assert.equal(info.allocated, '0');
        assert.equal(info.totalAllocatedAtLastUpdate, '0');
        assert.equal(info.lastUpdateBlock, `${startBlock}`);

        info =  await this.faucet.recipientInfo(dave);
        assert.equal(info.shares, '2');
        assert.equal(info.allocated, '0');
        assert.equal(info.totalAllocatedAtLastUpdate, '0');
        assert.equal(info.lastUpdateBlock, `${startBlock}`);

        assert.equal(await this.faucet.totalShares(), '3');
      });
    });

    context('setRecipientShares()', () => {
      it('reverts for non-owner', async () => {
        this.faucet = await DripShareERC20Faucet.new(this.token.address, 100, startBlock, [alice, bob, carol], [5, 3, 2], { from: owner });

        await expectRevert(
          this.faucet.setRecipientShares(bob, 0, { from:alice }),
          "Ownable: caller is not the owner"
        );

        await this.faucet.transferOwnership(bob, { from:owner });
        await expectRevert(
          this.faucet.setRecipientShares(carol, 5, { from:owner }),
          "Ownable: caller is not the owner"
        );
      });

      it('should update shares as expected', async () => {
        this.faucet = await DripShareERC20Faucet.new(this.token.address, 100, startBlock, [alice, bob, carol, dave], [5, 3, 2, 1], { from: owner });

        await this.faucet.setRecipientShares(alice, 0, { from:owner });
        assert.equal(await this.faucet.activeRecipientCount(), '3');
        assert.equal(await this.faucet.activeRecipients(0), dave);
        assert.equal(await this.faucet.activeRecipients(1), bob);
        assert.equal(await this.faucet.activeRecipients(2), carol);
        assert.equal((await this.faucet.recipientInfo(alice)).shares, '0');
        assert.equal((await this.faucet.recipientInfo(bob)).shares, '3');
        assert.equal((await this.faucet.recipientInfo(carol)).shares, '2');
        assert.equal((await this.faucet.recipientInfo(dave)).shares, '1');
        assert.equal((await this.faucet.recipientInfo(edith)).shares, '0');
        assert.equal(await this.faucet.totalShares(), '6');

        await this.faucet.setRecipientShares(dave, 10, { from:owner });
        assert.equal(await this.faucet.activeRecipientCount(), '3');
        assert.equal(await this.faucet.activeRecipients(0), dave);
        assert.equal(await this.faucet.activeRecipients(1), bob);
        assert.equal(await this.faucet.activeRecipients(2), carol);
        assert.equal((await this.faucet.recipientInfo(alice)).shares, '0');
        assert.equal((await this.faucet.recipientInfo(bob)).shares, '3');
        assert.equal((await this.faucet.recipientInfo(carol)).shares, '2');
        assert.equal((await this.faucet.recipientInfo(dave)).shares, '10');
        assert.equal((await this.faucet.recipientInfo(edith)).shares, '0');
        assert.equal(await this.faucet.totalShares(), '15');

        await this.faucet.setRecipientShares(carol, 0, { from:owner });
        assert.equal(await this.faucet.activeRecipientCount(), '2');
        assert.equal(await this.faucet.activeRecipients(0), dave);
        assert.equal(await this.faucet.activeRecipients(1), bob);
        assert.equal((await this.faucet.recipientInfo(alice)).shares, '0');
        assert.equal((await this.faucet.recipientInfo(bob)).shares, '3');
        assert.equal((await this.faucet.recipientInfo(carol)).shares, '0');
        assert.equal((await this.faucet.recipientInfo(dave)).shares, '10');
        assert.equal((await this.faucet.recipientInfo(edith)).shares, '0');
        assert.equal(await this.faucet.totalShares(), '13');

        await this.faucet.transferOwnership(alice, { from:owner });

        await this.faucet.setRecipientShares(alice, 100, { from:alice });
        assert.equal(await this.faucet.activeRecipientCount(), '3');
        assert.equal(await this.faucet.activeRecipients(0), dave);
        assert.equal(await this.faucet.activeRecipients(1), bob);
        assert.equal(await this.faucet.activeRecipients(2), alice);
        assert.equal((await this.faucet.recipientInfo(alice)).shares, '100');
        assert.equal((await this.faucet.recipientInfo(bob)).shares, '3');
        assert.equal((await this.faucet.recipientInfo(carol)).shares, '0');
        assert.equal((await this.faucet.recipientInfo(dave)).shares, '10');
        assert.equal((await this.faucet.recipientInfo(edith)).shares, '0');
        assert.equal(await this.faucet.totalShares(), '113');

        await this.faucet.setRecipientShares(alice, 0, { from:alice });
        assert.equal(await this.faucet.activeRecipientCount(), '2');
        assert.equal(await this.faucet.activeRecipients(0), dave);
        assert.equal(await this.faucet.activeRecipients(1), bob);
        assert.equal((await this.faucet.recipientInfo(alice)).shares, '0');
        assert.equal((await this.faucet.recipientInfo(bob)).shares, '3');
        assert.equal((await this.faucet.recipientInfo(carol)).shares, '0');
        assert.equal((await this.faucet.recipientInfo(dave)).shares, '10');
        assert.equal((await this.faucet.recipientInfo(edith)).shares, '0');
        assert.equal(await this.faucet.totalShares(), '13');
      });
    });

    context('fund', async () => {
      it('transfers funds from indicated account', async () => {
        this.faucet = await DripShareERC20Faucet.new(this.token.address, 100, startBlock, [alice, bob, carol, dave], [5, 3, 2, 1], { from: owner });
        await this.token.mint(bob, 5000);
        await this.token.approve(this.faucet.address, 5000, { from:bob });

        await this.faucet.fund(bob, 1000, { from:bob });
        assert.equal(await this.token.balanceOf(this.faucet.address), '1000');
        assert.equal(await this.token.balanceOf(bob), '4000');

        await this.faucet.fund(bob, 1500, { from:owner });
        assert.equal(await this.token.balanceOf(this.faucet.address), '2500');
        assert.equal(await this.token.balanceOf(bob), '2500');
      });

      it('sets lastUpdateBlock appropriately', async () => {
        this.faucet = await DripShareERC20Faucet.new(this.token.address, 100, startBlock, [alice, bob, carol, dave], [5, 3, 2, 1], { from: owner });
        await this.token.mint(bob, 5000);
        await this.token.approve(this.faucet.address, 5000, { from:bob });

        await this.faucet.fund(bob, 1000, { from:bob });
        assert.equal(await this.token.balanceOf(this.faucet.address), '1000');
        assert.equal(await this.token.balanceOf(bob), '4000');
        assert.equal(await this.faucet.lastUpdateBlock(), `${startBlock}`);
        assert.equal((await this.faucet.recipientInfo(alice)).lastUpdateBlock, `${startBlock}`);
        assert.equal((await this.faucet.recipientInfo(bob)).lastUpdateBlock, `${startBlock}`);
        assert.equal((await this.faucet.recipientInfo(carol)).lastUpdateBlock, `${startBlock}`);

        await time.advanceBlockTo(startBlock + 4);
        await this.faucet.fund(bob, 1500, { from:owner });
        assert.equal(await this.token.balanceOf(this.faucet.address), '2500');
        assert.equal(await this.token.balanceOf(bob), '2500');
        assert.equal(await this.faucet.lastUpdateBlock(), `${startBlock + 5}`);
        assert.equal((await this.faucet.recipientInfo(alice)).lastUpdateBlock, `${startBlock + 5}`);
        assert.equal((await this.faucet.recipientInfo(bob)).lastUpdateBlock, `${startBlock + 5}`);
        assert.equal((await this.faucet.recipientInfo(carol)).lastUpdateBlock, `${startBlock + 5}`);
      });
    });

    context('defund(address)', async () => {
      it('reverts for non-owner', async () => {
        this.faucet = await DripShareERC20Faucet.new(this.token.address, 100, startBlock, [alice, bob, carol], [5, 3, 2], { from: owner });
        await this.token.mint(this.faucet.address, 5000);

        await expectRevert(
          this.faucet.methods["defund(address)"](bob, { from:alice }),
          "Ownable: caller is not the owner"
        );

        await this.faucet.transferOwnership(bob, { from:owner });
        await expectRevert(
          this.faucet.methods["defund(address)"](carol, { from:owner }),
          "Ownable: caller is not the owner"
        );
      });

      it('transfers funds to indicated account', async () => {
        this.faucet = await DripShareERC20Faucet.new(this.token.address, 100, startBlock, [alice, bob, carol, dave], [5, 3, 2, 1], { from: owner });
        await this.token.mint(this.faucet.address, 5000);

        await this.faucet.methods["defund(address)"](bob, { from:owner });
        assert.equal(await this.token.balanceOf(this.faucet.address), '0');
        assert.equal(await this.token.balanceOf(bob), '5000');
      });
    });

    context('defund(address, uint256)', async () => {
      it('reverts for non-owner', async () => {
        this.faucet = await DripShareERC20Faucet.new(this.token.address, 100, startBlock, [alice, bob, carol], [5, 3, 2], { from: owner });
        await this.token.mint(this.faucet.address, 5000);

        await expectRevert(
          this.faucet.defund(bob, 10, { from:alice }),
          "Ownable: caller is not the owner"
        );

        await this.faucet.transferOwnership(bob, { from:owner });
        await expectRevert(
          this.faucet.defund(carol, 5, { from:owner }),
          "Ownable: caller is not the owner"
        );
      });

      it('transfers funds to indicated account', async () => {
        this.faucet = await DripShareERC20Faucet.new(this.token.address, 100, startBlock, [alice, bob, carol, dave], [5, 3, 2, 1], { from: owner });
        await this.token.mint(this.faucet.address, 5000);

        await this.faucet.defund(bob, 1000, { from:owner });
        assert.equal(await this.token.balanceOf(this.faucet.address), '4000');
        assert.equal(await this.token.balanceOf(bob), '1000');

        await this.faucet.defund(bob, 1500, { from:owner });
        assert.equal(await this.token.balanceOf(this.faucet.address), '2500');
        assert.equal(await this.token.balanceOf(bob), '2500');
      });
    });

    context('with funding', () => {
      const amount = 100000;
      beforeEach(async () => {
        this.faucet = await DripShareERC20Faucet.new(this.token.address, 100, startBlock, [alice, bob, carol], [5, 3, 2], { from: owner });
        await this.token.mint(this.faucet.address, amount);
      });

      it('funds allocate (become releasable) as expected', async () => {
        await time.advanceBlockTo(startBlock + 1);
        assert.equal(await this.faucet.totalReleased(), '0');
        assert.equal(await this.faucet.released(alice), '0');
        assert.equal(await this.faucet.releasable(alice), '50');
        assert.equal(await this.faucet.releasable(bob), '30');
        assert.equal(await this.faucet.releasable(carol), '20');
        assert.equal(await this.faucet.releasable(dave), '0');

        await time.advanceBlockTo(startBlock + 20);
        assert.equal(await this.faucet.totalReleased(), '0');
        assert.equal(await this.faucet.released(alice), '0');
        assert.equal(await this.faucet.releasable(alice), '1000');
        assert.equal(await this.faucet.releasable(bob), '600');
        assert.equal(await this.faucet.releasable(carol), '400');
        assert.equal(await this.faucet.releasable(dave), '0');
      });

      it('release(address,address) reverts for unauthorized users', async () => {
        await time.advanceBlockTo(startBlock);

        // can't release from someone else to yourself
        await expectRevert(
          this.faucet.methods["release(address,address)"](alice, bob, { from:bob }),
          "BaseERC20Faucet: Not authorized to release"
        );

        // can't release from someone else to a 3rd party
        await expectRevert(
          this.faucet.methods["release(address,address)"](alice, carol, { from:bob }),
          "BaseERC20Faucet: Not authorized to release"
        );

        // can't release from someone else to that person
        await expectRevert(
          this.faucet.methods["release(address,address)"](alice, alice, { from:bob }),
          "BaseERC20Faucet: Not authorized to release"
        );

        // as owner, can't release from someone else to yourself
        await expectRevert(
          this.faucet.methods["release(address,address)"](alice, owner, { from:owner }),
          "BaseERC20Faucet: Not authorized to release"
        );

        // as owner, can't release from someone else to a 3rd party
        await expectRevert(
          this.faucet.methods["release(address,address)"](alice, bob, { from:owner }),
          "BaseERC20Faucet: Not authorized to release"
        );
      });

      it('releasable funds can be retrieved using release(address,address)', async () => {
        await time.advanceBlockTo(startBlock);
        // calling "release" advances the block number
        await this.faucet.methods["release(address,address)"](alice, alice, { from:alice });
        assert.equal(await this.faucet.totalReleased(), '50');
        assert.equal(await this.faucet.released(alice), '50');
        assert.equal(await this.faucet.releasable(alice), '0');
        assert.equal(await this.faucet.releasable(bob), '30');
        assert.equal(await this.faucet.releasable(carol), '20');
        assert.equal(await this.faucet.releasable(dave), '0');
        assert.equal(await this.token.balanceOf(alice), '50');

        // advances to startBlock + 2
        await this.faucet.methods["release(address,address)"](bob, edith, { from:bob });
        assert.equal(await this.faucet.totalReleased(), '110');
        assert.equal(await this.faucet.released(alice), '50');
        assert.equal(await this.faucet.released(bob), '60');
        assert.equal(await this.faucet.releasable(alice), '50');
        assert.equal(await this.faucet.releasable(bob), '0');
        assert.equal(await this.faucet.releasable(carol), '40');
        assert.equal(await this.faucet.releasable(dave), '0');
        assert.equal(await this.token.balanceOf(alice), '50');
        assert.equal(await this.token.balanceOf(edith), '60');

        await time.advanceBlockTo(startBlock + 19);
        // calling this advances to startBlock + 20
        await this.faucet.methods["release(address,address)"](carol, carol, { from:owner });
        assert.equal(await this.faucet.totalReleased(), '510');
        assert.equal(await this.faucet.released(alice), '50');
        assert.equal(await this.faucet.released(bob), '60');
        assert.equal(await this.faucet.released(carol), '400');
        assert.equal(await this.faucet.releasable(alice), '950');
        assert.equal(await this.faucet.releasable(bob), '540');
        assert.equal(await this.faucet.releasable(carol), '0');
        assert.equal(await this.faucet.releasable(dave), '0');
        assert.equal(await this.token.balanceOf(alice), '50');
        assert.equal(await this.token.balanceOf(carol), '400');
        assert.equal(await this.token.balanceOf(edith), '60');
      });

      it('release(address,address) updates internal recipient allocations records', async () => {
        await time.advanceBlockTo(startBlock);
        // calling "release" advances the block number
        await this.faucet.methods["release(address,address)"](alice, alice, { from:alice });
        let info = await this.faucet.recipientInfo(alice);
        assert.equal(info.allocated, '50');
        assert.equal(info.totalAllocatedAtLastUpdate, '100');
        assert.equal(info.lastUpdateBlock, `${startBlock + 1}`);
        assert.equal(await this.faucet.lastUpdateBlock(), `${startBlock + 1}`);

        // advances to startBlock + 2
        await this.faucet.methods["release(address,address)"](bob, edith, { from:bob });
        info = await this.faucet.recipientInfo(bob);
        assert.equal(info.allocated, '60');
        assert.equal(info.totalAllocatedAtLastUpdate, '200');
        assert.equal(info.lastUpdateBlock, `${startBlock + 2}`);
        assert.equal(await this.faucet.lastUpdateBlock(), `${startBlock + 2}`);

        await time.advanceBlockTo(startBlock + 19);
        // calling this advances to startBlock + 20
        await this.faucet.methods["release(address,address)"](carol, carol, { from:owner });
        info = await this.faucet.recipientInfo(carol);
        assert.equal(info.allocated, '400');
        assert.equal(info.totalAllocatedAtLastUpdate, '2000');
        assert.equal(info.lastUpdateBlock, `${startBlock + 20}`);
        assert.equal(await this.faucet.lastUpdateBlock(), `${startBlock + 20}`);
      });

      it('release(address,address,uint256) reverts for unauthorized users', async () => {
        await time.advanceBlockTo(startBlock);

        // can't release from someone else to yourself
        await expectRevert(
          this.faucet.methods["release(address,address,uint256)"](alice, bob, 1, { from:bob }),
          "BaseERC20Faucet: Not authorized to release"
        );

        // can't release from someone else to a 3rd party
        await expectRevert(
          this.faucet.methods["release(address,address,uint256)"](alice, carol, 1, { from:bob }),
          "BaseERC20Faucet: Not authorized to release"
        );

        // can't release from someone else to that person
        await expectRevert(
          this.faucet.methods["release(address,address,uint256)"](alice, alice, 1, { from:bob }),
          "BaseERC20Faucet: Not authorized to release"
        );

        // as owner, can't release from someone else to yourself
        await expectRevert(
          this.faucet.methods["release(address,address,uint256)"](alice, owner, 1, { from:owner }),
          "BaseERC20Faucet: Not authorized to release"
        );

        // as owner, can't release from someone else to a 3rd party
        await expectRevert(
          this.faucet.methods["release(address,address,uint256)"](alice, bob, 1, { from:owner }),
          "BaseERC20Faucet: Not authorized to release"
        );
      });

      it('release(address,address,uint256) reverts amount larger than that owed', async () => {
        await time.advanceBlockTo(startBlock);

        // alice is owed 50
        await expectRevert(
          this.faucet.methods["release(address,address,uint256)"](alice, bob, 51, { from:alice }),
          "BaseERC20Faucet: Insufficient releasable allocation"
        );

        // bob is owed 60
        await expectRevert(
          this.faucet.methods["release(address,address,uint256)"](bob, bob, 100, { from:bob }),
          "BaseERC20Faucet: Insufficient releasable allocation"
        );

        // carol is owed 60
        await expectRevert(
          this.faucet.methods["release(address,address,uint256)"](carol, carol, 61, { from:owner }),
          "BaseERC20Faucet: Insufficient releasable allocation"
        );
      });

      it('releasable funds can be retrieved using release(address,address,uint256)', async () => {
        await time.advanceBlockTo(startBlock);
        // calling "release" advances the block number
        await this.faucet.methods["release(address,address,uint256)"](alice, alice, 40, { from:alice });
        assert.equal(await this.faucet.totalReleased(), '40');
        assert.equal(await this.faucet.released(alice), '40');
        assert.equal(await this.faucet.releasable(alice), '10');
        assert.equal(await this.faucet.releasable(bob), '30');
        assert.equal(await this.faucet.releasable(carol), '20');
        assert.equal(await this.faucet.releasable(dave), '0');
        assert.equal(await this.token.balanceOf(alice), '40');

        // advances to startBlock + 2
        await this.faucet.methods["release(address,address,uint256)"](bob, edith, 50, { from:bob });
        assert.equal(await this.faucet.totalReleased(), '90');
        assert.equal(await this.faucet.released(alice), '40');
        assert.equal(await this.faucet.released(bob), '50');
        assert.equal(await this.faucet.releasable(alice), '60');
        assert.equal(await this.faucet.releasable(bob), '10');
        assert.equal(await this.faucet.releasable(carol), '40');
        assert.equal(await this.faucet.releasable(dave), '0');
        assert.equal(await this.token.balanceOf(alice), '40');
        assert.equal(await this.token.balanceOf(edith), '50');

        await time.advanceBlockTo(startBlock + 19);
        // calling this advances to startBlock + 20
        await this.faucet.methods["release(address,address,uint256)"](carol, edith, 400, { from:carol });
        assert.equal(await this.faucet.totalReleased(), '490');
        assert.equal(await this.faucet.released(alice), '40');
        assert.equal(await this.faucet.released(bob), '50');
        assert.equal(await this.faucet.released(carol), '400');
        assert.equal(await this.faucet.releasable(alice), '960');
        assert.equal(await this.faucet.releasable(bob), '550');
        assert.equal(await this.faucet.releasable(carol), '0');
        assert.equal(await this.faucet.releasable(dave), '0');
        assert.equal(await this.token.balanceOf(alice), '40');
        assert.equal(await this.token.balanceOf(edith), '450');
      });

      it('releasable funds can be retrieved using release(address,address,uint256)', async () => {
        await time.advanceBlockTo(startBlock);
        // calling "release" advances the block number
        await this.faucet.methods["release(address,address,uint256)"](alice, alice, 40, { from:alice });
        let info = await this.faucet.recipientInfo(alice);
        assert.equal(info.allocated, '50');
        assert.equal(info.totalAllocatedAtLastUpdate, '100');
        assert.equal(info.lastUpdateBlock, `${startBlock + 1}`);
        assert.equal(await this.faucet.lastUpdateBlock(), `${startBlock + 1}`);

        // advances to startBlock + 2
        await this.faucet.methods["release(address,address,uint256)"](bob, edith, 50, { from:bob });
        info = await this.faucet.recipientInfo(bob);
        assert.equal(info.allocated, '60');
        assert.equal(info.totalAllocatedAtLastUpdate, '200');
        assert.equal(info.lastUpdateBlock, `${startBlock + 2}`);
        assert.equal(await this.faucet.lastUpdateBlock(), `${startBlock + 2}`);

        await time.advanceBlockTo(startBlock + 19);
        // calling this advances to startBlock + 20
        await this.faucet.methods["release(address,address,uint256)"](carol, edith, 400, { from:carol });
        info = await this.faucet.recipientInfo(carol);
        assert.equal(info.allocated, '400');
        assert.equal(info.totalAllocatedAtLastUpdate, '2000');
        assert.equal(info.lastUpdateBlock, `${startBlock + 20}`);
        assert.equal(await this.faucet.lastUpdateBlock(), `${startBlock + 20}`);
      });

      it('funds not allocated or releasable when faucet has 0 balance', async () => {
        await this.faucet.defund(owner, amount, { from:owner });

        await time.advanceBlockTo(startBlock);
        assert.equal(await this.faucet.totalReleased(), '0');
        assert.equal(await this.faucet.released(alice), '0');
        assert.equal(await this.faucet.releasable(alice), '0');
        assert.equal(await this.faucet.releasable(bob), '0');
        assert.equal(await this.faucet.releasable(carol), '0');
        assert.equal(await this.faucet.releasable(dave), '0');

        await time.advanceBlockTo(startBlock + 20);
        assert.equal(await this.faucet.totalReleased(), '0');
        assert.equal(await this.faucet.released(alice), '0');
        assert.equal(await this.faucet.releasable(alice), '0');
        assert.equal(await this.faucet.releasable(bob), '0');
        assert.equal(await this.faucet.releasable(carol), '0');
        assert.equal(await this.faucet.releasable(dave), '0');

        await this.faucet.methods["release(address,address)"](alice, bob, { from:alice });
        assert.equal(await this.faucet.released(alice), '0');
        assert.equal(await this.token.balanceOf(alice), '0');
        assert.equal(await this.token.balanceOf(bob), '0');

        await this.faucet.methods["release(address,address,uint256)"](alice, bob, 0, { from:alice });
        assert.equal(await this.faucet.released(alice), '0');
        assert.equal(await this.token.balanceOf(alice), '0');
        assert.equal(await this.token.balanceOf(bob), '0');

        await expectRevert(
          this.faucet.methods["release(address,address,uint256)"](alice, bob, 1, { from:alice }),
          "BaseERC20Faucet: Insufficient releasable allocation"
        );
      });

      it('funds not allocated or releasable after faucet allocates entire balance', async () => {
        await this.faucet.defund(owner, amount - 1000, { from:owner });
        // have funds to allocate for 10 blocks

        await time.advanceBlockTo(startBlock + 1);
        assert.equal(await this.faucet.totalReleased(), '0');
        assert.equal(await this.faucet.released(alice), '0');
        assert.equal(await this.faucet.releasable(alice), '50');
        assert.equal(await this.faucet.releasable(bob), '30');
        assert.equal(await this.faucet.releasable(carol), '20');
        assert.equal(await this.faucet.releasable(dave), '0');

        // advances to block start + 2 (alice gets 100)
        await this.faucet.methods["release(address,address)"](alice, alice, { from:alice });
        assert.equal(await this.faucet.totalReleased(), '100');
        assert.equal(await this.faucet.released(alice), '100');
        assert.equal(await this.faucet.releasable(alice), '0');
        assert.equal(await this.faucet.releasable(bob), '60');
        assert.equal(await this.faucet.releasable(carol), '40');
        assert.equal(await this.faucet.releasable(dave), '0');

        await time.advanceBlockTo(startBlock + 10);
        assert.equal(await this.faucet.totalReleased(), '100');
        assert.equal(await this.faucet.released(alice), '100');
        assert.equal(await this.faucet.releasable(alice), '400');
        assert.equal(await this.faucet.releasable(bob), '300');
        assert.equal(await this.faucet.releasable(carol), '200');
        assert.equal(await this.faucet.releasable(dave), '0');

        await time.advanceBlockTo(startBlock + 11);
        assert.equal(await this.faucet.totalReleased(), '100');
        assert.equal(await this.faucet.released(alice), '100');
        assert.equal(await this.faucet.releasable(alice), '400');
        assert.equal(await this.faucet.releasable(bob), '300');
        assert.equal(await this.faucet.releasable(carol), '200');
        assert.equal(await this.faucet.releasable(dave), '0');

        await time.advanceBlockTo(startBlock + 20);
        assert.equal(await this.faucet.totalReleased(), '100');
        assert.equal(await this.faucet.released(alice), '100');
        assert.equal(await this.faucet.releasable(alice), '400');
        assert.equal(await this.faucet.releasable(bob), '300');
        assert.equal(await this.faucet.releasable(carol), '200');
        assert.equal(await this.faucet.releasable(dave), '0');

        await this.faucet.methods["release(address,address)"](bob, bob, { from:owner });
        assert.equal(await this.faucet.totalReleased(), '400');
        assert.equal(await this.faucet.released(alice), '100');
        assert.equal(await this.faucet.released(bob), '300');
        assert.equal(await this.faucet.releasable(alice), '400');
        assert.equal(await this.faucet.releasable(bob), '0');
        assert.equal(await this.faucet.releasable(carol), '200');
        assert.equal(await this.faucet.releasable(dave), '0');
      });

      it('adding funds after faucet allocates entire balance prompts further allocation', async () => {
        await this.faucet.defund(owner, amount - 1000, { from:owner });
        // have funds to allocate for 10 blocks

        await time.advanceBlockTo(startBlock + 1);
        assert.equal(await this.faucet.totalReleased(), '0');
        assert.equal(await this.faucet.released(alice), '0');
        assert.equal(await this.faucet.releasable(alice), '50');
        assert.equal(await this.faucet.releasable(bob), '30');
        assert.equal(await this.faucet.releasable(carol), '20');
        assert.equal(await this.faucet.releasable(dave), '0');

        // advances to block start + 2 (alice gets 100)
        await this.faucet.methods["release(address,address)"](alice, alice, { from:alice });
        await time.advanceBlockTo(startBlock + 20);
        assert.equal(await this.faucet.totalReleased(), '100');
        assert.equal(await this.faucet.released(alice), '100');
        assert.equal(await this.faucet.releasable(alice), '400');
        assert.equal(await this.faucet.releasable(bob), '300');
        assert.equal(await this.faucet.releasable(carol), '200');
        assert.equal(await this.faucet.releasable(dave), '0');

        await this.token.approve(this.faucet.address, 1000, { from:owner });
        await this.faucet.fund(owner, 1000, { from:owner });
        assert.equal(await this.faucet.totalReleased(), '100');
        assert.equal(await this.faucet.released(alice), '100');
        assert.equal(await this.faucet.releasable(alice), '400');
        assert.equal(await this.faucet.releasable(bob), '300');
        assert.equal(await this.faucet.releasable(carol), '200');
        assert.equal(await this.faucet.releasable(dave), '0');

        await time.advanceBlock();
        assert.equal(await this.faucet.totalReleased(), '100');
        assert.equal(await this.faucet.released(alice), '100');
        assert.equal(await this.faucet.releasable(alice), '450');
        assert.equal(await this.faucet.releasable(bob), '330');
        assert.equal(await this.faucet.releasable(carol), '220');
        assert.equal(await this.faucet.releasable(dave), '0');

        await time.advanceBlock();
        assert.equal(await this.faucet.totalReleased(), '100');
        assert.equal(await this.faucet.released(alice), '100');
        assert.equal(await this.faucet.releasable(alice), '500');
        assert.equal(await this.faucet.releasable(bob), '360');
        assert.equal(await this.faucet.releasable(carol), '240');
        assert.equal(await this.faucet.releasable(dave), '0');

        await this.faucet.methods["release(address,address,uint256)"](bob, bob, 100, { from:bob });
        assert.equal(await this.faucet.totalReleased(), '200');
        assert.equal(await this.faucet.released(alice), '100');
        assert.equal(await this.faucet.released(bob), '100');
        assert.equal(await this.faucet.releasable(alice), '550');
        assert.equal(await this.faucet.releasable(bob), '290');
        assert.equal(await this.faucet.releasable(carol), '260');
        assert.equal(await this.faucet.releasable(dave), '0');

        await time.advanceBlockTo(startBlock + 50);
        assert.equal(await this.faucet.totalReleased(), '200');
        assert.equal(await this.faucet.released(alice), '100');
        assert.equal(await this.faucet.released(bob), '100');
        assert.equal(await this.faucet.releasable(alice), '900');
        assert.equal(await this.faucet.releasable(bob), '500');
        assert.equal(await this.faucet.releasable(carol), '400');
        assert.equal(await this.faucet.releasable(dave), '0');

        await this.faucet.methods["release(address,address)"](carol, carol, { from:owner });
        assert.equal(await this.faucet.totalReleased(), '600');
        assert.equal(await this.faucet.released(alice), '100');
        assert.equal(await this.faucet.released(bob), '100');
        assert.equal(await this.faucet.released(carol), '400');
        assert.equal(await this.faucet.releasable(alice), '900');
        assert.equal(await this.faucet.releasable(bob), '500');
        assert.equal(await this.faucet.releasable(carol), '0');
        assert.equal(await this.faucet.releasable(dave), '0');

        assert.equal(await this.token.balanceOf(alice), '100');
        assert.equal(await this.token.balanceOf(bob), '100');
        assert.equal(await this.token.balanceOf(carol), '400');
      });

      context('setStartBlock', () => {
        it('setting to the past does not affect ongoing allocation', async () => {
          await time.advanceBlockTo(startBlock + 1);
          assert.equal(await this.faucet.totalReleased(), '0');
          assert.equal(await this.faucet.released(alice), '0');
          assert.equal(await this.faucet.releasable(alice), '50');
          assert.equal(await this.faucet.releasable(bob), '30');
          assert.equal(await this.faucet.releasable(carol), '20');
          assert.equal(await this.faucet.releasable(dave), '0');

          // shouldn't  affect allocation and progresses to startBlock + 2
          await this.faucet.setStartBlock(startBlock - 10, { from:owner });
          assert.equal(await this.faucet.totalReleased(), '0');
          assert.equal(await this.faucet.released(alice), '0');
          assert.equal(await this.faucet.releasable(alice), '100');
          assert.equal(await this.faucet.releasable(bob), '60');
          assert.equal(await this.faucet.releasable(carol), '40');
          assert.equal(await this.faucet.releasable(dave), '0');

          await this.faucet.methods["release(address,address)"](alice, alice, { from:owner });
          assert.equal(await this.faucet.totalReleased(), '150');
          assert.equal(await this.faucet.released(alice), '150');
          assert.equal(await this.faucet.releasable(alice), '0');
          assert.equal(await this.faucet.releasable(bob), '90');
          assert.equal(await this.faucet.releasable(carol), '60');
          assert.equal(await this.faucet.releasable(dave), '0');
        });

        it('setting to the past updates internal records as expected', async () => {
          let info;
          await time.advanceBlockTo(startBlock + 1);

          // shouldn't  affect allocation and progresses to startBlock + 2
          await this.faucet.setStartBlock(startBlock - 10, { from:owner });
          assert.equal(await this.faucet.lastUpdateBlock(), `${startBlock + 2}`);
          info = await this.faucet.recipientInfo(alice);
          assert.equal(info.totalAllocatedAtLastUpdate, '200');
          assert.equal(info.lastUpdateBlock, `${startBlock + 2}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.totalAllocatedAtLastUpdate, '200');
          assert.equal(info.lastUpdateBlock, `${startBlock + 2}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.totalAllocatedAtLastUpdate, '200');
          assert.equal(info.lastUpdateBlock, `${startBlock + 2}`);
        });

        it('setting to the future pauses allocation until the indicated block is reached', async () => {
          await time.advanceBlockTo(startBlock + 1);
          assert.equal(await this.faucet.totalReleased(), '0');
          assert.equal(await this.faucet.released(alice), '0');
          assert.equal(await this.faucet.releasable(alice), '50');
          assert.equal(await this.faucet.releasable(bob), '30');
          assert.equal(await this.faucet.releasable(carol), '20');
          assert.equal(await this.faucet.releasable(dave), '0');

          // pauses allocation after it progresses to startBlock + 2
          await this.faucet.setStartBlock(startBlock + 10, { from:owner });
          assert.equal(await this.faucet.totalReleased(), '0');
          assert.equal(await this.faucet.released(alice), '0');
          assert.equal(await this.faucet.releasable(alice), '100');
          assert.equal(await this.faucet.releasable(bob), '60');
          assert.equal(await this.faucet.releasable(carol), '40');
          assert.equal(await this.faucet.releasable(dave), '0');
          assert.equal(await this.faucet.lastUpdateBlock(), `${startBlock + 10}`);

          await time.advanceBlockTo(startBlock + 3);
          assert.equal(await this.faucet.totalReleased(), '0');
          assert.equal(await this.faucet.released(alice), '0');
          assert.equal(await this.faucet.releasable(alice), '100');
          assert.equal(await this.faucet.releasable(bob), '60');
          assert.equal(await this.faucet.releasable(carol), '40');
          assert.equal(await this.faucet.releasable(dave), '0');
          assert.equal(await this.faucet.lastUpdateBlock(), `${startBlock + 10}`);

          await this.faucet.methods["release(address,address)"](alice, alice, { from:owner });
          assert.equal(await this.faucet.totalReleased(), '100');
          assert.equal(await this.faucet.released(alice), '100');
          assert.equal(await this.faucet.releasable(alice), '0');
          assert.equal(await this.faucet.releasable(bob), '60');
          assert.equal(await this.faucet.releasable(carol), '40');
          assert.equal(await this.faucet.releasable(dave), '0');
          assert.equal(await this.faucet.lastUpdateBlock(), `${startBlock + 10}`);

          await time.advanceBlockTo(startBlock + 10);
          assert.equal(await this.faucet.totalReleased(), '100');
          assert.equal(await this.faucet.released(alice), '100');
          assert.equal(await this.faucet.releasable(alice), '0');
          assert.equal(await this.faucet.releasable(bob), '60');
          assert.equal(await this.faucet.releasable(carol), '40');
          assert.equal(await this.faucet.releasable(dave), '0');

          await time.advanceBlockTo(startBlock + 11);
          assert.equal(await this.faucet.totalReleased(), '100');
          assert.equal(await this.faucet.released(alice), '100');
          assert.equal(await this.faucet.releasable(alice), '50');
          assert.equal(await this.faucet.releasable(bob), '90');
          assert.equal(await this.faucet.releasable(carol), '60');
          assert.equal(await this.faucet.releasable(dave), '0');

          await this.faucet.methods["release(address,address)"](alice, alice, { from:owner });
          assert.equal(await this.faucet.totalReleased(), '200');
          assert.equal(await this.faucet.released(alice), '200');
          assert.equal(await this.faucet.releasable(alice), '0');
          assert.equal(await this.faucet.releasable(bob), '120');
          assert.equal(await this.faucet.releasable(carol), '80');
          assert.equal(await this.faucet.releasable(dave), '0');
          assert.equal(await this.faucet.lastUpdateBlock(), `${startBlock + 12}`);
        });

        it('setting to the future updates internal records as expected', async () => {
          await time.advanceBlockTo(startBlock + 1);

          // pauses allocation after it progresses to startBlock + 2
          await this.faucet.setStartBlock(startBlock + 10, { from:owner });
          assert.equal(await this.faucet.lastUpdateBlock(), `${startBlock + 10}`);
          info = await this.faucet.recipientInfo(alice);
          assert.equal(info.totalAllocatedAtLastUpdate, '200');
          assert.equal(info.lastUpdateBlock, `${startBlock + 10}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.totalAllocatedAtLastUpdate, '200');
          assert.equal(info.lastUpdateBlock, `${startBlock + 10}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.totalAllocatedAtLastUpdate, '200');
          assert.equal(info.lastUpdateBlock, `${startBlock + 10}`);
        });

        it('setting to past, future, past, etc. pauses / resumes allocation appropriately', async () => {
          // sets allocation at 0 in the block this function is run
          await this.faucet.setStartBlock(startBlock - 20, { from:owner });
          assert.equal(await this.faucet.totalReleased(), '0');
          assert.equal(await this.faucet.releasable(alice), '0');
          assert.equal(await this.faucet.releasable(bob), '0');
          assert.equal(await this.faucet.releasable(carol), '0');
          assert.equal(await this.faucet.releasable(dave), '0');

          // allocate for 1 block
          await time.advanceBlock();
          assert.equal(await this.faucet.totalReleased(), '0');
          assert.equal(await this.faucet.releasable(alice), '50');
          assert.equal(await this.faucet.releasable(bob), '30');
          assert.equal(await this.faucet.releasable(carol), '20');
          assert.equal(await this.faucet.releasable(dave), '0');

          // set to the future. Allocates w/in that block, but then pauses
          await this.faucet.setStartBlock(startBlock + 20, { from:owner });
          assert.equal(await this.faucet.totalReleased(), '0');
          assert.equal(await this.faucet.releasable(alice), '100');
          assert.equal(await this.faucet.releasable(bob), '60');
          assert.equal(await this.faucet.releasable(carol), '40');
          assert.equal(await this.faucet.releasable(dave), '0');

          await time.advanceBlock();
          assert.equal(await this.faucet.totalReleased(), '0');
          assert.equal(await this.faucet.releasable(alice), '100');
          assert.equal(await this.faucet.releasable(bob), '60');
          assert.equal(await this.faucet.releasable(carol), '40');
          assert.equal(await this.faucet.releasable(dave), '0');

          await this.faucet.methods["release(address,address)"](alice, bob, { from:alice });
          assert.equal(await this.faucet.totalReleased(), '100');
          assert.equal(await this.faucet.released(alice), '100');
          assert.equal(await this.faucet.releasable(alice), '0');
          assert.equal(await this.faucet.releasable(bob), '60');
          assert.equal(await this.faucet.releasable(carol), '40');
          assert.equal(await this.faucet.releasable(dave), '0');
          assert.equal(await this.token.balanceOf(bob), '100');

          // set to the past. Does not allocate, but unpauses allocation for the next
          await this.faucet.setStartBlock(startBlock - 20, { from:owner });
          assert.equal(await this.faucet.totalReleased(), '100');
          assert.equal(await this.faucet.released(alice), '100');
          assert.equal(await this.faucet.releasable(alice), '0');
          assert.equal(await this.faucet.releasable(bob), '60');
          assert.equal(await this.faucet.releasable(carol), '40');
          assert.equal(await this.faucet.releasable(dave), '0');
          assert.equal(await this.token.balanceOf(bob), '100');

          await time.advanceBlock();
          assert.equal(await this.faucet.totalReleased(), '100');
          assert.equal(await this.faucet.released(alice), '100');
          assert.equal(await this.faucet.releasable(alice), '50');
          assert.equal(await this.faucet.releasable(bob), '90');
          assert.equal(await this.faucet.releasable(carol), '60');
          assert.equal(await this.faucet.releasable(dave), '0');
          assert.equal(await this.token.balanceOf(bob), '100');

          await this.faucet.methods["release(address,address)"](bob, alice, { from:bob });
          assert.equal(await this.faucet.totalReleased(), '220');
          assert.equal(await this.faucet.released(alice), '100');
          assert.equal(await this.faucet.released(bob), '120');
          assert.equal(await this.faucet.releasable(alice), '100');
          assert.equal(await this.faucet.releasable(bob), '0');
          assert.equal(await this.faucet.releasable(carol), '80');
          assert.equal(await this.faucet.releasable(dave), '0');
          assert.equal(await this.token.balanceOf(alice), '120');
          assert.equal(await this.token.balanceOf(bob), '100');
        });

        it('setting to past, future, past, etc. updates internal records as expected', async () => {
          // setting start block to the past actually sets it to the current block.
          // nothing is allocated by this call, but allocation is unpaused
          await this.faucet.setStartBlock(startBlock - 20, { from:owner });
          let block = await web3.eth.getBlockNumber();
          assert.equal(await this.faucet.lastUpdateBlock(), `${block}`);
          info = await this.faucet.recipientInfo(alice);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${block}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${block}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${block}`);

          // allocate for 1 block
          await time.advanceBlock();

          // set to the future. Allocates w/in that block, but then pauses
          await this.faucet.setStartBlock(startBlock + 20, { from:owner });
          assert.equal(await this.faucet.lastUpdateBlock(), `${startBlock + 20}`);
          info = await this.faucet.recipientInfo(alice);
          assert.equal(info.allocated, '100');
          assert.equal(info.totalAllocatedAtLastUpdate, '200');
          assert.equal(info.lastUpdateBlock, `${startBlock + 20}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.allocated, '60');
          assert.equal(info.totalAllocatedAtLastUpdate, '200');
          assert.equal(info.lastUpdateBlock, `${startBlock + 20}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.allocated, '40');
          assert.equal(info.totalAllocatedAtLastUpdate, '200');
          assert.equal(info.lastUpdateBlock, `${startBlock + 20}`);

          await time.advanceBlock();
          await this.faucet.methods["release(address,address)"](alice, bob, { from:alice });
          assert.equal(await this.faucet.lastUpdateBlock(), `${startBlock + 20}`);
          info = await this.faucet.recipientInfo(alice);
          assert.equal(info.allocated, '100');
          assert.equal(info.totalAllocatedAtLastUpdate, '200');
          assert.equal(info.lastUpdateBlock, `${startBlock + 20}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.allocated, '60');
          assert.equal(info.totalAllocatedAtLastUpdate, '200');
          assert.equal(info.lastUpdateBlock, `${startBlock + 20}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.allocated, '40');
          assert.equal(info.totalAllocatedAtLastUpdate, '200');
          assert.equal(info.lastUpdateBlock, `${startBlock + 20}`);

          // set to the past. Does not allocate, but unpauses allocation for the next
          await this.faucet.setStartBlock(startBlock - 20, { from:owner });
          block = await web3.eth.getBlockNumber();
          assert.equal(await this.faucet.lastUpdateBlock(), `${block}`);
          info = await this.faucet.recipientInfo(alice);
          assert.equal(info.allocated, '100');
          assert.equal(info.totalAllocatedAtLastUpdate, '200');
          assert.equal(info.lastUpdateBlock, `${block}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.allocated, '60');
          assert.equal(info.totalAllocatedAtLastUpdate, '200');
          assert.equal(info.lastUpdateBlock, `${block}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.allocated, '40');
          assert.equal(info.totalAllocatedAtLastUpdate, '200');
          assert.equal(info.lastUpdateBlock, `${block}`);

          await time.advanceBlock();
          await this.faucet.methods["release(address,address)"](bob, alice, { from:bob });
          assert.equal(await this.faucet.lastUpdateBlock(), `${block + 2}`);
          info = await this.faucet.recipientInfo(alice);
          assert.equal(info.allocated, '100');
          assert.equal(info.totalAllocatedAtLastUpdate, '200');
          assert.equal(info.lastUpdateBlock, `${block}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.allocated, '120');
          assert.equal(info.totalAllocatedAtLastUpdate, '400');
          assert.equal(info.lastUpdateBlock, `${block + 2}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.allocated, '40');
          assert.equal(info.totalAllocatedAtLastUpdate, '200');
          assert.equal(info.lastUpdateBlock, `${block}`);
        });
      });

      context('setTokensPerBlock', () => {
        it('alters allocation rate for blocks after call', async () => {
          await this.faucet.setTokensPerBlock(10, { from:owner });

          await time.advanceBlockTo(startBlock);
          assert.equal(await this.faucet.totalReleased(), '0');
          assert.equal(await this.faucet.releasable(alice), '0');
          assert.equal(await this.faucet.releasable(bob), '0');
          assert.equal(await this.faucet.releasable(carol), '0');
          assert.equal(await this.faucet.releasable(dave), '0');

          await time.advanceBlock();
          assert.equal(await this.faucet.totalReleased(), '0');
          assert.equal(await this.faucet.releasable(alice), '5');
          assert.equal(await this.faucet.releasable(bob), '3');
          assert.equal(await this.faucet.releasable(carol), '2');
          assert.equal(await this.faucet.releasable(dave), '0');

          await this.faucet.methods["release(address,address)"](alice, alice, { from:alice });
          assert.equal(await this.faucet.totalReleased(), '10');
          assert.equal(await this.faucet.released(alice), '10');
          assert.equal(await this.faucet.releasable(alice), '0');
          assert.equal(await this.faucet.releasable(bob), '6');
          assert.equal(await this.faucet.releasable(carol), '4');
          assert.equal(await this.faucet.releasable(dave), '0');

          await this.faucet.setTokensPerBlock(1000, { from:owner });
          assert.equal(await this.faucet.totalReleased(), '10');
          assert.equal(await this.faucet.released(alice), '10');
          assert.equal(await this.faucet.releasable(alice), '5');
          assert.equal(await this.faucet.releasable(bob), '9');
          assert.equal(await this.faucet.releasable(carol), '6');
          assert.equal(await this.faucet.releasable(dave), '0');

          await this.faucet.methods["release(address,address)"](bob, bob, { from:bob });
          assert.equal(await this.faucet.totalReleased(), '319');
          assert.equal(await this.faucet.released(alice), '10');
          assert.equal(await this.faucet.released(bob), '309');
          assert.equal(await this.faucet.releasable(alice), '505');
          assert.equal(await this.faucet.releasable(bob), '0');
          assert.equal(await this.faucet.releasable(carol), '206');
          assert.equal(await this.faucet.releasable(dave), '0');
        });

        it('alters internal records as expected', async () => {
          await this.faucet.setTokensPerBlock(10, { from:owner });
          assert.equal(await this.faucet.tokensPerBlock(), '10');
          await time.advanceBlockTo(startBlock + 1);

          await this.faucet.methods["release(address,address)"](alice, alice, { from:alice });
          let info = await this.faucet.recipientInfo(alice);
          assert.equal(info.allocated, '10');
          assert.equal(info.totalAllocatedAtLastUpdate, '20');
          assert.equal(info.lastUpdateBlock, `${startBlock + 2}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);

          await this.faucet.setTokensPerBlock(1000, { from:owner });
          info = await this.faucet.recipientInfo(alice);
          assert.equal(info.allocated, '15');
          assert.equal(info.totalAllocatedAtLastUpdate, '30');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.allocated, '9');
          assert.equal(info.totalAllocatedAtLastUpdate, '30');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.allocated, '6');
          assert.equal(info.totalAllocatedAtLastUpdate, '30');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);

          await this.faucet.methods["release(address,address)"](bob, bob, { from:bob });
          info = await this.faucet.recipientInfo(alice);
          assert.equal(info.allocated, '15');
          assert.equal(info.totalAllocatedAtLastUpdate, '30');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.allocated, '309');
          assert.equal(info.totalAllocatedAtLastUpdate, '1030');
          assert.equal(info.lastUpdateBlock, `${startBlock + 4}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.allocated, '6');
          assert.equal(info.totalAllocatedAtLastUpdate, '30');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
        });
      });

      context('setRecipients', () => {
        it('updates recipients for future allocation', async () => {
          await this.faucet.setRecipients([bob, carol, dave], [1, 2, 7], { from:owner });

          await time.advanceBlockTo(startBlock);
          assert.equal(await this.faucet.totalReleased(), '0');
          assert.equal(await this.faucet.releasable(alice), '0');
          assert.equal(await this.faucet.releasable(bob), '0');
          assert.equal(await this.faucet.releasable(carol), '0');
          assert.equal(await this.faucet.releasable(dave), '0');

          await time.advanceBlock();
          assert.equal(await this.faucet.totalReleased(), '0');
          assert.equal(await this.faucet.releasable(alice), '0');
          assert.equal(await this.faucet.releasable(bob), '10');
          assert.equal(await this.faucet.releasable(carol), '20');
          assert.equal(await this.faucet.releasable(dave), '70');

          await this.faucet.methods["release(address,address)"](carol, carol, { from:owner });
          assert.equal(await this.faucet.totalReleased(), '40');
          assert.equal(await this.faucet.releasable(alice), '0');
          assert.equal(await this.faucet.releasable(bob), '20');
          assert.equal(await this.faucet.releasable(carol), '0');
          assert.equal(await this.faucet.releasable(dave), '140');

          await time.advanceBlock();
          assert.equal(await this.faucet.totalReleased(), '40');
          assert.equal(await this.faucet.releasable(alice), '0');
          assert.equal(await this.faucet.releasable(bob), '30');
          assert.equal(await this.faucet.releasable(carol), '20');
          assert.equal(await this.faucet.releasable(dave), '210');

          await this.faucet.methods["release(address,address,uint256)"](dave, dave, 100, { from:owner });
          assert.equal(await this.faucet.totalReleased(), '140');
          assert.equal(await this.faucet.releasable(alice), '0');
          assert.equal(await this.faucet.releasable(bob), '40');
          assert.equal(await this.faucet.releasable(carol), '40');
          assert.equal(await this.faucet.releasable(dave), '180');

          await time.advanceBlock();
          assert.equal(await this.faucet.totalReleased(), '140');
          assert.equal(await this.faucet.releasable(alice), '0');
          assert.equal(await this.faucet.releasable(bob), '50');
          assert.equal(await this.faucet.releasable(carol), '60');
          assert.equal(await this.faucet.releasable(dave), '250');
        });

        it('updates recipients for future allocation, without affecting previous earnings', async () => {
          await time.advanceBlockTo(startBlock + 1);

          await this.faucet.methods["release(address,address)"](carol, carol, { from:owner });
          assert.equal(await this.faucet.totalReleased(), '40');
          assert.equal(await this.faucet.releasable(alice), '100');
          assert.equal(await this.faucet.releasable(bob), '60');
          assert.equal(await this.faucet.releasable(carol), '0');
          assert.equal(await this.faucet.releasable(dave), '0');
          assert.equal(await this.token.balanceOf(carol), '40');

          // the previous allocation terms advance by one block before changing
          await this.faucet.setRecipients([bob, carol, dave], [1, 2, 7], { from:owner });
          assert.equal(await this.faucet.totalReleased(), '40');
          assert.equal(await this.faucet.releasable(alice), '150');
          assert.equal(await this.faucet.releasable(bob), '90');
          assert.equal(await this.faucet.releasable(carol), '20');
          assert.equal(await this.faucet.releasable(dave), '0');

          await time.advanceBlock();
          assert.equal(await this.faucet.totalReleased(), '40');
          assert.equal(await this.faucet.releasable(alice), '150');
          assert.equal(await this.faucet.releasable(bob), '100');
          assert.equal(await this.faucet.releasable(carol), '40');
          assert.equal(await this.faucet.releasable(dave), '70');

          await this.faucet.methods["release(address,address,uint256)"](alice, alice, 30, { from:alice });
          assert.equal(await this.faucet.totalReleased(), '70');
          assert.equal(await this.faucet.releasable(alice), '120');
          assert.equal(await this.faucet.releasable(bob), '110');
          assert.equal(await this.faucet.releasable(carol), '60');
          assert.equal(await this.faucet.releasable(dave), '140');
          assert.equal(await this.token.balanceOf(alice), '30');

          await time.advanceBlock();
          assert.equal(await this.faucet.totalReleased(), '70');
          assert.equal(await this.faucet.releasable(alice), '120');
          assert.equal(await this.faucet.releasable(bob), '120');
          assert.equal(await this.faucet.releasable(carol), '80');
          assert.equal(await this.faucet.releasable(dave), '210');

          await this.faucet.methods["release(address,address)"](carol, carol, { from:owner });
          assert.equal(await this.faucet.totalReleased(), '170');
          assert.equal(await this.faucet.releasable(alice), '120');
          assert.equal(await this.faucet.releasable(bob), '130');
          assert.equal(await this.faucet.releasable(carol), '0');
          assert.equal(await this.faucet.releasable(dave), '280');
          assert.equal(await this.token.balanceOf(carol), '140');
        });

        it('updates internal records as expected', async () => {
          await time.advanceBlockTo(startBlock + 1);

          await this.faucet.methods["release(address,address)"](carol, carol, { from:owner });
          await this.faucet.setRecipients([bob, carol, dave], [1, 2, 7], { from:owner });
          // now at 3 original allocations, no new ones
          let info = await this.faucet.recipientInfo(alice);
          assert.equal(info.allocated, '150');
          assert.equal(info.totalAllocatedAtLastUpdate, '300');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.allocated, '90');
          assert.equal(info.totalAllocatedAtLastUpdate, '300');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.allocated, '60');
          assert.equal(info.totalAllocatedAtLastUpdate, '300');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          info = await this.faucet.recipientInfo(dave);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '300');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          assert.equal(await this.faucet.activeRecipientCount(), '3');
          assert.equal(await this.faucet.activeRecipients(0), bob);
          assert.equal(await this.faucet.activeRecipients(1), carol);
          assert.equal(await this.faucet.activeRecipients(2), dave);

          await time.advanceBlock();
          await this.faucet.methods["release(address,address,uint256)"](alice, alice, 30, { from:alice });
          info = await this.faucet.recipientInfo(alice);
          assert.equal(info.allocated, '150');
          assert.equal(info.totalAllocatedAtLastUpdate, '300');     // no update for 0-share recipients
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.allocated, '90');
          assert.equal(info.totalAllocatedAtLastUpdate, '300');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.allocated, '60');
          assert.equal(info.totalAllocatedAtLastUpdate, '300');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          info = await this.faucet.recipientInfo(dave);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '300');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          assert.equal(await this.faucet.activeRecipientCount(), '3');
          assert.equal(await this.faucet.activeRecipients(0), bob);
          assert.equal(await this.faucet.activeRecipients(1), carol);
          assert.equal(await this.faucet.activeRecipients(2), dave);

          await time.advanceBlock();
          await this.faucet.methods["release(address,address)"](carol, carol, { from:owner });
          info = await this.faucet.recipientInfo(alice);
          assert.equal(info.allocated, '150');
          assert.equal(info.totalAllocatedAtLastUpdate, '300');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.allocated, '90');
          assert.equal(info.totalAllocatedAtLastUpdate, '300');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.allocated, '140');
          assert.equal(info.totalAllocatedAtLastUpdate, '700');
          assert.equal(info.lastUpdateBlock, `${startBlock + 7}`);
          info = await this.faucet.recipientInfo(dave);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '300');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          assert.equal(await this.faucet.activeRecipientCount(), '3');
          assert.equal(await this.faucet.activeRecipients(0), bob);
          assert.equal(await this.faucet.activeRecipients(1), carol);
          assert.equal(await this.faucet.activeRecipients(2), dave);
        });
      });

      context('setRecipientShares', () => {
        it('removes from future allocations when set to zero', async () => {
          await this.faucet.setRecipientShares(alice, 0, { from:owner });

          await time.advanceBlockTo(startBlock);
          assert.equal(await this.faucet.totalReleased(), '0');
          assert.equal(await this.faucet.releasable(alice), '0');
          assert.equal(await this.faucet.releasable(bob), '0');
          assert.equal(await this.faucet.releasable(carol), '0');
          assert.equal(await this.faucet.releasable(dave), '0');

          await time.advanceBlock();
          assert.equal(await this.faucet.totalReleased(), '0');
          assert.equal(await this.faucet.releasable(alice), '0');
          assert.equal(await this.faucet.releasable(bob), '60');
          assert.equal(await this.faucet.releasable(carol), '40');
          assert.equal(await this.faucet.releasable(dave), '0');

          await this.faucet.methods["release(address,address)"](carol, carol, { from:owner });
          assert.equal(await this.faucet.totalReleased(), '80');
          assert.equal(await this.faucet.releasable(alice), '0');
          assert.equal(await this.faucet.releasable(bob), '120');
          assert.equal(await this.faucet.releasable(carol), '0');
          assert.equal(await this.faucet.releasable(dave), '0');

          await time.advanceBlock();
          assert.equal(await this.faucet.totalReleased(), '80');
          assert.equal(await this.faucet.releasable(alice), '0');
          assert.equal(await this.faucet.releasable(bob), '180');
          assert.equal(await this.faucet.releasable(carol), '40');
          assert.equal(await this.faucet.releasable(dave), '0');
        });

        it('internal records updated as expected when set to zero', async () => {
          await this.faucet.setRecipientShares(alice, 0, { from:owner });
          assert.equal(await this.faucet.totalShares(), '5');

          await time.advanceBlockTo(startBlock + 1);
          let info = await this.faucet.recipientInfo(alice);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);
          info = await this.faucet.recipientInfo(dave);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${0}`);
          assert.equal(await this.faucet.activeRecipientCount(), '2');
          assert.equal(await this.faucet.activeRecipients(0), carol);
          assert.equal(await this.faucet.activeRecipients(1), bob);

          await this.faucet.methods["release(address,address)"](carol, carol, { from:owner });
          info = await this.faucet.recipientInfo(alice);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.allocated, '80');
          assert.equal(info.totalAllocatedAtLastUpdate, '200');
          assert.equal(info.lastUpdateBlock, `${startBlock + 2}`);
          info = await this.faucet.recipientInfo(dave);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${0}`);
          assert.equal(await this.faucet.activeRecipientCount(), '2');
          assert.equal(await this.faucet.activeRecipients(0), carol);
          assert.equal(await this.faucet.activeRecipients(1), bob);

          await this.faucet.setRecipientShares(carol, 0, { from:owner });
          info = await this.faucet.recipientInfo(alice);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.allocated, '180');
          assert.equal(info.totalAllocatedAtLastUpdate, '300');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.allocated, '120');
          assert.equal(info.totalAllocatedAtLastUpdate, '300');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          info = await this.faucet.recipientInfo(dave);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${0}`);
          assert.equal(await this.faucet.activeRecipientCount(), '1');
          assert.equal(await this.faucet.activeRecipients(0), bob);
        });

        it('adds to future allocations when set to non-zero', async () => {
          await this.faucet.setRecipientShares(dave, 10, { from:owner });

          await time.advanceBlockTo(startBlock);
          assert.equal(await this.faucet.totalReleased(), '0');
          assert.equal(await this.faucet.releasable(alice), '0');
          assert.equal(await this.faucet.releasable(bob), '0');
          assert.equal(await this.faucet.releasable(carol), '0');
          assert.equal(await this.faucet.releasable(dave), '0');

          await time.advanceBlock();
          assert.equal(await this.faucet.totalReleased(), '0');
          assert.equal(await this.faucet.releasable(alice), '25');
          assert.equal(await this.faucet.releasable(bob), '15');
          assert.equal(await this.faucet.releasable(carol), '10');
          assert.equal(await this.faucet.releasable(dave), '50');

          await this.faucet.methods["release(address,address)"](carol, carol, { from:owner });
          assert.equal(await this.faucet.totalReleased(), '20');
          assert.equal(await this.faucet.releasable(alice), '50');
          assert.equal(await this.faucet.releasable(bob), '30');
          assert.equal(await this.faucet.releasable(carol), '0');
          assert.equal(await this.faucet.releasable(dave), '100');

          await time.advanceBlock();
          assert.equal(await this.faucet.totalReleased(), '20');
          assert.equal(await this.faucet.releasable(alice), '75');
          assert.equal(await this.faucet.releasable(bob), '45');
          assert.equal(await this.faucet.releasable(carol), '10');
          assert.equal(await this.faucet.releasable(dave), '150');

          // advances block, but shouldn't allocate any to Edith yet
          await this.faucet.setRecipientShares(edith, 30, { from:owner });
          assert.equal(await this.faucet.totalReleased(), '20');
          assert.equal(await this.faucet.releasable(alice), '100');
          assert.equal(await this.faucet.releasable(bob), '60');
          assert.equal(await this.faucet.releasable(carol), '20');
          assert.equal(await this.faucet.releasable(dave), '200');
          assert.equal(await this.faucet.releasable(edith), '0');
        });

        it('updates internal records as expected when set to non-zero', async () => {
          await this.faucet.setRecipientShares(dave, 10, { from:owner });

          await time.advanceBlockTo(startBlock + 1);
          let info = await this.faucet.recipientInfo(alice);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);
          info = await this.faucet.recipientInfo(dave);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);
          assert.equal(await this.faucet.activeRecipientCount(), '4');
          assert.equal(await this.faucet.activeRecipients(0), alice);
          assert.equal(await this.faucet.activeRecipients(1), bob);
          assert.equal(await this.faucet.activeRecipients(2), carol);
          assert.equal(await this.faucet.activeRecipients(3), dave);

          await this.faucet.methods["release(address,address)"](carol, carol, { from:owner });
          info = await this.faucet.recipientInfo(alice);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.allocated, '20');
          assert.equal(info.totalAllocatedAtLastUpdate, '200');
          assert.equal(info.lastUpdateBlock, `${startBlock + 2}`);
          info = await this.faucet.recipientInfo(dave);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);
          assert.equal(await this.faucet.activeRecipientCount(), '4');
          assert.equal(await this.faucet.activeRecipients(0), alice);
          assert.equal(await this.faucet.activeRecipients(1), bob);
          assert.equal(await this.faucet.activeRecipients(2), carol);
          assert.equal(await this.faucet.activeRecipients(3), dave);

          await this.faucet.setRecipientShares(edith, 30, { from:owner });

          info = await this.faucet.recipientInfo(alice);
          assert.equal(info.allocated, '75');
          assert.equal(info.totalAllocatedAtLastUpdate, '300');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.allocated, '45');
          assert.equal(info.totalAllocatedAtLastUpdate, '300');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.allocated, '30');
          assert.equal(info.totalAllocatedAtLastUpdate, '300');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          info = await this.faucet.recipientInfo(dave);
          assert.equal(info.allocated, '150');
          assert.equal(info.totalAllocatedAtLastUpdate, '300');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          info = await this.faucet.recipientInfo(edith);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '300');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          assert.equal(await this.faucet.activeRecipientCount(), '5');
          assert.equal(await this.faucet.activeRecipients(0), alice);
          assert.equal(await this.faucet.activeRecipients(1), bob);
          assert.equal(await this.faucet.activeRecipients(2), carol);
          assert.equal(await this.faucet.activeRecipients(3), dave);
          assert.equal(await this.faucet.activeRecipients(4), edith);
        });

        it('adjusts future allocations when set from non-zero to non-zero', async () => {
          await this.faucet.setRecipientShares(alice, 15, { from:owner });

          await time.advanceBlockTo(startBlock);
          assert.equal(await this.faucet.totalReleased(), '0');
          assert.equal(await this.faucet.releasable(alice), '0');
          assert.equal(await this.faucet.releasable(bob), '0');
          assert.equal(await this.faucet.releasable(carol), '0');
          assert.equal(await this.faucet.releasable(dave), '0');

          await time.advanceBlock();
          assert.equal(await this.faucet.totalReleased(), '0');
          assert.equal(await this.faucet.releasable(alice), '75');
          assert.equal(await this.faucet.releasable(bob), '15');
          assert.equal(await this.faucet.releasable(carol), '10');
          assert.equal(await this.faucet.releasable(dave), '0');

          await this.faucet.methods["release(address,address)"](carol, carol, { from:owner });
          assert.equal(await this.faucet.totalReleased(), '20');
          assert.equal(await this.faucet.releasable(alice), '150');
          assert.equal(await this.faucet.releasable(bob), '30');
          assert.equal(await this.faucet.releasable(carol), '0');
          assert.equal(await this.faucet.releasable(dave), '0');

          await time.advanceBlock();
          assert.equal(await this.faucet.totalReleased(), '20');
          assert.equal(await this.faucet.releasable(alice), '225');
          assert.equal(await this.faucet.releasable(bob), '45');
          assert.equal(await this.faucet.releasable(carol), '10');
          assert.equal(await this.faucet.releasable(dave), '0');
        });

        it('updates internal records as expected when set from non-zero to non-zero', async () => {
          await this.faucet.setRecipientShares(alice, 15, { from:owner });

          await time.advanceBlockTo(startBlock + 1);
          info = await this.faucet.recipientInfo(alice);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);
          info = await this.faucet.recipientInfo(dave);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${0}`);
          assert.equal(await this.faucet.activeRecipientCount(), '3');
          assert.equal(await this.faucet.activeRecipients(0), alice);
          assert.equal(await this.faucet.activeRecipients(1), bob);
          assert.equal(await this.faucet.activeRecipients(2), carol);

          await this.faucet.methods["release(address,address)"](carol, carol, { from:owner });
          info = await this.faucet.recipientInfo(alice);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.allocated, '20');
          assert.equal(info.totalAllocatedAtLastUpdate, '200');
          assert.equal(info.lastUpdateBlock, `${startBlock + 2}`);
          info = await this.faucet.recipientInfo(dave);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${0}`);
          assert.equal(await this.faucet.activeRecipientCount(), '3');
          assert.equal(await this.faucet.activeRecipients(0), alice);
          assert.equal(await this.faucet.activeRecipients(1), bob);
          assert.equal(await this.faucet.activeRecipients(2), carol);

          await this.faucet.setRecipientShares(alice, 5, { from:owner });
          info = await this.faucet.recipientInfo(alice);
          assert.equal(info.allocated, '225');
          assert.equal(info.totalAllocatedAtLastUpdate, '300');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.allocated, '45');
          assert.equal(info.totalAllocatedAtLastUpdate, '300');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.allocated, '30');
          assert.equal(info.totalAllocatedAtLastUpdate, '300');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          info = await this.faucet.recipientInfo(dave);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${0}`);
          assert.equal(await this.faucet.activeRecipientCount(), '3');
          assert.equal(await this.faucet.activeRecipients(0), alice);
          assert.equal(await this.faucet.activeRecipients(1), bob);
          assert.equal(await this.faucet.activeRecipients(2), carol);
        });

        it('no effect on future allocations when set from zero to zero', async () => {
          await this.faucet.setRecipientShares(dave, 0, { from:owner });

          await time.advanceBlockTo(startBlock);
          assert.equal(await this.faucet.totalReleased(), '0');
          assert.equal(await this.faucet.releasable(alice), '0');
          assert.equal(await this.faucet.releasable(bob), '0');
          assert.equal(await this.faucet.releasable(carol), '0');
          assert.equal(await this.faucet.releasable(dave), '0');

          await time.advanceBlock();
          assert.equal(await this.faucet.totalReleased(), '0');
          assert.equal(await this.faucet.releasable(alice), '50');
          assert.equal(await this.faucet.releasable(bob), '30');
          assert.equal(await this.faucet.releasable(carol), '20');
          assert.equal(await this.faucet.releasable(dave), '0');

          await this.faucet.methods["release(address,address)"](carol, carol, { from:owner });
          assert.equal(await this.faucet.totalReleased(), '40');
          assert.equal(await this.faucet.releasable(alice), '100');
          assert.equal(await this.faucet.releasable(bob), '60');
          assert.equal(await this.faucet.releasable(carol), '0');
          assert.equal(await this.faucet.releasable(dave), '0');

          await time.advanceBlock();
          assert.equal(await this.faucet.totalReleased(), '40');
          assert.equal(await this.faucet.releasable(alice), '150');
          assert.equal(await this.faucet.releasable(bob), '90');
          assert.equal(await this.faucet.releasable(carol), '20');
          assert.equal(await this.faucet.releasable(dave), '0');
        });

        it('internal records updated as expected on future allocations when set from zero to zero', async () => {
          await this.faucet.setRecipientShares(dave, 0, { from:owner });

          await time.advanceBlockTo(startBlock + 1);
          info = await this.faucet.recipientInfo(alice);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);
          info = await this.faucet.recipientInfo(dave);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${0}`);
          assert.equal(await this.faucet.activeRecipientCount(), '3');
          assert.equal(await this.faucet.activeRecipients(0), alice);
          assert.equal(await this.faucet.activeRecipients(1), bob);
          assert.equal(await this.faucet.activeRecipients(2), carol);

          await this.faucet.methods["release(address,address)"](carol, carol, { from:owner });
          info = await this.faucet.recipientInfo(alice);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${startBlock}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.allocated, '40');
          assert.equal(info.totalAllocatedAtLastUpdate, '200');
          assert.equal(info.lastUpdateBlock, `${startBlock + 2}`);
          info = await this.faucet.recipientInfo(dave);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${0}`);
          assert.equal(await this.faucet.activeRecipientCount(), '3');
          assert.equal(await this.faucet.activeRecipients(0), alice);
          assert.equal(await this.faucet.activeRecipients(1), bob);
          assert.equal(await this.faucet.activeRecipients(2), carol);

          await this.faucet.setRecipientShares(dave, 0, { from:owner });
          info = await this.faucet.recipientInfo(alice);
          assert.equal(info.allocated, '150');
          assert.equal(info.totalAllocatedAtLastUpdate, '300');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          info = await this.faucet.recipientInfo(bob);
          assert.equal(info.allocated, '90');
          assert.equal(info.totalAllocatedAtLastUpdate, '300');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          info = await this.faucet.recipientInfo(carol);
          assert.equal(info.allocated, '60');
          assert.equal(info.totalAllocatedAtLastUpdate, '300');
          assert.equal(info.lastUpdateBlock, `${startBlock + 3}`);
          info = await this.faucet.recipientInfo(dave);
          assert.equal(info.allocated, '0');
          assert.equal(info.totalAllocatedAtLastUpdate, '0');
          assert.equal(info.lastUpdateBlock, `${0}`);
          assert.equal(await this.faucet.activeRecipientCount(), '3');
          assert.equal(await this.faucet.activeRecipients(0), alice);
          assert.equal(await this.faucet.activeRecipients(1), bob);
          assert.equal(await this.faucet.activeRecipients(2), carol);
        });
      });
    });
  });

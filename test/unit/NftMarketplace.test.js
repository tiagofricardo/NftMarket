const { assert, expect } = require("chai")
const { network, deployments, ethers, getNamedAccounts } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Nft Marketplace Tests", function () {
          let nftMarketplace, basicNft, deployer, player
          const PRICE = ethers.utils.parseEther("0.1")
          const TOKEN_ID = 0
          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              //player = (await getNamedAccounts()).player
              const accounts = await ethers.getSigners()
              player = accounts[1]
              await deployments.fixture(["all"])
              nftMarketplace = await ethers.getContract("NftMarketplace")
              basicNft = await ethers.getContract("BasicNft")
              await basicNft.minNft()
              await basicNft.approve(nftMarketplace.address, TOKEN_ID)
          })
          describe("listItem", function () {
              it("trying to list with price 0", async function () {
                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID, 0)
                  ).to.be.revertedWith("NftMarketplace__PriceMustBeAboveZero")
              })

              it("lists an nft already listed", async function () {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NftMarketplace__AlreadyListed")
              })

              it("lists an nft that's not the owner", async function () {
                  const playerConnectedNftMarketplace = nftMarketplace.connect(player)
                  await expect(
                      playerConnectedNftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NftMarketplace__NotOwner")
              })

              it("list an nft not approved", async function () {
                  const playerConnectedNftMarketplace = await nftMarketplace.connect(player)
                  const playerConnectedBasicNft = await basicNft.connect(player)
                  await playerConnectedBasicNft.minNft()
                  await expect(
                      playerConnectedNftMarketplace.listItem(
                          playerConnectedBasicNft.address,
                          TOKEN_ID + 1,
                          PRICE
                      )
                  ).to.be.revertedWith("NftMarketplace__NotApprovedForMarketplace")
              })

              it("list and emits and event", async function () {
                  await expect(
                      await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.emit(nftMarketplace, "ItemList")
              })
          })
          describe("buyItem", function () {
              it("buy nft with low price", async function () {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const playerConnectedNftMarketplace = nftMarketplace.connect(player)
                  await expect(
                      playerConnectedNftMarketplace.buyItem(basicNft.address, TOKEN_ID, {
                          value: ethers.utils.parseEther("0.01"),
                      })
                  ).to.be.revertedWith("NftMarketplace__PriceNotMet")
              })

              it("buy nft and event is emitted", async function () {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const playerConnectedNftMarketplace = nftMarketplace.connect(player)
                  await expect(
                      playerConnectedNftMarketplace.buyItem(basicNft.address, TOKEN_ID, {
                          value: PRICE,
                      })
                  ).to.emit(nftMarketplace, "ItemBought")
              })

              it("buy nft and Listing is updated", async function () {
                  let listing
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert(listing.price.toString() == PRICE)

                  const playerConnectedNftMarketplace = nftMarketplace.connect(player)
                  await playerConnectedNftMarketplace.buyItem(basicNft.address, TOKEN_ID, {
                      value: PRICE,
                  })

                  listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert(listing.price.toString() == 0)
              })

              it("lists and can be bought", async function () {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const playerConnectedNftMarketplace = nftMarketplace.connect(player)
                  await playerConnectedNftMarketplace.buyItem(basicNft.address, TOKEN_ID, {
                      value: PRICE,
                  })
                  const newOwner = await basicNft.ownerOf(TOKEN_ID)
                  const deployerProceeds = await nftMarketplace.getProceeds(deployer)

                  assert(newOwner.toString() == player.address)
                  assert(deployerProceeds.toString() == PRICE.toString())
              })
          })
          describe("cancelListing", function () {
              it("try to cancel a listing without be the owner", async function () {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const playerConnectedNftMarketplace = nftMarketplace.connect(player)
                  await expect(
                      playerConnectedNftMarketplace.cancelListing(basicNft.address, TOKEN_ID)
                  ).to.be.revertedWith("NftMarketplace__NotOwner")
              })

              it("try to cancel a listing that not exists", async function () {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await expect(
                      nftMarketplace.cancelListing(basicNft.address, 1)
                  ).to.be.revertedWith("NftMarketplace__NotListed")
              })

              it("cancel listing correctly", async function () {
                  let listing
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert(listing.price.toString() == PRICE)
                  await nftMarketplace.cancelListing(basicNft.address, TOKEN_ID)
                  listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert(listing.price.toString() == 0)
              })

              it("cancel and emits event", async function () {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await expect(
                      await nftMarketplace.cancelListing(basicNft.address, TOKEN_ID)
                  ).to.emit(nftMarketplace, "ItemCanceled")
              })
          })

          describe("updateListing", function () {
              it("update not listed", async function () {
                  const newPrice = ethers.utils.parseEther("0.2")
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await expect(
                      nftMarketplace.updateListing(basicNft.address, 1, newPrice)
                  ).to.be.revertedWith("NftMarketplace__NotListed")
              })

              it("try to update without be the owner", async function () {
                  const newPrice = ethers.utils.parseEther("0.2")
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const playerConnectedNftMarketplace = nftMarketplace.connect(player)
                  await expect(
                      playerConnectedNftMarketplace.updateListing(
                          basicNft.address,
                          TOKEN_ID,
                          newPrice
                      )
                  ).to.be.revertedWith("NftMarketplace__NotOwner")
              })

              it("update price correctly", async function () {
                  let listing
                  const newPrice = ethers.utils.parseEther("0.2")
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert(listing.price.toString() == PRICE)
                  nftMarketplace.updateListing(basicNft.address, TOKEN_ID, newPrice)
                  listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert(listing.price.toString() == newPrice)
              })

              it("update price correctly and emits an event", async function () {
                  const newPrice = ethers.utils.parseEther("0.2")
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await expect(
                      await nftMarketplace.updateListing(basicNft.address, TOKEN_ID, newPrice)
                  ).to.emit(nftMarketplace, "ItemListed")
              })
          })

          describe("withdrawProceeds", function () {
              it("withdraw without proceeds", async function () {
                  await expect(nftMarketplace.withdrawProceeds()).to.be.revertedWith(
                      "NftMarketplace__NoProceeds"
                  )
              })

              it("withdraw proceeds correctly", async function () {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const startBalance = await ethers.provider.getBalance(deployer)

                  const playerConnectedNftMarketplace = nftMarketplace.connect(player)
                  await playerConnectedNftMarketplace.buyItem(basicNft.address, TOKEN_ID, {
                      value: PRICE,
                  })
                  const transactionWithdrawResponse = await nftMarketplace.withdrawProceeds()
                  const transactionWithdrawReceipt = await transactionWithdrawResponse.wait(1)
                  const { gasUsed, effectiveGasPrice } = transactionWithdrawReceipt
                  const gasCost = gasUsed.mul(effectiveGasPrice)

                  const finalBalance = await ethers.provider.getBalance(deployer)

                  assert(startBalance.add(PRICE).toString() == finalBalance.add(gasCost).toString())
              })
          })
      })

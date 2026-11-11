const fs = require("fs");
const assert = require("assert");
const ganache = require("ganache");
const { ethers } = require("ethers");

const abi = JSON.parse(fs.readFileSync("abi/P2PEscrow.abi.json"));
const bytecode = fs.readFileSync("abi/P2PEscrow.bytecode.txt", "utf8");
const S = { None: 0, Pending: 1, Accepted: 2, Funded: 3, Delivered: 4, Completed: 5, Refunded: 6, Rejected: 7, Disputed: 8 };

let passed = 0, failed = 0;
async function it(name, fn) {
  try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT (hung)")), 20000))]); passed++; console.log("  ✓", name); }
  catch (e) { failed++; console.log("  ✗", name, "\n     ", e.message.split("\n")[0]); }
}
async function reverts(p, msg) {
  try { await p; } catch (e) {
    const text = JSON.stringify([e.reason, e.shortMessage, e.message, e.info && e.info.error && e.info.error.message, e.error && e.error.message]);
    if (msg && !text.includes(msg)) throw new Error(`expected revert "${msg}" but got: ${text.slice(0, 160)}`);
    return;
  }
  throw new Error(`expected revert${msg ? ` "${msg}"` : ""} but call succeeded`);
}

(async () => {
  const server = ganache.provider({ logging: { quiet: true }, chain: { vmErrorsOnRPCResponse: true }, wallet: { totalAccounts: 6, defaultBalance: 100 } });
  const provider = new ethers.BrowserProvider(server);
  const [arbiterW, buyerW, sellerW, strangerW, oracleW] = await Promise.all([0, 1, 2, 3, 4].map(i => provider.getSigner(i)));
  const [arbiter, buyer, seller, stranger, oracle] = await Promise.all([arbiterW, buyerW, sellerW, strangerW, oracleW].map(s => s.getAddress()));

  const factory = new ethers.ContractFactory(abi, bytecode, arbiterW);
  const c = await factory.deploy(arbiter, 120, 120, 120, 120);
  await c.waitForDeployment();
  // ganache mines instantly: poll the receipt directly instead of ethers' slow tx.wait()
  const w = async (p) => {
    const tx = await p;
    for (let i = 0; i < 500; i++) {
      const r = await provider.getTransactionReceipt(tx.hash);
      if (r) return r;
      await new Promise(r => setTimeout(r, 10));
    }
    throw new Error("no receipt");
  };
  // Simulate each call first (eth_call) so revert REASONS surface, then send the real transaction.
  const as = (signer) => new Proxy(c.connect(signer), {
    get(target, prop) {
      const f = target[prop];
      if (!f || typeof f.staticCall !== "function") return f;
      return async (...args) => { await f.staticCall(...args); return f(...args); };
    }
  });

  let n = 0;
  const newId = () => ethers.keccak256(ethers.toUtf8Bytes("trade-" + n++));
  const wait = async (secs) => { await server.request({ method: "evm_increaseTime", params: [secs], jsonrpc: "2.0", id: 1 }); await server.request({ method: "evm_mine", params: [], jsonrpc: "2.0", id: 2 }); };
  const status = async (id) => Number(await c.statusOf(id));
  const ref = ethers.keccak256(ethers.toUtf8Bytes("PAYCHANGU-REF"));

  const toPending = async () => { const id = newId(); await w(as(buyerW).createTrade(id, seller, 50000)); return id; };
  const toAccepted = async () => { const id = await toPending(); await w(as(sellerW).acceptTrade(id)); return id; };
  const toFunded = async () => { const id = await toAccepted(); await w(as(buyerW).recordPayment(id, ref)); return id; };
  const toDelivered = async () => { const id = await toFunded(); await w(as(sellerW).markDelivered(id)); return id; };

  console.log("\nHappy path");
  await it("create -> accept -> pay -> deliver -> confirm", async () => {
    const id = await toPending(); assert.equal(await status(id), S.Pending);
    await w(as(sellerW).acceptTrade(id)); assert.equal(await status(id), S.Accepted);
    await w(as(buyerW).recordPayment(id, ref)); assert.equal(await status(id), S.Funded);
    await w(as(sellerW).markDelivered(id)); assert.equal(await status(id), S.Delivered);
    await w(as(buyerW).confirmReceipt(id)); assert.equal(await status(id), S.Completed);
    const t = await c.trades(id);
    assert.equal(t.buyer, buyer); assert.equal(t.seller, seller); assert.equal(t.amount, 50000n); assert.equal(t.paymentRef, ref);
  });
  await it("buyer may confirm before the seller marks delivered", async () => {
    const id = await toFunded(); await w(as(buyerW).confirmReceipt(id)); assert.equal(await status(id), S.Completed);
  });
  await it("seller can reject a pending trade", async () => {
    const id = await toPending(); await w(as(sellerW).rejectTrade(id)); assert.equal(await status(id), S.Rejected);
  });
  await it("seller can voluntarily refund a funded trade", async () => {
    const id = await toFunded(); await w(as(sellerW).sellerRefund(id)); assert.equal(await status(id), S.Refunded);
  });
  await it("oracle can record payment once set by the arbiter", async () => {
    await w(as(arbiterW).setOracle(oracle));
    const id = await toAccepted(); await w(as(oracleW).recordPayment(id, ref)); assert.equal(await status(id), S.Funded);
  });

  console.log("\nRole checks");
  await it("only the buyer creates (seller != buyer, amount > 0, no duplicates)", async () => {
    await reverts(as(buyerW).createTrade(newId(), buyer, 1000), "must differ");
    await reverts(as(buyerW).createTrade(newId(), seller, 0), "positive");
    const id = await toPending(); await reverts(as(buyerW).createTrade(id, seller, 1000), "already exists");
  });
  await it("only the seller accepts / rejects / marks delivered", async () => {
    const id = await toPending();
    await reverts(as(strangerW).acceptTrade(id), "Only the seller");
    await reverts(as(buyerW).acceptTrade(id), "Only the seller");
    await reverts(as(buyerW).rejectTrade(id), "Only the seller");
    await w(as(sellerW).acceptTrade(id));
    await w(as(buyerW).recordPayment(id, ref));
    await reverts(as(buyerW).markDelivered(id), "Only the seller");
  });
  await it("only buyer (or oracle) records payment; empty ref rejected", async () => {
    const id = await toAccepted();
    await reverts(as(strangerW).recordPayment(id, ref), "Only buyer or oracle");
    await reverts(as(sellerW).recordPayment(id, ref), "Only buyer or oracle");
    await reverts(as(buyerW).recordPayment(id, ethers.ZeroHash), "reference required");
  });
  await it("only the buyer confirms receipt; only the seller refunds", async () => {
    const id = await toDelivered();
    await reverts(as(sellerW).confirmReceipt(id), "Only the buyer");
    await reverts(as(strangerW).confirmReceipt(id), "Only the buyer");
    await reverts(as(buyerW).sellerRefund(id), "Only the seller");
  });

  console.log("\nState machine");
  await it("actions in the wrong state revert", async () => {
    const id = await toPending();
    await reverts(as(buyerW).recordPayment(id, ref), "Wrong trade state");
    await reverts(as(sellerW).markDelivered(id), "Wrong trade state");
    await reverts(as(buyerW).confirmReceipt(id), "Not awaiting confirmation");
    await reverts(as(sellerW).acceptTrade(ethers.keccak256("0x1234")), "Trade not found");
    const done = await toDelivered(); await w(as(buyerW).confirmReceipt(done));
    await reverts(as(buyerW).confirmReceipt(done), "Not awaiting confirmation");
    await reverts(as(sellerW).sellerRefund(done), "Nothing to refund");
  });

  console.log("\nTimeout rules");
  await it("expirePending: too early reverts, after the window anyone can call it", async () => {
    const id = await toPending();
    await reverts(as(strangerW).expirePending(id), "Not expired yet");
    await wait(130); await w(as(strangerW).expirePending(id)); assert.equal(await status(id), S.Rejected);
  });
  await it("cancelUnpaid: accepted but never paid", async () => {
    const id = await toAccepted();
    await reverts(as(strangerW).cancelUnpaid(id), "still open");
    await wait(130); await w(as(strangerW).cancelUnpaid(id)); assert.equal(await status(id), S.Rejected);
  });
  await it("autoRefund: paid but never delivered", async () => {
    const id = await toFunded();
    await reverts(as(strangerW).autoRefund(id), "still open");
    await wait(130); await w(as(strangerW).autoRefund(id)); assert.equal(await status(id), S.Refunded);
  });
  await it("autoRelease: delivered but never confirmed", async () => {
    const id = await toDelivered();
    await reverts(as(strangerW).autoRelease(id), "still open");
    await wait(130); await w(as(strangerW).autoRelease(id)); assert.equal(await status(id), S.Completed);
  });
  await it("auto rules only fire in their own state (no refund after delivery, no release before)", async () => {
    const id = await toDelivered(); await wait(130);
    await reverts(as(strangerW).autoRefund(id), "Wrong trade state");
    const f = await toFunded(); await wait(130);
    await reverts(as(strangerW).autoRelease(f), "Wrong trade state");
  });

  console.log("\nDisputes");
  await it("either party can open a dispute on a funded or delivered trade", async () => {
    const a = await toFunded(); await w(as(buyerW).openDispute(a, ethers.id("evidence"))); assert.equal(await status(a), S.Disputed);
    const b = await toDelivered(); await w(as(sellerW).openDispute(b, ethers.id("evidence"))); assert.equal(await status(b), S.Disputed);
  });
  await it("strangers can't dispute; can't dispute before payment or after completion", async () => {
    const f = await toFunded(); await reverts(as(strangerW).openDispute(f, ethers.id("x")), "Only a party");
    const p = await toAccepted(); await reverts(as(buyerW).openDispute(p, ethers.id("x")), "Cannot dispute");
    const d = await toDelivered(); await w(as(buyerW).confirmReceipt(d));
    await reverts(as(buyerW).openDispute(d, ethers.id("x")), "Cannot dispute");
  });
  await it("a dispute freezes the timeout rules", async () => {
    const id = await toDelivered(); await w(as(buyerW).openDispute(id, ethers.id("e"))); await wait(500);
    await reverts(as(strangerW).autoRelease(id), "Wrong trade state");
    await reverts(as(strangerW).autoRefund(id), "Wrong trade state");
    await reverts(as(buyerW).confirmReceipt(id), "Not awaiting confirmation");
  });
  await it("arbiter resolves for the seller (Completed) or the buyer (Refunded)", async () => {
    const a = await toFunded(); await w(as(buyerW).openDispute(a, ethers.id("e")));
    await w(as(arbiterW).resolveDispute(a, true)); assert.equal(await status(a), S.Completed);
    const b = await toFunded(); await w(as(buyerW).openDispute(b, ethers.id("e")));
    await w(as(arbiterW).resolveDispute(b, false)); assert.equal(await status(b), S.Refunded);
  });
  await it("only the arbiter resolves; only disputed trades can be resolved", async () => {
    const id = await toFunded(); await w(as(buyerW).openDispute(id, ethers.id("e")));
    await reverts(as(buyerW).resolveDispute(id, false), "Only the arbiter");
    await reverts(as(sellerW).resolveDispute(id, true), "Only the arbiter");
    const f = await toFunded(); await reverts(as(arbiterW).resolveDispute(f, true), "Wrong trade state");
  });

  console.log("\nAdmin");
  await it("only the arbiter changes timeouts / oracle / arbiter; zero timeouts rejected", async () => {
    await reverts(as(buyerW).setTimeouts(1, 1, 1, 1), "Only the arbiter");
    await reverts(as(buyerW).setOracle(stranger), "Only the arbiter");
    await reverts(as(buyerW).transferArbiter(stranger), "Only the arbiter");
    await reverts(as(arbiterW).setTimeouts(0, 1, 1, 1), "positive");
    await w(as(arbiterW).setTimeouts(60, 60, 60, 60));
    assert.equal(await c.pendingTimeout(), 60n);
    const id = await toPending(); await wait(70);
    await w(as(strangerW).expirePending(id)); assert.equal(await status(id), S.Rejected);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

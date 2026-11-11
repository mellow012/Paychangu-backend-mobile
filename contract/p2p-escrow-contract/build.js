const fs = require("fs");
const solc = require("solc");
const src = fs.readFileSync("contracts/P2PEscrow.sol", "utf8");
const out = JSON.parse(solc.compile(JSON.stringify({
  language: "Solidity",
  sources: { "P2PEscrow.sol": { content: src } },
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } }
})));
const errs = (out.errors || []).filter(e => e.severity === "error");
(out.errors || []).forEach(e => console.log(e.formattedMessage));
if (errs.length) process.exit(1);
const c = out.contracts["P2PEscrow.sol"].P2PEscrow;
fs.writeFileSync("abi/P2PEscrow.abi.json", JSON.stringify(c.abi, null, 2));
fs.writeFileSync("abi/P2PEscrow.bytecode.txt", "0x" + c.evm.bytecode.object);
console.log("compiled OK, bytecode bytes:", c.evm.bytecode.object.length / 2);

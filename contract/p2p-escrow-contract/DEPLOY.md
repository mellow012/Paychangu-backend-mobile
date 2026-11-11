# Deploying P2PEscrow to Sepolia (via Remix + MetaMask)

The contract holds no money: it records and enforces the trade rules. You only need a little free test ETH for gas.

## 1. Make 3 wallets in MetaMask
Create three accounts and name them so you don't mix them up:
- **Arbiter**: deploys the contract and later resolves disputes. Its private key stays in MetaMask. NEVER put it in the app.
- **Buyer** and **Seller**: the two test users. Their addresses and private keys go into each app account's Complete Profile screen (MetaMask: account menu > Account details > Show private key).

## 2. Switch MetaMask to Sepolia
Settings > Advanced > turn on "Show test networks", then pick **Sepolia** from the network list.

## 3. Get free test ETH for all three wallets
Use either (no mainnet balance needed):
- Google Cloud Web3 faucet: cloud.google.com/application/web3/faucet/ethereum/sepolia (sign in with Google, paste an address)
- pk910 PoW faucet (mine in the browser, no account)
About 0.02 ETH per wallet is plenty. Faucet limits change, so check the live page.

## 4. Deploy with Remix
1. Open https://remix.ethereum.org, create `P2PEscrow.sol`, paste the contents of `contracts/P2PEscrow.sol`.
2. Solidity Compiler tab: pick version 0.8.26 (any 0.8.20+ works), click Compile.
3. Deploy & Run tab: Environment = **Injected Provider - MetaMask**. Make sure MetaMask is on the **Arbiter** account and Sepolia.
4. Next to Deploy, fill the constructor fields:
   `_arbiter` = the Arbiter wallet address, then `120`, `120`, `120`, `120` (the four timeouts, in seconds)
5. Click Deploy, confirm in MetaMask.
6. Under "Deployed Contracts", copy the contract address. Click `pendingTimeout`: it should return 120.

## 5. Send these back
- The contract address
- The Buyer and Seller wallet addresses (not the private keys)
- A Sepolia RPC URL (a free Alchemy or Infura key works, or a public node)

## Changing the timeouts later (for the demo)
In Remix, on the Arbiter account, call `setTimeouts(p, u, d, c)` with seconds.

## Run the tests locally (optional)
`npm install` then `npm test` (compiles the contract and runs 21 tests on a local simulated chain).

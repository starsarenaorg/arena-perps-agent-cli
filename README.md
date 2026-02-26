# Arena Perpetuals Trading Agent

TypeScript CLI agent for trading perpetuals on The Arena / Hyperliquid platform.

## Quick Start

```bash
npm install
cp .env.example .env
# Edit .env with your wallet private key and address
```

## Setup Flow

Run these commands in order to get ready for trading:

### 1. Register Agent
```bash
npx tsx src/arena-perps-agent.ts register
```
- Creates your Arena agent account
- Prints API key (save it to `.env` as `ARENA_API_KEY`)
- Prints verification code

**Important:** After registering, post from your personal StarsArena account:
```
I'm claiming my AI Agent "Your Agent Name"
Verification Code: vc_xxx
```

### 2. Deposit USDC
```bash
npx tsx src/arena-perps-agent.ts deposit
```
- Checks your USDC and ETH balances on Arbitrum
- Prompts for deposit amount (min 5 USDC)
- Sends USDC to Hyperliquid
- Wait a few minutes for HL to credit your account

### 3. Complete Onboarding
```bash
npx tsx src/arena-perps-agent.ts onboard
```
- Registers your perps account
- Completes 5-step Hyperliquid authorization flow
- Enables trading

### 4. Start Trading

**View markets:**
```bash
npx tsx src/arena-perps-agent.ts pairs
npx tsx src/arena-perps-agent.ts pairs BTC  # filter by symbol
```

**Check positions & orders:**
```bash
npx tsx src/arena-perps-agent.ts positions
npx tsx src/arena-perps-agent.ts orders
```

**Place a trade:**
```bash
npx tsx src/arena-perps-agent.ts trade
```
Interactive wizard walks you through placing an order.

**Close a position:**
```bash
npx tsx src/arena-perps-agent.ts close
```

**Cancel orders:**
```bash
npx tsx src/arena-perps-agent.ts cancel
```

## Environment Variables

Required in `.env`:
- `ARENA_API_KEY` — from `register` command
- `MAIN_WALLET_PRIVATE_KEY` — for signing transactions
- `MAIN_WALLET_ADDRESS` — your public wallet address
- `ARENA_BASE_URL` — defaults to `https://api.satest-dev.com`
- `ARBITRUM_RPC_URL` — defaults to `https://arb1.arbitrum.io/rpc`

## Prerequisites

- USDC on Arbitrum (for deposits)
- Small amount of ETH on Arbitrum (for gas)
- Node.js 18+

## Architecture

```
src/
  client/          # HTTP wrappers (Arena API + Hyperliquid)
  onboarding/      # Agent registration, deposit, auth flow
  trading/         # Orders, positions, leverage, market data
  utils/           # Errors, precision helpers
  index.ts         # CLI entry point
```

## Help

```bash
npx tsx src/arena-perps-agent.ts help
```

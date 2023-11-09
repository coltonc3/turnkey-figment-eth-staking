// Turnkey packages: https://github.com/tkhq/sdk/tree/main/packages/ethers
const { TurnkeySigner } = require("@turnkey/ethers");
const { TurnkeyClient } = require("@turnkey/http");
const { ApiKeyStamper } = require("@turnkey/api-key-stamper");
require('dotenv').config();
const axios = require('axios');

const MY_STAKE_AMOUNT = 32;
const TURNKEY_URL = 'https://api.turnkey.com';
const FIGMENT_API_URL = 'https://eth-slate.datahub.figment.io/api/v1/flows';
const FIGMENT_API_HEADERS = {
  headers: {
    'Authorization': process.env.FIGMENT_API_KEY,
    'Content-Type': 'application/json'
  }
}

const turnkeyClient = new TurnkeyClient(
  {
    baseUrl: TURNKEY_URL,
  },
  new ApiKeyStamper({
    apiPublicKey: process.env.TK_API_PUBKEY,
    apiPrivateKey: process.env.TK_API_PRIVKEY,
  })
);
const turnkeySigner = new TurnkeySigner({
  client: turnkeyClient,
  organizationId: process.env.TK_ORGANIZATION_ID,
  signWith: process.env.TK_ETH_ADDRESS,
});

async function createStakingFlow(networkCode, chainCode, operation) {
  return await axios.post(FIGMENT_API_URL, {
    flow: {
      network_code: networkCode,
      chain_code: chainCode,
      operation: operation
    }
  }, 
  FIGMENT_API_HEADERS
  ).then(flow => {
    console.log(`Staking flow ID: ${flow.data.id}`);
    return flow.data.id;
  })
}

async function getStakingFlow(flowId) {
  return await axios.get(`${FIGMENT_API_URL}/${flowId}`, FIGMENT_API_HEADERS).then(flow => flow.data);
}

async function getRawStakingTx(flowId, fundingAddress, withdrawalAddress, stakeAmount) {
  let flow = await axios.put(`${FIGMENT_API_URL}/${flowId}/next`, {
    name: 'assign_staking_data',
    inputs: {
      funding_account_address: fundingAddress,
      withdrawal_address: withdrawalAddress,
      amount: stakeAmount
    }
  },
  FIGMENT_API_HEADERS
  );
  let flowState = flow.data.state;
  console.log(`Staking flow state: ${flowState}`);
  // poll until validators are provisioned
  while(flowState == 'awaiting_provision') {
    flow = await getStakingFlow(flowId);
    flowState = flow.state;
    console.log(`Staking flow state: ${flowState}`);
  }
  flow = await getStakingFlow(flowId);
  if(flow.state == 'aggregated_deposit_tx_signature') {
    console.log(`Staking flow state: ${flow.state}`);
    // strip prepended 0x so Turnkey can parse
    const rawTx = flow.data.aggregated_deposit_transaction.raw.substr(2)
    console.log(`Raw staking tx: ${rawTx}`)
    return rawTx;
  }
}

async function signTransaction(rawTx) {
  // sign raw tx with turnkey: https://docs.turnkey.com/api#tag/Signers/operation/SignRawPayload
  return await turnkeySigner._signTransactionImpl(rawTx).then(signedTx => {
    // prepend 0x for Figment API to parse
    console.log(`Signed tx: 0x${signedTx}`);
    return `0x${signedTx}`;
  });
}

async function broadcastStakingTx(flowId, transactionPayload) {
  let flow = await axios.put(`${FIGMENT_API_URL}/${flowId}/next`, {
    name: 'sign_aggregated_deposit_tx',
    inputs: {
      transaction_payload: transactionPayload
    }
  },
  FIGMENT_API_HEADERS
  );

  let flowState = flow.data.state;
  console.log(`Staking flow state: ` + flowState);
  while(flowState == 'aggregated_deposit_tx_broadcasting') {
    flow = await getStakingFlow(flowId);
    console.log(`Staking flow state: ${flow.state}`);
  }
  flow = await getStakingFlow(flowId);
  if(flow.state == 'activating') {
    console.log(`Staking flow state: ${flow.state}`);
    return flow;
  }
}

(async () => {
  /* 
  prerequisites: 
    1. Create Turnkey account (turnkey UI)
    2. Create Turnkey API key (turnkey UI)
    3. Create Ethereum wallet or private key with Turnkey
  */

  // get wallet pubkey from Turnkey
  const fundingAddress = await turnkeySigner.getAddress();
  const withdrawalAddress = fundingAddress;

  createStakingFlow('ethereum', 'goerli', 'aggregated_staking')
  .then(flowId => getRawStakingTx(flowId, fundingAddress, withdrawalAddress, MY_STAKE_AMOUNT)
  .then(rawTx => signTransaction(rawTx)
  .then(signedTx => broadcastStakingTx(flowId, signedTx))))
  .then(flow => console.log(`Tx hash: ${flow.data.aggregated_deposit_transaction.hash}`))
})();

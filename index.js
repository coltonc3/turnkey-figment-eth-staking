require('dotenv').config();
const axios = require('axios').default;

// Turnkey packages: https://github.com/tkhq/sdk/tree/main/packages/ethers
const { TurnkeySigner } = require("@turnkey/ethers");
const { TurnkeyClient } = require("@turnkey/http");
const { ApiKeyStamper } = require("@turnkey/api-key-stamper");

const myStakeAmount = 32;
const turnkeyUrl = 'https://api.turnkey.com';
const figmentApiUrl = 'https://eth-slate.datahub.staging.figment.io/api/v1/flows';
const figmentApiHeaders = {
  Authorization: process.env.FIG_APIKEY,
  'Content-Type': 'application/json'
}

async function createStakingFlow(networkCode, chainCode, operation) {
  const flow = await axios.post(figmentApiUrl, {
    flow: {
      network_code: networkCode,
      chain_code: chainCode,
      operation: operation
    }
  }, 
  {
    headers: figmentApiHeaders
  });
  const flowId = flow.data.id
  console.log('Staking flow ID: ' + flowId);
  return flowId;
}

async function getStakingFlow(flowId) {
  const flow = await axios.get(`${figmentApiUrl}/${flowId}`, { headers: figmentApiHeaders })
  return flow.data;
}

async function getRawStakingTx(flowId, fundingAddress, withdrawalAddress, stakeAmount) {
  let flow = await axios.put(`${figmentApiUrl}/${flowId}/next`, {
    name: 'assign_staking_data',
    inputs: {
      funding_account_address: fundingAddress,
      withdrawal_address: withdrawalAddress,
      amount: stakeAmount
    }
  },
  {
    headers: figmentApiHeaders
  });
  let flowState = flow.data.state;
  console.log('Staking flow state: ' + flowState);
  // poll until validators are provisioned
  while(flowState == 'awaiting_provision') {
    flow = await getStakingFlow(flowId);
    flowState = flow.state;
    console.log('Staking flow state: ' + flowState);
  }
  flow = await getStakingFlow(flowId);
  if(flow.state == 'aggregated_deposit_tx_signature') {
    console.log('Staking flow state: ' + flow.state);
    // strip prepended 0x so Turnkey can parse
    const rawTx = flow.data.aggregated_deposit_transaction.raw.substr(2)
    console.log('Raw staking tx: ' + rawTx)
    return rawTx;
  }
}

async function broadcastStakingTx(flowId, transactionPayload) {
  let flow = await axios.put(`${figmentApiUrl}/${flowId}/next`, {
    name: 'sign_aggregated_deposit_tx',
    inputs: {
      transaction_payload: transactionPayload
    }
  },
  {
    headers: figmentApiHeaders
  })

  let flowState = flow.data.state;
  console.log('Staking flow state: ' + flowState);
  while(flowState == 'aggregated_deposit_tx_broadcasting') {
    flow = await getStakingFlow(flowId);
    flowState = flow.state
    console.log('Staking flow state: ' + flowState);
  }
  flow = await getStakingFlow(flowId);
  if(flow.state == 'activating') {
    console.log('Staking flow state: ' + flow.state);
    return flow;
  }
}

(async () => {
  /* 
  prerequisites: 
    1. create turnkey account (turnkey UI)
    2. create turnkey api key (turnkey UI)
    3. create ethereum private key (turnkey CLI)
  */

  // create turnkey client
  const turnkeyClient = new TurnkeyClient(
    {
      baseUrl: turnkeyUrl,
    },
    new ApiKeyStamper({
      apiPublicKey: process.env.TK_API_PUBKEY,
      apiPrivateKey: process.env.TK_API_PRIVKEY,
    })
  );

  // get pubkey from turnkey https://docs.turnkey.com/api#tag/Private-Keys/operation/GetPrivateKey
  const privateKey = await turnkeyClient.getPrivateKey({organizationId: process.env.TK_ORGANIZATION_ID, privateKeyId: process.env.TK_ETH_KEY_ID});
  const fundingAddress = privateKey.privateKey.addresses[0].address;
  const withdrawalAddress = fundingAddress;
  console.log("Funding address: " + fundingAddress);
  console.log("Withdrawal address: " + withdrawalAddress);
  console.log('Stake amount: ' + myStakeAmount);

  // create turnkey signer
  const turnkeySigner = new TurnkeySigner({
    client: turnkeyClient,
    organizationId: process.env.TK_ORGANIZATION_ID,
    signWith: process.env.TK_ETH_KEY_ID,
  });

  // create flow
  const flowId = await createStakingFlow('ethereum', 'goerli', 'aggregated_staking');
  // get raw staking tx
  const rawTx = await getRawStakingTx(flowId, fundingAddress, withdrawalAddress, myStakeAmount);
  // sign raw tx with turnkey: https://docs.turnkey.com/api#tag/Signers/operation/SignRawPayload
  const signedTx = await turnkeySigner._signTransactionImpl(rawTx);
  console.log('Signed tx: ' + signedTx);
  // prepend 0x for Figment API
  const transactionPayload = '0x' + signedTx;
  // broadcast tx
  const broadcastedFlow = await broadcastStakingTx(flowId, transactionPayload);
  console.log('Tx hash: ' + broadcastedFlow.data.aggregated_deposit_transaction.hash);
  console.log("Estimated activation: " + broadcastedFlow.data.estimated_active_at);
  
})();

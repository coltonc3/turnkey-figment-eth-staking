# turnkey-figment-eth-staking
Use Turnkey's SDK with Figment's API to stake ETH with Figment!

[Turnkey](http://www.turnkey.com/) offers API-first crypto private key management and secure signing, founded by the team that built Coinbase Custody. They leverage secure enclaves to offer secure and flexible that is 100x faster than MPC. Their platform can be used for everything from wallet-as-a-service, to asset operations, and product infrastructure use cases. In example, we use Turnkey + Figment to easily automate ETH staking. To get started, [sign up to Turnkey](http://www.turnkey.com/) and to learn more, check out their docs [here](https://docs.turnkey.com/).
 
 # Create a .env file with the following variables assigned
 ```
FIGMENT_API_KEY="my Figment API key"
TK_ORGANIZATION_ID="my Turnkey organization ID"
TK_ETH_ADDRESS="Ethereum address derived from a Turnkey Wallet or Private Key"
TK_API_PUBKEY="Turnkey API pubkey"
TK_API_PRIVKEY="Turnkey API private key"
```

> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Disbursement tokens

> Stablecoin rails for batch disbursements and treasury payouts.

`morapay.payouts` batches debit merchant treasury liquidity on supported **pool tokens** and deliver fiat to MoMo or bank recipients.

## Live mainnet

| Chain | Chain ID | Token |
| - | - | - |
| Base | 8453 | USDC |
| Base | 8453 | ETH |
| Ethereum | 1 | USDC |
| Ethereum | 1 | ETH |

Primary production rails:

* **USDC on Base** chain ID 8453
* **USDC on Ethereum** chain ID 1

`ETH` on Base and Ethereum is also accepted for pool settlement when quoted.

## Test testnet

| Chain | Chain ID | Token |
| - | - | - |
| Base Sepolia | 84532 | USDC |
| Base Sepolia | 84532 | ETH |

Test batches must use testnet chains such as **Base Sepolia** chain ID 84532. Mainnet chain IDs are rejected in test mode.

## Quote before batching

```typescript theme={null}
const quote = await morapay.payouts.quote({
  chainId: 8453,
  token: "USDC",
  payoutTotal: 250,
  recipientCount: 10,
});
```

## Related

* [Payout timing & limits](https://docs.morapay.io/reference/payout-timing.md)
* [Payouts & MoMo](https://docs.morapay.io/concepts/payouts-momo.md)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.
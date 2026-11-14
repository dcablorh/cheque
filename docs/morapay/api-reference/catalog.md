> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Catalog API

> REST endpoints for countries, chains, and tokens.

Public catalog endpoints help you populate checkout UI and validate corridors **before** creating links or disbursement batches. No merchant signing required.

Base URL: `https://api.morapay.io`

## Countries

`GET /api/public/catalog/countries`

Returns **enabled** countries only. Provider flags are not exposed on the public catalog.

### Response fields

| Field | Type | Description |
| - | - | - |
| `code` | string | ISO 3166-1 alpha-2 |
| `name` | string | Country name |
| `currency` | string | ISO 4217 settlement currency |
| `enabled` | boolean | Always `true` on the public catalog |

```bash cURL theme={null}
curl -s "https://api.morapay.io/api/public/catalog/countries"
```

```json 200 OK theme={null}
{
  "success": true,
  "data": {
    "countries": [
      {
        "id": "uuid",
        "code": "GH",
        "name": "Ghana",
        "currency": "GHS",
        "enabled": true
      },
      {
        "id": "uuid",
        "code": "NG",
        "name": "Nigeria",
        "currency": "NGN",
        "enabled": true
      }
    ]
  }
}
```

See the full country list in [Countries & fiat](https://docs.morapay.io/reference/countries-and-fiat.md).

## Chains

`GET /api/public/catalog/chains`

Returns supported chains for quotes, checkout, and disbursement validation.

### Query parameters

| Parameter | Type | Description |
| - | - | - |
| `environment` | string | `TEST` or `LIVE` default `LIVE`. TEST returns testnet and offchain; LIVE returns mainnet and offchain. |

```bash cURL theme={null}
curl -s "https://api.morapay.io/api/public/catalog/chains?environment=LIVE"
```

```json 200 OK theme={null}
{
  "success": true,
  "data": {
    "environment": "LIVE",
    "chains": [
      {
        "id": "uuid",
        "chainId": "8453",
        "name": "Base",
        "networkType": "MAINNET",
        "platformManaged": false
      },
      {
        "id": "uuid",
        "chainId": "1",
        "name": "Ethereum",
        "networkType": "MAINNET",
        "platformManaged": false
      }
    ]
  }
}
```

## Tokens

`GET /api/public/catalog/tokens`

Returns **crypto checkout tokens** only. Offchain fiat sentinel tokens are excluded. Fiat checkout methods are configured separately via the fiat checkout API.

### Query parameters

| Parameter | Type | Description |
| - | - | - |
| `chain_id` | number | Filter to one chain, e.g. `8453` |
| `environment` | string | `TEST` or `LIVE` default `LIVE` |

```bash cURL theme={null}
curl -s "https://api.morapay.io/api/public/catalog/tokens?chain_id=8453&environment=LIVE"
```

```json 200 OK theme={null}
{
  "success": true,
  "data": {
    "environment": "LIVE",
    "tokens": [
      {
        "id": "uuid",
        "chainId": "8453",
        "networkName": "Base",
        "address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "symbol": "USDC",
        "decimals": 6,
        "name": "USD Coin",
        "networkType": "MAINNET"
      },
      {
        "id": "uuid",
        "chainId": "8453",
        "networkName": "Base",
        "address": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        "symbol": "ETH",
        "decimals": 18,
        "name": "Ether",
        "networkType": "MAINNET"
      }
    ]
  }
}
```

### Compact token list

`GET /api/public/tokens/list` exposes a UI-oriented shape with `displaySymbol` and `logoUri`. Same query parameters as `/tokens`.

## Errors

Catalog routes are public. Typical failures:

| HTTP | Cause |
| - | - |
| **400** | Invalid `environment` or `chain_id` query |
| **503** | Temporary upstream outage |

```json 400 Bad Request theme={null}
{
  "success": false,
  "error": "Invalid environment query.",
  "code": "request.invalid",
  "requestId": "req_cat400"
}
```

```json 503 Service Unavailable theme={null}
{
  "success": false,
  "error": "Catalog temporarily unavailable.",
  "code": "api.service_unavailable",
  "requestId": "req_cat503"
}
```

## Related

* [Chains & tokens reference](https://docs.morapay.io/reference/chains-and-tokens.md)
* [Disbursement API](https://docs.morapay.io/api-reference/disbursement.md)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.
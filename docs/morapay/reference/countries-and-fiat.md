> ## Documentation Index
> Fetch the complete documentation index at: https://docs.morapay.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Countries & fiat

> Supported countries, settlement currencies, and fiat payment methods.

Morapay supports international crypto checkout and regional fiat rails. Country availability is stored in the Morapay API catalog and exposed at `GET /api/public/catalog/countries`.

## Supported countries

Only countries with `enabled: true` appear in the public catalog.

| Code | Country | Currency | Enabled |
| - | - | - | - |
| CI | Ivory Coast | XOF | Yes |
| GH | Ghana | GHS | Yes |
| KE | Kenya | KES | Yes |
| NG | Nigeria | NGN | Yes |
| ZA | South Africa | ZAR | Yes |

## Fiat checkout methods

Mobile money, bank transfer, and card checkout are separate from crypto checkout tokens. Supported fiat methods:

| Currency | Method | Use |
| - | - | - |
| GHS | Mobile money | Checkout |
| GHS | Bank transfer | Checkout |
| NGN | Mobile money | Checkout |
| NGN | Bank transfer | Checkout |
| NGN | Card | Checkout |
| GHS | Card | Checkout |
| KES | Card | Checkout |
| ZAR | Card | Checkout |
| XOF | Card | Checkout |

## Card checkout markets

Card processing is available in these business countries:

| Country | Code | Currency |
| - | - | - |
| Nigeria | NG | NGN |
| Ghana | GH | GHS |
| Kenya | KE | KES |
| South Africa | ZA | ZAR |
| Côte d'Ivoire | CI | XOF |

## API

```bash theme={null}
curl -s "https://api.morapay.io/api/public/catalog/countries"
```

Returns enabled countries with `code`, `name`, `currency`, and `enabled`.

## Related

* [Fees, countries & taxes](https://docs.morapay.io/reference/fees-countries-taxes.md)
* [Chains & tokens](https://docs.morapay.io/reference/chains-and-tokens.md)
* [Banks & MoMo withdrawal](https://docs.morapay.io/reference/banks-and-momo.md)
* [Payout timing & limits](https://docs.morapay.io/reference/payout-timing.md)


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.
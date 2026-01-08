# NIP-XX: Enhanced Zap Tags for Payment Requests

`draft` `optional` `author:francismars` `author:pedromvpg`

## Abstract

This NIP enhances the interaction between NIP-57 (Lightning Zaps) and kind 1 (text note) events by introducing additional tags that enable flexible payment request functionality on Nostr. These tags allow users to create payment requests with configurable amounts, usage limits, fundraising goals, payer restrictions, and custom Lightning addresses. This enables use cases such as donations, crowdfunding, event ticketing, service payments, and transparent payment requests directly on the Nostr protocol.

## Motivation

While NIP-57 (Lightning Zaps) enables Lightning payments on Nostr and kind 1 events provide a platform for social content, there's no standardized way to create structured payment requests with constraints. This NIP increases the synergy between these two features by defining tags that allow kind 1 events to specify payment parameters, enabling common payment scenarios:

- **Fixed or range payments**: Allow payers to choose amounts within specified bounds
- **Usage limits**: Control how many times a payment request can be fulfilled (e.g., event tickets)
- **Fundraising goals**: Set targets and track progress toward goals
- **Payer restrictions**: Restrict payments to specific authorized payers
- **Custom payment addresses**: Override default Lightning addresses per request

These capabilities make kind 1s a viable platform for social payments, fundraising, and commerce while maintaining the protocol's decentralized and permissionless nature.

## Specification

All tags defined in this NIP are optional and should be added to `kind: 1` (text note) events. A payment request is considered valid when:

1. The event author has a Lightning address (either in their profile `lud16` field or via `zap-lnurl` tag)

Note: While `zap-min` and `zap-max` are commonly used to define payment amounts, they are not required. Payment requests can exist with only other tags (e.g., `zap-goal`, `zap-uses`) or even without any zap tags, allowing for open-ended payment requests where payers can choose any amount.

### Tags

#### `zap-min`

**Format**: `["zap-min", "<millisatoshis>"]`

Specifies the minimum payment amount in millisatoshis. Must be a positive integer string.

**Behavior**:
- If both `zap-min` and `zap-max` are present and equal, the payment is fixed at that amount
- If `zap-min` < `zap-max`, payers can choose any amount within the range
- If only `zap-min` is present, there is no maximum limit (though clients may enforce reasonable limits)
- If only `zap-max` is present, the minimum is effectively 1

**Validation**:
- Must be a positive integer string
- Recommended maximum: 21,000,000,000,000 millisatoshis (21M sats, the total Bitcoin supply)
- Clients should validate the amount is within reasonable bounds

**Example**:
```json
["zap-min", "1000000"]
```
This sets a minimum of 1,000,000 millisatoshis (1,000 sats or 0.00001 BTC).

#### `zap-max`

**Format**: `["zap-max", "<millisatoshis>"]`

Specifies the maximum payment amount in millisatoshis. Must be a positive integer string.

**Behavior**:
- Must be greater than or equal to `zap-min` if both are present
- If both `zap-min` and `zap-max` are present and equal, the payment is fixed
- If `zap-min` < `zap-max`, payers can choose any amount within the range

**Example**:
```json
["zap-max", "5000000"]
```
This sets a maximum of 5,000,000 millisatoshis (5,000 sats).

#### `zap-goal`

**Format**: `["zap-goal", "<millisatoshis>"]`

Specifies a fundraising goal amount in millisatoshis. When the cumulative total of all zaps reaches or exceeds this amount, the payment request is considered complete.

**Behavior**:
- Must be a positive integer string
- Clients should track the cumulative total of all zaps (kind 9735 events) linked to the payment request
- When the goal is reached, clients may mark the request as complete and optionally disable further payments
- The goal is independent of `zap-uses`; either condition can mark the request as complete

**Example**:
```json
["zap-goal", "100000000"]
```
This sets a fundraising goal of 100,000,000 millisatoshis (100,000 sats or 0.001 BTC).

#### `zap-uses`

**Format**: `["zap-uses", "<count>"]`

Specifies the maximum number of times the payment request can be used. Once this limit is reached, the request is considered complete.

**Behavior**:
- Must be a positive integer string
- Clients should count only zaps that meet the amount restrictions (`zap-min`/`zap-max`) and payer restrictions (`zap-payer`) if present
- Zaps should be counted in chronological order (by `created_at` timestamp)
- When the limit is reached, clients may mark the request as complete and optionally disable further payments
- The limit is independent of `zap-goal`; either condition can mark the request as complete

**Example**:
```json
["zap-uses", "10"]
```
This allows the payment request to be used up to 10 times.

#### `zap-payer`

**Format**: `["zap-payer", "<hex_pubkey>"]`

Restricts payments to a specific payer identified by their public key in hexadecimal format.

**Behavior**:
- Must be a valid 64-character hexadecimal string representing a Nostr public key
- Only zaps from the specified payer should be counted toward `zap-uses` and `zap-goal`
- Clients should validate that the payer's public key in the zap receipt (kind 9735) matches this restriction
- If a zap is attempted by a different payer, clients should reject it or show an error
- This enables use cases like authorized service payments or private transactions

**Example**:
```json
["zap-payer", "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"]
```

#### `zap-lnurl`

**Format**: `["zap-lnurl", "<lightning_address>"]`

Overrides the default Lightning address for this payment request. The Lightning address should be in the format `user@domain.com`.

**Behavior**:
- Overrides the author's `lud16` field from their profile (kind 0)
- Must be a valid Lightning address format
- Clients should use this address when generating zap invoices instead of the author's profile address
- This enables use cases where different payment requests should go to different Lightning addresses

**Example**:
```json
["zap-lnurl", "merchant@lightningprovider.com"]
```

## Client Behavior

### Creating Payment Requests

When creating a payment request event (kind 1):

1. Add `zap-min` and/or `zap-max` tags with amounts in millisatoshis
2. Optionally add `zap-goal` for fundraising goals
3. Optionally add `zap-uses` to limit the number of payments
4. Optionally add `zap-payer` to restrict to a specific payer
5. Optionally add `zap-lnurl` to override the Lightning address
6. Ensure the author has a Lightning address (in profile or via `zap-lnurl`)

### Processing Payment Requests

When processing a payment request:

1. Verify the author has a Lightning address (from profile `lud16` or `zap-lnurl` tag)
2. If `zap-min` and/or `zap-max` are present, validate payment amount against these constraints
3. Check if `zap-payer` restriction exists and validate the payer's public key
4. Count existing zaps (kind 9735 events) to check:
   - If `zap-uses` limit has been reached
   - If `zap-goal` has been reached
5. If restrictions are met, mark the request as complete and optionally disable payments

### Counting Zaps

When counting zaps for `zap-uses` and `zap-goal`:

1. Query for all kind 9735 events that reference the payment request event (via `e` tag)
2. Sort zaps by `created_at` timestamp (oldest first) for accurate counting
3. Filter zaps based on:
   - Amount restrictions: only count zaps within `zap-min`/`zap-max` range
   - Payer restrictions: if `zap-payer` is present, only count zaps from that payer
4. Count filtered zaps for `zap-uses` limit
5. Sum filtered zap amounts for `zap-goal` progress

## Examples

### Fixed Payment Request

A payment request for exactly 10,000 sats:

```json
{
  "kind": 1,
  "content": "Please pay 10,000 sats for this service.",
  "tags": [
    ["zap-min", "10000000"],
    ["zap-max", "10000000"]
  ]
}
```

### Range Payment Request

A donation request allowing any amount between 1,000 and 10,000 sats:

```json
{
  "kind": 1,
  "content": "Support my project! Any amount between 1k and 10k sats appreciated.",
  "tags": [
    ["zap-min", "1000000"],
    ["zap-max", "10000000"]
  ]
}
```

### Fundraising with Goal

A fundraising request with a goal of 100,000 sats:

```json
{
  "kind": 1,
  "content": "Help me reach my goal of 100k sats!",
  "tags": [
    ["zap-min", "1000000"],
    ["zap-max", "10000000"],
    ["zap-goal", "100000000"]
  ]
}
```

### Event Ticketing with Usage Limit

A ticket sale limited to 50 purchases:

```json
{
  "kind": 1,
  "content": "Event ticket - 5,000 sats. Limited to 50 tickets.",
  "tags": [
    ["zap-min", "5000000"],
    ["zap-max", "5000000"],
    ["zap-uses", "50"]
  ]
}
```

### Service Payment with Payer Restriction

A payment request restricted to a specific authorized payer:

```json
{
  "kind": 1,
  "content": "Payment for services rendered. Only authorized payer can complete.",
  "tags": [
    ["zap-min", "20000000"],
    ["zap-max", "20000000"],
    ["zap-payer", "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"]
  ]
}
```

### Custom Lightning Address

A payment request using a different Lightning address than the author's profile:

```json
{
  "kind": 1,
  "content": "Donate to our organization's wallet.",
  "tags": [
    ["zap-min", "1000000"],
    ["zap-max", "100000000"],
    ["zap-lnurl", "org@lightningprovider.com"]
  ]
}
```

### Complete Example

A comprehensive payment request with all features:

```json
{
  "kind": 1,
  "content": "Crowdfunding campaign: Help us build! Goal: 1M sats. Limited to 100 contributors, 10k-100k sats each.",
  "tags": [
    ["zap-min", "10000000"],
    ["zap-max", "100000000"],
    ["zap-goal", "1000000000"],
    ["zap-uses", "100"],
    ["zap-lnurl", "campaign@lightningprovider.com"]
  ]
}
```

## Backwards Compatibility

This NIP is fully backwards compatible:

- All tags are optional
- Clients that don't implement this NIP will simply ignore the tags
- Payment requests without these tags continue to work as normal zaps (NIP-57)
- Existing zap functionality (NIP-57) remains unchanged

## Implementation Notes

- Amounts are stored in millisatoshis (1 sat = 1,000 millisats) for precision
- When converting from satoshis to millisatoshis, multiply by 1,000
- When displaying to users, convert millisatoshis to satoshis by dividing by 1,000
- Clients should validate that `zap-max` >= `zap-min` when both are present
- Clients should validate that `zap-payer` is a valid 64-character hex string
- Clients should validate that `zap-lnurl` follows Lightning address format (user@domain.com)
- Amounts should be validated to be within reasonable bounds (recommended max: 21,000,000,000,000 millisatoshis)
- The `zap-uses` count should only include zaps that meet all restrictions (amount, payer)
- The `zap-goal` total should only include zaps that meet all restrictions (amount, payer)
- When checking if a payment request is complete, either `zap-uses` limit OR `zap-goal` being reached marks it as complete

## Use Cases

This NIP enables various payment scenarios:

1. **Donations**: Flexible amount donations with optional goals
2. **Crowdfunding**: Goal-based fundraising with progress tracking
3. **Event Ticketing**: Limited quantity ticket sales
4. **Service Payments**: Authorized payments for specific services
5. **Transparent Payments**: Publicly verifiable payment requests on Nostr
6. **Merchant Payments**: Custom payment addresses per transaction

## References

- [NIP-57](https://github.com/nostr-protocol/nips/blob/master/57.md): Lightning Zaps
- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md): Basic protocol flow
- [BOLT 11](https://github.com/lightning/bolts/blob/master/11-payment-encoding.md): Lightning invoice encoding

## Copyright

This NIP is placed in the public domain.


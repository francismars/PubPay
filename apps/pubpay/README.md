# PubPay

**PUBPAY.me** - Payment requests as easy as posting. Lightning payments as social as Nostr.

## What is PubPay?

Think of PubPay as Venmo meets Twitter. PubPay lets you create payment requests (we call them "paynotes") and share them like any social media post. Whether you're fundraising, splitting bills, selling products, or requesting payments for services—no complicated forms, no merchant accounts, just fast, social payments.

Built on Nostr and Lightning Network. Permissionless. Open source. Yours.

## Getting Started

### Sign In

PubPay supports multiple authentication methods:

1. **Browser Extension** (e.g., Alby)
2. **External Signer** (e.g., Amber)
3. **Private Key** (`nsec`) - Direct key-based authentication

### Create a Payment Request (Paynote)

1. Click **"New Paynote"** to open the payment form
2. Choose payment type:
   - **Fixed** - Enter a single amount
   - **Range** - Enter minimum and maximum amounts
3. Add optional parameters:
   - **Goal Amount** - Set a fundraising goal
   - **Usage limit** - How many times it can be paid
   - **Payer restriction** - Specific user's public key
   - **Custom Lightning address** - Override default address
4. Submit to publish your paynote. It's now shareable like any social media post

### Make a Payment

- **Quick Zap** - Click the payment button on any payment request
- **Send Modal** - Use the send payment modal for invoices, Lightning addresses, or Nostr users
- **Wallet Integration** - Pay via NWC, WebLN, or Lightning Wallet

### View Payments

- **Payments Page** - Two views:
  - **Wallet View** - Your balance, NWC connections, transaction history, and invoice generation
  - **Public View** - Browse all public zaps on the network
- **Feeds** - Browse payment requests in global or following feeds
- **Profiles** - View user profiles with statistics, payment history, and all their paynotes

## Use Cases

- **Donations** - Create public donation requests with flexible amounts and goal tracking
- **Fundraising** - Set fundraising goals with progress bars. Perfect for campaigns, projects, or causes
- **Service Payments** - Request payments for services with payer restrictions
- **Event Ticketing** - Sell tickets with usage limits
- **Crowdfunding** - Allow contributors to choose their donation amount with goal tracking
- **Transparent Payments** - All payment requests are publicly verifiable on Nostr

## Social
- Browse payment feeds (global and following)
- View individual notes and replies
- View and edit Nostr profiles
- Follow users to see their posts in your feed

## Security & Identity
- Multiple sign-in methods (extension, external signer, or private key)
- Encrypted key storage with device key or optional password
- Purchase and register NIP-05 identifiers (e.g., yourname@pubpay.me)
- 12-word mnemonic recovery phrase

## Additional Features
- QR code scanner for notes, profiles, invoices, and more
- Anonymous payments without login
- Dark mode support
- Relay management with read/write permissions

## How PubPay Works

### Nostr Protocol

PubPay uses the Nostr protocol, a decentralized, censorship-resistant communication protocol. Events on Nostr are structured data objects that can include metadata, content, and tags. PubPay utilizes `kind: 1` events (text notes) to represent payment requests, making them part of the social fabric of Nostr.

### Tags for Payment Metadata

Tags in Nostr events are key-value pairs that add metadata to the event. PubPay uses specific tags to define payment parameters, such as the amount, payer, and payment conditions. These tags make the payment request machine-readable and interoperable with other Nostr-based applications. Any client that understands these tags can display and process payment requests correctly.

### Public Accessibility

Payment requests are published to Nostr relays, making them publicly accessible and verifiable. Anyone with access to the relays can view and interact with the payment request. This transparency ensures accountability and allows for public verification of payments through `kind: 9735` events (zap receipts) linked to the original payment request.

## Technical Details

### Payment Request Tags

PubPay uses Nostr tags to define payment parameters. For complete specification, see the [NIP document](../NIP-XX.md).

- `zap-min` - Minimum payment amount (millisatoshis)
- `zap-max` - Maximum payment amount (millisatoshis)
- `zap-goal` - Goal amount for fundraising (millisatoshis). When reached, the payment request is marked as complete
- `zap-uses` - Number of times the request can be used
- `zap-payer` - Restrict to specific payer's public key
- `zap-lnurl` - Custom Lightning Network address

## Development

```bash
# Start development server
pnpm dev:pubpay

# Build for production
pnpm build:pubpay
```

The app will be available at `http://localhost:3000` (or the configured port).

## PWA Support

PubPay is a Progressive Web App (PWA) and can be installed on your device for offline access and improved performance.

## License

MIT License
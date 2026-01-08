# PubPay Live

**PUBPAY.me Live** - Turn any payment request into a stunning display. Real-time animations, complete visual customization, works on any screen.

## What is PubPay Live?

Imagine this: You're on stage, performing. A QR code appears on the screen behind you. Someone in the audience scans it and zaps you 100,000 sats. The screen explodes with an animation—their name, their avatar, spinning letters spelling "TOP ZAP." The audience sees it. More zaps come in. More animations. The energy builds.

PubPay Live transforms payments into a performance. It's a presentation system that turns any Nostr note into a beautiful, customizable live display with real-time Lightning payment (zap) notifications. Perfect for conferences, events, meetups, or any situation where you want payments to become part of the show.

## Key Features

### Live Event Display
- **Note Presentation** - Display any Nostr note as a full-screen presentation
- **Real-Time Updates** - Zap notifications and totals update automatically as payments come in
- **Custom Styling** - Extensive customization options for fonts, colors, layouts, and animations
- **Style URLs** - Share your customized style via URL parameters

### Real-Time Zaps
- **Animated Notifications** - Live animated notifications appear when new payments come in
- **Lightning Payments for Everyone** - No account needed—anyone with Lightning can pay
- **Multi-Currency Display** - Shows received amounts in USD, EUR, and other currencies
- **Zap Activity Feed** - See all zaps in real-time with user profiles
- **Top Zappers** - Display leaderboard of top contributors with animated highlights
- **Zap Totals** - Track total zaps and amounts received

### Style Customization
- **Visual Editor** - Intuitive style editor with live preview
- **Quick Presets** - Fast styling options for common use cases
- **Font Selection** - Choose from various font families and sizes
- **Color Themes** - Customize background, text, and accent colors
- **Layout Options** - Adjust padding, alignment, and positioning
- **Animations** - Add entrance and exit animations
- **Image Backgrounds** - Set custom background images
- **QR Code Blend Modes** - Customize how QR codes appear on your display
- **Shareable Styles** - Share your customized style via URL parameters

### Multi Live
Multi Live allows you to manage multiple Live displays. Instead of manually switching content, you schedule everything in advance. Set up time slots, and let the system automatically rotate content at the right times. Perfect for conferences with parallel tracks, or any event where you need synchronized displays across locations.

- **Schedule-Driven Displays** - Program your entire event in advance. Set time slots and let content switch automatically
- **Interactive Timeline** - Visual editor for scheduling. See slots, conflicts, and all details instantly
- **Multiple Items Per Slot** - Add several paynotes or content items that rotate automatically
- **Simulation Mode** - Rehearse your entire event. Play, pause, speed up, and jump between slots to test before going live
- **Real-Time Sync** - Keep all screens in sync instantly. No manual refresh needed—all viewers see the same content
- **Secure & Safe** - Separate admin and viewer links. Password-protected admin access keeps your schedule safe
- **Multi-Room Management** - Create and manage multiple rooms for different stages or venues from one interface

## Getting Started

### Display a Single Event

1. Navigate to `/live/:eventId` where `eventId` is a Nostr note ID (or `note1...`, `nevent1...`, etc.)
2. The note content will be displayed in presentation mode
3. Customize the style using the style editor (accessible via the settings button)
4. Share the URL with your audience

### Create a Multi Live Room

Multi Live lets you schedule content to display automatically at specific times. Perfect for events with multiple stages or when you need content to rotate without manual intervention.

1. Navigate to `/live/multi`
2. Sign in with your Nostr account
3. Click **"Create Room"**
4. Configure your room:
   - **Add Items** - Add Nostr note IDs (paynotes) that you want to display
   - **Set Rotation Policy** - Choose how multiple items rotate: round-robin (sequential), random, or weighted
   - **Schedule Time Slots** - Use the interactive timeline to set when each slot should be active. You can schedule different items for different times
5. **Test Your Schedule** - Use **Simulation Mode** to rehearse your entire event. Play, pause, speed up time, and jump between slots to verify everything works
6. **Go Live** - Share the room viewer URL (`/live/multi/:roomId`) with all your displays. They'll automatically sync and show the right content at the right time

### Customize Styles

1. Click the **style/settings button** on any live event
2. Use the visual editor to customize:
   - Fonts and typography
   - Colors and themes
   - Layout and spacing
   - Animations
   - Background images
3. Click **"Copy Style URL"** to share your customized view
4. Reset to defaults anytime

### View Zap Activity

- Zaps appear automatically in the activity feed
- Enable **"Show Top Zappers"** to display a leaderboard
- Zap notifications appear as overlays when new zaps arrive
- View zap details including amount, sender, and message

## Use Cases

- **Conferences** - Display speaker notes, schedules, or announcements
- **Live Events** - Show real-time content with zap support for donations
- **Presentations** - Turn any Nostr note into a presentation
- **Multi-Venue Events** - Use multi-room to manage content across locations
- **Fundraising** - Accept zaps during live events with real-time notifications

## Technical Details

### Supported Event Types

- `note1...` - Nostr note IDs (bech32 encoded)
- `nevent1...` - Nostr event references
- `naddr1...` - Nostr addressable events
- Raw event IDs (hex format)

### Zap Integration

PubPay Live subscribes to `kind: 9735` events (zap receipts) to display real-time payment notifications. Zaps are linked to the displayed event and show:
- Payment amount (in satoshis)
- Zapper's profile information
- Zap message/content
- Timestamp

## Development

```bash
# Start development server
pnpm dev:live

# Build for production
pnpm build:live
```

The app will be available at the configured port (typically `/live` path).

## Browser Support

- Modern browsers with ES6+ support
- HLS.js required for video streaming
- Swiper.js for content carousels

## License

MIT License


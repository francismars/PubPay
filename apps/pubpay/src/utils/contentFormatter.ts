// Content formatter utility - shared between PayNoteComponent and NewPayNoteOverlay
import * as NostrTools from 'nostr-tools';
import { getQueryClient } from '@pubpay/shared-services';
import { ensureProfiles } from '@pubpay/shared-services';

/**
 * Get user display name for npub or hex pubkey mention
 */
export async function getMentionUserName(
  pubkeyOrNpub: string,
  nostrClient?: any
): Promise<string> {
  try {
    let pubkey: string;
    let displayKey: string;

    // Check if it's a hex pubkey (64 characters)
    if (pubkeyOrNpub.length === 64 && /^[0-9a-fA-F]+$/.test(pubkeyOrNpub)) {
      pubkey = pubkeyOrNpub;
      displayKey = NostrTools.nip19.npubEncode(pubkey);
    } else {
      // Assume it's an npub/nprofile
      const decoded = NostrTools.nip19.decode(pubkeyOrNpub);
      if (decoded.type !== 'npub' && decoded.type !== 'nprofile') {
        console.error('Invalid npub format');
        return pubkeyOrNpub.length > 35
          ? `${pubkeyOrNpub.substr(0, 4)}...${pubkeyOrNpub.substr(pubkeyOrNpub.length - 4)}`
          : pubkeyOrNpub;
      }

      pubkey = decoded.type === 'npub' ? decoded.data : decoded.data.pubkey;
      displayKey = pubkeyOrNpub;
    }

    if (!nostrClient) {
      return displayKey.length > 35
        ? `${displayKey.substr(0, 4)}...${displayKey.substr(displayKey.length - 4)}`
        : displayKey;
    }

    // Use the existing profile system to get user data
    const queryClient = getQueryClient();
    const profileMap = await ensureProfiles(queryClient, nostrClient, [pubkey]);
    const profile = profileMap.get(pubkey);

    if (profile && profile.content) {
      try {
        const profileData = JSON.parse(profile.content);
        const displayName =
          profileData.display_name ||
          profileData.displayName ||
          profileData.name;
        if (displayName) {
          return displayName;
        }
      } catch (error) {
        console.error('Error parsing profile data:', error);
      }
    }

    // Fallback to shortened display key
    return displayKey.length > 35
      ? `${displayKey.substr(0, 4)}...${displayKey.substr(displayKey.length - 4)}`
      : displayKey;
  } catch (error) {
    console.error('Error in getMentionUserName:', error);
    return pubkeyOrNpub.length > 35
      ? `${pubkeyOrNpub.substr(0, 4)}...${pubkeyOrNpub.substr(pubkeyOrNpub.length - 4)}`
      : pubkeyOrNpub;
  }
}

/**
 * Format content with mentions and links (same logic as PayNoteComponent)
 */
export async function formatContent(
  content: string,
  nostrClient?: any
): Promise<string> {
  // First, handle nostr:npub mentions (only nostr: prefix, not @ or bare npub)
  const npubMatches = content.match(
    /nostr:((npub|nprofile)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})/gi
  );

  if (npubMatches) {
    const replacements = await Promise.all(
      npubMatches.map(async match => {
        const cleanMatch = match.replace(/^nostr:/i, '');
        const displayName = await getMentionUserName(cleanMatch, nostrClient);
        return {
          match,
          replacement: `<a href="/profile/${cleanMatch}" style="color: #0066cc; text-decoration: underline;">${displayName}</a>`
        };
      })
    );

    replacements.forEach(({ match, replacement }) => {
      content = content.replace(match, replacement);
    });
  }

  // Handle hex pubkey mentions (64-character hex strings)
  const hexMatches = content.match(/\b([0-9a-fA-F]{64})\b/g);

  if (hexMatches) {
    const replacements = await Promise.all(
      hexMatches.map(async match => {
        // Skip if this looks like a URL or other hex string that's not a pubkey
        if (content.includes(`http`) || content.includes(`0x${match}`)) {
          return { match, replacement: match };
        }
        
        const displayName = await getMentionUserName(match, nostrClient);
        return {
          match,
          replacement: `<a href="/profile/${match}" style="color: #0066cc; text-decoration: underline;">${displayName}</a>`
        };
      })
    );

    replacements.forEach(({ match, replacement }) => {
      content = content.replace(match, replacement);
    });
  }

  // Handle image URLs with extensions
  content = content.replace(
    /(https?:\/\/[\w\-\.~:\/?#\[\]@!$&'()*+,;=%]+)\.(gif|png|jpg|jpeg|webp)/gi,
    match =>
      `<img src="${match}" style="max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0;">`
  );

  // Handle video URLs
  content = content.replace(
    /(https?:\/\/[\w\-\.~:\/?#\[\]@!$&'()*+,;=%]+)\.(mp4|webm|ogg|mov)/gi,
    match => `<div style="position: relative; width: 100%; height: 0; padding-bottom: 56.25%; margin: 8px 0;">
        <video src="${match}" controls style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;">
          Your browser does not support the video tag.
        </video>
      </div>`
  );

  // Handle YouTube URLs
  content = content.replace(
    /(https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([\w\-]+)|https?:\/\/youtu\.be\/([\w\-]+))/gi,
    (match, p1, p2) => {
      const videoId = p2 || p1;
      return `<div style="position: relative; width: 100%; height: 0; padding-bottom: 56.25%; margin: 8px 0;">
          <iframe src="https://www.youtube.com/embed/${videoId}" 
                  style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"
                  frameborder="0" allowfullscreen>
          </iframe>
        </div>`;
    }
  );

  // Handle regular URLs (but skip if already processed as images/videos or npubs)
  content = content.replace(
    /(https?:\/\/[\w\-\.~:\/?#\[\]@!$&'()*+,;=%]+|www\.[\w\-\.~:\/?#\[\]@!$&'()*+,;=%]+)/gi,
    match => {
      // Skip if already processed as image, video, npub, or Blossom
      if (
        content.includes(`src="${match}"`) ||
        content.includes(`href="/profile/`) ||
        content.includes(`href="https://www.youtube.com/embed/`) ||
        match.includes('blossom.')
      ) {
        return match;
      }
      const url = match.startsWith('http') ? match : `http://${match}`;
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #0066cc; text-decoration: underline;">${match}</a>`;
    }
  );

  // Convert newlines to breaks
  content = content.replace(/\n/g, '<br />');

  return content;
}

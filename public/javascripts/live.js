console.log("Live.js file loaded successfully!");
console.log("NostrTools available:", typeof NostrTools !== 'undefined');
console.log("lightningPayReq available:", typeof lightningPayReq !== 'undefined');

document.addEventListener('DOMContentLoaded', function() {
    console.log("DOMContentLoaded event fired!");
    
    // Initialize portrait swiper
    initializePortraitSwiper();
    
    // Font sizes are now controlled by CSS using vw units
    // No JavaScript font size initialization needed
    
    // Get note ID from URL path instead of query parameters
    const pathParts = window.location.pathname.split('/');
    console.log("Path parts:", pathParts);
    
    let nevent = null;
    
    // Check for compound URL structures like nprofile.../live/event-id
    if (pathParts.length >= 3 && pathParts[pathParts.length - 2] === 'live') {
        // This is a compound structure: /nprofile.../live/event-id
        const nprofileId = pathParts[pathParts.length - 3];
        const eventId = pathParts[pathParts.length - 1];
        console.log("Detected compound structure - nprofile:", nprofileId, "event:", eventId);
        
        try {
            const decoded = NostrTools.nip19.decode(nprofileId);
            if (decoded.type === 'nprofile') {
                const { pubkey } = decoded.data;
                // Construct naddr1 for live event (kind 30311)
                const naddrData = {
                    identifier: eventId,
                    pubkey: pubkey,
                    kind: 30311
                };
                nevent = NostrTools.nip19.naddrEncode(naddrData);
                console.log("Constructed naddr from compound URL:", nevent);
            }
        } catch (e) {
            console.log("Error processing compound URL:", e);
        }
    }
    
    // Fallback to standard parsing if no compound structure detected
    if (!nevent) {
    const noteIdFromPath = pathParts[pathParts.length - 1]; // Get the last part of the path
    console.log("Note ID from URL path:", noteIdFromPath);
    
    // Also check for query parameters for backward compatibility
    let urlToParse = location.search;
    const params = new URLSearchParams(urlToParse);
    const noteFromQuery = params.get("note");
    
    // Use path parameter if available, otherwise fall back to query parameter
        nevent = noteIdFromPath && noteIdFromPath !== 'live' ? noteIdFromPath : noteFromQuery;
    }
    
    console.log("Using note ID:", nevent);

    // Strip nostr: protocol prefix if present
    const originalNevent = nevent;
    nevent = stripNostrPrefix(nevent);
    if (nevent !== originalNevent) {
        console.log("Stripped nostr: prefix, now:", nevent);
    }

    // Decode nevent/naddr/nprofile to preserve format in URL if present
    if (nevent) {
        try {
            const decoded = NostrTools.nip19.decode(nevent);
            if (decoded.type === 'nevent' || decoded.type === 'naddr' || decoded.type === 'nprofile') {
                // For constructed naddr from compound URL, preserve the clean naddr format
                const newUrl = '/live/' + nevent;
                window.history.replaceState({}, '', newUrl);
                console.log("Updated URL to:", newUrl);
            }
        } catch (e) {
            console.log("Error decoding identifier parameter:", e);
        }
    }

    const pool = new NostrTools.SimplePool()
    const relays = [
        'wss://relay.damus.io', 
        'wss://relay.primal.net', 
        'wss://nos.lol',
        'wss://relay.snort.social',
        'wss://relay.nostr.band'
    ]

    let json9735List = []
    
    // Global variables for live event persistence
    let currentLiveEventInfo = null;
    let reconnectionAttempts = {
        event: 0,
        chat: 0,
        zaps: 0
    };
    
    // Top zappers accounting system
    let zapperTotals = new Map(); // pubkey -> { amount: number, profile: object, name: string, picture: string }
    let topZappers = []; // Array of top 3 zappers sorted by amount
    let zapperProfiles = new Map(); // Cache for zapper profiles

    // Style options URL parameters
    const DEFAULT_STYLES = {
        textColor: '#000000',
        bgColor: '#ffffff',
        bgImage: '',
        qrInvert: false,
        qrScreenBlend: false,
        qrMultiplyBlend: false,
        qrShowWebLink: true,
        qrShowNevent: true,
        qrShowNote: true,
        layoutInvert: false,
        hideZapperContent: false,
        showTopZappers: false,  // Default to hidden
        podium: false,
        zapGrid: false,
        // fontSize: 1.0, // Disabled - using CSS vw units
        opacity: 1.0,
        textOpacity: 1.0,
        partnerLogo: ''
    };

    // Top zappers management functions
    function resetZapperTotals() {
        zapperTotals.clear();
        topZappers = [];
        hideTopZappersBar();
    }

    function addZapToTotals(pubkey, amount, profile = null) {
        console.log(`Adding zap to totals: ${pubkey}, ${amount} sats`);
        
        if (zapperTotals.has(pubkey)) {
            const existing = zapperTotals.get(pubkey);
            existing.amount += amount;
            if (profile) {
                existing.profile = profile;
                existing.name = getDisplayName(profile);
                existing.picture = profile.picture || '/images/gradient_color.gif';
            }
        } else {
            zapperTotals.set(pubkey, {
                amount: amount,
                profile: profile,
                name: profile ? getDisplayName(profile) : 'Anonymous',
                picture: profile ? (profile.picture || '/images/gradient_color.gif') : '/images/gradient_color.gif',
                pubkey: pubkey
            });
        }
        
        updateTopZappers();
    }

    function updateTopZappers() {
        // Sort zappers by total amount (highest first) and take top 5
        topZappers = Array.from(zapperTotals.values())
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5);
        
        console.log('Updated top zappers:', topZappers);
        displayTopZappers();
    }

    function displayTopZappers() {
        const topZappersBar = document.getElementById('top-zappers-bar');
        if (!topZappersBar || topZappers.length === 0) {
            hideTopZappersBar();
            return;
        }

        // Check if show top zappers is enabled
        const showTopZappersToggle = document.getElementById('showTopZappersToggle');
        if (!showTopZappersToggle || !showTopZappersToggle.checked) {
            hideTopZappersBar();
            return;
        }

        // Show the bar
        topZappersBar.style.display = 'block';

        // Update each zapper slot
        for (let i = 0; i < 5; i++) {
            const zapperElement = document.getElementById(`top-zapper-${i + 1}`);
            if (!zapperElement) continue;

            if (i < topZappers.length) {
                const zapper = topZappers[i];
                const avatar = zapperElement.querySelector('.zapper-avatar');
                const name = zapperElement.querySelector('.zapper-name');
                const total = zapperElement.querySelector('.zapper-total');

                avatar.src = zapper.picture;
                avatar.alt = zapper.name;
                name.textContent = zapper.name;
                total.textContent = `${numberWithCommas(zapper.amount)} sats`;

                zapperElement.style.opacity = '1';
                zapperElement.style.display = 'flex';
            } else {
                // Hide unused slots
                zapperElement.style.display = 'none';
            }
        }
    }

    function hideTopZappersBar() {
        const topZappersBar = document.getElementById('top-zappers-bar');
        if (topZappersBar) {
            topZappersBar.style.display = 'none';
        }
    }

    function getDisplayName(profile) {
        if (!profile) return 'Anonymous';
        return profile.displayName || profile.display_name || profile.name || 'Anonymous';
    }

    // Style presets
    const STYLE_PRESETS = {
        lightMode: {
            textColor: '#000000',
            bgColor: '#ffffff',
            bgImage: '',
            qrInvert: false,
            qrScreenBlend: false,
            qrMultiplyBlend: false,
            qrShowWebLink: true,
            qrShowNevent: true,
            qrShowNote: true,
            layoutInvert: false,
            hideZapperContent: false,
            showTopZappers: false,
            podium: false,
            zapGrid: false,
            // fontSize: 1.0, // Disabled - using CSS vw units
            opacity: 1.0,
            textOpacity: 1.0,
            partnerLogo: ''
        },
        darkMode: {
            textColor: '#ffffff',
            bgColor: '#000000',
            bgImage: '',
            qrInvert: false,
            qrScreenBlend: false,
            qrMultiplyBlend: false,
            qrShowWebLink: true,
            qrShowNevent: true,
            qrShowNote: true,
            layoutInvert: false,
            hideZapperContent: false,
            showTopZappers: false,
            podium: false,
            zapGrid: false,
            // fontSize: 1.0, // Disabled - using CSS vw units
            opacity: 1.0,
            textOpacity: 1.0,
            partnerLogo: ''
        },
        cosmic: {
            textColor: '#ffffff',
            bgColor: '#0a0a1a',
            bgImage: '/images/bitcoin-space.gif',
            qrInvert: false,
            qrScreenBlend: true,
            qrMultiplyBlend: false,
            qrShowWebLink: true,
            qrShowNevent: true,
            qrShowNote: true,
            layoutInvert: false,
            hideZapperContent: false,
            showTopZappers: false,
            podium: true,
            zapGrid: false,
            // fontSize: 1.1, // Disabled - using CSS vw units
            opacity: 0.4,
            textOpacity: 1.0
        },
        vibrant: {
            textColor: '#ffd700',
            bgColor: '#2d1b69',
            bgImage: '/images/nostr-ostriches.gif',
            qrInvert: false,
            qrScreenBlend: false,
            qrMultiplyBlend: false,
            qrShowWebLink: true,
            qrShowNevent: true,
            qrShowNote: true,
            layoutInvert: false,
            hideZapperContent: false,
            showTopZappers: false,
            podium: false,
            zapGrid: false,
            // fontSize: 1.0, // Disabled - using CSS vw units
            opacity: 0.6,
            textOpacity: 1.0
        },
        electric: {
            textColor: '#00ffff',
            bgColor: '#000033',
            bgImage: '/images/send-zaps.gif',
            qrInvert: false,
            qrScreenBlend: true,
            qrMultiplyBlend: false,
            qrShowWebLink: true,
            qrShowNevent: true,
            qrShowNote: true,
            layoutInvert: false,
            hideZapperContent: false,
            showTopZappers: false,
            podium: false,
            zapGrid: false,
            // fontSize: 1.0, // Disabled - using CSS vw units
            opacity: 0.7,
            textOpacity: 1.0
        },
        warm: {
            textColor: '#ff8c42',
            bgColor: '#2c1810',
            bgImage: '/images/bitcoin-sunset.gif',
            qrInvert: false,
            qrScreenBlend: false,
            qrMultiplyBlend: false,
            qrShowWebLink: true,
            qrShowNevent: true,
            qrShowNote: true,
            layoutInvert: false,
            hideZapperContent: false,
            showTopZappers: false,
            podium: false,
            zapGrid: false,
            // fontSize: 1.0, // Disabled - using CSS vw units
            opacity: 0.8,
            textOpacity: 1.0
        },
        adopting: {
            textColor: '#eedb5f',
            bgColor: '#05051f',
            bgImage: '/images/adopting.webp',
            qrInvert: false,
            qrScreenBlend: false,
            qrMultiplyBlend: false,
            qrShowWebLink: true,
            qrShowNevent: true,
            qrShowNote: true,
            layoutInvert: false,
            hideZapperContent: false,
            showTopZappers: false,
            podium: false,
            zapGrid: false,
            // fontSize: 1.0, // Disabled - using CSS vw units
            opacity: 0.7,
            textOpacity: 1.0,
            partnerLogo: 'https://adoptingbitcoin.org/images/AB-logo.svg'
        },
        bitcoinConf: {
            textColor: '#ffffff',
            bgColor: '#000000',
            bgImage: '/images/sky.jpg',
            qrInvert: false,
            qrScreenBlend: false,
            qrMultiplyBlend: false,
            qrShowWebLink: true,
            qrShowNevent: true,
            qrShowNote: true,
            layoutInvert: false,
            hideZapperContent: false,
            showTopZappers: false,
            podium: false,
            zapGrid: false,
            // fontSize: 1.0, // Disabled - using CSS vw units
            opacity: 0.7,
            textOpacity: 1.0,
            partnerLogo: 'https://cdn.prod.website-files.com/6488b0b0fcd2d95f6b83c9d4/653bd44cf83c3b0498c2e622_bitcoin_conference.svg'
        }
    };

    // DOM Elements for style options
    const liveElement = document.querySelector('.live');
    const qrCode = document.getElementById('qrCode');
    const bgImageUrl = document.getElementById('bgImageUrl');
    const bgImagePreview = document.getElementById('bgImagePreview');
    const clearBgImage = document.getElementById('clearBgImage');
    const liveZapOverlay = document.querySelector('.liveZapOverlay');
    const qrInvertToggle = document.getElementById('qrInvertToggle');
    const qrScreenBlendToggle = document.getElementById('qrScreenBlendToggle');
    const qrMultiplyBlendToggle = document.getElementById('qrMultiplyBlendToggle');
    const layoutInvertToggle = document.getElementById('layoutInvertToggle');
    const hideZapperContentToggle = document.getElementById('hideZapperContentToggle');
    const showTopZappersToggle = document.getElementById('showTopZappersToggle');
    const podiumToggle = document.getElementById('podiumToggle');
    const zapGridToggle = document.getElementById('zapGridToggle');
    const fontSizeSlider = document.getElementById('fontSizeSlider');
    const fontSizeValue = document.getElementById('fontSizeValue');
    const opacitySlider = document.getElementById('opacitySlider');
    const opacityValue = document.getElementById('opacityValue');
    const textOpacitySlider = document.getElementById('textOpacitySlider');
    const textOpacityValue = document.getElementById('textOpacityValue');
    const resetStylesBtn = document.getElementById('resetStyles');
    const copyStyleUrlBtn = document.getElementById('copyStyleUrl');

// Helper functions for color handling
function isValidHexColor(color) {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

function toHexColor(color) {
    // If it's already a valid hex, return it
    if (isValidHexColor(color)) {
        return color.toLowerCase();
    }
    
    // Try to parse as RGB/RGBA
    if (color.startsWith('rgb')) {
        const rgb = color.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
            const r = parseInt(rgb[0]).toString(16).padStart(2, '0');
            const g = parseInt(rgb[1]).toString(16).padStart(2, '0');
            const b = parseInt(rgb[2]).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`;
        }
    }
    
    // If we can't convert, return the default color
    return DEFAULT_STYLES.textColor;
}

function updateStyleURL() {
    const mainLayout = document.querySelector('.main-layout');
    
    if (!mainLayout) return;
    
    // Get current style values
    const partnerLogoSelect = document.getElementById('partnerLogoSelect');
    const partnerLogoUrl = document.getElementById('partnerLogoUrl');
    
    // Get the actual partner logo URL
    let currentPartnerLogo = '';
    if (partnerLogoSelect) {
        if (partnerLogoSelect.value === 'custom' && partnerLogoUrl) {
            currentPartnerLogo = partnerLogoUrl.value;
        } else {
            currentPartnerLogo = partnerLogoSelect.value;
        }
    }
    
    const styles = {
        textColor: toHexColor(mainLayout.style.getPropertyValue('--text-color') || DEFAULT_STYLES.textColor),
        bgColor: toHexColor(mainLayout.style.backgroundColor),
        bgImage: bgImageUrl.value,
        qrInvert: qrInvertToggle.checked,
        qrScreenBlend: qrScreenBlendToggle.checked,
        qrMultiplyBlend: qrMultiplyBlendToggle.checked,
        qrShowWebLink: document.getElementById('qrShowWebLinkToggle')?.checked ?? true,
        qrShowNevent: document.getElementById('qrShowNeventToggle')?.checked ?? true,
        qrShowNote: document.getElementById('qrShowNoteToggle')?.checked ?? true,
        layoutInvert: layoutInvertToggle.checked,
        hideZapperContent: hideZapperContentToggle.checked,
        showTopZappers: showTopZappersToggle.checked,
        podium: podiumToggle.checked,
        zapGrid: zapGridToggle.checked,
        // fontSize: parseFloat(fontSizeSlider.value), // Disabled - using CSS vw units
        opacity: parseFloat(opacitySlider.value),
        textOpacity: parseFloat(textOpacitySlider.value),
        partnerLogo: currentPartnerLogo
    };
    
    // Store styles in localStorage instead of URL
    localStorage.setItem('nostrpay-styles', JSON.stringify(styles));
    console.log('Saving styles to localStorage:', styles);
    
    // Keep URL clean - no style parameters
    const pathParts = window.location.pathname.split('/');
    const noteId = pathParts[pathParts.length - 1];
    const cleanUrl = noteId && noteId !== 'live' ? `/live/${noteId}` : '/live';
    
    if (window.location.href !== window.location.origin + cleanUrl) {
        window.history.replaceState({}, '', cleanUrl);
    }
}

function applyStylesFromURL() {
    const mainLayout = document.querySelector('.main-layout');
    if (!mainLayout) return;
    
    const params = new URLSearchParams(window.location.search);
    if (params.toString() === '') return; // No URL parameters
    
    // Apply text color
    if (params.has('textColor')) {
        const color = params.get('textColor');
        mainLayout.style.setProperty('--text-color', color);
        const textColorInput = document.getElementById('textColorPicker');
        if (textColorInput) textColorInput.value = color;
    }
    
    // Apply background color
    if (params.has('bgColor')) {
        const color = params.get('bgColor');
        const opacity = params.has('opacity') ? parseFloat(params.get('opacity')) : DEFAULT_STYLES.opacity;
        const rgbaColor = hexToRgba(color, opacity);
        mainLayout.style.backgroundColor = rgbaColor;
        const bgColorInput = document.getElementById('bgColorPicker');
        if (bgColorInput) bgColorInput.value = color;
    }
    
    // Apply background image
    if (params.has('bgImage')) {
        const imageUrl = params.get('bgImage');
        const bgImageUrl = document.getElementById('bgImageUrl');
        if (bgImageUrl) {
            bgImageUrl.value = imageUrl;
            updateBackgroundImage(imageUrl);
        }
    }
    
    // Apply QR code invert
    if (params.has('qrInvert')) {
        const invert = params.get('qrInvert') === 'true';
        const qrInvertToggle = document.getElementById('qrInvertToggle');
        if (qrInvertToggle) qrInvertToggle.checked = invert;
        const qrCodes = [
            document.getElementById('qrCode'),
            document.getElementById('qrCodeNevent'),
            document.getElementById('qrCodeNote')
        ];
        qrCodes.forEach(qrCode => {
            if (qrCode) qrCode.style.filter = invert ? 'invert(1)' : 'none';
        });
    }
    
    // Apply QR code blend modes
    if (params.has('qrScreenBlend')) {
        const qrScreenBlendToggle = document.getElementById('qrScreenBlendToggle');
        if (qrScreenBlendToggle) qrScreenBlendToggle.checked = params.get('qrScreenBlend') === 'true';
    }
    if (params.has('qrMultiplyBlend')) {
        const qrMultiplyBlendToggle = document.getElementById('qrMultiplyBlendToggle');
        if (qrMultiplyBlendToggle) qrMultiplyBlendToggle.checked = params.get('qrMultiplyBlend') === 'true';
    }
    
    // Update blend mode after setting toggles
    if (params.has('qrScreenBlend') || params.has('qrMultiplyBlend')) {
        updateBlendMode();
    }
    
    // Apply QR slide visibility
    if (params.has('qrShowWebLink')) {
        const show = params.get('qrShowWebLink') === 'true';
        const toggle = document.getElementById('qrShowWebLinkToggle');
        if (toggle) toggle.checked = show;
    }
    if (params.has('qrShowNevent')) {
        const show = params.get('qrShowNevent') === 'true';
        const toggle = document.getElementById('qrShowNeventToggle');
        if (toggle) toggle.checked = show;
    }
    if (params.has('qrShowNote')) {
        const show = params.get('qrShowNote') === 'true';
        const toggle = document.getElementById('qrShowNoteToggle');
        if (toggle) toggle.checked = show;
    }
    
    // Apply layout invert
    if (params.has('layoutInvert')) {
        const invert = params.get('layoutInvert') === 'true';
        const layoutInvertToggle = document.getElementById('layoutInvertToggle');
        if (layoutInvertToggle) layoutInvertToggle.checked = invert;
        document.body.classList.toggle('flex-direction-invert', invert);
    }
    
    // Apply hide zapper content
    if (params.has('hideZapperContent')) {
        const hide = params.get('hideZapperContent') === 'true';
        const hideZapperContentToggle = document.getElementById('hideZapperContentToggle');
        if (hideZapperContentToggle) hideZapperContentToggle.checked = hide;
        document.body.classList.toggle('hide-zapper-content', hide);
    }
    
    // Apply show top zappers
    if (params.has('showTopZappers')) {
        const show = params.get('showTopZappers') === 'true';
        const showTopZappersToggle = document.getElementById('showTopZappersToggle');
        if (showTopZappersToggle) showTopZappersToggle.checked = show;
        document.body.classList.toggle('show-top-zappers', show);
    }
    
    // Apply podium
    if (params.has('podium')) {
        const podium = params.get('podium') === 'true';
        const podiumToggle = document.getElementById('podiumToggle');
        if (podiumToggle) podiumToggle.checked = podium;
        document.body.classList.toggle('podium-enabled', podium);
    }
    
    // Apply zap grid
    if (params.has('zapGrid')) {
        const zapGrid = params.get('zapGrid') === 'true';
        const zapGridToggle = document.getElementById('zapGridToggle');
        if (zapGridToggle) zapGridToggle.checked = zapGrid;
        const zapsList = document.getElementById('zaps');
        if (zapsList) {
            zapsList.classList.toggle('grid-layout', zapGrid);
            if (zapGrid) {
                organizeZapsHierarchically();
            } else {
                cleanupHierarchicalOrganization();
            }
        }
    }
    
    // Font size disabled - using CSS vw units
    // if (params.has('fontSize')) {
    //     const fontSize = parseFloat(params.get('fontSize'));
    //     const fontSizeSlider = document.getElementById('fontSizeSlider');
    //     const fontSizeValue = document.getElementById('fontSizeValue');
    //     if (fontSizeSlider) fontSizeSlider.value = fontSize;
    //     if (fontSizeValue) fontSizeValue.textContent = Math.round(fontSize * 100) + '%';
    // }
    
    // Apply opacity
    if (params.has('opacity')) {
        const opacity = parseFloat(params.get('opacity'));
        const opacitySlider = document.getElementById('opacitySlider');
        const opacityValue = document.getElementById('opacityValue');
        if (opacitySlider) opacitySlider.value = opacity;
        if (opacityValue) opacityValue.textContent = Math.round(opacity * 100) + '%';
    }
    
    // Apply text opacity
    if (params.has('textOpacity')) {
        const textOpacity = parseFloat(params.get('textOpacity'));
        const textOpacitySlider = document.getElementById('textOpacitySlider');
        const textOpacityValue = document.getElementById('textOpacityValue');
        if (textOpacitySlider) textOpacitySlider.value = textOpacity;
        if (textOpacityValue) textOpacityValue.textContent = Math.round(textOpacity * 100) + '%';
    }
    
    // Apply partner logo from URL
    if (params.has('partnerLogo')) {
        const partnerLogoUrl = decodeURIComponent(params.get('partnerLogo'));
        const partnerLogoSelect = document.getElementById('partnerLogoSelect');
        const partnerLogoImg = document.getElementById('partnerLogo');
        const partnerLogoUrlInput = document.getElementById('partnerLogoUrl');
        const customPartnerLogoGroup = document.getElementById('customPartnerLogoGroup');
        const partnerLogoPreview = document.getElementById('partnerLogoPreview');
        
        if (partnerLogoUrl) {
            // Check if it's one of the predefined options
            const matchingOption = Array.from(partnerLogoSelect.options).find(option => option.value === partnerLogoUrl);
            if (matchingOption) {
                // It's a predefined logo
                if (partnerLogoSelect) partnerLogoSelect.value = partnerLogoUrl;
                if (customPartnerLogoGroup) customPartnerLogoGroup.style.display = 'none';
            } else {
                // It's a custom URL
                if (partnerLogoSelect) partnerLogoSelect.value = 'custom';
                if (customPartnerLogoGroup) customPartnerLogoGroup.style.display = 'block';
                if (partnerLogoUrlInput) partnerLogoUrlInput.value = partnerLogoUrl;
            }
            
            // Set the actual logo
            if (partnerLogoImg) {
                partnerLogoImg.src = partnerLogoUrl;
                partnerLogoImg.style.display = 'inline-block';
            }
            
            // Update preview
            if (partnerLogoPreview) {
                partnerLogoPreview.src = partnerLogoUrl;
                partnerLogoPreview.alt = 'Partner logo preview';
            }
        } else {
            // No logo
            if (partnerLogoSelect) partnerLogoSelect.value = '';
            if (customPartnerLogoGroup) customPartnerLogoGroup.style.display = 'none';
            if (partnerLogoImg) {
                partnerLogoImg.style.display = 'none';
                partnerLogoImg.src = '';
            }
            if (partnerLogoPreview) {
                partnerLogoPreview.src = '';
                partnerLogoPreview.alt = 'No partner logo';
            }
        }
    }
    
    // Apply all styles to ensure everything is synchronized
    applyAllStyles();
}

function applyStylesFromLocalStorage() {
    const mainLayout = document.querySelector('.main-layout');
    
    if (!mainLayout) return;
    
    // Only apply localStorage styles if there are no URL parameters
    const params = new URLSearchParams(window.location.search);
    if (params.toString() !== '') {
        // URL parameters take precedence, skip localStorage
        return;
    }
    
    // Load styles from localStorage
    const savedStyles = localStorage.getItem('nostrpay-styles');
    if (!savedStyles) {
        // Apply default styles if no saved styles
        applyAllStyles();
        return;
    }
    
    try {
        const styles = JSON.parse(savedStyles);
        console.log('Loading styles from localStorage:', styles);
        
        // Apply text color
        if (styles.textColor) {
            mainLayout.style.setProperty('--text-color', styles.textColor);
            const textColorInput = document.getElementById('textColorPicker');
            const textColorValue = document.getElementById('textColorValue');
            if (textColorInput) textColorInput.value = styles.textColor;
            if (textColorValue) textColorValue.value = styles.textColor;
    }
    
    // Apply background color
        if (styles.bgColor) {
            const rgbaColor = hexToRgba(styles.bgColor, styles.opacity || DEFAULT_STYLES.opacity);
        mainLayout.style.backgroundColor = rgbaColor;
            const bgColorInput = document.getElementById('bgColorPicker');
            const bgColorValue = document.getElementById('bgColorValue');
            if (bgColorInput) bgColorInput.value = styles.bgColor;
            if (bgColorValue) bgColorValue.value = styles.bgColor;
    }
    
    // Apply background image
        if (styles.bgImage) {
            const bgImageUrl = document.getElementById('bgImageUrl');
            if (bgImageUrl) {
                bgImageUrl.value = styles.bgImage;
                updateBackgroundImage(styles.bgImage);
                
                // Set the preset dropdown to match
        const bgImagePreset = document.getElementById('bgImagePreset');
        const customUrlGroup = document.getElementById('customUrlGroup');
        const bgPresetPreview = document.getElementById('bgPresetPreview');
        
                const matchingOption = bgImagePreset.querySelector(`option[value="${styles.bgImage}"]`);
        if (matchingOption) {
                    bgImagePreset.value = styles.bgImage;
            customUrlGroup.style.display = 'none';
                    bgPresetPreview.src = styles.bgImage;
            bgPresetPreview.alt = 'Background preview';
        } else {
            bgImagePreset.value = 'custom';
            customUrlGroup.style.display = 'block';
            }
        }
    }
    
    // Apply QR code invert
        if (styles.qrInvert !== undefined) {
            const qrInvertToggle = document.getElementById('qrInvertToggle');
            if (qrInvertToggle) qrInvertToggle.checked = styles.qrInvert;
        const qrCodeContainer = document.getElementById('qrCode');
        if (qrCodeContainer) {
                qrCodeContainer.style.filter = styles.qrInvert ? 'invert(1)' : 'none';
            }
        }
        
        // Apply QR code blend modes
        if (styles.qrScreenBlend !== undefined) {
            const qrScreenBlendToggle = document.getElementById('qrScreenBlendToggle');
            if (qrScreenBlendToggle) qrScreenBlendToggle.checked = styles.qrScreenBlend;
        }
        if (styles.qrMultiplyBlend !== undefined) {
            const qrMultiplyBlendToggle = document.getElementById('qrMultiplyBlendToggle');
            if (qrMultiplyBlendToggle) qrMultiplyBlendToggle.checked = styles.qrMultiplyBlend;
        }
        
        // Update blend mode after setting toggles
        if (styles.qrScreenBlend !== undefined || styles.qrMultiplyBlend !== undefined) {
            updateBlendMode();
        }
        
        // Apply QR slide visibility
        if (styles.qrShowWebLink !== undefined) {
            const toggle = document.getElementById('qrShowWebLinkToggle');
            if (toggle) toggle.checked = styles.qrShowWebLink;
        }
        if (styles.qrShowNevent !== undefined) {
            const toggle = document.getElementById('qrShowNeventToggle');
            if (toggle) toggle.checked = styles.qrShowNevent;
        }
        if (styles.qrShowNote !== undefined) {
            const toggle = document.getElementById('qrShowNoteToggle');
            if (toggle) toggle.checked = styles.qrShowNote;
        }
        
        // Update QR slide visibility after loading settings
        const updateQRSlideVisibilityFunc = window.updateQRSlideVisibility;
        if (updateQRSlideVisibilityFunc && typeof updateQRSlideVisibilityFunc === 'function') {
            updateQRSlideVisibilityFunc(true); // Skip URL update during initialization
        }
    
    // Apply layout invert
        if (styles.layoutInvert !== undefined) {
            const layoutInvertToggle = document.getElementById('layoutInvertToggle');
            if (layoutInvertToggle) layoutInvertToggle.checked = styles.layoutInvert;
            document.body.classList.toggle('flex-direction-invert', styles.layoutInvert);
        }
        
        // Apply hide zapper content
        if (styles.hideZapperContent !== undefined) {
            const hideZapperContentToggle = document.getElementById('hideZapperContentToggle');
            if (hideZapperContentToggle) hideZapperContentToggle.checked = styles.hideZapperContent;
            document.body.classList.toggle('hide-zapper-content', styles.hideZapperContent);
        }
        
        // Apply show top zappers
        if (styles.showTopZappers !== undefined) {
            const showTopZappersToggle = document.getElementById('showTopZappersToggle');
            if (showTopZappersToggle) showTopZappersToggle.checked = styles.showTopZappers;
            document.body.classList.toggle('show-top-zappers', styles.showTopZappers);
        }
        
        // Apply podium
        if (styles.podium !== undefined) {
            const podiumToggle = document.getElementById('podiumToggle');
            if (podiumToggle) podiumToggle.checked = styles.podium;
            document.body.classList.toggle('podium-enabled', styles.podium);
        }
        
        // Apply zap grid
        if (styles.zapGrid !== undefined) {
            const zapGridToggle = document.getElementById('zapGridToggle');
            if (zapGridToggle) zapGridToggle.checked = styles.zapGrid;
            const zapsList = document.getElementById('zaps');
            if (zapsList) {
                zapsList.classList.toggle('grid-layout', styles.zapGrid);
                if (styles.zapGrid) {
                    organizeZapsHierarchically();
                } else {
                    cleanupHierarchicalOrganization();
                }
            }
        }
    
    // Font size disabled - using CSS vw units
    // if (styles.fontSize !== undefined) {
    //     const fontSizeSlider = document.getElementById('fontSizeSlider');
    //     const fontSizeValue = document.getElementById('fontSizeValue');
    //     if (fontSizeSlider) fontSizeSlider.value = styles.fontSize;
    //     if (fontSizeValue) fontSizeValue.textContent = Math.round(styles.fontSize * 100) + '%';
    // }
    
    // Apply opacity
        if (styles.opacity !== undefined) {
            const opacitySlider = document.getElementById('opacitySlider');
            const opacityValue = document.getElementById('opacityValue');
            if (opacitySlider) opacitySlider.value = styles.opacity;
            if (opacityValue) opacityValue.textContent = Math.round(styles.opacity * 100) + '%';
    }
    
    // Apply text opacity
        if (styles.textOpacity !== undefined) {
            const textOpacitySlider = document.getElementById('textOpacitySlider');
            const textOpacityValue = document.getElementById('textOpacityValue');
            if (textOpacitySlider) textOpacitySlider.value = styles.textOpacity;
            if (textOpacityValue) textOpacityValue.textContent = Math.round(styles.textOpacity * 100) + '%';
        }
        
        // Apply partner logo
        if (styles.partnerLogo !== undefined) {
            const partnerLogoSelect = document.getElementById('partnerLogoSelect');
            const partnerLogoImg = document.getElementById('partnerLogo');
            const partnerLogoUrl = document.getElementById('partnerLogoUrl');
            const customPartnerLogoGroup = document.getElementById('customPartnerLogoGroup');
            const partnerLogoPreview = document.getElementById('partnerLogoPreview');
            
            if (styles.partnerLogo) {
                // Check if it's one of the predefined options
                const matchingOption = Array.from(partnerLogoSelect.options).find(option => option.value === styles.partnerLogo);
                if (matchingOption) {
                    // It's a predefined logo
                    if (partnerLogoSelect) partnerLogoSelect.value = styles.partnerLogo;
                    if (customPartnerLogoGroup) customPartnerLogoGroup.style.display = 'none';
                } else {
                    // It's a custom URL
                    if (partnerLogoSelect) partnerLogoSelect.value = 'custom';
                    if (customPartnerLogoGroup) customPartnerLogoGroup.style.display = 'block';
                    if (partnerLogoUrl) partnerLogoUrl.value = styles.partnerLogo;
                }
                
                // Set the actual logo
                if (partnerLogoImg) {
                    partnerLogoImg.src = styles.partnerLogo;
                    partnerLogoImg.style.display = 'inline-block';
                }
                
                // Update preview
                if (partnerLogoPreview) {
                    partnerLogoPreview.src = styles.partnerLogo;
                    partnerLogoPreview.alt = 'Partner logo preview';
                }
            } else {
                // No logo
                if (partnerLogoSelect) partnerLogoSelect.value = '';
                if (customPartnerLogoGroup) customPartnerLogoGroup.style.display = 'none';
                if (partnerLogoUrl) partnerLogoUrl.value = '';
                if (partnerLogoImg) {
                    partnerLogoImg.style.display = 'none';
                    partnerLogoImg.src = '';
                }
                if (partnerLogoPreview) {
                    partnerLogoPreview.src = '';
                    partnerLogoPreview.alt = 'No partner logo';
                }
            }
        }
        
        // Apply all styles to ensure everything is synchronized
        // Use a small delay to ensure all DOM elements are properly updated
        setTimeout(() => {
            applyAllStyles();
        }, 50);
        
    } catch (e) {
        console.error('Error loading styles from localStorage:', e);
        // Fall back to default styles
        applyAllStyles();
    }
}

function validateNoteId(noteId) {
    // Check if noteId is empty or just whitespace
    if (!noteId || noteId.trim() === '') {
        throw new Error('Please enter a note ID');
    }
    
    // Trim whitespace
    noteId = noteId.trim();
    
    // Check if it's a valid NIP-19 format (starts with note1, nevent1, naddr1, or nprofile1)
    if (!noteId.startsWith('note1') && !noteId.startsWith('nevent1') && !noteId.startsWith('naddr1') && !noteId.startsWith('nprofile1')) {
        throw new Error('Invalid format. Please enter a valid nostr note ID (note1...), event ID (nevent1...), addressable event (naddr1...), or profile (nprofile1...)');
    }
    
    // Validate Bech32 format according to NIP-19
    try {
        const decoded = NostrTools.nip19.decode(noteId);
        
        // Validate decoded structure
        if (decoded.type === 'note') {
            // For note1: should have a 32-byte hex string
            if (!decoded.data || typeof decoded.data !== 'string' || decoded.data.length !== 64) {
                throw new Error('Invalid note ID format');
            }
        } else if (decoded.type === 'nevent') {
            // For nevent1: should have an id field with 32-byte hex string
            if (!decoded.data || !decoded.data.id || typeof decoded.data.id !== 'string' || decoded.data.id.length !== 64) {
                throw new Error('Invalid event ID format');
            }
        } else if (decoded.type === 'naddr') {
            // For naddr1: should have identifier, pubkey, and kind fields
            if (!decoded.data || !decoded.data.identifier || !decoded.data.pubkey || typeof decoded.data.kind !== 'number') {
                throw new Error('Invalid addressable event format');
            }
            // Validate it's a live event kind
            if (decoded.data.kind !== 30311) {
                throw new Error('Only live events (kind 30311) are supported');
            }
        } else if (decoded.type === 'nprofile') {
            // For nprofile1: should have pubkey field
            if (!decoded.data || !decoded.data.pubkey) {
                throw new Error('Invalid profile format');
            }
        } else {
            throw new Error('Unsupported identifier type');
        }
        
        return true;
    } catch (error) {
        if (error.message.includes('Invalid') || error.message.includes('Unsupported')) {
            throw new Error('Invalid nostr identifier format. Please check the note ID and try again.');;
        }
        throw new Error('Invalid nostr identifier format. Please check the note ID and try again.');
    }
}

function loadNoteContent(noteId) {
    console.log("Loading note content for:", noteId);
    
    // Re-enable grid toggle for regular notes (not live events)
    enableGridToggle();
    
    // Reset zapper totals for new content
    resetZapperTotals();
    
    // Strip nostr: protocol prefix if present before validation
    const originalNoteId = noteId;
    noteId = stripNostrPrefix(noteId);
    if (noteId !== originalNoteId) {
        console.log("Stripped nostr: prefix in loadNoteContent, now:", noteId);
    }
    
    // Validate the note ID after stripping prefix
    try {
        validateNoteId(noteId);
    } catch (error) {
        showLoadingError(error.message);
        return;
    }
    
    try {
        const decoded = NostrTools.nip19.decode(noteId);
        console.log("Decoded note:", decoded);
        let kind1ID;
        
        if (decoded.type === 'nevent') {
            kind1ID = decoded.data.id;
        } else if (decoded.type === 'note') {
            kind1ID = decoded.data;
        } else {
            throw new Error('Invalid nostr identifier format.');
        }
        
        // Show loading animations
        const noteContent = document.querySelector('.note-content');
        const zapsList = document.getElementById('zaps');
        
        if (noteContent) {
            noteContent.classList.add('loading');
            // Add loading text if not already present
            if (!noteContent.querySelector('.loading-text')) {
                const loadingText = document.createElement('div');
                loadingText.className = 'loading-text';
                loadingText.textContent = 'Loading note content...';
                noteContent.appendChild(loadingText);
            }
        }
        
        if (zapsList) {
            zapsList.classList.add('loading');
            // Add loading text if not already present
            if (!zapsList.querySelector('.loading-text')) {
                const loadingText = document.createElement('div');
                loadingText.className = 'loading-text';
                loadingText.textContent = 'Loading zaps...';
                zapsList.appendChild(loadingText);
            }
        }
        
        subscribeKind1(kind1ID);
        document.getElementById('noteLoaderContainer').style.display = 'none';
    } catch (e) {
        console.log("Error loading note from URL:", e);
        // If decoding fails, try to use the input directly as a note ID
        
        // Show loading animations
        const noteContent = document.querySelector('.note-content');
        const zapsList = document.getElementById('zaps');
        
        if (noteContent) {
            noteContent.classList.add('loading');
            if (!noteContent.querySelector('.loading-text')) {
                const loadingText = document.createElement('div');
                loadingText.className = 'loading-text';
                loadingText.textContent = 'Loading note content...';
                noteContent.appendChild(loadingText);
            }
        }
        
        if (zapsList) {
            zapsList.classList.add('loading');
            if (!zapsList.querySelector('.loading-text')) {
                const loadingText = document.createElement('div');
                loadingText.className = 'loading-text';
                loadingText.textContent = 'Loading zaps...';
                zapsList.appendChild(loadingText);
            }
        }
        
        subscribeKind1(noteId);
        document.getElementById('noteLoaderContainer').style.display = 'none';
    }
}

function loadLiveEvent(naddr) {
    console.log("Loading live event for:", naddr);
    
    // Reset zapper totals for new live event
    resetZapperTotals();
    
    // Strip nostr: protocol prefix if present before validation
    const originalNaddr = naddr;
    naddr = stripNostrPrefix(naddr);
    if (naddr !== originalNaddr) {
        console.log("Stripped nostr: prefix in loadLiveEvent, now:", naddr);
    }
    
    // Validate the naddr after stripping prefix
    try {
        validateNoteId(naddr);
    } catch (error) {
        showLoadingError(error.message);
        return;
    }
    
    try {
        const decoded = NostrTools.nip19.decode(naddr);
        console.log("Decoded live event:", decoded);
        
        if (decoded.type !== 'naddr') {
            throw new Error('Invalid live event identifier format.');
        }
        
        const { identifier, pubkey, kind } = decoded.data;
        
        // Show loading animations
        const noteContent = document.querySelector('.note-content');
        const zapsList = document.getElementById('zaps');
        
        if (noteContent) {
            noteContent.classList.add('loading');
            if (!noteContent.querySelector('.loading-text')) {
                const loadingText = document.createElement('div');
                loadingText.className = 'loading-text';
                loadingText.textContent = 'Loading live event...';
                noteContent.appendChild(loadingText);
            }
        }
        
        if (zapsList) {
            zapsList.classList.add('loading');
            if (!zapsList.querySelector('.loading-text')) {
                const loadingText = document.createElement('div');
                loadingText.className = 'loading-text';
                loadingText.textContent = 'Loading live activity...';
                zapsList.appendChild(loadingText);
            }
        }
        
        // Store current live event info for reconnection
        currentLiveEventInfo = { pubkey, identifier, kind };
        
        // Reset reconnection attempts
        reconnectionAttempts = { event: 0, chat: 0, zaps: 0 };
        
        // Subscribe to the live event, chat, and zaps
        subscribeLiveEvent(pubkey, identifier, kind);
        subscribeLiveChat(pubkey, identifier);
        subscribeLiveEventZaps(pubkey, identifier);
        
        document.getElementById('noteLoaderContainer').style.display = 'none';
    } catch (e) {
        console.log("Error loading live event from URL:", e);
        showLoadingError("Failed to load live event. Please check the identifier and try again.");
    }
}

function loadProfile(nprofile) {
    console.log("Loading profile for:", nprofile);
    
    // Strip nostr: protocol prefix if present before validation
    const originalNprofile = nprofile;
    nprofile = stripNostrPrefix(nprofile);
    if (nprofile !== originalNprofile) {
        console.log("Stripped nostr: prefix in loadProfile, now:", nprofile);
    }
    
    // Validate the nprofile after stripping prefix
    try {
        validateNoteId(nprofile);
    } catch (error) {
        showLoadingError(error.message);
        return;
    }
    
    try {
        const decoded = NostrTools.nip19.decode(nprofile);
        console.log("Decoded profile:", decoded);
        
        if (decoded.type !== 'nprofile') {
            throw new Error('Invalid profile identifier format.');
        }
        
        const { pubkey } = decoded.data;
        
        // Show loading animations
        const noteContent = document.querySelector('.note-content');
        const zapsList = document.getElementById('zaps');
        
        if (noteContent) {
            noteContent.classList.add('loading');
            if (!noteContent.querySelector('.loading-text')) {
                const loadingText = document.createElement('div');
                loadingText.className = 'loading-text';
                loadingText.textContent = 'Loading profile...';
                noteContent.appendChild(loadingText);
            }
        }
        
        if (zapsList) {
            zapsList.classList.add('loading');
            if (!zapsList.querySelector('.loading-text')) {
                const loadingText = document.createElement('div');
                loadingText.className = 'loading-text';
                loadingText.textContent = 'Loading profile activity...';
                zapsList.appendChild(loadingText);
            }
        }
        
        // Load profile content
        loadProfileContent(pubkey);
        
        document.getElementById('noteLoaderContainer').style.display = 'none';
    } catch (e) {
        console.log("Error loading profile from URL:", e);
        showLoadingError("Failed to load profile. Please check the identifier and try again.");
    }
}

function loadProfileContent(pubkey) {
    console.log("Loading profile content for pubkey:", pubkey);
    
    // Subscribe to user's profile (kind 0)
    subscribeProfileInfo(pubkey);
    
    // Subscribe to user's recent notes (kind 1)
    subscribeProfileNotes(pubkey);
}

async function subscribeProfileInfo(pubkey) {
    console.log("Subscribing to profile info for:", pubkey);
    
    let filter = {
        kinds: [0], // Profile kind
        authors: [pubkey]
    };
    
    const sub = pool.subscribeMany(relays, [filter], {
        onevent(profile) {
            console.log("Received profile info:", profile);
            displayProfileInfo(profile);
        },
        oneose() {
            console.log("subscribeProfileInfo() EOS");
        },
        onclosed() {
            console.log("subscribeProfileInfo() Closed");
        }
    });
}

async function subscribeProfileNotes(pubkey) {
    console.log("Subscribing to profile notes for:", pubkey);
    
    let filter = {
        kinds: [1], // Text note kind
        authors: [pubkey],
        limit: 20 // Get recent 20 notes
    };
    
    const sub = pool.subscribeMany(relays, [filter], {
        onevent(note) {
            console.log("Received profile note:", note);
            displayProfileNote(note);
        },
        oneose() {
            console.log("subscribeProfileNotes() EOS");
        },
        onclosed() {
            console.log("subscribeProfileNotes() Closed");
        }
    });
}

function displayProfileInfo(profile) {
    console.log("Displaying profile info:", profile);
    
    const noteContent = document.querySelector('.note-content');
    noteContent.classList.remove('loading');
    const loadingText = noteContent.querySelector('.loading-text');
    if (loadingText) loadingText.remove();
    
    const profileData = JSON.parse(profile.content || '{}');
    const name = profileData.display_name || profileData.displayName || profileData.name || 'Anonymous';
    const about = profileData.about || '';
    const picture = profileData.picture || "/images/gradient_color.gif";
    const nip05 = profileData.nip05 || '';
    
    // Update author info
    document.getElementById("authorName").innerText = name;
    document.getElementById("authorNameProfileImg").src = picture;
    
    // Update note content area with profile info
    noteContent.innerHTML = `
        <div class="profile-content">
            ${about ? `<p class="profile-about">${about}</p>` : ''}
            ${nip05 ? `<div class="profile-nip05">✓ ${nip05}</div>` : ''}
            <div class="profile-stats">
                <div class="profile-pubkey">
                    <strong>Public Key:</strong><br>
                    <code>${profile.pubkey}</code>
                </div>
            </div>
        </div>
    `;
    
    // Store profile info globally
    window.currentProfile = profile;
    window.currentEventType = 'profile';
}

function displayProfileNote(note) {
    console.log("Displaying profile note:", note);
    
    const zapsList = document.getElementById('zaps');
    zapsList.classList.remove('loading');
    const loadingText = zapsList.querySelector('.loading-text');
    if (loadingText) loadingText.remove();
    
    // Create note element
    const noteDiv = document.createElement("div");
    noteDiv.className = "profile-note";
    noteDiv.dataset.timestamp = note.created_at;
    
    const timeStr = new Date(note.created_at * 1000).toLocaleString();
    
    noteDiv.innerHTML = `
        <div class="note-timestamp">${timeStr}</div>
        <div class="note-content-text">${note.content}</div>
    `;
    
    // Insert note in chronological order (newest first)
    const existingNotes = Array.from(zapsList.querySelectorAll('.profile-note'));
    const insertPosition = existingNotes.findIndex(n => 
        parseInt(n.dataset.timestamp) < note.created_at
    );
    
    if (insertPosition === -1) {
        zapsList.appendChild(noteDiv);
    } else {
        zapsList.insertBefore(noteDiv, existingNotes[insertPosition]);
    }
}

if(nevent){
    console.log("Identifier found in URL, attempting to load:", nevent);
    // Validate identifier before loading
    try {
        validateNoteId(nevent);
        
        // Determine the type and route to appropriate loader
        const decoded = NostrTools.nip19.decode(nevent);
        if (decoded.type === 'naddr') {
            loadLiveEvent(nevent);
        } else if (decoded.type === 'nprofile') {
            loadProfile(nevent);
        } else {
        loadNoteContent(nevent);
        }
    } catch (error) {
        console.log("Invalid identifier in URL:", error.message);
        showLoadingError(error.message);
    }
    // Duplicate code removed - using loadNoteContent function instead
    /*
    try {
        const decoded = NostrTools.nip19.decode(nevent);
        console.log("Decoded note:", decoded);
        let kind1ID;
        
        if (decoded.type === 'nevent') {
            kind1ID = decoded.data.id;
        } else if (decoded.type === 'note') {
            kind1ID = decoded.data;
        } else {
            throw new Error('Invalid format');
        }
        
        // Show loading animations
        const noteContent = document.querySelector('.note-content');
        const zapsList = document.getElementById('zaps');
        
        if (noteContent) {
            noteContent.classList.add('loading');
            // Add loading text if not already present
            if (!noteContent.querySelector('.loading-text')) {
                const loadingText = document.createElement('div');
                loadingText.className = 'loading-text';
                loadingText.textContent = 'Loading note content...';
                noteContent.appendChild(loadingText);
            }
        }
        
        if (zapsList) {
            zapsList.classList.add('loading');
            // Add loading text if not already present
            if (!zapsList.querySelector('.loading-text')) {
                const loadingText = document.createElement('div');
                loadingText.className = 'loading-text';
                loadingText.textContent = 'Loading zaps...';
                zapsList.appendChild(loadingText);
            }
        }
        
        subscribeKind1(kind1ID);
        document.getElementById('noteLoaderContainer').style.display = 'none';
    } catch (e) {
        console.log("Error loading note from URL:", e);
        // If decoding fails, try to use the input directly as a note ID
        
        // Show loading animations
        const noteContent = document.querySelector('.note-content');
        const zapsList = document.getElementById('zaps');
        
        if (noteContent) {
            noteContent.classList.add('loading');
            // Add loading text if not already present
            if (!noteContent.querySelector('.loading-text')) {
                const loadingText = document.createElement('div');
                loadingText.className = 'loading-text';
                loadingText.textContent = 'Loading note content...';
                noteContent.appendChild(loadingText);
            }
        }
        
        if (zapsList) {
            zapsList.classList.add('loading');
            // Add loading text if not already present
            if (!zapsList.querySelector('.loading-text')) {
                const loadingText = document.createElement('div');
                loadingText.className = 'loading-text';
                loadingText.textContent = 'Loading zaps...';
                zapsList.appendChild(loadingText);
            }
        }
        
        subscribeKind1(nevent);
        document.getElementById('noteLoaderContainer').style.display = 'none';
    }
    */
} else {
    console.log("No note parameter found in URL");
}

// Apply styles from URL parameters first, then localStorage
// Use setTimeout to ensure DOM elements are ready
setTimeout(() => {
    console.log('Applying styles after DOM ready');
applyStylesFromURL();
    applyStylesFromLocalStorage();
}, 200);

// Ensure podium is off by default (will be overridden by localStorage if set)
    document.body.classList.remove('podium-enabled');
    if (podiumToggle) {
        podiumToggle.checked = false;
}

document.getElementById('note1LoaderSubmit').addEventListener('click', note1fromLoader);

// Add Enter key support for the input field
document.getElementById('note1LoaderInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        note1fromLoader();
    }
});

// Clear error message when user starts typing
document.getElementById('note1LoaderInput').addEventListener('input', function() {
    hideNoteLoaderError();
});

function note1fromLoader(){
    let note1 = document.getElementById('note1LoaderInput').value;
    let kind1ID;
    
    // Strip nostr: protocol prefix if present
    const originalNote1 = note1;
    note1 = stripNostrPrefix(note1);
    if (note1 !== originalNote1) {
        console.log("Stripped nostr: prefix from input, now:", note1);
    }
    
    // Validate the note ID after stripping prefix
    try {
        validateNoteId(note1);
        // Clear any previous error message
        hideNoteLoaderError();
    } catch (error) {
        showNoteLoaderError(error.message);
        return;
    }
    
    try {
        // Decode and route to appropriate handler
        const decoded = NostrTools.nip19.decode(note1);
        
        // Update URL with the identifier using path format
        const newUrl = '/live/' + note1;
        window.history.replaceState({}, '', newUrl);
        
        if (decoded.type === 'naddr') {
            // Handle live events
            const { identifier, pubkey, kind } = decoded.data;
            
            // Show loading animations
            const noteContent = document.querySelector('.note-content');
            const zapsList = document.getElementById('zaps');
            
            if (noteContent) {
                noteContent.classList.add('loading');
                if (!noteContent.querySelector('.loading-text')) {
                    const loadingText = document.createElement('div');
                    loadingText.className = 'loading-text';
                    loadingText.textContent = 'Loading live event...';
                    noteContent.appendChild(loadingText);
                }
            }
            
            if (zapsList) {
                zapsList.classList.add('loading');
                if (!zapsList.querySelector('.loading-text')) {
                    const loadingText = document.createElement('div');
                    loadingText.className = 'loading-text';
                    loadingText.textContent = 'Loading live activity...';
                    zapsList.appendChild(loadingText);
                }
            }
            
            // Subscribe to live event, chat, and zaps
            subscribeLiveEvent(pubkey, identifier, kind);
            subscribeLiveChat(pubkey, identifier);
            subscribeLiveEventZaps(pubkey, identifier);
            
        } else if (decoded.type === 'nprofile') {
            // Handle profiles
            const { pubkey } = decoded.data;
            
            // Show loading animations
            const noteContent = document.querySelector('.note-content');
            const zapsList = document.getElementById('zaps');
            
            if (noteContent) {
                noteContent.classList.add('loading');
                if (!noteContent.querySelector('.loading-text')) {
                    const loadingText = document.createElement('div');
                    loadingText.className = 'loading-text';
                    loadingText.textContent = 'Loading profile...';
                    noteContent.appendChild(loadingText);
                }
            }
            
            if (zapsList) {
                zapsList.classList.add('loading');
                if (!zapsList.querySelector('.loading-text')) {
                    const loadingText = document.createElement('div');
                    loadingText.className = 'loading-text';
                    loadingText.textContent = 'Loading profile activity...';
                    zapsList.appendChild(loadingText);
                }
            }
            
            // Load profile
            loadProfileContent(pubkey);
            
        } else if (decoded.type === 'nevent') {
            kind1ID = decoded.data.id;
            
            // Show loading animations
            const noteContent = document.querySelector('.note-content');
            const zapsList = document.getElementById('zaps');
            
            if (noteContent) {
                noteContent.classList.add('loading');
                if (!noteContent.querySelector('.loading-text')) {
                    const loadingText = document.createElement('div');
                    loadingText.className = 'loading-text';
                    loadingText.textContent = 'Loading note content...';
                    noteContent.appendChild(loadingText);
                }
            }
            
            if (zapsList) {
                zapsList.classList.add('loading');
                if (!zapsList.querySelector('.loading-text')) {
                    const loadingText = document.createElement('div');
                    loadingText.className = 'loading-text';
                    loadingText.textContent = 'Loading zaps...';
                    zapsList.appendChild(loadingText);
                }
            }
            
            subscribeKind1(kind1ID);
            
        } else if (decoded.type === 'note') {
            kind1ID = decoded.data;
            
            // Show loading animations
    const noteContent = document.querySelector('.note-content');
    const zapsList = document.getElementById('zaps');
    
    if (noteContent) {
        noteContent.classList.add('loading');
        if (!noteContent.querySelector('.loading-text')) {
            const loadingText = document.createElement('div');
            loadingText.className = 'loading-text';
            loadingText.textContent = 'Loading note content...';
            noteContent.appendChild(loadingText);
        }
    }
    
    if (zapsList) {
        zapsList.classList.add('loading');
        if (!zapsList.querySelector('.loading-text')) {
            const loadingText = document.createElement('div');
            loadingText.className = 'loading-text';
            loadingText.textContent = 'Loading zaps...';
            zapsList.appendChild(loadingText);
        }
    }
    
    subscribeKind1(kind1ID);
            
        } else {
            throw new Error('Invalid identifier format. Please enter a valid nostr identifier.');
        }
        
    document.getElementById('noteLoaderContainer').style.display = 'none';
        
    } catch (e) {
        // If decoding fails, show error instead of trying to use invalid input
        alert('Invalid nostr identifier. Please enter a valid note ID (note1...), event ID (nevent1...), live event (naddr1...), or profile (nprofile1...).');
        return;
    }
    console.log(note1);
}

async function subscribeKind1(kind1ID) {
    console.log("Subscribing to kind1 with ID:", kind1ID);
    console.log("Using relays:", relays);
    let filter = { ids: [kind1ID]}
    
    // Add a timeout to prevent immediate EOS
    let timeoutId = setTimeout(() => {
        console.log("Kind1 subscription timeout - no events received after 10 seconds");
    }, 10000);
    
    pool.subscribeMany(
        [...relays],
        [filter],
        {
        async onevent(kind1) {
            clearTimeout(timeoutId);
            console.log("Received kind1 event:", kind1);
            drawKind1(kind1)
            await subscribeKind0fromKind1(kind1)
            await subscribeKind9735fromKind1(kind1)
        },
        oneose() {
            clearTimeout(timeoutId);
            console.log("subscribeKind1() EOS - no more events expected")
        },
        onclosed() {
            clearTimeout(timeoutId);
            console.log("subscribeKind1() Closed")
        }
    })
  }

  async function subscribeKind0fromKind1(kind1) {
    let kind0key = kind1.pubkey
    const sub = pool.subscribeMany(
        [...relays],
        [{
            kinds: [0],
            authors: [kind0key]
        }]
    ,{
        onevent(kind0) {
            drawKind0(kind0)
        },
        oneose() {
            console.log("subscribeKind0sfromKind1s() EOS")
        },
        onclosed() {
            console.log("subscribeKind0sfromKind1s() Closed")
        }
    })
  }

  async function subscribeKind9735fromKind1(kind1) {
    console.log("Subscribing to zaps for kind1 ID:", kind1.id);
    let kinds9735IDs = new Set();
    let kinds9735 = []
    const kind1id = kind1.id
    let isFirstStream = true

    const zapsContainer = document.getElementById("zaps");

    // Add a timeout for zap subscription
    let zapTimeoutId = setTimeout(() => {
        console.log("Zap subscription timeout - no zaps received after 15 seconds");
        if (kinds9735.length === 0) {
            console.log("No zaps found for this note");
        }
    }, 15000);

    const sub = pool.subscribeMany(
        [...relays],
        [{
            kinds: [9735],
            "#e": [kind1id]
        }]
    ,{
        onevent(kind9735) {
            clearTimeout(zapTimeoutId);
            console.log("Received zap event:", kind9735);
            if(!(kinds9735IDs.has(kind9735.id))){
                kinds9735IDs.add(kind9735.id)
                kinds9735.push(kind9735)
                if(!isFirstStream){
                    console.log("Processing new zap:", kind9735)
                    subscribeKind0fromKinds9735([kind9735])
                }
            }
        },
        oneose() {
            clearTimeout(zapTimeoutId);
            isFirstStream = false
            console.log("Processing all zaps, count:", kinds9735.length);
            subscribeKind0fromKinds9735(kinds9735)
            console.log("subscribeKind9735fromKind1() EOS")
        },
        onclosed() {
            clearTimeout(zapTimeoutId);
            console.log("subscribeKind9735fromKind1() Closed")
        }
    })
}

function numberWithCommas(x) {
	  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}



function subscribeKind0fromKinds9735(kinds9735){
    let kind9734PKs = []
    let kind0fromkind9735List = []
    let kind0fromkind9735Seen = new Set();
    for(let kind9735 of kinds9735){
        if(kind9735.tags){
            const description9735 = kind9735.tags.find(tag => tag[0] === "description")[1];
            const kind9734 = JSON.parse(description9735)
            kind9734PKs.push(kind9734.pubkey)
        }
    }
    let h = pool.subscribeMany(
        [...relays],
        [{
            kinds: [0],
            authors: kind9734PKs
        }]
    ,{
    onevent(kind0) {
        if(!(kind0fromkind9735Seen.has(kind0.pubkey))){
            kind0fromkind9735Seen.add(kind0.pubkey);
            kind0fromkind9735List.push(kind0)
        }
    },
    async oneose() {
        createkinds9735JSON(kinds9735, kind0fromkind9735List)
        console.log("subscribeKind0fromKinds9735() EOS")
    },
    onclosed() {
        console.log("subscribeKind0fromKinds9735() Closed")
    }
  })
}

async function createkinds9735JSON(kind9735List, kind0fromkind9735List){
    // Reset zapper totals for new note
    resetZapperTotals();
    
    for(let kind9735 of kind9735List){
        const description9735 = JSON.parse(kind9735.tags.find(tag => tag[0] == "description")[1])
        const pubkey9735 = description9735.pubkey
        const bolt119735 = kind9735.tags.find(tag => tag[0] == "bolt11")[1]
        const amount9735 = lightningPayReq.decode(bolt119735).satoshis
        const kind1from9735 = kind9735.tags.find(tag => tag[0] == "e")[1]
        const kind9735id = NostrTools.nip19.noteEncode(kind9735.id)
        const kind9735Content = description9735.content
        console.log(kind9735)
        let kind0picture = ""
        let kind0npub = ""
        let kind0name = ""
        let kind0finalName = ""
        let profileData = null
        const kind0fromkind9735 = kind0fromkind9735List.find(kind0 => pubkey9735 === kind0.pubkey);
        if(kind0fromkind9735){
            const content = JSON.parse(kind0fromkind9735.content)
            const displayName = content.displayName
            kind0name = displayName ? content.displayName : content.display_name
            kind0finalName = kind0name!="" ? kind0name : content.name
            console.log(kind0finalName)
            kind0picture = content.picture
            kind0npub = NostrTools.nip19.npubEncode(kind0fromkind9735.pubkey)
            profileData = content
        }
        
        // Add to zapper totals accounting
        addZapToTotals(pubkey9735, amount9735, profileData);
        
        const json9735 = {"e": kind1from9735, "amount": amount9735, "picture": kind0picture, "npubPayer": kind0npub, "pubKey": pubkey9735, "zapEventID": kind9735id, "kind9735content": kind9735Content, "kind1Name": kind0finalName}
        json9735List.push(json9735)
    }
    json9735List.sort((a, b) => b.amount - a.amount);
    drawKinds9735(json9735List)
  }

// Live Event subscription functions
async function subscribeLiveEvent(pubkey, identifier, kind) {
    console.log("Subscribing to live event:", { pubkey, identifier, kind });
    
    let filter = {
        authors: [pubkey],
        kinds: [30311], // Live Event kind
        "#d": [identifier]
    };
    
    // Add timeout to prevent subscription from closing prematurely
    let timeoutId = setTimeout(() => {
        console.log("Live event subscription timeout - keeping subscription alive");
        // Don't close the subscription, just log that we're keeping it alive
    }, 30000); // Increased timeout to 30 seconds
    
    const sub = pool.subscribeMany(relays, [filter], {
        onevent(liveEvent) {
            clearTimeout(timeoutId);
            console.log("Received live event:", liveEvent);
            displayLiveEvent(liveEvent);
            // Also subscribe to participants' profiles
            subscribeLiveEventParticipants(liveEvent);
        },
        oneose() {
            clearTimeout(timeoutId);
            console.log("subscribeLiveEvent() EOS - keeping subscription alive");
            // Don't close the subscription, keep it alive for updates
        },
        onclosed() {
            clearTimeout(timeoutId);
            console.log("subscribeLiveEvent() Closed - attempting to reconnect");
            // Attempt to reconnect after a delay if we have current event info
            if (currentLiveEventInfo && reconnectionAttempts.event < 3) {
                reconnectionAttempts.event++;
                setTimeout(() => {
                    console.log(`Reconnecting to live event (attempt ${reconnectionAttempts.event})...`);
                    subscribeLiveEvent(currentLiveEventInfo.pubkey, currentLiveEventInfo.identifier, currentLiveEventInfo.kind);
                }, 5000 * reconnectionAttempts.event);
            }
        }
    });
}

async function subscribeLiveChat(pubkey, identifier) {
    console.log("Subscribing to live chat for:", { pubkey, identifier });
    
    const aTag = `30311:${pubkey}:${identifier}`;
    
    let filter = {
        kinds: [1311], // Live Chat Message kind
        "#a": [aTag]
    };
    
    const sub = pool.subscribeMany(relays, [filter], {
        onevent(chatMessage) {
            console.log("Received live chat message:", chatMessage);
            displayLiveChatMessage(chatMessage);
            // Subscribe to chat author profile if not already cached
            subscribeChatAuthorProfile(chatMessage.pubkey);
        },
        oneose() {
            console.log("subscribeLiveChat() EOS - keeping subscription alive");
            // Keep subscription alive for new messages
        },
        onclosed() {
            console.log("subscribeLiveChat() Closed - attempting to reconnect");
            // Attempt to reconnect after a delay
            setTimeout(() => {
                console.log("Reconnecting to live chat...");
                subscribeLiveChat(pubkey, identifier);
            }, 5000);
        }
    });
}

async function subscribeLiveEventParticipants(liveEvent) {
    console.log("Subscribing to live event participants");
    
    // Extract participant pubkeys from p tags
    const participants = liveEvent.tags
        .filter(tag => tag[0] === "p")
        .map(tag => tag[1]);
    
    if (participants.length === 0) return;
    
    let filter = {
        kinds: [0], // Profile kind
        authors: participants
    };
    
    const sub = pool.subscribeMany(relays, [filter], {
        onevent(profile) {
            console.log("Received participant profile:", profile);
            // Update participant display with profile info
            updateParticipantProfile(profile);
        },
        oneose() {
            console.log("subscribeLiveEventParticipants() EOS");
        },
        onclosed() {
            console.log("subscribeLiveEventParticipants() Closed");
        }
    });
}

async function subscribeChatAuthorProfile(pubkey) {
    console.log("Subscribing to chat author profile:", pubkey);
    
    let filter = {
        kinds: [0], // Profile kind
        authors: [pubkey]
    };
    
    const sub = pool.subscribeMany(relays, [filter], {
        onevent(profile) {
            console.log("Received chat author profile:", profile);
            // Update chat message display with profile info
            updateChatAuthorProfile(profile);
        },
        oneose() {
            console.log("subscribeChatAuthorProfile() EOS");
        },
        onclosed() {
            console.log("subscribeChatAuthorProfile() Closed");
        }
    });
}

async function subscribeLiveEventZaps(pubkey, identifier) {
    console.log("Subscribing to live event zaps for:", { pubkey, identifier });
    
    const aTag = `30311:${pubkey}:${identifier}`;
    
    let filter = {
        kinds: [9735], // Zap receipt kind
        "#a": [aTag]
    };
    
    const sub = pool.subscribeMany(relays, [filter], {
        onevent(zapReceipt) {
            console.log("Received live event zap receipt:", zapReceipt);
            processLiveEventZap(zapReceipt, pubkey, identifier);
        },
        oneose() {
            console.log("subscribeLiveEventZaps() EOS - keeping subscription alive");
            // Keep subscription alive for new zaps
        },
        onclosed() {
            console.log("subscribeLiveEventZaps() Closed - attempting to reconnect");
            // Attempt to reconnect after a delay
            setTimeout(() => {
                console.log("Reconnecting to live event zaps...");
                subscribeLiveEventZaps(pubkey, identifier);
            }, 5000);
        }
    });
}

async function subscribeLiveEventHostProfile(hostPubkey) {
    console.log("Subscribing to live event host profile:", hostPubkey);
    
    let filter = {
        kinds: [0], // Profile kind
        authors: [hostPubkey]
    };
    
    const sub = pool.subscribeMany(relays, [filter], {
        onevent(profile) {
            console.log("Received live event host profile:", profile);
            updateLiveEventHostProfile(profile);
        },
        oneose() {
            console.log("subscribeLiveEventHostProfile() EOS");
        },
        onclosed() {
            console.log("subscribeLiveEventHostProfile() Closed");
        }
    });
  }

function scaleTextByLength(element, content) {
    const maxLength = 180; // Twitter-like character limit
    const minFontSize = 1; // Minimum font size in vw
    const maxFontSize = 4; // Maximum font size in vw
    const baseLength = 80; // Base length for scaling calculation
    
    // Calculate font size based on content length
    let fontSize;
    if (content.length <= baseLength) {
        fontSize = maxFontSize;
    } else if (content.length >= maxLength) {
        fontSize = minFontSize;
    } else {
        // Linear scaling between maxLength and baseLength
        const scale = (content.length - baseLength) / (maxLength - baseLength);
        fontSize = maxFontSize - (scale * (maxFontSize - minFontSize));
    }
    
    // Apply the font size
    element.style.fontSize = `${fontSize}vw`;
}

async function lookupProfile(pubkey) {
    return new Promise((resolve) => {
        const sub = pool.subscribeMany(
            [...relays],
            [{
                kinds: [0],
                authors: [pubkey]
            }],
            {
                onevent(kind0) {
                    resolve(kind0);
                    sub.close();
                },
                oneose() {
                    resolve(null);
                    sub.close();
                }
            }
        );
    });
}

function parseNostrMentions(content) {
    // Match both nostr: and raw npub/nprofile formats
    const nostrRegex = /(?:nostr:)?((?:npub|nprofile)[a-zA-Z0-9]+)/g;
    const mentions = [];
    let match;
    
    while ((match = nostrRegex.exec(content)) !== null) {
        const [fullMatch, encoded] = match;
        try {
            // Use the encoded part without the nostr: prefix for decoding
            const decoded = NostrTools.nip19.decode(encoded);
            
            if (decoded.type === 'npub') {
                mentions.push({
                    type: 'npub',
                    pubkey: decoded.data,
                    fullMatch,
                    index: match.index
                });
            } else if (decoded.type === 'nprofile') {
                mentions.push({
                    type: 'nprofile',
                    pubkey: decoded.data.pubkey,
                    fullMatch,
                    index: match.index
                });
            }
        } catch (e) {
            console.log("Error decoding nostr mention:", e, "for match:", fullMatch);
        }
    }
    
    return mentions;
}

async function replaceNostrMentions(content) {
    try {
        console.log("Replacing nostr mentions in content:", content);
        if (!content) return '';
        
        const mentions = parseNostrMentions(content);
        console.log("Found mentions:", mentions);
        if (mentions.length === 0) return content;
    
    // Sort mentions by index in reverse order to avoid index shifting during replacement
    mentions.sort((a, b) => b.index - a.index);
    
    let processedContent = content;
    const processedMentions = new Map(); // Cache for profile lookups
    
    for (const mention of mentions) {
        let profile;
        if (!processedMentions.has(mention.pubkey)) {
            profile = await lookupProfile(mention.pubkey);
            processedMentions.set(mention.pubkey, profile);
        } else {
            profile = processedMentions.get(mention.pubkey);
        }
        
        if (profile) {
            try {
                const profileData = JSON.parse(profile.content);
                const displayName = profileData.displayName || profileData.display_name;
                const name = displayName || profileData.name || 'Unknown';
                const npub = NostrTools.nip19.npubEncode(mention.pubkey);
                const replacement = `<a href="https://njump.me/${npub}" target="_blank" class="nostr-mention">@${name}</a>`;
                processedContent = processedContent.slice(0, mention.index) + 
                                 replacement + 
                                 processedContent.slice(mention.index + mention.fullMatch.length);
            } catch (e) {
                console.log("Error processing profile data:", e);
            }
        }
    }
    
    return processedContent;
    } catch (e) {
        console.error("Error replacing nostr mentions:", e);
        return content;
    }
}

function parseImages(content) {
    // Match both markdown image syntax and raw URLs
    const imageRegex = /(?:!\[.*?\]\((.*?)\))|(https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s]*)?)/gi;
    const images = [];
    let match;
    
    while ((match = imageRegex.exec(content)) !== null) {
        const [fullMatch, markdownUrl, rawUrl] = match;
        const imageUrl = markdownUrl || rawUrl;
        if (imageUrl) {
            images.push({
                url: imageUrl,
                fullMatch,
                index: match.index
            });
        }
    }
    
    return images;
}

async function replaceImages(content) {
    try {
        console.log("Replacing images in content:", content);
        if (!content) return '';
        
        const images = parseImages(content);
        console.log("Found images:", images);
        if (images.length === 0) return content;
    
    // Sort images by index in reverse order to avoid index shifting during replacement
    images.sort((a, b) => b.index - a.index);
    
    let processedContent = content;
    
    for (const image of images) {
        const replacement = `<img src="${image.url}" class="note-image" alt="Note image" loading="lazy" />`;
        processedContent = processedContent.slice(0, image.index) + 
                         replacement + 
                         processedContent.slice(image.index + image.fullMatch.length);
    }
    
    return processedContent;
    } catch (e) {
        console.error("Error replacing images:", e);
        return content;
    }
}

async function processNoteContent(content) {
    try {
        console.log("Processing note content:", content);
        // First process images
        let processedContent = await replaceImages(content);
        console.log("After image processing:", processedContent);
        // Then process nostr mentions
        processedContent = await replaceNostrMentions(processedContent);
        console.log("After mention processing:", processedContent);
        return processedContent;
    } catch (e) {
        console.error("Error processing note content:", e);
        return content; // Return original content if processing fails
    }
}

async function drawKind1(kind1){
    console.log("Drawing kind1:", kind1)
    
    // Store note ID globally for QR regeneration
    window.currentNoteId = kind1.id;
    
    const noteContent = document.getElementById("noteContent");
    console.log("Note content element:", noteContent);
    
    // Process content for both images and nostr mentions
    const processedContent = await processNoteContent(kind1.content);
    console.log("Processed content:", processedContent);
    noteContent.innerHTML = processedContent;
    
    // Hide note content loading animation
    noteContent.classList.remove('loading');
    const loadingText = noteContent.querySelector('.loading-text');
    if (loadingText) loadingText.remove();
    
    // Font sizes are now controlled by CSS using vw units
    // No JavaScript font size re-initialization needed
    
    // Generate multiple QR code formats
    const noteId = kind1.id;
    const neventId = NostrTools.nip19.neventEncode({ id: noteId, relays: [] });
    const note1Id = NostrTools.nip19.noteEncode(noteId);
    const njumpUrl = "https://njump.me/" + note1Id;
    const nostrNevent = "nostr:" + neventId;
    const nostrNote = "nostr:" + note1Id;
    
    const qrSize = Math.min(window.innerWidth * 0.6, window.innerHeight * 0.7);
    
    // Generate QR codes for all formats
    const qrcodeContainers = [
        { element: document.getElementById("qrCode"), value: njumpUrl, link: document.getElementById("qrcodeLinkNostr"), preview: document.getElementById("qrDataPreview1") },
        { element: document.getElementById("qrCodeNevent"), value: nostrNevent, link: document.getElementById("qrcodeNeventLink"), preview: document.getElementById("qrDataPreview2") },
        { element: document.getElementById("qrCodeNote"), value: nostrNote, link: document.getElementById("qrcodeNoteLink"), preview: document.getElementById("qrDataPreview3") }
    ];
    
    
    qrcodeContainers.forEach(({ element, value, link, preview }) => {
        if (element) {
            element.innerHTML = "";
            new QRious({
                element: element,
                size: qrSize,
                value: value
            });
            
            // Set link href
            if (link) link.href = value;
            
            // Set data preview (more characters for web links)
            if (preview) {
                let cleanValue = value;
                let maxLength = 10; // Default for nostr formats
                
                if (value.startsWith('https://')) {
                    cleanValue = value.substring(8); // Remove 'https://'
                    maxLength = 20; // Show more for web links
                } else if (value.startsWith('nostr:')) {
                    cleanValue = value.substring(6); // Remove 'nostr:'
                }
                // Always add ellipsis to show truncation
                const previewText = cleanValue.substring(0, maxLength) + '...';
                preview.textContent = previewText;
            }
        }
    });
    
    // Initialize swiper if not already initialized
    if (!window.qrSwiper) {
        window.qrSwiper = new Swiper('.qr-swiper', {
            slidesPerView: 1,
            spaceBetween: 0,
            pagination: {
                el: '.swiper-pagination',
                clickable: true,
                dynamicBullets: false
            },
            loop: false, // Disable loop to avoid issues with hidden slides
            autoplay: {
                delay: 3000,
                disableOnInteraction: false,
                pauseOnMouseEnter: true
            },
            autoHeight: false, // Use fixed height to avoid layout issues
            height: 250,
            watchOverflow: true, // Handle case where all slides might be hidden
            observer: true, // Watch for DOM changes
            observeParents: true
        });
    }
    
    // Apply current slide visibility settings
    if (window.updateQRSlideVisibility) {
        window.updateQRSlideVisibility(true); // Skip URL update during QR generation
    }
}

function drawKind0(kind0){
      let authorContent = JSON.parse(kind0.content)
      console.log(authorContent);
      //document.getElementById("authorName").innerText = authorContent.name;
      const displayName = JSON.parse(kind0.content).displayName
      let kind0name = displayName ? JSON.parse(kind0.content).displayName : JSON.parse(kind0.content).display_name
      document.getElementById("authorName").innerText = kind0name;
      document.getElementById("authorNameProfileImg").src = authorContent.picture;
  }


  function drawKinds9735(json9735List){
      console.log(json9735List)

      const zapsContainer = document.getElementById("zaps");
      zapsContainer.innerHTML = ""

      // Hide zaps loading animation
      zapsContainer.classList.remove('loading');
      const loadingText = zapsContainer.querySelector('.loading-text');
      if (loadingText) loadingText.remove();

      const totalAmountZapped = json9735List.reduce((sum, zaps) => sum + zaps.amount, 0);
      document.getElementById("zappedTotalValue").innerText = numberWithCommas(totalAmountZapped);

      // Check if there are no zaps
      if (json9735List.length === 0) {
          const emptyStateDiv = document.createElement("div");
          emptyStateDiv.className = "empty-zaps-state";
          emptyStateDiv.innerHTML = `
              <div class="empty-zaps-message">
                  Be the first to support
              </div>
          `;
          zapsContainer.appendChild(emptyStateDiv);
          return;
      }

      // Sort zaps by amount (highest first) - no limit, let them overflow
      const sortedZaps = json9735List.sort((a, b) => b.amount - a.amount);

      for(let i = 0; i < sortedZaps.length; i++){
        const json9735 = sortedZaps[i];
        const zapDiv = document.createElement("div");
        
        // Podium classes will be applied after DOM organization
        let zapClass = "zap";
        zapDiv.className = zapClass;

        if(!json9735.picture) json9735.picture = ""
        const profileImage = json9735.picture == "" ? "/images/gradient_color.gif" : json9735.picture

        zapDiv.innerHTML = `
            <div class="zapperProfile">
                <img class="zapperProfileImg" src="${profileImage}" />
                <div class="zapperInfo">
                    <div class="zapperName">
                        ${json9735.kind1Name}
                    </div>
                    <div class="zapperMessage">${json9735.kind9735content || ''}</div>
                </div>
            </div>
            <div class="zapperAmount">
                <span class="zapperAmountSats">${numberWithCommas(json9735.amount)}</span>
                <span class="zapperAmountLabel">sats</span>
            </div>
        `;
        zapsContainer.appendChild(zapDiv);
        
        // Font sizes are now controlled by CSS using vw units
        // No JavaScript font size initialization needed for new elements
      }
      
      // Reorganize zaps hierarchically if grid mode is enabled
      const zapGridToggle = document.getElementById('zapGridToggle');
      if (zapGridToggle && zapGridToggle.checked) {
          // Ensure the grid-layout class is applied
          zapsContainer.classList.add('grid-layout');
          // Add a small delay to ensure DOM is updated
          setTimeout(() => {
              organizeZapsHierarchically();
          }, 10);
      } else {
          // Apply podium classes for list layout
          if (document.body.classList.contains('podium-enabled')) {
              const zaps = Array.from(zapsContainer.querySelectorAll('.zap'));
              const sortedZaps = [...zaps].sort((a, b) => {
                  const amountA = parseInt(a.querySelector('.zapperAmountSats')?.textContent?.replace(/[^\d]/g, '') || '0');
                  const amountB = parseInt(b.querySelector('.zapperAmountSats')?.textContent?.replace(/[^\d]/g, '') || '0');
                  return amountB - amountA;
              });
              
              console.log('Applying podium classes in list layout. Top 3 zaps:', sortedZaps.slice(0, 3).map(zap => ({
                  amount: zap.querySelector('.zapperAmountSats')?.textContent,
                  name: zap.querySelector('.zapperName')?.textContent
              })));
              
              for (let i = 0; i < Math.min(3, sortedZaps.length); i++) {
                  const zap = sortedZaps[i];
                  zap.classList.add(`podium-${i + 1}`);
                  console.log(`Applied podium-${i + 1} to zap with amount:`, zap.querySelector('.zapperAmountSats')?.textContent);
              }
          }
      }
      
      // Update zap count total (works for both live events and regular notes)
      updateZapTotal();
  }

// Live Event display functions
function setupLiveEventTwoColumnLayout() {
    const zapsContainer = document.getElementById("zaps");
    
    // Check if layout is already set up to avoid clearing existing content
    if (zapsContainer.classList.contains('live-event-two-column') && 
        zapsContainer.querySelector('.live-event-columns')) {
        console.log("Two-column layout already exists, skipping setup to preserve content");
        return;
    }
    
    console.log("Setting up two-column layout");
    
    // Clear existing content and set up two-column structure
    zapsContainer.innerHTML = `
        <div class="live-event-columns">
            <div class="live-event-zaps-only">
                <div id="zaps-only-list" class="zaps-only-list"></div>
            </div>
            <div class="live-event-activity">
                <div id="activity-list" class="activity-list"></div>
            </div>
        </div>
    `;
    
    // Add the two-column class to the container
    zapsContainer.classList.add('live-event-two-column');
    
    // Disable and grey out the grid toggle for live events
    const zapGridToggle = document.getElementById('zapGridToggle');
    if (zapGridToggle) {
        zapGridToggle.disabled = true;
        
        // Add disabled class to the parent toggle group
        const toggleGroup = zapGridToggle.closest('.toggle-group');
        if (toggleGroup) {
            toggleGroup.classList.add('grid-toggle-disabled');
        }
        
        // Also add to the label as fallback
        const gridLabel = zapGridToggle.closest('label');
        if (gridLabel) {
            gridLabel.classList.add('grid-toggle-disabled');
        }
    }
}

function enableGridToggle() {
    const zapGridToggle = document.getElementById('zapGridToggle');
    if (zapGridToggle) {
        zapGridToggle.disabled = false;
        
        // Remove disabled class from the parent toggle group
        const toggleGroup = zapGridToggle.closest('.toggle-group');
        if (toggleGroup) {
            toggleGroup.classList.remove('grid-toggle-disabled');
        }
        
        // Also remove from the label
        const gridLabel = zapGridToggle.closest('label');
        if (gridLabel) {
            gridLabel.classList.remove('grid-toggle-disabled');
        }
    }
}

function displayLiveEvent(liveEvent) {
    console.log("Displaying live event:", liveEvent);
    
    // Check if this live event is already displayed to avoid clearing content
    if (window.currentLiveEvent && window.currentLiveEvent.id === liveEvent.id) {
        console.log("Live event already displayed, skipping to avoid clearing content");
        return;
    }
    
    // Hide note content loading animation
    const noteContent = document.querySelector('.note-content');
    noteContent.classList.remove('loading');
    const loadingText = noteContent.querySelector('.loading-text');
    if (loadingText) loadingText.remove();
    
    // Set up two-column layout for live events
    setupLiveEventTwoColumnLayout();
    
    // Extract event information from tags
    const title = liveEvent.tags.find(tag => tag[0] === "title")?.[1] || "Live Event";
    const summary = liveEvent.tags.find(tag => tag[0] === "summary")?.[1] || "";
    const status = liveEvent.tags.find(tag => tag[0] === "status")?.[1] || "unknown";
    const streaming = liveEvent.tags.find(tag => tag[0] === "streaming")?.[1];
    const recording = liveEvent.tags.find(tag => tag[0] === "recording")?.[1];
    const starts = liveEvent.tags.find(tag => tag[0] === "starts")?.[1];
    const ends = liveEvent.tags.find(tag => tag[0] === "ends")?.[1];
    const currentParticipants = liveEvent.tags.find(tag => tag[0] === "current_participants")?.[1] || "0";
    const totalParticipants = liveEvent.tags.find(tag => tag[0] === "total_participants")?.[1] || "0";
    const participants = liveEvent.tags.filter(tag => tag[0] === "p");
    
    // Format timestamps
    const formatTime = (timestamp) => {
        if (!timestamp) return "";
        const date = new Date(parseInt(timestamp) * 1000);
        return date.toLocaleString();
    };
    
    // Update the note content area with live event info
    noteContent.innerHTML = `
        ${streaming ? `
            <div class="live-event-video">
                <div id="live-video-player" class="video-player-container">
                    <video id="live-video" controls autoplay muted playsinline class="live-video">
                        <source src="${streaming}" type="application/x-mpegURL">
                        <source src="${streaming}" type="video/mp4">
                        Your browser does not support the video tag.
                    </video>
                    <div class="video-error" id="video-error" style="display: none;">
                        <p>Unable to load video stream</p>
                        <a href="${streaming}" target="_blank" class="streaming-link">
                            📺 Watch in External Player
                        </a>
                    </div>
                </div>
            </div>
        ` : ''}
        
        <div class="live-event-content">
            ${summary ? `<p class="live-event-summary">${summary}</p>` : ''}
            
            <div class="live-event-status">
                <span class="status-indicator status-${status}">
                    ${status === 'live' ? '🔴 LIVE' : status === 'planned' ? '📅 PLANNED' : status === 'ended' ? '✅ ENDED' : status.toUpperCase()}
                </span>
            </div>
            
            ${starts ? `<div class="live-event-time">
                <strong>Starts:</strong> ${formatTime(starts)}
            </div>` : ''}
            
            ${ends ? `<div class="live-event-time">
                <strong>Ends:</strong> ${formatTime(ends)}
            </div>` : ''}
            
            <div class="live-event-participants">
                <div class="participants-count">
                    <strong>Participants:</strong> ${currentParticipants}/${totalParticipants}
                </div>
                ${participants.length > 0 ? `
                    <div class="participants-list">
                        ${participants.slice(0, 10).map(p => `
                            <div class="participant" data-pubkey="${p[1]}">
                                <span class="participant-role">${p[3] || 'Participant'}</span>: 
                                <span class="participant-pubkey">${p[1].slice(0,8)}...</span>
                            </div>
                        `).join('')}
                        ${participants.length > 10 ? `<div class="participants-more">... and ${participants.length - 10} more</div>` : ''}
                    </div>
                ` : ''}
            </div>
            
            ${recording ? `
                <div class="live-event-actions">
                    <a href="${recording}" target="_blank" class="recording-link">
                        🎥 Watch Recording
                    </a>
                </div>
            ` : ''}
        </div>
    `;
    
    // Update author info with event title and fetch host profile
    document.getElementById("authorName").innerText = title;
    
    // Find the actual host from participants (look for "Host" role in p tags)
    const hostParticipant = participants.find(p => p[3] && p[3].toLowerCase() === 'host');
    const hostPubkey = hostParticipant ? hostParticipant[1] : liveEvent.pubkey;
    
    // Subscribe to host profile to get their image
    subscribeLiveEventHostProfile(hostPubkey);
    
    // Store event info globally for QR generation
    window.currentLiveEvent = liveEvent;
    window.currentEventType = 'live-event';
    
    // Generate QR codes for the live event (with small delay to ensure DOM is ready)
    setTimeout(() => {
        generateLiveEventQRCodes(liveEvent);
    }, 100);
    
    // Initialize video player if streaming URL is available
    if (streaming) {
        setTimeout(() => {
            initializeLiveVideoPlayer(streaming);
        }, 200);
    }
    
    // Start monitoring content to detect if it disappears
    startContentMonitoring();
}

// Monitor live event content to detect if it disappears
function startContentMonitoring() {
    // Clear any existing monitoring
    if (window.contentMonitorInterval) {
        clearInterval(window.contentMonitorInterval);
    }
    
    window.contentMonitorInterval = setInterval(() => {
        const noteContent = document.querySelector('.note-content');
        const zapsContainer = document.getElementById('zaps');
        const liveEventContent = noteContent?.querySelector('.live-event-content');
        const twoColumnLayout = zapsContainer?.querySelector('.live-event-columns');
        
        if (window.currentEventType === 'live-event') {
            if (!liveEventContent) {
                console.warn("Live event content disappeared! Attempting to restore...");
                // Try to restore if we have the current live event info
                if (window.currentLiveEvent && currentLiveEventInfo) {
                    console.log("Restoring live event content");
                    displayLiveEvent(window.currentLiveEvent);
                }
            }
            
            if (!twoColumnLayout && zapsContainer && !zapsContainer.classList.contains('loading')) {
                console.warn("Two-column layout disappeared! Attempting to restore...");
                setupLiveEventTwoColumnLayout();
            }
        }
    }, 10000); // Check every 10 seconds
}

function displayLiveChatMessage(chatMessage) {
    console.log("Displaying live chat message:", chatMessage);
    
    const zapsContainer = document.getElementById("zaps");
    
    // Hide loading animation on first message
    zapsContainer.classList.remove('loading');
    const loadingText = zapsContainer.querySelector('.loading-text');
    if (loadingText) loadingText.remove();
    
    // Use activity column for live events, main container for regular notes
    const targetContainer = document.getElementById("activity-list") || zapsContainer;
    
    // Create chat message element
    const chatDiv = document.createElement("div");
    chatDiv.className = "live-chat-message";
    chatDiv.dataset.pubkey = chatMessage.pubkey;
    chatDiv.dataset.timestamp = chatMessage.created_at;
    
    const timeStr = new Date(chatMessage.created_at * 1000).toLocaleString();
    
    chatDiv.innerHTML = `
        <div class="chat-message-header">
            <img class="chat-author-img" src="/images/gradient_color.gif" data-pubkey="${chatMessage.pubkey}" />
            <div class="chat-message-info">
                <div class="chat-author-name" data-pubkey="${chatMessage.pubkey}">
                    ${chatMessage.pubkey.slice(0,8)}...
                </div>
                <div class="chat-message-time">${timeStr}</div>
            </div>
        </div>
        <div class="chat-message-content">
            ${chatMessage.content}
        </div>
    `;
    
    // Insert message in reverse chronological order (newest first, at top)
    const existingMessages = Array.from(targetContainer.querySelectorAll('.live-chat-message, .live-event-zap'));
    const insertPosition = existingMessages.findIndex(msg => 
        parseInt(msg.dataset.timestamp) < chatMessage.created_at
    );
    
    if (insertPosition === -1) {
        // Add to end (oldest messages at bottom)
        targetContainer.appendChild(chatDiv);
    } else {
        // Insert before the found position (newer messages towards top)
        targetContainer.insertBefore(chatDiv, existingMessages[insertPosition]);
    }
}

function updateParticipantProfile(profile) {
    console.log("Updating participant profile:", profile);
    
    const profileData = JSON.parse(profile.content || '{}');
    const name = profileData.display_name || profileData.displayName || profileData.name || profile.pubkey.slice(0,8) + '...';
    const picture = profileData.picture || "/images/gradient_color.gif";
    
    // Update participant display in live event content
    const participantElement = document.querySelector(`.participant[data-pubkey="${profile.pubkey}"]`);
    if (participantElement) {
        const pubkeySpan = participantElement.querySelector('.participant-pubkey');
        if (pubkeySpan) {
            pubkeySpan.textContent = name;
        }
    }
}

function updateChatAuthorProfile(profile) {
    console.log("Updating chat author profile:", profile);
    
    const profileData = JSON.parse(profile.content || '{}');
    const name = profileData.display_name || profileData.displayName || profileData.name || profile.pubkey.slice(0,8) + '...';
    const picture = profileData.picture || "/images/gradient_color.gif";
    
    // Update zapper totals with profile info if this user has zapped
    if (zapperTotals.has(profile.pubkey)) {
        const zapperData = zapperTotals.get(profile.pubkey);
        zapperData.profile = profileData;
        zapperData.name = name;
        zapperData.picture = picture;
        updateTopZappers(); // Refresh display with updated profile info
    }
    
    // Update all chat messages and zaps from this author
    const authorElements = document.querySelectorAll(`[data-pubkey="${profile.pubkey}"]`);
    authorElements.forEach(element => {
        if (element.classList.contains('chat-author-img') || element.classList.contains('zap-author-img') || element.classList.contains('zapperProfileImg')) {
            element.src = picture;
        } else if (element.classList.contains('chat-author-name') || element.classList.contains('zap-author-name') || element.classList.contains('zapperName')) {
            element.textContent = name;
        }
    });
}

function updateLiveEventHostProfile(profile) {
    console.log("Updating live event host profile:", profile);
    
    const profileData = JSON.parse(profile.content || '{}');
    const picture = profileData.picture || "/images/gradient_color.gif";
    
    // Update the author profile image
    const authorImg = document.getElementById("authorNameProfileImg");
    if (authorImg) {
        authorImg.src = picture;
    }
}

function generateLiveEventQRCodes(liveEvent) {
    console.log("Generating QR codes for live event:", liveEvent);
    
    const identifier = liveEvent.tags.find(tag => tag[0] === "d")?.[1];
    const pubkey = liveEvent.pubkey;
    const kind = 30311;
    
    if (!identifier || !pubkey) {
        console.error("Missing identifier or pubkey for QR generation");
        return;
    }
    
    // Generate naddr
    const naddrId = NostrTools.nip19.naddrEncode({
        identifier: identifier,
        pubkey: pubkey,
        kind: kind,
        relays: []
    });
    
    const njumpUrl = "https://njump.me/" + naddrId;
    const nostrNaddr = "nostr:" + naddrId;
    
    // Generate QR codes
    const qrCode = new QRious({
        element: document.getElementById('qrCode'),
        value: njumpUrl,
        size: 200
    });
    
    const qrCodeNevent = new QRious({
        element: document.getElementById('qrCodeNevent'),
        value: nostrNaddr,
        size: 200
    });
    
    const qrCodeNote = new QRious({
        element: document.getElementById('qrCodeNote'),
        value: naddrId,
        size: 200
    });
    
    // Update QR code links
    document.getElementById('qrcodeLinkNostr').href = njumpUrl;
    document.getElementById('qrcodeNeventLink').href = nostrNaddr;
    document.getElementById('qrcodeNoteLink').href = naddrId;
    
    // Update QR data previews
    const preview1 = document.getElementById('qrDataPreview1');
    const preview2 = document.getElementById('qrDataPreview2');
    const preview3 = document.getElementById('qrDataPreview3');
    
    console.log("QR preview elements found:", { preview1: !!preview1, preview2: !!preview2, preview3: !!preview3 });
    
    if (preview1) {
        preview1.textContent = njumpUrl.slice(0, 20) + '...';
        console.log("Set preview1 to:", preview1.textContent);
    } else {
        console.error("qrDataPreview1 element not found");
    }
    
    if (preview2) {
        preview2.textContent = nostrNaddr.slice(0, 20) + '...';
        console.log("Set preview2 to:", preview2.textContent);
    } else {
        console.error("qrDataPreview2 element not found");
    }
    
    if (preview3) {
        preview3.textContent = naddrId.slice(0, 20) + '...';
        console.log("Set preview3 to:", preview3.textContent);
    } else {
        console.error("qrDataPreview3 element not found");
    }
}

function initializeLiveVideoPlayer(streamingUrl) {
    console.log("Initializing live video player with URL:", streamingUrl);
    
    const video = document.getElementById('live-video');
    const videoError = document.getElementById('video-error');
    
    if (!video) {
        console.error("Video element not found");
        return;
    }
    
    // Handle video errors
    video.addEventListener('error', function(e) {
        console.error("Video error:", e);
        showVideoError();
    });
    
    video.addEventListener('loadstart', function() {
        console.log("Video loading started");
        hideVideoError();
    });
    
    video.addEventListener('canplay', function() {
        console.log("Video can start playing");
        hideVideoError();
    });
    
    video.addEventListener('loadeddata', function() {
        console.log("Video data loaded");
    });
    
    // Handle different streaming formats
    if (streamingUrl.includes('.m3u8') || streamingUrl.includes('hls')) {
        // HLS stream - try to use HLS.js if available, otherwise rely on native support
        if (typeof Hls !== 'undefined' && Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(streamingUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                console.log("HLS manifest parsed, starting playback");
                video.play().catch(e => console.log("Autoplay prevented:", e));
            });
            hls.on(Hls.Events.ERROR, function(event, data) {
                console.error("HLS error:", data);
                if (data.fatal) {
                    showVideoError();
                }
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS support (Safari)
            video.src = streamingUrl;
            video.play().catch(e => console.log("Autoplay prevented:", e));
        } else {
            console.warn("HLS not supported, showing error");
            showVideoError();
        }
    } else {
        // Regular video formats (MP4, WebM, etc.)
        video.src = streamingUrl;
        video.play().catch(e => console.log("Autoplay prevented:", e));
    }
    
    function showVideoError() {
        if (video) video.style.display = 'none';
        if (videoError) videoError.style.display = 'block';
    }
    
    function hideVideoError() {
        if (video) video.style.display = 'block';
        if (videoError) videoError.style.display = 'none';
    }
}

async function processLiveEventZap(zapReceipt, eventPubkey, eventIdentifier) {
    console.log("Processing live event zap:", zapReceipt);
    
    try {
        // Extract zap information from the receipt
        const description9735 = zapReceipt.tags.find(tag => tag[0] === "description")[1];
        const zapRequest = JSON.parse(description9735);
        const bolt11 = zapReceipt.tags.find(tag => tag[0] === "bolt11")[1];
        const amount = lightningPayReq.decode(bolt11).satoshis;
        const zapperPubkey = zapRequest.pubkey;
        const zapContent = zapRequest.content || '';
        
        // Create zap display object similar to regular notes
        const zapData = {
            id: zapReceipt.id,
            amount: amount,
            content: zapContent,
            pubkey: zapperPubkey,
            timestamp: zapReceipt.created_at,
            bolt11: bolt11,
            zapEventID: NostrTools.nip19.noteEncode(zapReceipt.id)
        };
        
        // Subscribe to zapper's profile if we don't have it
        subscribeChatAuthorProfile(zapperPubkey);
        
        // Add to zapper totals accounting (profile will be updated when it arrives)
        addZapToTotals(zapperPubkey, amount);
        
        // Display the zap
        displayLiveEventZap(zapData);
        
    } catch (error) {
        console.error("Error processing live event zap:", error);
    }
}

function displayLiveEventZap(zapData) {
    console.log("Displaying live event zap:", zapData);
    
    const zapsContainer = document.getElementById("zaps");
    
    // Hide loading animation on first zap
    zapsContainer.classList.remove('loading');
    const loadingText = zapsContainer.querySelector('.loading-text');
    if (loadingText) loadingText.remove();
    
    // Get target containers - use columns for live events, main container for regular notes
    const activityContainer = document.getElementById("activity-list") || zapsContainer;
    const zapsOnlyContainer = document.getElementById("zaps-only-list");
    
    // Create zap element with chat-style layout for activity column
    const zapDiv = document.createElement("div");
    zapDiv.className = "live-event-zap";
    zapDiv.dataset.pubkey = zapData.pubkey;
    zapDiv.dataset.timestamp = zapData.timestamp;
    zapDiv.dataset.amount = zapData.amount;
    
    const timeStr = new Date(zapData.timestamp * 1000).toLocaleString();
    
    zapDiv.innerHTML = `
        <div class="zap-header">
            <img class="zap-author-img" src="/images/gradient_color.gif" data-pubkey="${zapData.pubkey}" />
            <div class="zap-info">
                <div class="zap-author-name" data-pubkey="${zapData.pubkey}">
                    ${zapData.pubkey.slice(0,8)}...
                </div>
                <div class="zap-time">${timeStr}</div>
            </div>
            <div class="zap-amount">
                <span class="zap-amount-sats">${numberWithCommas(zapData.amount)}</span>
                <span class="zap-amount-label">sats</span>
            </div>
        </div>
        ${zapData.content ? `
            <div class="zap-content">
                ${zapData.content}
            </div>
        ` : ''}
    `;
    
    // Insert zap in activity column (mixed with chat messages)
    const existingActivityItems = Array.from(activityContainer.querySelectorAll('.live-chat-message, .live-event-zap'));
    const activityInsertPosition = existingActivityItems.findIndex(item => 
        parseInt(item.dataset.timestamp) < zapData.timestamp
    );
    
    if (activityInsertPosition === -1) {
        // Add to end (oldest items at bottom)
        activityContainer.appendChild(zapDiv);
    } else {
        // Insert before the found position (newer items towards top)
        activityContainer.insertBefore(zapDiv, existingActivityItems[activityInsertPosition]);
    }
    
    // Also add to zaps-only column if it exists (for live events) - sorted by amount (highest first)
    // Use classic layout for left column
    if (zapsOnlyContainer) {
        const zapOnlyDiv = document.createElement("div");
        zapOnlyDiv.className = "zap live-event-zap zap-only-item";
        zapOnlyDiv.dataset.pubkey = zapData.pubkey;
        zapOnlyDiv.dataset.timestamp = zapData.timestamp;
        zapOnlyDiv.dataset.amount = zapData.amount;
        
        // Classic zap layout for left column
        zapOnlyDiv.innerHTML = `
            <div class="zapperProfile">
                <img class="zapperProfileImg" src="/images/gradient_color.gif" data-pubkey="${zapData.pubkey}" />
                <div class="zapperInfo">
                    <div class="zapperName" data-pubkey="${zapData.pubkey}">
                        ${zapData.pubkey.slice(0,8)}...
                    </div>
                    <div class="zapperMessage">${zapData.content || ''}</div>
                </div>
            </div>
            <div class="zapperAmount">
                <span class="zapperAmountSats">${numberWithCommas(zapData.amount)}</span>
                <span class="zapperAmountLabel">sats</span>
            </div>
        `;
        
        const existingZapItems = Array.from(zapsOnlyContainer.querySelectorAll('.live-event-zap'));
        const zapInsertPosition = existingZapItems.findIndex(item => 
            parseInt(item.dataset.amount || 0) < zapData.amount
        );
        
        if (zapInsertPosition === -1) {
            // Add to end (lowest amounts at bottom)
            zapsOnlyContainer.appendChild(zapOnlyDiv);
        } else {
            // Insert before the found position (higher amounts towards top)
            zapsOnlyContainer.insertBefore(zapOnlyDiv, existingZapItems[zapInsertPosition]);
        }
    }
    
    // Update total zapped amount
    updateLiveEventZapTotal();
}

function updateLiveEventZapTotal() {
    const zaps = Array.from(document.querySelectorAll('.live-event-zap'));
    const totalAmount = zaps.reduce((sum, zap) => {
        return sum + parseInt(zap.dataset.amount || 0);
    }, 0);
    const totalCount = zaps.length;
    
    document.getElementById("zappedTotalValue").innerText = numberWithCommas(totalAmount);
    document.getElementById("zappedTotalCount").innerText = numberWithCommas(totalCount);
}

function updateRegularNoteZapTotal() {
    const zaps = Array.from(document.querySelectorAll('.zap'));
    let totalAmount = 0;
    let totalCount = 0;
    
    zaps.forEach(zap => {
        const amountElement = zap.querySelector('.zapperAmountSats');
        if (amountElement) {
            // Extract numeric value from the text content (remove commas and 'sats')
            const amountText = amountElement.textContent.replace(/[^\d]/g, '');
            const amount = parseInt(amountText) || 0;
            totalAmount += amount;
            totalCount++;
        }
    });
    
    const totalValueElement = document.getElementById("zappedTotalValue");
    const totalCountElement = document.getElementById("zappedTotalCount");
    
    if (totalValueElement) {
        totalValueElement.innerText = numberWithCommas(totalAmount);
    }
    if (totalCountElement) {
        totalCountElement.innerText = numberWithCommas(totalCount);
    }
}

// Universal function that works for both live events and regular notes
function updateZapTotal() {
    // Check if we have live event zaps
    const liveEventZaps = document.querySelectorAll('.live-event-zap');
    if (liveEventZaps.length > 0) {
        updateLiveEventZapTotal();
    } else {
        // Use regular note zap counting
        updateRegularNoteZapTotal();
    }
}

/*

Style Options

*/


function toggleStyleOptionsModal(){
    const styleOptionsModal = document.getElementById("styleOptionsModal");
    const isOpen = styleOptionsModal.classList.contains("show");
    
    if (isOpen) {
        styleOptionsModal.classList.remove("show");
        document.body.classList.remove("style-panel-open");
    } else {
        styleOptionsModal.classList.add("show");
        document.body.classList.add("style-panel-open");
    }
}



// Add modal toggle functionality
document.querySelectorAll('.styleOptionsModalToggle').forEach(function(toggle) {
    toggle.addEventListener('click', function() {
        document.getElementById('styleOptionsModal').classList.add('show');
        document.body.classList.add('style-panel-open');
    });
});

// Add event listener for the style toggle button in the bottom bar
document.getElementById('styleToggleBtn').addEventListener('click', function() {
    toggleStyleOptionsModal();
});

document.querySelector('#styleOptionsModal .close-button').addEventListener('click', function() {
    document.getElementById('styleOptionsModal').classList.remove('show');
    document.body.classList.remove('style-panel-open');
});

// Close modal when clicking outside
document.getElementById('styleOptionsModal').addEventListener('click', function(e) {
    if (e.target === this) {
        this.classList.remove('show');
        document.body.classList.remove('style-panel-open');
    }
});

// Color picker functionality
function setupColorPicker(pickerId, valueId, targetProperty) {
    const picker = document.getElementById(pickerId);
    const value = document.getElementById(valueId);
    const liveElement = document.querySelector('.live');
    const mainLayout = document.querySelector('.main-layout');

    // Update text input when color picker changes
    picker.addEventListener('input', function(e) {
        const color = toHexColor(e.target.value);
        value.value = color;
        
        if (targetProperty === 'backgroundColor') {
            // For background color, update the main-layout with current opacity
            const currentOpacity = parseFloat(document.getElementById('opacitySlider').value);
            const rgbaColor = hexToRgba(color, currentOpacity);
            mainLayout.style.backgroundColor = rgbaColor;
        } else if (targetProperty === 'color') {
            // For text color, use CSS custom property for consistent inheritance
            mainLayout.style.setProperty('--text-color', color);
            
            // Also specifically override zaps header elements that have hardcoded colors
            const zapsHeaderH2 = mainLayout.querySelector('.zaps-header-left h2');
            const totalLabel = mainLayout.querySelector('.total-label');
            const totalSats = mainLayout.querySelector('.total-sats');
            
            if (zapsHeaderH2) zapsHeaderH2.style.color = color;
            if (totalLabel) totalLabel.style.color = color;
            if (totalSats) totalSats.style.color = color;
        } else {
            // For other properties, update the live element
            liveElement.style[targetProperty] = color;
        }
        
        updateStyleURL();
    });

    // Update color picker when text input changes
    value.addEventListener('input', function(e) {
        const color = toHexColor(e.target.value);
        if (isValidHexColor(color)) {
            picker.value = color;
            
            if (targetProperty === 'backgroundColor') {
                // For background color, update the main-layout with current opacity
                const currentOpacity = parseFloat(document.getElementById('opacitySlider').value);
                const rgbaColor = hexToRgba(color, currentOpacity);
                mainLayout.style.backgroundColor = rgbaColor;
            } else if (targetProperty === 'color') {
                // For text color, use CSS custom property for consistent inheritance
                mainLayout.style.setProperty('--text-color', color);
                
                // Apply color to specific elements that need hardcoded color overrides
                // Elements that use var(--text-color) in CSS should not get inline styles
                const hardcodedElements = mainLayout.querySelectorAll(`
                    .zaps-header-left h2,
                    .total-label,
                    .total-sats,
                    .total-amount,
                    .dashboard-title,
                    .author-name,
                    .note-content,
                    .note-content *,
                    .section-label,
                    .qr-instructions
                `);
                
                hardcodedElements.forEach(element => {
                    element.style.color = color;
                });
                
                // Elements using var(--text-color) will automatically update via CSS
            } else {
                // For other properties, update the live element
                liveElement.style[targetProperty] = color;
            }
            
            updateStyleURL();
        }
    });
}

// Helper function to convert hex color to rgba with transparency
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Helper function to convert hex color to rgb object
function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
}

// CSS has been moved to style.css

// Background image functionality
function updateBackgroundImage(url) {
    if (url && url.trim() !== '') {
        liveZapOverlay.style.backgroundImage = `url("${url}")`;
        liveZapOverlay.style.backgroundSize = 'cover';
        liveZapOverlay.style.backgroundPosition = 'center';
        liveZapOverlay.style.backgroundRepeat = 'no-repeat';
        const preview = document.getElementById('bgPresetPreview');
        if (preview) preview.src = url;
    } else {
        liveZapOverlay.style.backgroundImage = 'none';
        const preview = document.getElementById('bgPresetPreview');
        if (preview) preview.src = '';
    }
}

function updateBlendMode() {
    const qrScreenBlendToggle = document.getElementById('qrScreenBlendToggle');
    const qrMultiplyBlendToggle = document.getElementById('qrMultiplyBlendToggle');
    
    if (qrScreenBlendToggle.checked) {
        qrMultiplyBlendToggle.checked = false;
        document.body.classList.add('qr-blend-active');
        document.body.classList.remove('qr-multiply-active');
    } else if (qrMultiplyBlendToggle.checked) {
        qrScreenBlendToggle.checked = false;
        document.body.classList.add('qr-blend-active');
        document.body.classList.add('qr-multiply-active');
    } else {
        document.body.classList.remove('qr-blend-active');
        document.body.classList.remove('qr-multiply-active');
    }
    updateStyleURL();
}

// Preset functions
function applyPreset(presetName) {
    console.log('applyPreset called with:', presetName);
    const preset = STYLE_PRESETS[presetName];
    if (!preset) {
        console.error('Preset not found:', presetName);
        return;
    }
    console.log('Applying preset:', preset);
    
    // Update all controls
    document.getElementById('textColorPicker').value = preset.textColor;
    document.getElementById('textColorValue').value = preset.textColor;
    document.getElementById('bgColorPicker').value = preset.bgColor;
    document.getElementById('bgColorValue').value = preset.bgColor;
    document.getElementById('bgImageUrl').value = preset.bgImage;
    
    // Reset background image preset dropdown
    const bgImagePreset = document.getElementById('bgImagePreset');
    if (bgImagePreset) {
        if (preset.bgImage === '') {
            bgImagePreset.value = '';
        } else {
            // Find the option that matches the preset's bgImage
            const matchingOption = Array.from(bgImagePreset.options).find(option => option.value === preset.bgImage);
            if (matchingOption) {
                bgImagePreset.value = preset.bgImage;
            } else {
                // If it's a custom URL, set to "custom"
                bgImagePreset.value = 'custom';
            }
        }
    }
    document.getElementById('qrInvertToggle').checked = preset.qrInvert;
    document.getElementById('qrScreenBlendToggle').checked = preset.qrScreenBlend;
    document.getElementById('qrMultiplyBlendToggle').checked = preset.qrMultiplyBlend;
    document.getElementById('layoutInvertToggle').checked = preset.layoutInvert;
    document.getElementById('hideZapperContentToggle').checked = preset.hideZapperContent;
    document.getElementById('showTopZappersToggle').checked = preset.showTopZappers;
    document.getElementById('podiumToggle').checked = preset.podium;
    document.getElementById('zapGridToggle').checked = preset.zapGrid;
    // Font size slider disabled - using CSS vw units
    // document.getElementById('fontSizeSlider').value = preset.fontSize;
    // document.getElementById('fontSizeValue').textContent = Math.round(preset.fontSize * 100) + '%';
    document.getElementById('opacitySlider').value = preset.opacity;
    document.getElementById('opacityValue').textContent = Math.round(preset.opacity * 100) + '%';
    document.getElementById('textOpacitySlider').value = preset.textOpacity;
    document.getElementById('textOpacityValue').textContent = Math.round(preset.textOpacity * 100) + '%';
    
    // Reset partner logo
    const partnerLogoSelect = document.getElementById('partnerLogoSelect');
    const partnerLogoImg = document.getElementById('partnerLogo');
    const partnerLogoUrl = document.getElementById('partnerLogoUrl');
    const customPartnerLogoGroup = document.getElementById('customPartnerLogoGroup');
    const partnerLogoPreview = document.getElementById('partnerLogoPreview');
    
    if (partnerLogoSelect) {
        const logoValue = preset.partnerLogo || '';
        
        // Check if it's a predefined option
        const matchingOption = Array.from(partnerLogoSelect.options).find(option => option.value === logoValue);
        if (matchingOption) {
            partnerLogoSelect.value = logoValue;
            if (customPartnerLogoGroup) customPartnerLogoGroup.style.display = 'none';
        } else if (logoValue) {
            // It's a custom URL
            partnerLogoSelect.value = 'custom';
            if (customPartnerLogoGroup) customPartnerLogoGroup.style.display = 'block';
            if (partnerLogoUrl) partnerLogoUrl.value = logoValue;
        } else {
            // No logo
            partnerLogoSelect.value = '';
            if (customPartnerLogoGroup) customPartnerLogoGroup.style.display = 'none';
            if (partnerLogoUrl) partnerLogoUrl.value = '';
        }
    }
    
    if (partnerLogoImg) {
        const logoValue = preset.partnerLogo || '';
        if (logoValue) {
            partnerLogoImg.src = logoValue;
            partnerLogoImg.style.display = 'inline-block';
        } else {
            partnerLogoImg.style.display = 'none';
            partnerLogoImg.src = '';
        }
    }
    
    // Update partner logo preview
    if (partnerLogoPreview) {
        const logoValue = preset.partnerLogo || '';
        if (logoValue) {
            partnerLogoPreview.src = logoValue;
            partnerLogoPreview.alt = 'Partner logo preview';
        } else {
            partnerLogoPreview.src = '';
            partnerLogoPreview.alt = 'No partner logo';
        }
    }
    
    // Apply the styles
    applyAllStyles();
    
    // Update active preset button
    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-preset="${presetName}"]`).classList.add('active');
}

// Helper function to strip nostr: protocol prefix
function stripNostrPrefix(input) {
    if (input && input.startsWith('nostr:')) {
        return input.substring(6); // Remove 'nostr:' prefix
    }
    return input;
}

function showNoteLoaderError(message) {
    const errorElement = document.getElementById('noteLoaderError');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

function hideNoteLoaderError() {
    const errorElement = document.getElementById('noteLoaderError');
    if (errorElement) {
        errorElement.style.display = 'none';
    }
}

function showLoadingError(message) {
    const errorElement = document.getElementById('noteLoaderError');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
    
    // Ensure noteLoader is visible and main layout is hidden when there's an error
    const noteLoaderContainer = document.getElementById('noteLoaderContainer');
    const mainLayout = document.getElementById('mainLayout');
    
    if (noteLoaderContainer) {
        noteLoaderContainer.style.display = 'flex';
    }
    
    if (mainLayout) {
        mainLayout.style.display = 'none';
    }
}

function initializePortraitSwiper() {
    const swiperElement = document.querySelector('.portrait-swiper .swiper');
    if (!swiperElement) return;
    
    // Initialize Swiper.js
    const swiper = new Swiper(swiperElement, {
        // Basic settings
        loop: true,
        autoplay: {
            delay: 4000,
            disableOnInteraction: false,
        },
        
        // Touch/Swipe settings
        touchRatio: 1,
        touchAngle: 45,
        grabCursor: true,
        
        // Transition settings
        speed: 800,
        effect: 'slide',
        slidesPerView: 1,
        spaceBetween: 0,
        
        // Responsive breakpoints
        breakpoints: {
            320: {
                slidesPerView: 1,
                spaceBetween: 0,
            },
            768: {
                slidesPerView: 1,
                spaceBetween: 0,
            },
            1024: {
                slidesPerView: 1,
                spaceBetween: 0,
            }
        },
        
        // Event callbacks
        on: {
            init: function () {
                console.log('Portrait Swiper initialized');
            },
            slideChange: function () {
                console.log('Slide changed to:', this.activeIndex);
            }
        }
    });
    
    return swiper;
}

function initializeFontSizes() {
    const mainLayout = document.querySelector('.main-layout');
    if (!mainLayout) return;
    
    const elementsToScale = [
        '.author-name',
        '.note-content', 
        '.zapperName',
        '.dashboard-title',
        '.total-label',
        '.total-amount',
        '.total-sats',
        '.section-label',
        '.qr-instructions',
        '.zapperAmountSats',
        '.zapperMessage'
    ];
    
    window.originalFontSizes = new Map();
    elementsToScale.forEach(selector => {
        const elements = mainLayout.querySelectorAll(selector);
        elements.forEach(element => {
            const computedStyle = window.getComputedStyle(element);
            const originalSize = computedStyle.fontSize;
            window.originalFontSizes.set(element, originalSize);
        });
    });
}

function applyAllStyles() {
    console.log('applyAllStyles called');
    const mainLayout = document.querySelector('.main-layout');
    
    if (!mainLayout) {
        console.error('mainLayout not found in applyAllStyles');
        return;
    }
    
    const textColorElement = document.getElementById('textColorValue');
    const bgColorElement = document.getElementById('bgColorValue');
    const bgImageElement = document.getElementById('bgImageUrl');
    
    if (!textColorElement || !bgColorElement || !bgImageElement) {
        console.error('Style input elements not found:', { textColorElement, bgColorElement, bgImageElement });
        return;
    }
    
    const textColor = textColorElement.value;
    const bgColor = bgColorElement.value;
    const bgImage = bgImageElement.value;
    console.log('Style values:', { textColor, bgColor, bgImage });
    // Font size no longer controlled by JavaScript - using CSS vw units
    // const fontSize = parseFloat(document.getElementById('fontSizeSlider').value);
    const opacity = parseFloat(document.getElementById('opacitySlider').value);
    const textOpacity = parseFloat(document.getElementById('textOpacitySlider').value);
    
    // Apply text color with opacity
    const rgbaTextColor = hexToRgba(textColor, textOpacity);
    mainLayout.style.setProperty('--text-color', rgbaTextColor);
    
    // Apply color to specific elements that need hardcoded color overrides
    // Elements that use var(--text-color) in CSS should not get inline styles
    const hardcodedElements = mainLayout.querySelectorAll(`
        .zaps-header-left h2,
        .total-label,
        .total-sats,
        .total-amount,
        .dashboard-title,
        .author-name,
        .note-content,
        .note-content *,
        .section-label,
        .qr-instructions
    `);
    
    hardcodedElements.forEach(element => {
        element.style.color = textColor;
    });
    
    // Elements using var(--text-color) will automatically update via CSS:
    // .zapperName, .zapperAmountSats, .zapperAmountLabel, .zapperMessage
    
    // Apply background color with opacity
    const rgbaColor = hexToRgba(bgColor, opacity);
    mainLayout.style.backgroundColor = rgbaColor;
    
    // Apply background image
    updateBackgroundImage(bgImage);
    
    // Font sizes are now controlled by CSS using vw units
    // No JavaScript font scaling needed
    
    // Apply QR code effects
    const qrCodeContainers = [
        document.getElementById('qrCode'),
        document.getElementById('qrCodeNevent'),
        document.getElementById('qrCodeNote')
    ];
    qrCodeContainers.forEach(qrCodeContainer => {
        if (qrCodeContainer) {
            qrCodeContainer.style.filter = document.getElementById('qrInvertToggle').checked ? 'invert(1)' : 'none';
        }
    });
    updateBlendMode();
    
    // Apply layout effects
    document.body.classList.toggle('flex-direction-invert', document.getElementById('layoutInvertToggle').checked);
    document.body.classList.toggle('hide-zapper-content', document.getElementById('hideZapperContentToggle').checked);
    document.body.classList.toggle('podium-enabled', document.getElementById('podiumToggle').checked);
    
    // Apply zap grid layout
    const zapsList = document.getElementById('zaps');
    if (zapsList) {
        const isGridLayout = document.getElementById('zapGridToggle').checked;
        zapsList.classList.toggle('grid-layout', isGridLayout);
        if (isGridLayout) {
            organizeZapsHierarchically();
        } else {
            cleanupHierarchicalOrganization();
        }
    }
    
    // Scrollbar colors now derived directly from --text-color variable in CSS using color-mix()
    
    updateStyleURL();
}

function resetToDefaults() {
    // Clear localStorage to remove saved customizations
    localStorage.removeItem('nostrpay-styles');
    console.log('Cleared localStorage - resetting to defaults');
    
    // Apply light mode preset
    applyPreset('lightMode');
}

function copyStyleUrl() {
    // Get current styles from localStorage
    const savedStyles = localStorage.getItem('nostrpay-styles');
    let urlToCopy = window.location.origin + window.location.pathname;
    
    if (savedStyles) {
        try {
            const styles = JSON.parse(savedStyles);
            const params = new URLSearchParams();
            
            // Add style parameters that differ from defaults
            if (styles.textColor && styles.textColor !== DEFAULT_STYLES.textColor) {
                params.set('textColor', styles.textColor);
            }
            if (styles.bgColor && styles.bgColor !== DEFAULT_STYLES.bgColor) {
                params.set('bgColor', styles.bgColor);
            }
            if (styles.bgImage && styles.bgImage !== DEFAULT_STYLES.bgImage) {
                params.set('bgImage', styles.bgImage);
            }
            if (styles.qrInvert !== DEFAULT_STYLES.qrInvert) {
                params.set('qrInvert', styles.qrInvert);
            }
            if (styles.qrScreenBlend !== DEFAULT_STYLES.qrScreenBlend) {
                params.set('qrScreenBlend', styles.qrScreenBlend);
            }
            if (styles.qrMultiplyBlend !== DEFAULT_STYLES.qrMultiplyBlend) {
                params.set('qrMultiplyBlend', styles.qrMultiplyBlend);
            }
            if (styles.qrShowWebLink !== DEFAULT_STYLES.qrShowWebLink) {
                params.set('qrShowWebLink', styles.qrShowWebLink);
            }
            if (styles.qrShowNevent !== DEFAULT_STYLES.qrShowNevent) {
                params.set('qrShowNevent', styles.qrShowNevent);
            }
            if (styles.qrShowNote !== DEFAULT_STYLES.qrShowNote) {
                params.set('qrShowNote', styles.qrShowNote);
            }
            if (styles.layoutInvert !== DEFAULT_STYLES.layoutInvert) {
                params.set('layoutInvert', styles.layoutInvert);
            }
            if (styles.hideZapperContent !== DEFAULT_STYLES.hideZapperContent) {
                params.set('hideZapperContent', styles.hideZapperContent);
            }
            if (styles.showTopZappers !== DEFAULT_STYLES.showTopZappers) {
                params.set('showTopZappers', styles.showTopZappers);
            }
            if (styles.podium !== DEFAULT_STYLES.podium) {
                params.set('podium', styles.podium);
            }
            if (styles.zapGrid !== DEFAULT_STYLES.zapGrid) {
                params.set('zapGrid', styles.zapGrid);
            }
            // Font size disabled - using CSS vw units
            // if (styles.fontSize !== DEFAULT_STYLES.fontSize) {
            //     params.set('fontSize', styles.fontSize);
            // }
            if (styles.opacity !== DEFAULT_STYLES.opacity) {
                params.set('opacity', styles.opacity);
            }
            if (styles.textOpacity !== DEFAULT_STYLES.textOpacity) {
                params.set('textOpacity', styles.textOpacity);
            }
            if (styles.partnerLogo && styles.partnerLogo !== DEFAULT_STYLES.partnerLogo) {
                params.set('partnerLogo', encodeURIComponent(styles.partnerLogo));
            }
            
            // Add parameters to URL if any exist
            if (params.toString()) {
                urlToCopy += '?' + params.toString();
            }
        } catch (e) {
            console.error('Error parsing saved styles:', e);
        }
    }
    
    navigator.clipboard.writeText(urlToCopy).then(() => {
        // Show feedback
        const btn = document.getElementById('copyStyleUrl');
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.background = '#28a745';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy URL:', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
    });
}

// Setup style options after DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        setupStyleOptions();
    });
} else {
    // DOM is already loaded
    setupStyleOptions();
}

function setupStyleOptions() {
    // Setup both color pickers
    setupColorPicker('textColorPicker', 'textColorValue', 'color');
    setupColorPicker('bgColorPicker', 'bgColorValue', 'backgroundColor');
    
    // Background image functionality
    const bgImagePreset = document.getElementById('bgImagePreset');
    const bgImageUrl = document.getElementById('bgImageUrl');
    const bgPresetPreview = document.getElementById('bgPresetPreview');
    const clearBgImage = document.getElementById('clearBgImage');
    const customUrlGroup = document.getElementById('customUrlGroup');
    
    console.log('bgPresetPreview element found:', bgPresetPreview);
    
    // Handle background preset selection
    bgImagePreset.addEventListener('change', function(e) {
        const selectedValue = e.target.value;
        console.log('Selected background:', selectedValue);
        
        if (selectedValue === 'custom') {
            // Show custom URL input
            customUrlGroup.style.display = 'block';
            bgImageUrl.focus();
        } else {
            // Hide custom URL input and apply preset
            customUrlGroup.style.display = 'none';
            bgImageUrl.value = selectedValue;
            updateBackgroundImage(selectedValue);
            updateStyleURL();
            applyAllStyles(); // Sync all style controls
            
            // Update preview directly
            console.log('Updating preview to:', selectedValue);
            console.log('bgPresetPreview element:', bgPresetPreview);
            if (bgPresetPreview) {
                bgPresetPreview.src = selectedValue;
                bgPresetPreview.alt = selectedValue ? 'Background preview' : 'No background';
                console.log('Preview src set to:', bgPresetPreview.src);
            } else {
                console.error('bgPresetPreview element not found!');
            }
        }
    });
    
    // Update background when URL changes
    bgImageUrl.addEventListener('input', function(e) {
        const url = e.target.value.trim();
        if (url) {
            // Test if the image loads
            const img = new Image();
            img.onload = function() {
                updateBackgroundImage(url);
                updateStyleURL();
                applyAllStyles(); // Sync all style controls
                bgPresetPreview.src = url;
                bgPresetPreview.alt = 'Background preview';
            };
            img.onerror = function() {
                // If image fails to load, show error in preview
                bgPresetPreview.src = '';
                bgPresetPreview.alt = 'Failed to load image';
            };
            img.src = url;
        } else {
            updateBackgroundImage('');
            updateStyleURL();
            applyAllStyles(); // Sync all style controls
            bgPresetPreview.src = '';
            bgPresetPreview.alt = 'No background';
        }
    });
    
    // Clear background image
    clearBgImage.addEventListener('click', function() {
        bgImageUrl.value = '';
        bgImagePreset.value = '';
        customUrlGroup.style.display = 'none';
        updateBackgroundImage('');
        updateStyleURL();
        applyAllStyles(); // Sync all style controls
        bgPresetPreview.src = '';
        bgPresetPreview.alt = 'No background';
    });
    
    // Partner logo functionality
    const partnerLogoSelect = document.getElementById('partnerLogoSelect');
    const partnerLogoImg = document.getElementById('partnerLogo');
    const partnerLogoUrl = document.getElementById('partnerLogoUrl');
    const customPartnerLogoGroup = document.getElementById('customPartnerLogoGroup');
    const clearPartnerLogo = document.getElementById('clearPartnerLogo');
    const partnerLogoPreview = document.getElementById('partnerLogoPreview');
    
    if (partnerLogoSelect && partnerLogoImg) {
        partnerLogoSelect.addEventListener('change', function(e) {
            const selectedValue = e.target.value;
            console.log('Selected partner logo:', selectedValue);
            
            if (selectedValue === 'custom') {
                // Show custom URL input
                customPartnerLogoGroup.style.display = 'block';
                partnerLogoImg.style.display = 'none';
                partnerLogoImg.src = '';
                
                // Clear preview
                if (partnerLogoPreview) {
                    partnerLogoPreview.src = '';
                    partnerLogoPreview.alt = 'Enter custom URL';
                }
            } else if (selectedValue) {
                // Use predefined logo
                customPartnerLogoGroup.style.display = 'none';
                partnerLogoImg.src = selectedValue;
                partnerLogoImg.style.display = 'inline-block';
                
                // Update preview
                if (partnerLogoPreview) {
                    partnerLogoPreview.src = selectedValue;
                    partnerLogoPreview.alt = 'Partner logo preview';
                }
                
                // Update styles (updateStyleURL handles localStorage)
                updateStyleURL();
            } else {
                // No logo
                customPartnerLogoGroup.style.display = 'none';
                partnerLogoImg.style.display = 'none';
                partnerLogoImg.src = '';
                
                // Clear preview
                if (partnerLogoPreview) {
                    partnerLogoPreview.src = '';
                    partnerLogoPreview.alt = 'No partner logo';
                }
                
                // Update styles (updateStyleURL handles localStorage)
                updateStyleURL();
            }
        });
        
        // Custom URL input handler
        if (partnerLogoUrl) {
            partnerLogoUrl.addEventListener('input', function(e) {
                const url = e.target.value.trim();
                if (url) {
                    partnerLogoImg.src = url;
                    partnerLogoImg.style.display = 'inline-block';
                    
                    // Update preview
                    if (partnerLogoPreview) {
                        partnerLogoPreview.src = url;
                        partnerLogoPreview.alt = 'Partner logo preview';
                    }
                    
                    // Update styles (updateStyleURL handles localStorage)
                    updateStyleURL();
                } else {
                    partnerLogoImg.style.display = 'none';
                    partnerLogoImg.src = '';
                    
                    // Clear preview
                    if (partnerLogoPreview) {
                        partnerLogoPreview.src = '';
                        partnerLogoPreview.alt = 'Enter custom URL';
                    }
                }
            });
        }
        
        // Clear partner logo button
        if (clearPartnerLogo) {
            clearPartnerLogo.addEventListener('click', function() {
                partnerLogoUrl.value = '';
                partnerLogoSelect.value = '';
                customPartnerLogoGroup.style.display = 'none';
                partnerLogoImg.style.display = 'none';
                partnerLogoImg.src = '';
                
                // Clear preview
                if (partnerLogoPreview) {
                    partnerLogoPreview.src = '';
                    partnerLogoPreview.alt = 'No partner logo';
                }
                
                // Update styles (updateStyleURL handles localStorage)
                updateStyleURL();
            });
        }
        
        // Partner logo initialization is now handled by applyStylesFromLocalStorage()
        // which reads from the combined 'nostrpay-styles' localStorage key
    }
    
    // QR Code toggles
    const qrInvertToggle = document.getElementById('qrInvertToggle');
    const qrScreenBlendToggle = document.getElementById('qrScreenBlendToggle');
    const qrMultiplyBlendToggle = document.getElementById('qrMultiplyBlendToggle');
    const layoutInvertToggle = document.getElementById('layoutInvertToggle');
    const hideZapperContentToggle = document.getElementById('hideZapperContentToggle');
    
    qrInvertToggle.addEventListener('change', function(e) {
        const qrCodes = [
            document.getElementById('qrCode'),
            document.getElementById('qrCodeNevent'),
            document.getElementById('qrCodeNote')
        ];
        qrCodes.forEach(qrCode => {
            if (qrCode) qrCode.style.filter = e.target.checked ? 'invert(1)' : 'none';
        });
        updateStyleURL();
    });
    
    qrScreenBlendToggle.addEventListener('change', function(e) {
        if (e.target.checked) {
            qrMultiplyBlendToggle.checked = false;
        }
        updateBlendMode();
    });
    
    qrMultiplyBlendToggle.addEventListener('change', function(e) {
        if (e.target.checked) {
            qrScreenBlendToggle.checked = false;
        }
        updateBlendMode();
    });
    
    // QR slide visibility toggles
    const qrShowWebLinkToggle = document.getElementById('qrShowWebLinkToggle');
    const qrShowNeventToggle = document.getElementById('qrShowNeventToggle');
    const qrShowNoteToggle = document.getElementById('qrShowNoteToggle');
    
    function updateQRSlideVisibility(skipURLUpdate = false) {
        const webLinkToggle = document.getElementById('qrShowWebLinkToggle');
        const neventToggle = document.getElementById('qrShowNeventToggle');
        const noteToggle = document.getElementById('qrShowNoteToggle');
        
        const showWebLink = webLinkToggle?.checked ?? true;
        const showNevent = neventToggle?.checked ?? true;
        const showNote = noteToggle?.checked ?? true;
        
        console.log('updateQRSlideVisibility called:', {
            showWebLink, showNevent, showNote
        });
        
        // Rebuild swiper with only visible slides
        if (window.qrSwiper) {
            window.qrSwiper.destroy(true, true);
            window.qrSwiper = null;
        }
        
        // Get the swiper wrapper and clear it
        const swiperWrapper = document.querySelector('.qr-swiper .swiper-wrapper');
        if (swiperWrapper) {
            // Store Lightning QR slide if it exists and is enabled
            const lightningSlide = document.getElementById('lightningQRSlide');
            const shouldPreserveLightning = lightningSlide && lightningSlide.style.display !== 'none' && window.lightningEnabled;
            
            console.log('updateQRSlideVisibility - Lightning check:', {
                lightningSlide: !!lightningSlide,
                display: lightningSlide?.style.display,
                windowLightningEnabled: window.lightningEnabled,
                shouldPreserveLightning
            });
            
            swiperWrapper.innerHTML = '';
            
            // Add slides based on visibility settings
            const slideConfigs = [
                { 
                    show: showWebLink, 
                    id: 'qrCode', 
                    linkId: 'qrcodeLinkNostr',
                    previewId: 'qrDataPreview1',
                    label: 'Web Link'
                },
                { 
                    show: showNevent, 
                    id: 'qrCodeNevent', 
                    linkId: 'qrcodeNeventLink',
                    previewId: 'qrDataPreview2',
                    label: 'Nostr Event'
                },
                { 
                    show: showNote, 
                    id: 'qrCodeNote', 
                    linkId: 'qrcodeNoteLink',
                    previewId: 'qrDataPreview3',
                    label: 'Note ID'
                },
                { 
                    show: window.lightningEnabled, 
                    id: 'lightningQRCode', 
                    linkId: null,
                    previewId: 'qrDataPreview4',
                    label: 'Lightning Payment'
                }
            ];
            
            slideConfigs.forEach(config => {
                if (config.show) {
                    const slide = document.createElement('div');
                    slide.className = 'swiper-slide';
                    
                    if (config.linkId) {
                        // Regular QR with link
                        slide.innerHTML = `
                            <a href="" target="_blank" id="${config.linkId}">
                                <img id="${config.id}" class="qr-code">
                            </a>
                            <div class="qr-slide-label">${config.label} <span class="qr-data-preview" id="${config.previewId}"></span></div>
                        `;
                    } else {
                        // Lightning QR with link
                        slide.innerHTML = `
                            <a href="" target="_blank" id="lightningQRLink">
                                <img id="${config.id}" class="qr-code lightning-qr">
                            </a>
                            <div class="qr-slide-label">${config.label} <span class="qr-data-preview" id="${config.previewId}"></span></div>
                        `;
                    }
                    
                    swiperWrapper.appendChild(slide);
                }
            });
            
            
            // Reinitialize swiper
            window.qrSwiper = new Swiper('.qr-swiper', {
                slidesPerView: 1,
                spaceBetween: 0,
                pagination: {
                    el: '.swiper-pagination',
                    clickable: true,
                    dynamicBullets: false
                },
                loop: swiperWrapper.children.length > 1, // Only loop if more than 1 slide
                autoplay: swiperWrapper.children.length > 1 ? {
                    delay: 3000,
                    disableOnInteraction: false,
                    pauseOnMouseEnter: true
                } : false,
                autoHeight: false,
                height: 250,
                watchOverflow: true,
                observer: true,
                observeParents: true
            });
            
            // Re-generate QR codes for visible slides
            regenerateQRCodes();
        }
        
        if (!skipURLUpdate) {
            updateStyleURL();
        }
    }
    
    // Function to regenerate QR codes for visible slides
    function regenerateQRCodes() {
        // Get current note ID
        const noteId = window.currentNoteId;
        
        if (!noteId) return;
        
        // Generate QR code data
        const neventId = NostrTools.nip19.neventEncode({ id: noteId, relays: [] });
        const note1Id = NostrTools.nip19.noteEncode(noteId);
        const njumpUrl = "https://njump.me/" + note1Id;
        const nostrNevent = "nostr:" + neventId;
        const nostrNote = "nostr:" + note1Id;
        
        const qrSize = Math.min(window.innerWidth * 0.6, window.innerHeight * 0.7);
        
        // Generate QR codes for visible slides
        const qrConfigs = [
            { id: 'qrCode', value: njumpUrl, linkId: 'qrcodeLinkNostr', previewId: 'qrDataPreview1' },
            { id: 'qrCodeNevent', value: nostrNevent, linkId: 'qrcodeNeventLink', previewId: 'qrDataPreview2' },
            { id: 'qrCodeNote', value: nostrNote, linkId: 'qrcodeNoteLink', previewId: 'qrDataPreview3' }
        ];
        
        // Add Lightning QR if enabled
        if (window.lightningEnabled && window.lightningLNURL) {
            qrConfigs.push({
                id: 'lightningQRCode',
                value: window.lightningLNURL,
                linkId: 'lightningQRLink',
                previewId: 'qrDataPreview4'
            });
            console.log('Added Lightning QR to qrConfigs:', window.lightningLNURL);
        }
        
        
        qrConfigs.forEach(({ id, value, linkId, previewId }) => {
            const element = document.getElementById(id);
            const link = document.getElementById(linkId);
            const preview = document.getElementById(previewId);
            
            console.log(`Processing QR config: ${id}`, { element: !!element, value, linkId, previewId });
            
            if (element) {
                element.innerHTML = "";
                new QRious({
                    element: element,
                    size: qrSize,
                    value: value
                });
                console.log(`Generated QR for ${id}:`, element.innerHTML);
                
                if (link) {
                    // For Lightning QR, use lightning: URI format
                    if (id === 'lightningQRCode') {
                        link.href = `lightning:${value}`;
                    } else {
                        link.href = value;
                    }
                }
                
                if (preview) {
                    let previewText = value;
                    let maxLength = 10; // Default for nostr formats
                    
                    if (previewText.startsWith('https://')) {
                        previewText = previewText.substring(8);
                        maxLength = 20; // Show more for web links
                    } else if (previewText.startsWith('nostr:')) {
                        previewText = previewText.substring(6);
                    } else if (previewText.startsWith('LNURL')) {
                        maxLength = 15; // Lightning URLs
                    }
                    // Always add ellipsis to show truncation
                    previewText = previewText.substring(0, maxLength) + '...';
                    preview.textContent = previewText;
                }
            } else {
                console.log(`Element not found for ${id}`);
            }
        });
        
        
        // Apply current QR effects
        const qrInvertToggle = document.getElementById('qrInvertToggle');
        if (qrInvertToggle?.checked) {
            const qrCodes = [
                document.getElementById('qrCode'),
                document.getElementById('qrCodeNevent'),
                document.getElementById('qrCodeNote')
            ];
            
            // Include Lightning QR in invert effect if enabled
            if (window.lightningEnabled) {
                qrCodes.push(document.getElementById('lightningQRCode'));
            }
            
            qrCodes.forEach(qrCode => {
                if (qrCode) qrCode.style.filter = 'invert(1)';
            });
        }
        
        // Apply blend mode
        updateBlendMode();
    }
    
    // Make functions globally accessible
    window.updateQRSlideVisibility = updateQRSlideVisibility;
    window.regenerateQRCodes = regenerateQRCodes;
    
    if (qrShowWebLinkToggle) {
        qrShowWebLinkToggle.addEventListener('change', updateQRSlideVisibility);
    }
    if (qrShowNeventToggle) {
        qrShowNeventToggle.addEventListener('change', updateQRSlideVisibility);
    }
    if (qrShowNoteToggle) {
        qrShowNoteToggle.addEventListener('change', updateQRSlideVisibility);
    }
    
    // Layout inversion toggle
    layoutInvertToggle.addEventListener('change', function(e) {
        document.body.classList.toggle('flex-direction-invert', e.target.checked);
        updateStyleURL();
    });
    
    // Add event listener for hide zapper content toggle
    hideZapperContentToggle.addEventListener('change', function(e) {
        console.log('Hide zapper content toggle changed:', e.target.checked);
        document.body.classList.toggle('hide-zapper-content', e.target.checked);
        console.log('Body classes after toggle:', document.body.classList.toString());
        updateStyleURL();
    });
    
    // Add event listener for show top zappers toggle
    showTopZappersToggle.addEventListener('change', function(e) {
        console.log('Show top zappers toggle changed:', e.target.checked);
        document.body.classList.toggle('show-top-zappers', e.target.checked);
        
        // Update top zappers bar visibility immediately
        const topZappersBar = document.getElementById('top-zappers-bar');
        if (topZappersBar) {
            if (e.target.checked && topZappers.length > 0) {
                displayTopZappers();
            } else {
                hideTopZappersBar();
            }
        }
        
        updateStyleURL();
    });
    
    // Add event listener for podium toggle
    podiumToggle.addEventListener('change', function(e) {
        console.log('Podium toggle changed:', e.target.checked);
        document.body.classList.toggle('podium-enabled', e.target.checked);
        // Re-render zaps to apply/remove podium styling
        if (json9735List.length > 0) {
            drawKinds9735(json9735List);
        }
        updateStyleURL();
    });
    

    // Add event listener for zap grid toggle
    zapGridToggle.addEventListener('change', function(e) {
        console.log('Zap grid toggle changed:', e.target.checked);
        const zapsList = document.getElementById('zaps');
        if (zapsList) {
            // Check if we're in live event mode (has two-column layout)
            const isLiveEvent = zapsList.classList.contains('live-event-two-column');
            if (isLiveEvent) {
                console.log('Grid layout not supported for live events - skipping');
                // Reset the toggle since we're not applying the change
                e.target.checked = !e.target.checked;
                return;
            }
            
            zapsList.classList.toggle('grid-layout', e.target.checked);
            if (e.target.checked) {
                organizeZapsHierarchically();
            } else {
                // Clean up hierarchical organization when grid mode is disabled
                cleanupHierarchicalOrganization();
            }
        }
        updateStyleURL();
    });
    
    // Font size slider disabled - font sizes now controlled by CSS using vw units
    // fontSizeSlider.addEventListener('input', function(e) {
    //     const value = parseFloat(e.target.value);
    //     fontSizeValue.textContent = Math.round(value * 100) + '%';
    //     applyAllStyles();
    // });
    
    // Opacity slider
    opacitySlider.addEventListener('input', function(e) {
        const value = parseFloat(e.target.value);
        opacityValue.textContent = Math.round(value * 100) + '%';
        applyAllStyles();
    });
    
    // Text opacity slider
    textOpacitySlider.addEventListener('input', function(e) {
        const value = parseFloat(e.target.value);
        textOpacityValue.textContent = Math.round(value * 100) + '%';
        applyAllStyles();
    });
    
    // Preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const presetName = this.getAttribute('data-preset');
            console.log('Preset button clicked:', presetName);
            applyPreset(presetName);
        });
    });
    
    // Action buttons
    resetStylesBtn.addEventListener('click', resetToDefaults);
    copyStyleUrlBtn.addEventListener('click', copyStyleUrl);
}

}); // Close DOMContentLoaded function

// ===== LIGHTNING PAYMENT FUNCTIONALITY =====

let frontendSessionId = null;
let lightningQRSlide = null;
let lightningEnabled = false;

// Generate unique frontend session ID
function generateFrontendSessionId() {
  return 'frontend_' + crypto.randomUUID();
}

// Enable Lightning payments
async function enableLightningPayments() {
  const eventId = getCurrentEventId();
  
  if (!eventId) {
    alert('No event ID found');
    return;
  }
  
  if (!frontendSessionId) {
    frontendSessionId = generateFrontendSessionId();
  }
  
  try {
    const response = await fetch('/lightning/enable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        frontendSessionId, 
        eventId 
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Set global variables for Lightning QR
      window.lightningEnabled = true;
      window.lightningLNURL = data.lnurl;
      
      console.log('Set global Lightning variables:', {
        lightningEnabled: window.lightningEnabled,
        lightningLNURL: window.lightningLNURL
      });
      
      // Update toggle state
      lightningEnabled = true;
      updateLightningToggle();
      
      // Update swiper to include Lightning QR
      if (window.updateQRSlideVisibility) {
        window.updateQRSlideVisibility();
      }
      
      // Show status message
      const statusDiv = document.getElementById('paymentStatus');
      if (data.existing) {
        statusDiv.innerHTML = '<div class="status-info">📱 Lightning enabled (reusing existing link)</div>';
      } else {
        statusDiv.innerHTML = '<div class="status-waiting">⚡ Lightning enabled - scan QR to pay</div>';
      }
      
      console.log('Lightning payments enabled:', data.message);
    } else {
      throw new Error(data.error || 'Failed to enable Lightning payments');
    }
    
  } catch (error) {
    console.error('Error enabling Lightning payments:', error);
    const statusDiv = document.getElementById('paymentStatus');
    statusDiv.innerHTML = `<div class="status-disabled">❌ Error: ${error.message}</div>`;
    alert(`Error enabling Lightning payments: ${error.message}`);
  }
}

// Disable Lightning payments
async function disableLightningPayments() {
  const eventId = getCurrentEventId();
  
  if (!eventId || !frontendSessionId) {
    return;
  }
  
  try {
    const response = await fetch('/lightning/disable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        frontendSessionId, 
        eventId 
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Clear global variables
      window.lightningEnabled = false;
      window.lightningLNURL = null;
      
      // Update toggle state
      lightningEnabled = false;
      updateLightningToggle();
      
      // Update swiper to remove Lightning QR
      if (window.updateQRSlideVisibility) {
        window.updateQRSlideVisibility();
      }
      
      // Show status message
      const statusDiv = document.getElementById('paymentStatus');
      statusDiv.innerHTML = '<div class="status-disabled">🔒 Lightning disabled</div>';
      
      console.log('Lightning payments disabled:', data.message);
    } else {
      throw new Error(data.error || 'Failed to disable Lightning payments');
    }
    
  } catch (error) {
    console.error('Error disabling Lightning payments:', error);
    const statusDiv = document.getElementById('paymentStatus');
    statusDiv.innerHTML = `<div class="status-disabled">❌ Error: ${error.message}</div>`;
    alert(`Error disabling Lightning payments: ${error.message}`);
  }
}

// Toggle Lightning payments
function toggleLightningPayments() {
  if (lightningEnabled) {
    disableLightningPayments();
  } else {
    enableLightningPayments();
  }
}

// Create a simple Lightning QR display
function createLightningQRDisplay(lnurl) {
  // Remove any existing Lightning QR display
  const existing = document.getElementById('lightningQRDisplay');
  if (existing) {
    existing.remove();
  }
  
  // Create a simple, visible Lightning QR
  const qrDisplay = document.createElement('div');
  qrDisplay.id = 'lightningQRDisplay';
  qrDisplay.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    border: 5px solid #ffd700;
    border-radius: 15px;
    padding: 20px;
    z-index: 9999;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    text-align: center;
  `;
  
  // Create QR code
  const qrContainer = document.createElement('div');
  qrContainer.id = 'lightningQRCodeSimple';
  qrContainer.style.cssText = `
    margin: 10px 0;
    display: inline-block;
  `;
  
  // Create close button
  const closeButton = document.createElement('button');
  closeButton.innerHTML = '✕';
  closeButton.style.cssText = `
    position: absolute;
    top: 5px;
    right: 10px;
    background: #ff4444;
    color: white;
    border: none;
    border-radius: 50%;
    width: 30px;
    height: 30px;
    cursor: pointer;
    font-size: 16px;
  `;
  closeButton.onclick = () => qrDisplay.remove();
  
  // Create title
  const title = document.createElement('h3');
  title.textContent = '⚡ Lightning Payment';
  title.style.cssText = `
    margin: 0 0 10px 0;
    color: #b8860b;
  `;
  
  // Create LNURL preview
  const preview = document.createElement('div');
  preview.textContent = lnurl.substring(0, 30) + '...';
  preview.style.cssText = `
    font-family: monospace;
    font-size: 12px;
    color: #666;
    margin: 10px 0;
    word-break: break-all;
  `;
  
  // Assemble the display
  qrDisplay.appendChild(closeButton);
  qrDisplay.appendChild(title);
  qrDisplay.appendChild(qrContainer);
  qrDisplay.appendChild(preview);
  
  // Add to page
  document.body.appendChild(qrDisplay);
  
  // Generate QR code
  const qrSize = 200;
  console.log('Generating QR for popup:', { lnurl, qrSize, container: qrContainer });
  
  try {
    new QRious({
      element: qrContainer,
      size: qrSize,
      value: lnurl
    });
    console.log('QR generated successfully for popup');
    
    // Check if QR was actually created
    setTimeout(() => {
      console.log('QR container after generation:', qrContainer);
      console.log('QR container innerHTML:', qrContainer.innerHTML);
      console.log('QR container children:', qrContainer.children.length);
      
      if (qrContainer.children.length === 0) {
        console.log('QR not created, trying fallback...');
        // Fallback: Create canvas manually
        const canvas = document.createElement('canvas');
        canvas.width = qrSize;
        canvas.height = qrSize;
        canvas.style.display = 'block';
        canvas.style.margin = '0 auto';
        qrContainer.appendChild(canvas);
        
        new QRious({
          element: canvas,
          size: qrSize,
          value: lnurl
        });
        console.log('Fallback QR created');
      }
    }, 100);
    
  } catch (error) {
    console.error('Error generating QR for popup:', error);
    
    // Last resort: Show LNURL as text
    qrContainer.innerHTML = `<div style="padding: 20px; font-family: monospace; word-break: break-all; background: #f0f0f0; border: 2px solid #ccc; border-radius: 8px;">${lnurl}</div>`;
  }
  
  console.log('Created Lightning QR display with LNURL:', lnurl);
}

// Update toggle button appearance
function updateLightningToggle() {
  const toggle = document.getElementById('lightningToggle');
  const statusContainer = document.getElementById('lightningStatusContainer');
  
  if (lightningEnabled) {
    toggle.checked = true;
    statusContainer.style.display = 'block';
  } else {
    toggle.checked = false;
    statusContainer.style.display = 'none';
  }
}

// Add Lightning QR code to the existing swiper
function addLightningQRToSwiper(lnurl) {
  console.log('Adding Lightning QR to swiper:', lnurl);
  
  const lightningSlide = document.getElementById('lightningQRSlide');
  const qrContainer = document.getElementById('lightningQRCode');
  
  if (!lightningSlide || !qrContainer) {
    console.error('Lightning QR slide or container not found');
    return;
  }
  
  // Show the Lightning QR slide
  lightningSlide.style.display = 'block';
  
  // Generate QR code using the working method
  qrContainer.innerHTML = '';
  const qrSize = Math.min(window.innerWidth * 0.6, window.innerHeight * 0.7);
  
  console.log('Generating Lightning QR for swiper:', { lnurl, qrSize });
  
  try {
    new QRious({
      element: qrContainer,
      size: qrSize,
      value: lnurl
    });
    console.log('Lightning QR generated successfully for swiper');
    
    // Check if QR was actually created
    setTimeout(() => {
      if (qrContainer.children.length === 0) {
        console.log('QR not created, trying fallback...');
        // Fallback: Create canvas manually
        const canvas = document.createElement('canvas');
        canvas.width = qrSize;
        canvas.height = qrSize;
        canvas.style.display = 'block';
        canvas.style.margin = '0 auto';
        qrContainer.appendChild(canvas);
        
        new QRious({
          element: canvas,
          size: qrSize,
          value: lnurl
        });
        console.log('Fallback Lightning QR created for swiper');
      }
    }, 100);
    
  } catch (error) {
    console.error('Error generating Lightning QR for swiper:', error);
  }
  
  // Update the QR data preview
  const preview = document.getElementById('qrDataPreview4');
  if (preview) {
    preview.textContent = `(${lnurl.substring(0, 20)}...)`;
  }
  
  // Add the slide to the swiper wrapper if not already there
  const swiperWrapper = document.querySelector('.qr-swiper .swiper-wrapper');
  if (swiperWrapper && !swiperWrapper.contains(lightningSlide)) {
    swiperWrapper.appendChild(lightningSlide);
    console.log('Added Lightning QR slide to swiper wrapper');
  }
  
  // Update swiper to recognize the new slide
  if (window.qrSwiper) {
    window.qrSwiper.update();
    console.log('Updated swiper with Lightning QR slide');
  }
}

// Generate Lightning QR code and add to swiper
function generateLightningQR(lnurl, lightningSlide, qrContainer) {
  console.log('Adding Lightning QR to swiper:', lnurl);
  
  // Debug: Check current swiper state
  if (window.qrSwiper) {
    console.log('Current swiper slides count:', window.qrSwiper.slides.length);
    console.log('Current swiper wrapper children:', document.querySelector('.qr-swiper .swiper-wrapper').children.length);
  }
  
  // Use the same approach as other QR codes
  if (qrContainer) {
    // Clear previous content (same as other QR codes)
    qrContainer.innerHTML = "";
    
    // Calculate responsive size (same as other QR codes)
    const qrSize = Math.min(window.innerWidth * 0.6, window.innerHeight * 0.7);
    console.log('Generating Lightning QR with size:', qrSize);
    
    // Generate QR code (same as other QR codes)
    new QRious({
      element: qrContainer,
      size: qrSize,
      value: lnurl
    });
    
    console.log('Lightning QR generated successfully');
  }
  
  // Show the Lightning QR slide
  lightningSlide.style.display = 'block';
  console.log('Lightning slide display set to block');
  console.log('Lightning slide computed style:', getComputedStyle(lightningSlide).display);
  console.log('Lightning slide visibility:', getComputedStyle(lightningSlide).visibility);
  console.log('Lightning slide opacity:', getComputedStyle(lightningSlide).opacity);
  
  // Update the QR data preview
  const preview = document.getElementById('qrDataPreview4');
  if (preview) {
    preview.textContent = `(${lnurl.substring(0, 20)}...)`;
  }
  
  // Force the slide to be visible
  lightningSlide.style.visibility = 'visible';
  lightningSlide.style.opacity = '1';
  lightningSlide.style.position = 'relative';
  lightningSlide.style.zIndex = '1';
  
  // Lightning slide is now visible
  
  // Add the slide to the swiper wrapper if not already there
  const swiperWrapper = document.querySelector('.qr-swiper .swiper-wrapper');
  console.log('Swiper wrapper found:', !!swiperWrapper);
  console.log('Lightning slide already in wrapper:', swiperWrapper?.contains(lightningSlide));
  
  if (swiperWrapper && !swiperWrapper.contains(lightningSlide)) {
    swiperWrapper.appendChild(lightningSlide);
    console.log('Added Lightning QR slide to swiper wrapper');
    console.log('Swiper wrapper children count after adding:', swiperWrapper.children.length);
  }
  
  // Check if the slide is visible in the DOM
  console.log('Lightning slide parent:', lightningSlide.parentElement);
  console.log('Lightning slide offsetParent:', lightningSlide.offsetParent);
  console.log('Lightning slide offsetWidth:', lightningSlide.offsetWidth);
  console.log('Lightning slide offsetHeight:', lightningSlide.offsetHeight);
  
  // Force swiper to reinitialize with all slides
  if (window.qrSwiper) {
    // Destroy and recreate swiper to properly include the new slide
    window.qrSwiper.destroy(true, true);
    window.qrSwiper = null;
    
    // Delay to ensure QR code is fully rendered before reinitializing swiper
    setTimeout(() => {
      window.qrSwiper = new Swiper('.qr-swiper', {
        slidesPerView: 1,
        spaceBetween: 0,
        pagination: {
          el: '.swiper-pagination',
          clickable: true,
          dynamicBullets: false
        },
        loop: false,
        autoplay: {
          delay: 3000,
          disableOnInteraction: false,
        },
        effect: 'slide',
        speed: 300,
        observer: true,
        observeParents: true
      });
      console.log('Reinitialized swiper with Lightning QR slide');
      console.log('New swiper slides count:', window.qrSwiper.slides.length);
      console.log('New swiper wrapper children:', document.querySelector('.qr-swiper .swiper-wrapper').children.length);
      
      // Check if QR code is still there after swiper reinitialization
      const lightningSlideAfter = document.getElementById('lightningQRSlide');
      const qrContainerAfter = document.getElementById('lightningQRCode');
      if (lightningSlideAfter && qrContainerAfter) {
        console.log('Lightning slide after swiper reinit:', lightningSlideAfter);
        console.log('QR container after swiper reinit:', qrContainerAfter);
        console.log('QR container innerHTML after swiper reinit:', qrContainerAfter.innerHTML);
        console.log('QR container children after swiper reinit:', qrContainerAfter.children.length);
        
        // If QR code was lost during swiper reinit, regenerate it
        if (qrContainerAfter.children.length === 0) {
          console.log('QR code lost during swiper reinit, regenerating...');
          qrContainerAfter.innerHTML = "";
          const qrSize = Math.min(window.innerWidth * 0.6, window.innerHeight * 0.7);
          new QRious({
            element: qrContainerAfter,
            size: qrSize,
            value: lnurl
          });
          console.log('QR code regenerated after swiper reinit');
        }
      }
    }, 300);
  }
  
  // Store reference to the slide
  lightningQRSlide = lightningSlide;
}

// Remove Lightning QR code from swiper
function removeLightningQRFromSwiper() {
  const lightningSlide = document.getElementById('lightningQRSlide');
  
  if (lightningSlide) {
    console.log('Removing Lightning QR from swiper');
    
    // Hide the Lightning QR slide
    lightningSlide.style.display = 'none';
    
    // Force swiper to reinitialize without the Lightning slide
    if (window.qrSwiper) {
      window.qrSwiper.destroy(true, true);
      window.qrSwiper = null;
      
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        window.qrSwiper = new Swiper('.qr-swiper', {
          slidesPerView: 1,
          spaceBetween: 0,
          pagination: {
            el: '.swiper-pagination',
            clickable: true,
            dynamicBullets: false
          },
          loop: false,
          autoplay: {
            delay: 3000,
            disableOnInteraction: false,
          },
          effect: 'slide',
          speed: 300,
          observer: true,
          observeParents: true
        });
        console.log('Reinitialized swiper without Lightning QR slide');
      }, 100);
    }
    
    // Clear reference
    lightningQRSlide = null;
  }
}

// Reinitialize swiper to include/exclude Lightning slide
function reinitializeSwiper() {
  // Destroy existing swiper if it exists
  if (window.qrSwiper) {
    window.qrSwiper.destroy(true, true);
  }
  
  // Reinitialize swiper
  window.qrSwiper = new Swiper('.qr-swiper', {
    loop: false,
    pagination: {
      el: '.swiper-pagination',
      clickable: true,
    },
    autoplay: {
      delay: 3000,
      disableOnInteraction: false,
    },
    effect: 'slide',
    speed: 500,
  });
}

// Get current event ID from URL
function getCurrentEventId() {
  const pathParts = window.location.pathname.split('/');
  const noteId = pathParts[pathParts.length - 1];
  return noteId && noteId !== 'live' ? noteId : null;
}

// Initialize Lightning toggle functionality
function initializeLightningToggle() {
  const toggle = document.getElementById('lightningToggle');
  if (toggle) {
    toggle.addEventListener('change', toggleLightningPayments);
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  initializeLightningToggle();
});

// Function to organize zaps in hierarchical grid layout
function organizeZapsHierarchically() {
    const zapsList = document.getElementById('zaps');
    if (!zapsList) return;
    
    // Skip if this is a live event (has two-column layout)
    if (zapsList.classList.contains('live-event-two-column')) {
        console.log('Skipping grid organization for live events');
        return;
    }
    
    const zaps = Array.from(zapsList.querySelectorAll('.zap'));
    if (zaps.length === 0) return;
    
    // Clear existing row classes and podium classes
    zaps.forEach(zap => {
        zap.className = zap.className.replace(/row-\d+/g, '');
        zap.className = zap.className.replace(/podium-\d+/g, '');
        zap.className = zap.className.replace(/podium-global-\d+/g, '');
    });
    
    // Remove existing row containers
    const existingRows = zapsList.querySelectorAll('.zap-row');
    existingRows.forEach(row => row.remove());
    
    // Sort zaps by amount (highest first) for podium application
    const sortedZaps = [...zaps].sort((a, b) => {
        const amountA = parseInt(a.querySelector('.zapperAmountSats')?.textContent?.replace(/[^\d]/g, '') || '0');
        const amountB = parseInt(b.querySelector('.zapperAmountSats')?.textContent?.replace(/[^\d]/g, '') || '0');
        return amountB - amountA;
    });
    
    // Apply podium classes to top 3 zaps
    if (document.body.classList.contains('podium-enabled')) {
        console.log('Applying podium classes in grid layout. Top 3 zaps:', sortedZaps.slice(0, 3).map(zap => ({
            amount: zap.querySelector('.zapperAmountSats')?.textContent,
            name: zap.querySelector('.zapperName')?.textContent
        })));
        for (let i = 0; i < Math.min(3, sortedZaps.length); i++) {
            const zap = sortedZaps[i];
            zap.classList.add(`podium-global-${i + 1}`);
            console.log(`Applied podium-global-${i + 1} to zap with amount:`, zap.querySelector('.zapperAmountSats')?.textContent);
        }
    }
    
    let currentIndex = 0;
    let rowNumber = 1;
    let zapsPerRow = 1;
    
    while (currentIndex < zaps.length) {
        // Create row container
        const rowContainer = document.createElement('div');
        rowContainer.className = `zap-row row-${rowNumber}`;
        
        // Add zaps to this row
        for (let i = 0; i < zapsPerRow && currentIndex < zaps.length; i++) {
            const zap = zaps[currentIndex];
            zap.classList.add(`row-${rowNumber}`);
            rowContainer.appendChild(zap);
            currentIndex++;
        }
        
        zapsList.appendChild(rowContainer);
        
        // Double the zaps per row for next row
        zapsPerRow *= 2;
        rowNumber++;
        
        // Limit to row-5 for very large numbers
        if (rowNumber > 5) {
            // For remaining zaps, put them in row-5
            while (currentIndex < zaps.length) {
                const zap = zaps[currentIndex];
                zap.classList.add('row-5');
                rowContainer.appendChild(zap);
                currentIndex++;
            }
            break;
        }
    }
}

// Function to clean up hierarchical organization when grid mode is disabled
function cleanupHierarchicalOrganization() {
    const zapsList = document.getElementById('zaps');
    if (!zapsList) return;
    
    // Skip if this is a live event (has two-column layout)
    if (zapsList.classList.contains('live-event-two-column')) {
        console.log('Skipping grid cleanup for live events');
        return;
    }
    
    // Remove all row containers and move zaps back to the main container
    const existingRows = zapsList.querySelectorAll('.zap-row');
    existingRows.forEach(row => {
        // Move all zaps from this row back to the main container
        const zapsInRow = Array.from(row.children);
        zapsInRow.forEach(zap => {
            // Remove row classes and global podium classes from individual zaps
            zap.className = zap.className.replace(/row-\d+/g, '');
            zap.className = zap.className.replace(/podium-global-\d+/g, '');
            // Move zap back to main container
            zapsList.appendChild(zap);
        });
        // Remove the empty row container
        row.remove();
    });
    
    // Re-apply regular podium classes for list layout
    if (document.body.classList.contains('podium-enabled')) {
        const zaps = Array.from(zapsList.querySelectorAll('.zap'));
        const sortedZaps = [...zaps].sort((a, b) => {
            const amountA = parseInt(a.querySelector('.zapperAmountSats')?.textContent?.replace(/[^\d]/g, '') || '0');
            const amountB = parseInt(b.querySelector('.zapperAmountSats')?.textContent?.replace(/[^\d]/g, '') || '0');
            return amountB - amountA;
        });
        
        for (let i = 0; i < Math.min(3, sortedZaps.length); i++) {
            const zap = sortedZaps[i];
            zap.classList.add(`podium-${i + 1}`);
        }
    }
}
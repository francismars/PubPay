
document.addEventListener('DOMContentLoaded', function() {
    // Initialize portrait swiper
    initializePortraitSwiper();
    
    // Font sizes are now controlled by CSS using vw units
    // No JavaScript font size initialization needed
    
    // Initialize QR timer after a delay to ensure everything is loaded
    setTimeout(() => {
        if (window.qrSwiper) {
            initializeQRTimer();
        } else {
            // Retry after another delay
            setTimeout(() => {
                if (window.qrSwiper) {
                    initializeQRTimer();
                } else {
                }
            }, 2000);
        }
    }, 1000);
    
    // Lightning QR will be generated through the swiper rebuild process
    
    // Get note ID from URL path instead of query parameters
    const pathParts = window.location.pathname.split('/');
    
    let nevent = null;
    
    // Check for compound URL structures like nprofile.../live/event-id
    if (pathParts.length >= 3 && pathParts[pathParts.length - 2] === 'live') {
        // This is a compound structure: /nprofile.../live/event-id
        const nprofileId = pathParts[pathParts.length - 3];
        const eventId = pathParts[pathParts.length - 1];
        
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
            }
        } catch (e) {
            // Error processing compound URL
        }
    }
    
    // Fallback to standard parsing if no compound structure detected
    if (!nevent) {
    const noteIdFromPath = pathParts[pathParts.length - 1]; // Get the last part of the path
    
    // Also check for query parameters for backward compatibility
    let urlToParse = location.search;
    const params = new URLSearchParams(urlToParse);
    const noteFromQuery = params.get("note");
    
    // Use path parameter if available, otherwise fall back to query parameter
        nevent = noteIdFromPath && noteIdFromPath !== 'live' ? noteIdFromPath : noteFromQuery;
    }

    // Strip nostr: protocol prefix if present
    const originalNevent = nevent;
    nevent = stripNostrPrefix(nevent);

    // Decode nevent/naddr/nprofile to preserve format in URL if present
    if (nevent) {
        try {
            const decoded = NostrTools.nip19.decode(nevent);
            if (decoded.type === 'nevent' || decoded.type === 'naddr' || decoded.type === 'nprofile') {
                // For constructed naddr from compound URL, preserve the clean naddr format
                const newUrl = '/live/' + nevent;
                window.history.replaceState({}, '', newUrl);
            }
        } catch (e) {
            // Error decoding identifier parameter
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
        lightningEnabled: lightningEnabled, // Add Lightning toggle to styles
        // fontSize: parseFloat(fontSizeSlider.value), // Disabled - using CSS vw units
        opacity: parseFloat(opacitySlider.value),
        textOpacity: parseFloat(textOpacitySlider.value),
        partnerLogo: currentPartnerLogo
    };
    
    // Store styles in localStorage instead of URL
    localStorage.setItem('pubpay-styles', JSON.stringify(styles));
    
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
        
        // Add Lightning QR if enabled
        if (window.lightningEnabled) {
            qrCodes.push(document.getElementById('lightningQRCode'));
        }
        
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
    const savedStyles = localStorage.getItem('pubpay-styles');
    if (!savedStyles) {
        // Apply default styles if no saved styles
        
        // Set QR visibility toggles to default values
        const qrShowWebLinkToggle = document.getElementById('qrShowWebLinkToggle');
        const qrShowNeventToggle = document.getElementById('qrShowNeventToggle');
        const qrShowNoteToggle = document.getElementById('qrShowNoteToggle');
        
        if (qrShowWebLinkToggle) qrShowWebLinkToggle.checked = DEFAULT_STYLES.qrShowWebLink;
        if (qrShowNeventToggle) qrShowNeventToggle.checked = DEFAULT_STYLES.qrShowNevent;
        if (qrShowNoteToggle) qrShowNoteToggle.checked = DEFAULT_STYLES.qrShowNote;
        
        applyAllStyles();
        
        // Update QR slide visibility after setting defaults
        if (window.updateQRSlideVisibility && typeof window.updateQRSlideVisibility === 'function') {
            window.updateQRSlideVisibility(true); // Skip URL update during initialization
        }
        return;
    }
    
    try {
        const styles = JSON.parse(savedStyles);
        
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
            
            const qrCodes = [
                document.getElementById('qrCode'),
                document.getElementById('qrCodeNevent'),
                document.getElementById('qrCodeNote')
            ];
            
            // Add Lightning QR if enabled
            if (window.lightningEnabled) {
                qrCodes.push(document.getElementById('lightningQRCode'));
            }
            
            qrCodes.forEach(qrCode => {
                if (qrCode) qrCode.style.filter = styles.qrInvert ? 'invert(1)' : 'none';
            });
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
            if (toggle) {
                toggle.checked = styles.qrShowWebLink;
            }
        }
        if (styles.qrShowNevent !== undefined) {
            const toggle = document.getElementById('qrShowNeventToggle');
            if (toggle) {
                toggle.checked = styles.qrShowNevent;
            }
        }
        if (styles.qrShowNote !== undefined) {
            const toggle = document.getElementById('qrShowNoteToggle');
            if (toggle) {
                toggle.checked = styles.qrShowNote;
            }
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
        
        // Apply Lightning toggle
        if (styles.lightningEnabled !== undefined) {
            lightningEnabled = styles.lightningEnabled;
            window.lightningEnabled = styles.lightningEnabled;
            updateLightningToggle();
            
            // If Lightning was enabled, try to re-enable it (only if there's an event ID)
            if (lightningEnabled) {
                const eventId = getCurrentEventId();
                if (eventId) {
                    setTimeout(() => {
                        enableLightningPayments();
                    }, 100);
                } else {
                    // Lightning was previously enabled but no event ID found, keeping toggle state only
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
            // Update QR slide visibility after all styles are applied
            if (window.updateQRSlideVisibility && typeof window.updateQRSlideVisibility === 'function') {
                window.updateQRSlideVisibility(true); // Skip URL update during initialization
            }
        }, 50);
        
    } catch (e) {
        // Error loading styles from localStorage
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
    
    // Re-enable grid toggle for regular notes (not live events)
    enableGridToggle();
    
    // Reset zapper totals for new content
    resetZapperTotals();
    
    // Strip nostr: protocol prefix if present before validation
    const originalNoteId = noteId;
    noteId = stripNostrPrefix(noteId);
    
    // Validate the note ID after stripping prefix
    try {
        validateNoteId(noteId);
    } catch (error) {
        showLoadingError(error.message);
        return;
    }
    
    try {
        const decoded = NostrTools.nip19.decode(noteId);
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
    
    // Reset zapper totals for new live event
    resetZapperTotals();
    
    // Strip nostr: protocol prefix if present before validation
    const originalNaddr = naddr;
    naddr = stripNostrPrefix(naddr);
    
    // Validate the naddr after stripping prefix
    try {
        validateNoteId(naddr);
    } catch (error) {
        showLoadingError(error.message);
        return;
    }
    
    try {
        const decoded = NostrTools.nip19.decode(naddr);
        
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
        showLoadingError("Failed to load live event. Please check the identifier and try again.");
    }
}

function loadProfile(nprofile) {
    
    // Strip nostr: protocol prefix if present before validation
    const originalNprofile = nprofile;
    nprofile = stripNostrPrefix(nprofile);
    
    // Validate the nprofile after stripping prefix
    try {
        validateNoteId(nprofile);
    } catch (error) {
        showLoadingError(error.message);
        return;
    }
    
    try {
        const decoded = NostrTools.nip19.decode(nprofile);
        
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
        showLoadingError("Failed to load profile. Please check the identifier and try again.");
    }
}

function loadProfileContent(pubkey) {
    
    // Subscribe to user's profile (kind 0)
    subscribeProfileInfo(pubkey);
    
    // Subscribe to user's recent notes (kind 1)
    subscribeProfileNotes(pubkey);
}

async function subscribeProfileInfo(pubkey) {
    
    let filter = {
        kinds: [0], // Profile kind
        authors: [pubkey]
    };
    
    const sub = pool.subscribeMany(relays, [filter], {
        onevent(profile) {
            displayProfileInfo(profile);
        },
        oneose() {
        },
        onclosed() {
        }
    });
}

async function subscribeProfileNotes(pubkey) {
    
    let filter = {
        kinds: [1], // Text note kind
        authors: [pubkey],
        limit: 20 // Get recent 20 notes
    };
    
    const sub = pool.subscribeMany(relays, [filter], {
        onevent(note) {
            displayProfileNote(note);
        },
        oneose() {
        },
        onclosed() {
        }
    });
}

function displayProfileInfo(profile) {
    
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
        showLoadingError(error.message);
    }
    // Duplicate code removed - using loadNoteContent function instead
    /*
    try {
        const decoded = NostrTools.nip19.decode(nevent);
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
    // No note parameter found in URL
}

// Apply styles from URL parameters first, then localStorage
// Use setTimeout to ensure DOM elements are ready
setTimeout(() => {
    // Ensure setupStyleOptions is called first to define updateQRSlideVisibility
    if (typeof window.updateQRSlideVisibility !== 'function') {
        setupStyleOptions();
    }
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
}

async function subscribeKind1(kind1ID) {
    let filter = { ids: [kind1ID]}
    
    // Add a timeout to prevent immediate EOS
    let timeoutId = setTimeout(() => {
        // Kind1 subscription timeout - no events received after 10 seconds
    }, 10000);
    
    pool.subscribeMany(
        [...relays],
        [filter],
        {
        async onevent(kind1) {
            clearTimeout(timeoutId);
            drawKind1(kind1)
            await subscribeKind0fromKind1(kind1)
            await subscribeKind9735fromKind1(kind1)
        },
        oneose() {
            clearTimeout(timeoutId);
        },
        onclosed() {
            clearTimeout(timeoutId);
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
        },
        onclosed() {
        }
    })
  }

  async function subscribeKind9735fromKind1(kind1) {
    let kinds9735IDs = new Set();
    let kinds9735 = []
    const kind1id = kind1.id
    let isFirstStream = true

    const zapsContainer = document.getElementById("zaps");

    // Add a timeout for zap subscription
    let zapTimeoutId = setTimeout(() => {
        // Zap subscription timeout - no zaps received after 15 seconds
        if (kinds9735.length === 0) {
            // No zaps found for this note
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
            if(!(kinds9735IDs.has(kind9735.id))){
                kinds9735IDs.add(kind9735.id)
                kinds9735.push(kind9735)
                if(!isFirstStream){
                    subscribeKind0fromKinds9735([kind9735])
                }
            }
        },
        oneose() {
            clearTimeout(zapTimeoutId);
            isFirstStream = false
            subscribeKind0fromKinds9735(kinds9735)
        },
        onclosed() {
            clearTimeout(zapTimeoutId);
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
    },
    onclosed() {
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
    
    let filter = {
        authors: [pubkey],
        kinds: [30311], // Live Event kind
        "#d": [identifier]
    };
    
    // Add timeout to prevent subscription from closing prematurely
    let timeoutId = setTimeout(() => {
        // Live event subscription timeout - keeping subscription alive
        // Don't close the subscription, just log that we're keeping it alive
    }, 30000); // Increased timeout to 30 seconds
    
    const sub = pool.subscribeMany(relays, [filter], {
        onevent(liveEvent) {
            clearTimeout(timeoutId);
            displayLiveEvent(liveEvent);
            // Also subscribe to participants' profiles
            subscribeLiveEventParticipants(liveEvent);
        },
        oneose() {
            clearTimeout(timeoutId);
            // Don't close the subscription, keep it alive for updates
        },
        onclosed() {
            clearTimeout(timeoutId);
            // Attempt to reconnect after a delay if we have current event info
            if (currentLiveEventInfo && reconnectionAttempts.event < 3) {
                reconnectionAttempts.event++;
                setTimeout(() => {
                    subscribeLiveEvent(currentLiveEventInfo.pubkey, currentLiveEventInfo.identifier, currentLiveEventInfo.kind);
                }, 5000 * reconnectionAttempts.event);
            }
        }
    });
}

async function subscribeLiveChat(pubkey, identifier) {
    
    const aTag = `30311:${pubkey}:${identifier}`;
    
    let filter = {
        kinds: [1311], // Live Chat Message kind
        "#a": [aTag]
    };
    
    const sub = pool.subscribeMany(relays, [filter], {
        onevent(chatMessage) {
            displayLiveChatMessage(chatMessage);
            // Subscribe to chat author profile if not already cached
            subscribeChatAuthorProfile(chatMessage.pubkey);
        },
        oneose() {
            // Keep subscription alive for new messages
        },
        onclosed() {
            // Attempt to reconnect after a delay
            setTimeout(() => {
                subscribeLiveChat(pubkey, identifier);
            }, 5000);
        }
    });
}

async function subscribeLiveEventParticipants(liveEvent) {
    
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
            // Update participant display with profile info
            updateParticipantProfile(profile);
        },
        oneose() {
        },
        onclosed() {
        }
    });
}

async function subscribeChatAuthorProfile(pubkey) {
    
    let filter = {
        kinds: [0], // Profile kind
        authors: [pubkey]
    };
    
    const sub = pool.subscribeMany(relays, [filter], {
        onevent(profile) {
            // Update chat message display with profile info
            updateChatAuthorProfile(profile);
        },
        oneose() {
        },
        onclosed() {
        }
    });
}

async function subscribeLiveEventZaps(pubkey, identifier) {
    
    const aTag = `30311:${pubkey}:${identifier}`;
    
    let filter = {
        kinds: [9735], // Zap receipt kind
        "#a": [aTag]
    };
    
    const sub = pool.subscribeMany(relays, [filter], {
        onevent(zapReceipt) {
            processLiveEventZap(zapReceipt, pubkey, identifier);
        },
        oneose() {
            // Keep subscription alive for new zaps
        },
        onclosed() {
            // Attempt to reconnect after a delay
            setTimeout(() => {
                subscribeLiveEventZaps(pubkey, identifier);
            }, 5000);
        }
    });
}

async function subscribeLiveEventHostProfile(hostPubkey) {
    
    let filter = {
        kinds: [0], // Profile kind
        authors: [hostPubkey]
    };
    
    const sub = pool.subscribeMany(relays, [filter], {
        onevent(profile) {
            updateLiveEventHostProfile(profile);
        },
        oneose() {
        },
        onclosed() {
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
        }
    }
    
    return mentions;
}

async function replaceNostrMentions(content) {
    try {
        if (!content) return '';
        
        const mentions = parseNostrMentions(content);
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
        if (!content) return '';
        
        const images = parseImages(content);
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
        // First process images
        let processedContent = await replaceImages(content);
        // Then process nostr mentions
        processedContent = await replaceNostrMentions(processedContent);
        return processedContent;
    } catch (e) {
        console.error("Error processing note content:", e);
        return content; // Return original content if processing fails
    }
}

async function drawKind1(kind1){
    
    // Store note ID globally for QR regeneration
    window.currentNoteId = kind1.id;
    
    const noteContent = document.getElementById("noteContent");
    
    // Process content for both images and nostr mentions
    const processedContent = await processNoteContent(kind1.content);
    noteContent.innerHTML = processedContent;
    
    // Hide note content loading animation
    noteContent.classList.remove('loading');
    const loadingText = noteContent.querySelector('.loading-text');
    if (loadingText) loadingText.remove();
    
    // Update Lightning state now that we have an event ID
    if (lightningEnabled) {
        setTimeout(() => {
            enableLightningPayments();
        }, 100);
    }
    
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
                delay: 10000,
                disableOnInteraction: false,
                pauseOnMouseEnter: true
            },
            autoHeight: false, // Use fixed height to avoid layout issues
            height: 250,
            watchOverflow: true, // Handle case where all slides might be hidden
            observer: true, // Watch for DOM changes
            observeParents: true,
            on: {
                init: function() {
                    setTimeout(() => {
                        initializeQRTimer();
                    }, 500);
                },
                slideChange: function() {
                    updateQRTimer();
                }
            }
        });
    }
    
    // Apply current slide visibility settings with delay to ensure localStorage is loaded
    setTimeout(() => {
        if (window.updateQRSlideVisibility) {
            window.updateQRSlideVisibility(true); // Skip URL update during QR generation
        }
    }, 300); // Longer delay to ensure localStorage is loaded (after the 200ms delay)
}

function drawKind0(kind0){
      let authorContent = JSON.parse(kind0.content)
      //document.getElementById("authorName").innerText = authorContent.name;
      const displayName = JSON.parse(kind0.content).displayName
      const display_Name = JSON.parse(kind0.content).display_name
      let kind0name = displayName ? JSON.parse(kind0.content).displayName : display_Name ? JSON.parse(kind0.content).display_name : JSON.parse(kind0.content).name 
      document.getElementById("authorName").innerText = kind0name;
      document.getElementById("authorNameProfileImg").src = authorContent.picture;
  }


  function drawKinds9735(json9735List){

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
              
              for (let i = 0; i < Math.min(3, sortedZaps.length); i++) {
                  const zap = sortedZaps[i];
                  zap.classList.add(`podium-${i + 1}`);
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
        return;
    }
    
    
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
    
    // Check if this live event is already displayed to avoid clearing content
    if (window.currentLiveEvent && window.currentLiveEvent.id === liveEvent.id) {
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
    
    // Enable Lightning payments if previously enabled
    if (lightningEnabled) {
        setTimeout(() => {
            enableLightningPayments();
        }, 150);
    }
    
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
    
    const profileData = JSON.parse(profile.content || '{}');
    const picture = profileData.picture || "/images/gradient_color.gif";
    
    // Update the author profile image
    const authorImg = document.getElementById("authorNameProfileImg");
    if (authorImg) {
        authorImg.src = picture;
    }
}

function generateLiveEventQRCodes(liveEvent) {
    
    const identifier = liveEvent.tags.find(tag => tag[0] === "d")?.[1];
    const pubkey = liveEvent.pubkey;
    const kind = 30311;
    
    if (!identifier || !pubkey) {
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
    
    // Calculate QR size dynamically (same as note1/nevent pages)
    const qrSize = Math.min(window.innerWidth * 0.6, window.innerHeight * 0.7);
    
    // Generate QR codes (with null checks)
    const qrCodeElement = document.getElementById('qrCode');
    const qrCodeNeventElement = document.getElementById('qrCodeNevent');
    const qrCodeNoteElement = document.getElementById('qrCodeNote');
    
    if (qrCodeElement) {
        const qrCode = new QRious({
            element: qrCodeElement,
            value: njumpUrl,
            size: qrSize
        });
    }
    
    if (qrCodeNeventElement) {
        const qrCodeNevent = new QRious({
            element: qrCodeNeventElement,
            value: nostrNaddr,
            size: qrSize
        });
    }
    
    if (qrCodeNoteElement) {
        const qrCodeNote = new QRious({
            element: qrCodeNoteElement,
            value: naddrId,
            size: qrSize
        });
    }
    
    // Update QR code links (with null checks)
    const qrcodeLinkNostr = document.getElementById('qrcodeLinkNostr');
    const qrcodeNeventLink = document.getElementById('qrcodeNeventLink');
    const qrcodeNoteLink = document.getElementById('qrcodeNoteLink');
    
    if (qrcodeLinkNostr) qrcodeLinkNostr.href = njumpUrl;
    if (qrcodeNeventLink) qrcodeNeventLink.href = nostrNaddr;
    if (qrcodeNoteLink) qrcodeNoteLink.href = naddrId;
    
    
    // Update QR data previews
    const preview1 = document.getElementById('qrDataPreview1');
    const preview2 = document.getElementById('qrDataPreview2');
    const preview3 = document.getElementById('qrDataPreview3');
    
    
    if (preview1) {
        const previewText = njumpUrl.slice(0, 20) + '...';
        preview1.textContent = previewText;
    } else {
        console.error("qrDataPreview1 element not found");
    }
    
    if (preview2) {
        const previewText = nostrNaddr.slice(0, 20) + '...';
        preview2.textContent = previewText;
    } else {
        console.error("qrDataPreview2 element not found");
    }
    
    if (preview3) {
        const previewText = naddrId.slice(0, 20) + '...';
        preview3.textContent = previewText;
    } else {
        console.error("qrDataPreview3 element not found");
    }
    
    // Apply slide visibility settings for live events after QR generation
    setTimeout(() => {
        if (window.updateQRSlideVisibility) {
            window.updateQRSlideVisibility(true); // Skip URL update during initialization
        }
    }, 100);
}

function initializeLiveVideoPlayer(streamingUrl) {
    
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
        hideVideoError();
    });
    
    video.addEventListener('canplay', function() {
        hideVideoError();
    });
    
    video.addEventListener('loadeddata', function() {
    });
    
    // Handle different streaming formats
    if (streamingUrl.includes('.m3u8') || streamingUrl.includes('hls')) {
        // HLS stream - try to use HLS.js if available, otherwise rely on native support
        if (typeof Hls !== 'undefined' && Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(streamingUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                video.play().catch(e => {});
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
            video.play().catch(e => {});
        } else {
            console.warn("HLS not supported, showing error");
            showVideoError();
        }
    } else {
        // Regular video formats (MP4, WebM, etc.)
        video.src = streamingUrl;
        video.play().catch(e => {});
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
    
    try {
        // Extract zap information from the receipt
        const description9735 = zapReceipt.tags.find(tag => tag[0] === "description")?.[1];
        if (!description9735) {
            return;
        }
        
        let zapRequest;
        try {
            zapRequest = JSON.parse(description9735);
        } catch (parseError) {
            return;
        }
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
    const preset = STYLE_PRESETS[presetName];
    if (!preset) {
        console.error('Preset not found:', presetName);
        return;
    }
    
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
            },
            slideChange: function () {
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
    
    // Add Lightning QR if enabled
    if (window.lightningEnabled) {
        qrCodeContainers.push(document.getElementById('lightningQRCode'));
    }
    
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
    localStorage.removeItem('pubpay-styles');
    
    // Apply light mode preset
    applyPreset('lightMode');
}

function copyStyleUrl() {
    // Get current styles from localStorage
    const savedStyles = localStorage.getItem('pubpay-styles');
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
    
    
    // Handle background preset selection
    bgImagePreset.addEventListener('change', function(e) {
        const selectedValue = e.target.value;
        
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
            if (bgPresetPreview) {
                bgPresetPreview.src = selectedValue;
                bgPresetPreview.alt = selectedValue ? 'Background preview' : 'No background';
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
        // which reads from the combined 'pubpay-styles' localStorage key
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
        
        // Add Lightning QR if enabled
        if (window.lightningEnabled) {
            qrCodes.push(document.getElementById('lightningQRCode'));
        }
        
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
    
    // Centralized QR slide configuration
    const QR_SLIDE_CONFIGS = {
        webLink: {
            id: 'qrCode',
            elementId: null,
            linkId: 'qrcodeLinkNostr',
            previewId: 'qrDataPreview1',
            label: 'Web Link',
            getValue: () => {
                const noteId = window.currentNoteId;
                if (noteId) {
                    const note1Id = NostrTools.nip19.noteEncode(noteId);
                    return "https://njump.me/" + note1Id;
                }
                return 'https://njump.me/';
            }
        },
        nevent: {
            id: 'qrCodeNevent',
            elementId: null,
            linkId: 'qrcodeNeventLink',
            previewId: 'qrDataPreview2',
            label: 'Nostr Event',
            getValue: () => {
                const noteId = window.currentNoteId;
                if (noteId) {
                    const neventId = NostrTools.nip19.neventEncode({ id: noteId, relays: [] });
                    return "nostr:" + neventId;
                }
                return 'nostr:nevent1...';
            }
        },
        note: {
            id: 'qrCodeNote',
            elementId: null,
            linkId: 'qrcodeNoteLink',
            previewId: 'qrDataPreview3',
            label: 'Note ID',
            getValue: () => {
                const noteId = window.currentNoteId;
                if (noteId) {
                    return "nostr:" + NostrTools.nip19.noteEncode(noteId);
                }
                return 'nostr:note1...';
            }
        },
        lightning: {
            id: 'lightningQRCode',
            elementId: 'lightningQRSlide',
            linkId: null,
            previewId: 'qrDataPreview4',
            label: 'Lightning Payment',
            getValue: () => window.lightningLNURL || 'lightning:lnbc1p...',
            requiresSpecialHandling: true
        }
    };
    
    // Helper functions for QR slide management
    function getSlideVisibilityStates() {
        return {
            webLink: qrShowWebLinkToggle?.checked ?? true,
            nevent: qrShowNeventToggle?.checked ?? true,
            note: qrShowNoteToggle?.checked ?? true,
            lightning: window.lightningEnabled ?? false
        };
    }
    
    function isLightningSlide(slide) {
        const slideId = slide.querySelector('img')?.id;
        const slideElementId = slide.id;
        return slideId === 'lightningQRCode' || slideElementId === 'lightningQRSlide';
    }
    
    function getSlideType(slide) {
        const slideId = slide.querySelector('img')?.id;
        const slideElementId = slide.id;
        
        for (const [type, config] of Object.entries(QR_SLIDE_CONFIGS)) {
            if (slideId === config.id || slideElementId === config.elementId) {
                return type;
            }
        }
        return null;
    }
    
    function shouldShowSlide(slide, visibilityStates) {
        const slideType = getSlideType(slide);
        if (!slideType) return true;
        
        if (slideType === 'lightning') {
            return visibilityStates.lightning;
        }
        
        return visibilityStates[slideType] ?? true;
    }
    
    function createSlideConfigs(visibilityStates) {
        return Object.entries(QR_SLIDE_CONFIGS)
            .filter(([type, config]) => visibilityStates[type])
            .map(([type, config]) => ({
                ...config,
                value: config.getValue(),
                show: true
            }));
    }
    
    // Debounce mechanism to prevent rapid successive calls
    let qrVisibilityUpdateTimeout = null;
    
    function updateQRSlideVisibility(skipURLUpdate = false) {
        // Clear any existing timeout to debounce rapid calls
        if (qrVisibilityUpdateTimeout) {
            clearTimeout(qrVisibilityUpdateTimeout);
        }
        
        // For user interactions (not skipURLUpdate), add a small debounce
        if (!skipURLUpdate) {
            qrVisibilityUpdateTimeout = setTimeout(() => {
                updateQRSlideVisibilityImmediate(skipURLUpdate);
            }, 150);
            return;
        }
        
        // For initialization calls (skipURLUpdate = true), execute immediately
        updateQRSlideVisibilityImmediate(skipURLUpdate);
    }
    
    function updateQRSlideVisibilityImmediate(skipURLUpdate = false) {
        const visibilityStates = getSlideVisibilityStates();
        
        
        
        
        
        // Check if we can avoid rebuilding by just showing/hiding existing slides
        const swiperWrapper = document.querySelector('.qr-swiper .swiper-wrapper');
        if (swiperWrapper && window.qrSwiper) {
            const existingSlides = swiperWrapper.children;
            // Check if we have all the required slides for current visibility states
            const requiredSlides = Object.values(visibilityStates).filter(Boolean).length;
            const hasAllRequiredSlides = existingSlides.length >= requiredSlides;
            
            // Force rebuild if Lightning is enabled but Lightning slide is not found
            const hasLightningSlide = Array.from(existingSlides).some(isLightningSlide);
            
            // Also check if we need to rebuild due to missing other slides
            const hasWebLinkSlide = Array.from(existingSlides).some(slide => slide.querySelector('img')?.id === 'qrCode');
            const hasNeventSlide = Array.from(existingSlides).some(slide => slide.querySelector('img')?.id === 'qrCodeNevent');
            const hasNoteSlide = Array.from(existingSlides).some(slide => slide.querySelector('img')?.id === 'qrCodeNote');
            
            const needsRebuild = (visibilityStates.lightning && !hasLightningSlide) ||
                                (visibilityStates.webLink && !hasWebLinkSlide) ||
                                (visibilityStates.nevent && !hasNeventSlide) ||
                                (visibilityStates.note && !hasNoteSlide);
            
            // Check if the number of visible slides has changed
            const currentVisibleSlides = Array.from(existingSlides).filter(slide => slide.style.display !== 'none');
            const slideCountChanged = currentVisibleSlides.length !== requiredSlides;
            
            console.log('Slide check:', { 
                requiredSlides,
                existingSlides: existingSlides.length,
                hasAllRequiredSlides,
                visibilityStates,
                hasLightningSlide,
                hasWebLinkSlide,
                hasNeventSlide,
                hasNoteSlide,
                needsRebuild,
                currentVisibleSlides: currentVisibleSlides.length,
                slideCountChanged
            });
            
            // Check if Lightning QR code actually exists (not just the slide)
            const lightningQRExists = hasLightningSlide && visibilityStates.lightning && 
                document.getElementById('lightningQRCode') && 
                document.getElementById('lightningQRCode').children.length > 0;
            
            console.log('Lightning QR existence check:', {
                hasLightningSlide,
                visibilityStatesLightning: visibilityStates.lightning,
                lightningQRElement: !!document.getElementById('lightningQRCode'),
                lightningQRChildren: document.getElementById('lightningQRCode')?.children.length || 0,
                lightningQRExists
            });
            
            // If we have all required slides and swiper exists, try to show/hide instead of rebuilding
            if (window.qrSwiper && hasAllRequiredSlides && !needsRebuild && !slideCountChanged && 
                (!visibilityStates.lightning || lightningQRExists)) {
                
                // Store references to slides that should be hidden
                const slidesToHide = [];
                const slidesToShow = [];
                
                // Check each slide
                const slides = Array.from(existingSlides);
                console.log('Found slides for processing:', slides.length, slides.map(s => ({ 
                    id: s.id, 
                    imgId: s.querySelector('img')?.id,
                    display: s.style.display 
                })));
                
                slides.forEach((slide, index) => {
                    const shouldShow = shouldShowSlide(slide, visibilityStates);
                    const slideType = getSlideType(slide);
                    
                    if (slideType === 'lightning') {
                        console.log('Processing lightning slide:', { 
                            slideId: slide.querySelector('img')?.id, 
                            slideElementId: slide.id, 
                            shouldShow, 
                            lightningEnabled: window.lightningEnabled 
                        });
                    }
                    
                    if (shouldShow) {
                        slidesToShow.push(slide);
                        slide.style.display = 'block';
                    } else {
                        slidesToHide.push(slide);
                        slide.style.display = 'none';
                    }
                });
                
                
                // Show/hide the swiper container based on visible slides
                const qrSwiperContainer = document.querySelector('.qr-swiper');
                if (slidesToShow.length > 0) {
                    // Show swiper container
                    if (qrSwiperContainer) {
                        qrSwiperContainer.style.display = 'block';
                    }
                    
                    // Update swiper without destroying it
                    if (window.qrSwiper && typeof window.qrSwiper.update === 'function') {
                        try {
                            window.qrSwiper.update();
                            
                            // Update swiper behavior based on visible slides
                            if (slidesToShow.length === 1) {
                                window.qrSwiper.allowTouchMove = false;
                                if (window.qrSwiper.autoplay && window.qrSwiper.autoplay.stop) {
                                    window.qrSwiper.autoplay.stop();
                                }
                            } else if (slidesToShow.length > 1) {
                                window.qrSwiper.allowTouchMove = true;
                                if (window.qrSwiper.params) {
                                    window.qrSwiper.params.loop = true;
                                    window.qrSwiper.params.autoplay = {
                                        delay: 10000,
                                        disableOnInteraction: false,
                                        pauseOnMouseEnter: true
                                    };
                                }
                            }
                        } catch (error) {
                            console.error('Error updating swiper:', error);
                        }
                    }
                } else {
                    // No slides to show, hide the entire swiper
                    if (qrSwiperContainer) {
                        qrSwiperContainer.style.display = 'none';
                    }
                }
                
                // Skip URL update if requested
                if (!skipURLUpdate) {
                    updateStyleURL();
                }
                return;
            }
            
            // Fallback to rebuilding if we don't have all slides or no swiper exists
            if (window.qrSwiper) {
                window.qrSwiper.destroy(true, true);
                window.qrSwiper = null;
            }
            
            // Clear and rebuild
            swiperWrapper.innerHTML = '';
        }
        
        if (swiperWrapper) {
            // Store Lightning QR slide if it exists and is enabled
            const lightningSlide = document.getElementById('lightningQRSlide');
            const shouldPreserveLightning = lightningSlide && lightningSlide.style.display !== 'none' && window.lightningEnabled;
            
            
            swiperWrapper.innerHTML = '';
            
            // Add slides based on visibility settings
            const slideConfigs = createSlideConfigs(visibilityStates);
            console.log('Creating slides with configs:', slideConfigs);
            
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
                        console.log('Created Lightning slide:', {
                            slideId: slide.id,
                            configId: config.id,
                            slideHTML: slide.innerHTML
                        });
                    }
                    
                    swiperWrapper.appendChild(slide);
                    console.log('Added slide to swiper wrapper:', {
                        slideId: slide.id,
                        configId: config.id,
                        swiperWrapperChildren: swiperWrapper.children.length
                    });
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
                    delay: 10000,
                    disableOnInteraction: false,
                    pauseOnMouseEnter: true
                } : false,
                autoHeight: false,
                height: 250,
                watchOverflow: true,
                observer: true,
                observeParents: true,
                on: {
                    init: function() {
                        setTimeout(() => {
                            initializeQRTimer();
                        }, 500);
                    },
                    slideChange: function() {
                        updateQRTimer();
                    }
                }
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
        console.log('regenerateQRCodes called:', {
            currentLiveEvent: !!window.currentLiveEvent,
            currentNoteId: window.currentNoteId,
            lightningEnabled: window.lightningEnabled,
            lightningLNURL: window.lightningLNURL
        });
        
        // Check if we have live event data first
        if (window.currentLiveEvent) {
            // Add delay to ensure swiper slides are fully created
            setTimeout(() => {
                generateLiveEventQRCodes(window.currentLiveEvent);
            }, 150);
            return;
        }
        
        // Get current note ID for regular notes
        const noteId = window.currentNoteId;
        
        // If we have Lightning enabled but no note ID, still generate Lightning QR
        if (!noteId && !window.lightningEnabled) {
            return;
        }
        
        
        // Generate QR code data (only if we have a note ID)
        let neventId, note1Id, njumpUrl, nostrNevent, nostrNote;
        if (noteId) {
            neventId = NostrTools.nip19.neventEncode({ id: noteId, relays: [] });
            note1Id = NostrTools.nip19.noteEncode(noteId);
            njumpUrl = "https://njump.me/" + note1Id;
            nostrNevent = "nostr:" + neventId;
            nostrNote = "nostr:" + note1Id;
        }
        
        const qrSize = Math.min(window.innerWidth * 0.6, window.innerHeight * 0.7);
        
        // Generate QR codes for visible slides
        const qrConfigs = [];
        
        // Add note-related QR codes only if we have a note ID
        if (noteId) {
            qrConfigs.push(
                { id: 'qrCode', value: njumpUrl, linkId: 'qrcodeLinkNostr', previewId: 'qrDataPreview1' },
                { id: 'qrCodeNevent', value: nostrNevent, linkId: 'qrcodeNeventLink', previewId: 'qrDataPreview2' },
                { id: 'qrCodeNote', value: nostrNote, linkId: 'qrcodeNoteLink', previewId: 'qrDataPreview3' }
            );
        }
        
        // Add Lightning QR if enabled
        if (window.lightningEnabled && window.lightningLNURL) {
            console.log('Adding Lightning QR to configs:', {
                id: 'lightningQRCode',
                value: window.lightningLNURL,
                linkId: 'lightningQRLink',
                previewId: 'qrDataPreview4'
            });
            qrConfigs.push({
                id: 'lightningQRCode',
                value: window.lightningLNURL,
                linkId: 'lightningQRLink',
                previewId: 'qrDataPreview4'
            });
        }
        
        console.log('QR configs to generate:', qrConfigs);
        
        
        qrConfigs.forEach(({ id, value, linkId, previewId }) => {
            const element = document.getElementById(id);
            const link = document.getElementById(linkId);
            const preview = document.getElementById(previewId);
            
            console.log(`Processing QR config ${id}:`, {
                element: !!element,
                link: !!link,
                preview: !!preview,
                value: value
            });
            
            if (element) {
                element.innerHTML = "";
                console.log(`Generating QR for ${id} with value:`, value);
                new QRious({
                    element: element,
                    size: qrSize,
                    value: value
                });
                
                // Check if QR was actually created
                setTimeout(() => {
                    console.log(`QR generation result for ${id}:`, {
                        elementChildren: element.children.length,
                        hasCanvas: element.querySelector('canvas') !== null,
                        hasImg: element.querySelector('img') !== null
                    });
                }, 100);
                
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
    window.updateQRSlideVisibilityImmediate = updateQRSlideVisibilityImmediate;
    window.regenerateQRCodes = regenerateQRCodes;
    
    if (qrShowWebLinkToggle) {
        qrShowWebLinkToggle.addEventListener('change', function(e) {
            console.log('QR Show Web Link toggle changed:', e.target.checked, 'Element:', e.target);
            updateQRSlideVisibility(); // This will call updateStyleURL() to save state
        });
    } else {
    }
    if (qrShowNeventToggle) {
        qrShowNeventToggle.addEventListener('change', function(e) {
            console.log('QR Show Nevent toggle changed:', e.target.checked);
            updateQRSlideVisibility(); // This will call updateStyleURL() to save state
        });
    } else {
        console.error('qrShowNeventToggle element not found!');
    }
    if (qrShowNoteToggle) {
        qrShowNoteToggle.addEventListener('change', function(e) {
            console.log('QR Show Note toggle changed:', e.target.checked);
            updateQRSlideVisibility(); // This will call updateStyleURL() to save state
        });
    }
    
    // Layout inversion toggle
    layoutInvertToggle.addEventListener('change', function(e) {
        document.body.classList.toggle('flex-direction-invert', e.target.checked);
        updateStyleURL();
    });
    
    // Add event listener for hide zapper content toggle
    hideZapperContentToggle.addEventListener('change', function(e) {
        document.body.classList.toggle('hide-zapper-content', e.target.checked);
        updateStyleURL();
    });
    
    // Add event listener for show top zappers toggle
    showTopZappersToggle.addEventListener('change', function(e) {
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
        document.body.classList.toggle('podium-enabled', e.target.checked);
        // Re-render zaps to apply/remove podium styling
        if (json9735List.length > 0) {
            drawKinds9735(json9735List);
        }
        updateStyleURL();
    });
    

    // Add event listener for zap grid toggle
    zapGridToggle.addEventListener('change', function(e) {
        const zapsList = document.getElementById('zaps');
        if (zapsList) {
            // Check if we're in live event mode (has two-column layout)
            const isLiveEvent = zapsList.classList.contains('live-event-two-column');
            if (isLiveEvent) {
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

// Lightning toggle state is now managed by the main styles system

// Generate unique frontend session ID
function generateFrontendSessionId() {
  return 'frontend_' + crypto.randomUUID();
}

// Get or create persistent frontend session ID
function getFrontendSessionId() {
  if (!frontendSessionId) {
    // Try to get from localStorage first
    frontendSessionId = localStorage.getItem('pubpay_frontend_session_id');
    
    if (!frontendSessionId) {
      // Generate new one if none exists
      frontendSessionId = generateFrontendSessionId();
      localStorage.setItem('pubpay_frontend_session_id', frontendSessionId);
    }
  }
  
  return frontendSessionId;
}

// Enable Lightning payments
async function enableLightningPayments() {
  const eventId = getCurrentEventId();
  
  if (!eventId) {
    console.log('No event ID found - Lightning payments require a valid event');
    // Still set the toggle state for QR slide visibility
    lightningEnabled = true;
    window.lightningEnabled = true;
    // Set a default Lightning URL for QR code generation
    window.lightningLNURL = 'lightning:lnbc1p...'; // Placeholder Lightning URL
    updateLightningToggle();
    
    // Update QR slide visibility even without full Lightning setup
    if (window.updateQRSlideVisibility) {
      window.updateQRSlideVisibility();
    }
    
    // Lightning QR will be generated by the swiper rebuild process
    
    return;
  }
  
  frontendSessionId = getFrontendSessionId();
  
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
      
      
      // Update toggle state
      lightningEnabled = true;
      updateLightningToggle();
      
      // Save to main styles system
      try {
        updateStyleURL();
      } catch (error) {
      }
      
      // Update swiper to include Lightning QR
      if (window.updateQRSlideVisibility) {
        window.updateQRSlideVisibility();
      }
      
      // Lightning QR will be generated by the swiper rebuild process
      
      // Show status message
      const statusDiv = document.getElementById('paymentStatus');
      if (data.existing) {
        statusDiv.innerHTML = '<div class="status-info">📱 Lightning enabled (reusing existing link)</div>';
      } else {
        statusDiv.innerHTML = '<div class="status-waiting">⚡ Lightning enabled - scan QR to pay</div>';
      }
      
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
  
  if (!eventId) {
    return;
  }
  
  frontendSessionId = getFrontendSessionId();
  
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
      
      // Save to main styles system
      try {
        updateStyleURL();
      } catch (error) {
      }
      
      // Update swiper to remove Lightning QR
      if (window.updateQRSlideVisibility) {
        window.updateQRSlideVisibility();
      }
      
      // Show status message
      const statusDiv = document.getElementById('paymentStatus');
      statusDiv.innerHTML = '<div class="status-disabled">🔒 Lightning disabled</div>';
      
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
  console.log('toggleLightningPayments called:', { lightningEnabled, currentState: lightningEnabled });
  if (lightningEnabled) {
    console.log('Disabling Lightning payments');
    disableLightningPayments();
  } else {
    console.log('Enabling Lightning payments');
    enableLightningPayments();
  }
  
  // Update QR slide visibility when Lightning toggle changes
  if (window.updateQRSlideVisibility) {
    console.log('Lightning toggle changed, updating QR slide visibility');
    window.updateQRSlideVisibility();
  } else {
    console.log('updateQRSlideVisibility function not available');
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
  
  try {
    new QRious({
      element: qrContainer,
      size: qrSize,
      value: lnurl
    });
    
    // Check if QR was actually created
    setTimeout(() => {
      
      if (qrContainer.children.length === 0) {
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
      }
    }, 100);
    
  } catch (error) {
    console.error('Error generating QR for popup:', error);
    
    // Last resort: Show LNURL as text
    qrContainer.innerHTML = `<div style="padding: 20px; font-family: monospace; word-break: break-all; background: #f0f0f0; border: 2px solid #ccc; border-radius: 8px;">${lnurl}</div>`;
  }
  
}

// Update toggle button appearance
function updateLightningToggle() {
  const toggle = document.getElementById('lightningToggle');
  const statusContainer = document.getElementById('lightningStatusContainer');
  
  if (lightningEnabled) {
    toggle.checked = true;
    // Don't show status container when toggling - only show when there are actual status messages
    statusContainer.style.display = 'none';
  } else {
    toggle.checked = false;
    statusContainer.style.display = 'none';
  }
}

// Add Lightning QR code to the existing swiper
function addLightningQRToSwiper(lnurl) {
  
  const lightningSlide = document.getElementById('lightningQRSlide');
  const qrContainer = document.getElementById('lightningQRCode');
  
  if (!lightningSlide || !qrContainer) {
    console.error('Lightning QR slide or container not found');
    return;
  }
  
  // Show the Lightning QR slide
  lightningSlide.style.display = 'block';
  console.log('Lightning slide display set to block:', lightningSlide.style.display);
  
  // Generate QR code using the working method
  qrContainer.innerHTML = '';
  const qrSize = Math.min(window.innerWidth * 0.6, window.innerHeight * 0.7);
  
  console.log('Generating Lightning QR:', { lnurl, qrSize, qrContainer });
  
  // Check if QRious is available
  if (typeof QRious === 'undefined') {
    console.error('QRious library not available');
    qrContainer.innerHTML = '<div style="color: white; text-align: center; padding: 20px;">QR Library Error</div>';
    return;
  }
  
  try {
    new QRious({
      element: qrContainer,
      size: qrSize,
      value: lnurl
    });
    
    // Check if QR was actually created
    setTimeout(() => {
      if (qrContainer.children.length === 0) {
        console.log('QR not created, trying fallback method');
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
        
        // Final check
        setTimeout(() => {
          if (qrContainer.children.length === 0) {
            console.error('Failed to generate Lightning QR code');
            qrContainer.innerHTML = '<div style="color: white; text-align: center; padding: 20px;">Lightning QR Error</div>';
          } else {
            console.log('Lightning QR generated successfully');
            console.log('Lightning slide visibility:', {
              display: lightningSlide.style.display,
              visibility: lightningSlide.style.visibility,
              opacity: lightningSlide.style.opacity,
              slideVisible: lightningSlide.offsetParent !== null
            });
          }
        }, 100);
      } else {
        console.log('Lightning QR generated successfully');
        console.log('Lightning slide visibility:', {
          display: lightningSlide.style.display,
          visibility: lightningSlide.style.visibility,
          opacity: lightningSlide.style.opacity,
          slideVisible: lightningSlide.offsetParent !== null
        });
      }
    }, 100);
    
  } catch (error) {
    console.error('Error generating Lightning QR for swiper:', error);
    qrContainer.innerHTML = '<div style="color: white; text-align: center; padding: 20px;">Lightning QR Error</div>';
  }
  
  // Update the QR data preview
  const preview = document.getElementById('qrDataPreview4');
  if (preview) {
    preview.textContent = `(${lnurl.substring(0, 20)}...)`;
  }
  
  // Add the slide to the swiper wrapper if not already there
  const swiperWrapper = document.querySelector('.qr-swiper .swiper-wrapper');
  console.log('Swiper wrapper found:', !!swiperWrapper);
  if (swiperWrapper && !swiperWrapper.contains(lightningSlide)) {
    console.log('Adding Lightning slide to swiper wrapper');
    swiperWrapper.appendChild(lightningSlide);
  } else if (swiperWrapper) {
    console.log('Lightning slide already in swiper wrapper');
  }
  
  // Ensure the Lightning slide has the correct class
  if (!lightningSlide.classList.contains('swiper-slide')) {
    console.log('Adding swiper-slide class to Lightning slide');
    lightningSlide.classList.add('swiper-slide');
  }
  
  // Update swiper to recognize the new slide
  if (window.qrSwiper) {
    console.log('Updating swiper after Lightning QR generation');
    window.qrSwiper.update();
    console.log('Swiper updated, slide count:', window.qrSwiper.slides.length);
    
    // Check if Lightning slide is in the swiper
    const lightningSlideInSwiper = window.qrSwiper.slides.find(slide => slide.id === 'lightningQRSlide');
    console.log('Lightning slide in swiper:', !!lightningSlideInSwiper);
    if (lightningSlideInSwiper) {
      console.log('Lightning slide visibility in swiper:', {
        display: lightningSlideInSwiper.style.display,
        visibility: lightningSlideInSwiper.style.visibility,
        opacity: lightningSlideInSwiper.style.opacity
      });
    }
  } else {
    console.error('Swiper not available for update');
  }
}

// Generate Lightning QR code and add to swiper
function generateLightningQR(lnurl, lightningSlide, qrContainer) {
  
  // Debug: Check current swiper state
  if (window.qrSwiper) {
  }
  
  // Use the same approach as other QR codes
  if (qrContainer) {
    // Clear previous content (same as other QR codes)
    qrContainer.innerHTML = "";
    
    // Calculate responsive size (same as other QR codes)
    const qrSize = Math.min(window.innerWidth * 0.6, window.innerHeight * 0.7);
    
    // Generate QR code (same as other QR codes)
    new QRious({
      element: qrContainer,
      size: qrSize,
      value: lnurl
    });
    
  }
  
  // Show the Lightning QR slide
  lightningSlide.style.display = 'block';
  
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
  
  if (swiperWrapper && !swiperWrapper.contains(lightningSlide)) {
    swiperWrapper.appendChild(lightningSlide);
  }
  
  // Check if the slide is visible in the DOM
  
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
          delay: 10000,
          disableOnInteraction: false,
        },
        effect: 'slide',
        speed: 300,
        observer: true,
        observeParents: true,
        on: {
          init: function() {
            initializeQRTimer();
          },
          slideChange: function() {
            updateQRTimer();
          }
        }
      });
      
      // Check if QR code is still there after swiper reinitialization
      const lightningSlideAfter = document.getElementById('lightningQRSlide');
      const qrContainerAfter = document.getElementById('lightningQRCode');
      if (lightningSlideAfter && qrContainerAfter) {
        
        // If QR code was lost during swiper reinit, regenerate it
        if (qrContainerAfter.children.length === 0) {
          qrContainerAfter.innerHTML = "";
          const qrSize = Math.min(window.innerWidth * 0.6, window.innerHeight * 0.7);
          new QRious({
            element: qrContainerAfter,
            size: qrSize,
            value: lnurl
          });
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
            delay: 10000,
            disableOnInteraction: false,
          },
          effect: 'slide',
          speed: 300,
          observer: true,
          observeParents: true,
          on: {
            init: function() {
              initializeQRTimer();
            },
            slideChange: function() {
              updateQRTimer();
            }
          }
        });
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
      delay: 10000,
      disableOnInteraction: false,
    },
    effect: 'slide',
    speed: 500,
    on: {
      init: function() {
        initializeQRTimer();
      },
      slideChange: function() {
        updateQRTimer();
      }
    }
  });
}

// Get current event ID from URL or live event
function getCurrentEventId() {
  // Check if we have a live event first
  if (window.currentEventType === 'live-event' && window.currentLiveEvent) {
    // For live events, use the event ID
    return window.currentLiveEvent.id;
  }
  
  // For regular notes, extract from URL
  const pathParts = window.location.pathname.split('/');
  const noteId = pathParts[pathParts.length - 1];
  return noteId && noteId !== 'live' ? noteId : null;
}

// Initialize Lightning toggle functionality
function initializeLightningToggle() {
  const toggle = document.getElementById('lightningToggle');
  if (toggle) {
    // Lightning state is now loaded by the main styles system
    // Just add the event listener
    toggle.addEventListener('change', toggleLightningPayments);
  } else {
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
        for (let i = 0; i < Math.min(3, sortedZaps.length); i++) {
            const zap = sortedZaps[i];
            zap.classList.add(`podium-global-${i + 1}`);
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

// QR Timer functionality
let qrTimerInterval = null;
let qrTimerStartTime = null;
let qrTimerDuration = 10000; // 10 seconds

function initializeQRTimer() {
    if (!window.qrSwiper) {
        return;
    }
    
    // Clear any existing timer
    if (qrTimerInterval) {
        clearInterval(qrTimerInterval);
    }
    
    // Add timer elements to all slides
    const slides = document.querySelectorAll('.qr-swiper .swiper-slide');
    
    if (slides.length === 0) {
        // Try alternative selector
        const altSlides = document.querySelectorAll('.swiper-slide');
        if (altSlides.length > 0) {
            addTimersToSlides(altSlides);
        }
        return;
    }
    
    addTimersToSlides(slides);
    
    // Start timer for current slide
    startQRTimer();
}

function addTimersToSlides(slides) {
    
    // Only show timer if there are multiple slides
    if (slides.length <= 1) {
        return;
    }
    
    slides.forEach((slide, index) => {
        
        // Remove existing timer if any
        const existingTimer = slide.querySelector('.qr-timer-container');
        if (existingTimer) {
            existingTimer.remove();
        }
        
        // Create timer container
        const timerContainer = document.createElement('div');
        timerContainer.className = 'qr-timer-container';
        
        // Create timer circle
        const timerCircle = document.createElement('div');
        timerCircle.className = 'qr-timer-circle';
        
        const timerProgress = document.createElement('div');
        timerProgress.className = 'qr-timer-progress';
        
        const timerText = document.createElement('div');
        timerText.className = 'qr-timer-text';
        timerText.textContent = '10';
        
        // Create next slide indicator (inside the circle)
        const nextIndicator = document.createElement('div');
        nextIndicator.className = 'qr-next-indicator';
        
        // For now, set a placeholder - we'll update this dynamically
        const nextSlideType = 'web';
        const nextIcon = getSlideIcon(nextSlideType);
        
        nextIndicator.className += ` qr-next-${nextSlideType}`;
        nextIndicator.textContent = nextIcon;
        
        // Create "Next Up" label
        const nextLabel = document.createElement('div');
        nextLabel.className = 'qr-next-label';
        nextLabel.textContent = 'Next Up';
        
        // Assemble the timer circle
        timerCircle.appendChild(timerProgress);
        timerCircle.appendChild(timerText);
        timerCircle.appendChild(nextIndicator);
        
        // Assemble the container
        timerContainer.appendChild(timerCircle);
        timerContainer.appendChild(nextLabel);
        
        // Append to slide
        slide.appendChild(timerContainer);
    });
}

function getSlideType(slide) {
    if (!slide) return 'web';
    
    const slideId = slide.querySelector('img')?.id;
    const slideElementId = slide.id;
    
    // Use slide ID detection for better accuracy
    if (slideId === 'qrCode') return 'web';
    if (slideId === 'qrCodeNevent') return 'nostr';
    if (slideId === 'qrCodeNote') return 'note';
    if (slideId === 'lightningQRCode' || slideElementId === 'lightningQRSlide') return 'lightning';
    
    return 'web';
}

function getSlideIcon(type) {
    const icons = {
        web: '🌐',
        nostr: 'N',
        note: 'N',  // Use Nostr icon for notes too
        lightning: '⚡'
    };
    return icons[type] || '🌐';
}

function startQRTimer() {
    if (!window.qrSwiper) {
        return;
    }
    
    // Clear existing timer
    if (qrTimerInterval) {
        clearInterval(qrTimerInterval);
        qrTimerInterval = null;
    }
    
    // Check if there are multiple slides
    const slides = document.querySelectorAll('.qr-swiper .swiper-slide');
    if (slides.length <= 1) {
        return;
    }
    
    qrTimerStartTime = Date.now();
    const currentSlide = window.qrSwiper.slides[window.qrSwiper.activeIndex];
    
    if (!currentSlide) {
        return;
    }
    
    const timerText = currentSlide.querySelector('.qr-timer-text');
    const timerProgress = currentSlide.querySelector('.qr-timer-progress');
    const nextIndicator = currentSlide.querySelector('.qr-next-indicator');
    
    if (!timerText || !timerProgress) {
        return;
    }
    
    // Update next slide indicator
    updateNextSlideIndicator(currentSlide);
    
    // Reset timer display
    timerText.textContent = '10';
    timerProgress.style.background = 'conic-gradient(from 0deg, rgba(0, 204, 102, 0.7) 0deg, transparent 0deg)';
    
    qrTimerInterval = setInterval(() => {
        const elapsed = Date.now() - qrTimerStartTime;
        const remaining = Math.max(0, qrTimerDuration - elapsed);
        const seconds = Math.ceil(remaining / 1000);
        
        timerText.textContent = seconds.toString();
        
        // Update progress circle
        const progress = (elapsed / qrTimerDuration) * 360;
        timerProgress.style.background = `conic-gradient(from 0deg, rgba(0, 204, 102, 0.7) ${progress}deg, transparent ${progress}deg)`;
        
        if (remaining <= 0) {
            clearInterval(qrTimerInterval);
            qrTimerInterval = null;
        }
    }, 100);
}

function updateNextSlideIndicator(currentSlide) {
    if (!window.qrSwiper || !currentSlide) return;
    
    const nextIndicator = currentSlide.querySelector('.qr-next-indicator');
    if (!nextIndicator) return;
    
    // Get the actual next slide from swiper
    const currentIndex = window.qrSwiper.activeIndex;
    const totalSlides = window.qrSwiper.slides.length;
    let nextSlide = null;
    
    if (totalSlides > 1) {
        // Calculate next slide index
        const nextIndex = (currentIndex + 1) % totalSlides;
        nextSlide = window.qrSwiper.slides[nextIndex];
        
    }
    
    // Determine next slide type and icon
    const nextSlideType = getSlideType(nextSlide);
    const nextIcon = getSlideIcon(nextSlideType);
    
    // Update the indicator
    nextIndicator.className = `qr-next-indicator qr-next-${nextSlideType}`;
    nextIndicator.textContent = nextIcon;
    
    console.log('Updated next slide indicator:', {
        nextSlideType,
        nextIcon,
        nextIndicator: nextIndicator,
        className: nextIndicator.className,
        textContent: nextIndicator.textContent,
        isVisible: nextIndicator.style.display !== 'none'
    });
    
}

function updateQRTimer() {
    // Clear any existing timer first
    if (qrTimerInterval) {
        clearInterval(qrTimerInterval);
        qrTimerInterval = null;
    }
    
    // Restart timer for new slide
    setTimeout(() => {
        startQRTimer();
    }, 100);
}

// Pause timer when swiper is paused
function pauseQRTimer() {
    if (qrTimerInterval) {
        clearInterval(qrTimerInterval);
    }
}

// Resume timer when swiper resumes
function resumeQRTimer() {
    startQRTimer();
}

// Manual timer initialization for testing
function testQRTimer() {
    
    const slides = document.querySelectorAll('.qr-swiper .swiper-slide');
    
    if (slides.length > 0) {
    }
    
    initializeQRTimer();
}

// Make test function available globally
window.testQRTimer = testQRTimer;
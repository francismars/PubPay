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
    const noteIdFromPath = pathParts[pathParts.length - 1]; // Get the last part of the path
    console.log("Note ID from URL path:", noteIdFromPath);
    
    // Also check for query parameters for backward compatibility
    let urlToParse = location.search;
    const params = new URLSearchParams(urlToParse);
    const noteFromQuery = params.get("note");
    
    // Use path parameter if available, otherwise fall back to query parameter
    let nevent = noteIdFromPath && noteIdFromPath !== 'live' ? noteIdFromPath : noteFromQuery;
    console.log("Using note ID:", nevent);

    // Strip nostr: protocol prefix if present
    nevent = stripNostrPrefix(nevent);
    if (nevent !== noteIdFromPath && nevent !== noteFromQuery) {
        console.log("Stripped nostr: prefix, now:", nevent);
    }

    // Decode nevent to note if present in URL
    if (nevent) {
        try {
            const decoded = NostrTools.nip19.decode(nevent);
            if (decoded.type === 'nevent') {
                // Preserve original nevent format in URL
                const newUrl = '/live/' + nevent;
                window.history.replaceState({}, '', newUrl);
                // Keep nevent as is, don't convert to note
            }
        } catch (e) {
            console.log("Error decoding note parameter:", e);
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

    // Style options URL parameters
    const DEFAULT_STYLES = {
        textColor: '#000000',
        bgColor: '#ffffff',
        bgImage: '',
        qrInvert: false,
        qrScreenBlend: false,
        qrMultiplyBlend: false,
        layoutInvert: false,
        hideZapperContent: false,
        podium: false,
        // fontSize: 1.0, // Disabled - using CSS vw units
        opacity: 1.0,
        textOpacity: 1.0,
        partnerLogo: ''
    };

    // Style presets
    const STYLE_PRESETS = {
        lightMode: {
            textColor: '#000000',
            bgColor: '#ffffff',
            bgImage: '',
            qrInvert: false,
            qrScreenBlend: false,
            qrMultiplyBlend: false,
            layoutInvert: false,
            hideZapperContent: false,
            podium: false,
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
            layoutInvert: false,
            hideZapperContent: false,
            podium: false,
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
            layoutInvert: false,
            hideZapperContent: false,
            podium: true,
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
            layoutInvert: false,
            hideZapperContent: false,
            podium: false,
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
            layoutInvert: false,
            hideZapperContent: false,
            podium: false,
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
            layoutInvert: false,
            hideZapperContent: false,
            podium: false,
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
            layoutInvert: false,
            hideZapperContent: false,
            podium: false,
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
            layoutInvert: false,
            hideZapperContent: false,
            podium: false,
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
    const podiumToggle = document.getElementById('podiumToggle');
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
        layoutInvert: layoutInvertToggle.checked,
        hideZapperContent: hideZapperContentToggle.checked,
        podium: podiumToggle.checked,
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
        const qrCode = document.getElementById('qrCode');
        if (qrCode) qrCode.style.filter = invert ? 'invert(1)' : 'none';
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
    
    // Apply podium
    if (params.has('podium')) {
        const podium = params.get('podium') === 'true';
        const podiumToggle = document.getElementById('podiumToggle');
        if (podiumToggle) podiumToggle.checked = podium;
        document.body.classList.toggle('podium-enabled', podium);
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
        
        // Apply podium
        if (styles.podium !== undefined) {
            const podiumToggle = document.getElementById('podiumToggle');
            if (podiumToggle) podiumToggle.checked = styles.podium;
            document.body.classList.toggle('podium-enabled', styles.podium);
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
    
    // Check if it's a valid NIP-19 format (starts with note1 or nevent1)
    if (!noteId.startsWith('note1') && !noteId.startsWith('nevent1')) {
        throw new Error('Invalid format. Please enter a valid nostr note ID (note1...) or event ID (nevent1...)');
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
                loadingText.textContent = 'Loading post content...';
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
                loadingText.textContent = 'Loading post content...';
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

if(nevent){
    console.log("Note found in URL, attempting to load:", nevent);
    // Validate note ID before loading
    try {
        validateNoteId(nevent);
        loadNoteContent(nevent);
    } catch (error) {
        console.log("Invalid note ID in URL:", error.message);
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
                loadingText.textContent = 'Loading post content...';
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
                loadingText.textContent = 'Loading post content...';
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
        // Try to decode as nevent first
        const decoded = NostrTools.nip19.decode(note1);
        if (decoded.type === 'nevent') {
            kind1ID = decoded.data.id;
        } else if (decoded.type === 'note') {
            kind1ID = decoded.data;
        } else {
            throw new Error('Invalid note format. Please enter a valid nostr note ID.');
        }
    } catch (e) {
        // If decoding fails, show error instead of trying to use invalid input
        alert('Invalid nostr identifier. Please enter a valid note ID (note1...) or event ID (nevent1...).');
        return;
    }
    
    // Update URL with the note parameter using path format
    const newUrl = '/live/' + note1;
    window.history.replaceState({}, '', newUrl);
    
    // Show loading animations on content elements
    const noteContent = document.querySelector('.note-content');
    const zapsList = document.getElementById('zaps');
    
    if (noteContent) {
        noteContent.classList.add('loading');
        // Add loading text if not already present
        if (!noteContent.querySelector('.loading-text')) {
            const loadingText = document.createElement('div');
            loadingText.className = 'loading-text';
            loadingText.textContent = 'Loading post content...';
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
        const kind0fromkind9735 = kind0fromkind9735List.find(kind0 => pubkey9735 === kind0.pubkey);
        if(kind0fromkind9735){
            const displayName = JSON.parse(kind0fromkind9735.content).displayName
            kind0name = displayName ? JSON.parse(kind0fromkind9735.content).displayName : JSON.parse(kind0fromkind9735.content).display_name
            kind0finalName = kind0name!="" ? kind0name : JSON.parse(kind0fromkind9735.content).name
            console.log(kind0finalName)
            kind0picture = JSON.parse(kind0fromkind9735.content).picture
            kind0npub = NostrTools.nip19.npubEncode(kind0fromkind9735.pubkey)
        }
        const json9735 = {"e": kind1from9735, "amount": amount9735, "picture": kind0picture, "npubPayer": kind0npub, "pubKey": pubkey9735, "zapEventID": kind9735id, "kind9735content": kind9735Content, "kind1Name": kind0finalName}
        json9735List.push(json9735)
    }
    json9735List.sort((a, b) => b.amount - a.amount);
    drawKinds9735(json9735List)
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
    
    let qrcodeContainer = document.getElementById("qrCode");
    qrcodeContainer.innerHTML = "";
    new QRious({
        element: qrcodeContainer,
        size: Math.min(window.innerWidth * 0.6, window.innerHeight * 0.7), // Much bigger for far-away scanning
        value: "https://njump.me/"+NostrTools.nip19.noteEncode(kind1.id)
    });
    
    // Apply current blend mode settings to the newly created QR code
    const qrScreenBlendToggle = document.getElementById('qrScreenBlendToggle');
    const qrMultiplyBlendToggle = document.getElementById('qrMultiplyBlendToggle');
    
    if (qrScreenBlendToggle.checked) {
        qrcodeContainer.style.mixBlendMode = 'screen';
    } else if (qrMultiplyBlendToggle.checked) {
        qrcodeContainer.style.mixBlendMode = 'multiply';
    } else {
        qrcodeContainer.style.mixBlendMode = 'normal';
    }
    
    document.getElementById("qrcodeLinkNostr").href = "https://njump.me/"+NostrTools.nip19.noteEncode(kind1.id)
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

      // Sort zaps by amount (highest first) - no limit, let them overflow
      const sortedZaps = json9735List.sort((a, b) => b.amount - a.amount);

      for(let i = 0; i < sortedZaps.length; i++){
        const json9735 = sortedZaps[i];
        const zapDiv = document.createElement("div");
        
        // Add podium class if podium is enabled and this is in top 3
        let zapClass = "zap";
        if (document.body.classList.contains('podium-enabled') && i < 3) {
            zapClass += ` podium-${i + 1}`;
        }
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
    const qrCodeContainer = document.getElementById('qrCode');
    
    if (qrScreenBlendToggle.checked) {
        qrCodeContainer.style.mixBlendMode = 'screen';
        qrMultiplyBlendToggle.checked = false;
        document.body.classList.add('qr-blend-active');
    } else if (qrMultiplyBlendToggle.checked) {
        qrCodeContainer.style.mixBlendMode = 'multiply';
        qrScreenBlendToggle.checked = false;
        document.body.classList.add('qr-blend-active');
    } else {
        qrCodeContainer.style.mixBlendMode = 'normal';
        document.body.classList.remove('qr-blend-active');
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
    document.getElementById('podiumToggle').checked = preset.podium;
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
    const qrCodeContainer = document.getElementById('qrCode');
    if (qrCodeContainer) {
        qrCodeContainer.style.filter = document.getElementById('qrInvertToggle').checked ? 'invert(1)' : 'none';
        updateBlendMode();
    }
    
    // Apply layout effects
    document.body.classList.toggle('flex-direction-invert', document.getElementById('layoutInvertToggle').checked);
    document.body.classList.toggle('hide-zapper-content', document.getElementById('hideZapperContentToggle').checked);
    document.body.classList.toggle('podium-enabled', document.getElementById('podiumToggle').checked);
    
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
            if (styles.layoutInvert !== DEFAULT_STYLES.layoutInvert) {
                params.set('layoutInvert', styles.layoutInvert);
            }
            if (styles.hideZapperContent !== DEFAULT_STYLES.hideZapperContent) {
                params.set('hideZapperContent', styles.hideZapperContent);
            }
            if (styles.podium !== DEFAULT_STYLES.podium) {
                params.set('podium', styles.podium);
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
        qrCode.style.filter = e.target.checked ? 'invert(1)' : 'none';
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
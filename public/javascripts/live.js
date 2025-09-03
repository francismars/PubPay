console.log("Live.js file loaded successfully!");
console.log("NostrTools available:", typeof NostrTools !== 'undefined');
console.log("lightningPayReq available:", typeof lightningPayReq !== 'undefined');

document.addEventListener('DOMContentLoaded', function() {
    console.log("DOMContentLoaded event fired!");
    
    // Initialize font sizes for scaling
    setTimeout(() => {
        initializeFontSizes();
    }, 100); // Small delay to ensure all elements are rendered
    
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
        textColor: '#ffffff',
        bgColor: '#000000',
        bgImage: '/images/lightning.gif',
        qrInvert: false,
        qrScreenBlend: false,
        qrMultiplyBlend: false,
        layoutInvert: false,
        hideZapperContent: false,
        podium: false,
        fontSize: 1.0,
        opacity: 0.5,
        textOpacity: 1.0
    };

    // Style presets
    const STYLE_PRESETS = {
        default: {
            textColor: '#ffffff',
            bgColor: '#000000',
            bgImage: '/images/lightning.gif',
            qrInvert: false,
            qrScreenBlend: false,
            qrMultiplyBlend: false,
            layoutInvert: false,
            hideZapperContent: false,
            podium: false,
            fontSize: 1.0,
            opacity: 0.5,
            textOpacity: 1.0
        },
        cosmic: {
            textColor: '#ffffff',
            bgColor: '#0a0a1a',
            bgImage: 'https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExdDQxdWlyMnhhZjl2dHYwdmZ3c2pzM3ZldDdhemh3MWtxNnFtZHExaSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/k4n9RZ6c9Gc3eOvBKc/giphy.gif',
            qrInvert: false,
            qrScreenBlend: true,
            qrMultiplyBlend: false,
            layoutInvert: false,
            hideZapperContent: false,
            podium: true,
            fontSize: 1.1,
            opacity: 0.4,
            textOpacity: 1.0
        },
        vibrant: {
            textColor: '#ffd700',
            bgColor: '#2d1b69',
            bgImage: 'https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExYzRqdGF6MnVia3k5cjdpZjRqaWY5NWliYjF4NW9jeGI2aXJ5dGR1MiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/85puET78qkpU5Orh0O/giphy.gif',
            qrInvert: false,
            qrScreenBlend: false,
            qrMultiplyBlend: false,
            layoutInvert: false,
            hideZapperContent: false,
            podium: false,
            fontSize: 1.0,
            opacity: 0.6,
            textOpacity: 1.0
        },
        electric: {
            textColor: '#00ffff',
            bgColor: '#000033',
            bgImage: 'https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExY2dkaGl0dTlhb3dncXZwNWw3a2MxbmtmaHhobGN3cnVvNjc3c2hyeSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/qg9cMYw8vMMag62CbE/giphy.gif',
            qrInvert: false,
            qrScreenBlend: true,
            qrMultiplyBlend: false,
            layoutInvert: false,
            hideZapperContent: false,
            podium: false,
            fontSize: 1.0,
            opacity: 0.7,
            textOpacity: 1.0
        },
        warm: {
            textColor: '#ff8c42',
            bgColor: '#2c1810',
            bgImage: 'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExdHl6YTNrN2l4ZXRnaDVsZmplaWU5c3M2bjYwcTZxN3N0cGVrbmprZyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/vYMEkIhgfi7ooOFlkA/giphy.gif',
            qrInvert: false,
            qrScreenBlend: false,
            qrMultiplyBlend: false,
            layoutInvert: false,
            hideZapperContent: false,
            podium: false,
            fontSize: 1.0,
            opacity: 0.5,
            textOpacity: 1.0
        },
        minimal: {
            textColor: '#f4a460',
            bgColor: '#2a2a2a',
            bgImage: 'https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExOWw1NDhqbnk2engwMzBwa2didHJtbnd0NHNjdGRpem8ybTgyZnRhMyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/Ot7SIhparretCrwRI0/giphy.gif',
            qrInvert: false,
            qrScreenBlend: false,
            qrMultiplyBlend: false,
            layoutInvert: false,
            hideZapperContent: true,
            podium: false,
            fontSize: 0.9,
            opacity: 0.8,
            textOpacity: 1.0
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
    const currentParams = new URLSearchParams(window.location.search);
    const mainLayout = document.querySelector('.main-layout');
    
    // Only add parameters that differ from defaults
    const currentTextColor = toHexColor(mainLayout.style.getPropertyValue('--text-color') || DEFAULT_STYLES.textColor);
    if (currentTextColor !== DEFAULT_STYLES.textColor) {
        currentParams.set('textColor', currentTextColor);
    } else {
        currentParams.delete('textColor');
    }
    
    const currentBgColor = toHexColor(mainLayout.style.backgroundColor);
    if (currentBgColor !== DEFAULT_STYLES.bgColor) {
        currentParams.set('bgColor', currentBgColor);
    } else {
        currentParams.delete('bgColor');
    }
    
    if (bgImageUrl.value !== DEFAULT_STYLES.bgImage) {
        currentParams.set('bgImage', bgImageUrl.value);
    } else {
        currentParams.delete('bgImage');
    }
    
    const qrCodeContainer = document.getElementById('qrCode');
    
    if (qrCodeContainer && qrCodeContainer.style.filter !== (DEFAULT_STYLES.qrInvert ? 'invert(1)' : 'none')) {
        currentParams.set('qrInvert', qrInvertToggle.checked);
    } else {
        currentParams.delete('qrInvert');
    }
    
    if (qrCodeContainer && qrCodeContainer.style.mixBlendMode !== (DEFAULT_STYLES.qrScreenBlend ? 'screen' : 
        DEFAULT_STYLES.qrMultiplyBlend ? 'multiply' : 'normal')) {
        if (qrScreenBlendToggle.checked) {
            currentParams.set('qrBlend', 'screen');
        } else if (qrMultiplyBlendToggle.checked) {
            currentParams.set('qrBlend', 'multiply');
        } else {
            currentParams.delete('qrBlend');
        }
    } else {
        currentParams.delete('qrBlend');
    }
    
    if (document.body.classList.contains('flex-direction-invert') !== DEFAULT_STYLES.layoutInvert) {
        currentParams.set('layoutInvert', layoutInvertToggle.checked);
    } else {
        currentParams.delete('layoutInvert');
    }
    
    if (document.body.classList.contains('hide-zapper-content') !== DEFAULT_STYLES.hideZapperContent) {
        currentParams.set('hideZapperContent', hideZapperContentToggle.checked);
    } else {
        currentParams.delete('hideZapperContent');
    }
    
    if (document.body.classList.contains('podium-enabled') !== DEFAULT_STYLES.podium) {
        currentParams.set('podium', podiumToggle.checked);
    } else {
        currentParams.delete('podium');
    }
    
    // Add new parameters
    const currentFontSize = parseFloat(fontSizeSlider.value);
    if (currentFontSize !== DEFAULT_STYLES.fontSize) {
        currentParams.set('fontSize', currentFontSize);
    } else {
        currentParams.delete('fontSize');
    }
    
    const currentOpacity = parseFloat(opacitySlider.value);
    if (currentOpacity !== DEFAULT_STYLES.opacity) {
        currentParams.set('opacity', currentOpacity);
    } else {
        currentParams.delete('opacity');
    }
    
    const currentTextOpacity = parseFloat(textOpacitySlider.value);
    if (currentTextOpacity !== DEFAULT_STYLES.textOpacity) {
        currentParams.set('textOpacity', currentTextOpacity);
    } else {
        currentParams.delete('textOpacity');
    }
    
    // Update URL without reloading the page, preserving the note ID in the path
    const pathParts = window.location.pathname.split('/');
    const noteId = pathParts[pathParts.length - 1];
    const basePath = noteId && noteId !== 'live' ? `/live/${noteId}` : '/live';
    const newUrl = basePath + (currentParams.toString() ? '?' + currentParams.toString() : '');
    window.history.replaceState({}, '', newUrl);
}

function applyStylesFromURL() {
    const mainLayout = document.querySelector('.main-layout');
    
    // Get note ID from URL path (same logic as in main function)
    const pathParts = window.location.pathname.split('/');
    const noteIdFromPath = pathParts[pathParts.length - 1];
    const noteFromQuery = params.get("note");
    const currentNoteId = noteIdFromPath && noteIdFromPath !== 'live' ? noteIdFromPath : noteFromQuery;
    
    // Apply default background color if no custom color is specified
    if (!params.has('bgColor')) {
        const defaultColor = DEFAULT_STYLES.bgColor;
        const rgbaColor = hexToRgba(defaultColor, 0.5);
        mainLayout.style.backgroundColor = rgbaColor;
        document.getElementById('bgColorPicker').value = defaultColor;
        document.getElementById('bgColorValue').value = defaultColor;
    }
    
    // Apply text color
    if (params.has('textColor')) {
        const color = toHexColor(params.get('textColor'));
        mainLayout.style.setProperty('--text-color', color);
        
        // Also specifically override zaps header elements that have hardcoded colors
        const zapsHeaderH2 = mainLayout.querySelector('.zaps-header-left h2');
        const totalLabel = mainLayout.querySelector('.total-label');
        const totalSats = mainLayout.querySelector('.total-sats');
        
        if (zapsHeaderH2) zapsHeaderH2.style.color = color;
        if (totalLabel) totalLabel.style.color = color;
        if (totalSats) totalSats.style.color = color;
        
        document.getElementById('textColorPicker').value = color;
        document.getElementById('textColorValue').value = color;
    }
    
    // Apply background color
    if (params.has('bgColor')) {
        const color = toHexColor(params.get('bgColor'));
        const rgbaColor = hexToRgba(color, 0.5);
        mainLayout.style.backgroundColor = rgbaColor;
        document.getElementById('bgColorPicker').value = color;
        document.getElementById('bgColorValue').value = color;
    }
    
    // Apply background image
    if (params.has('bgImage')) {
        const imageUrl = params.get('bgImage');
        bgImageUrl.value = imageUrl;
        updateBackgroundImage(imageUrl);
        
        // Set the preset dropdown to match the URL
        const bgImagePreset = document.getElementById('bgImagePreset');
        const customUrlGroup = document.getElementById('customUrlGroup');
        const bgPresetPreview = document.getElementById('bgPresetPreview');
        
        // Check if the URL matches any preset
        const matchingOption = bgImagePreset.querySelector(`option[value="${imageUrl}"]`);
        if (matchingOption) {
            bgImagePreset.value = imageUrl;
            customUrlGroup.style.display = 'none';
            
            // Update preview directly
            bgPresetPreview.src = imageUrl;
            bgPresetPreview.alt = 'Background preview';
        } else {
            bgImagePreset.value = 'custom';
            customUrlGroup.style.display = 'block';
        }
    }
    
    // Apply default QR code blend mode if no custom blend is specified
    if (!params.has('qrBlend')) {
        const qrCodeContainer = document.getElementById('qrCode');
        if (qrCodeContainer) {
            if (DEFAULT_STYLES.qrScreenBlend) {
                qrCodeContainer.style.mixBlendMode = 'screen';
                qrScreenBlendToggle.checked = true;
            } else if (DEFAULT_STYLES.qrMultiplyBlend) {
                qrCodeContainer.style.mixBlendMode = 'multiply';
                qrMultiplyBlendToggle.checked = true;
            } else {
                qrCodeContainer.style.mixBlendMode = 'normal';
            }
        }
    }
    
    // Apply QR code invert
    if (params.has('qrInvert')) {
        const invert = params.get('qrInvert') === 'true';
        qrInvertToggle.checked = invert;
        const qrCodeContainer = document.getElementById('qrCode');
        if (qrCodeContainer) {
            qrCodeContainer.style.filter = invert ? 'invert(1)' : 'none';
        }
    }
    
    // Apply QR code blend mode
    if (params.has('qrBlend')) {
        const blend = params.get('qrBlend');
        qrScreenBlendToggle.checked = blend === 'screen';
        qrMultiplyBlendToggle.checked = blend === 'multiply';
        const qrCodeContainer = document.getElementById('qrCode');
        if (qrCodeContainer) {
            qrCodeContainer.style.mixBlendMode = blend;
        }
    }
    
    // Apply layout invert
    if (params.has('layoutInvert')) {
        const invert = params.get('layoutInvert') === 'true';
        layoutInvertToggle.checked = invert;
        document.body.classList.toggle('flex-direction-invert', invert);
    }
    
    // Apply zapper content visibility
    if (params.has('hideZapperContent')) {
        const hide = params.get('hideZapperContent') === 'true';
        hideZapperContentToggle.checked = hide;
        document.body.classList.toggle('hide-zapper-content', hide);
    }
    
    // Apply podium toggle
    if (params.has('podium')) {
        const podium = params.get('podium') === 'true';
        podiumToggle.checked = podium;
        document.body.classList.toggle('podium-enabled', podium);
    }
    
    // Apply font size
    if (params.has('fontSize')) {
        const fontSize = parseFloat(params.get('fontSize'));
        fontSizeSlider.value = fontSize;
        fontSizeValue.textContent = Math.round(fontSize * 100) + '%';
        mainLayout.style.fontSize = `${fontSize}em`;
    }
    
    // Apply opacity
    if (params.has('opacity')) {
        const opacity = parseFloat(params.get('opacity'));
        opacitySlider.value = opacity;
        opacityValue.textContent = Math.round(opacity * 100) + '%';
        // Reapply background color with new opacity
        const currentBgColor = toHexColor(mainLayout.style.backgroundColor);
        const rgbaColor = hexToRgba(currentBgColor, opacity);
        mainLayout.style.backgroundColor = rgbaColor;
    }
    
    // Apply text opacity
    if (params.has('textOpacity')) {
        const textOpacity = parseFloat(params.get('textOpacity'));
        textOpacitySlider.value = textOpacity;
        textOpacityValue.textContent = Math.round(textOpacity * 100) + '%';
        // Apply text opacity to all text elements
        const currentTextColor = toHexColor(mainLayout.style.getPropertyValue('--text-color') || DEFAULT_STYLES.textColor);
        const rgbaTextColor = hexToRgba(currentTextColor, textOpacity);
        mainLayout.style.setProperty('--text-color', rgbaTextColor);
    }
    
    // Load note if present in URL
    if (currentNoteId) {
        console.log("Note found in URL during style application, attempting to load:", currentNoteId);
        loadNoteContent(currentNoteId);
    }
}

function loadNoteContent(noteId) {
    console.log("Loading note content for:", noteId);
    try {
        const decoded = NostrTools.nip19.decode(noteId);
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
    loadNoteContent(nevent);
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

// Apply styles from URL after DOM elements are ready
applyStylesFromURL();

// Ensure podium is off by default if not specified in URL
if (!params.has('podium')) {
    document.body.classList.remove('podium-enabled');
    if (podiumToggle) {
        podiumToggle.checked = false;
    }
}

document.getElementById('note1LoaderSubmit').addEventListener('click', note1fromLoader);

function note1fromLoader(){
    const note1 = document.getElementById('note1LoaderInput').value;
    let kind1ID;
    
    try {
        // Try to decode as nevent first
        const decoded = NostrTools.nip19.decode(note1);
        if (decoded.type === 'nevent') {
            kind1ID = decoded.data.id;
        } else if (decoded.type === 'note') {
            kind1ID = decoded.data;
        } else {
            throw new Error('Invalid format');
        }
    } catch (e) {
        // If decoding fails, try to use the input directly as a note ID
        kind1ID = note1;
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
    
    // Re-initialize font sizes after new content is loaded
    setTimeout(() => {
        initializeFontSizes();
    }, 50);
    
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
                <div class="zapperName">
                    ${json9735.kind1Name}
                </div>
            </div>
            <div class="zapperContent">
                <div class="zapperMessage">${json9735.kind9735content || ''}</div>
            </div>
            <div class="zapperAmount">
                <span class="zapperAmountSats">${numberWithCommas(json9735.amount)}</span>
                <span class="zapperAmountSats">sats</span>
            </div>
        `;
        zapsContainer.appendChild(zapDiv);
        
        // Initialize font sizes for the newly created zapper elements
        setTimeout(() => {
            const newElements = [
                zapDiv.querySelector('.zapperName'),
                zapDiv.querySelector('.zapperMessage'),
                ...zapDiv.querySelectorAll('.zapperAmountSats')
            ].filter(el => el); // Filter out null elements
            
            newElements.forEach(element => {
                const computedStyle = window.getComputedStyle(element);
                const originalSize = computedStyle.fontSize;
                window.originalFontSizes.set(element, originalSize);
                
                // Apply current font size scaling if slider is not at 100%
                const currentFontSize = parseFloat(document.getElementById('fontSizeSlider').value);
                if (currentFontSize !== 1.0) {
                    element.style.fontSize = `calc(${originalSize} * ${currentFontSize})`;
                }
            });
        }, 10);
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
            // For background color, update the main-layout with 0.5 transparency
            const rgbaColor = hexToRgba(color, 0.5);
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
                // For background color, update the main-layout with 0.5 transparency
                const rgbaColor = hexToRgba(color, 0.5);
                mainLayout.style.backgroundColor = rgbaColor;
            } else if (targetProperty === 'color') {
                // For text color, use CSS custom property for consistent inheritance
                mainLayout.style.setProperty('--text-color', color);
                
                // Apply color to all text elements that might have hardcoded colors
                const textElements = mainLayout.querySelectorAll(`
                    .zaps-header-left h2,
                    .total-label,
                    .total-sats,
                    .total-amount,
                    .dashboard-title,
                    .zapperName,
                    .zapperAmountSats,
                    .author-name,
                    .note-content,
                    .note-content *,
                    .section-label,
                    .qr-instructions,
                    .zaps-header,
                    .zaps-container,
                    .zaps-list,
                    .zap,
                    .zapperProfile,
                    .zapperContent,
                    .zapperMessage,
                    .post-info,
                    .author-section,
                    .note-section,
                    .qr-section
                `);
                
                textElements.forEach(element => {
                    element.style.color = color;
                });
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
    } else if (qrMultiplyBlendToggle.checked) {
        qrCodeContainer.style.mixBlendMode = 'multiply';
        qrScreenBlendToggle.checked = false;
    } else {
        qrCodeContainer.style.mixBlendMode = 'normal';
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
    document.getElementById('qrInvertToggle').checked = preset.qrInvert;
    document.getElementById('qrScreenBlendToggle').checked = preset.qrScreenBlend;
    document.getElementById('qrMultiplyBlendToggle').checked = preset.qrMultiplyBlend;
    document.getElementById('layoutInvertToggle').checked = preset.layoutInvert;
    document.getElementById('hideZapperContentToggle').checked = preset.hideZapperContent;
    document.getElementById('podiumToggle').checked = preset.podium;
    document.getElementById('fontSizeSlider').value = preset.fontSize;
    document.getElementById('fontSizeValue').textContent = Math.round(preset.fontSize * 100) + '%';
    document.getElementById('opacitySlider').value = preset.opacity;
    document.getElementById('opacityValue').textContent = Math.round(preset.opacity * 100) + '%';
    document.getElementById('textOpacitySlider').value = preset.textOpacity;
    document.getElementById('textOpacityValue').textContent = Math.round(preset.textOpacity * 100) + '%';
    
    // Apply the styles
    applyAllStyles();
    
    // Update active preset button
    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-preset="${presetName}"]`).classList.add('active');
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
    const textColor = document.getElementById('textColorValue').value;
    const bgColor = document.getElementById('bgColorValue').value;
    const bgImage = document.getElementById('bgImageUrl').value;
    console.log('Style values:', { textColor, bgColor, bgImage });
    const fontSize = parseFloat(document.getElementById('fontSizeSlider').value);
    const opacity = parseFloat(document.getElementById('opacitySlider').value);
    const textOpacity = parseFloat(document.getElementById('textOpacitySlider').value);
    
    // Apply text color with opacity
    const rgbaTextColor = hexToRgba(textColor, textOpacity);
    mainLayout.style.setProperty('--text-color', rgbaTextColor);
    
    // Apply color to all text elements that might have hardcoded colors
    const textElements = mainLayout.querySelectorAll(`
        .zaps-header-left h2,
        .total-label,
        .total-sats,
        .total-amount,
        .dashboard-title,
        .zapperName,
        .zapperAmountSats,
        .author-name,
        .note-content,
        .note-content *,
        .section-label,
        .qr-instructions,
        .zaps-header,
        .zaps-container,
        .zaps-list,
        .zap,
        .zapperProfile,
        .zapperContent,
        .zapperMessage,
        .post-info,
        .author-section,
        .note-section,
        .qr-section
    `);
    
    textElements.forEach(element => {
        element.style.color = textColor;
    });
    
    // Apply background color with opacity
    const rgbaColor = hexToRgba(bgColor, opacity);
    mainLayout.style.backgroundColor = rgbaColor;
    
    // Apply background image
    updateBackgroundImage(bgImage);
    
    // Apply font size to specific elements that have fixed font-sizes
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
    
    // Store original font sizes if not already stored
    if (!window.originalFontSizes) {
        window.originalFontSizes = new Map();
        elementsToScale.forEach(selector => {
            const elements = mainLayout.querySelectorAll(selector);
            elements.forEach(element => {
                // Temporarily reset any inline styles to get original size
                const currentInlineStyle = element.style.fontSize;
                element.style.fontSize = '';
                const computedStyle = window.getComputedStyle(element);
                const originalSize = computedStyle.fontSize;
                window.originalFontSizes.set(element, originalSize);
                // Restore inline style if it existed
                if (currentInlineStyle) {
                    element.style.fontSize = currentInlineStyle;
                }
            });
        });
    }
    
    // Apply scaled font sizes
    elementsToScale.forEach(selector => {
        const elements = mainLayout.querySelectorAll(selector);
        elements.forEach(element => {
            let originalSize = window.originalFontSizes.get(element);
            
            // If element not in map, capture its original size now
            if (!originalSize) {
                const currentInlineStyle = element.style.fontSize;
                element.style.fontSize = '';
                const computedStyle = window.getComputedStyle(element);
                originalSize = computedStyle.fontSize;
                window.originalFontSizes.set(element, originalSize);
                if (currentInlineStyle) {
                    element.style.fontSize = currentInlineStyle;
                }
            }
            
            if (originalSize) {
                element.style.fontSize = `calc(${originalSize} * ${fontSize})`;
            }
        });
    });
    
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
    
    updateStyleURL();
}

function resetToDefaults() {
    applyPreset('default');
}

function copyStyleUrl() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
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
                bgPresetPreview.alt = 'Background preview';
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
        bgImagePreset.value = '/images/lightning.gif';
        customUrlGroup.style.display = 'none';
        updateBackgroundImage('/images/lightning.gif');
        updateStyleURL();
        applyAllStyles(); // Sync all style controls
        bgPresetPreview.src = '/images/lightning.gif';
        bgPresetPreview.alt = 'Background preview';
    });
    
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
    
    // Font size slider
    fontSizeSlider.addEventListener('input', function(e) {
        const value = parseFloat(e.target.value);
        fontSizeValue.textContent = Math.round(value * 100) + '%';
        applyAllStyles();
    });
    
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
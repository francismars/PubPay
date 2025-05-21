let urlToParse = location.search;
const params = new URLSearchParams(urlToParse);
console.log(params.get("note"))
let nevent = params.get("note")  // ? params.get("note") "note16a7m73en9w4artfclcnhqf8jzngepmg2j2et3l2yk0ksfhftv0ls3hugv7";
// "b4728c14cbe74a1008d4ed80817dd412ad276469da1b007e7e00e071368c4c9b"

// Decode nevent to note if present in URL
if (nevent) {
    try {
        const decoded = NostrTools.nip19.decode(nevent);
        if (decoded.type === 'nevent') {
            // Convert nevent to note format and update URL
            const note = NostrTools.nip19.noteEncode(decoded.data.id);
            const currentParams = new URLSearchParams(window.location.search);
            currentParams.set('note', note);
            const newUrl = window.location.pathname + '?' + currentParams.toString();
            window.history.replaceState({}, '', newUrl);
            nevent = note;
        }
    } catch (e) {
        console.log("Error decoding note parameter:", e);
    }
}

const pool = new NostrTools.SimplePool()
const relays = ['wss://relay.damus.io', 'wss://relay.primal.net', 'wss://relay.nostr.band/', 'wss://relay.nostr.nu/']

let json9735List = []

// Style options URL parameters
const DEFAULT_STYLES = {
    textColor: '#ffffff',
    bgColor: '#000000',
    bgImage: '/images/lightning.gif',
    qrInvert: true,
    qrScreenBlend: true,
    qrMultiplyBlend: false,
    layoutInvert: false,
    hideZapperContent: false
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
    
    // Only add parameters that differ from defaults
    const currentTextColor = toHexColor(liveElement.style.color);
    if (currentTextColor !== DEFAULT_STYLES.textColor) {
        currentParams.set('textColor', currentTextColor);
    } else {
        currentParams.delete('textColor');
    }
    
    const currentBgColor = toHexColor(liveElement.style.backgroundColor);
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
    
    if (qrCode.style.filter !== (DEFAULT_STYLES.qrInvert ? 'invert(1)' : 'none')) {
        currentParams.set('qrInvert', qrInvertToggle.checked);
    } else {
        currentParams.delete('qrInvert');
    }
    
    if (qrCode.style.mixBlendMode !== (DEFAULT_STYLES.qrScreenBlend ? 'screen' : 
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
    
    // Update URL without reloading the page
    const newUrl = window.location.pathname + (currentParams.toString() ? '?' + currentParams.toString() : '');
    window.history.replaceState({}, '', newUrl);
}

function applyStylesFromURL() {
    // Apply text color
    if (params.has('textColor')) {
        const color = toHexColor(params.get('textColor'));
        liveElement.style.color = color;
        document.getElementById('textColorPicker').value = color;
        document.getElementById('textColorValue').value = color;
    }
    
    // Apply background color
    if (params.has('bgColor')) {
        const color = toHexColor(params.get('bgColor'));
        liveElement.style.backgroundColor = color;
        document.getElementById('bgColorPicker').value = color;
        document.getElementById('bgColorValue').value = color;
    }
    
    // Apply background image
    if (params.has('bgImage')) {
        const imageUrl = params.get('bgImage');
        bgImageUrl.value = imageUrl;
        updateBackgroundImage(imageUrl);
    }
    
    // Apply QR code invert
    if (params.has('qrInvert')) {
        const invert = params.get('qrInvert') === 'true';
        qrInvertToggle.checked = invert;
        qrCode.style.filter = invert ? 'invert(1)' : 'none';
    }
    
    // Apply QR code blend mode
    if (params.has('qrBlend')) {
        const blend = params.get('qrBlend');
        qrScreenBlendToggle.checked = blend === 'screen';
        qrMultiplyBlendToggle.checked = blend === 'multiply';
        qrCode.style.mixBlendMode = blend;
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
}

if(nevent){
    const kind1ID = NostrTools.nip19.decode(nevent).data
    subscribeKind1(kind1ID)
    document.getElementById('noteLoaderContainer').style.display = 'none';
}

// Apply styles from URL after DOM elements are ready
applyStylesFromURL();

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
    
    // Update URL with the note parameter
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.set('note', note1);
    const newUrl = window.location.pathname + '?' + currentParams.toString();
    window.history.replaceState({}, '', newUrl);
    
    subscribeKind1(kind1ID);
    document.getElementById('noteLoaderContainer').style.display = 'none';
    console.log(note1);
}

async function subscribeKind1(kind1ID) {
    let filter = { ids: [kind1ID]}
    pool.subscribeMany(
        [...relays],
        [filter],
        {
        async onevent(kind1) {
            drawKind1(kind1)
            await subscribeKind0fromKind1(kind1)
            await subscribeKind9735fromKind1(kind1)
        },
        oneose() {
            console.log("subscribeKind1() EOS")
        },
        onclosed() {
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
    let kinds9735IDs = new Set();
    let kinds9735 = []
    const kind1id = kind1.id
    let isFirstStream = true

    const zapsContainer = document.getElementById("zaps");

    const sub = pool.subscribeMany(
        [...relays],
        [{
            kinds: [9735],
            "#e": [kind1id]
        }]
    ,{
        onevent(kind9735) {
            if(!(kinds9735IDs.has(kind9735.id))){
                kinds9735IDs.add(kind9735.id)
                kinds9735.push(kind9735)
                if(!isFirstStream){
                    console.log(kind9735)
                    subscribeKind0fromKinds9735([kind9735])
                }
            }
        },
        oneose() {
            isFirstStream = false
            subscribeKind0fromKinds9735(kinds9735)
            console.log("subscribeKind9735fromKind1() EOS")
        },
        onclosed() {
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

function drawKind1(kind1){
    console.log(kind1)
    const noteContent = document.getElementById("noteContent");
    noteContent.innerText = kind1.content;
    scaleTextByLength(noteContent, kind1.content);
    
    let qrcodeContainer = document.getElementById("qrCode");
    qrcodeContainer.innerHTML = "";
    new QRious({
        element: qrcodeContainer,
        size: 800,
        value: "https://njump.me/"+NostrTools.nip19.noteEncode(kind1.id)
    });
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

      let fontSize = 6
      let gapSize = 1
      let imgSize = 28
      let factor = 1.4
      let zapIndex = 1
      const totalAmountZapped = json9735List.reduce((sum, zaps) => sum + zaps.amount, 0);
      document.getElementById("zappedTotalValue").innerText = numberWithCommas(totalAmountZapped);

      for(let json9735 of json9735List){
        const zapDiv = document.createElement("div");
        zapDiv.className = "zap";

        if(!json9735.picture) json9735.picture = ""
        const profileImage = json9735.picture == "" ? "/images/gradient_color.gif" : json9735.picture

        let fontSizeCalc = (fontSize/(zapIndex*1.1))
        zapDiv.style.fontSize = fontSizeCalc + "vw"
        //zapDiv.style.gap = (gapSize - (zapIndex*1.1)) + "vw"
        let imgSizeCalc = (imgSize/(zapIndex*1.5)) + "vw"
        let gapCalc = (gapSize/zapIndex/0.5) + "vw"
        zapIndex = zapIndex+1


        zapDiv.innerHTML = `
            <div class="zapper" style="margin-bottom:${gapCalc}">
                <div class="zapperProfile flex-sort" style="gap:${gapCalc}">
                  <img class="userImg zapperProfileImg" style="width:${imgSizeCalc};height:${imgSizeCalc}" src="${profileImage}" />
                  <div>
                    <div class="zapperName">
                        ${json9735.kind1Name}
                    </div>
                    <div class="zapperAmount" style="font-size:${(fontSizeCalc/2) + "vw"};">
                        <span class="zapperAmountValue">${numberWithCommas(json9735.amount)}</span> <span class="zapperAmountSats">sats</span>
                    </div>
                    <div class="zapperContent">
                        ${json9735.kind9735content}
                    </div>
                  </div>
                </div>


            </div>
        `;
        zapsContainer.appendChild(zapDiv);
        /*
        if(!json9735.picture) json9735.picture = ""
        const profileImage = json9735.picture == "" ? "https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg" : json9735.picture
        let zapPayerLink = '<a href="https://nostrudel.ninja/#/u/'+json9735.npubPayer+'" target="_blank"><img class="userImg" src="'+profileImage+'" /></a>'
        let zapEventLink = '<a href="https://nostrudel.ninja/#/n/'+json9735.zapEventID+'" target="_blank" class="zapReactionAmount">'+json9735.amount+'</a>'
        */
      }
  }




/*

Style Options

*/


function toggleStyleOptionsModal(){
    const styleOptionsModal = document.getElementById("styleOptionsModal");
    styleOptionsModal.classList.toggle("active");
}



// Add modal toggle functionality
document.querySelectorAll('.styleOptionsModalToggle').forEach(function(toggle) {
    toggle.addEventListener('click', function() {
        document.getElementById('styleOptionsModal').classList.add('show');
    });
});

document.querySelector('#styleOptionsModal .close-button').addEventListener('click', function() {
    document.getElementById('styleOptionsModal').classList.remove('show');
});

// Close modal when clicking outside
document.getElementById('styleOptionsModal').addEventListener('click', function(e) {
    if (e.target === this) {
        this.classList.remove('show');
    }
});

// Color picker functionality
function setupColorPicker(pickerId, valueId, targetProperty) {
    const picker = document.getElementById(pickerId);
    const value = document.getElementById(valueId);
    const liveElement = document.querySelector('.live');

    // Update text input when color picker changes
    picker.addEventListener('input', function(e) {
        const color = toHexColor(e.target.value);
        value.value = color;
        liveElement.style[targetProperty] = color;
        updateStyleURL();
    });

    // Update color picker when text input changes
    value.addEventListener('input', function(e) {
        const color = toHexColor(e.target.value);
        if (isValidHexColor(color)) {
            picker.value = color;
            liveElement.style[targetProperty] = color;
            updateStyleURL();
        }
    });
}

// Setup both color pickers
setupColorPicker('textColorPicker', 'textColorValue', 'color');
setupColorPicker('bgColorPicker', 'bgColorValue', 'backgroundColor');

// Background image functionality
function updateBackgroundImage(url) {
    if (url) {
        liveZapOverlay.style.backgroundImage = `url("${url}")`;
        bgImagePreview.src = url;
    } else {
        liveZapOverlay.style.backgroundImage = 'none';
        bgImagePreview.src = '';
    }
}

// Update background when URL changes
bgImageUrl.addEventListener('input', function(e) {
    const url = e.target.value.trim();
    if (url) {
        // Test if the image loads
        const img = new Image();
        img.onload = function() {
            updateBackgroundImage(url);
            updateStyleURL();
        };
        img.onerror = function() {
            // If image fails to load, show error in preview
            bgImagePreview.src = '';
            bgImagePreview.alt = 'Failed to load image';
        };
        img.src = url;
    } else {
        updateBackgroundImage('');
        updateStyleURL();
    }
});

// Clear background image
clearBgImage.addEventListener('click', function() {
    bgImageUrl.value = '';
    updateBackgroundImage('');
    updateStyleURL();
});

// QR Code toggles
qrInvertToggle.addEventListener('change', function(e) {
    qrCode.style.filter = e.target.checked ? 'invert(1)' : 'none';
    updateStyleURL();
});

function updateBlendMode() {
    if (qrScreenBlendToggle.checked) {
        qrCode.style.mixBlendMode = 'screen';
        qrMultiplyBlendToggle.checked = false;
    } else if (qrMultiplyBlendToggle.checked) {
        qrCode.style.mixBlendMode = 'multiply';
        qrScreenBlendToggle.checked = false;
    } else {
        qrCode.style.mixBlendMode = 'normal';
    }
    updateStyleURL();
}

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
    document.body.classList.toggle('hide-zapper-content', e.target.checked);
    updateStyleURL();
});
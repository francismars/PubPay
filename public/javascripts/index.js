const pool = new NostrTools.SimplePool()
let relays = ['wss://relay.damus.io', 'wss://relay.primal.net','wss://nostr.mutinywallet.com/', 'wss://relay.nostr.band/', 'wss://relay.nostr.nu/']

let listedEvents = new Set();
let eventsAuthors = {}

subscribePubPays()

async function subscribePubPays() {
  let h = pool.subscribeMany(
      [...relays],
      [
      {
          kinds: [1],
          "#t": ["pubpay"]
      },
      ], {
      async onevent(event) {
          if(event.tags){
              let filteredEvent = event.tags.filter(tag => tag[0] == "zap-min")
              if(filteredEvent.length>0){
                if(listedEvents.has(event.id)) {
                  return
                }
                else{
                  await getUser(event)
                  listedEvents.add(event.id);
                  eventsAuthors[event.id] = {"event": event}
                  //console.log(eventsAuthors)
                }
              }
          }
      },
      oneose() {
        //console.log("subscribePubPays() oneosed")
      },
      onclosed() {
        //console.log("Closed")
      }
  })
}



async function getUser(event){
  let authorPK = event.pubkey
  const sub = pool.subscribeMany(
    [...relays],
    [{
        kinds: [0],
        authors: [authorPK]
    }]
  ,{
  async onevent(eventAuthor) {
    eventsAuthors[event.id] = {"author": eventAuthor}
    await createNote(event, eventAuthor)
    //await getZapInvoice(event, eventProfile)
  },
  oneose() {
    //console.log("getUser() oneosed")
    //sub.close()
  },
  onclosed() {
    //console.log("Closed")
  }
})
}

async function payNote(eventZap, userProfile){
  let event = eventZap
  let eventProfile = userProfile
  let eventProfileContent = JSON.parse(eventProfile.content)
  console.log(eventProfileContent.lud16)
  let lud16 = eventProfileContent.lud16
  let ludSplit = lud16.split("@")
  const response = await fetch("https://"+ludSplit[1]+"/.well-known/lnurlp/"+ludSplit[0]);
  const lnurlinfo = await response.json();
  if(lnurlinfo.allowsNostr==true){
    /*
      // const privateKey = window.NostrTools.generateSecretKey()
      let publicKey
      if(window.nostr!=null){
        publicKey = await window.nostr.getPublicKey() //window.NostrTools.getPublicKey(privateKey)
      }
      else{
        sessionStorage.setItem('sentToAmber', 'true');
        window.location.href = `nostrsigner:?compressionType=none&returnType=signature&type=get_public_key`
        const publicKey = await navigator.clipboard.readText();
        console.log(publicKey)
      }
    */
      let filteredEvent = event.tags.filter(tag => tag[0] == "zap-min")
      let zapEvent = await window.NostrTools.nip57.makeZapRequest({
          profile: event.pubkey,
          event: event.id,
          amount: Math.floor(filteredEvent[0][1]),
          comment: "",
          relays: relays
      })
      let zapFinalized
      if(window.nostr!=null){
        zapFinalized = await window.nostr.signEvent(zapEvent)
      }
      else{
        let eventString = JSON.stringify(zapEvent)
        sessionStorage.setItem('AmberSign', JSON.stringify({"callback": lnurlinfo.callback, "amount": filteredEvent[0][1], "lud16": lud16, "event":zapEvent}));
        window.location.href = `nostrsigner:${eventString}?compressionType=none&returnType=signature&type=sign_event`
      }
      await getInvoiceandPay(lnurlinfo.callback, filteredEvent[0][1], zapFinalized, lud16)
  }
}

document.addEventListener("load", onVisibilityChange);

async function onVisibilityChange() {
  const eventStorage = JSON.parse(sessionStorage.getItem("AmberSign"));
  console.log(eventStorage)
  if(eventStorage!=null){
    sessionStorage.removeItem('AmberSign');
    const eventSigned = await navigator.clipboard.readText();
    console.log('eventSigned', eventSigned)
    zapFinalized = await finalizeEvent(eventStorage.event, eventSigned)
    console.log('zapFinalized', zapFinalized)
    await getInvoiceandPay(eventStorage.callback, eventStorage.amount, zapFinalized, eventStorage.lud16)
  }
}

async function getInvoiceandPay(callback, amount, zapFinalized, lud16){
  let eventFinal = JSON.stringify(zapFinalized)
  let lnurl = lud16
  let callString = `${callback}?amount=${amount}&nostr=${eventFinal}&lnurl=${lnurl}`
  console.log('callString', callString)
  const responseFinal = await fetch(callString)
  const {pr: invoice} = await responseFinal.json();
  console.log('invoice', invoice)
  if(window.webln){
    await window.webln.enable();
    await window.webln.sendPayment(invoice);
  }
  else{
    window.location.href = `lightning:${invoice}`;
  }
  //subZapEvent(event)
}


async function createNote(eventData, authorData){
  var newNote = document.createElement('div')
  newNote.setAttribute('id', eventData.id)
  newNote.setAttribute('class', 'paynote')

  let authorContent = JSON.parse(authorData.content)

  let profileData = {}
  profileData.name = authorContent.name
  profileData.picture = authorContent.picture
  profileData.nip05 = authorContent.nip05

  //console.log(profileData)

  // Profile image
  var noteProfileImg = document.createElement('div')
  noteProfileImg.setAttribute('class', 'noteProfileImg')
  var userImg = document.createElement('img')
  userImg.setAttribute('class', 'userImg')
  userImg.setAttribute('src', profileData.picture);
  //userImg.setAttribute('src', 'https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg')

  noteProfileImg.appendChild(userImg)
  newNote.appendChild(noteProfileImg)


  // Data
  var noteData = document.createElement('div')
  noteData.setAttribute('class', 'noteData')

  // Header: names and date
  var noteHeader = document.createElement('div')
  noteHeader.setAttribute('class', 'noteHeader')

  var noteAuthor = document.createElement('div')
  noteAuthor.setAttribute('class', 'noteAuthor')


  var noteDisplayName = document.createElement('div')
  noteDisplayName.setAttribute('class', 'noteDisplayName')
  let displayName=profileData.name;
  let npub = NostrTools.nip19.npubEncode(eventData.pubkey)
  if(profileData.name==null){
    displayName = start_and_end(npub)
  }
  noteDisplayName.innerHTML = '<a href="https://next.nostrudel.ninja/#/u/'+npub+'" class="noteAuthorLink" target="_blank">'+displayName+'</a>'


  var noteNIP05 = document.createElement('div')
  noteNIP05.classList.add("noteNIP05")
  noteNIP05.classList.add("label")
  profileData.nip05 ? noteNIP05.textContent=profileData.nip05 : noteNIP05.textContent="displayname@domain.com"

  let noteTimeAgo = timeAgo(eventData.created_at)

  var noteDate = document.createElement('div')
  noteDate.classList.add("noteDate")
  noteDate.classList.add("label")
  noteDate.textContent=noteTimeAgo

  noteAuthor.appendChild(noteDisplayName)
  noteAuthor.appendChild(noteNIP05)
  noteHeader.appendChild(noteAuthor)
  noteHeader.appendChild(noteDate)
  noteData.appendChild(noteHeader)


  // Content
  var noteContent = document.createElement('div')
  noteContent.setAttribute('class', 'noteContent')
  let formatedContent = formatContent(eventData.content)
  noteContent.innerHTML = formatedContent
  noteData.appendChild(noteContent)


  // Values
  var noteValues = document.createElement('div')
  noteValues.setAttribute('class', 'noteValues')

  // INSERT LOGIC FOR AMOUNT, ZAP-MIN, ZAP-MAX, ETC
  let filteredZapMin = eventData.tags.filter(tag => tag[0] == "zap-min")

  var zapMin = document.createElement('div')
  zapMin.setAttribute('class', 'zapMin')
  zapMin.innerHTML = '<span class="zapMinVal">'+(filteredZapMin[0][1]/1000).toLocaleString()+'</span> <span class="label">sats</span>'

  let filteredZapUses = eventData.tags.filter(tag => tag[0] == "zap-uses")

  var zapUses = document.createElement('div')
  zapUses.setAttribute('class', 'zapUses')
  filteredZapUses!=null && filteredZapUses[0]!=null ? zapUses.innerHTML = `<span class='zapUsesCurrent'>0</span> <span class='label'>of</span> <span class='zapUsesTotal'>${filteredZapUses[0][1]}</span>`
                  : zapUses.innerHTML = ""

  noteValues.appendChild(zapMin)
  noteValues.appendChild(zapUses)
  noteData.appendChild(noteValues)


  // Main CTA
  var noteCTA = document.createElement('div')
  const buttonZap = document.createElement('button');
  noteCTA.appendChild(buttonZap);
  noteCTA.setAttribute('class', 'noteCTA')
  buttonZap.setAttribute('class', 'cta');
  buttonZap.textContent = 'Pay'
  buttonZap.addEventListener('click', async () => {
    await payNote(eventData, authorData)
  });
  noteData.appendChild(noteCTA)


  // Actions and Reactions
  var noteActionsReactions = document.createElement('div')
  noteActionsReactions.setAttribute('class', 'noteActionsReactions')

  var noteReactions = document.createElement('div')
  noteReactions.setAttribute('class', 'noteReactions')
  noteReactions.innerHTML = '<img class="userImg" src="https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg" /><img class="userImg" src="https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg" /><img class="userImg" src="https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg" />'

  let eventDataString = JSON.stringify(eventData).replace(/"/g, '&quot;');

  var noteActions = document.createElement('div')
  noteActions.setAttribute('class', 'noteActions')
  let noteActionBtns =  '<div class="noteAction"><span class="material-symbols-outlined">bolt</span></div>'
  noteActionBtns +=     '<div class="noteAction"><span class="material-symbols-outlined">favorite</span></div>'
  noteActionBtns +=     '<div class="noteAction"><span class="material-symbols-outlined">ios_share</span></div>'
  let toolTip     =     '<div class="tooltiptext">'
  toolTip        +=     '<a href="#" class="cta">Crowd Pay</a>'
  toolTip        +=     '<a href="#" class="cta">Forward Pay</a>'
  toolTip        +=     '<a href="#" onclick="showJSON('+eventDataString+')" class="toolTipLink">View Raw</a>'
  toolTip        +=     '<a href="#" class="toolTipLink">Broadcast</a>'
  toolTip        +=     '<a href="#" class="toolTipLink">Share on...</a>'
  toolTip        +=     '</div>'
  noteActionBtns +=     '<div class="tooltip"><div class="noteAction"><span class="material-symbols-outlined">more_horiz</span>'+toolTip+'</div></div>'

  noteActions.innerHTML = noteActionBtns

  noteActionsReactions.appendChild(noteReactions)
  noteActionsReactions.appendChild(noteActions)
  noteData.appendChild(noteActionsReactions)


  newNote.appendChild(noteData);
  const main = document.querySelector('#main')
  main.appendChild(newNote)
}


function formatContent(content){
  //formatedContent = formatedContent.replace(/(nostr:|@)?((npub|note|nprofile|nevent|nrelay|naddr)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})/gi, '<a href="$1.$2">@CornerStore</a>')

  // render npubs
  let npubMention = content.match(/(nostr:|@)?((npub)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})/gi)
  if(npubMention){
    npubMention = npubMention[0].replace('nostr:', '')
    npubMention = start_and_end(npubMention)
    content = content.replace(/(nostr:|@)?((npub)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})/gi, '<a href="https://next.nostrudel.ninja/#/u/$2" class="userMention" npub="$2" target="_blank">'+npubMention+'</a>')
    // render image
    content = content.replace(/(http(s*):\/\/[\w\\x80-\\xff\#$%&~\/.\-;:=,?@\[\]+]*).(gif|png|jpg|jpeg)/gi, '<img src="$1.$3" />')
  }
  return content
}

function timeAgo(timestamp) {
  const now = Date.now();
  const timestampMs = timestamp * 1000;
  const differenceMs = now - timestampMs;
  const minutesAgo = Math.floor(differenceMs / (1000 * 60)); // Difference in minutes
  const hoursAgo = Math.floor(differenceMs / (1000 * 60 * 60)); // Difference in hours
  const daysAgo = Math.floor(differenceMs / (1000 * 60 * 60 * 24)); // Difference in days

  if (minutesAgo < 60) {
      return `${minutesAgo} minutes ago`;
  } else if (hoursAgo < 24) {
      return `${hoursAgo} hours ago`;
  } else {
      return `${daysAgo} days ago`;
  }
}


function start_and_end(str) {
  if (str.length > 35) {
    return str.substr(0, 4) + '...' + str.substr(str.length-4, str.length);
  }
  return str;
}


window.addEventListener("DOMContentLoaded", (event) => {

      document.getElementById('newPayNote').addEventListener("click", function() {
        var newNoteForm = document.getElementById('newPayNoteForm');
        if (newNoteForm.style.display === 'none' || newNoteForm.style.display === '') {
            newNoteForm.style.display = 'flex';
        } else {
            newNoteForm.style.display = 'none';
        }
      })


      document.getElementById('cancelNewNote').addEventListener("click", function() {
        var newNoteForm = document.getElementById('newPayNoteForm');
        if (newNoteForm.style.display === 'none' || newNoteForm.style.display === '') {
            newNoteForm.style.display = 'flex';
        } else {
            newNoteForm.style.display = 'none';
        }
      })





      document.getElementById('closeJSON').addEventListener("click", function() {
        var newNoteForm = document.getElementById('viewJSON');
        if (newNoteForm.style.display === 'none' || newNoteForm.style.display === '') {
            newNoteForm.style.display = 'flex';
        } else {
            newNoteForm.style.display = 'none';
        }
      })






});




function showJSON(json){
  console.log(json);
  var viewJSON = document.getElementById('viewJSON');
  if (viewJSON.style.display === 'none' || viewJSON.style.display === '') {
      viewJSON.style.display = 'flex'
      var viewJSON = document.getElementById('noteJSON')
      noteJSON.innerHTML = JSON.stringify(json, null, 2)
  } else {
      viewJSON.style.display = 'none'
  }
}

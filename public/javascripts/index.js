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
      sub.close()
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
  const response = await fetch("http://"+ludSplit[1]+"/.well-known/lnurlp/"+ludSplit[0]);
  const lnurlinfo = await response.json();
  if(lnurlinfo.allowsNostr==true){
      // const privateKey = window.NostrTools.generateSecretKey()
      const publicKey = await window.nostr.getPublicKey() //window.NostrTools.getPublicKey(privateKey)
      let filteredEvent = event.tags.filter(tag => tag[0] == "zap-min")  
      let zapEvent = await window.NostrTools.nip57.makeZapRequest({
          profile: event.pubkey,
          event: event.id,
          amount: Math.floor(filteredEvent[0][1]/1000),
          comment: "",
          relays: relays
      })
      let zapFinalized = await window.nostr.signEvent(zapEvent)            
      let callback = lnurlinfo.callback
      let amount = Math.floor(filteredEvent[0][1])
      let eventFinal = JSON.stringify(zapFinalized)
      let lnurl = lud16
      let callString = `${callback}?amount=${amount}&nostr=${eventFinal}&lnurl=${lnurl}`
      console.log(callString)
      const responseFinal = await fetch(callString)
      const {pr: invoice} = await responseFinal.json();
      console.log(invoice)
      await window.webln.enable();
      await window.webln.sendPayment(invoice);
      //subZapEvent(event)
  }
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
  noteNIP05.textContent="displayname@domain.com"

  var noteDate = document.createElement('div')
  noteDate.classList.add("noteDate")
  noteDate.classList.add("label")
  noteDate.textContent="XXm"

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

  var zapMin = document.createElement('div')
  zapMin.setAttribute('class', 'zapMin')
  zapMin.innerHTML = '<span class="zapMinVal">'+(eventData.tags[1][1] / 1000)+'</span> <span class="label">sats</span>'

  var zapUses = document.createElement('div')
  zapUses.setAttribute('class', 'zapUses')
  zapUses.innerHTML = '<span class="zapUsesCurrent">X</span> <span class="label">of</span> <span class="zapUsesTotal">X</span>'

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

  var noteActions = document.createElement('div')
  noteActions.setAttribute('class', 'noteActions')
  let noteActionBtns =  '<div class="noteAction"><span class="material-symbols-outlined">bolt</span></div>'
  noteActionBtns +=     '<div class="noteAction"><span class="material-symbols-outlined">favorite</span></div>'
  noteActionBtns +=     '<div class="noteAction"><span class="material-symbols-outlined">ios_share</span></div>'
  let toolTip     =     '<div class="tooltiptext"><a href="#" class="cta">Crowd Pay</a><a href="#" class="toolTipLink">view raw</a></br><a href="#" class="toolTipLink">Tooltip text</a></br><a href="#" class="toolTipLink">Tooltip text</a></br></div>'
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

});

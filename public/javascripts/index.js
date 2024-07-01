const pool = new NostrTools.SimplePool()
const relays = ['wss://relay.damus.io', 'wss://relay.primal.net','wss://nostr.mutinywallet.com/', 'wss://relay.nostr.band/', 'wss://relay.nostr.nu/']

let firstStream = true

subscribePubPays()

async function subscribePubPays() {
  let kind1Seen = new Set();
  let kind1List = []
  pool.subscribeMany(
      [...relays],
      [
      {
          kinds: [1],
          "#t": ["pubpay"]
      },
      ], {
      async onevent(kind1) {
        if(kind1.tags && !(kind1Seen.has(kind1.id))){
          kind1Seen.add(kind1.id);
          if(!firstStream){
            await subscribeKind0sfromKind1s([kind1])
          } else {
            kind1List.push(kind1)
          }
        }
      },
      async oneose() {
        if(firstStream){
          //let first20kind1 = kind1List.splice(0, 2)
          await subscribeKind0sfromKind1s(kind1List)
          console.log("subscribePubPays() EOS")
        }
      },
      onclosed() {
        //console.log("Closed")
      }
  })
}

async function subscribeKind0sfromKind1s(kind1List){
  let kind0List = []
  let kind1PubkeyList = []
  for(let kind1 of kind1List){
    kind1PubkeyList.push(kind1.pubkey)
  }
  const sub = pool.subscribeMany(
    [...relays],
    [{
        kinds: [0],
        authors: kind1PubkeyList
    }]
  ,{
  async onevent(kind0) {
    kind0List.push(kind0)
  },
  async oneose() {
    console.log("subscribeKind0sfromKind1s() EOS") 
    await drawKind1s(kind1List, kind0List)
    await subscribeKind9735(kind1List)
    sub.close()
  },
  onclosed() {
    console.log("subscribeKind0sfromKind1s() Closed")
  }
})
}

async function drawKind1s(first20kind1, kind0List){
  for(let kind1 of first20kind1){
    const kind0 = kind0List.find(({ pubkey }) => pubkey === kind1.pubkey);
    if (kind0) {
      drawKind1(kind1, kind0);
    }
  }
}

async function subscribeKind9735(kind1List){
  let kind9735Seen = new Set();
  let kind1IDList = []
  let kind9735List = []
  for(let kind1 of kind1List){
    kind1IDList.push(kind1.id)
  }
  const sub = pool.subscribeMany(
    [...relays],
    [{
        kinds: [9735],
        "#e": kind1IDList
    }]
  ,{
  async onevent(kind9735) {
    if(kind9735Seen.has(kind9735.id)){
      return
    }
    else{
      kind9735Seen.add(kind9735.id);
      kind9735List.push(kind9735)
    }
    if(!firstStream){
      await subscribeKind0sfromKind9735s([kind9735], kind1List)
    }
  },
  async oneose() {
    console.log("subscribeKind9735() EOS")
    if(kind9735List.length>0) await subscribeKind0sfromKind9735s(kind9735List.reverse(), kind1List)
    firstStream = false
    //sub.close()
  },
  onclosed() {
    //console.log("Closed")
  }
})
}

async function subscribeKind0sfromKind9735s(kind9735List, kind1List){
  let pubkeys9734 = []
  let kind0fromkind9735List = []
  let kind0fromkind9735Seen = new Set();
  for(let kind9735 of kind9735List){
    if(kind9735.tags){
      const description9735 = kind9735.tags.find(tag => tag[0] === "description")[1];
      const kind9734 = JSON.parse(description9735)
      pubkeys9734.push(kind9734.pubkey)
    }
  }
  const sub = pool.subscribeMany(
    [...relays],
    [{
        kinds: [0],
        authors: pubkeys9734
    }]
  ,{
  async onevent(kind0) {
    if(kind0fromkind9735Seen.has(kind0.pubkey)){
      return
    }
    else{
      kind0fromkind9735Seen.add(kind0.pubkey);
      kind0fromkind9735List.push(kind0)
    }
  },
  async oneose() {
    console.log("subscribeKind0sfromKind9735s() EOS")
    await createkinds9735JSON(kind9735List, kind0fromkind9735List, kind1List)
    //sub.close()
  },
  onclosed() {
    //console.log("Closed")
  }
})
}

async function createkinds9735JSON(kind9735List, kind0fromkind9735List, kind1List){
  let json9735List = []
  //console.log(kind1List)
  for(let kind9735 of kind9735List){
    const description9735 = JSON.parse(kind9735.tags.find(tag => tag[0] == "description")[1])
    const pubkey9735 = description9735.pubkey
    const bolt119735 = kind9735.tags.find(tag => tag[0] == "bolt11")[1]
    const amount9735 = lightningPayReq.decode(bolt119735).satoshis
    const kind1from9735 = kind9735.tags.find(tag => tag[0] == "e")[1]
    const kind9735id = NostrTools.nip19.noteEncode(kind9735.id)
    let kind0picture
    let kind0npub
    let kind1tags
    const kind1 = kind1List.find(kind1 => kind1.id === kind1from9735);
    if(kind1) {
        kind1tags = kind1.tags;
    }
    const kind0fromkind9735 = kind0fromkind9735List.find(kind0 => pubkey9735 === kind0.pubkey);
    if(kind0fromkind9735){
      kind0picture = JSON.parse(kind0fromkind9735.content).picture
      kind0npub = NostrTools.nip19.npubEncode(kind0fromkind9735.pubkey)
    }
    else{
      kind0picture = ""
      kind0npub = ""
    }
    const json9735 = {"e": kind1from9735, "amount": amount9735, "picture": kind0picture, "npubPayer": kind0npub, "pubKey": pubkey9735, "zapEventID": kind9735id, "tags": kind1tags}
    json9735List.push(json9735)
  }
  await plot9735(json9735List)
}

async function plot9735(json9735List){
  for(let json9735 of json9735List){
    //console.log(json9735)
    let parentNote = document.getElementById(json9735.e)

    let profileImage
    json9735.picture == "" ? profileImage = "https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg" : profileImage = json9735.picture


    let zapPayerLink = '<a href="https://next.nostrudel.ninja/#/u/'+json9735.npubPayer+'" target="_blank"><img class="userImg" src="'+profileImage+'" /></a>'
    let zapEventLink = '<a href="https://next.nostrudel.ninja/#/n/'+json9735.zapEventID+'" target="_blank" class="zapReactionAmount">'+json9735.amount+'</a>'

    /*
    't', 'pubpay'
    'zap-min', '21000'
    'zap-max', '21000'
    'zap-uses', '1'
    'zap-payer', '9ec4e717eea5b53e3c3be4099189e65636829473843304a84b6aacc26a1ef810'
    'zap-forward', 'a2f6faac5990a9bfb6e47a3d4b6c204592eb6c642563dbdada6512a84'
    */

    let tagZapMin = json9735.tags.find(tag => tag[0] == "zap-min")
    if(tagZapMin){ tagZapMin = tagZapMin[1] }

    let tagZapMax = json9735.tags.find(tag => tag[0] == "zap-max")
    if(tagZapMax){ tagZapMax = tagZapMax[1] }

    let tagZapUses = json9735.tags.find(tag => tag[0] == "zap-uses")
    if(tagZapUses){ tagZapUses = tagZapUses[1]
    }else{ tagZapUses = -1 }

    let zapTarget = tagZapMin/1000 * tagZapUses


    let tagZapPayer = json9735.tags.filter(tag => tag[0] == "zap-payer")
    if(tagZapPayer.length > 0){ tagZapPayer = tagZapPayer[0][1] }

    let tagZapForward = json9735.tags.filter(tag => tag[0] == "zap-forward")
    if(tagZapForward.length > 0){ tagZapForward = tagZapForward[0][1] }

    /*
    console.log("amount: "+json9735.amount)
    console.log("tagZapMin: "+tagZapMin)
    console.log("tagZapMax: "+tagZapMax)
    console.log("tagZapUses: "+tagZapUses)
    console.log("tagZapPayer: "+tagZapPayer)
    console.log("tagZapForward: "+tagZapForward)
    console.log("zapTarget: "+zapTarget)
    */

    let useIncrement = 0


    if(json9735.amount >= tagZapMin/1000 && json9735.amount <= tagZapMax/1000){
      // Zap above minimum and below the maximum


      if(tagZapPayer == json9735.pubKey){
        // Zap payer match
        let zapPayer = parentNote.querySelector('.zapPayer')
        zapPayer.innerHTML = '<div class="zapReaction">'+zapPayerLink+zapEventLink+'</div>'
        // Reached target, disable button
        let noteMainCTA = parentNote.querySelector('.noteMainCTA')
        noteMainCTA.classList.add('disabled')
        noteMainCTA.innerHTML = "Paid"
        noteMainCTA.removeEventListener('click', payNote)
        let zapSlider = parentNote.querySelector('.zapSliderContainer')
        if(zapSlider != null){ zapSlider.removeChild() }

      }else if(tagZapUses != -1){
        // Has use target
        let zapUsesCurrent = parentNote.querySelector('.zapUsesCurrent')
        useIncrement = parseInt(zapUsesCurrent.textContent)+1

        if(useIncrement <= tagZapUses){
          // Still bellow the use target
          let noteHeroZaps = parentNote.querySelector('.noteHeroZaps')
          noteHeroZaps.innerHTML += '<div class="zapReaction">'+zapPayerLink+zapEventLink+'</div>'
          zapUsesCurrent.textContent = parseInt(zapUsesCurrent.textContent)+1

          if(useIncrement == tagZapUses){
            // Reached target, disable button
            let noteMainCTA = parentNote.querySelector('.noteMainCTA')
            noteMainCTA.classList.add('disabled')
            noteMainCTA.innerHTML = "Paid"
            noteMainCTA.removeEventListener('click', payNote)
            let zapSlider = parentNote.querySelector('.zapSliderContainer')
            if(zapSlider != null){ zapSlider.remove() }
          }

        }else{
          // Above minimum, but target already reached
          let payNoteReactions = parentNote.querySelector('.noteZaps')
          payNoteReactions.innerHTML += '<div class="zapReaction">'+zapPayerLink+zapEventLink+'</div>'
        }

      }else{
        // Above min and no uses. Everyzap is included on hero
        let noteHeroZaps = parentNote.querySelector('.noteHeroZaps')
        noteHeroZaps.innerHTML += '<div class="zapReaction">'+zapPayerLink+zapEventLink+'</div>'
      }



    }else{
      // Bellow the minimum,
      let payNoteReactions = parentNote.querySelector('.noteZaps')
      payNoteReactions.innerHTML += '<div class="zapReaction">'+zapPayerLink+zapEventLink+'</div>'
    }

  }
}

async function payNote(eventZap, userProfile, rangeValue){
  let event = eventZap
  //console.log(event)
  let zapLNURL = eventZap.tags.filter(tag => tag[0] == "zap-lnurl")
  let eventProfile = userProfile
  let eventProfileContent = JSON.parse(eventProfile.content)
  let lud16
  if(zapLNURL.length>0){
    lud16 = zapLNURL[0][1]
  }else{
    lud16 = eventProfileContent.lud16
  }
  //console.log(lud16)
  let ludSplit = lud16.split("@")
  const response = await fetch("https://"+ludSplit[1]+"/.well-known/lnurlp/"+ludSplit[0]);
  const lnurlinfo = await response.json();
  if(lnurlinfo.allowsNostr==true){
      // const privateKey = window.NostrTools.generateSecretKey()
      let publicKey
      if(window.nostr!=null){
        createZapEvent(JSON.stringify({"lnurlinfo": lnurlinfo, "lud16": lud16, "event":eventZap}), null, rangeValue)
        return
        // publicKey = await window.nostr.getPublicKey() //window.NostrTools.getPublicKey(privateKey)
      }
      else{
        sessionStorage.setItem('AmberPubkey', JSON.stringify({"lnurlinfo": lnurlinfo, "lud16": lud16, "event":event}));
        window.location.href = `nostrsigner:?compressionType=none&returnType=signature&type=get_public_key`
      }
  }
}

async function createZapEvent(eventStoragePK, pubKey = null, rangeValue){
  eventStoragePK = JSON.parse(eventStoragePK)
  let eventZap = eventStoragePK.event
  //console.log(eventZap)
  let lnurlinfo = eventStoragePK.lnurlinfo
  let lud16 = eventStoragePK.lud16
  let zapMintag = eventZap.tags.find(tag => tag[0] == "zap-min")
  let zapTagAmount
  if(zapMintag) zapTagAmount = zapMintag[1]
  else zapTagAmount = 1000
  const amountPay = rangeValue != -1 ? parseInt(rangeValue)*1000 : Math.floor(zapTagAmount)
  let zapEvent = await window.NostrTools.nip57.makeZapRequest({
      profile: eventZap.pubkey,
      event: eventZap.id,
      amount: amountPay,
      comment: "",
      relays: relays
  })
  if(pubKey!=null){
    zapEvent.pubkey = pubKey
    let eventID = NostrTools.getEventHash(zapEvent)
    if(eventID!=null) zapEvent.id = eventID
  }
  let zapFinalized
  if(window.nostr!=null){
    zapFinalized = await window.nostr.signEvent(zapEvent)
    await getInvoiceandPay(lnurlinfo.callback, amountPay, zapFinalized, lud16)
  }
  else{
    let eventString = JSON.stringify(zapEvent)
    setTimeout(() => {
      sessionStorage.setItem('AmberSign', JSON.stringify({"callback": lnurlinfo.callback, "amount": amountPay, "lud16": lud16, "event":zapEvent}));
    }, 500);
    //console.log(eventString)
    window.location.href = `nostrsigner:${eventString}?compressionType=none&returnType=signature&type=sign_event`
  }
}

document.addEventListener("visibilitychange", async function() {
  if (document.visibilityState === 'visible') {
    let eventStoragePK = sessionStorage.getItem("AmberPubkey");
    //console.log(eventStoragePK)
    if(eventStoragePK){
      sessionStorage.removeItem('AmberPubkey');
      const publicKey = await accessClipboard()
      //console.log(publicKey)
      let decodedPK = NostrTools.nip19.decode(publicKey)
      //console.log(decodedPK)
      createZapEvent(eventStoragePK, decodedPK.data, -1)
      return
    }
    const eventStorage = JSON.parse(sessionStorage.getItem("AmberSign"));
    //console.log(eventStorage)
    if(eventStorage){
      sessionStorage.removeItem('AmberSign');
      let eventSignature
      try {
        eventSignature = await accessClipboard()
      } catch (error) {
        console.error("Failed to read clipboard:", error);
      }
      //console.log('eventSigned', eventSignature)
      let eventSigned = eventStorage.event
      eventSigned["sig"] = eventSignature
      //zapFinalized = await window.NostrTools.finalizeEvent(eventStorage.event, eventSignature)
      //console.log('eventSigned', eventSigned)
      let verifiedEvent = NostrTools.verifyEvent(eventSigned)
      //console.log("Verified", verifiedEvent)
      await getInvoiceandPay(eventStorage.callback, eventStorage.amount, eventSigned, eventStorage.lud16)
    }
  }
});

async function accessClipboard() {
  return new Promise(resolve => {
    setTimeout(async () => {
      let clipcopied = await navigator.clipboard.readText();
      //console.log(clipcopied)
      resolve(clipcopied)
    }, 500);
  });
}

async function getInvoiceandPay(callback, amount, zapFinalized, lud16){
  let eventFinal = JSON.stringify(zapFinalized)
  let lnurl = lud16
  let callString = `${callback}?amount=${amount}&nostr=${eventFinal}&lnurl=${lnurl}`
  //console.log('callString', callString)
  const responseFinal = await fetch(callString)
  const {pr: invoice} = await responseFinal.json();
  //console.log('invoice', invoice)
  if(window.webln){
    await window.webln.enable();
    await window.webln.sendPayment(invoice);
  }
  else{
    try {
      //window.open(`lightning:${invoice}`, '_blank');
      //window.location.href = `intent://pay/${invoice}#Intent;scheme=lightning;end;`;
      /*
      const link = document.createElement('a');
      link.href = `lightning:${invoice}`;
      link.style.display = 'none'; // Hide the link
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      */
      window.location.href = `lightning:${invoice}`;
    } catch (error) {
      alert('Failed to open wallet:', error);
    }
  //subZapEvent(event)
  }
}


async function drawKind1(eventData, authorData){
  var newNote = document.createElement('div')
  newNote.setAttribute('id', eventData.id)
  newNote.setAttribute('class', 'paynote')

  let authorContent = JSON.parse(authorData.content)

  let profileData = {}
  profileData.name = authorContent.name
  //profileData.displayName = authorContent.name
  authorContent.displayName ? profileData.displayName = authorContent.displayName : profileData.displayName = authorContent.display_name
  profileData.picture = authorContent.picture ? authorContent.picture : "" 
  profileData.nip05 = authorContent.nip05
  profileData.lud16 = authorContent.lud16

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
  let displayName= profileData.displayName ? profileData.displayName : profileData.name;
  let npub = NostrTools.nip19.npubEncode(eventData.pubkey)
  if(profileData.name==null){
    displayName = start_and_end(npub)
  }
  noteDisplayName.innerHTML = '<a href="https://next.nostrudel.ninja/#/u/'+npub+'" class="noteAuthorLink" target="_blank">'+displayName+'</a>'


  var noteNIP05 = document.createElement('div')
  noteNIP05.classList.add("noteNIP05")
  noteNIP05.classList.add("label")
  //profileData.nip05 ? noteNIP05.textContent=profileData.nip05 : noteNIP05.textContent="displayname@domain.com"
  if(profileData.nip05){
      let noteNIP05String = profileData.nip05.split('@')
      noteNIP05.innerHTML='<a href="https://'+noteNIP05String[1]+'/.well-known/nostr.json?name='+noteNIP05String[0]+'" target="_blank"><span class="material-symbols-outlined">check_circle</span> '+profileData.nip05+'</a>'
  }else{
    noteNIP05.innerHTML='<span class="unverified label"><span class="material-symbols-outlined">block</span> Unverified</span>'
  }


  var noteLNAddress = document.createElement('div')
  noteLNAddress.classList.add("noteLNAddress")
  noteLNAddress.classList.add("label")

  if(profileData.lud16){
      let noteLNAddressString = profileData.lud16.split('@')
      noteLNAddress.innerHTML='<a href="https://'+noteLNAddressString[1]+'/.well-known/lnurlp/'+noteLNAddressString[0]+'" target="_blank"><span class="material-symbols-outlined">bolt</span> '+profileData.lud16+'</a>'
  }else{
    noteLNAddress.textContent="NOT PAYABLE"
  }

  let noteTimeAgo = timeAgo(eventData.created_at)

  var noteDate = document.createElement('div')
  noteDate.classList.add("noteDate")
  noteDate.classList.add("label")
  noteDate.textContent=noteTimeAgo

  noteAuthor.appendChild(noteDisplayName)
  noteAuthor.appendChild(noteNIP05)
  noteAuthor.appendChild(noteLNAddress)
  noteHeader.appendChild(noteAuthor)
  noteHeader.appendChild(noteDate)
  noteData.appendChild(noteHeader)


  // Content
  var noteContent = document.createElement('div')
  noteContent.setAttribute('class', 'noteContent')
  let formatedContent = formatContent(eventData.content)
  noteContent.innerHTML = formatedContent
  noteData.appendChild(noteContent)


  // Forward
  let filteredforwardZap = eventData.tags.filter(tag => tag[0] == "zap-forward")
  if(filteredforwardZap[0]!=null){
    var forwardZap = document.createElement('div')
    forwardZap.setAttribute('class', 'forwardZap')
    let forwardZapNoteProfileImg = '<div class="noteProfileImg"><img class="userImg" src="https://fuegouae.com/wp-content/uploads/2016/11/sedfwe4rfw4r.jpg"></div>'
    let forwardZapNoteHeader = '<div class="noteHeader"><div class="noteAuthor"><div class="noteDisplayName"><a href="https://next.nostrudel.ninja/#/u/npub1d4m5fqlgzxyvtp0mpes92p3adwr279qaqcqffax8tnhh4z6f7s8qh4t2n4" class="noteAuthorLink" target="_blank">21prestigerelay</a></div><div class="noteNIP05 label">21prestigerelay@vlt.ge</div></div><div class="noteDate label">8 hours ago</div></div>'
    let forwardZapNoteData = '<div class="noteContent">GM nostr:<a href="https://next.nostrudel.ninja/#/u/npub1nmzww9lw5k6nu0pmusyerz0x2cmg99rnssesf2ztd2kvy6s7lqgqjungrg" class="userMention" npub="npub1nmzww9lw5k6nu0pmusyerz0x2cmg99rnssesf2ztd2kvy6s7lqgqjungrg" target="_blank">npub...ngrg</a>. Welcome to our relay 🧡 Entry fee is 21,000 sats</div>'

    let payerProfile = '<div class="zapReaction"><a href="https://next.nostrudel.ninja/#/u/npub1t5atsakzq63h45asjn3qhlpeg80nlgs6zkkgafmddyvywdufv6dqxfahcl" target="_blank"><img class="userImg" src="https://pbs.twimg.com/profile_images/1613844070207471617/VXUvR27o_400x400.jpg"></a><a href="https://next.nostrudel.ninja/#/n/note14h7zraa3p9syplnj9y3t5gdmswekg9k8ghhn0usv9nvp6hn6dkhqpwpr6x" target="_blank" class="zapReactionAmount">21</a></div>'
    let originZap = ' <div class="originZap">'+payerProfile+'<div class="noteProfileImg"><img class="userImg" src="https://www.plenodelafemp.es/wp-content/uploads/2014/10/speaker-3.jpg"></div></div>'
    forwardZapNoteData += '<div class="noteValues"><div class="zapMin"><span class="zapMinVal">21,000</span> <span class="label">sats</span></div><div class="zap___Uses"><span class="zapUses______Current">0</span> <span class="label">of</span> <span class="zapUsesTotal">1</span></div> </div>'+originZap

    forwardZap.innerHTML = '<div class="paynote">'+forwardZapNoteProfileImg+'<div class="noteData">'+forwardZapNoteHeader+forwardZapNoteData+'</div></div>'
    noteContent.appendChild(forwardZap)
  }



  // Values
  var noteValues = document.createElement('div')
  noteValues.setAttribute('class', 'noteValues')

  // INSERT LOGIC FOR AMOUNT, ZAP-MIN, ZAP-MAX, ETC
  let filteredZapMin = eventData.tags.filter(tag => tag[0] == "zap-min")
  if(filteredZapMin.length>0){
    var zapMin = document.createElement('div')
    zapMin.setAttribute('class', 'zapMin')
    zapMin.innerHTML = '<span class="zapMinVal">'+(filteredZapMin[0][1]/1000).toLocaleString()+'</span> <span class="label">sats<br>Min</span>'
    noteValues.appendChild(zapMin)
  }

  let filteredZapMax = eventData.tags.filter(tag => tag[0] == "zap-max")
  if(filteredZapMax.length>0){
    var zapMax = document.createElement('div')
    zapMax.setAttribute('class', 'zapMax')
    zapMax.innerHTML = '<span class="zapMaxVal">'+(filteredZapMax[0][1]/1000).toLocaleString()+'</span> <span class="label">sats<br>Max</span>'
  }

  let filteredZapUses = eventData.tags.filter(tag => tag[0] == "zap-uses")

  var zapUses = document.createElement('div')
  zapUses.setAttribute('class', 'zapUses')
  filteredZapUses!=null && filteredZapUses[0]!=null ? zapUses.innerHTML = `<span class='zapUsesCurrent'>0</span> <span class='label'>of</span> <span class='zapUsesTotal'>${filteredZapUses[0][1]}</span>`
                  : zapUses.innerHTML = ""


  if(filteredZapMin.length>0 && filteredZapMax.length>0 && filteredZapMin[0][1] != filteredZapMax[0][1] ){
      noteValues.appendChild(zapMax)
  }




  noteValues.appendChild(zapUses)
  noteData.appendChild(noteValues)


  // Payer
  let filteredZapPayer = eventData.tags.filter(tag => tag[0] == "zap-payer")
  if(filteredZapPayer[0]!=null){
    var zapPayer = document.createElement('div')
    zapPayer.setAttribute('class', 'zapPayer')
    zapPayer.innerHTML = '<span class="material-symbols-outlined">arrow_downward_alt</span><img class="userImg" src="https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg"><div class="userName">'+ start_and_end(NostrTools.nip19.npubEncode(filteredZapPayer[0][1])) +'</div>'
    noteData.appendChild(zapPayer)
  }


  // LNURL
  let filteredZapLNURL = eventData.tags.filter(tag => tag[0] == "zap-lnurl")
  if(filteredZapLNURL[0]!=null){
    var zapLNURL = document.createElement('div')
    zapLNURL.setAttribute('class', 'zapPayer')
    zapLNURL.innerHTML = '<span class="material-symbols-outlined">more_up</span> '+filteredZapLNURL[0][1]
    noteData.appendChild(zapLNURL)
  }



  // Hero Payers
  var noteHeroZaps = document.createElement('div')
  noteHeroZaps.setAttribute('class', 'noteHeroZaps')
  noteHeroZaps.classList.add('noteZapReactions')
  noteData.appendChild(noteHeroZaps)

  // Main CTA
  var noteCTA = document.createElement('div')
  const buttonZap = document.createElement('button');
  noteCTA.appendChild(buttonZap);
  noteCTA.setAttribute('class', 'noteCTA')
  buttonZap.setAttribute('class', 'noteMainCTA');
  buttonZap.classList.add("cta");
  buttonZap.textContent = 'Pay'
  buttonZap.addEventListener('click', async () => {
    let rangeValue
    buttonZap.getAttribute("value") != null ? rangeValue = buttonZap.getAttribute("value") : rangeValue = -1
    await payNote(eventData, authorData, rangeValue)
  });




  if(filteredZapMin.length>0 && filteredZapMax.length>0 && filteredZapMin[0][1] != filteredZapMax[0][1] ){

      var zapSliderContainer = document.createElement('div')
      zapSliderContainer.setAttribute('class', 'zapSliderContainer')
      zapSliderContainer.innerHTML = '<input type="range" min="'+(filteredZapMin[0][1]/1000)+'" max="'+(filteredZapMax[0][1]/1000)+'" value="'+(filteredZapMin[0][1]/1000)+'" class="zapSlider">'
      noteData.appendChild(zapSliderContainer)

      var zapSlider = zapSliderContainer.querySelector('.zapSlider')

      var zapSliderVal = document.createElement('div')
      zapSliderVal.setAttribute('class', 'zapSliderVal')
      zapSliderContainer.appendChild(zapSliderVal)

      let update = () => {
        //console.log( (zapSlider.value).toLocaleString() )
        buttonZap.setAttribute('value', parseInt(zapSlider.value))
        zapSliderVal.innerHTML = (parseInt(zapSlider.value)).toLocaleString() + '<span class="label"> sats</span>';
      }
      zapSlider.addEventListener('input', update);
      update();

  }

  noteData.appendChild(noteCTA)


  // Actions and Reactions
  var noteActionsReactions = document.createElement('div')
  noteActionsReactions.setAttribute('class', 'noteActionsReactions')

  var noteZapReactions = document.createElement('div')
  noteZapReactions.setAttribute('class', 'noteZaps')
  noteZapReactions.classList.add('noteZapReactions')


  let eventDataString = JSON.stringify(eventData).replace(/"/g, '&quot;');

  var noteActions = document.createElement('div')
  noteActions.setAttribute('class', 'noteActions')
  let noteActionBtns =  '<a href="#" class="noteAction disabled" title="coming soon"><span class="material-symbols-outlined">bolt</span></a>'
  noteActionBtns +=     '<a href="#" class="noteAction disabled" title="coming soon"><span class="material-symbols-outlined">favorite</span></a>'
  noteActionBtns +=     '<a href="#" class="noteAction disabled" title="coming soon"><span class="material-symbols-outlined">ios_share</span></a>'
  let toolTip     =     '<div class="tooltiptext">'
  toolTip        +=     '<a href="#" class="cta disabled" title="coming soon">Crowd Pay</a>'
  toolTip        +=     '<a href="#" class="cta disabled" title="coming soon">Forward Pay</a>'
  toolTip        +=     '<a href="#" class="cta disabled" title="coming soon">Pay Anonymously</a>'
  toolTip        +=     '<a href="#" onclick="showJSON('+eventDataString+')" class="toolTipLink">View Raw</a>'
  toolTip        +=     '<a href="#" class="toolTipLink disabled" title="coming soon">Broadcast</a>'
  toolTip        +=     '<div>View on</div>'
  toolTip        +=     '<a href="https://next.nostrudel.ninja/#/n/'+NostrTools.nip19.noteEncode(eventData.id)+'" class="toolTipLink" target="_blank">nostrudel</a>'
  toolTip        +=     '</div>'
  noteActionBtns +=     '<div class="tooltip"><div class="noteAction"><span class="material-symbols-outlined">more_horiz</span>'+toolTip+'</div></div>'

  noteActions.innerHTML = noteActionBtns

  noteActionsReactions.appendChild(noteZapReactions)
  noteActionsReactions.appendChild(noteActions)
  noteData.appendChild(noteActionsReactions)


  newNote.appendChild(noteData);
  const main = document.querySelector('#main')
  //console.log(firstStream)
  firstStream==true ? main.appendChild(newNote) : main.insertBefore(newNote, main.firstChild)
}


function formatContent(content){
  //formatedContent = formatedContent.replace(/(nostr:|@)?((npub|note|nprofile|nevent|nrelay|naddr)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})/gi, '<a href="$1.$2">@CornerStore</a>')
  console.log("entrou aqui")
  // render npubs
  console.log(content)
  let npubMention = content.match(/(nostr:|@)?((npub)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})/gi)
  if(npubMention){
    npubMention = npubMention[0].replace('nostr:', '')
    npubMention = start_and_end(npubMention)
    content = content.replace(/(nostr:|@)?((npub)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})/gi, '<a href="https://next.nostrudel.ninja/#/u/$2" class="userMention" npub="$2" target="_blank">'+npubMention+'</a>')
    // render image
    //content = content.replace(/(http(s*):\/\/[\w\\x80-\\xff\#$%&~\/.\-;:=,?@\[\]+]*).(gif|png|jpg|jpeg)/gi, '<img src="$1.$3" />')
  }
  content = content.replace(/(https?:\/\/[\w\-\.~:\/?#\[\]@!$&'()*+,;=%]+)\.(gif|png|jpg|jpeg)/gi, '<img src="$1.$2" />');
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
      return `${minutesAgo}m`;
  } else if (hoursAgo < 24) {
      return `${hoursAgo}h`;
  } else {
      return `${daysAgo}d`;
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
  //console.log(json);
  var viewJSON = document.getElementById('viewJSON');
  if (viewJSON.style.display === 'none' || viewJSON.style.display === '') {
      viewJSON.style.display = 'flex'
      var viewJSON = document.getElementById('noteJSON')
      noteJSON.innerHTML = JSON.stringify(json, null, 2)
  } else {
      viewJSON.style.display = 'none'
  }
}


document.getElementById('newKind1').addEventListener('submit', submitKind1);


async function submitKind1(event){
  //console.log(event)
  event.preventDefault();
  const payNoteContent = document.getElementById('payNoteContent').value;
  //console.log(payNoteContent)
  if(payNoteContent==""){
  }
  let tagsList = []
  const zapMin = document.getElementById('zapMin').value;
  if(zapMin!="") tagsList.push(["zap-min",(zapMin*1000).toString()])
  const zapMax = document.getElementById('zapMax').value;
  if(zapMax!="") tagsList.push(["zap-max",(zapMax*1000).toString()])
  else if(zapMin!="" && zapMax=="") tagsList.push(["zap-max",(zapMin*1000).toString()])
  const zapUses = document.getElementById('zapUses').value;
  if(zapUses!="") tagsList.push(["zap-uses",zapUses])
  const zapLNURL = document.getElementById('overrideLNURL').value;
  if(zapLNURL!="") tagsList.push(["zap-lnurl",zapLNURL])

  let kind1 = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["t", "pubpay"],
      ...tagsList
    ],
    content: payNoteContent,
  }
  let kind1Finalized
  if(window.nostr!=null){
    kind1Finalized = await window.nostr.signEvent(kind1)
  }
  let isGood = NostrTools.verifyEvent(kind1Finalized)
  //console.log("is good?", isGood)
  if(isGood){
    await Promise.any(pool.publish(relays, kind1Finalized))
    //console.log('published to at least one relay!')
    setTimeout(function() {
        var newNoteForm = document.getElementById('newPayNoteForm');
        newNoteForm.style.display = 'none';
    }, 1000);
  }
}

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

    if(!json9735.picture) json9735.picture = ""
    const profileImage = json9735.picture == "" ? "https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg" : json9735.picture

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
    if(tagZapMin){
      const zapMinParsed = parseInt(tagZapMin[1])
      if(Number.isInteger(zapMinParsed) && zapMinParsed > 0){ tagZapMin = tagZapMin[1] }
      else(tagZapMin = undefined)
    }

    let tagZapMax = json9735.tags.find(tag => tag[0] == "zap-max")
    if(tagZapMax){
      const zapMaxParsed = parseInt(tagZapMax[1])
      if(Number.isInteger(zapMaxParsed) && zapMaxParsed > 0){ tagZapMax = tagZapMax[1] }
      else(tagZapMax = undefined)
    }

    let tagZapUses = json9735.tags.find(tag => tag[0] == "zap-uses")
    if(tagZapUses){
      const zapUsesParsed = parseInt(tagZapUses[1])
      if(Number.isInteger(zapUsesParsed) && zapUsesParsed > 0){ tagZapUses = tagZapUses[1]
      }else{ tagZapUses = -1 }
    }else{ tagZapUses = -1 }

    let zapTarget = tagZapMin/1000 * tagZapUses


    let tagZapPayer = json9735.tags.find(tag => tag[0] == "zap-payer")
    if(tagZapPayer){ tagZapPayer = tagZapPayer[1] }

    let tagZapForward = json9735.tags.find(tag => tag[0] == "zap-forward")
    if(tagZapForward){ tagZapForward = tagZapForward[1] }

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

    // Zap above minimum and below the maximum
    if((tagZapMin && !tagZapMax) && json9735.amount >= tagZapMin/1000 ||
    (!tagZapMin && tagZapMax) && json9735.amount <= tagZapMax/1000 ||
    (tagZapMin && tagZapMax) && json9735.amount >= tagZapMin/1000 && json9735.amount <= tagZapMax/1000){
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

async function payNote(eventZap, userProfile, rangeValue, anonymousZap = false){
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
        await createZapEvent(JSON.stringify({"lnurlinfo": lnurlinfo, "lud16": lud16, "event":eventZap}), null, rangeValue, anonymousZap)
        return
        // publicKey = await window.nostr.getPublicKey() //window.NostrTools.getPublicKey(privateKey)
      }
      else{
        sessionStorage.setItem('AmberPubkey', JSON.stringify({"lnurlinfo": lnurlinfo, "lud16": lud16, "event":event}));
        window.location.href = `nostrsigner:?compressionType=none&returnType=signature&type=get_public_key`
      }
  }
}

async function createZapEvent(eventStoragePK, pubKey = null, rangeValue, anonymousZap = false){
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
  if(anonymousZap==true){
    const privateKey = window.NostrTools.generateSecretKey()
    const publicKey = window.NostrTools.getPublicKey(privateKey)
    const signedEvent = window.NostrTools.finalizeEvent(zapEvent, privateKey)
    const isGood = window.NostrTools.verifyEvent(signedEvent)
    console.log("isGood?", isGood)
    await getInvoiceandPay(lnurlinfo.callback, amountPay, signedEvent, lud16)
  }
  else if(window.nostr!=null){
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
  let newNote = document.createElement('div')
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
  let noteProfileImg = document.createElement('div')
  noteProfileImg.setAttribute('class', 'noteProfileImg')
  let userImg = document.createElement('img')
  userImg.setAttribute('class', 'userImg')
  const profileImage = profileData.picture == "" ? "https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg" : profileData.picture
  userImg.setAttribute('src', profileImage);
  //userImg.setAttribute('src', 'https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg')

  noteProfileImg.appendChild(userImg)
  newNote.appendChild(noteProfileImg)


  // Data
  let noteData = document.createElement('div')
  noteData.setAttribute('class', 'noteData')

  // Header: names and date
  let noteHeader = document.createElement('div')
  noteHeader.setAttribute('class', 'noteHeader')

  let noteAuthor = document.createElement('div')
  noteAuthor.setAttribute('class', 'noteAuthor')


  let noteDisplayName = document.createElement('div')
  noteDisplayName.setAttribute('class', 'noteDisplayName')
  let displayName= profileData.displayName ? profileData.displayName : profileData.name;
  let npub = NostrTools.nip19.npubEncode(eventData.pubkey)
  if(profileData.name==null){
    displayName = start_and_end(npub)
  }
  noteDisplayName.innerHTML = '<a href="https://next.nostrudel.ninja/#/u/'+npub+'" class="noteAuthorLink" target="_blank">'+displayName+'</a>'


  let noteNIP05 = document.createElement('div')
  noteNIP05.classList.add("noteNIP05")
  noteNIP05.classList.add("label")
  //profileData.nip05 ? noteNIP05.textContent=profileData.nip05 : noteNIP05.textContent="displayname@domain.com"
  if(profileData.nip05){
      let noteNIP05String = profileData.nip05.split('@')
      noteNIP05.innerHTML='<a href="https://'+noteNIP05String[1]+'/.well-known/nostr.json?name='+noteNIP05String[0]+'" target="_blank"><span class="material-symbols-outlined">check_circle</span> '+profileData.nip05+'</a>'
  }else{
    noteNIP05.innerHTML='<span class="unverified label"><span class="material-symbols-outlined">block</span> Unverified</span>'
  }


  let noteLNAddress = document.createElement('div')
  noteLNAddress.classList.add("noteLNAddress")
  noteLNAddress.classList.add("label")

  if(profileData.lud16){
      let noteLNAddressString = profileData.lud16.split('@')
      noteLNAddress.innerHTML='<a href="https://'+noteLNAddressString[1]+'/.well-known/lnurlp/'+noteLNAddressString[0]+'" target="_blank"><span class="material-symbols-outlined">bolt</span> '+profileData.lud16+'</a>'
  }else{
    noteLNAddress.textContent="NOT PAYABLE"
  }

  let noteTimeAgo = timeAgo(eventData.created_at)

  let noteDate = document.createElement('div')
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
  let noteContent = document.createElement('div')
  noteContent.setAttribute('class', 'noteContent')
  let formatedContent = formatContent(eventData.content)
  noteContent.innerHTML = formatedContent
  noteData.appendChild(noteContent)


  // Forward
  let filteredforwardZap = eventData.tags.filter(tag => tag[0] == "zap-forward")
  if(filteredforwardZap[0]!=null){
    let forwardZap = document.createElement('div')
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
  let noteValues = document.createElement('div')
  noteValues.setAttribute('class', 'noteValues')

  // INSERT LOGIC FOR AMOUNT, ZAP-MIN, ZAP-MAX, ETC
  let zapMin = document.createElement('div')
  let filteredZapMin = eventData.tags.find(tag => tag[0] == "zap-min")
  if(filteredZapMin){
    const zapMinParsed = parseInt(filteredZapMin[1])
    if(!(Number.isInteger(zapMinParsed) && zapMinParsed>0)){
      filteredZapMin[1] = 1000
    }
    zapMin.setAttribute('class', 'zapMin')
    zapMin.innerHTML = '<span class="zapMinVal">'+(filteredZapMin[1]/1000).toLocaleString()+'</span> <span class="label">sats<br>Min</span>'
    noteValues.appendChild(zapMin)
  }

  let zapMax = document.createElement('div')
  let filteredZapMax = eventData.tags.find(tag => tag[0] == "zap-max")
  if(filteredZapMax){
    const zapMaxParsed = parseInt(filteredZapMax[1])
    if(!(Number.isInteger(zapMaxParsed) && zapMaxParsed>0)){
      if(filteredZapMin && filteredZapMin[1]) filteredZapMax[1] = filteredZapMin[1]
      else filteredZapMax[1] = 100000
    }
  }

  if(filteredZapMin && filteredZapMax){
    if(filteredZapMin[1] != filteredZapMax[1] ){
      zapMax.setAttribute('class', 'zapMax')
      zapMax.innerHTML = '<span class="zapMaxVal">'+(filteredZapMax[1]/1000).toLocaleString()+'</span> <span class="label">sats<br>Max</span>'
      noteValues.appendChild(zapMax)
    }
    else if(filteredZapMin[1] == filteredZapMax[1] ){
      zapMin.innerHTML = '<span class="zapMinVal">'+(filteredZapMin[1]/1000).toLocaleString()+'</span> <span class="label">sats<br></span>'
    }
  }

  const filteredZapUses = eventData.tags.find(tag => tag[0] == "zap-uses")
  const zapUses = document.createElement('div')
  zapUses.setAttribute('class', 'zapUses')
  filteredZapUses ? zapUses.innerHTML = `<span class='zapUsesCurrent'>0</span> <span class='label'>of</span> <span class='zapUsesTotal'>${filteredZapUses[1]}</span>`
                  : zapUses.innerHTML = ""
  noteValues.appendChild(zapUses)
  noteData.appendChild(noteValues)


  // Payer
  let filteredZapPayer = eventData.tags.filter(tag => tag[0] == "zap-payer")
  if(filteredZapPayer[0]!=null){
    let zapPayer = document.createElement('div')
    zapPayer.setAttribute('class', 'zapPayer')
    zapPayer.innerHTML = '<span class="material-symbols-outlined">arrow_downward_alt</span><img class="userImg" src="https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg"><div class="userName">'+ start_and_end(NostrTools.nip19.npubEncode(filteredZapPayer[0][1])) +'</div>'
    noteData.appendChild(zapPayer)
  }


  // LNURL
  const filteredZapLNURL = eventData.tags.find(tag => tag[0] == "zap-lnurl")
  if(filteredZapLNURL){
    const ludSplit = filteredZapLNURL[1].split("@")
    if(ludSplit.length==2){
      const zapLNURL = document.createElement('div')
      zapLNURL.setAttribute('class', 'zapPayer')
      zapLNURL.innerHTML = `<span class="material-symbols-outlined">more_up</span>`
      zapLNURL.innerHTML += `<a href="https://`+ludSplit[1]+`/.well-known/lnurlp/`+ludSplit[0]+`" target=”_blank”>`+filteredZapLNURL[1]+`</a>`
      noteData.appendChild(zapLNURL)
    }
  }

  // Hero Payers
  let noteHeroZaps = document.createElement('div')
  noteHeroZaps.setAttribute('class', 'noteHeroZaps')
  noteHeroZaps.classList.add('noteZapReactions')
  noteData.appendChild(noteHeroZaps)

  // Main CTA
  let noteCTA = document.createElement('div')
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


  if(filteredZapMin && filteredZapMax && filteredZapMin[1] != filteredZapMax[1] ){

      let zapSliderContainer = document.createElement('div')
      zapSliderContainer.setAttribute('class', 'zapSliderContainer')
      zapSliderContainer.innerHTML = '<input type="range" min="'+(filteredZapMin[1]/1000)+'" max="'+(filteredZapMax[1]/1000)+'" value="'+(filteredZapMin[1]/1000)+'" class="zapSlider">'
      noteData.appendChild(zapSliderContainer)

      let zapSlider = zapSliderContainer.querySelector('.zapSlider')

      let zapSliderVal = document.createElement('div')
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
  let noteActionsReactions = document.createElement('div')
  noteActionsReactions.setAttribute('class', 'noteActionsReactions')

  let noteZapReactions = document.createElement('div')
  noteZapReactions.setAttribute('class', 'noteZaps')
  noteZapReactions.classList.add('noteZapReactions')


  let eventDataString = JSON.stringify(eventData).replace(/"/g, '&quot;');

  let noteActions = document.createElement('div')
  noteActions.setAttribute('class', 'noteActions')

  let zapBoltIcon = document.createElement('a')
  zapBoltIcon.setAttribute('class', 'noteAction')
  zapBoltIcon.classList.add('disabled')
  zapBoltIcon.innerHTML = '<span class="material-symbols-outlined">bolt</span>'
  noteActions.appendChild(zapBoltIcon)

  let reactionIcon = document.createElement('a')
  reactionIcon.setAttribute('class', 'noteAction')
  reactionIcon.classList.add('disabled')
  reactionIcon.innerHTML = '<span class="material-symbols-outlined">favorite</span>'
  noteActions.appendChild(reactionIcon)

  let shareIcon = document.createElement('a')
  shareIcon.setAttribute('class', 'noteAction')
  shareIcon.classList.add('disabled')
  shareIcon.innerHTML = '<span class="material-symbols-outlined">ios_share</span>'
  noteActions.appendChild(shareIcon)



  let toolTip = document.createElement('div')
  toolTip.setAttribute('class', 'tooltip')


  let toolTipText = document.createElement('div')
  toolTipText.setAttribute('class', 'tooltiptext')


  let newPayForward = document.createElement('a')
  newPayForward.setAttribute('class', 'cta')
  newPayForward.classList.add('disabled')
  newPayForward.textContent = 'New Pay Forward'
  toolTipText.appendChild(newPayForward)

  let payAnonymously = document.createElement('a')
  payAnonymously.setAttribute('class', 'cta')
  payAnonymously.textContent = 'Pay Anonymously'
  payAnonymously.addEventListener('click', async () => {
    let rangeValue
    buttonZap.getAttribute("value") != null ? rangeValue = buttonZap.getAttribute("value") : rangeValue = -1
    await payNote(eventData, authorData, rangeValue, true)
  });
  toolTipText.appendChild(payAnonymously)

  let viewRaw = document.createElement('div')
  viewRaw.setAttribute('class', 'noteAction')
  viewRaw.innerHTML = '<a href="#" onclick="showJSON('+eventDataString+')" class="toolTipLink">View Raw</a>'
  toolTipText.appendChild(viewRaw)

  let viewOn = document.createElement('div')
  viewOn.setAttribute('class', 'noteAction')
  viewOn.innerHTML = '<a href="https://next.nostrudel.ninja/#/n/'+NostrTools.nip19.noteEncode(eventData.id)+'" class="toolTipLink" target="_blank">View on nostrudel</a>'
  toolTipText.appendChild(viewOn)




  let noteAction = document.createElement('div')
  noteAction.setAttribute('class', 'noteAction')
  noteAction.innerHTML = '<span class="material-symbols-outlined">more_horiz</span>'
  noteAction.appendChild(toolTipText)

  toolTip.appendChild(noteAction)

  noteActions.appendChild(toolTip)


  // const rangeValue = buttonZap.getAttribute('value') !== null ? buttonZap.getAttribute('value') : -1;
  // payNote(eventData, authorData, rangeValue, true);';

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
  // render npubs
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
        let newNoteForm = document.getElementById('newPayNoteForm');
        if (newNoteForm.style.display === 'none' || newNoteForm.style.display === '') {
            newNoteForm.style.display = 'flex';
        } else {
            newNoteForm.style.display = 'none';
        }
      })


      document.getElementById('cancelNewNote').addEventListener("click", function() {
        let newNoteForm = document.getElementById('newPayNoteForm');
        if (newNoteForm.style.display === 'none' || newNoteForm.style.display === '') {
            newNoteForm.style.display = 'flex';
        } else {
            newNoteForm.style.display = 'none';
        }
      })





      document.getElementById('closeJSON').addEventListener("click", function() {
        let newNoteForm = document.getElementById('viewJSON');
        if (newNoteForm.style.display === 'none' || newNoteForm.style.display === '') {
            newNoteForm.style.display = 'flex';
        } else {
            newNoteForm.style.display = 'none';
        }
      })






});




function showJSON(json){
  //console.log(json);
  let viewJSON = document.getElementById('viewJSON');
  if (viewJSON.style.display === 'none' || viewJSON.style.display === '') {
      viewJSON.style.display = 'flex'
      let viewJSON = document.getElementById('noteJSON')
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
        let newNoteForm = document.getElementById('newPayNoteForm');
        newNoteForm.style.display = 'none';
    }, 1000);
  }
}

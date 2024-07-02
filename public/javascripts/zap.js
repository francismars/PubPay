export async function payNote(eventZap, userProfile, rangeValue, anonymousZap = false){
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
  
    const response = await fetch("https://"+ludSplit[1]+"/.well-known/lnurlp/"+ludSplit[0])
    .catch(error => {
      let parentNote = document.getElementById(eventZap.id)
      let noteMainCTA = parentNote.querySelector('.noteMainCTA')
      noteMainCTA.classList.add('disabled')
      noteMainCTA.classList.add('red')
      noteMainCTA.innerHTML = "CAN'T PAY: Failed to fetch lud16"
    })
  
    if(response == undefined){
      return
    }
    const lnurlinfo = await response.json();
    if(lnurlinfo.allowsNostr==true){
        // const privateKey = window.NostrTools.generateSecretKey()
        let publicKey
        if(anonymousZap==true){
          await createZapEvent(JSON.stringify({"lnurlinfo": lnurlinfo, "lud16": lud16, "event":eventZap}), null, rangeValue, anonymousZap)
          return
        }
        else if(window.nostr!=null){
          await createZapEvent(JSON.stringify({"lnurlinfo": lnurlinfo, "lud16": lud16, "event":eventZap}), null, rangeValue, false)
          return
          // publicKey = await window.nostr.getPublicKey() //window.NostrTools.getPublicKey(privateKey)
        }
        else{
          sessionStorage.setItem('AmberPubkey', JSON.stringify({"lnurlinfo": lnurlinfo, "lud16": lud16, "event":event}));
          window.location.href = `nostrsigner:?compressionType=none&returnType=signature&type=get_public_key`
        }
    }else{
      let parentNote = document.getElementById(eventZap.id)
      let noteMainCTA = parentNote.querySelector('.noteMainCTA')
      noteMainCTA.classList.add('disabled')
      noteMainCTA.classList.add('red')
      noteMainCTA.innerHTML = "CAN'T PAY: No nostr support"
    }
  }

  
async function createZapEvent(eventStoragePK, pubKey = null, rangeValue, anonymousZap = false){
    eventStoragePK = JSON.parse(eventStoragePK)
    let eventZap = eventStoragePK.event
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
        relays: ['wss://relay.damus.io', 'wss://relay.primal.net','wss://nostr.mutinywallet.com/', 'wss://relay.nostr.band/', 'wss://relay.nostr.nu/']
    })
    zapEvent.tags.unshift(["zap-lnurl", eventStoragePK.lud16])
    zapEvent.tags.unshift(["t", "pubpay"])
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
      window.location.href = `nostrsigner:${eventString}?compressionType=none&returnType=signature&type=sign_event`
    }
  }

  
async function getInvoiceandPay(callback, amount, zapFinalized, lud16){
    let eventFinal = JSON.stringify(zapFinalized)
    let lnurl = lud16
    let callString = `${callback}?amount=${amount}&nostr=${eventFinal}&lnurl=${lnurl}`
    const responseFinal = await fetch(callString)
    const {pr: invoice} = await responseFinal.json();
    if(window.webln){
      await window.webln.enable();
      await window.webln.sendPayment(invoice);
    }
    else{
      try {
        //window.open(`lightning:${invoice}`, '_blank');
        //window.location.href = `intent://pay/${invoice}#Intent;scheme=lightning;end;`;
        window.location.href = `lightning:${invoice}`;
      } catch (error) {
        alert('Failed to open wallet:', error);
      }
    //subZapEvent(event)
    }
  }


  document.addEventListener("visibilitychange", async function() {
    if (document.visibilityState === 'visible') {
      let eventStoragePK = sessionStorage.getItem("AmberPubkey");
      if(eventStoragePK){
        sessionStorage.removeItem('AmberPubkey');
        const publicKey = await accessClipboard()
        let decodedPK = NostrTools.nip19.decode(publicKey)
        createZapEvent(eventStoragePK, decodedPK.data, -1)
        return
      }
      const eventStorage = JSON.parse(sessionStorage.getItem("AmberSign"));
      if(eventStorage){
        sessionStorage.removeItem('AmberSign');
        let eventSignature
        try {
          eventSignature = await accessClipboard()
        } catch (error) {
          console.error("Failed to read clipboard:", error);
        }
        let eventSigned = eventStorage.event
        eventSigned["sig"] = eventSignature
        //zapFinalized = await window.NostrTools.finalizeEvent(eventStorage.event, eventSignature)
        //console.log('eventSigned', eventSigned)
        let verifiedEvent = NostrTools.verifyEvent(eventSigned)
        if(verifiedEvent == true){
            await getInvoiceandPay(eventStorage.callback, eventStorage.amount, eventSigned, eventStorage.lud16)
        }
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
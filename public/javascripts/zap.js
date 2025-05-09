const signIn = await import("./signIn.js");

export async function payNote(
  eventZap,
  userProfile,
  rangeValue,
  anonymousZap = false
) {
  const publicKey = signIn.getPublicKey();
  if (!publicKey) {
    console.error("No public key found. Please sign in first.");
    const loginForm = document.getElementById("loginForm");
    if (loginForm.style.display == "none") {
      loginForm.style.display = "flex";
    }
    return;
  }
  const zapLNURL = eventZap.tags.find((tag) => tag[0] == "zap-lnurl");
  const eventProfile = userProfile;
  const eventProfileContent = JSON.parse(eventProfile.content);
  const lud16 =
    zapLNURL && zapLNURL.length > 0 ? zapLNURL[1] : eventProfileContent.lud16;
  const ludSplit = lud16.split("@");
  if (ludSplit.length != 2) {
    console.error("Invalid lud16 format.");
    return;
  }
  const response = await fetch(
    "https://" + ludSplit[1] + "/.well-known/lnurlp/" + ludSplit[0]
  ).catch((error) => {
    for (let feedId of ["main", "following"]) {
      const parentFeed = document.getElementById(feedId);
      const parentNote = parentFeed.querySelector("#_" + eventZap.id);
      const noteMainCTA = parentNote.querySelector(".noteMainCTA");
      noteMainCTA.classList.add("disabled");
      noteMainCTA.classList.add("red");
      noteMainCTA.innerHTML = "CAN'T PAY: Failed to fetch lud16";
    }
  });

  if (response == undefined) {
    return;
  }
  const lnurlinfo = await response.json();
  if (!(lnurlinfo.allowsNostr == true)) {
    for (let feedId of ["main", "following"]) {
      const parentFeed = document.getElementById(feedId);
      const parentNote = parentFeed.querySelector("#_" + eventZap.id);
      const noteMainCTA = parentNote.querySelector(".noteMainCTA");
      noteMainCTA.classList.add("disabled");
      noteMainCTA.classList.add("red");
      noteMainCTA.innerHTML = "CAN'T PAY: No nostr support";
    }
  }
  if (anonymousZap == true) {
    await createZapEvent(
      JSON.stringify({ lnurlinfo: lnurlinfo, lud16: lud16, event: eventZap }),
      null,
      rangeValue,
      anonymousZap
    );
    return;
  }
  await createZapEvent(
    JSON.stringify({ lnurlinfo: lnurlinfo, lud16: lud16, event: eventZap }),
    publicKey,
    rangeValue,
    false
  );
  return;
}

async function createZapEvent(
  eventStoragePK,
  pubKey = null,
  rangeValue,
  anonymousZap = false
) {
  eventStoragePK = JSON.parse(eventStoragePK);
  const eventZap = eventStoragePK.event;
  const lnurlinfo = eventStoragePK.lnurlinfo;
  const lud16 = eventStoragePK.lud16;
  const zapMintag = eventZap.tags.find((tag) => tag[0] == "zap-min");
  const zapTagAmount = zapMintag ? zapMintag[1] : 1000;
  const amountPay =
    rangeValue != -1 ? parseInt(rangeValue) * 1000 : Math.floor(zapTagAmount);
  const zapEvent = await window.NostrTools.nip57.makeZapRequest({
    profile: eventZap.pubkey,
    event: eventZap.id,
    amount: amountPay,
    comment: "",
    relays: [
      "wss://relay.damus.io",
      "wss://relay.primal.net",
      "wss://nostr.mutinywallet.com/",
      "wss://relay.nostr.band/",
      "wss://relay.nostr.nu/",
    ],
  });
  zapEvent.tags.unshift(["zap-lnurl", eventStoragePK.lud16]);
  zapEvent.tags.unshift(["t", "pubpay"]);
  if (pubKey != null) {
    zapEvent.pubkey = pubKey;
    let eventID = NostrTools.getEventHash(zapEvent);
    if (eventID != null) zapEvent.id = eventID;
  }
  if (anonymousZap == true) {
    const privateKey = window.NostrTools.generateSecretKey();
    const publicKey = window.NostrTools.getPublicKey(privateKey);
    const signedEvent = window.NostrTools.finalizeEvent(zapEvent, privateKey);
    const isGood = window.NostrTools.verifyEvent(signedEvent);
    if (isGood == false) {
      console.error("Failed to verify event.");
      return;
    }
    await getInvoiceandPay(lnurlinfo.callback, amountPay, signedEvent, lud16);
    return;
  }
  const signInMethod = signIn.getSignInMethod();
  if (signInMethod == "extension") {
    if (window.nostr != null) {
      const zapFinalized = await window.nostr.signEvent(zapEvent);
      await getInvoiceandPay(
        lnurlinfo.callback,
        amountPay,
        zapFinalized,
        lud16
      );
    }
  } else if (signInMethod == "externalSigner") {
    const eventString = JSON.stringify(zapEvent);
    sessionStorage.setItem(
      "SignZapEvent",
      JSON.stringify({
        callback: lnurlinfo.callback,
        amount: amountPay,
        lud16: lud16,
        event: zapEvent,
      })
    );
    window.location.href = `nostrsigner:${eventString}?compressionType=none&returnType=signature&type=sign_event`;
  } else if (signInMethod == "nsec") {
    const privateKey = signIn.getPrivateKey();
    if (!privateKey) {
      console.error("No private key found. Please sign in first.");
      return;
    }
    let { type, data } = NostrTools.nip19.decode(privateKey);
    const zapFinalized = NostrTools.finalizeEvent(zapEvent, data);
    await getInvoiceandPay(lnurlinfo.callback, amountPay, zapFinalized, lud16);
  }
}

export async function getInvoiceandPay(callback, amount, zapFinalized, lud16) {
  let eventFinal = JSON.stringify(zapFinalized);
  let lnurl = lud16;
  let callString = `${callback}?amount=${amount}&nostr=${eventFinal}&lnurl=${lnurl}`;
  const responseFinal = await fetch(callString);
  const { pr: invoice } = await responseFinal.json();
  if (window.webln) {
    await window.webln.enable();
    await window.webln.sendPayment(invoice);
  } else {
    try {
      //window.open(`lightning:${invoice}`, '_blank');
      //window.location.href = `intent://pay/${invoice}#Intent;scheme=lightning;end;`;
      window.location.href = `lightning:${invoice}`;
    } catch (error) {
      alert("Failed to open wallet:", error);
    }
    //subZapEvent(event)
  }
}

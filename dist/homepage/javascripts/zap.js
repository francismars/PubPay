const signIn = await import("./signIn.js");

export async function getInvoiceCallBack(eventToZap, eventCreatorProfile) {
  const zapLNURL = eventToZap.tags.find((tag) => tag[0] == "zap-lnurl");
  const eventCreatorProfileContent = JSON.parse(eventCreatorProfile.content);
  const lud16 =
    zapLNURL && zapLNURL.length > 0
      ? zapLNURL[1]
      : eventCreatorProfileContent.lud16;
  const ludSplit = lud16.split("@");
  if (ludSplit.length != 2) {
    console.error("Invalid lud16 format.");
    return;
  }
  let errorResponse = null;
  const response = await fetch(
    "https://" + ludSplit[1] + "/.well-known/lnurlp/" + ludSplit[0]
  ).catch((error) => {
    errorResponse = "CAN'T PAY: Failed to fetch lud16";
  });
  if (response == undefined) {
    errorResponse = "CAN'T PAY: Failed to fetch lud16";
  }
  const lnurlinfo = await response.json();
  if (!(lnurlinfo.allowsNostr == true)) {
    errorResponse = "CAN'T PAY: No nostr support";
  }
  if (errorResponse) {
    for (let feedId of ["main", "following"]) {
      const parentFeed = document.getElementById(feedId);
      const parentNote = parentFeed.querySelector("#_" + eventToZap.id);
      if (!parentNote) return;
      const noteMainCTA = parentNote.querySelector(".noteMainCTA");
      noteMainCTA.classList.add("disabled");
      noteMainCTA.classList.add("red");
      noteMainCTA.innerHTML = errorResponse;
      const zapMenuAction = parentNote.querySelector(".zapMenuAction");
      zapMenuAction.classList.add("disabled");
    }
  }
  const callBack = lnurlinfo.callback;
  return {
    callbackToZap: callBack,
    lud16ToZap: lud16,
  };
  /*
  await createZapEvent(
    JSON.stringify({ lnurlinfo: lnurlinfo, lud16: lud16, event: eventToZap }),
    publicKey,
    rangeValue,
    false
  );
  */
}

export async function createZapEvent(
  eventToZap,
  rangeValue,
  lud16,
  pubKey = null
) {
  const zapMintag = eventToZap.tags.find((tag) => tag[0] == "zap-min");
  const zapTagAmount = zapMintag ? zapMintag[1] : 1000;
  const amountPay =
    rangeValue != -1 ? parseInt(rangeValue) * 1000 : Math.floor(zapTagAmount);
  const zapEvent = await window.NostrTools.nip57.makeZapRequest({
    event: eventToZap.id,
    profile: eventToZap.pubkey,
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
  zapEvent.tags.push(["zap-lnurl", lud16]);
  zapEvent.tags.push(["t", "pubpay"]);
  if (pubKey != null) {
    zapEvent.pubkey = pubKey;
    let eventID = NostrTools.getEventHash(zapEvent);
    if (eventID != null) zapEvent.id = eventID;
  }
  return { zapEvent: zapEvent, amountPay: amountPay };
}

export async function signZapEvent(
  zapEvent,
  callback,
  amountPay,
  lud16,
  eventoToZapID,
  anonymousZap
) {
  const signInMethod = signIn.getSignInMethod();
  let zapFinalized;
  if (anonymousZap == true) {
    const privateKey = window.NostrTools.generateSecretKey();
    zapFinalized = window.NostrTools.finalizeEvent(zapEvent, privateKey);
  } else if (signInMethod == "externalSigner") {
    const eventString = JSON.stringify(zapEvent);
    sessionStorage.setItem(
      "SignZapEvent",
      JSON.stringify({
        callback: callback,
        amount: amountPay,
        lud16: lud16,
        event: zapEvent,
        id: eventoToZapID,
      })
    );
    window.location.href = `nostrsigner:${eventString}?compressionType=none&returnType=signature&type=sign_event`;
    return;
  } else if (signInMethod == "extension") {
    if (window.nostr != null) {
      zapFinalized = await window.nostr.signEvent(zapEvent);
    }
  } else if (signInMethod == "nsec") {
    const privateKey = signIn.getPrivateKey();
    if (!privateKey) {
      console.error("No private key found. Please sign in first.");
      return;
    }
    let { type, data } = NostrTools.nip19.decode(privateKey);
    zapFinalized = NostrTools.finalizeEvent(zapEvent, data);
  }
  await getInvoiceandPay(
    callback,
    amountPay,
    zapFinalized,
    lud16,
    eventoToZapID
  );
}

export async function getInvoiceandPay(
  callback,
  amount,
  zapFinalized,
  lud16,
  eventID
) {
  const eventFinal = JSON.stringify(zapFinalized);
  const lnurl = lud16;
  const callString = `${callback}?amount=${amount}&nostr=${eventFinal}&lnurl=${lnurl}`;
  const responseFinal = await fetch(callString);
  if (!responseFinal.ok) {
    for (let feedId of ["main", "following"]) {
      const parentFeed = document.getElementById(feedId);
      const parentNote = parentFeed.querySelector("#_" + eventID);
      if (!parentNote) return;
      const noteMainCTA = parentNote.querySelector(".noteMainCTA");
      noteMainCTA.classList.add("disabled");
      noteMainCTA.classList.add("red");
      noteMainCTA.innerHTML = "CAN'T PAY: Failed to get invoice";
      const zapMenuAction = parentNote.querySelector(".zapMenuAction");
      zapMenuAction.classList.add("disabled");
    }
    return;
  }
  const { pr: invoice } = await responseFinal.json();
  await handleFetchedInvoice(invoice, zapFinalized.id);
}

export async function handleFetchedInvoice(invoice, zapEventID) {
  const invoiceQR = document.getElementById("invoiceQR");
  const qr = await QRCode.toCanvas(invoiceQR, invoice);
  const invoiceOverlay = document.getElementById("invoiceOverlay");
  invoiceOverlay.setAttribute("data-event-id", zapEventID);
  invoiceOverlay.style.display = "flex";
  document.getElementById("closeInvoiceOverlay").onclick = (event) => {
    event.preventDefault();
    invoiceOverlay.style.display = "none";
    invoiceQR.innerHTML = "";
  };
  const payWithExtension = document.getElementById("payWithExtension");
  payWithExtension.onclick = async () => {
    if (window.webln) {
      try {
        await window.webln.enable();
        await window.webln.sendPayment(invoice);
      } catch (error) {
        console.error("Error paying with extension:", error);
      }
    } else {
      payWithExtension.classList.add("disabled");
      payWithExtension.classList.add("red");
      payWithExtension.innerHTML = "Not found";
    }
  };
  document.getElementById("payWithWallet").onclick = () => {
    try {
      window.location.href = `lightning:${invoice}`;
    } catch (error) {
      console.error("Error opening wallet:", error);
    }
  };
  document.getElementById("copyInvoice").onclick = async () => {
    try {
      await navigator.clipboard.writeText(invoice);
      document.getElementById("copyInvoice").innerHTML = "Copied!";
      setTimeout(() => {
        document.getElementById("copyInvoice").innerHTML = "Copy Invoice";
      }, 1000);
    } catch (error) {
      console.error("Failed to copy invoice:", error);
    }
  };
}

export async function payInvoice(invoice) {
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

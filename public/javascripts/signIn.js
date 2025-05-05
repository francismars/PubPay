const METHODS = ["extension", "keyManager", "nsec"];

let signInMethod = undefined;

export function getSignInMethod() {
  return signInMethod;
}

export async function signIn(method, rememberMe, nsec = undefined) {
  if (!METHODS.includes(method)) {
    console.error("Invalid sign-in method.");
    return;
  }
  cleanSignInData();
  signInMethod = method;
  let pubKey;
  let privKey;
  if (signInMethod === "extension") {
    pubKey = await window.nostr.getPublicKey();
  } else if (signInMethod === "keyManager") {
    sessionStorage.setItem("signIn", JSON.stringify(rememberMe));
    const nostrSignerURL = `nostrsigner:?compressionType=none&returnType=signature&type=get_public_key`;
    window.location.href = nostrSignerURL;
    return;
  } else if (signInMethod === "nsec") {
    if (!nsec) {
      console.error("No NSEC provided.");
      return;
    }
    let { type, data } = NostrTools.nip19.decode(nsec);
    if (type === "nsec") {
      privKey = data;
      pubKey = NostrTools.getPublicKey(privKey);
    }
  }
  if (rememberMe) {
    localStorage.setItem("publicKey", pubKey);
    if (privKey) localStorage.setItem("privateKey", privKey);
    console.log("Saved to local storage!");
  } else {
    sessionStorage.setItem("publicKey", pubKey);
    if (privKey) sessionStorage.setItem("privateKey", privKey);
    console.log("Saved to session storage!");
  }
}

export function getPublicKey() {
  return localStorage.getItem("publicKey")
    ? localStorage.getItem("publicKey")
    : sessionStorage.getItem("publicKey")
    ? sessionStorage.getItem("publicKey")
    : null;
}

export function cleanSignInData() {
  signInMethod = undefined;
  localStorage.removeItem("publicKey");
  localStorage.removeItem("privateKey");
  sessionStorage.removeItem("publicKey");
  sessionStorage.removeItem("privateKey");
}

document.addEventListener("visibilitychange", async function () {
  if (document.visibilityState === "visible") {
    alert("Visibility changed to visible.");
    const rememberMe = JSON.parse(sessionStorage.getItem("signIn"));
    alert("signInData: ", rememberMe);
    if (!rememberMe) {
      alert("No sign-in data found in Session Storage.");
      return;
    }
    sessionStorage.removeItem("signIn");
    const publicKey = await accessClipboard();
    let decodedPK = NostrTools.nip19.decode(publicKey);
    const pubKey = decodedPK.data;
    alert("publicKey", pubKey);
    alert("decodedPK", decodedPK);
    alert("pubKey", pubKey);
    if (rememberMe === "true") {
      localStorage.setItem("publicKey", pubKey);
      console.log("Saved to local storage!");
    } else {
      sessionStorage.setItem("publicKey", pubKey);
      console.log("Saved to session storage!");
    }
    await subscribeKind0();
    return;
  }
});

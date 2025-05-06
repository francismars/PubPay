const METHODS = ["extension", "keyManager", "nsec"];

export async function signIn(method, rememberMe, nsec = undefined) {
  if (!METHODS.includes(method)) {
    console.error("Invalid sign-in method.");
    return;
  }
  cleanSignInData();
  let pubKey;
  let privKey;
  if (method === "extension") {
    pubKey = await window.nostr.getPublicKey();
  } else if (method === "keyManager") {
    sessionStorage.setItem("signIn", JSON.stringify({ rememberMe: rememberMe }));
    const nostrSignerURL = `nostrsigner:?compressionType=none&returnType=signature&type=get_public_key`;
    window.location.href = nostrSignerURL;
    return;
  } else if (method === "nsec") {
    if (!nsec) {
      console.error("No NSEC provided.");
      return;
    }
    let { type, data } = NostrTools.nip19.decode(nsec);
    if (type !== "nsec") {
      console.log("Invalid Nsec.")
      return
    }
    privKey = data;
    pubKey = NostrTools.getPublicKey(privKey);  
  }
  if (rememberMe) {
    localStorage.setItem("publicKey", pubKey);
    localStorage.setItem("signInMethod", method);
    if (privKey) localStorage.setItem("privateKey", nsec);
    console.log("Saved to local storage!");
  } else {
    sessionStorage.setItem("publicKey", pubKey);
    sessionStorage.setItem("signInMethod", method);
    if (privKey) sessionStorage.setItem("privateKey", nsec);
    console.log("Saved to session storage!");
  }
}

export function getPublicKey() {
  const publicKey = localStorage.getItem("publicKey")
    ? localStorage.getItem("publicKey")
    : sessionStorage.getItem("publicKey")
    ? sessionStorage.getItem("publicKey")
    : null;
    if (typeof publicKey !== "string" || publicKey.length !== 64) {
      cleanSignInData();
      return null
    }
    return publicKey
}

export function getPrivateKey() {
  const privateKey = localStorage.getItem("privateKey")
    ? localStorage.getItem("privateKey")
    : sessionStorage.getItem("privateKey")
    ? sessionStorage.getItem("privateKey")
    : null;
    return privateKey
}

export function getSignInMethod() {
  const singInMethod = localStorage.getItem("signInMethod")
  ? localStorage.getItem("signInMethod")
  : sessionStorage.getItem("signInMethod")
  ? sessionStorage.getItem("signInMethod")
  : null;
  if (!METHODS.includes(singInMethod)) {
    cleanSignInData();
    return null
  }
  return singInMethod
}

export function cleanSignInData() {
  localStorage.removeItem("signInMethod");
  sessionStorage.removeItem("signInMethod");
  localStorage.removeItem("publicKey");
  localStorage.removeItem("privateKey");
  sessionStorage.removeItem("publicKey");
  sessionStorage.removeItem("privateKey");
}



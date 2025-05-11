const METHODS = ["extension", "externalSigner", "nsec"];

export async function signIn(method, rememberMe, nsec = undefined) {
  if (!METHODS.includes(method)) {
    console.error("Invalid sign-in method.");
    return;
  }
  cleanSignInData();
  let pubKey;
  let privKey;
  if (method === "extension") {
    if (window.nostr) {
      pubKey = await window.nostr.getPublicKey();
    } else {
      handleFailedSignin(method);
      throw new Error("Can't find window.nostr");
    }
  } else if (method === "externalSigner") {
    sessionStorage.setItem(
      "signIn",
      JSON.stringify({ rememberMe: rememberMe })
    );
    const nostrSignerURL = `nostrsigner:?compressionType=none&returnType=signature&type=get_public_key`;
    const navigationAttempted = await new Promise((resolve) => {
      let attempted = false;
      const handleVisibilityChange = () => {
        if (document.visibilityState === "hidden") {
          attempted = true;
          resolve(true);
        }
      };
      document.addEventListener("visibilitychange", handleVisibilityChange);
      window.location.href = nostrSignerURL;
      setTimeout(() => {
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange
        );
        resolve(false);
      }, 2000);
    });
    if (!navigationAttempted) {
      handleFailedSignin(method);
      sessionStorage.removeItem("signIn");
      throw new Error(
        "Failed to launch 'nostrsigner': Redirection did not occur."
      );
    }
  } else if (method === "nsec") {
    if (!nsec) {
      throw new Error("No NSEC provided.");
      return;
    }
    let { type, data } = NostrTools.nip19.decode(nsec);
    if (type !== "nsec") {
      throw new Error("Invalid Nsec.");
      return;
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
    return null;
  }
  return publicKey;
}

export function getPrivateKey() {
  const privateKey = localStorage.getItem("privateKey")
    ? localStorage.getItem("privateKey")
    : sessionStorage.getItem("privateKey")
    ? sessionStorage.getItem("privateKey")
    : null;
  return privateKey;
}

export function getSignInMethod() {
  const singInMethod = localStorage.getItem("signInMethod")
    ? localStorage.getItem("signInMethod")
    : sessionStorage.getItem("signInMethod")
    ? sessionStorage.getItem("signInMethod")
    : null;
  if (!METHODS.includes(singInMethod)) {
    cleanSignInData();
    return null;
  }
  return singInMethod;
}

export function cleanSignInData() {
  localStorage.removeItem("signInMethod");
  sessionStorage.removeItem("signInMethod");
  localStorage.removeItem("publicKey");
  localStorage.removeItem("privateKey");
  sessionStorage.removeItem("publicKey");
  sessionStorage.removeItem("privateKey");
}

function handleFailedSignin(signInType) {
  let buttonID;
  if (signInType == "extension") buttonID = "signInExtension";
  if (signInType == "externalSigner") buttonID = "signInexternalSigner";
  if (signInType == "nsec") buttonID = "signInNsec";
  const button = document.getElementById(buttonID);
  button.classList.add("disabled");
  button.classList.add("red");
  button.innerHTML = "Not supported";
}

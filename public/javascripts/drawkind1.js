const zap = await import("./zap.js");
const signIn = await import("./signIn.js");

const pool = new NostrTools.SimplePool();
const relays = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://relay.nostr.band/",
  "wss://relay.nostr.nu/",
];

export async function plot(
  eventData,
  authorData,
  streamType = "newKind1",
  iskind3filter = false
) {
  let newNote = document.createElement("div");
  newNote.setAttribute("id", "_" + eventData.id);
  newNote.setAttribute("class", "paynote");

  let authorContent = JSON.parse(authorData.content);

  let profileData = {};
  profileData.name = authorContent.name;
  //profileData.displayName = authorContent.name
  authorContent.displayName
    ? (profileData.displayName = authorContent.displayName)
    : (profileData.displayName = authorContent.display_name);
  profileData.picture = authorContent.picture ? authorContent.picture : "";
  profileData.nip05 = authorContent.nip05;
  profileData.lud16 = authorContent.lud16;

  //console.log(profileData)

  // Profile image
  let noteProfileImg = document.createElement("div");
  noteProfileImg.setAttribute("class", "noteProfileImg");
  let userImg = document.createElement("img");
  userImg.setAttribute("class", "userImg");
  const profileImage =
    profileData.picture == ""
      ? "https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg"
      : profileData.picture;
  userImg.setAttribute("src", profileImage);
  //userImg.setAttribute('src', 'https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg')

  noteProfileImg.appendChild(userImg);
  newNote.appendChild(noteProfileImg);

  // Data
  let noteData = document.createElement("div");
  noteData.setAttribute("class", "noteData");

  // Header: names and date
  let noteHeader = document.createElement("div");
  noteHeader.setAttribute("class", "noteHeader");

  let noteAuthor = document.createElement("div");
  noteAuthor.setAttribute("class", "noteAuthor");

  let noteDisplayName = document.createElement("div");
  noteDisplayName.setAttribute("class", "noteDisplayName");
  let displayName = profileData.displayName
    ? profileData.displayName
    : profileData.name;
  let npub = NostrTools.nip19.npubEncode(eventData.pubkey);
  if (profileData.name == null && displayName == null) {
    displayName = start_and_end(npub);
  }
  noteDisplayName.innerHTML =
    '<a href="https://nostrudel.ninja/#/u/' +
    npub +
    '" class="noteAuthorLink" target="_blank">' +
    displayName +
    "</a>";

  let noteNIP05 = document.createElement("div");
  noteNIP05.classList.add("noteNIP05");
  noteNIP05.classList.add("label");
  //profileData.nip05 ? noteNIP05.textContent=profileData.nip05 : noteNIP05.textContent="displayname@domain.com"
  if (profileData.nip05) {
    let noteNIP05String = profileData.nip05.split("@");
    noteNIP05.innerHTML =
      '<a href="https://' +
      noteNIP05String[1] +
      "/.well-known/nostr.json?name=" +
      noteNIP05String[0] +
      '" target="_blank"><span class="material-symbols-outlined">check_circle</span> ' +
      profileData.nip05 +
      "</a>";
  } else {
    noteNIP05.innerHTML =
      '<span class="unverified label"><span class="material-symbols-outlined">block</span> Unverified</span>';
  }

  let noteLNAddress = document.createElement("div");
  noteLNAddress.classList.add("noteLNAddress");
  noteLNAddress.classList.add("label");

  if (profileData.lud16) {
    let noteLNAddressString = profileData.lud16.split("@");
    noteLNAddress.innerHTML =
      '<a href="https://' +
      noteLNAddressString[1] +
      "/.well-known/lnurlp/" +
      noteLNAddressString[0] +
      '" target="_blank"><span class="material-symbols-outlined">bolt</span> ' +
      profileData.lud16 +
      "</a>";
  } else {
    noteLNAddress.textContent = "NOT PAYABLE";
  }

  let noteTimeAgo = timeAgo(eventData.created_at);

  let noteDate = document.createElement("div");
  noteDate.classList.add("noteDate");
  noteDate.classList.add("label");
  noteDate.textContent = noteTimeAgo;

  noteDate.addEventListener("click", () => {
    const nevent = NostrTools.nip19.noteEncode(eventData.id);
    openSinglePubPay(nevent);
  });

  noteAuthor.appendChild(noteDisplayName);
  noteAuthor.appendChild(noteNIP05);
  noteAuthor.appendChild(noteLNAddress);
  noteHeader.appendChild(noteAuthor);
  noteHeader.appendChild(noteDate);
  noteData.appendChild(noteHeader);

  // Content
  let noteContent = document.createElement("div");
  noteContent.setAttribute("class", "noteContent");
  let formatedContent = await formatContent(eventData.content);
  noteContent.innerHTML = formatedContent;
  noteData.appendChild(noteContent);

  // Forward
  let filteredforwardZap = eventData.tags.filter(
    (tag) => tag[0] == "zap-forward"
  );
  if (filteredforwardZap[0] != null) {
    let forwardZap = document.createElement("div");
    forwardZap.setAttribute("class", "forwardZap");
    let forwardZapNoteProfileImg =
      '<div class="noteProfileImg"><img class="userImg" src="https://fuegouae.com/wp-content/uploads/2016/11/sedfwe4rfw4r.jpg"></div>';
    let forwardZapNoteHeader =
      '<div class="noteHeader"><div class="noteAuthor"><div class="noteDisplayName"><a href="https://nostrudel.ninja/#/u/npub1d4m5fqlgzxyvtp0mpes92p3adwr279qaqcqffax8tnhh4z6f7s8qh4t2n4" class="noteAuthorLink" target="_blank">21prestigerelay</a></div><div class="noteNIP05 label">21prestigerelay@vlt.ge</div></div><div class="noteDate label">8 hours ago</div></div>';
    let forwardZapNoteData =
      '<div class="noteContent">GM nostr:<a href="https://nostrudel.ninja/#/u/npub1nmzww9lw5k6nu0pmusyerz0x2cmg99rnssesf2ztd2kvy6s7lqgqjungrg" class="userMention" npub="npub1nmzww9lw5k6nu0pmusyerz0x2cmg99rnssesf2ztd2kvy6s7lqgqjungrg" target="_blank">npub...ngrg</a>. Welcome to our relay 🧡 Entry fee is 21,000 sats</div>';

    let payerProfile =
      '<div class="zapReaction"><a href="https://nostrudel.ninja/#/u/npub1t5atsakzq63h45asjn3qhlpeg80nlgs6zkkgafmddyvywdufv6dqxfahcl" target="_blank"><img class="userImg" src="https://pbs.twimg.com/profile_images/1613844070207471617/VXUvR27o_400x400.jpg"></a><a href="https://nostrudel.ninja/#/n/note14h7zraa3p9syplnj9y3t5gdmswekg9k8ghhn0usv9nvp6hn6dkhqpwpr6x" target="_blank" class="zapReactionAmount">21</a></div>';
    let originZap =
      ' <div class="originZap">' +
      payerProfile +
      '<div class="noteProfileImg"><img class="userImg" src="https://www.plenodelafemp.es/wp-content/uploads/2014/10/speaker-3.jpg"></div></div>';
    forwardZapNoteData +=
      '<div class="noteValues"><div class="zapMin"><span class="zapMinVal">21,000</span> <span class="label">sats</span></div><div class="zap___Uses"><span class="zapUses______Current">0</span> <span class="label">of</span> <span class="zapUsesTotal">1</span></div> </div>' +
      originZap;

    forwardZap.innerHTML =
      '<div class="paynote">' +
      forwardZapNoteProfileImg +
      '<div class="noteData">' +
      forwardZapNoteHeader +
      forwardZapNoteData +
      "</div></div>";
    noteContent.appendChild(forwardZap);
  }

  // Values
  let noteValues = document.createElement("div");
  noteValues.setAttribute("class", "noteValues");

  // INSERT LOGIC FOR AMOUNT, ZAP-MIN, ZAP-MAX, ETC
  let zapMin = document.createElement("div");
  let filteredZapMin = eventData.tags.find((tag) => tag[0] == "zap-min");
  if (filteredZapMin) {
    const zapMinParsed = parseInt(filteredZapMin[1]);
    if (!(Number.isInteger(zapMinParsed) && zapMinParsed > 0)) {
      filteredZapMin[1] = 1000;
    }
    zapMin.setAttribute("class", "zapMin");
    zapMin.innerHTML =
      '<span class="zapMinVal">' +
      (filteredZapMin[1] / 1000).toLocaleString() +
      '</span> <span class="label">sats<br>Min</span>';
    noteValues.appendChild(zapMin);
  }

  let zapMax = document.createElement("div");
  let filteredZapMax = eventData.tags.find((tag) => tag[0] == "zap-max");
  if (filteredZapMax) {
    const zapMaxParsed = parseInt(filteredZapMax[1]);
    if (!(Number.isInteger(zapMaxParsed) && zapMaxParsed > 0)) {
      if (filteredZapMin && filteredZapMin[1])
        filteredZapMax[1] = filteredZapMin[1];
      else filteredZapMax[1] = 100000;
    }
  }

  if (filteredZapMin && filteredZapMax) {
    if (filteredZapMin[1] != filteredZapMax[1]) {
      zapMax.setAttribute("class", "zapMax");
      zapMax.innerHTML =
        '<span class="zapMaxVal">' +
        (filteredZapMax[1] / 1000).toLocaleString() +
        '</span> <span class="label">sats<br>Max</span>';
      noteValues.appendChild(zapMax);
    } else if (filteredZapMin[1] == filteredZapMax[1]) {
      zapMin.innerHTML =
        '<span class="zapMinVal">' +
        (filteredZapMin[1] / 1000).toLocaleString() +
        '</span> <span class="label">sats<br></span>';
    }
  }

  const filteredZapUses = eventData.tags.find((tag) => tag[0] == "zap-uses");
  const zapUses = document.createElement("div");
  zapUses.setAttribute("class", "zapUses");
  filteredZapUses
    ? (zapUses.innerHTML = `<span class='zapUsesCurrent'>0</span> <span class='label'>of</span> <span class='zapUsesTotal'>${filteredZapUses[1]}</span>`)
    : (zapUses.innerHTML = "");
  noteValues.appendChild(zapUses);
  noteData.appendChild(noteValues);

  // Payer
  let filteredZapPayer = eventData.tags.filter((tag) => tag[0] == "zap-payer");
  if (filteredZapPayer[0] != null) {
    let zapPayer = document.createElement("div");
    zapPayer.setAttribute("class", "zapPayer");
    zapPayer.innerHTML =
      'Payer <span class="material-symbols-outlined main-icon">target</span><div class="zapPayerInner"><img class="userImg" src="https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg"><div class="userName">' +
      start_and_end(NostrTools.nip19.npubEncode(filteredZapPayer[0][1])) +
      "</div></div>";
    noteData.appendChild(zapPayer);
  }

  // LNURL
  const filteredZapLNURL = eventData.tags.find((tag) => tag[0] == "zap-lnurl");
  if (filteredZapLNURL) {
    const ludSplit = filteredZapLNURL[1].split("@");
    if (ludSplit.length == 2) {
      const zapLNURL = document.createElement("div");
      zapLNURL.setAttribute("class", "zapPayer");
      zapLNURL.innerHTML = `<div><span class="material-symbols-outlined main-icon">double_arrow</span> Redirect to</div>`;
      zapLNURL.innerHTML +=
        `<a href="https://` +
        ludSplit[1] +
        `/.well-known/lnurlp/` +
        ludSplit[0] +
        `" target=”_blank” class="bold">` +
        filteredZapLNURL[1] +
        `</a>`;
      noteData.appendChild(zapLNURL);
    }
  }

  // Hero Payers
  let noteHeroZaps = document.createElement("div");
  noteHeroZaps.setAttribute("class", "noteHeroZaps");
  noteHeroZaps.classList.add("noteZapReactions");
  noteData.appendChild(noteHeroZaps);

  // Main CTA
  if (
    (filteredZapMax || filteredZapMin) &&
    noteLNAddress.textContent != "NOT PAYABLE"
  ) {
    let noteCTA = document.createElement("div");
    const buttonZap = document.createElement("a");
    noteCTA.appendChild(buttonZap);
    noteCTA.setAttribute("class", "noteCTA");
    buttonZap.setAttribute("class", "noteMainCTA");
    buttonZap.classList.add("cta");
    buttonZap.textContent = "Pay";
    buttonZap.href = "#";
    buttonZap.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const disabled = buttonZap.className.includes("disabled") ? true : false;
      if (disabled) {
        return;
      }
      const publicKey = signIn.getPublicKey();
      if (!publicKey) {
        console.error("No public key found. Please sign in first.");
        const loginForm = document.getElementById("loginForm");
        if (loginForm.style.display == "none") {
          loginForm.style.display = "flex";
        }
        return;
      }
      let rangeValue;
      buttonZap.getAttribute("value") != null
        ? (rangeValue = buttonZap.getAttribute("value"))
        : (rangeValue = -1);
      const { callbackToZap, lud16ToZap } = await zap.getInvoiceCallBack(
        eventData,
        authorData
      );
      console.log(callbackToZap, lud16ToZap);
      if (!callbackToZap) {
        console.log("failed to fetch callback");
        return;
      }
      const { zapEvent, amountPay } = await zap.createZapEvent(
        eventData,
        rangeValue,
        lud16ToZap,
        publicKey
      );
      await zap.signZapEvent(
        zapEvent,
        callbackToZap,
        amountPay,
        lud16ToZap,
        eventData.id,
        false
      );
    });

    if (
      filteredZapMin &&
      filteredZapMax &&
      filteredZapMin[1] != filteredZapMax[1]
    ) {
      let zapSliderContainer = document.createElement("div");
      zapSliderContainer.setAttribute("class", "zapSliderContainer");
      zapSliderContainer.innerHTML =
        '<input type="range" min="' +
        filteredZapMin[1] / 1000 +
        '" max="' +
        filteredZapMax[1] / 1000 +
        '" value="' +
        filteredZapMin[1] / 1000 +
        '" class="zapSlider">';
      noteData.appendChild(zapSliderContainer);

      let zapSlider = zapSliderContainer.querySelector(".zapSlider");

      let zapSliderVal = document.createElement("div");
      zapSliderVal.setAttribute("class", "zapSliderVal");
      zapSliderContainer.appendChild(zapSliderVal);

      let update = (event) => {
        //console.log( (zapSlider.value).toLocaleString() )
        event.preventDefault();
        event.stopPropagation();
        buttonZap.setAttribute("value", parseInt(zapSlider.value));
        zapSliderVal.innerHTML =
          parseInt(zapSlider.value).toLocaleString() +
          '<span class="label"> sats</span>';
      };
      zapSlider.addEventListener("input", (event) => update(event));
      //update(event);
    }

    noteData.appendChild(noteCTA);
  }

  // Actions and Reactions
  let noteActionsReactions = document.createElement("div");
  noteActionsReactions.setAttribute("class", "noteActionsReactions");

  let noteZapReactions = document.createElement("div");
  noteZapReactions.setAttribute("class", "noteZaps");
  noteZapReactions.classList.add("noteZapReactions");

  //let eventDataString = JSON.stringify(eventData).replace(/"/g, '&quot;');

  let noteActions = document.createElement("div");
  noteActions.setAttribute("class", "noteActions");

  let zapBoltIcon = document.createElement("a");
  zapBoltIcon.innerHTML = '<span class="material-symbols-outlined">bolt</span>';
  zapBoltIcon.setAttribute("class", "disabled");
  if (noteLNAddress.textContent != "NOT PAYABLE") {
    zapBoltIcon.setAttribute("class", "noteAction");
    zapBoltIcon.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      zapMenu.style.display =
        zapMenu.style.display === "none" ? "block" : "none";
    });

    // Create the zap menu
    let zapMenu = document.createElement("div");
    zapMenu.setAttribute("class", "zapMenu");
    zapMenu.style.display = "none";
    zapMenu.innerHTML = `
  <div class="zapMenuOption" data-value="21">21 sats</div>
  <div class="zapMenuOption" data-value="420">420 sats</div>
  <div class="zapMenuOption" data-value="10000">1,000 sats</div>
  <div class="zapMenuCustom">
    <input type="number" id="customZapInput" placeholder="sats" min="1"/>
    <button id="customZapButton">Zap</button>
  </div>
`;
    document.addEventListener("click", (event) => {
      if (
        !zapMenu.contains(event.target) &&
        !zapBoltIcon.contains(event.target)
      ) {
        zapMenu.style.display = "none"; // Close the menu
      }
    });
    zapMenu.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const selectedOption = event.target;

      if (selectedOption.classList.contains("zapMenuOption")) {
        const zapValue = selectedOption.getAttribute("data-value");
        console.log(`Selected zap amount: ${zapValue} sats`);
        zap.payNote(eventData, authorData, parseInt(zapValue));
        zapMenu.style.display = "none"; // Hide the menu after selection
      }

      if (selectedOption.id === "customZapButton") {
        const customInput = document.getElementById("customZapInput");
        const customValue = customInput.value;
        if (customValue && !isNaN(customValue)) {
          console.log(`Custom zap amount: ${customValue} sats`);
          zap.payNote(eventData, authorData, parseInt(customValue));
          zapMenu.style.display = "none"; // Hide the menu after selection
        } else {
          alert("Please enter a valid number for the zap amount.");
        }
      }
    });
    zapBoltIcon.style.position = "relative";
    zapBoltIcon.appendChild(zapMenu);
  }
  noteActions.appendChild(zapBoltIcon);
  /*
  let reactionIcon = document.createElement("a");
  reactionIcon.setAttribute("class", "noteAction");
  reactionIcon.classList.add("disabled");
  reactionIcon.innerHTML =
    '<span class="material-symbols-outlined">favorite</span>';
  noteActions.appendChild(reactionIcon);
  */

  let shareIcon = document.createElement("a");
  shareIcon.setAttribute("class", "noteAction");
  shareIcon.innerHTML =
    '<span class="material-symbols-outlined">ios_share</span>';
  noteActions.appendChild(shareIcon);

  shareIcon.addEventListener("click", async () => {
    const noteID = NostrTools.nip19.noteEncode(eventData.id);
    const shareURL = `${window.location.origin}/?note=${noteID}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Check out this PubPay!",
          text: "Here's a PubPay I want to share with you:",
          url: shareURL,
        });
        console.log("Link shared successfully!");
      } catch (error) {
        console.error("Error sharing the link:", error);
      }
    } else {
      // Fallback: Copy the link to the clipboard
      try {
        await navigator.clipboard.writeText(shareURL);
        alert("Link copied to clipboard!");
      } catch (error) {
        console.error("Failed to copy the link:", error);
      }
    }
  });

  let toolTipText = document.createElement("div");
  toolTipText.setAttribute("class", "tooltiptext");

  let newPayForward = document.createElement("a");
  newPayForward.setAttribute("class", "cta");
  newPayForward.classList.add("dropdown-element");
  newPayForward.classList.add("disabled");
  newPayForward.textContent = "New Pay Forward";
  toolTipText.appendChild(newPayForward);

  let payAnonymously = document.createElement("a");
  payAnonymously.setAttribute("class", "cta");
  payAnonymously.classList.add("dropdown-element");
  payAnonymously.textContent = "Pay Anonymously";
  payAnonymously.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    let rangeValue;
    buttonZap.getAttribute("value") != null
      ? (rangeValue = buttonZap.getAttribute("value"))
      : (rangeValue = -1);
    await zap.payNote(eventData, authorData, rangeValue, true);
  });
  toolTipText.appendChild(payAnonymously);

  let viewRaw = document.createElement("div");
  viewRaw.setAttribute("class", "noteAction");
  toolTipText.appendChild(viewRaw);

  let rawHref = document.createElement("a");
  rawHref.setAttribute("class", "toolTipLink");
  rawHref.classList.add("dropdown-element");
  rawHref.href = "#";
  rawHref.innerText = "View Raw";
  rawHref.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    showJSON(eventData);
  });
  toolTipText.appendChild(rawHref);

  let viewOn = document.createElement("div");
  viewOn.setAttribute("class", "noteAction");
  viewOn.innerHTML =
    '<a href="https://nostrudel.ninja/#/n/' +
    NostrTools.nip19.noteEncode(eventData.id) +
    '" class="toolTipLink" target="_blank">View on nostrudel</a>';
  toolTipText.appendChild(viewOn);

  viewOn = document.createElement("div");
  viewOn.setAttribute("class", "noteAction");
  viewOn.innerHTML =
    '<a href="/live?note=' +
    NostrTools.nip19.noteEncode(eventData.id) +
    '" class="toolTipLink" target="_blank">View on live</a>';
  toolTipText.appendChild(viewOn);

  toolTipText.setAttribute("class", "dropdown-content");
  toolTipText.classList.add("dropdown-element");
  toolTipText.setAttribute("id", "dropdown-" + eventData.id);

  let noteAction = document.createElement("div");
  noteAction.setAttribute("class", "noteAction");
  noteAction.classList.add("dropdown");

  let dropDownButton = document.createElement("button");
  dropDownButton.setAttribute("class", "dropbtn");
  dropDownButton.innerHTML =
    '<span class="material-symbols-outlined">more_horiz</span>';

  noteAction.appendChild(dropDownButton);

  noteAction.appendChild(toolTipText);
  dropDownButton.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    hideAllDropDowns();
    setTimeout(function () {
      dropDownButton.nextElementSibling.classList.toggle("show");
    }, 100);
  });

  noteActions.appendChild(noteAction);

  // const rangeValue = buttonZap.getAttribute('value') !== null ? buttonZap.getAttribute('value') : -1;
  // payNote(eventData, authorData, rangeValue, true);';

  noteActionsReactions.appendChild(noteZapReactions);
  noteActionsReactions.appendChild(noteActions);
  noteData.appendChild(noteActionsReactions);

  newNote.appendChild(noteData);
  const main =
    iskind3filter == true
      ? document.querySelector("#following")
      : document.querySelector("#main");
  streamType == "firstStream" || streamType == "loadMore"
    ? main.appendChild(newNote)
    : main.insertBefore(newNote, main.firstChild);
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

export async function formatContent(content) {
  //formatedContent = formatedContent.replace(/(nostr:|@)?((npub|note|nprofile|nevent|nrelay|naddr)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})/gi, '<a href="$1.$2">@CornerStore</a>')
  // render npubs
  let npubMentions = content.match(
    /(nostr:|@)?((npub|nprofile)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})/gi
  );
  if (npubMentions) {
    const replacements = npubMentions.map(async (mention) => {
      const cleanMention = mention.replace("nostr:", "");
      const shortenedMention = await getMentionUserName(cleanMention);
      return {
        mention,
        replacement:
          `<a href="https://nostrudel.ninja/#/u/${cleanMention}" class="userMention" npub="${cleanMention}" target="_blank">` +
          shortenedMention +
          "</a>",
      };
      // render image
      //content = content.replace(/(http(s*):\/\/[\w\\x80-\\xff\#$%&~\/.\-;:=,?@\[\]+]*).(gif|png|jpg|jpeg)/gi, '<img src="$1.$3" />')
    });
    const resolvedReplacements = await Promise.all(replacements);
    resolvedReplacements.forEach(({ mention, replacement }) => {
      content = content.replace(mention, replacement);
    });
  }

  content = content.replace(
    /(https?:\/\/[\w\-\.~:\/?#\[\]@!$&'()*+,;=%]+)\.(gif|png|jpg|jpeg)/gi,
    '<img src="$1.$2" />'
  );
  content = content.replace(/\n/g, "<br />");
  return content;
}

async function getMentionUserName(npub) {
  return new Promise((resolve, reject) => {
    try {
      const decoded = NostrTools.nip19.decode(npub);
      if (decoded.type !== "npub" && decoded.type !== "nprofile") {
        console.error("Invalid npub format");
        return;
      }
      const pubkey =
        decoded.type == "npub" ? decoded.data : decoded.data.pubkey;

      const filter = {
        kinds: [0],
        authors: [pubkey],
      };

      const sub = pool.subscribeMany([...relays], [filter], {
        async onevent(event) {
          try {
            const userMetadata = JSON.parse(event.content);
            let userName = userMetadata.displayName
              ? userMetadata.displayName
              : userMetadata.name;
            if (userName == null) {
              userName = start_and_end(npub);
            }
            resolve(userName);
            sub.close(); // Close the subscription after receiving the event
          } catch (error) {
            console.error("Error parsing user metadata:", error);
          }
        },
        async oneose() {
          console.log(`getMentionUserName() EOS.`);
          sub.close();
        },
        onclosed() {
          console.log(`getMentionUserName() closed.`);
        },
      });
    } catch (error) {
      console.error("Error in getMentionUserName:", error);
      reject(error);
    }
  });
}

function start_and_end(str) {
  if (str.length > 35) {
    return str.substr(0, 4) + "..." + str.substr(str.length - 4, str.length);
  }
  return str;
}

function showJSON(json) {
  const viewJSONelement = document.getElementById("viewJSON");
  if (viewJSONelement) {
    if (
      viewJSONelement.style.display == "none" ||
      viewJSONelement.style.display == ""
    ) {
      viewJSONelement.style.display = "flex";
      const viewJSON = document.getElementById("noteJSON");
      viewJSON.innerHTML = JSON.stringify(json, null, 2);
    }
  }
}
// Close the dropdown if the user clicks outside of it
window.onclick = function (event) {
  if (!event.target.matches(".dropbtn")) {
    hideAllDropDowns();
  }
};

window.addEventListener(
  "touchstart",
  (ev) => {
    if (
      !ev.target.matches(".dropbtn") &&
      !ev.target.matches(".dropdown-element")
    ) {
      hideAllDropDowns();
    }
  },
  false
);

function hideAllDropDowns() {
  var dropdowns = document.getElementsByClassName("dropdown-content");
  var i;
  for (i = 0; i < dropdowns.length; i++) {
    var openDropdown = dropdowns[i];
    //openDropdown.classList.remove('show');
    openDropdown.setAttribute("class", "dropdown-content");
    openDropdown.classList.add("dropdown-element");
  }
}

export function openSinglePubPay(nevent) {
  window.location.href = `/?note=${nevent}`;
}

let drawKind1 = await import("./drawkind1.js")
let drawKind9735 = await import("./drawkind9735.js")


const pool = new NostrTools.SimplePool()
const relays = ['wss://relay.damus.io', 'wss://relay.primal.net','wss://nostr.mutinywallet.com/', 'wss://relay.nostr.band/', 'wss://relay.nostr.nu/']

subscribePubPays()

async function subscribePubPays() {
  let kind1Seen = new Set();
  let kind1List = []
  let firstStream = true
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
          //let first20kind1 = kind1List.splice(0, 4)
          await subscribeKind0sfromKind1s(kind1List, firstStream)
          console.log("subscribePubPays() EOS")
        }
      },
      onclosed() {
        //console.log("Closed")
      }
  })
}

async function subscribeKind0sfromKind1s(kind1List, firstStream = false){
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
    await drawKind1s(kind1List, kind0List, firstStream)
    await subscribeKind9735(kind1List, firstStream)
    sub.close()
  },
  onclosed() {
    console.log("subscribeKind0sfromKind1s() Closed")
  }
})
}

async function drawKind1s(first20kind1, kind0List, firstStream = false){
  for(let kind1 of first20kind1){
    const kind0 = kind0List.find(({ pubkey }) => pubkey === kind1.pubkey);
    if (kind0) {
      drawKind1.plot(kind1, kind0, firstStream);
    }
  }
}

async function subscribeKind9735(kind1List, firstStream = false){
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
  await drawKind9735.plot(json9735List)
}



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
    let viewJSONelement = document.getElementById('viewJSON');
    if (viewJSONelement.style.display == 'flex'){
      viewJSONelement.style.display = 'none';
    }
  })


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

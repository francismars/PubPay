const kind1ID = "fe0ec3975412ad3cfe0c9370600e3ea5ab9fa6c414604ef4a2fd4ee66be0edf8"

const pool = new NostrTools.SimplePool()
const relays = ['wss://relay.damus.io', 'wss://relay.primal.net', 'wss://relay.nostr.band/', 'wss://relay.nostr.nu/']

subscribeKind1()

async function subscribeKind1() {
    let filter = { kinds: [1], ids: [kind1ID]}
    pool.subscribeMany(
        [...relays],
        [filter],
        {
        async onevent(kind1) {
            console.log(kind1)

            document.getElementById("noteContent").innerText = kind1.content;

            await subscribeKind0fromKind1(kind1)
            await subscribeKind9735fromKind1(kind1)
        },
        oneose() {
            console.log("subscribeKind1() EOS")
        },
        onclosed() {
            console.log("subscribeKind1() Closed")
        }
    })
  }

  async function subscribeKind0fromKind1(kind1) {
    let kind0key = kind1.pubkey
    const sub = pool.subscribeMany(
        [...relays],
        [{
            kinds: [0],
            authors: [kind0key]
        }]
    ,{
        onevent(kind0) {

            let authorContent = JSON.parse(kind0.content)
            console.log(authorContent)
            document.getElementById("authorName").innerText = authorContent.name;
            document.getElementById("authorNameProfileImg").src = authorContent.picture;

        },
        oneose() {
            console.log("subscribeKind0sfromKind1s() EOS")
        },
        onclosed() {
            console.log("subscribeKind0sfromKind1s() Closed")
        }
    })
  }

  async function subscribeKind9735fromKind1(kind1) {
    let kind1id = kind1.id

    const zapsContainer = document.getElementById("zaps");

    const sub = pool.subscribeMany(
        [...relays],
        [{
            kinds: [9735],
            "#e": [kind1id]
        }]
    ,{
        onevent(kind9735) {
            console.log(kind9735)

            const zapDiv = document.createElement("div");
            zapDiv.className = "zap";

            const description9735 = JSON.parse(kind9735.tags.find(tag => tag[0] == "description")[1])
            const pubkey9735 = description9735.pubkey

            const bolt119735 = kind9735.tags.find(tag => tag[0] == "bolt11")[1]
            const amount9735 = lightningPayReq.decode(bolt119735).satoshis
            const kind1from9735 = kind9735.tags.find(tag => tag[0] == "e")[1]
            const kind9735id = NostrTools.nip19.noteEncode(kind9735.id)
            let kind0picture
            let kind0npub
            let kind1tags
            /*
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
            */





            zapDiv.innerHTML = `
                <div id="zapper">
                    <img id="zapperProfileImg" src="${kind0picture}" />
                    <div id="zapperName">
                        ${description9735}
                    </div>
                    <div id="zapperAmount">
                        <span id="zapperAmountValue">${amount9735}</span> <span>sats</span>
                    </div>
                </div>
            `;



            zapsContainer.appendChild(zapDiv);



        },
        oneose() {
            console.log("subscribeKind9735fromKind1() EOS")
        },
        onclosed() {
            console.log("subscribeKind9735fromKind1() Closed")
        }
    })
  }

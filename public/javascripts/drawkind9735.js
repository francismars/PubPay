export async function plot(json9735List, iskind3filter){
    for(let json9735 of json9735List){
      const parentDiv = iskind3filter ? document.getElementById("following") : document.getElementById("main")
      let parentNote = parentDiv.querySelector("#_"+json9735.e);

      if(!json9735.picture) json9735.picture = ""
      const profileImage = json9735.picture == "" ? "https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg" : json9735.picture

      let zapPayerLink = '<a href="https://nostrudel.ninja/#/u/'+json9735.npubPayer+'" target="_blank"><img class="userImg" src="'+profileImage+'" /></a>'
      let zapEventLink = '<a href="https://nostrudel.ninja/#/n/'+json9735.zapEventID+'" target="_blank" class="zapReactionAmount">'+json9735.amount.toLocaleString()+'</a>'

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
          console.log("tagZapPayer", tagZapPayer)
          console.log("json9735.pubKey", json9735.pubKey)
          console.log("entras aqui")
          let zapPayer = parentNote.querySelector('.zapPayer')
          zapPayer.innerHTML = '<div class="zapReaction">'+zapPayerLink+zapEventLink+'</div>'
          // Reached target, disable button
          let noteMainCTA = parentNote.querySelector('.noteMainCTA')
          noteMainCTA.classList.add('disabled')
          noteMainCTA.innerHTML = "Paid"
          //noteMainCTA.removeEventListener('click', payNote)
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
              //noteMainCTA.removeEventListener('click', payNote)
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

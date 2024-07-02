export function showJSON(json){
    const viewJSONelement = document.getElementById('viewJSON');
    if(viewJSONelement){
        if(viewJSONelement.style.display == 'none' || viewJSONelement.style.display == ''){
        viewJSONelement.style.display = 'flex'
        const viewJSON = document.getElementById('noteJSON')
        viewJSON.innerHTML = JSON.stringify(json, null, 2)
        }
    }
  }
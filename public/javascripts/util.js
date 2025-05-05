export function showJSON(json) {
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

export async function accessClipboard() {
  return new Promise((resolve) => {
    setTimeout(async () => {
      let clipcopied = await navigator.clipboard.readText();
      //console.log(clipcopied)
      resolve(clipcopied);
    }, 500);
  });
}

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
  if (!navigator.clipboard) {
    alert("Clipboard API is not supported in this browser.");
    return null;
  }
  try {
    const clipcopied = await navigator.clipboard.readText();
    if (!clipcopied) {
      alert("Clipboard is empty.");
      return null;
    }
    return clipcopied;
  } catch (error) {
    alert("Clipboard access failed:" + error);
    return null;
  }
}

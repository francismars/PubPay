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
  console.log("Accessing clipboard...");
  if (!navigator.clipboard) {
    alert("Clipboard API is not supported in this browser.");
    return null;
  }

  try {
    const clipcopied = await navigator.clipboard.readText();
    if (!clipcopied) {
      alert("Clipboard is empty. Please copy some text and try again.");
      return null;
    }
    console.log("Clipboard content:", clipcopied);
    return clipcopied;
  } catch (error) {
    console.error("Failed to access clipboard:", error);
    alert("Clipboard access failed. Please check your browser permissions.");
    return null;
  }
}

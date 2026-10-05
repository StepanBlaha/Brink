import type { NodeView } from "prosemirror-view";

/** The "Uploading image…" placeholder (token `image_upload`): spinner and label, 26 px high. */
export function uploadingChipView(): NodeView {
  const dom = document.createElement("span");
  dom.className = "chip uploading";
  dom.contentEditable = "false";
  dom.dataset["type"] = "image_upload";
  const spin = document.createElement("span");
  spin.className = "spinner";
  spin.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.textContent = "Uploading image…";
  dom.append(spin, label);
  return { dom, update: (n) => n.type.name === "chip" && n.attrs["type"] === "image_upload", ignoreMutation: () => true };
}

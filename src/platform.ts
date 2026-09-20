export const isMac =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
export const primaryKey = isMac ? "⌘" : "Ctrl";
export const zoomGestureHint = isMac ? "⌘ + 滚轮 / 触控板捏合" : "Ctrl + 滚轮";

export function primaryModifier(
  event: { ctrlKey: boolean; metaKey: boolean },
  mac = isMac,
) {
  return mac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
}

export function textInputFocused(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
      target.isContentEditable)
  );
}

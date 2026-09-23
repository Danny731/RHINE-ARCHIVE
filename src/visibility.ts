type Group = {
  observer: IntersectionObserver;
  listeners: Map<Element, (visible: boolean) => void>;
};
const groups = new WeakMap<Element | Document, Group>();
// A 1000-page thumbnail list needs one observer, not 1000 independent observers.
export function observeThumbnail(
  node: Element,
  listener: (visible: boolean) => void,
) {
  const root = node.closest(".sidebar-content");
  const key = root || document;
  let group = groups.get(key);
  if (!group) {
    const listeners = new Map<Element, (visible: boolean) => void>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          listeners.get(entry.target)?.(entry.isIntersecting);
      },
      { root, rootMargin: "200px" },
    );
    group = { listeners, observer };
    groups.set(key, group);
  }
  group.listeners.set(node, listener);
  group.observer.observe(node);
  return () => {
    group.listeners.delete(node);
    group.observer.unobserve(node);
    if (!group.listeners.size) {
      group.observer.disconnect();
      groups.delete(key);
    }
  };
}

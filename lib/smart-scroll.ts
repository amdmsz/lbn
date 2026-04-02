const SMART_SCROLL_TARGET_KEY = "crm-smart-scroll-target";

export function scheduleSmartScroll(targetId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(SMART_SCROLL_TARGET_KEY, targetId);
}

export function consumeSmartScrollTarget(targetId: string) {
  if (typeof window === "undefined") {
    return false;
  }

  const nextTargetId = window.sessionStorage.getItem(SMART_SCROLL_TARGET_KEY);

  if (nextTargetId !== targetId) {
    return false;
  }

  window.sessionStorage.removeItem(SMART_SCROLL_TARGET_KEY);
  return true;
}

export function isElementInViewport(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

  return rect.top < viewportHeight && rect.bottom > 0;
}

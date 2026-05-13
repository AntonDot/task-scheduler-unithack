import { api } from "./client";

export async function getVapidPublicKey(): Promise<string> {
  const data = await api.get<{ public_key: string }>("/push/vapid-public-key");
  return data.public_key;
}

export async function subscribePush(subscription: PushSubscriptionJSON): Promise<void> {
  await api.post("/push/subscribe", subscription);
}

export async function unsubscribePush(): Promise<void> {
  await api.post("/push/unsubscribe", {});
}

export type PushStatus =
  | "checking"
  | "no-https"      // app served over HTTP (push impossible without HTTPS)
  | "unsupported"   // browser / OS does not support Web Push
  | "needs-pwa"     // iOS Safari in browser tab: must be installed to Home Screen
  | "denied"        // user blocked notifications
  | "subscribed"    // active subscription registered on server
  | "unsubscribed"; // supported + permission granted, but not yet subscribed

/**
 * True when running on iOS/iPadOS.
 * iPadOS 13+ reports "Macintosh" in the UA but has touch points > 0.
 */
export function isIOSDevice(): boolean {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ masquerades as desktop Safari
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 0) return true;
  return false;
}

export function isStandaloneMode(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).standalone === true
  );
}

/**
 * Snapshot of raw capability checks — useful for debugging.
 */
export function getPushDiagnostics() {
  return {
    https: location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1",
    hasNotification: "Notification" in window,
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    standalone: isStandaloneMode(),
    ios: isIOSDevice(),
    permission: "Notification" in window ? (Notification.permission as string) : "n/a",
    protocol: location.protocol,
    hostname: location.hostname,
  };
}

/** Detect current push notification status without side effects. */
export async function getPushStatus(): Promise<PushStatus> {
  const d = getPushDiagnostics();

  // Push requires HTTPS (except localhost)
  if (!d.https) return "no-https";

  const ios = d.ios;
  const standalone = d.standalone;

  if (!d.hasNotification || !d.hasServiceWorker || !d.hasPushManager) {
    if (ios && !standalone) return "needs-pwa";
    return "unsupported";
  }

  if (Notification.permission === "denied") return "denied";

  try {
    const reg = await Promise.race<ServiceWorkerRegistration>([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("SW not ready")), 8000)
      ),
    ]);
    const sub = await reg.pushManager.getSubscription();
    return sub ? "subscribed" : "unsubscribed";
  } catch {
    return "unsubscribed";
  }
}

/**
 * Must be called from a user-gesture handler (button click).
 * Requests permission, subscribes, and saves the subscription to the server.
 */
export async function enablePushNotifications(): Promise<PushStatus> {
  try {
    const d = getPushDiagnostics();

    if (!d.https) return "no-https";

    if (!d.hasNotification || !d.hasServiceWorker || !d.hasPushManager) {
      if (d.ios && d.standalone && d.hasNotification) {
        // iOS standalone but PushManager missing: still request permission so
        // the app registers in iOS Settings → Notifications.
        await Notification.requestPermission();
      }
      return "unsupported";
    }

    // Ensure service worker is registered
    let reg: ServiceWorkerRegistration;
    try {
      reg = await Promise.race<ServiceWorkerRegistration>([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("SW timeout")), 8000)
        ),
      ]);
    } catch {
      await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
      reg = await navigator.serviceWorker.ready;
    }

    const permission = await Notification.requestPermission();
    if (permission === "denied") return "denied";
    if (permission !== "granted") return "unsubscribed";

    const vapidKey = await getVapidPublicKey();

    // Convert base64url → Uint8Array
    const raw = atob(vapidKey.replace(/-/g, "+").replace(/_/g, "/"));
    const applicationServerKey = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) applicationServerKey[i] = raw.charCodeAt(i);

    const existing = await reg.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });

    await subscribePush(sub.toJSON());
    return "subscribed";
  } catch (e) {
    console.warn("Push registration failed:", e);
    return "unsubscribed";
  }
}

/** @deprecated use enablePushNotifications() instead */
export async function registerPushNotifications(): Promise<boolean> {
  const status = await enablePushNotifications();
  return status === "subscribed";
}

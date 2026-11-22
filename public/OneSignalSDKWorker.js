/**
 * OneSignal Worker Forwarder
 * Delegates completely to the unified /sw.js Service Worker
 * Ensures both OneSignal and Direct WebPush operate from a single shared worker without duplicate listeners.
 */
importScripts("/sw.js");

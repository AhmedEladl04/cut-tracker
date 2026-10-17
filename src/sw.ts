// Service worker: caches the whole app so it opens with no network (the gym!),
// and focuses the app when a rest-timer notification is tapped.
// It's compiled separately by vite-plugin-pwa; `self.__WB_MANIFEST` is replaced at build
// time with the list of files to pre-cache.
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

// Minimal typings so this file type-checks with the normal DOM lib.
// (The literal text `self.__WB_MANIFEST` must appear for the build step to find it.)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const self: any;
const sw = self;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// The page asks us to activate a new version (after you tap "Update").
sw.addEventListener('message', (e: MessageEvent) => {
  if (e.data?.type === 'SKIP_WAITING') sw.skipWaiting();
});

// Tap on "Rest is over" → bring the app to the front.
sw.addEventListener('notificationclick', (e: any) => {
  e.notification.close();
  e.waitUntil(
    sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list: any[]) => {
      if (list.length) return list[0].focus();
      return sw.clients.openWindow(sw.registration.scope);
    }),
  );
});

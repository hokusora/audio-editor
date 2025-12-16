/*! coi-serviceworker v0.1.6 - Guido Zuidhof, licensed under MIT */
let coepCredentialless = false;
if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

    self.addEventListener("message", (ev) => {
        if (!ev.data) return;
        if (ev.data.type === "deregister") {
            self.registration.unregister().then(() => self.clients.matchAll().then(clients => clients.forEach(client => client.navigate(client.url))));
        } else if (ev.data.type === "coepCredentialless") {
            coepCredentialless = ev.data.value;
        }
    });

    self.addEventListener("fetch", function (event) {
        const r = event.request;
        if (r.cache === "only-if-cached" && r.mode !== "same-origin") return;
        event.respondWith(fetch(r).then((response) => {
            if (response.status === 0) return response;
            const newHeaders = new Headers(response.headers);
            newHeaders.set("Cross-Origin-Embedder-Policy", coepCredentialless ? "credentialless" : "require-corp");
            newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
            return new Response(response.body, { status: response.status, statusText: response.statusText, headers: newHeaders });
        }).catch((e) => console.error(e)));
    });
} else {
    (() => {
        const n = window.navigator;
        if (n.serviceWorker && n.serviceWorker.controller) {
            n.serviceWorker.controller.postMessage({ type: "coepCredentialless", value: false });
        } else {
            n.serviceWorker.register(window.document.currentScript.src).then((r) => {
                r.addEventListener("updatefound", () => window.location.reload());
                if (r.installing) r.installing.addEventListener("statechange", function () {
                    if (this.state === "activated") window.location.reload();
                });
            });
        }
    })();
}
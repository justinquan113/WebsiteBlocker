function extractHostname(rawHash){
    if (!rawHash) return '';
    const candidates = [];
    try { candidates.push(decodeURIComponent(rawHash)); } catch {}
    candidates.push(rawHash);

    for (const candidate of candidates){
        try {
            const u = new URL(candidate);
            if (u.hostname) return u.hostname.replace(/^www\./, '');
        } catch {}
    }
    const m = rawHash.match(/^(?:https?:\/\/|https?%3A%2F%2F)([^\/\?#]+)/i);
    if (m) return decodeURIComponent(m[1]).replace(/^www\./, '');
    return '';
}

(function init(){
    const hostname = extractHostname(location.hash.slice(1));
    if (!hostname) return;

    document.getElementById('site-name').textContent = hostname;
    document.title = `Blocked: ${hostname}`;

    const favicon = document.getElementById('site-favicon');
    const tile = document.getElementById('badge-tile');
    favicon.alt = hostname;
    favicon.addEventListener('load', () => {
        if (favicon.naturalWidth > 0) tile.classList.add('has-favicon');
    });
    favicon.addEventListener('error', () => {
        tile.classList.remove('has-favicon');
    });
    favicon.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`;
})();

export const SITE_ALIASES = {
    'twitter.com': ['x.com'],
    'x.com': ['twitter.com']
};

// Common 2-part public suffixes. Not exhaustive; covers the high-traffic cases
// so e.g. amazon.co.uk → "amazon" instead of "amazon.co".
const TWO_PART_TLDS = new Set([
    'co.uk', 'co.jp', 'co.kr', 'co.in', 'co.nz', 'co.za', 'co.il', 'co.id',
    'com.au', 'com.br', 'com.cn', 'com.mx', 'com.ar', 'com.tr', 'com.sg', 'com.hk',
    'org.uk', 'net.au', 'ac.uk', 'gov.uk', 'ne.jp', 'or.jp'
]);

function stripWww(domain){
    return (domain || '').toLowerCase().replace(/^www\./, '');
}

// Given a domain like "shop.amazon.co.uk", returns the registrable label "amazon".
// Returns '' for inputs without a recognizable TLD.
export function extractBase(domain){
    const clean = stripWww(domain);
    if (!clean || !clean.includes('.')) return '';
    const parts = clean.split('.');
    if (parts.length < 2) return '';

    let tldParts = 1;
    if (parts.length >= 3 && TWO_PART_TLDS.has(parts.slice(-2).join('.'))){
        tldParts = 2;
    }
    const withoutTld = parts.slice(0, -tldParts);
    if (withoutTld.length === 0) return '';
    return withoutTld[withoutTld.length - 1];
}

// True when two list entries / hostnames refer to the same brand,
// across www., subdomains, TLD variants, and alias mappings.
export function siteMatches(a, b){
    if (!a || !b) return false;
    const ca = stripWww(a);
    const cb = stripWww(b);
    if (ca === cb) return true;

    const aliasesA = SITE_ALIASES[ca] || [];
    if (aliasesA.includes(cb)) return true;
    const aliasesB = SITE_ALIASES[cb] || [];
    if (aliasesB.includes(ca)) return true;

    const baseA = extractBase(ca);
    const baseB = extractBase(cb);
    return baseA.length >= 2 && baseA === baseB;
}

function escapeRegex(s){
    return s.replace(/[.+?^${}()|[\]\\*]/g, '\\$&');
}

// Returns a declarativeNetRequest regexFilter that matches any URL whose
// hostname starts with `(subdomain.)*<base>.<tld>`. Captures the full URL via
// trailing `.*` so the redirect's `\0` substitution keeps the original target.
export function buildHostRegexFilter(site){
    const base = extractBase(site);
    const clean = stripWww(site);
    if (!base){
        return `.*${escapeRegex(clean || site)}.*`;
    }
    const escapedBase = escapeRegex(base);
    return `^https?://(?:[a-z0-9-]+\\.)*${escapedBase}\\.[a-z]{2,}.*`;
}

// True when a full URL's hostname maps to the same brand as `site`.
export function urlMatchesSite(url, site){
    if (!url || !site) return false;
    try {
        const u = new URL(url);
        return siteMatches(u.hostname, site);
    } catch {
        return false;
    }
}

export function expandAliases(sites){
    const out = new Set();
    for (const s of sites){
        out.add(s);
        for (const alias of SITE_ALIASES[s] || []){
            out.add(alias);
        }
    }
    return [...out];
}

export function timeToMinutes(t){
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

export function isScheduleActive(schedule, now = new Date()){
    if (!schedule || !schedule.enabled) return false;
    if (!schedule.days || schedule.days.length === 0) return false;

    const startMins = timeToMinutes(schedule.startTime);
    const endMins = timeToMinutes(schedule.endTime);
    const mins = now.getHours() * 60 + now.getMinutes();
    const today = now.getDay();
    const yesterday = (today + 6) % 7;

    if (startMins < endMins){
        return schedule.days.includes(today) && mins >= startMins && mins < endMins;
    }
    if (startMins > endMins){
        if (schedule.days.includes(today) && mins >= startMins) return true;
        if (schedule.days.includes(yesterday) && mins < endMins) return true;
        return false;
    }
    return false;
}

export function computeEnforcementState({ timerState, schedule, now = new Date() } = {}){
    if (timerState && timerState.isRunning){
        return { enforceAlways: !!timerState.focusBool, enforceScheduled: !!timerState.focusBool };
    }
    return { enforceAlways: true, enforceScheduled: isScheduleActive(schedule, now) };
}

export function siteIsBlocked({ site, blockedWebsites = [], scheduledWebsites = [], schedule, timerState, now = new Date() } = {}){
    if (!site) return false;
    const { enforceAlways, enforceScheduled } = computeEnforcementState({ timerState, schedule, now });
    if (enforceAlways && blockedWebsites.some(entry => siteMatches(entry, site))) return true;
    if (enforceScheduled && scheduledWebsites.some(entry => siteMatches(entry, site))) return true;
    return false;
}

export function normalizeDomain(input){
    if (typeof input !== 'string') return '';
    let s = input.trim().toLowerCase();
    s = s.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return s;
}

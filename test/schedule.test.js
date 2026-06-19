import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    SITE_ALIASES,
    expandAliases,
    timeToMinutes,
    isScheduleActive,
    computeEnforcementState,
    siteIsBlocked,
    normalizeDomain,
    extractBase,
    siteMatches,
    urlMatchesSite,
    buildHostRegexFilter
} from '../lib/schedule.js';

// Days: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
const WEEKDAYS = [1, 2, 3, 4, 5];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// Helper to build a Date at a specific weekday + HH:MM. Anchor on 2026-06-15 (a Monday).
function atMon(hours, minutes = 0){
    const d = new Date(2026, 5, 15, hours, minutes, 0, 0); // Monday
    assert.equal(d.getDay(), 1, 'anchor must be Monday');
    return d;
}
function atSat(hours, minutes = 0){
    const d = new Date(2026, 5, 20, hours, minutes, 0, 0); // Saturday
    assert.equal(d.getDay(), 6, 'anchor must be Saturday');
    return d;
}
function atSun(hours, minutes = 0){
    const d = new Date(2026, 5, 21, hours, minutes, 0, 0); // Sunday
    assert.equal(d.getDay(), 0, 'anchor must be Sunday');
    return d;
}

describe('timeToMinutes', () => {
    it('converts midnight to 0', () => {
        assert.equal(timeToMinutes('00:00'), 0);
    });
    it('converts noon to 720', () => {
        assert.equal(timeToMinutes('12:00'), 720);
    });
    it('converts 12:30 to 750', () => {
        assert.equal(timeToMinutes('12:30'), 750);
    });
    it('converts 23:59 to 1439', () => {
        assert.equal(timeToMinutes('23:59'), 1439);
    });
});

describe('expandAliases', () => {
    it('returns same single-element list when no alias exists', () => {
        assert.deepEqual(expandAliases(['google.com']).sort(), ['google.com']);
    });
    it('expands twitter.com to include x.com', () => {
        assert.deepEqual(expandAliases(['twitter.com']).sort(), ['twitter.com', 'x.com']);
    });
    it('expands x.com to include twitter.com', () => {
        assert.deepEqual(expandAliases(['x.com']).sort(), ['twitter.com', 'x.com']);
    });
    it('dedupes when both aliases are passed in', () => {
        const out = expandAliases(['twitter.com', 'x.com']).sort();
        assert.deepEqual(out, ['twitter.com', 'x.com']);
    });
    it('returns empty for empty input', () => {
        assert.deepEqual(expandAliases([]), []);
    });
    it('keeps unrelated sites alongside aliased pair', () => {
        const out = expandAliases(['twitter.com', 'reddit.com']).sort();
        assert.deepEqual(out, ['reddit.com', 'twitter.com', 'x.com']);
    });
    it('SITE_ALIASES is bidirectional', () => {
        assert.deepEqual(SITE_ALIASES['twitter.com'], ['x.com']);
        assert.deepEqual(SITE_ALIASES['x.com'], ['twitter.com']);
    });
});

describe('isScheduleActive', () => {
    const weekdaySchedule = { enabled: true, days: WEEKDAYS, startTime: '09:00', endTime: '17:00' };

    it('returns false when schedule is null', () => {
        assert.equal(isScheduleActive(null, atMon(10)), false);
    });
    it('returns false when schedule is undefined', () => {
        assert.equal(isScheduleActive(undefined, atMon(10)), false);
    });
    it('returns false when schedule.enabled is false', () => {
        assert.equal(isScheduleActive({ ...weekdaySchedule, enabled: false }, atMon(10)), false);
    });
    it('returns false when days array is empty', () => {
        assert.equal(isScheduleActive({ ...weekdaySchedule, days: [] }, atMon(10)), false);
    });
    it('returns false when days is missing', () => {
        assert.equal(isScheduleActive({ enabled: true, startTime: '09:00', endTime: '17:00' }, atMon(10)), false);
    });
    it('returns true Mon at 10:00 when 9-17 weekdays', () => {
        assert.equal(isScheduleActive(weekdaySchedule, atMon(10)), true);
    });
    it('returns false Mon at 08:59 when 9-17 weekdays', () => {
        assert.equal(isScheduleActive(weekdaySchedule, atMon(8, 59)), false);
    });
    it('returns false Mon at 17:00 sharp (exclusive end)', () => {
        assert.equal(isScheduleActive(weekdaySchedule, atMon(17, 0)), false);
    });
    it('returns true Mon at 16:59', () => {
        assert.equal(isScheduleActive(weekdaySchedule, atMon(16, 59)), true);
    });
    it('returns true Mon at 09:00 sharp (inclusive start)', () => {
        assert.equal(isScheduleActive(weekdaySchedule, atMon(9, 0)), true);
    });
    it('returns false Saturday during window (not a scheduled day)', () => {
        assert.equal(isScheduleActive(weekdaySchedule, atSat(10)), false);
    });
    it('returns false Sunday during window', () => {
        assert.equal(isScheduleActive(weekdaySchedule, atSun(10)), false);
    });

    describe('overnight window (22:00 - 06:00)', () => {
        const overnight = { enabled: true, days: WEEKDAYS, startTime: '22:00', endTime: '06:00' };

        it('Monday 23:00: in window (scheduled today, after start)', () => {
            assert.equal(isScheduleActive(overnight, atMon(23)), true);
        });
        it('Monday 03:00: in window if Sunday was scheduled — but Sunday is NOT scheduled', () => {
            // Anchor: 2026-06-15 Mon 03:00 — yesterday was Sunday (not in WEEKDAYS)
            assert.equal(isScheduleActive(overnight, atMon(3)), false);
        });
        it('Tuesday 03:00: in window because Monday was scheduled', () => {
            const tue3 = new Date(2026, 5, 16, 3, 0); // Tuesday
            assert.equal(tue3.getDay(), 2);
            assert.equal(isScheduleActive(overnight, tue3), true);
        });
        it('Tuesday 06:00 sharp: out of window (exclusive end)', () => {
            const tue6 = new Date(2026, 5, 16, 6, 0);
            assert.equal(isScheduleActive(overnight, tue6), false);
        });
        it('Saturday 23:00: out (Saturday not scheduled)', () => {
            assert.equal(isScheduleActive(overnight, atSat(23)), false);
        });
        it('Saturday 03:00: in (Friday was scheduled, and we are before 06:00)', () => {
            assert.equal(isScheduleActive(overnight, atSat(3)), true);
        });
    });

    it('returns false when start equals end', () => {
        const sched = { enabled: true, days: ALL_DAYS, startTime: '10:00', endTime: '10:00' };
        assert.equal(isScheduleActive(sched, atMon(10)), false);
    });
});

describe('computeEnforcementState', () => {
    const activeSched = { enabled: true, days: ALL_DAYS, startTime: '00:00', endTime: '23:59' };
    const inactiveSched = { enabled: false, days: ALL_DAYS, startTime: '00:00', endTime: '23:59' };

    it('no timer, no schedule: enforce always only', () => {
        assert.deepEqual(
            computeEnforcementState({ now: atMon(10) }),
            { enforceAlways: true, enforceScheduled: false }
        );
    });
    it('no timer, schedule disabled: enforce always only', () => {
        assert.deepEqual(
            computeEnforcementState({ schedule: inactiveSched, now: atMon(10) }),
            { enforceAlways: true, enforceScheduled: false }
        );
    });
    it('no timer, schedule active: enforce both', () => {
        assert.deepEqual(
            computeEnforcementState({ schedule: activeSched, now: atMon(10) }),
            { enforceAlways: true, enforceScheduled: true }
        );
    });
    it('focus timer running: enforce both regardless of schedule', () => {
        assert.deepEqual(
            computeEnforcementState({
                timerState: { isRunning: true, focusBool: true },
                schedule: inactiveSched,
                now: atMon(10)
            }),
            { enforceAlways: true, enforceScheduled: true }
        );
    });
    it('break timer running: enforce nothing', () => {
        assert.deepEqual(
            computeEnforcementState({
                timerState: { isRunning: true, focusBool: false },
                schedule: activeSched,
                now: atMon(10)
            }),
            { enforceAlways: false, enforceScheduled: false }
        );
    });
    it('timer in storage but not running: schedule decides', () => {
        assert.deepEqual(
            computeEnforcementState({
                timerState: { isRunning: false, focusBool: true },
                schedule: activeSched,
                now: atMon(10)
            }),
            { enforceAlways: true, enforceScheduled: true }
        );
    });
});

describe('siteIsBlocked', () => {
    const blocked = ['reddit.com'];
    const scheduled = ['youtube.com'];
    const activeSched = { enabled: true, days: ALL_DAYS, startTime: '00:00', endTime: '23:59' };
    const inactiveSched = { enabled: true, days: ALL_DAYS, startTime: '09:00', endTime: '17:00' };
    const evening = atMon(20);
    const morning = atMon(10);

    it('returns false for empty site', () => {
        assert.equal(siteIsBlocked({ site: '', blockedWebsites: blocked }), false);
    });
    it('always-listed site is blocked when no timer + no schedule', () => {
        assert.equal(
            siteIsBlocked({ site: 'reddit.com', blockedWebsites: blocked, now: morning }),
            true
        );
    });
    it('always-listed site is blocked when no timer + schedule inactive', () => {
        assert.equal(
            siteIsBlocked({
                site: 'reddit.com',
                blockedWebsites: blocked,
                schedule: inactiveSched,
                now: evening
            }),
            true
        );
    });
    it('scheduled-listed site is NOT blocked when schedule inactive', () => {
        assert.equal(
            siteIsBlocked({
                site: 'youtube.com',
                scheduledWebsites: scheduled,
                schedule: inactiveSched,
                now: evening
            }),
            false
        );
    });
    it('scheduled-listed site IS blocked when schedule active', () => {
        assert.equal(
            siteIsBlocked({
                site: 'youtube.com',
                scheduledWebsites: scheduled,
                schedule: inactiveSched,
                now: morning
            }),
            true
        );
    });
    it('scheduled-listed site is blocked during focus timer regardless of schedule', () => {
        assert.equal(
            siteIsBlocked({
                site: 'youtube.com',
                scheduledWebsites: scheduled,
                schedule: inactiveSched,
                timerState: { isRunning: true, focusBool: true },
                now: evening
            }),
            true
        );
    });
    it('always-listed site is NOT blocked during break timer', () => {
        assert.equal(
            siteIsBlocked({
                site: 'reddit.com',
                blockedWebsites: blocked,
                timerState: { isRunning: true, focusBool: false },
                now: morning
            }),
            false
        );
    });
    it('scheduled-listed site is NOT blocked during break timer', () => {
        assert.equal(
            siteIsBlocked({
                site: 'youtube.com',
                scheduledWebsites: scheduled,
                schedule: { enabled: true, days: ALL_DAYS, startTime: '00:00', endTime: '23:59' },
                timerState: { isRunning: true, focusBool: false },
                now: morning
            }),
            false
        );
    });
    it('site not in any list returns false', () => {
        assert.equal(
            siteIsBlocked({
                site: 'github.com',
                blockedWebsites: blocked,
                scheduledWebsites: scheduled,
                schedule: activeSched,
                now: morning
            }),
            false
        );
    });
});

describe('extractBase', () => {
    it('strips com TLD', () => {
        assert.equal(extractBase('amazon.com'), 'amazon');
    });
    it('strips ca TLD', () => {
        assert.equal(extractBase('amazon.ca'), 'amazon');
    });
    it('handles 2-part TLD co.uk', () => {
        assert.equal(extractBase('amazon.co.uk'), 'amazon');
    });
    it('handles 2-part TLD com.au', () => {
        assert.equal(extractBase('shop.com.au'), 'shop');
    });
    it('strips www.', () => {
        assert.equal(extractBase('www.amazon.com'), 'amazon');
    });
    it('strips subdomains: shop.amazon.com → amazon', () => {
        assert.equal(extractBase('shop.amazon.com'), 'amazon');
    });
    it('strips subdomains across 2-part TLD: shop.amazon.co.uk → amazon', () => {
        assert.equal(extractBase('shop.amazon.co.uk'), 'amazon');
    });
    it('returns rightmost label: news.ycombinator.com → ycombinator', () => {
        assert.equal(extractBase('news.ycombinator.com'), 'ycombinator');
    });
    it('returns empty for input without dot', () => {
        assert.equal(extractBase('localhost'), '');
    });
    it('returns empty for empty string', () => {
        assert.equal(extractBase(''), '');
    });
    it('lowercases input', () => {
        assert.equal(extractBase('Amazon.COM'), 'amazon');
    });
});

describe('siteMatches', () => {
    it('matches identical entries', () => {
        assert.equal(siteMatches('amazon.com', 'amazon.com'), true);
    });
    it('matches across TLD variants', () => {
        assert.equal(siteMatches('amazon.com', 'amazon.ca'), true);
        assert.equal(siteMatches('amazon.com', 'amazon.co.uk'), true);
    });
    it('matches www prefix variants', () => {
        assert.equal(siteMatches('www.amazon.com', 'amazon.ca'), true);
        assert.equal(siteMatches('amazon.com', 'www.amazon.ca'), true);
    });
    it('matches subdomain to root domain', () => {
        assert.equal(siteMatches('shop.amazon.com', 'amazon.com'), true);
        assert.equal(siteMatches('amazon.com', 'shop.amazon.ca'), true);
    });
    it('matches via SITE_ALIASES', () => {
        assert.equal(siteMatches('twitter.com', 'x.com'), true);
        assert.equal(siteMatches('x.com', 'twitter.com'), true);
    });
    it('does not match similar but distinct brands', () => {
        assert.equal(siteMatches('amazon.com', 'amazonia.com'), false);
        assert.equal(siteMatches('amazon.com', 'amazon-store.com'), false);
    });
    it('does not match unrelated sites', () => {
        assert.equal(siteMatches('reddit.com', 'amazon.com'), false);
    });
    it('returns false for empty input', () => {
        assert.equal(siteMatches('', 'amazon.com'), false);
        assert.equal(siteMatches('amazon.com', ''), false);
    });
});

describe('urlMatchesSite', () => {
    it('matches http URL on same base', () => {
        assert.equal(urlMatchesSite('http://amazon.ca/path', 'amazon.com'), true);
    });
    it('matches https URL on same base', () => {
        assert.equal(urlMatchesSite('https://www.amazon.com/', 'amazon.com'), true);
    });
    it('matches subdomain', () => {
        assert.equal(urlMatchesSite('https://shop.amazon.com/x', 'amazon.com'), true);
    });
    it('matches 2-part TLD', () => {
        assert.equal(urlMatchesSite('https://amazon.co.uk', 'amazon.com'), true);
    });
    it('does not match unrelated host', () => {
        assert.equal(urlMatchesSite('https://reddit.com', 'amazon.com'), false);
    });
    it('does not match when site name is only in the path', () => {
        assert.equal(urlMatchesSite('https://example.com/amazon.com/foo', 'amazon.com'), false);
    });
    it('does not match similar-but-distinct hostname', () => {
        assert.equal(urlMatchesSite('https://amazonia.com', 'amazon.com'), false);
        assert.equal(urlMatchesSite('https://xamazon.com', 'amazon.com'), false);
    });
    it('returns false for invalid URL', () => {
        assert.equal(urlMatchesSite('not a url', 'amazon.com'), false);
    });
});

describe('buildHostRegexFilter', () => {
    it('generates regex that matches base.tld variants', () => {
        const re = new RegExp(buildHostRegexFilter('amazon.com'));
        assert.equal(re.test('https://amazon.com'), true);
        assert.equal(re.test('https://amazon.com/'), true);
        assert.equal(re.test('https://amazon.ca/products'), true);
        assert.equal(re.test('https://www.amazon.co.uk'), true);
        assert.equal(re.test('https://shop.amazon.com/x'), true);
        assert.equal(re.test('http://amazon.ca'), true);
    });
    it('regex rejects non-hostname matches', () => {
        const re = new RegExp(buildHostRegexFilter('amazon.com'));
        assert.equal(re.test('https://example.com/amazon.com/path'), false);
        assert.equal(re.test('https://amazonia.com'), false);
        assert.equal(re.test('https://xamazon.com'), false);
    });
    it('regex requires http/https', () => {
        const re = new RegExp(buildHostRegexFilter('amazon.com'));
        assert.equal(re.test('ftp://amazon.com'), false);
        assert.equal(re.test('file:///amazon.com'), false);
    });
    it('captures the entire URL so the redirect substitution preserves path', () => {
        const re = new RegExp(buildHostRegexFilter('amazon.com'));
        const m = 'https://amazon.ca/products/x?ref=y'.match(re);
        assert.ok(m);
        assert.equal(m[0], 'https://amazon.ca/products/x?ref=y');
    });
});

describe('siteIsBlocked with TLD-agnostic matching', () => {
    it('amazon.ca is blocked when amazon.com is in always list', () => {
        assert.equal(
            siteIsBlocked({
                site: 'amazon.ca',
                blockedWebsites: ['amazon.com']
            }),
            true
        );
    });
    it('subdomain matches root entry', () => {
        assert.equal(
            siteIsBlocked({
                site: 'shop.amazon.com',
                blockedWebsites: ['amazon.com']
            }),
            true
        );
    });
    it('amazon.co.uk is blocked when amazon.com is in scheduled list during window', () => {
        assert.equal(
            siteIsBlocked({
                site: 'amazon.co.uk',
                scheduledWebsites: ['amazon.com'],
                schedule: { enabled: true, days: [0,1,2,3,4,5,6], startTime: '00:00', endTime: '23:59' },
                now: new Date(2026, 5, 15, 10, 0)
            }),
            true
        );
    });
    it('amazonia.com is NOT blocked when amazon.com is in list', () => {
        assert.equal(
            siteIsBlocked({
                site: 'amazonia.com',
                blockedWebsites: ['amazon.com']
            }),
            false
        );
    });
});

describe('normalizeDomain', () => {
    it('strips https://', () => {
        assert.equal(normalizeDomain('https://google.com'), 'google.com');
    });
    it('strips http://', () => {
        assert.equal(normalizeDomain('http://example.com'), 'example.com');
    });
    it('strips trailing path', () => {
        assert.equal(normalizeDomain('github.com/foo/bar'), 'github.com');
    });
    it('strips path with leading slash from full URL', () => {
        assert.equal(normalizeDomain('https://www.reddit.com/r/programming'), 'www.reddit.com');
    });
    it('lowercases', () => {
        assert.equal(normalizeDomain('Example.COM'), 'example.com');
    });
    it('trims whitespace', () => {
        assert.equal(normalizeDomain('   reddit.com   '), 'reddit.com');
    });
    it('returns empty string for non-string input', () => {
        assert.equal(normalizeDomain(null), '');
        assert.equal(normalizeDomain(undefined), '');
        assert.equal(normalizeDomain(42), '');
    });
    it('leaves bare domain untouched', () => {
        assert.equal(normalizeDomain('news.ycombinator.com'), 'news.ycombinator.com');
    });
});

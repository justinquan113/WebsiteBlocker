
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["blockedWebsites"]).then(result => {
    if (!result.blockedWebsites) {
      chrome.storage.local.set({ blockedWebsites: [] });
    }
  });
});

const SITE_ALIASES = {
    'twitter.com': ['x.com'],
    'x.com': ['twitter.com']
};

function expandAliases(sites){
    const out = new Set();
    for (const s of sites){
        out.add(s);
        for (const alias of SITE_ALIASES[s] || []){
            out.add(alias);
        }
    }
    return [...out];
}

let updateRulesQueue = Promise.resolve();

function timeToMinutes(t){
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

function isScheduleActive(schedule, now = new Date()){
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

function activeTimerState(stored){
    if (timerState && timerState.isRunning) return timerState;
    if (stored && stored.timerState && stored.timerState.isRunning) return stored.timerState;
    return null;
}

async function getEnforcementState(){
    const stored = await chrome.storage.local.get(["timerState", "schedule"]);
    const ts = activeTimerState(stored);

    if (ts){
        // During a focus session, enforce everything. During a break, both lists are cleared in storage.
        return { enforceAlways: ts.focusBool, enforceScheduled: ts.focusBool };
    }
    const scheduled = isScheduleActive(stored.schedule);
    return { enforceAlways: true, enforceScheduled: scheduled };
}

function updateRules(){
    const next = updateRulesQueue.then(async () => {
        const { blockedWebsites = [], scheduledWebsites = [] } = await chrome.storage.local.get(["blockedWebsites", "scheduledWebsites"]);
        const blockedPageUrl = chrome.runtime.getURL("blocked.html");

        const { enforceAlways, enforceScheduled } = await getEnforcementState();
        const effectiveSites = [
            ...(enforceAlways ? blockedWebsites : []),
            ...(enforceScheduled ? scheduledWebsites : [])
        ];

        const rules = expandAliases(effectiveSites).map((site, index) => {
            const escapedSite = site.replace(/[.+?^${}()|[\]\\*]/g, '\\$&');
            return {
                id: index + 1,
                priority: 1,
                action: {
                    type: "redirect",
                    redirect: {
                        regexSubstitution: `${blockedPageUrl}#\\0`
                    }
                },
                condition: {
                    regexFilter: `.*${escapedSite}.*`,
                    resourceTypes: ["main_frame"]
                }
            };
        });

        const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
        const oldRulesIds = oldRules.map(rule => rule.id);
        await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: rules,
            removeRuleIds: oldRulesIds
        });
    }).catch(e => console.error("updateRules error", e));

    updateRulesQueue = next;
    return next;
}

async function reblockActiveTabs(){
    const { blockedWebsites = [], scheduledWebsites = [] } = await chrome.storage.local.get(["blockedWebsites", "scheduledWebsites"]);
    const { enforceAlways, enforceScheduled } = await getEnforcementState();
    const effective = [
        ...(enforceAlways ? blockedWebsites : []),
        ...(enforceScheduled ? scheduledWebsites : [])
    ];
    const allBlocked = expandAliases(effective);
    if (allBlocked.length === 0) return;

    const blockedPageUrl = chrome.runtime.getURL("blocked.html");
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs){
        if (!tab.url) continue;
        if (!/^https?:\/\//.test(tab.url)) continue;
        if (allBlocked.some(site => tab.url.includes(site))){
            chrome.tabs.update(tab.id, {url: blockedPageUrl + "#" + tab.url});
        }
    }
}

async function restoreBlockedTabs(){
    const blockedPagePrefix = chrome.runtime.getURL("blocked.html");
    const { blockedWebsites = [], scheduledWebsites = [] } = await chrome.storage.local.get(["blockedWebsites", "scheduledWebsites"]);
    const { enforceAlways, enforceScheduled } = await getEnforcementState();
    const stillBlocked = expandAliases([
        ...(enforceAlways ? blockedWebsites : []),
        ...(enforceScheduled ? scheduledWebsites : [])
    ]);

    const tabs = await chrome.tabs.query({});
    for (const tab of tabs){
        if (!tab.url || !tab.url.startsWith(blockedPagePrefix)) continue;
        const hashIndex = tab.url.indexOf('#');
        if (hashIndex === -1) continue;
        const originalUrl = tab.url.slice(hashIndex + 1);
        if (!originalUrl) continue;
        if (stillBlocked.some(site => originalUrl.includes(site))) continue;
        chrome.tabs.update(tab.id, {url: originalUrl});
    }
}

async function unblockAndNavigate(site, originalUrl){
    const stored = await chrome.storage.local.get(["blockedWebsites", "scheduledWebsites"]);
    const matchesSite = (s) => {
        const variants = [s, ...(SITE_ALIASES[s] || [])];
        return variants.some(v => site.includes(v));
    };
    const blockedWebsites = (stored.blockedWebsites || []).filter(s => !matchesSite(s));
    const scheduledWebsites = (stored.scheduledWebsites || []).filter(s => !matchesSite(s));
    await chrome.storage.local.set({blockedWebsites, scheduledWebsites});
    await updateRules();

    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (tab && tab.id){
        if (originalUrl){
            chrome.tabs.update(tab.id, {url: originalUrl});
        } else {
            chrome.tabs.reload(tab.id);
        }
    }
}

let timerState = {
    futureTime: null,
    focusBool: true,
    currentFocusVal: 0,
    currentBreakVal: 0,
    currentCycleVal: 0,
    currentSetTime: 0,
    isRunning: false,
    paused: false,
    pausedRemainingTime: 0
};

const ALARM_NAME = 'pomodoroTimer';
const CHECK_ALARM = 'checkTimer';
const SCHEDULE_CHECK_ALARM = 'scheduleCheck';

async function applyScheduleTransition({ force = false } = {}){
    const state = await getEnforcementState();
    const key = `${state.enforceAlways}|${state.enforceScheduled}`;
    if (!force){
        const { lastEnforced } = await chrome.storage.local.get("lastEnforced");
        if (lastEnforced === key) return;
    }

    await chrome.storage.local.set({ lastEnforced: key });
    await updateRules();
    if (!state.enforceScheduled){
        // Anything previously redirected because of a scheduled-only site should be released.
        await restoreBlockedTabs();
    }
    if (state.enforceScheduled || state.enforceAlways){
        await reblockActiveTabs();
    }
}

chrome.alarms.create(SCHEDULE_CHECK_ALARM, { periodInMinutes: 1, when: Date.now() + 1000 });



// Load state from storage on startup
chrome.storage.local.get(['timerState'], (result) => {
    if (result.timerState) {
        timerState = result.timerState;
        if (timerState.isRunning && !timerState.paused) {
            checkTimer();
        }
    }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startTimer') {
        startTimer(request.focusVal, request.breakVal, request.cycleVal, request.focusBool);
        sendResponse({ success: true });
    } else if (request.action === 'pauseTimer') {
        pauseTimer();
        sendResponse({ success: true });
    } else if (request.action === 'resumeTimer') {
        resumeTimer();
        sendResponse({ success: true });
    } else if (request.action === 'getTimerState') {
        const now = Date.now();
        const remainingTime = timerState.paused 
            ? timerState.pausedRemainingTime 
            : Math.max(0, timerState.futureTime - now);
        
        sendResponse({ 
            timerState: {
                ...timerState,
                remainingTime: remainingTime
            }
        });
    } else if (request.action === 'stopTimer') {
        stopTimer();
        sendResponse({ success: true });
    } else if (request.action === 'unblockAndNavigate') {
        unblockAndNavigate(request.site, request.url).then(() => {
            sendResponse({ success: true });
        });
        return true;
    } else if (request.action === 'syncEnforcement') {
        applyScheduleTransition({ force: true }).then(() => {
            sendResponse({ success: true });
        });
        return true;
    }
    return true;
});

function startTimer(focusVal, breakVal, cycleVal, focusBool, timeOverride = null) {
    if (cycleVal == 0){
      return
    }

    const time = focusBool ? focusVal : breakVal;
    const timer = time * 60 * 1000;
    const duration = timeOverride ?? timer;
    
    timerState = {
        futureTime: Date.now() + duration,
        focusBool: focusBool,
        currentFocusVal: focusVal,
        currentBreakVal: breakVal,
        currentCycleVal: cycleVal,
        currentSetTime:  timeOverride ? timerState.currentSetTime : timer,
        isRunning: true,
        paused: false,
        pausedRemainingTime: 0
    };

    saveTimerState();

    if (timeOverride === null){
        if(focusBool){
            // Restore both lists if break-mode previously cleared them.
            chrome.storage.local.get(["blockedBackup", "scheduledBackup"]).then(async (result) => {
                const blockedBackup = result.blockedBackup || []
                const scheduledBackup = result.scheduledBackup || []
                const updates = {}
                if (blockedBackup.length > 0){
                    updates.blockedWebsites = blockedBackup
                    updates.blockedBackup = []
                }
                if (scheduledBackup.length > 0){
                    updates.scheduledWebsites = scheduledBackup
                    updates.scheduledBackup = []
                }
                if (Object.keys(updates).length > 0){
                    await chrome.storage.local.set(updates)
                }
                await updateRules()
                reblockActiveTabs()
            })
        }
        else{
            // Back up both lists, then clear them for break
            chrome.storage.local.get(["blockedWebsites", "scheduledWebsites"]).then(async (result) => {
                const blocked = result.blockedWebsites || []
                const scheduled = result.scheduledWebsites || []
                await chrome.storage.local.set({
                    blockedBackup: blocked,
                    scheduledBackup: scheduled,
                    blockedWebsites: [],
                    scheduledWebsites: []
                })
                await updateRules()
                restoreBlockedTabs()
            })
        }
    }
    
    // Create alarm for when timer ends
    chrome.alarms.create(ALARM_NAME, { when: timerState.futureTime });
    
    // Also create periodic check alarm (every second)
   
   
}

function pauseTimer() {
    const remainingTime = timerState.futureTime - Date.now();
    timerState.paused = true;
    timerState.pausedRemainingTime = remainingTime;
    chrome.alarms.clear(ALARM_NAME);
    chrome.alarms.clear(CHECK_ALARM);
    saveTimerState();
}

function resumeTimer() {
    timerState.paused = false;
    
    startTimer(
        timerState.currentFocusVal,
        timerState.currentBreakVal,
        timerState.currentCycleVal,
        timerState.focusBool,
        timerState.pausedRemainingTime
    );
}

async function stopTimer() {
    timerState.isRunning = false;
    timerState.paused = false;
    timerState.futureTime = null;
    timerState.pausedRemainingTime = 0;
    chrome.alarms.clear(ALARM_NAME);
    chrome.alarms.clear(CHECK_ALARM);
    await new Promise(resolve => chrome.storage.local.set({ timerState }, resolve));

    // If we stopped mid-break or the session ended on a break, restore both lists
    const { blockedBackup = [], scheduledBackup = [] } = await chrome.storage.local.get(["blockedBackup", "scheduledBackup"]);
    const restoreUpdates = {};
    if (blockedBackup.length > 0){
        restoreUpdates.blockedWebsites = blockedBackup;
        restoreUpdates.blockedBackup = [];
    }
    if (scheduledBackup.length > 0){
        restoreUpdates.scheduledWebsites = scheduledBackup;
        restoreUpdates.scheduledBackup = [];
    }
    if (Object.keys(restoreUpdates).length > 0){
        await chrome.storage.local.set(restoreUpdates);
    }

    // Re-evaluate schedule now that the timer is no longer forcing blocks on
    await chrome.storage.local.remove("lastEnforced");
    await applyScheduleTransition();
    await updateRules();
}
function checkTimer() {
    const now = Date.now();
    
    if (timerState.futureTime && timerState.futureTime <= now && !timerState.paused) {
        handleTimerComplete();
    }
}

function handleTimerComplete() {
    
    if (!timerState.focusBool) {
        timerState.currentCycleVal--;
       
    }
    
    timerState.focusBool = !timerState.focusBool;
  
    // Check if all cycles are complete
    if (timerState.currentCycleVal <= 0) {
        stopTimer();

        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/blocked.png',
            title: 'Pomodoro Complete!',
            message: 'All cycles finished!',
            priority: 2
        });
        return;
    }

    

    // Switch between focus and break
    saveTimerState()
    
    // Show notification
    const message = timerState.focusBool ? 'Focus time started!' : 'Break time started!';
    
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/blocked.png',
        title: 'Pomodoro Timer',
        message: message,
        priority: 2
    });

   
    // Start next timer
    startTimer(
        timerState.currentFocusVal,
        timerState.currentBreakVal,
        timerState.currentCycleVal,
        timerState.focusBool
    );
}

// Listen for alarms
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
        handleTimerComplete();
    } else if (alarm.name === CHECK_ALARM) {
        checkTimer();
    } else if (alarm.name === SCHEDULE_CHECK_ALARM) {
        applyScheduleTransition();
    }
});

function saveTimerState() {
    chrome.storage.local.set({ timerState: timerState });
}
chrome.runtime.onInstalled.addListener(updateRules);
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create(SCHEDULE_CHECK_ALARM, { periodInMinutes: 1, when: Date.now() + 1000 });
});
chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (changes.blockedWebsites || changes.scheduledWebsites){
        await updateRules();
        await restoreBlockedTabs();
        await reblockActiveTabs();
    }
    if (changes.schedule){
        await applyScheduleTransition({ force: true });
    }
});


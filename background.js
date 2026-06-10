
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["blockedWebsites"]).then(result => {
    if (!result.blockedWebsites) {
      chrome.storage.local.set({ blockedWebsites: [] });
    }
  });
});

async function updateRules(){

    const { blockedWebsites = [] } = await chrome.storage.local.get("blockedWebsites");

    const blockedPageUrl = chrome.runtime.getURL("blocked.html");

    const rules = blockedWebsites.map((site, index) => {
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

    const oldRules = await chrome.declarativeNetRequest.getDynamicRules()
    const oldRulesIds = oldRules.map(rule => rule.id)
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: rules,
      removeRuleIds: oldRulesIds

    });

}

async function unblockAndNavigate(site, originalUrl){
    const { blockedWebsites = [] } = await chrome.storage.local.get("blockedWebsites");
    const updated = blockedWebsites.filter(s => s !== site);
    await chrome.storage.local.set({blockedWebsites: updated});
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
    }
    return true;
});

function startTimer(focusVal, breakVal, cycleVal, focusBool, timeOverride = null) {
    if (cycleVal == 0){
      return
    }

    const time = focusBool ? focusVal : breakVal;
    const timer = time * 1000;
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

    if(focusBool){
        // Restore the blocked list if break-mode previously cleared it
        chrome.storage.local.get(["blockedBackup"]).then((result) => {
            const backup = result.blockedBackup || []
            if (backup.length > 0){
                chrome.storage.local.set({blockedWebsites: backup, blockedBackup: []})
            }
        })
    }
    else{
        // Back up the current list, then clear it for break
        chrome.storage.local.get(["blockedWebsites"]).then((result) => {
            const current = result.blockedWebsites || []
            chrome.storage.local.set({blockedBackup: current, blockedWebsites: []})
        })
    }

    saveTimerState();
    
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

function stopTimer() {
    timerState.isRunning = false;
    timerState.paused = false;
    timerState.futureTime = null;
    timerState.pausedRemainingTime = 0;
    chrome.alarms.clear(ALARM_NAME);
    chrome.alarms.clear(CHECK_ALARM);
    saveTimerState();

    // If we stopped mid-break, restore the blocked list
    chrome.storage.local.get(["blockedBackup"]).then((result) => {
        const backup = result.blockedBackup || []
        if (backup.length > 0){
            chrome.storage.local.set({blockedWebsites: backup, blockedBackup: []})
        }
    });
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
    }
});

function saveTimerState() {
    chrome.storage.local.set({ timerState: timerState });
}
chrome.runtime.onInstalled.addListener(updateRules);
chrome.storage.onChanged.addListener(updateRules);



chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["blockedWebsites"]).then(result => {
    if (!result.blockedWebsites) {
      chrome.storage.local.set({ blockedWebsites: [] });
    }
  });
});

let blockedBack = []

async function updateRules(){

    const { blockedWebsites = [] } = await chrome.storage.local.get("blockedWebsites");

    
    
    const rules = blockedWebsites.map((site,index) => ({
        id: index + 1, 
        priority: 1,
        action: {
          type: "redirect",
          redirect: {
            extensionPath: "/blocked.html"
          }
        },
        condition: {
          urlFilter: `*${site}*`,
          resourceTypes: ["main_frame"]
        }
      }));

    const oldRules = await chrome.declarativeNetRequest.getDynamicRules()
    const oldRulesIds = oldRules.map(rule => rule.id)
    chrome.declarativeNetRequest.updateDynamicRules({
      addRules: rules,
      removeRuleIds: oldRulesIds

    });
  
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
        chrome.storage.local.get(["blockedWebsites"]).then((result) =>{
            blockedBack = [...result.blockedWebsites]
            chrome.storage.local.set({blockedWebsites: blockedBack})
            
        })
    }
    else{
        chrome.storage.local.set({blockedWebsites: []})
    }   

    saveTimerState();
    
    // Create alarm for when timer ends
    chrome.alarms.create(ALARM_NAME, { when: timerState.futureTime });
    
    // Also create periodic check alarm (every second)
    chrome.alarms.create(CHECK_ALARM, { periodInMinutes: 1/60 }); // Every second
   
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

/*
function stopTimer() {
    timerState.isRunning = false;
    chrome.alarms.clear(ALARM_NAME);
    chrome.alarms.clear(CHECK_ALARM);
    saveTimerState();
}
*/
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
      
        timerState.isRunning = false;
        chrome.alarms.clear(ALARM_NAME);
        chrome.alarms.clear(CHECK_ALARM);
        saveTimerState();
        
        // Show notification
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


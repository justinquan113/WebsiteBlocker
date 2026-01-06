
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["blockedWebsites"]).then(result => {
    if (!result.blockedWebsites) {
      chrome.storage.local.set({ blockedWebsites: [] });
    }
  });
});

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

const timerState = {
  paused : false,
  currentBreakVal : 0,
  currentCycleVal : 0,
  currentFocusVal : 0,
  pausedRemainingTime : 0,
  focusBool : true,
  futureTime : null,
  isRunning : false,
  currentSetTime : 0
}

chrome.storage.local.get(["timerState"], (result) => {
    if (result.timerState) {
        timerState = result.timerState;
        if (timerState.isRunning && !timerState.paused) {
            checkTimer();
        }
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action == 'pauseTimer'){
    pauseTimer()
    sendResponse({ success: true }); 
  }

  else if(request.action == 'resumeTimer'){
    resumeTimer()
    sendResponse({ success: true }); 
  }

  else if(request.action == 'startTimer'){
    startTimer(request.focusVal, request.breakVal, request.cycleVal, request.focusBool, timeOverride = null)
    sendResponse({ success: true }); 
  }
  else if(request.action == 'getTimerState'){
    const now = Date.now()
    const remainingTime = timerState.paused 
      ? timerState.pausedRemainingTime 
      : Math.max(0, timerState.futureTime - now)
    
    
    sendResponse({
      timerState:{
        ...timerState,
        remainingTime : remainingTime
      }
    })
    
  }
  

}) 

function startTimer(focusVal, breakVal, cycleVal, focusBool, timeOverride){
  timerState.currentFocusVal = focusVal
}

function pauseTimer(){
  console.log('pause')
}

function resumeTimer(){

}

function saveTimerState(){
  chrome.storage.local.set({timerState : timerState})
}

chrome.runtime.onInstalled.addListener(updateRules);
chrome.storage.onChanged.addListener(updateRules);


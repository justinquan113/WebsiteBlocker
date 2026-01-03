
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

chrome.runtime.onInstalled.addListener(updateRules);
chrome.storage.onChanged.addListener(updateRules);


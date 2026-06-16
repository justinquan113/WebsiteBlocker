let website_url = '';
const block  = document.getElementById('block-btn');
const current = document.getElementById('current-website');
const favicon = document.getElementById('current-favicon');
const editBlockList = document.getElementById('edit-btn')
const blockPopup = document.getElementById('block-popup');
const unavailablePopup = document.getElementById('unavailable-popup');
const popup = document.getElementById('popup');
const unblock = document.getElementById('unblock-btn');
const editPopup = document.getElementById('edit-list-popup');
const back = document.getElementById('back-btn')
const back2 = document.getElementById('back-btn2')
const blockList = document.getElementById('block-list')
const searchInput = document.getElementById('search-input')
const searchSuggestions = document.getElementById('search-suggestions')
const remove = document.getElementById('delete-btn')
const focus = document.getElementById('focus')
const focusPopup = document.getElementById('focus-popup')
const startSession = document.getElementById('session-btn')
const focusInput = document.getElementById('focus-input')
const breakInput = document.getElementById('break-input')
const cycleInput = document.getElementById('cycles-input')
const timerPopup = document.getElementById('timer-popup')
const pauseBtn = document.getElementById('pause-btn')
const resetBtn = document.getElementById('reset-btn')
const resumeBtn = document.getElementById('resume-btn')
const semicircles = document.querySelectorAll('.semicircle')
const clock = document.querySelector('.clock')
const timerMode = document.getElementById('timer-mode')
const scheduleBtn = document.getElementById('schedule-btn')
const schedulePopup = document.getElementById('schedule-popup')
const scheduleEnabled = document.getElementById('schedule-enabled')
const scheduleDays = document.getElementById('schedule-days')
const scheduleStart = document.getElementById('schedule-start')
const scheduleEnd = document.getElementById('schedule-end')
const scheduleSave = document.getElementById('schedule-save')
const scheduleStatus = document.getElementById('schedule-status')
const back3 = document.getElementById('back-btn3')



let paused = false
let focusBool = true
let currentFocusVal = 0
let currentBreakVal = 0
let currentCycleVal = 0
let timerLoop = null
let blockedBack = []
let remainingTimeGlobal = 0
let currentSetTime = 0
let blockedOriginalUrl = null


let displayState = null
let displayRafId = null
let displayResyncInterval = null
let lastClockText = ''

function stopDisplayLoop(){
    if (displayRafId){
        cancelAnimationFrame(displayRafId)
        displayRafId = null
    }
    if (displayResyncInterval){
        clearInterval(displayResyncInterval)
        displayResyncInterval = null
    }
    if (timerLoop){
        clearInterval(timerLoop)
        timerLoop = null
    }
    displayState = null
    lastClockText = ''
}

function startDisplayUpdate(){
    stopDisplayLoop()
    syncTimerState(true)
    displayResyncInterval = setInterval(() => syncTimerState(false), 1000)
}

function syncTimerState(startRender){
    chrome.runtime.sendMessage({action: 'getTimerState'}, (response) => {
        if (!response || !response.timerState){
            stopDisplayLoop()
            return
        }

        const state = response.timerState

        if (!state.isRunning){
            stopDisplayLoop()
            timerPopup.style.display = 'none'
            focusPopup.style.display = 'none'
            popup.style.display = 'flex'
            pauseBtn.style.display = 'block'
            resumeBtn.style.display = 'none'
            semicircles.forEach(s => {
                s.style.display = 'none'
                s.style.transform = 'rotate(0deg)'
            })
            showDomain()
            return
        }

        currentBreakVal = state.currentBreakVal
        currentCycleVal = state.currentCycleVal
        currentFocusVal = state.currentFocusVal
        focusBool = state.focusBool
        paused = state.paused
        currentSetTime = state.currentSetTime
        displayState = state

        timerMode.textContent = focusBool ? 'Focus Time' : 'Break Time'

        if (paused){
            pauseBtn.style.display = 'none'
            resumeBtn.style.display = 'block'
        } else {
            resumeBtn.style.display = 'none'
            pauseBtn.style.display = 'block'
        }

        if (!displayRafId){
            displayRafId = requestAnimationFrame(renderFrame)
        }
    })
}

function renderFrame(){
    if (!displayState){
        displayRafId = null
        return
    }

    const remaining = displayState.paused
        ? displayState.pausedRemainingTime
        : Math.max(0, displayState.futureTime - Date.now())

    remainingTimeGlobal = remaining
    displayTimer(remaining, displayState.currentSetTime)

    if (remaining > 0){
        displayRafId = requestAnimationFrame(renderFrame)
    } else {
        displayRafId = null
    }
}

function displayTimer(remainingTime, setTime){
    semicircles[0].style.display = 'block'
    semicircles[1].style.display = 'block'

    const angle = (remainingTime / setTime) * 360
    if (angle > 180){
        semicircles[2].style.display = 'none'
        semicircles[0].style.transform = 'rotate(180deg)'
        semicircles[1].style.transform = `rotate(${angle}deg)`
    } else {
        semicircles[2].style.display = 'block'
        semicircles[0].style.transform = `rotate(${angle}deg)`
        semicircles[1].style.transform = `rotate(${angle}deg)`
    }

    const hrs = Math.floor((remainingTime / (1000 * 60 * 60)) % 24).toLocaleString('en-US', {minimumIntegerDigits: 2, useGrouping: false})
    const mins = Math.floor((remainingTime / (1000 * 60)) % 60).toLocaleString('en-US', {minimumIntegerDigits: 2, useGrouping: false})
    const secs = Math.floor((remainingTime / 1000) % 60).toLocaleString('en-US', {minimumIntegerDigits: 2, useGrouping: false})

    const next = `${hrs}:${mins}:${secs}`
    if (next === lastClockText) return
    lastClockText = next

    clock.innerHTML = `
        <div>${hrs}</div>
        <div class='colon'>:</div>
        <div>${mins}</div>
        <div class='colon'>:</div>
        <div>${secs}</div>
    `
}

/*
function countDownTimer(focusVal, breakVal, cycleVal, timeOverride = null){
    currentBreakVal = breakVal
    currentCycleVal = cycleVal
    currentFocusVal = focusVal
    if (currentCycleVal == 0){
        return
    }
    
    
    let time = focusBool ? currentFocusVal : currentBreakVal

    const timer = time * 1000
    const setTime =  timeOverride ?? timer 
    const startTime =  Date.now()
    const futureTime = startTime + setTime

    if(!timeOverride){
        currentSetTime = timer
    }

    timerLoop = setInterval(() =>{
        
        const currentTime = Date.now()
        const remainingTime = futureTime - currentTime
        const angle = (remainingTime / currentSetTime) * 360
        
        remainingTimeGlobal = remainingTime

        if(angle > 180){
            semicircles[2].style.display = 'none'
            semicircles[0].style.transform = 'rotate(180deg)'
            semicircles[1].style.transform = `rotate(${angle}deg)`
        }
    
        else{
            semicircles[2].style.display = 'block'
            semicircles[0].style.transform = `rotate(${angle}deg)`
            semicircles[1].style.transform = `rotate(${angle}deg)`
        }

        const hrs = Math.floor((remainingTime / (1000 * 60 * 60)) % 24).toLocaleString('en-US', {minimumIntegerDigits: 2, useGrouping: false}) 
        const mins = Math.floor((remainingTime / (1000 * 60)) % 60).toLocaleString('en-US', {minimumIntegerDigits: 2, useGrouping: false}) 
        const secs = Math.floor((remainingTime / 1000) % 60).toLocaleString('en-US', {minimumIntegerDigits: 2, useGrouping: false})
    

         clock.innerHTML = `
            <div>${hrs}</div>
            <div class='colon'>:</div>
            <div>${mins}</div>
            <div class='colon'>:</div>
            <div>${secs}</div>
        `
        
        if(remainingTime <= 0){
           
            clearInterval(timerLoop)
            if(focusBool){
                chrome.storage.local.get(['blockedWebsites']).then((result) =>{
                    blockedBack = [...result.blockedWebsites]
                    chrome.storage.local.set({blockedWebsites : []})
                    console.log(blockedBack)
                })

            }

            else{
                chrome.storage.local.set({blockedWebsites : blockedBack})
            }
                    
            if(!focusBool){
                currentCycleVal--
            }
            focusBool = !focusBool
            countDownTimer(currentFocusVal, currentBreakVal, currentCycleVal)
            

            clock.innerHTML = `
            <div>00</div>
            <div class='colon'>:</div>
            <div>00</div>
            <div class='colon'>:</div>
            <div>00</div>
            `
        }
    })
    

}
*/



async function getCurrentTab() {
    let queryOptions = { active: true, lastFocusedWindow: true };
    let [tab] = await chrome.tabs.query(queryOptions);
    return tab;
}

function setFavicon(src){
    if (src){
        favicon.src = src
        favicon.style.display = 'block'
    } else {
        favicon.removeAttribute('src')
        favicon.style.display = 'none'
    }
}

function timeToMinutes(t){
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
}

function isScheduleActiveNow(schedule, now = new Date()){
    if (!schedule || !schedule.enabled) return false
    if (!schedule.days || schedule.days.length === 0) return false
    const startMins = timeToMinutes(schedule.startTime)
    const endMins = timeToMinutes(schedule.endTime)
    const mins = now.getHours() * 60 + now.getMinutes()
    const today = now.getDay()
    const yesterday = (today + 6) % 7
    if (startMins < endMins){
        return schedule.days.includes(today) && mins >= startMins && mins < endMins
    }
    if (startMins > endMins){
        if (schedule.days.includes(today) && mins >= startMins) return true
        if (schedule.days.includes(yesterday) && mins < endMins) return true
        return false
    }
    return false
}

async function isSiteCurrentlyBlocked(site){
    const result = await chrome.storage.local.get(["blockedWebsites", "scheduledWebsites", "schedule", "timerState"])
    const blocked = result.blockedWebsites || []
    const scheduled = result.scheduledWebsites || []
    const ts = result.timerState

    if (ts && ts.isRunning){
        if (!ts.focusBool) return false
        return blocked.includes(site) || scheduled.includes(site)
    }
    if (blocked.includes(site)) return true
    if (scheduled.includes(site) && isScheduleActiveNow(result.schedule)) return true
    return false
}

async function showDomain(){
    let tab = await getCurrentTab();
    if (!tab || !tab.url){
        return
    }

    const blockedPagePrefix = chrome.runtime.getURL("blocked.html")
    if (tab.url.startsWith(blockedPagePrefix)){
        const hashIndex = tab.url.indexOf('#')
        let originalHost = 'this site'
        if (hashIndex !== -1){
            blockedOriginalUrl = tab.url.slice(hashIndex + 1)
            try {
                originalHost = new URL(blockedOriginalUrl).hostname
            } catch {
                originalHost = 'this site'
            }
        }
        website_url = originalHost
        const stillBlocked = originalHost !== 'this site' && await isSiteCurrentlyBlocked(originalHost)
        if (stillBlocked){
            current.innerHTML = website_url
            setFavicon(null)
            popup.style.display = 'none'
            blockPopup.style.display = 'flex'
            return
        }
        if (blockedOriginalUrl){
            chrome.tabs.update(tab.id, {url: blockedOriginalUrl})
        }
        current.innerHTML = website_url
        setFavicon(null)
        return
    }

    if (!/^https?:\/\//.test(tab.url)){
        website_url = ''
        current.innerHTML = 'Not available on this page'
        current.classList.add('muted-title')
        setFavicon(null)
        block.style.display = 'none'
        popup.style.display = 'flex'
        return
    }

    block.style.display = ''
    current.classList.remove('muted-title')

    const url = new URL(tab.url);
    website_url = url.hostname;
    current.innerHTML = website_url
    setFavicon(tab.favIconUrl)

    if (await isSiteCurrentlyBlocked(website_url)){
        popup.style.display = 'none'
        blockPopup.style.display = 'flex'
    }
}

async function handleBlock(){
    const tab = await getCurrentTab()
    if (!tab || !tab.url) return

    blockedOriginalUrl = tab.url

    chrome.storage.local.get(["blockedWebsites", "scheduledWebsites"]).then((result) => {
        const blocked = result.blockedWebsites || []
        const scheduled = result.scheduledWebsites || []
        if (!blocked.includes(website_url) && !scheduled.includes(website_url)){
            blocked.push(website_url)
            chrome.storage.local.set({blockedWebsites: blocked})
        }
    })

    blockPopup.style.display = 'flex'
    popup.style.display = 'none'

    const blockedPageUrl = chrome.runtime.getURL("blocked.html") + "#" + tab.url
    chrome.tabs.update(tab.id, {url: blockedPageUrl})
}

const POPULAR_SITES = [
    'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'tiktok.com',
    'snapchat.com', 'reddit.com', 'linkedin.com', 'pinterest.com', 'tumblr.com',
    'threads.net', 'discord.com', 'whatsapp.com', 'telegram.org',
    'youtube.com', 'twitch.tv', 'netflix.com', 'hulu.com', 'disneyplus.com',
    'primevideo.com', 'vimeo.com', 'spotify.com',
    'cnn.com', 'bbc.com', 'nytimes.com', 'foxnews.com', 'reuters.com',
    'bloomberg.com', 'theguardian.com', 'wsj.com',
    'amazon.com', 'ebay.com', 'etsy.com', 'aliexpress.com', 'shein.com',
    'target.com', 'walmart.com', 'temu.com',
    'quora.com', 'stackoverflow.com', 'github.com', 'news.ycombinator.com',
    'roblox.com', 'steampowered.com', 'chess.com', 'epicgames.com',
    '9gag.com', 'buzzfeed.com', 'imgur.com', 'medium.com', 'wikipedia.org',
    'espn.com', 'pornhub.com'
]

function renderBlockList(blocked, scheduled){
    blockList.innerHTML = ""
    const existingEmpty = editPopup.querySelector("h2")
    if (existingEmpty) existingEmpty.remove()

    const entries = [
        ...blocked.map(site => ({site, mode: 'always'})),
        ...scheduled.map(site => ({site, mode: 'scheduled'}))
    ]

    for (const {site, mode} of entries){
        const li = document.createElement('li')
        li.className = "list-item"

        const div = document.createElement('div')
        div.className = "item-box"

        const label = document.createElement('div')
        label.className = "item-label"

        const siteIcon = document.createElement('img')
        siteIcon.className = "site-favicon"
        siteIcon.src = `https://www.google.com/s2/favicons?domain=${site}&sz=32`
        siteIcon.alt = ""

        const name = document.createElement('span')
        name.textContent = site

        label.appendChild(siteIcon)
        label.appendChild(name)

        const badge = document.createElement('button')
        badge.type = 'button'
        badge.className = `mode-badge mode-${mode}`
        badge.textContent = mode === 'always' ? 'Always' : 'Scheduled'
        badge.title = 'Click to toggle'
        badge.addEventListener('click', () => toggleSiteMode(site, mode))

        const icon = document.createElement("i")
        icon.className = "fa-regular fa-trash-can delete-btn"
        icon.addEventListener("click", (event) => handleRemove(site, mode, event))

        const actions = document.createElement('div')
        actions.className = 'item-actions'
        actions.appendChild(badge)
        actions.appendChild(icon)

        div.appendChild(label)
        div.appendChild(actions)
        li.appendChild(div)
        blockList.appendChild(li)
    }

    if (entries.length === 0){
        const h2 = document.createElement("h2")
        h2.textContent = "No Websites blocked"
        editPopup.appendChild(h2)
    }
}

function toggleSiteMode(site, currentMode){
    chrome.storage.local.get(["blockedWebsites", "scheduledWebsites"]).then((result) => {
        const blocked = (result.blockedWebsites || []).filter(s => s !== site)
        const scheduled = (result.scheduledWebsites || []).filter(s => s !== site)
        if (currentMode === 'always'){
            scheduled.push(site)
        } else {
            blocked.push(site)
        }
        chrome.storage.local.set({blockedWebsites: blocked, scheduledWebsites: scheduled}).then(() => {
            renderBlockList(blocked, scheduled)
        })
    })
}

function handleEditBlockList(){
    chrome.storage.local.get(["blockedWebsites", "scheduledWebsites"]).then((result) => {
        renderBlockList(result.blockedWebsites || [], result.scheduledWebsites || [])
    })

    searchInput.value = ''
    searchSuggestions.style.display = 'none'
    editPopup.style.display = 'flex'
    popup.style.display = 'none'
}

function normalizeDomain(input){
    let s = input.trim().toLowerCase()
    s = s.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    return s
}

function addSiteToBlockList(rawInput){
    const site = normalizeDomain(rawInput)
    if (!site) return

    chrome.storage.local.get(["blockedWebsites", "scheduledWebsites"]).then((result) => {
        const blocked = result.blockedWebsites || []
        const scheduled = result.scheduledWebsites || []
        if (!blocked.includes(site) && !scheduled.includes(site)){
            blocked.push(site)
            chrome.storage.local.set({blockedWebsites: blocked}).then(() => {
                renderBlockList(blocked, scheduled)
            })
        } else {
            renderBlockList(blocked, scheduled)
        }
    })

    searchInput.value = ''
    searchSuggestions.style.display = 'none'
}

let activeSuggestionIndex = -1

function setActiveSuggestion(index){
    const items = searchSuggestions.querySelectorAll('li')
    if (items.length === 0){
        activeSuggestionIndex = -1
        return
    }

    if (index < 0) index = items.length - 1
    if (index >= items.length) index = 0

    activeSuggestionIndex = index
    items.forEach((li, i) => li.classList.toggle('active', i === index))
    items[index].scrollIntoView({block: 'nearest'})
}

function updateSuggestions(){
    const q = searchInput.value.trim().toLowerCase()
    searchSuggestions.innerHTML = ''
    activeSuggestionIndex = -1

    if (!q){
        searchSuggestions.style.display = 'none'
        return
    }

    const matches = POPULAR_SITES
        .filter(s => s.includes(q))
        .sort((a, b) => {
            const aStarts = a.startsWith(q) ? 0 : 1
            const bStarts = b.startsWith(q) ? 0 : 1
            return aStarts - bStarts || a.localeCompare(b)
        })
        .slice(0, 6)

    if (matches.length === 0){
        searchSuggestions.style.display = 'none'
        return
    }

    for (const site of matches){
        const li = document.createElement('li')
        li.dataset.site = site

        const img = document.createElement('img')
        img.src = `https://www.google.com/s2/favicons?domain=${site}&sz=32`
        img.alt = ''

        const span = document.createElement('span')
        span.textContent = site

        li.appendChild(img)
        li.appendChild(span)
        li.addEventListener('mousedown', (e) => {
            e.preventDefault()
            addSiteToBlockList(site)
        })

        searchSuggestions.appendChild(li)
    }

    searchSuggestions.style.display = 'block'
}

function handleUnblock(){
    chrome.runtime.sendMessage({
        action: 'unblockAndNavigate',
        site: website_url,
        url: blockedOriginalUrl
    })
}

function handleRemove(site, mode, event){
    const li = event.target.closest(".list-item")
    li.remove()

    const key = mode === 'scheduled' ? 'scheduledWebsites' : 'blockedWebsites'
    chrome.storage.local.get([key]).then((result) => {
        const list = (result[key] || []).filter(item => item !== site)
        chrome.storage.local.set({[key]: list})
    })

    if (blockList.innerHTML == ""){
        if(!editPopup.querySelector("h2")){
            const h2 = document.createElement("h2")
            h2.textContent = "No Websites blocked"
            editPopup.appendChild(h2)
        }
    }
}

function handleBack(){
    popup.style.display = 'flex'
    editPopup.style.display = 'none'
    showDomain()
}
function handleBack2(){
    popup.style.display = 'flex'
    focusPopup.style.display = 'none'
    showDomain()
}
function handleBack3(){
    popup.style.display = 'flex'
    schedulePopup.style.display = 'none'
    showDomain()
}

const DEFAULT_SCHEDULE = {
    enabled: false,
    days: [1, 2, 3, 4, 5],
    startTime: '09:00',
    endTime: '17:00'
}

function getSelectedDays(){
    return Array.from(scheduleDays.querySelectorAll('.day-pill.active'))
        .map(el => parseInt(el.dataset.day, 10))
        .sort((a, b) => a - b)
}

function renderSchedule(schedule){
    const s = {...DEFAULT_SCHEDULE, ...(schedule || {})}
    scheduleEnabled.checked = !!s.enabled
    scheduleStart.value = s.startTime
    scheduleEnd.value = s.endTime
    scheduleDays.querySelectorAll('.day-pill').forEach(pill => {
        const day = parseInt(pill.dataset.day, 10)
        pill.classList.toggle('active', s.days.includes(day))
    })
    scheduleStatus.textContent = ''
}

function openSchedule(){
    chrome.storage.local.get(['schedule']).then(({schedule}) => {
        renderSchedule(schedule)
        popup.style.display = 'none'
        schedulePopup.style.display = 'flex'
    })
}

function handleScheduleSave(){
    const schedule = {
        enabled: scheduleEnabled.checked,
        days: getSelectedDays(),
        startTime: scheduleStart.value || '09:00',
        endTime: scheduleEnd.value || '17:00'
    }

    if (schedule.enabled && schedule.days.length === 0){
        scheduleStatus.textContent = 'Pick at least one day.'
        return
    }

    if (schedule.enabled && schedule.startTime === schedule.endTime){
        scheduleStatus.textContent = 'Start and end cannot match.'
        return
    }

    chrome.storage.local.set({schedule}).then(() => {
        scheduleStatus.textContent = 'Saved.'
    })
}

scheduleDays.addEventListener('click', (e) => {
    const pill = e.target.closest('.day-pill')
    if (!pill) return
    pill.classList.toggle('active')
})

function handleStartSession(){
    const focusVal = parseInt(focusInput.value)
    const breakVal = parseInt(breakInput.value)
    const cycleVal = parseInt(cycleInput.value)
    timerPopup.style.display = 'flex'
    focusPopup.style.display = 'none'
    
    //countDownTimer(focusVal, breakVal, cycleVal)
   

    chrome.runtime.sendMessage({
        action : 'startTimer',
        focusVal: focusVal,
        breakVal: breakVal,
        cycleVal: cycleVal,
        focusBool: true
    }, () => {
        startDisplayUpdate()
    })
    
}


function handlePauseResume(e){
    const button = e.target
    const action = button.textContent

    if (action == "Pause"){
        if (displayState && !displayState.paused){
            displayState.pausedRemainingTime = Math.max(0, displayState.futureTime - Date.now())
            displayState.paused = true
        }
        paused = true
        pauseBtn.style.display = 'none'
        resumeBtn.style.display = 'block'
        chrome.runtime.sendMessage({action: 'pauseTimer'}, () => syncTimerState(false))
    } else {
        if (displayState && displayState.paused){
            displayState.futureTime = Date.now() + displayState.pausedRemainingTime
            displayState.paused = false
        }
        paused = false
        resumeBtn.style.display = 'none'
        pauseBtn.style.display = 'block'
        if (!displayRafId){
            displayRafId = requestAnimationFrame(renderFrame)
        }
        chrome.runtime.sendMessage({action: 'resumeTimer'}, () => syncTimerState(false))
    }
}

function handleReset(){
    chrome.runtime.sendMessage({action: 'stopTimer'})

    focusPopup.style.display = 'flex'
    timerPopup.style.display = 'none'
    popup.style.display = 'none'
    pauseBtn.style.display = 'block'
    resumeBtn.style.display = 'none'
    currentBreakVal = 0
    currentCycleVal = 0
    currentFocusVal = 0

    stopDisplayLoop()

    semicircles.forEach(s =>{
        s.style.display = 'none'
        s.style.transform = 'rotate(0deg)'
    })
}

function restoreView(){
    chrome.runtime.sendMessage({action: 'syncEnforcement'}, () => {
        chrome.runtime.sendMessage({action: 'getTimerState'}, (response) => {
            if (response && response.timerState && response.timerState.isRunning){
                popup.style.display = 'none'
                timerPopup.style.display = 'flex'
                startDisplayUpdate()
            } else {
                showDomain()
            }
        })
    })
}

document.addEventListener('DOMContentLoaded', restoreView);


block.addEventListener('click', handleBlock)
editBlockList.addEventListener('click', handleEditBlockList)
unblock.addEventListener('click', handleUnblock)
back.addEventListener('click', handleBack)
focus.addEventListener('click', () =>{
    popup.style.display = 'none'
    focusPopup.style.display = 'flex'
})

back2.addEventListener('click', handleBack2)
back3.addEventListener('click', handleBack3)
scheduleBtn.addEventListener('click', openSchedule)
scheduleSave.addEventListener('click', handleScheduleSave)
startSession.addEventListener('click', handleStartSession)
pauseBtn.addEventListener('click', handlePauseResume)
resumeBtn.addEventListener('click', handlePauseResume)
resetBtn.addEventListener('click', handleReset)

searchInput.addEventListener('input', updateSuggestions)
searchInput.addEventListener('focus', updateSuggestions)
searchInput.addEventListener('blur', () => {
    setTimeout(() => { searchSuggestions.style.display = 'none' }, 100)
})
searchInput.addEventListener('keydown', (e) => {
    const items = searchSuggestions.querySelectorAll('li')
    const open = searchSuggestions.style.display !== 'none' && items.length > 0

    if (e.key === 'ArrowDown' && open){
        e.preventDefault()
        setActiveSuggestion(activeSuggestionIndex + 1)
    } else if (e.key === 'ArrowUp' && open){
        e.preventDefault()
        setActiveSuggestion(activeSuggestionIndex - 1)
    } else if (e.key === 'Enter'){
        if (open && activeSuggestionIndex >= 0){
            e.preventDefault()
            addSiteToBlockList(items[activeSuggestionIndex].dataset.site)
        } else if (searchInput.value.trim()){
            addSiteToBlockList(searchInput.value)
        }
    } else if (e.key === 'Escape'){
        searchSuggestions.style.display = 'none'
        activeSuggestionIndex = -1
    }
})
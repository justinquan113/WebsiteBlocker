let website_url = '';
const block  = document.getElementById('block-btn');
const current = document.getElementById('current-website');
const editBlockList = document.getElementById('edit-btn')
const blockPopup = document.getElementById('block-popup');
const popup = document.getElementById('popup');
const unblock = document.getElementById('unblock-btn');
const refresh = document.getElementById('refresh');
const editPopup = document.getElementById('edit-list-popup');
const back = document.getElementById('back-btn')
const back2 = document.getElementById('back-btn2')
const blockList = document.getElementById('block-list')
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



let paused = false
let focusBool = true
let currentFocusVal = 0
let currentBreakVal = 0
let currentCycleVal = 0
let timerLoop = null
let blockedBack = []
let remainingTimeGlobal = 0
let currentSetTime = 0


function startDisplayUpdate(){
    if(timerLoop){
        clearInterval(timerLoop)
    }
    timerLoop = setInterval(() =>{
        chrome.runtime.sendMessage({action: 'getTimerState'}, (response) =>{
           
            if(response && response.timerState){
               
                const state = response.timerState

                currentBreakVal = state.currentBreakVal
                currentCycleVal = state.currentCycleVal
                currentFocusVal = state.currentFocusVal
                focusBool = state.focusBool
                paused = state.paused
                remainingTimeGlobal = state.remainingTime
                currentSetTime = state.currentSetTime
               


                displayTimer(remainingTimeGlobal, currentSetTime)
                
                

                if(paused){
                    pauseBtn.style.display = 'none'
                    resumeBtn.style.display = 'block'
                    
                }
    
                else{
                    resumeBtn.style.display = 'none'
                    pauseBtn.style.display = 'block'
                }
    
            }
            else{
                clearInterval(timerLoop)
                timerLoop = null
            }
           
           

        })
    },50)
}

function displayTimer(remainingTime, setTime){
    const angle = (remainingTime / setTime) * 360
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

async function showDomain(){
    let tab = await getCurrentTab();
    if (!tab || !tab.url){
        return
    }
    const url = new URL(tab.url);
    website_url = url.hostname;
    current.innerHTML = website_url
    
    chrome.storage.local.get(["blockedWebsites"]).then((result) =>{
        const list = result.blockedWebsites || []
        if (list.includes(website_url)){
            popup.style.display = 'none'
            blockPopup.style.display = 'flex'
        }
    })

   
    
}

async function refreshCurrentTab() {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    chrome.tabs.reload(tab.id);
  }
}


function handleBlock(){
    chrome.storage.local.get(["blockedWebsites"]).then((result) => {
        const list = result.blockedWebsites || []
        if (!list.includes(website_url)){
            list.push(website_url)
            chrome.storage.local.set({blockedWebsites: list})
        }
       
        
    })

    blockPopup.style.display = 'flex'
    popup.style.display = 'none'

    
}

function handleEditBlockList(){
    chrome.storage.local.get(["blockedWebsites"]).then((result) => {
        const list = result.blockedWebsites
        
        blockList.innerHTML = ""
        for (let i = 0; i < list.length; i++){
            const site = list[i]
            const li = document.createElement('li')
            li.className = "list-item"

            const div = document.createElement('div')
            div.className = "item-box"
            div.textContent = site
            
            const icon = document.createElement("i")
            icon.className = "fa-regular fa-trash-can delete-btn"
            
            
            icon.addEventListener("click", (event) => handleRemove(site,event))

            div.appendChild(icon)
            li.appendChild(div)
            blockList.appendChild(li)
        }

        if (blockList.innerHTML == ""){
            if(!editPopup.querySelector("h2")){
                const h2 = document.createElement("h2")
                h2.textContent = "No Websites blocked"
                editPopup.appendChild(h2)
            }
          
        }
        
    })

    editPopup.style.display = 'flex'
    popup.style.display = 'none'


}

function handleUnblock(){
    popup.style.display = 'flex'
    blockPopup.style.display = 'none'
    chrome.storage.local.get(["blockedWebsites"]).then((result) => {
        const list = result.blockedWebsites
        for (let i = 0; i < list.length; i++){
            if(website_url == list[i]){
                list.splice(i,1)
            }
        }
        chrome.storage.local.set({blockedWebsites : list})

    })

}

function handleRemove(site,event){


    const li = event.target.closest(".list-item")
    li.remove()

    chrome.storage.local.get(["blockedWebsites"]).then((result) =>{
        let list = result.blockedWebsites
        list = list.filter(item => item != site);
        chrome.storage.local.set({blockedWebsites : list})
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
  
   
}
function handleBack2(){
    popup.style.display = 'flex'
    focusPopup.style.display = 'none'
  
   
}

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
    if(action == "Pause"){
        chrome.runtime.sendMessage({action: 'pauseTimer'})
    }
    else{
        chrome.runtime.sendMessage({action: 'resumeTimer'})
    }
   
}

function handleReset(){
    focusPopup.style.display = 'flex'
    timerPopup.style.display = 'none'
    pauseBtn.style.display = 'block'
    resumeBtn.style.display = 'none'
    currentBreakVal = 0
    currentCycleVal = 0
    currentFocusVal = 0

    if (timerLoop) {
        clearInterval(timerLoop);
        timerLoop = null;
    }

    semicircles.forEach(s =>{
        s.style.display = 'none'
        s.style.transform = 'rotate(0deg)'
    })
}

document.addEventListener('DOMContentLoaded', showDomain);


block.addEventListener('click', handleBlock)
editBlockList.addEventListener('click', handleEditBlockList)
unblock.addEventListener('click', handleUnblock)
refresh.addEventListener('click', refreshCurrentTab)
back.addEventListener('click', handleBack)
focus.addEventListener('click', () =>{
    popup.style.display = 'none'
    focusPopup.style.display = 'flex'
})

back2.addEventListener('click', handleBack2)
startSession.addEventListener('click', handleStartSession)
pauseBtn.addEventListener('click', handlePauseResume)
resumeBtn.addEventListener('click', handlePauseResume)
resetBtn.addEventListener('click', handleReset)
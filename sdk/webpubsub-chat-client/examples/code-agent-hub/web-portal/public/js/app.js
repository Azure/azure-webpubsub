import DOMPurify from'/dompurify.js';
import{Marked,Renderer}from'/marked.js';
import{ChatClient}from'/chat-client.js';
import{canBrowseDaemonDirectories,classifyIncomingSessionRoomMessage,createSessionHistorySummary,daemonHasAdminAccess as portalDaemonHasAdminAccess,daemonHasMemberAccess as portalDaemonHasMemberAccess,getCreateSessionAccessState,getRealtimeSessionAccessPatch,getSessionChatPlaceholderState,getSessionListAccessPresentation,isDaemonRecordFresh,isLocalEchoMessage,isStartupStatusEnvelope,isStartupWaitMessage,mergeRealtimeDaemonRecord,normalizeDaemonRecord as normalizePortalDaemonRecord,recordSessionHistoryEnvelope,rememberRoomMessage,resetSessionStateToIdle,resolveNotificationRoomId,shouldBackgroundRetrySessionOpenError,shouldIgnoreRoomMessage,shouldIgnoreSemanticDuplicate,shouldRetainPreviousDaemons,shouldSuppressSessionOpenError}from'/js/portal-regressions.js';
import{applyDelegationCardRelayEvent,buildDelegationCardHeaderSummary,createDelegationCardState,ensureDelegationCardSummaryContent,finalizeDelegationCardStreamingItems,getDelegationCardSectionState,isDelegationCardCollapsed,reconcileDelegationCardTerminalSummaryContent,settleDelegationCardToolItems,setDelegationCardCollapsed,setDelegationCardReasoningExpanded,toggleDelegationCardCollapsed}from'/js/delegation-card-state.js';
import{buildDaemonAccessSectionMarkup,captureDaemonAccessInputState,collectDaemonAccessEditorUsers,daemonAccessInputId,restoreDaemonAccessInputState}from'/js/daemon-access-state.js';
import{clampDelegationRelayHistoryMaxCount,createDelegationRelayConnectionPromise}from'/js/delegation-relay-state.js';
import{buildCreateAgentListMarkup,buildCreateDaemonListMarkup,buildCreateSessionAgentOptions,buildCreateSessionButtonState,buildCreateSessionDraft,buildDirectorySuggestionsMarkup,defaultDirectoryForDaemon,isCreateSelectableDaemon as deriveCreateSelectableDaemon,normalizePickerPath,pathLooksCompatibleWithPlatform}from'/js/create-session-state.js';
import{evictRoomFromClientCache}from'/js/chat-room-cache.js';
import{applySessionGroups,buildAgentCardsMarkup,buildCompactNavMarkup,buildDaemonCardsMarkup,buildSessionCardsMarkup,formatRelativeTime}from'/js/portal-column-state.js';
import{collectKnownRoomInfos,ensureLocalRoomInfo,rememberKnownRoomInfo}from'/js/room-routing-state.js';
import{applySessionQueryContext,collectVisibleSessions,getSessionMetadataHydrationState,getSessionRecordStatusInfo,normalizeSessionRecord as normalizeSessionDiscoveryRecord,resolveRoomDisplayName,sessionNeedsMetadataHydration,shouldShowPortalSessionLoading,shouldSkipDeletedSession}from'/js/session-discovery-state.js';
import{canSkipInitialSessionSync,ensureSessionOpenSync,waitForJoinedRoom,waitForRoomLiveSync}from'/js/session-live-sync.js';
import{deriveToolbarModelId}from'/shared/session-toolbar-state.js';

let cc=null,uid=null,rid=null;
const pd=new Map(),rd=new Map(),at=new Map(),pp=new Map(),tc=new Map();
const deletedSessions=new Map();
const joinRequests=new Map();
const joinApprovalLocks=new Set();
const daemonAccessApprovalLocks=new Set();
const pendingCreateRequests=new Map();
const pendingWorkspaceRequests=new Map();
const livePermissionResponses=new Map();
const loadedSessionQueryKeys=new Set();
const loadingSessionQueryKeys=new Set();
const daemonSyncRooms=new Set();
const supplementalRoomInfos=new Map();
const roomsPendingLiveSync=new Set();
const sessionMetadataHydrationInFlight=new Set();
const sessionMetadataHydrationLastAttempt=new Map();
let portalPollTimer=null;
let portalPollInFlight=false;
let lobbyMembershipRetryTimer=null;
let lobbyMembershipEpoch=0;
let portalDaemonsLoaded=false;
let oauthMode=false;
let oauthAuthenticatedUser=null;
let portalTransportState='disconnected';
let portalTransportError='';
const seenPendingJoinRequestIds=new Set();
const seenPendingDaemonAccessRequestIds=new Set();
const recentDaemonAccessRequests=new Set();
const recentSessionAccessRequests=new Set();
const delegationViews=new Map();
const relayRoomDelegations=new Map();
const relaySeenMessageIds=new Map();
const ss={processing:false,pendingCount:0,stopping:false,model:'gpt-5.4'};
let currentSessionReady=null;
let chatPlaceholderOverride=null;
let latestSessionHistorySummary=createSessionHistorySummary();
let sessionLiveSyncRetryTimer=null;
let sessionLiveSyncRetryToken=0;
const STOP_RETRY_COOLDOWN_MS=1200;
let sendMode='enqueue';
let currentDaemonId=null;
let currentAgentName=null;
const createSessionDraft={daemonId:'',agentName:'',directory:''};
let createSessionModalOpen=false;
let daemonAccessDrawerOpen=false;
let daemonAccessDrawerDaemonId='';
let daemonAccessDrawerStatus=null;
let daemonAccessSavePending=false;
const DEFAULT_SLASH_CMDS=[
  {cmd:'compact',desc:'Compact conversation history'},
  {cmd:'clear',desc:'Clear the chat display'},
  {cmd:'delegate',desc:'Delegate to another writable session (/delegate <sessionId> <prompt>)'},
  {cmd:'model',desc:'Change AI model (e.g. /model gpt-5.4)'},
  {cmd:'mode',desc:'Change agent behavior or access policy (e.g. /mode plan)'},
  {cmd:'help',desc:'Show available commands'},
];
let SLASH_CMDS=DEFAULT_SLASH_CMDS.map(c=>({...c}));
let availableModels=[];
let currentModelId='';
let availableModes=[];
let currentModeId='';
let usageSize=0;
let usageUsed=0;
let composerMenuMode='';
let composerMenuItems=[];
let composerMenuContext=null;
let composerMenuRequestToken=0;
let selectedDelegationTarget=null;
const delegationTargetsCache={sourceSessionId:'',loadedAt:0,targets:[],inflight:null,version:0};
const DELEGATION_TARGET_CACHE_MS=15000;
const SESSION_METADATA_HYDRATE_COOLDOWN_MS=10000;
const USAGE_SUPPORTED_AGENTS=new Set(['copilot','claude','codex','copilot-sdk']);
const MODE_PRESENTATIONS={
  behavior:{label:'Behavior',title:'Agent behavior. This comes from the agent.'},
  access:{label:'Access',title:'Agent access policy. This comes from the agent and is separate from portal approvals.'},
  mode:{label:'Mode',title:'Agent mode. This comes from the agent.'},
};
const knownDaemons=new Map(); // daemonId → { hostname, agents }
const LOBBY_ROOM='lobby';
const DAEMON_SYNC_ROOM_PREFIX='daemon-acl-';
const DAEMON_STALE_MS=90000;
const ROOM_MEMBERSHIP_TIMEOUT_MS=8000;
const ROOM_LIVE_SYNC_TIMEOUT_MS=5000;
let historyLoadedAt=0;
const seenRoomMessageIds=new Set();

function portalWarn(event,message,details={}){
  const payload=Object.fromEntries(Object.entries({event,...details}).filter(([,value])=>value!==undefined&&value!==''&&value!==null));
  const args=[`[Portal] ${message}`];
  if(Object.keys(payload).length)args.push(payload);
  console.warn(...args);
}

const IMAGE_ROOT='/images';
const AGENT_SPRITE_PATH=`${IMAGE_ROOT}/agent-icons.svg`;
const OS_SPRITE_PATH=`${IMAGE_ROOT}/os-icons.svg`;
const UI_SPRITE_PATH=`${IMAGE_ROOT}/ui-icons.svg`;
function buildSpriteIcon(spritePath,symbolId,{width=16,height=16,viewBox='0 0 24 24',fill='currentColor',stroke='',strokeWidth='',strokeLinecap='',strokeLinejoin='',className='',style='display:block'}={}){
  const attrs=[
    `width="${width}"`,`height="${height}"`,`viewBox="${viewBox}"`,'xmlns="http://www.w3.org/2000/svg"',
    className?`class="${className}"`:'',style?`style="${style}"`:'',fill!==null?`fill="${fill}"`:'',
    stroke?`stroke="${stroke}"`:'',strokeWidth?`stroke-width="${strokeWidth}"`:'',strokeLinecap?`stroke-linecap="${strokeLinecap}"`:'',strokeLinejoin?`stroke-linejoin="${strokeLinejoin}"`:'','aria-hidden="true"'
  ].filter(Boolean).join(' ');
  return `<svg ${attrs}><use href="${spritePath}#${symbolId}"></use></svg>`;
}
function buildImageIcon(src,{width=16,height=16,className='',style='display:block'}={}){
  const attrs=[className?`class="${className}"`:'',`src="${src}"`,'alt=""','aria-hidden="true"',`width="${width}"`,`height="${height}"`,style?`style="${style}"`:'' ].filter(Boolean).join(' ');
  return `<img ${attrs} />`;
}

// Agent icons (from simpleicons.org + svgrepo.com, 16x16)
const AGENT_ICONS={
  copilot:buildSpriteIcon(AGENT_SPRITE_PATH,'copilot'),
  claude:buildSpriteIcon(AGENT_SPRITE_PATH,'claude'),
  gemini:buildSpriteIcon(AGENT_SPRITE_PATH,'gemini'),
  codex:buildSpriteIcon(AGENT_SPRITE_PATH,'codex'),
  opencode:buildSpriteIcon(AGENT_SPRITE_PATH,'opencode'),
};
const AGENT_COLORS={copilot:'#6baaff',claude:'#d97757',gemini:'#8b7cf6',codex:'#50d167',opencode:'#aaa'};
const AGENT_NAMES={copilot:'GitHub Copilot',claude:'Claude Code',gemini:'Gemini CLI',codex:'Codex',opencode:'OpenCode','copilot-sdk':'GitHub Copilot (SDK)'};
const TESTED_ACP_AGENTS=new Set(['copilot','claude','codex']);
function getAgentVisualKey(agentName){return agentName==='copilot-sdk'?'copilot':agentName}
function normalizeDaemonPlatform(platform){
  const value=String(platform||'').trim().toLowerCase();
  if(!value)return'';
  if(value==='win32'||value==='windows'||value==='win')return'win32';
  if(value==='darwin'||value==='macos'||value==='mac'||value==='osx')return'darwin';
  if(['linux','ubuntu','debian','fedora','alpine','centos','rhel'].includes(value))return'linux';
  return value;
}
function daemonSyncRoomId(daemonId){return `${DAEMON_SYNC_ROOM_PREFIX}${String(daemonId||'').trim()}`}
function currentSessionQueryKey(){return uid?GLOBAL_SESSION_QUERY_KEY:''}
function sessionQueryLoaded(queryKey=currentSessionQueryKey()){return !!queryKey&&loadedSessionQueryKeys.has(queryKey)}
function markSessionQueryLoaded(queryKey=currentSessionQueryKey()){if(queryKey)loadedSessionQueryKeys.add(queryKey)}
function sessionQueryLoading(queryKey=currentSessionQueryKey()){return !!queryKey&&loadingSessionQueryKeys.has(queryKey)}
function roomNeedsLiveSyncValidation(roomId){const targetRoomId=String(roomId||'').trim();return !!targetRoomId&&roomsPendingLiveSync.has(targetRoomId)}
function getChatPlaceholderState(){
  if(chatPlaceholderOverride)return chatPlaceholderOverride;
  if(!uid)return {kicker:'Sign in',title:'Open an agent workspace',subtitle:'Log in to browse daemons, agents, and sessions.',watermark:'',generic:true};
  if(!rid)return {kicker:'Sessions',title:'Choose a session or create a new one',subtitle:'The sessions column now spans every visible daemon and agent.',watermark:'',generic:true};
  const visualKey=getAgentVisualKey(currentAgentName||'copilot');
  return {
    kicker:AGENT_NAMES[currentAgentName]||currentAgentName||'Session',
    title:'Session is ready',
    subtitle:'',
    watermark:AGENT_ICONS[visualKey]||'',
    generic:false,
  };
}
function renderChatPlaceholder(){
  const el=document.getElementById('chat-placeholder');
  if(!el)return;
  const state=getChatPlaceholderState();
  const watermark=state.watermark
    ?`<div class="chat-empty-watermark">${state.watermark}</div>`
    :`<div class="chat-empty-watermark generic"><div class="chat-empty-watermark-glyph">⌘</div></div>`;
  const subtitle=state.subtitle?`<div class="chat-empty-sub">${esc(state.subtitle)}</div>`:'';
  el.innerHTML=`<div class="chat-empty">${watermark}<div class="chat-empty-copy"><div class="chat-empty-kicker">${esc(state.kicker)}</div><div class="chat-empty-title">${esc(state.title)}</div>${subtitle}</div></div>`;
}
function sessionAgentLabel(){return AGENT_NAMES[currentAgentName]||currentAgentName||'Session'}
function chatHasVisibleContent(){return !!$.chat?.childElementCount}
function setChatPlaceholderOverride(state=null){chatPlaceholderOverride=state?{...state}:null;showChatPlaceholder(!!chatPlaceholderOverride)}
function noteChatContentVisible(){if(chatPlaceholderOverride)chatPlaceholderOverride=null;showChatPlaceholder(false)}
function cancelSessionLiveSyncRetry(){if(sessionLiveSyncRetryTimer){clearTimeout(sessionLiveSyncRetryTimer);sessionLiveSyncRetryTimer=null}sessionLiveSyncRetryToken+=1}
function refreshSessionPlaceholder({forceSyncing=false}={}){
  if(!rid||chatHasVisibleContent()){
    if(chatPlaceholderOverride)noteChatContentVisible();
    return;
  }
  const startupLike=currentSessionReady===false||(currentSessionReady===null&&latestSessionHistorySummary?.hasStartupSignal);
  setChatPlaceholderOverride(getSessionChatPlaceholderState({
    agentLabel:sessionAgentLabel(),
    isStarting:startupLike&&!forceSyncing,
    isSyncing:forceSyncing,
    isReadOnly:isCurrentSessionReadOnly(),
  }))
}
function scheduleSessionLiveSyncRetry(roomId,{delayMs=2000,attempt=1,maxAttempts=1}={}){
  const targetRoomId=String(roomId||'').trim();
  if(!targetRoomId||targetRoomId!==rid)return;
  cancelSessionLiveSyncRetry();
  const retryToken=sessionLiveSyncRetryToken;
  sessionLiveSyncRetryTimer=setTimeout(async()=>{
    sessionLiveSyncRetryTimer=null;
    if(retryToken!==sessionLiveSyncRetryToken||targetRoomId!==rid||!cc)return;
    try{
      setSessionBanner({source:'history',label:'Syncing',text:'Live session sync is still catching up…',tone:'info'});
      refreshSessionPlaceholder({forceSyncing:true});
      await ensureLiveRoomSubscription(targetRoomId,{retries:1,retryDelayMs:300});
      await waitForRoomLiveState(targetRoomId,ROOM_LIVE_SYNC_TIMEOUT_MS,{...(discoveredSessions.get(targetRoomId)||{}),sessionId:targetRoomId},{allowHistoryFallback:true});
      roomsPendingLiveSync.delete(targetRoomId);
      clearSessionBanner('history');
      refreshSessionPlaceholder();
    }catch(err){
      if(retryToken!==sessionLiveSyncRetryToken||targetRoomId!==rid)return;
      if(attempt<maxAttempts){
        scheduleSessionLiveSyncRetry(targetRoomId,{delayMs:Math.min(delayMs*2,5000),attempt:attempt+1,maxAttempts});
        return;
      }
      setSessionBanner({source:'history',label:'Sync delayed',text:'History loaded, but live updates are still catching up. Keep this room open or retry if messages do not start streaming.',tone:'warn',actionText:'Retry',action:()=>openR(targetRoomId)});
      refreshSessionPlaceholder({forceSyncing:true});
    }
  },delayMs)
}

// OS icons for daemon list
const OS_ICONS={
  win32:buildSpriteIcon(OS_SPRITE_PATH,'win32',{viewBox:'-0.5 0 257 257'}),
  darwin:buildSpriteIcon(OS_SPRITE_PATH,'darwin'),
  linux:buildImageIcon(`${IMAGE_ROOT}/linux.svg`,{style:'display:block;width:16px;height:16px'}),
};
const OS_NAMES={win32:'Windows',darwin:'macOS',linux:'Linux'};

const $={
  chat:document.getElementById('chat'),
  scroll:document.getElementById('scroll'),
  ibar:document.getElementById('ibar'),mi:document.getElementById('mi'),sb:document.getElementById('sb'),
  delegationChip:document.getElementById('delegation-chip'),delegationChipLabel:document.getElementById('delegation-chip-label'),delegationChipClear:document.getElementById('delegation-chip-clear'),
  sd:document.getElementById('sdot'),tt:document.getElementById('topbar-title'),tbc:document.getElementById('topbar-breadcrumb'),tst:document.getElementById('topbar-st'),
  asyncBanner:document.getElementById('async-banner'),asyncBannerPill:document.getElementById('async-banner-pill'),asyncBannerText:document.getElementById('async-banner-text'),asyncBannerAction:document.getElementById('async-banner-action'),
  toolbarWorking:document.getElementById('toolbar-working'),toolbarWorkingText:document.getElementById('toolbar-working-text'),
  userBadge:document.getElementById('user-badge'),
  compactBtn:document.getElementById('compact-toggle-btn'),compactNav:document.getElementById('compact-nav'),chatColTop:document.getElementById('chat-col-top'),
  loginUser:document.getElementById('login-username'),loginMsg:document.getElementById('login-msg'),loginBtn:document.getElementById('login-btn'),logoutBtn:document.getElementById('logout-btn'),
  dirIn:document.getElementById('f-dir'),dirMeta:document.getElementById('f-dir-meta'),dirSuggestions:document.getElementById('f-dir-suggestions'),formMsg:document.getElementById('col-new-msg'),sessionListMsg:document.getElementById('col-sessions-msg'),
  openCreateSessionBtn:document.getElementById('open-create-session-btn'),createSessionOverlay:document.getElementById('create-session-overlay'),createSessionModal:document.getElementById('create-session-modal'),createDaemonList:document.getElementById('create-daemon-list'),createAgentList:document.getElementById('create-agent-list'),
};
const DEFAULT_USERNAME='AzureUser';
const USER_STORAGE_KEY='cp-uid';
const PORTAL_USER_HEADER='x-codeagenthub-user';
const DIR_PICKER_ROOT='__roots__';
const OAUTH_LOGIN_COPY_DEFAULT='Sign in with your GitHub account to continue.';
const GLOBAL_SESSION_QUERY_KEY='all-sessions';
const discoveredSessions=new Map();
const daemonAccessDrafts=new Map();
function getStoredUserId(){
  try{
    const scoped=sessionStorage.getItem(USER_STORAGE_KEY);
    if(scoped)return scoped;
    const legacy=localStorage.getItem(USER_STORAGE_KEY)||'';
    if(legacy)sessionStorage.setItem(USER_STORAGE_KEY,legacy);
    return legacy;
  }catch{return''}
}
function setStoredUserId(userId){try{sessionStorage.setItem(USER_STORAGE_KEY,String(userId||''))}catch{}}
let lastStatusMessage='';
let lastStatusAt=0;
let lastSemanticRender=null;
let compactNav=false;
let lastStopRequestAt=0;
let formStatusNotice=null;
let formStatusTimer=null;
let directorySuggestionTimer=null;
let directorySuggestionToken=0;

const isMobile=()=>window.innerWidth<=600;
function mobileWorkflowColumn(){
  if(!uid)return 'col-login';
  if(rid)return 'chat-col';
  if(currentDaemonId)return 'col-sessions';
  return 'col-daemons';
}
function mobShow(colId){
  if(!isMobile())return;
  document.querySelectorAll('.col,#chat-col').forEach(c=>{c.classList.remove('mob-visible');c.style.removeProperty('display')});
  const el=document.getElementById(colId);if(el){el.classList.add('mob-visible');el.style.display='flex'}
}
window.mobShow=mobShow;
function mobInit(){if(isMobile())mobShow(mobileWorkflowColumn())}
window.addEventListener('resize',()=>{if(isMobile())setCompactNav(false);if(!isMobile()){document.querySelectorAll('.col,#chat-col').forEach(c=>c.classList.remove('mob-visible'));if(uid)applyLoggedInState();else applyLoggedOutState();syncCompactButton()}});
window.toggleColumns=()=>{if(isMobile())mobShow(uid?'col-daemons':'col-login')};
function openPanel(){}function closePanel(){}function openSheet(){}function closeSheet(){}

/* Theme toggle */
function readStoredTheme(){try{return localStorage.getItem('cp-theme')||'light'}catch{return'light'}}
function syncThemeButton(){const button=document.getElementById('theme-btn');if(button)button.textContent=document.documentElement.classList.contains('light')?'☀️':'🌙'}
const savedTheme=readStoredTheme();
document.documentElement.classList.toggle('light',savedTheme==='light');
function toggleTheme(){
  const isLight=document.documentElement.classList.toggle('light');
  try{localStorage.setItem('cp-theme',isLight?'light':'dark')}catch{}
  syncThemeButton();
}
window.toggleTheme=toggleTheme;
syncThemeButton();

/* Debug panel */
const debugMessages=[];
let debugOpen=false;
function syncDebugUi(){
  const panel=document.getElementById('debug-panel');
  const button=document.getElementById('debug-btn');
  const count=document.getElementById('debug-count');
  if(panel)panel.classList.toggle('open',debugOpen);
  if(button){
    button.classList.toggle('active',debugOpen);
    if(debugOpen)button.classList.remove('debug-flash');
  }
  if(count)count.textContent=String(debugMessages.length);
}
function flashDebugButton(){
  const button=document.getElementById('debug-btn');
  if(!button||debugOpen)return;
  button.classList.remove('debug-flash');
  void button.offsetWidth;
  button.classList.add('debug-flash');
}
function toggleDebug(){
  debugOpen=!debugOpen;
  syncDebugUi();
  if(debugOpen){
    const log=document.getElementById('debug-log');
    if(log)log.scrollTop=log.scrollHeight;
  }
}
window.toggleDebug=toggleDebug;
function hideDebugPanel(){
  debugOpen=false;
  syncDebugUi();
}
window.hideDebugPanel=hideDebugPanel;
function clearDebugLog(){
  const log=document.getElementById('debug-log');
  if(log)log.innerHTML='';
  debugMessages.length=0;
  syncDebugUi();
}
window.clearDebugLog=clearDebugLog;
function exportDebugLog(){
  if(!debugMessages.length)return;
  const escapeCsv=(v)=>{const s=String(v??'');return s.includes(',')||s.includes('"')||s.includes('\n')?'"'+s.replace(/"/g,'""')+'"':s};
  const rows=[['#','Time','Direction','Type','Label','Protocol','Message'].map(escapeCsv).join(',')];
  for(let i=0;i<debugMessages.length;i++){
    const m=debugMessages[i];
    let json='';try{json=JSON.stringify(m.data)}catch{json=String(m.data||'')}
    rows.push([i+1,m.ts,m.direction==='send'?'SEND':'RECV',m.type||'',m.label||'',m.proto||'',json].map(escapeCsv).join(','));
  }
  const blob=new Blob([rows.join('\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=`codeagenthub-debug-${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}.csv`;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
window.exportDebugLog=exportDebugLog;
function logDebugMessage(direction,data,label='',proto=''){
  const ts=new Date().toISOString().substring(11,19);
  let type='unknown';
  try{if(typeof data==='string')data=JSON.parse(data);type=data.type||data.method||'response'}catch{}
  debugMessages.push({ts,direction,type,data,label,proto});
  if(debugMessages.length>500)debugMessages.shift();
  const el=document.getElementById('debug-log');
  if(!el)return;
  const dir=direction==='send'?'↑':'↓';
  const dirColor=direction==='send'?'var(--green)':'var(--accent2)';
  const labelHtml=label?`<span style="font-size:9px;padding:1px 5px;border-radius:4px;background:color-mix(in srgb,var(--fg7) 40%,transparent);color:var(--fg4);margin-left:4px;font-weight:700;letter-spacing:.03em;text-transform:uppercase">${esc(label)}</span>`:'';
  const protoHtml=proto==='acp'?'<span style="font-size:9px;padding:1px 5px;border-radius:4px;background:color-mix(in srgb,var(--accent2) 18%,transparent);color:var(--accent2);margin-left:4px;font-weight:700;letter-spacing:.03em;text-transform:uppercase">ACP</span>':'';
  const item=document.createElement('div');
  item.className='dbg-item';
  item.innerHTML=`<span class="dbg-dir" style="background:color-mix(in srgb,${dirColor} 14%,transparent);color:${dirColor}">${dir}</span> <span class="dbg-type">${esc(String(type))}</span>${labelHtml}${protoHtml}<span class="dbg-time">${ts}</span><div class="dbg-json">${esc(JSON.stringify(data,null,2))}</div>`;
  item.addEventListener('click',(ev)=>{if(ev.target.closest('.dbg-json'))return;item.classList.toggle('expanded')});
  el.appendChild(item);
  while(el.children.length>500)el.firstElementChild?.remove();
  flashDebugButton();
  syncDebugUi();
  if(debugOpen)el.scrollTop=el.scrollHeight;
}
syncDebugUi();

/* Auto-approve — per session state, stored in a map keyed by session ID */
const sessionAutoApprove=new Map(); // sessionId → boolean
let sessionBooting=false;
let sessionBootingStage='';
let sessionBannerNotice=null;
let sessionBannerAction=null;
let currentWorkingLabel='Agent is working…';
let sessionListStatusNotice=null;
let sessionListStatusTimer=null;
let sessionListBlockedReason='';
function renderFormStatus(){
  if(!$.formMsg)return;
  $.formMsg.className='col-new-msg';
  if(!formStatusNotice){$.formMsg.textContent='';return}
  $.formMsg.textContent=formStatusNotice.message;
  $.formMsg.classList.add(`is-${formStatusNotice.tone||'loading'}`)
}
function renderSessionListStatus(){
  if(!$.sessionListMsg)return;
  $.sessionListMsg.className='col-list-msg';
  if(!sessionListStatusNotice){$.sessionListMsg.textContent='';return}
  $.sessionListMsg.textContent=sessionListStatusNotice.message;
  $.sessionListMsg.classList.add(`is-${sessionListStatusNotice.tone||'loading'}`)
}
function clearSessionListStatus(){
  clearTimeout(sessionListStatusTimer);
  sessionListStatusTimer=null;
  sessionListStatusNotice=null;
  renderSessionListStatus()
}
function setSessionListStatus(message='',tone='loading',timeout=0){
  clearTimeout(sessionListStatusTimer);
  sessionListStatusTimer=null;
  if(!message){clearSessionListStatus();return}
  sessionListStatusNotice={message,tone};
  renderSessionListStatus();
  if(timeout>0){
    const marker=`${tone}:${message}`;
    sessionListStatusTimer=setTimeout(()=>{if(sessionListStatusNotice&&`${sessionListStatusNotice.tone}:${sessionListStatusNotice.message}`===marker)clearSessionListStatus()},timeout)
  }
}
function clearFormStatus(source=''){
  if(!source)clearSessionListStatus();
  if(source==='join'){clearSessionListStatus();return}
  if(source&&formStatusNotice?.source!==source)return;
  clearTimeout(formStatusTimer);
  formStatusTimer=null;
  formStatusNotice=null;
  renderFormStatus()
}
function setFormStatus(message='',tone='loading',timeout=0,source='manual'){
  if(source==='join'){setSessionListStatus(message,tone,timeout);return}
  clearTimeout(formStatusTimer);
  formStatusTimer=null;
  if(!message){clearFormStatus(source);return}
  formStatusNotice={message,tone,source};
  renderFormStatus();
  if(timeout>0){
    const marker=`${source}:${message}`;
    formStatusTimer=setTimeout(()=>{if(formStatusNotice&&`${formStatusNotice.source}:${formStatusNotice.message}`===marker)clearFormStatus(source)},timeout)
  }
}
function getImplicitSessionBanner(){
  if(!rid||!uid)return null;
  if(ss.stopping)return {source:'state',label:'Stopping',text:'Waiting for the current response to stop.',tone:'warn'};
  if(currentStatusState==='permission')return {source:'state',label:'Approval',text:'This turn is waiting for a permission decision.',tone:'warn'};
  return null;
}
function getSessionBannerNotice(){return sessionBannerNotice||(sessionBooting?{source:'boot',label:'Starting',text:sessionBootingStage||'Preparing session…',tone:'info'}:getImplicitSessionBanner())}
function isHistoricalStartupEnvelope(e){return isStartupStatusEnvelope(e)}
function isSessionBannerLoading(notice){return !!notice&&notice.tone==='info'&&(notice.source==='history'||notice.source==='boot')}
function clearStaleCreateLoadingStatus(){if(formStatusNotice?.source==='create'&&formStatusNotice?.tone==='loading')clearFormStatus('create')}
function renderSessionBanner(){
  if(!$.asyncBanner)return;
  const notice=rid?getSessionBannerNotice():null;
  $.asyncBanner.className='async-banner hidden';
  sessionBannerAction=null;
  if(!notice){
    $.asyncBannerPill.textContent='Working';
    $.asyncBannerText.textContent='';
    $.asyncBannerAction.classList.add('hidden');
    $.asyncBannerAction.textContent='';
    return
  }
  $.asyncBanner.classList.remove('hidden');
  $.asyncBanner.classList.add(`is-${notice.tone||'info'}`);
  $.asyncBanner.classList.toggle('is-loading',isSessionBannerLoading(notice));
  $.asyncBannerPill.textContent=notice.label||'Working';
  $.asyncBannerText.textContent=notice.text||'';
  sessionBannerAction=typeof notice.action==='function'?notice.action:null;
  if(notice.actionText&&sessionBannerAction){$.asyncBannerAction.textContent=notice.actionText;$.asyncBannerAction.classList.remove('hidden')}else{$.asyncBannerAction.classList.add('hidden');$.asyncBannerAction.textContent=''}
}
function setSessionBanner(notice=null){sessionBannerNotice=notice?{...notice}:null;renderSessionBanner()}
function clearSessionBanner(source=''){if(source&&sessionBannerNotice?.source!==source)return;sessionBannerNotice=null;renderSessionBanner()}
window.runSessionBannerAction=async()=>{if(sessionBannerAction)await sessionBannerAction()};
function setWorkingLabel(message='Agent is working…'){
  currentWorkingLabel=message||'Agent is working…';
  if($.toolbarWorkingText)$.toolbarWorkingText.textContent=currentWorkingLabel;
  renderSessionBanner()
}
function resetWorkingLabel(){setWorkingLabel('Agent is working…')}
function syncSendButton(){
  const enabled=!!uid&&!!rid&&!sessionBooting&&!isCurrentSessionReadOnly();
  const isStop=!!rid&&(ss.processing||ss.stopping);
  $.sb.classList.toggle('stop',isStop);
  $.sb.classList.toggle('is-pending',!!ss.stopping);
  $.sb.textContent=isStop?'■':'↑';
  $.sb.title=!enabled?(isCurrentSessionReadOnly()?currentSessionPermissionMessage():'Unavailable'):ss.stopping?'Stopping current response… click again to retry':ss.processing?'Stop current response':'Send message';
  $.sb.disabled=!enabled
}
function syncComposer(){const enabled=!!uid&&!!rid&&!sessionBooting&&!isCurrentSessionReadOnly();$.mi.disabled=!enabled||!!ss.stopping;$.mi.placeholder=sessionBooting?'Please wait…':ss.stopping?'Stopping response…':isCurrentSessionReadOnly()?currentSessionPermissionMessage():selectedDelegationTarget?`Delegate to ${selectedDelegationTarget.label} …`:'Type a message …';renderSelectedDelegationTarget();syncSendButton()}
function setSessionBooting(next,stage=''){sessionBooting=!!next;sessionBootingStage=sessionBooting?(stage||sessionBootingStage||'Preparing session…'):'';if(!sessionBooting)clearStaleCreateLoadingStatus();syncComposer();renderSessionBanner();syncSt()}
function updateSessionBooting(stage=''){if(!sessionBooting)return;sessionBootingStage=stage||sessionBootingStage;syncComposer();renderSessionBanner();syncSt()}
function markSessionReady(statusMessage='Session ready.'){currentSessionReady=true;if(!sessionBooting){refreshSessionPlaceholder();return}setFormStatus(statusMessage,'success',1800,'create');setSessionBooting(false);clearSessionBanner('error');refreshSessionPlaceholder()}
function noteLiveSessionActivity(){currentSessionReady=true;noteChatContentVisible();if(sessionBooting)markSessionReady();else clearSessionBanner('error')}
function mergeSlashCommands(agentCommands=[]){
  const merged=new Map();
  for(const item of agentCommands){if(item?.cmd)merged.set(item.cmd,item)}
  for(const item of DEFAULT_SLASH_CMDS){if(!merged.has(item.cmd))merged.set(item.cmd,{...item})}
  SLASH_CMDS=[...merged.values()]
}
function normalizeModeKey(modeId=''){return String(modeId||'').split('#').pop().replace(/[^a-z0-9]+/gi,'').toLowerCase()}
function inferModePresentation(agentName,modes=[]){
  if(agentName==='copilot')return MODE_PRESENTATIONS.behavior;
  if(agentName==='claude'||agentName==='codex')return MODE_PRESENTATIONS.access;
  const keys=(modes||[]).map(mode=>normalizeModeKey(mode.id));
  if(keys.some(key=>key==='agent'||key==='autopilot'))return MODE_PRESENTATIONS.behavior;
  if(keys.some(key=>['readonly','fullaccess','acceptedits','dontask','bypasspermissions'].includes(key)))return MODE_PRESENTATIONS.access;
  return MODE_PRESENTATIONS.mode;
}
function supportsUsageTelemetry(agentName){return !!agentName&&USAGE_SUPPORTED_AGENTS.has(agentName)}
function getModelDisplayText(modelId=currentModelId){const model=availableModels.find(item=>item.modelId===modelId)||null;return model?.name||model?.modelId||modelId||'Select'}
function getModelMeta(model){const parts=[];if(model?.modelId&&model?.name&&model.name!==model.modelId)parts.push(model.modelId);if(model?.description)parts.push(model.description);return parts.join(' · ')}
function getModeDisplayText(modeId=currentModeId){const mode=availableModes.find(item=>item.id===modeId)||null;return mode?.name||mode?.id||modeId||'Select'}
function getModeMeta(mode){const parts=[];if(mode?.description)parts.push(mode.description);if(mode?.id&&mode?.name&&mode.name!==mode.id)parts.push(mode.id);return parts.join(' · ')}
function syncModelButton(){
  const current=document.getElementById('model-current');
  const button=document.getElementById('model-btn');
  const picker=document.getElementById('model-picker');
  const text=currentModelId?getModelDisplayText():'Select';
  if(current)current.textContent=text;
  if(button)button.title=currentModelId?`Model: ${text}`:'Choose model';
  if(picker)picker.classList.toggle('show',!!currentModelId||availableModels.length>0);
}
function syncModeButton(){
  const presentation=inferModePresentation(currentAgentName,availableModes);
  const label=document.getElementById('mode-label');
  const current=document.getElementById('mode-current');
  const button=document.getElementById('mode-btn');
  const picker=document.getElementById('mode-picker');
  if(label)label.textContent=presentation.label;
  if(current)current.textContent=currentModeId?getModeDisplayText():'Select';
  if(button)button.title=presentation.title;
  if(picker)picker.classList.toggle('show',!!currentModeId||availableModes.length>0);
}
function syncUsageTelemetry(){
  const container=document.getElementById('usage-ring-container');
  const arc=document.getElementById('usage-arc');
  const label=document.getElementById('usage-label');
  if(!container||!arc||!label)return;
  const active=!!rid&&!!uid&&!!currentAgentName;
  if(!active){container.classList.remove('show','disabled');return}
  const supported=supportsUsageTelemetry(currentAgentName);
  if(!supported||usageSize<=0){
    container.classList.remove('show','disabled');
    label.textContent='';
    container.title=supported?'Context window usage. Waiting for agent telemetry.':'This agent does not support context window usage.';
    arc.setAttribute('stroke-dashoffset','50.27');
    arc.style.stroke=supported?'var(--accent)':'var(--fg6)';
    return;
  }
  container.classList.add('show');
  container.classList.remove('disabled');
  container.title='Context window usage';
}
function syncSessionToolbarMeta(){syncModelButton();syncModeButton();syncUsageTelemetry();updateToolbarVisibility()}
function hasVisibleSessionToolbarContent(){
  return !!(
    document.getElementById('model-picker')?.classList.contains('show')
    || document.getElementById('mode-picker')?.classList.contains('show')
    || document.getElementById('usage-ring-container')?.classList.contains('show')
    || document.getElementById('toolbar-working')?.classList.contains('show')
  )
}
function updateToolbarVisibility(){
  const toolbar=document.getElementById('session-toolbar');
  if(!toolbar)return;
  const show=hasVisibleSessionToolbarContent();
  toolbar.classList.toggle('show',!!show)
}
function resetSessionToolbar(){
  availableModels=[];currentModelId='';availableModes=[];currentModeId='';usageSize=0;usageUsed=0;SLASH_CMDS=DEFAULT_SLASH_CMDS.map(c=>({...c}));
  document.getElementById('model-picker')?.classList.remove('show');
  document.getElementById('mode-picker')?.classList.remove('show');
  document.getElementById('model-dropdown')?.classList.remove('show');
  document.getElementById('mode-dropdown')?.classList.remove('show');
  document.getElementById('usage-ring-container')?.classList.remove('show','disabled');
  document.getElementById('toolbar-working')?.classList.remove('show');
  const usageLabel=document.getElementById('usage-label');if(usageLabel)usageLabel.textContent='';
  if($.toolbarWorkingText)$.toolbarWorkingText.textContent='Agent is working…';
  const usageArc=document.getElementById('usage-arc');if(usageArc){usageArc.setAttribute('stroke-dashoffset','50.27');usageArc.style.stroke='var(--accent)'}
  syncSessionToolbarMeta();
  updateToolbarVisibility()
}
function renderModelDropdown(){
  const dd=document.getElementById('model-dropdown');
  if(!dd)return;
  if(!availableModels.length){dd.innerHTML='<div class="toolbar-item empty">No models available</div>';return}
  dd.innerHTML=availableModels.map(model=>{
    const meta=getModelMeta(model);
    return `<div class="toolbar-item${model.modelId===currentModelId?' current':''}" data-action="select-model" data-model-id="${esc(model.modelId)}"><div class="toolbar-item-title">${esc(model.name||model.modelId)}${model.modelId===currentModelId?' ✓':''}</div>${meta?`<div class="toolbar-item-meta">${esc(meta)}</div>`:''}</div>`;
  }).join('')
}
function renderModeDropdown(){
  const dd=document.getElementById('mode-dropdown');
  if(!dd)return;
  if(!availableModes.length){dd.innerHTML='<div class="toolbar-item empty">No modes available</div>';return}
  dd.innerHTML=availableModes.map(mode=>{
    const meta=getModeMeta(mode);
    return `<div class="toolbar-item${mode.id===currentModeId?' current':''}" data-action="select-mode" data-mode-id="${esc(mode.id)}"><div class="toolbar-item-title">${esc(mode.name||mode.id)}${mode.id===currentModeId?' ✓':''}</div>${meta?`<div class="toolbar-item-meta">${esc(meta)}</div>`:''}</div>`;
  }).join('')
}
window.toggleModelDropdown=()=>{if(!availableModels.length)return;const dd=document.getElementById('model-dropdown');if(!dd)return;dd.classList.toggle('show');document.getElementById('mode-dropdown')?.classList.remove('show');if(dd.classList.contains('show'))renderModelDropdown()};
window.toggleModeDropdown=()=>{if(!availableModes.length)return;const dd=document.getElementById('mode-dropdown');if(!dd)return;dd.classList.toggle('show');document.getElementById('model-dropdown')?.classList.remove('show');if(dd.classList.contains('show'))renderModeDropdown()};
window.selectModel=(modelId)=>{document.getElementById('model-dropdown')?.classList.remove('show');if(rid&&cc)cc.sendToRoom(rid,JSON.stringify({type:'user.command',command:`/model ${modelId}`}))};
window.selectMode=(modeId)=>{document.getElementById('mode-dropdown')?.classList.remove('show');if(rid&&cc)cc.sendToRoom(rid,JSON.stringify({type:'user.command',command:`/mode ${modeId}`}))};
function updateUsageRing(used,size){
  // Some agents briefly emit a zeroed usage update while the previous nonzero
  // value is still the best known state for the current session. Ignore that
  // regression unless the session has been reset.
  if(size>0&&used===0&&usageSize===size&&usageUsed>0)used=usageUsed;
  usageUsed=used;usageSize=size;
  const pct=size>0?Math.min(used/size,1):0;
  const circumference=50.27;
  const offset=circumference*(1-pct);
  const arc=document.getElementById('usage-arc');
  const label=document.getElementById('usage-label');
  if(!arc||!label)return;
  document.getElementById('usage-ring-container')?.classList.remove('disabled');
  arc.setAttribute('stroke-dashoffset',offset.toFixed(2));
  arc.style.stroke=pct<0.5?'var(--accent)':pct<0.8?'#f0a030':'#e04040';
  label.textContent=`${Math.round(pct*100)}%${size>=1000?` (${(used/1000).toFixed(used>=100000?0:1)}k/${(size/1000).toFixed(0)}k)`:''}`;
  syncUsageTelemetry();
  updateToolbarVisibility()
}
function getAutoApprove(){return rid?(sessionAutoApprove.has(rid)?sessionAutoApprove.get(rid):true):false}
function toggleAutoApprove(){if(!rid)return;sessionAutoApprove.set(rid,!getAutoApprove());syncAutoBtn()}
window.toggleAutoApprove=toggleAutoApprove;
function syncAutoBtn(){
  const b=document.getElementById('auto-approve-btn');
  const on=getAutoApprove();
  b.classList.remove('tb-strategy','auto-off');
  b.classList.toggle('auto-on',on);
  b.setAttribute('aria-pressed',on?'true':'false');
  b.innerHTML=on?'<span style="margin-right:4px">✓</span> Approvals: Auto':'<span style="margin-right:4px">✕</span> Approvals: Manual';
  b.title='Portal-side auto response for permission requests only. Separate from the agent\'s own access mode.';
}
function updateAutoBtn(){document.getElementById('auto-approve-btn').style.display=rid&&uid?'':'none';syncAutoBtn()}
let userAvatar='';
const USER_AVATAR_FALLBACK_ICON=buildSpriteIcon(UI_SPRITE_PATH,'avatar-fallback',{width:20,height:20,viewBox:'0 0 20 20',fill:'var(--fg5)',className:'tb-avatar-fallback',style:'flex-shrink:0;border-radius:50%;background:var(--bg4);display:block'});
function syncUserBadge(){if($.userBadge){const avatarHtml=userAvatar?`<img class="tb-avatar" src="${esc(userAvatar)}" alt="">`:USER_AVATAR_FALLBACK_ICON;$.userBadge.innerHTML=uid?avatarHtml+esc(uid):'';$.userBadge.style.display=uid?'inline-flex':'none'}if($.logoutBtn)$.logoutBtn.style.display=uid?'':'none'}
function syncOauthLoginCard(message='',isError=false){
  if(!oauthMode)return;
  const copy=document.getElementById('login-copy-oauth');
  const btn=document.getElementById('github-login-btn');
  const label=document.getElementById('github-login-label');
  const msg=document.getElementById('login-msg-oauth');
  if(!copy||!btn||!label||!msg)return;
  const signedIn=!!oauthAuthenticatedUser?.login;
  let resolvedMessage=String(message||'').trim();
  let resolvedError=!!isError;
  if(signedIn&&!resolvedMessage){
    if(portalTransportState==='connecting')resolvedMessage='GitHub sign-in complete. Connecting to WPS…';
    else if(portalTransportState==='failed'){
      resolvedMessage=portalTransportError?`GitHub sign-in complete, but WPS connection failed: ${portalTransportError}`:'GitHub sign-in complete, but WPS connection failed.';
      resolvedError=true;
    }else if(portalTransportState==='disconnected'&&!uid)resolvedMessage='GitHub sign-in complete. Retry the WPS connection.';
  }
  copy.textContent=signedIn?`Signed in as ${oauthAuthenticatedUser.login}.`:OAUTH_LOGIN_COPY_DEFAULT;
  msg.textContent=resolvedMessage;
  msg.style.color=resolvedError?'#ff8f8f':'';
  btn.removeAttribute('aria-busy');
  if(!signedIn){
    btn.disabled=false;
    btn.style.display='inline-flex';
    label.textContent='Sign in with GitHub';
    return;
  }
  if(uid){
    btn.disabled=false;
    btn.style.display='none';
    label.textContent='Retry WPS connection';
    return;
  }
  btn.style.display='inline-flex';
  if(portalTransportState==='connecting'){
    btn.disabled=true;
    btn.setAttribute('aria-busy','true');
    label.textContent='Connecting…';
    return;
  }
  btn.disabled=false;
  label.textContent='Retry WPS connection';
}
function setOauthAuthenticatedUser(user){oauthAuthenticatedUser=user?{login:String(user.login||''),avatar:user.avatar||''}:null;syncOauthLoginCard()}
let currentStatusState='disconnected';
function syncPortalRail(){
  const topbar=document.getElementById('topbar');
  if(!topbar)return;
  topbar.dataset.wpsState=portalTransportState||'disconnected';
  topbar.dataset.sessionState=rid?'ready':'idle';
  topbar.dataset.railActive=(portalTransportState==='connected'||portalTransportState==='connecting')?'true':'false';
}
function setPortalTransportState(state,error=''){portalTransportState=state;portalTransportError=String(error||'').trim();syncPortalRail();syncSt();syncOauthLoginCard()}
syncPortalRail();
function retryPortalConnection(){if(!oauthAuthenticatedUser?.login)return;void loginUser(oauthAuthenticatedUser.login)}
function handleOauthAction(){if(oauthAuthenticatedUser?.login){retryPortalConnection();return}window.location.href='/auth/login'}
window.handleOauthAction=handleOauthAction;
function renderColumnStateCard({title,detail='',icon='',kind='empty',lead='',extra=''}){
  const iconMarkup=icon?`<div class="col-empty-icon">${esc(icon)}</div>`:'';
  return `<div class="col-empty col-empty--${esc(kind)}">${lead}${iconMarkup}<div class="col-empty-title">${esc(title)}</div>${detail?`<div class="col-empty-detail">${esc(detail)}</div>`:''}${extra}</div>`;
}
function renderColumnLoadingState(title,detail=''){return renderColumnStateCard({title,detail,kind:'loading',lead:'<div class="col-empty-spinner" aria-hidden="true"></div>'})}
function daemonAdminUsersMeta(daemon){
  const admins=daemonAdminUsers(daemon);
  return `Admin users: ${admins.length?admins.join(', '):'none'}`;
}
function daemonAdminUsers(daemon){
  return [...new Set([
    ...(Array.isArray(daemon?.adminUsers)?daemon.adminUsers:[]),
    ...portalApproverUserIds(daemon),
  ].map(value=>String(value||'').trim()).filter(Boolean))];
}
function daemonAccessGuidance(daemon,{compact=false}={}){
  if(!daemon)return'';
  if(daemon.canManage)return compact?'Open the main daemon column drawer to edit member and admin lists.':'Open the edit drawer to manage member and admin users without enlarging this column.';
  if(!daemonHasMemberAccess(daemon))return'Request member or admin access to reveal sessions on this daemon.';
  if(!daemonHasAdminAccess(daemon))return'You can browse shared sessions here, but daemon admin access is required to create new ones.';
  return'Only the daemon manager can change daemon access.';
}
function renderDaemonAccessSummaryCard(daemonId,daemon){
  const canEdit=!!daemon?.canManage;
  const action=canEdit?`<button class="ci-join daemon-access-summary-action" type="button" data-action="open-daemon-access-drawer" data-daemon-id="${esc(daemonId)}">Edit Permission</button>`:'';
  return `<div class="daemon-access-summary"><div class="daemon-access-summary-head"><div class="daemon-access-summary-roleline"><span class="daemon-access-summary-label">Your role</span><span class="daemon-access-summary-role ${daemonAccessToneClass(daemon)}">${esc(daemonAccessLevelLabel(daemon))}</span></div>${action}</div>${canEdit?'':daemonAccessButtons(daemon,{compact:true})}</div>`
}
function freshDaemonEntries(){return [...knownDaemons.entries()].filter(([,daemon])=>isDaemonRecordFresh(daemon,Date.now(),DAEMON_STALE_MS))}
function isCreateSelectableDaemon(daemon){
  return deriveCreateSelectableDaemon(daemon,getCreateSessionAccessState)
}
function hasCreatableDaemonEntry(){return freshDaemonEntries().some(([,daemon])=>isCreateSelectableDaemon(daemon))}
function daemonAgentOptions(daemon){
  return buildCreateSessionAgentOptions(daemon,{testedAgents:TESTED_ACP_AGENTS,agentNames:AGENT_NAMES,agentIcons:AGENT_ICONS,agentColors:AGENT_COLORS})
}
function currentCreateDaemonId(){return String(createSessionDraft.daemonId||'').trim()}
function currentCreateDaemon(){return knownDaemons.get(currentCreateDaemonId())||null}
function ensureCreateSessionDraft({preserveDirectory=false}={}){
  const nextDraft=buildCreateSessionDraft({
    draft:createSessionDraft,
    daemonEntries:freshDaemonEntries(),
    currentDaemonId,
    currentAgentName,
    directoryInputValue:$.dirIn?.value||'',
    preserveDirectory,
    getDaemonById:(daemonId)=>knownDaemons.get(daemonId)||null,
    isCreateSelectableDaemon,
    buildAgentOptions:daemonAgentOptions,
  });
  createSessionDraft.daemonId=nextDraft.daemonId;
  createSessionDraft.agentName=nextDraft.agentName;
  createSessionDraft.directory=nextDraft.directory;
  const agentInput=document.getElementById('f-agent');
  if(agentInput)agentInput.value=createSessionDraft.agentName;
  if($.dirIn)$.dirIn.value=createSessionDraft.directory;
  if(!createSessionDraft.daemonId)clearDirectorySuggestions();
}
function renderCreateDaemonList(){
  if(!$.createDaemonList)return;
  const daemonId=currentCreateDaemonId();
  const daemon=daemonId?knownDaemons.get(daemonId):null;
  $.createDaemonList.innerHTML=buildCreateDaemonListMarkup({daemonId,daemon,sessionCount:countSessionsForDaemon(daemonId),normalizeDaemonPlatform,osIcons:OS_ICONS,osNames:OS_NAMES,escapeHtml:esc});
}
function renderCreateAgentList(){
  if(!$.createAgentList)return;
  $.createAgentList.innerHTML=buildCreateAgentListMarkup({daemon:currentCreateDaemon(),selectedAgentName:createSessionDraft.agentName,hasCreatableDaemonEntry:hasCreatableDaemonEntry(),buildAgentOptions:daemonAgentOptions,renderEmptyState:({title,detail,icon})=>`<div class="session-global-empty">${renderColumnStateCard({title,detail,icon})}</div>`,escapeHtml:esc});
}
function renderCreateSessionModal(){
  if(!$.createSessionModal||!$.createSessionOverlay)return;
  const open=createSessionModalOpen;
  $.createSessionModal.classList.toggle('open',open);
  $.createSessionOverlay.classList.toggle('open',open);
  $.createSessionModal.setAttribute('aria-hidden',open?'false':'true');
  if(!open)return;
  ensureCreateSessionDraft({preserveDirectory:true});
  renderCreateDaemonList();
  renderCreateAgentList();
  renderSelectedDirectory();
  syncCreateSessionButton();
}
function openCreateSessionModal(){
  createSessionModalOpen=true;
  createSessionDraft.daemonId=currentDaemonId||'';
  ensureCreateSessionDraft();
  clearFormStatus('create');
  renderCreateSessionModal();
}
function closeCreateSessionModal(){
  createSessionModalOpen=false;
  clearFormStatus('create');
  renderCreateSessionModal();
}
window.openCreateSessionModal=openCreateSessionModal;
window.closeCreateSessionModal=closeCreateSessionModal;
window.selectCreateDaemon=(daemonId)=>{
  if(!daemonId)return;
  createSessionDraft.daemonId=daemonId;
  createSessionDraft.agentName='';
  ensureCreateSessionDraft();
  renderCreateSessionModal();
};
window.selectCreateAgent=(agentName)=>{
  if(!agentName)return;
  createSessionDraft.agentName=agentName;
  const agentInput=document.getElementById('f-agent');
  if(agentInput)agentInput.value=agentName;
  renderCreateSessionModal();
};
function renderCompactNav(){
  if(!$.compactNav)return;
  const daemonsList=document.getElementById('col-daemons-list');
  const sessionsList=document.getElementById('col-sessions-list');
  const groupbyBar=document.getElementById('session-groupby-bar');
  const groupbyHtml=groupbyBar?`<div class="compact-groupby">${groupbyBar.innerHTML}</div>`:'';
  $.compactNav.innerHTML=buildCompactNavMarkup({
    daemonsHtml:daemonsList?.innerHTML||'',
    sessionsHtml:sessionsList?.innerHTML||'',
    groupByHtml:groupbyHtml,
  });
}
function syncCompactButton(){if(!$.compactBtn)return;const show=!!uid&&!isMobile();$.compactBtn.style.display=show?'inline-flex':'none';if($.chatColTop)$.chatColTop.style.display='none';$.compactBtn.classList.toggle('active',show&&compactNav);$.compactBtn.title=compactNav?'Restore side panels':'Expand chat area';$.compactBtn.textContent=compactNav?'⤡':'⤢';document.getElementById('column-nav').classList.toggle('compact',!!uid&&!isMobile()&&compactNav);renderCompactNav()}
function setCompactNav(next){compactNav=!!next&&!!uid&&!isMobile();syncCompactButton()}
function restoreExpandedNav(){setCompactNav(false)}
window.restoreExpandedNav=restoreExpandedNav;
function setLoginMessage(message='',isError=false){const target=oauthMode?document.getElementById('login-msg-oauth'):$.loginMsg;if(!target)return;target.textContent=message;target.style.color=isError?'#ff8f8f':'';if(oauthMode)syncOauthLoginCard(message,isError)}
function setCol(id,visible,display='flex'){const el=document.getElementById(id);if(!el)return;const wasHidden=el.style.display==='none';el.style.display=visible?display:'none';if(visible&&wasHidden){el.classList.remove('col-enter');void el.offsetWidth;el.classList.add('col-enter')}}
function setColumnDisabled(id,disabled){const el=document.getElementById(id);if(el)el.classList.toggle('is-disabled',disabled)}
function directoryBadgeHtml(daemon,pathValue=''){
  if(!daemon)return '';
  const platform=normalizeDaemonPlatform(daemon?.platform);
  const osIcon=OS_ICONS[platform]||'🖥';
  return `<span class="dir-field-badge-icon">${osIcon}</span>`;
}
function directoryMetaText(daemon,pathValue=''){
  return '';
}
function syncDirectoryBadge(daemon,pathValue=''){
  const badge=document.getElementById('f-dir-badge');
  if(!badge)return;
  badge.innerHTML=directoryBadgeHtml(daemon,pathValue);
}
function renderSelectedDirectory(){
  const daemon=currentCreateDaemon();
  const dirOsIcon=document.getElementById('f-dir-os-icon');
  if(dirOsIcon){
    const p=normalizeDaemonPlatform(daemon?.platform);
    dirOsIcon.innerHTML=daemon?(OS_ICONS[p]||'🖥'):'';
  }
  if($.dirIn)$.dirIn.disabled=!daemon;
  if(!daemon){
    if($.dirIn){
      $.dirIn.value='';
      $.dirIn.placeholder=hasCreatableDaemonEntry()?'Select a workspace first':'No create-capable workspace available';
    }
    syncDirectoryBadge(null,'');
    if($.dirMeta)$.dirMeta.innerHTML='';
    return;
  }
  const value=normalizePickerPath($.dirIn?.value||createSessionDraft.directory||'',daemon?.platform);
  createSessionDraft.directory=value;
  if($.dirIn)$.dirIn.value=value;
  syncDirectoryBadge(daemon,value);
  if($.dirMeta)$.dirMeta.innerHTML=directoryMetaText(daemon,value);
  if($.dirIn){
    const fallback=normalizePickerPath(defaultDirectoryForDaemon(daemon),daemon?.platform);
    $.dirIn.placeholder=fallback||'Enter an absolute project path';
  }
}
function setSelectedDirectory(pathValue='',source='manual'){
  const daemon=currentCreateDaemon();
  const value=normalizePickerPath(pathValue,daemon?.platform);
  createSessionDraft.directory=value;
  if($.dirIn)$.dirIn.value=value;
  renderSelectedDirectory();
  syncCreateSessionButton();
  if(source==='input'||source==='auto')void refreshDirectorySuggestions(value,{silent:true});
}
function syncCreateSessionButton(){
  const button=document.getElementById('f-btn');
  const openBtn=document.getElementById('open-create-session-btn');
  const currentDaemon=currentDaemonId?knownDaemons.get(currentDaemonId):null;
  const daemon=currentCreateDaemon();
  const dirValue=normalizePickerPath(document.getElementById('f-dir')?.value.trim()||createSessionDraft.directory||'',daemon?.platform);
  const buttonState=buildCreateSessionButtonState({openDaemonId:currentDaemonId,openDaemon:currentDaemon,selectedDaemonId:currentCreateDaemonId(),selectedDaemon:daemon,selectedAgentName:createSessionDraft.agentName,directoryValue:dirValue,hasCreatableDaemonEntry:hasCreatableDaemonEntry(),isCreateSelectableDaemon,getCreateSessionAccessState});
  if(openBtn){
    openBtn.disabled=buttonState.openButtonDisabled;
    openBtn.title=buttonState.openButtonTitle;
  }
  if(!button)return;
  if(button.dataset.busy!=='true'){
    button.disabled=buttonState.submitDisabled;
    button.textContent=buttonState.submitText;
    button.classList.toggle('is-blocked',buttonState.submitBlocked);
    button.title=buttonState.submitTitle;
  }
}
async function requestWorkspaceListing(pathValue='',query='',daemonId=currentCreateDaemonId()){
  if(!daemonId)throw new Error('Select a workspace first');
  const params=new URLSearchParams();
  if(pathValue&&pathValue!==DIR_PICKER_ROOT)params.set('path',pathValue);
  if(query)params.set('query',query);
  return portalJson(`/api/daemons/${encodeURIComponent(daemonId)}/directories?${params.toString()}`);
}
function clearDirectorySuggestions(){if($.dirSuggestions)$.dirSuggestions.innerHTML=''}
function shouldBrowseSelectedDaemonDirectories(){
  return canBrowseDaemonDirectories(currentCreateDaemon());
}
function setDirectoryMeta(message='',tone=''){
  if(!$.dirMeta)return;
  syncDirectoryBadge(currentCreateDaemon(),$.dirIn?.value||'');
  $.dirMeta.innerHTML=message||directoryMetaText(currentCreateDaemon(),$.dirIn?.value||'');
  $.dirMeta.className='dir-input-meta';
  if(tone)$.dirMeta.classList.add(`is-${tone}`)
}
function renderDirectorySuggestions(items=[],response=null){
  if(!$.dirSuggestions)return;
  $.dirSuggestions.innerHTML=buildDirectorySuggestionsMarkup(items,response,esc);
}
async function refreshDirectorySuggestions(rawValue='',{silent=false}={}){
  if(!uid||!cc||!currentCreateDaemonId()){clearDirectorySuggestions();return}
  const daemon=currentCreateDaemon();
  if(!shouldBrowseSelectedDaemonDirectories()){
    clearDirectorySuggestions();
    if(!silent&&daemon){
      const {blocked,readOnly}=getCreateSessionAccessState(daemon);
      if(blocked)setDirectoryMeta('You need daemon access before browsing directories.','error');
      else if(readOnly)setDirectoryMeta('Directory browsing requires daemon admin access.','');
    }
    return;
  }
  const inputValue=String(rawValue||'').trim();
  const token=++directorySuggestionToken;
  try{
    const response=await requestWorkspaceListing(inputValue,'',currentCreateDaemonId());
    if(token!==directorySuggestionToken)return;
    const items=[...(response.favorites||[]),...(response.roots||[]),...(response.dirs||[])];
    renderDirectorySuggestions(items,response);
    if(!silent)setDirectoryMeta(items.length?directoryMetaText(daemon,inputValue):'No matching suggestions.','');
  }catch(err){
    if(token!==directorySuggestionToken)return;
    clearDirectorySuggestions();
    if(!silent)setDirectoryMeta(err?.message||'Failed to load directory suggestions.','error');
  }
}
function scheduleDirectorySuggestions(rawValue=''){
  if(!shouldBrowseSelectedDaemonDirectories()){clearTimeout(directorySuggestionTimer);directorySuggestionTimer=null;clearDirectorySuggestions();return}
  clearTimeout(directorySuggestionTimer);
  directorySuggestionTimer=setTimeout(()=>{directorySuggestionTimer=null;void refreshDirectorySuggestions(rawValue)},180);
}
function resetChatState(){
  $.chat.innerHTML='';pd.clear();rd.clear();at.clear();pp.clear();tc.clear();hideWorking();$wi=null;
  lastStatusMessage='';lastStatusAt=0;
  cancelSessionLiveSyncRetry();
  lastSemanticRender=null;currentSessionReady=null;latestSessionHistorySummary=createSessionHistorySummary();chatPlaceholderOverride=null;
  livePermissionResponses.clear();
  seenRoomMessageIds.clear();
  clearSessionBanner();
  clearFormStatus();
  resetWorkingLabel();
  resetSessionToolbar();
  clearSelectedDelegationTarget();
  lastStopRequestAt=0;
  ss.processing=false;ss.pendingCount=0;ss.stopping=false;sendMode='enqueue';historyLoadedAt=0;setSt(uid?'idle':'disconnected')
}
function skeletonColumn(rows=4){return `<div class="col-skeleton">${Array.from({length:rows},(_,index)=>`<div class="sk-row"><span class="sk-icon"></span><div class="sk-text"><span class="sk-line ${index%2===0?'w-75':'w-65'}"></span><span class="sk-line ${index%3===0?'w-40':'w-55'}"></span></div></div>`).join('')}</div>`}
function joinedRoomIds(){return new Set((cc?.rooms||[]).filter(r=>r.roomId!==LOBBY_ROOM).map(r=>r.roomId))}
function hasLiveRoomJoin(roomId){const targetRoomId=String(roomId||'').trim();return !!(targetRoomId&&cc&&typeof cc.hasJoinedRoom==='function'&&cc.hasJoinedRoom(targetRoomId))}
function knownRoomInfosForRouting(){return collectKnownRoomInfos({chatRooms:cc?.rooms||[],supplementalRoomInfos,currentSession:rid?(discoveredSessions.get(rid)||{sessionId:rid}):null})}
function sessionLabel(session){const dir=session.workingDirectory||'';return dir.split(/[/\\]/).pop()||session.name||'Session'}
function daemonHasMemberAccess(daemon){return portalDaemonHasMemberAccess(daemon)}
function daemonHasAdminAccess(daemon){return portalDaemonHasAdminAccess(daemon)}
function sessionRequestState(sessionId){return joinRequests.get(sessionId)||{}}
function sessionJoinStatus(sessionId){return sessionRequestState(sessionId).status||''}
function sessionRequestedAccess(sessionId){return sessionRequestState(sessionId).requestedAccess||''}
function countSessionsForDaemon(daemonId){
  if(!daemonId)return 0;
  const all=collectVisibleSessions({discoveredSessions,chatRooms:cc?.rooms||[],deletedSessions,lobbyRoomId:LOBBY_ROOM});
  return all.filter(s=>s.daemonId===daemonId).length;
}
function daemonRecordForSession(session){
  const daemonId=String(session?.daemonId||currentDaemonId||'').trim();
  if(!daemonId)return currentDaemonRecord();
  return knownDaemons.get(daemonId)||currentDaemonRecord();
}
function sessionAccessLevel(session){if(!session)return'none';const daemon=daemonRecordForSession(session);if(daemon&&daemonHasAdminAccess(daemon))return'write';const level=String(session.accessLevel||'').toLowerCase();if(level==='write')return'write';if(session.canWrite)return'write';if(level==='read')return'read';return session.canRead?'read':'none'}
function sessionCanRead(session){return sessionAccessLevel(session)!=='none'}
function sessionCanWrite(session){return sessionAccessLevel(session)==='write'}
function sessionCanDelete(session){return !!session?.canDelete}
function sessionCanLeave(session,daemon){return !sessionCanDelete(session)&&!daemonHasAdminAccess(daemon)&&sessionCanRead(session)}
function canHydrateSessionMetadata(sessionId,now=Date.now()){
  const lastAttempt=sessionMetadataHydrationLastAttempt.get(sessionId)||0;
  return now-lastAttempt>=SESSION_METADATA_HYDRATE_COOLDOWN_MS;
}
async function hydrateVisibleSessionMetadata(sessions,joined){
  if(!cc)return 0;
  const now=Date.now();
  const targets=(Array.isArray(sessions)?sessions:[])
    .filter(session=>joined.has(session.sessionId)&&sessionNeedsMetadataHydration(session)&&!sessionMetadataHydrationInFlight.has(session.sessionId)&&canHydrateSessionMetadata(session.sessionId,now));
  if(!targets.length)return 0;
  await mapLimit(targets,4,async(session)=>{
    const sessionId=String(session.sessionId||'').trim();
    if(!sessionId)return;
    sessionMetadataHydrationInFlight.add(sessionId);
    sessionMetadataHydrationLastAttempt.set(sessionId,Date.now());
    try{
      const roomInfo=await cc.getRoom(sessionId,false);
      const patch={sessionId};
      const roomName=resolveRoomDisplayName(roomInfo);
      if(roomName&&roomName!=='Session')patch.name=roomName;
      if(roomInfo?.defaultConversationId)patch.defaultConversationId=roomInfo.defaultConversationId;
      if(roomInfo?.updatedAt||roomInfo?.createdAt)patch.updatedAt=roomInfo.updatedAt||roomInfo.createdAt;
      const conversationId=roomInfo?.defaultConversationId;
      if(conversationId&&sessionNeedsMetadataHydration({...session,...patch})){
        const history=await cc.listMessage(conversationId,'0',null,10);
        if(history?.messages?.length){
          for(const message of [...history.messages].reverse()){
            if(!message?.content?.text)continue;
            try{
              const envelope=JSON.parse(message.content.text);
              if(envelope.type==='control.create'){
                patch.workingDirectory=patch.workingDirectory||envelope.workingDirectory;
                patch.agent=envelope.agentName||patch.agent;
                patch.daemonId=patch.daemonId||envelope.daemonId;
                patch.ownerUserId=patch.ownerUserId||envelope.userId;
                break;
              }
            }catch{}
          }
        }
      }
      upsertDiscoveredSession(patch);
    }catch(error){
      portalWarn('session.metadata.hydrate.failed','Session metadata hydrate failed',{sessionId:sessionId.substring(0,8),error})
    }finally{
      sessionMetadataHydrationInFlight.delete(sessionId);
    }
  });
  return targets.length;
}
function sessionOwnerLabel(session){return session?.ownerUserId||'the session owner'}
function normalizeDaemonRecord(daemon){return normalizePortalDaemonRecord(daemon,normalizeDaemonPlatform)}
function mergeDaemonRecord(previous,daemon){return mergeRealtimeDaemonRecord(previous,daemon,normalizeDaemonPlatform)}
function normalizeSessionRecord(session,previous={}){return normalizeSessionDiscoveryRecord(session,previous)}
function currentDaemonRecord(){return knownDaemons.get(currentDaemonId)||null}
function portalApproverUserIds(daemon){
  const approvers=Array.isArray(daemon?.approverUserIds)&&daemon.approverUserIds.length?daemon.approverUserIds:[daemon?.ownerUserId].filter(Boolean);
  return[...new Set(approvers.map(value=>String(value||'').trim()).filter(Boolean))]
}
function daemonApproverLabel(daemon){const approvers=portalApproverUserIds(daemon);return approvers.length?approvers.join(', '):'the daemon owner'}
function daemonAccessLevelLabel(daemon){if(!daemon)return'Unavailable';if(daemon.canManage)return'Owner';if(daemonHasAdminAccess(daemon))return'Admin';if(daemonHasMemberAccess(daemon))return'Member';return'No access'}
function daemonAccessToneClass(daemon){if(!daemon)return'is-unavailable';if(daemon.canManage)return'is-owner';if(daemonHasAdminAccess(daemon))return'is-admin';if(daemonHasMemberAccess(daemon))return'is-member';return'is-none'}
function daemonAccessSummary(daemon){return`Your access: ${daemonAccessLevelLabel(daemon)}`}
function daemonAccessTag(daemon){if(!daemon)return'';if(daemonHasAdminAccess(daemon))return'';if(daemonHasMemberAccess(daemon))return'<span class="ci-tag ci-tag-view">MEMBER</span>';if(!daemon.accessResolved)return'';return'<span class="ci-tag ci-tag-danger">NO ACCESS</span>'}
function currentSessionPermissionMessage(){
  const session=rid?discoveredSessions.get(rid):null;
  const daemon=currentDaemonRecord();
  if(session&&sessionCanRead(session)&&!sessionCanWrite(session))return`This session is read-only for you. Request write access from ${sessionOwnerLabel(session)} to send messages.`;
  if(session&&!sessionCanRead(session))return`You do not have access to this session yet. Request read or write access from ${sessionOwnerLabel(session)}.`;
  if(!daemon)return'Unavailable';
  if(!daemonHasMemberAccess(daemon))return'Daemon blocked. Request member or admin access in the daemon access panel.';
  if(!daemonHasAdminAccess(daemon)&&!session)return'You can browse this daemon, but admin access is required to create sessions.';
  return'Unavailable';
}
function renderSessionEmptyState(title,detail='',icon='💬'){
  return renderColumnStateCard({title,detail,icon});
}
function sessionEmptyStateCopy(daemon){
  if(daemon&&!daemonHasMemberAccess(daemon)){
    return {
      icon:'🔒',
      title:'Sessions for this daemon are hidden.',
      detail:'You need daemon member or admin access. Use the daemon access panel on the left to request it.',
    };
  }
  if(daemon&&!daemonHasAdminAccess(daemon)){
    return {
      icon:'💬',
      title:'No sessions yet',
      detail:'You currently have daemon member access. Shared sessions will appear here when they exist, but daemon admin access is required to create sessions.',
    };
  }
  return {
    icon:'💬',
    title:'No sessions yet',
    detail:'Create one below or join a shared room',
  };
}
function daemonAccessButtons(daemon,{includeMember=true,includeAdmin=true,compact=false}={}){
  if(!uid||!daemon||daemon.canManage)return'';
  const isPending=daemon.accessRequestStatus==='pending';
  const requested=daemon.requestedAccess||'';
  const buttons=[];
  if(includeMember&&!daemonHasMemberAccess(daemon)){
    const label=recentDaemonAccessRequests.has(`${daemon.daemonId}:member`)?'Requested':'Request Member';
    buttons.push(`<button class="ci-join" type="button" data-action="request-daemon-access" data-requested-access="member">${label}</button>`);
  }
  if(includeAdmin&&!daemonHasAdminAccess(daemon)){
    const label=recentDaemonAccessRequests.has(`${daemon.daemonId}:admin`)?'Requested':'Request Admin';
    buttons.push(`<button class="ci-join" type="button" data-action="request-daemon-access" data-requested-access="admin">${label}</button>`);
  }
  if(!buttons.length)return'';
  return `<div class="daemon-access-request-actions${compact?' compact':''}">${buttons.join('')}</div>`;
}
function isCurrentSessionReadOnly(){
  if(!rid||!uid)return false;
  const session=discoveredSessions.get(rid);
  if(session)return !sessionCanWrite(session);
  const daemon=currentDaemonRecord();
  if(!daemon)return false;
  return !daemonHasAdminAccess(daemon);
}
function showChatPlaceholder(show){const el=document.getElementById('chat-placeholder');if(el){if(show)renderChatPlaceholder();el.style.display=show?'flex':'none'}const sc=document.getElementById('scroll');if(sc)sc.style.display=show?'none':'block'}
function invalidateDelegationTargetsCache(){delegationTargetsCache.version+=1;delegationTargetsCache.loadedAt=0;delegationTargetsCache.targets=[];delegationTargetsCache.inflight=null}
function upsertDiscoveredSession(envelope){
  const sessionId=envelope?.sessionId||envelope?.roomId;
  if(!sessionId)return;
  const prev=discoveredSessions.get(sessionId)||{};
  const merged={
    ...prev,
    ...envelope,
    sessionId,
    accessLevel:envelope?.accessLevel??prev.accessLevel,
    canRead:envelope?.canRead??prev.canRead,
    canWrite:envelope?.canWrite??prev.canWrite,
    canDelete:envelope?.canDelete??prev.canDelete,
  };
  discoveredSessions.set(sessionId,normalizeSessionRecord(merged,prev));invalidateDelegationTargetsCache()
}
function removeDiscoveredSession(sessionId){
  if(!sessionId)return;
  discoveredSessions.delete(sessionId);
  deletedSessions.set(sessionId,Date.now());
  supplementalRoomInfos.delete(sessionId);
  roomsPendingLiveSync.delete(sessionId);
  sessionMetadataHydrationInFlight.delete(sessionId);
  sessionMetadataHydrationLastAttempt.delete(sessionId);
  evictRoomFromClientCache(cc,sessionId);
  sessionAutoApprove.delete(sessionId);invalidateDelegationTargetsCache()
}
function makeRequestId(){return globalThis.crypto?.randomUUID?.()||`req-${Date.now()}-${Math.random().toString(16).slice(2)}`}
function waitForLobbyReply(store,requestId,timeoutMs,message){return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{store.delete(requestId);reject(new Error(message))},timeoutMs);store.set(requestId,{resolve,reject,timeout})})}
function settleLobbyReply(store,requestId,error,data={}){const pending=store.get(requestId);if(!pending)return false;clearTimeout(pending.timeout);store.delete(requestId);if(error)pending.reject(new Error(error));else pending.resolve(data);return true}
function createPortalHeaders(headers={},userId=uid){
  const next={...headers};
  if(!oauthMode){
    const explicitUserId=String(userId||'').trim();
    if(explicitUserId&&!next[PORTAL_USER_HEADER])next[PORTAL_USER_HEADER]=explicitUserId;
  }
  return next;
}
async function portalJson(path,options={}){
  const headers=createPortalHeaders(options.headers||{});
  if(options.body!==undefined&&!headers['Content-Type'])headers['Content-Type']='application/json';
  const response=await fetch(path,{...options,headers});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body?.error||body?.message||`Request failed: ${response.status}`);
  return body;
}
function parseUserListInput(value){return[...new Set(String(value||'').split(/[\s,;]+/).map(part=>part.trim()).filter(Boolean))]}
function daemonAccessDraftFor(daemonId,daemon){
  const draft=daemonAccessDrafts.get(daemonId);
  if(draft)return draft;
  return{memberUsers:(daemon?.memberUsers||[]).join(', '),adminUsers:(daemon?.adminUsers||[]).join(', ')}
}
function daemonAccessUsersForField(daemonId,daemon,field){
  const draft=daemonAccessDraftFor(daemonId,daemon);
  return parseUserListInput(draft?.[field]||'')
}
function setDaemonAccessDraftUsers(daemonId,field,users){window.updateDaemonAccessDraft(daemonId,field,users.join(', '))}
window.focusDaemonAccessInput=(inputId)=>{const input=document.getElementById(inputId);if(input instanceof HTMLInputElement)input.focus()};
window.removeDaemonAccessUser=(daemonId,field,user)=>{
  const daemon=knownDaemons.get(daemonId);
  const users=daemonAccessUsersForField(daemonId,daemon,field).filter((value)=>value!==user);
  setDaemonAccessDraftUsers(daemonId,field,users);
  renderDaemonsCol();
};
window.commitDaemonAccessEditorInput=(daemonId,field)=>{
  const input=document.getElementById(daemonAccessInputId(field));
  if(!(input instanceof HTMLInputElement))return false;
  const additions=parseUserListInput(input.value||'');
  if(!additions.length)return false;
  const daemon=knownDaemons.get(daemonId);
  const users=[...new Set([...daemonAccessUsersForField(daemonId,daemon,field),...additions])];
  input.value='';
  setDaemonAccessDraftUsers(daemonId,field,users);
  renderDaemonsCol();
  return true;
};
window.handleDaemonAccessEditorKeyDown=(event,daemonId,field)=>{
  if(event.key==='Enter'||event.key===','){
    if(parseUserListInput(event.currentTarget?.value||'').length){
      event.preventDefault();
      window.commitDaemonAccessEditorInput(daemonId,field);
    }
    return;
  }
  if(event.key==='Backspace'&&!String(event.currentTarget?.value||'').trim()){
    const daemon=knownDaemons.get(daemonId);
    const users=daemonAccessUsersForField(daemonId,daemon,field);
    if(!users.length)return;
    event.preventDefault();
    users.pop();
    setDaemonAccessDraftUsers(daemonId,field,users);
    renderDaemonsCol();
  }
};
window.updateDaemonAccessDraft=(daemonId,field,value)=>{
  const daemon=knownDaemons.get(daemonId);
  const draft=daemonAccessDraftFor(daemonId,daemon);
  draft[field]=value;
  daemonAccessDrafts.set(daemonId,draft);
};
function renderDaemonAccessDrawer(){
  const overlay=document.getElementById('daemon-access-overlay');
  const drawer=document.getElementById('daemon-access-drawer');
  const title=document.getElementById('daemon-access-drawer-title');
  const role=document.getElementById('daemon-access-drawer-role');
  const sub=document.getElementById('daemon-access-drawer-sub');
  const body=document.getElementById('daemon-access-drawer-body');
  if(!overlay||!drawer||!title||!role||!sub||!body)return;
  const daemonId=String(daemonAccessDrawerDaemonId||'').trim();
  const daemon=daemonId?knownDaemons.get(daemonId):null;
  if(daemonAccessDrawerOpen&&(!daemon||!daemon.canManage)){
    daemonAccessDrawerOpen=false;
    daemonAccessDrawerDaemonId='';
    daemonAccessDrawerStatus=null;
    daemonAccessSavePending=false;
  }
  const open=daemonAccessDrawerOpen&&!!daemon&&daemon.canManage;
  overlay.classList.toggle('open',open);
  drawer.classList.toggle('open',open);
  drawer.setAttribute('aria-hidden',open?'false':'true');
  if(!open){
    title.textContent='Daemon access';
    role.textContent='';
    sub.textContent='';
    sub.style.display='none';
    body.innerHTML='';
    return;
  }
  const inputState=captureDaemonAccessInputState(document);
  title.textContent=daemon.hostname||daemonId;
  role.textContent=daemonAccessLevelLabel(daemon);
  sub.textContent='';
  sub.style.display='none';
  const helper=daemonAccessDrawerStatus
    ?`<div class="col-new-msg is-${esc(daemonAccessDrawerStatus.tone||'loading')}" id="daemon-access-msg">${esc(daemonAccessDrawerStatus.message)}</div>`
    :'<div class="daemon-access-help">Member uses room.member, admin uses room.operator in Web PubSub Chat membership.</div>';
  body.innerHTML=`<div class="daemon-access-sections">${buildDaemonAccessSectionMarkup({daemonId,field:'memberUsers',title:'Member Users',description:'Can view shared sessions.',sectionClass:'member',rawValue:daemonAccessDraftFor(daemonId,daemon)?.memberUsers||'',users:daemonAccessUsersForField(daemonId,daemon,'memberUsers'),escapeHtml:esc})}${buildDaemonAccessSectionMarkup({daemonId,field:'adminUsers',title:'Admin Users',description:'Can manage this daemon and create sessions.',sectionClass:'admin',rawValue:daemonAccessDraftFor(daemonId,daemon)?.adminUsers||'',users:daemonAccessUsersForField(daemonId,daemon,'adminUsers'),escapeHtml:esc})}</div><div class="daemon-access-footer"><button class="sh-go" id="daemon-access-save-btn" type="button" data-action="save-daemon-access" ${daemonAccessSavePending?'disabled':''}>${daemonAccessSavePending?'Saving…':'Save Access'}</button>${helper}</div>`;
  restoreDaemonAccessInputState(document,inputState);
}
function openDaemonAccessDrawer(daemonId=currentDaemonId){
  const daemon=knownDaemons.get(daemonId);
  if(!daemon||!daemon.canManage)return;
  daemonAccessDrawerDaemonId=daemonId;
  daemonAccessDrawerOpen=true;
  daemonAccessDrawerStatus=null;
  daemonAccessSavePending=false;
  hideDebugPanel();
  renderDaemonAccessDrawer();
  requestAnimationFrame(()=>document.getElementById(daemonAccessInputId('memberUsers'))?.focus());
}
function closeDaemonAccessDrawer(){
  daemonAccessDrawerOpen=false;
  daemonAccessDrawerDaemonId='';
  daemonAccessDrawerStatus=null;
  daemonAccessSavePending=false;
  renderDaemonAccessDrawer();
}
window.openDaemonAccessDrawer=openDaemonAccessDrawer;
window.closeDaemonAccessDrawer=closeDaemonAccessDrawer;
window.saveDaemonAccess=async()=>{
  const targetDaemonId=String(daemonAccessDrawerDaemonId||currentDaemonId||'').trim();
  const daemon=knownDaemons.get(targetDaemonId);
  if(!daemon||!daemon.canManage)return;
  const {memberUsers,adminUsers}=collectDaemonAccessEditorUsers({documentRef:document,parseUserListInput});
  setDaemonAccessDraftUsers(targetDaemonId,'memberUsers',memberUsers);
  setDaemonAccessDraftUsers(targetDaemonId,'adminUsers',adminUsers);
  daemonAccessSavePending=true;
  daemonAccessDrawerStatus={message:'Saving access list…',tone:'loading'};
  renderDaemonAccessDrawer();
  try{
    const body=await portalJson(`/api/daemons/${encodeURIComponent(targetDaemonId)}/access`,{method:'PATCH',body:JSON.stringify({memberUsers,adminUsers})});
    const updated=body.daemon||{};
    const updatedDaemonId=String(updated.daemonId||targetDaemonId||'').trim();
    knownDaemons.set(updatedDaemonId,mergeDaemonRecord(knownDaemons.get(updatedDaemonId),updated));
    daemonAccessDrafts.delete(updatedDaemonId);
    daemonAccessSavePending=false;
    daemonAccessDrawerStatus={message:'Access lists saved.',tone:'success'};
    renderDaemonsCol();
    syncCreateSessionButton();
  }catch(error){
    daemonAccessSavePending=false;
    daemonAccessDrawerStatus={message:error.message||'Failed to save daemon access',tone:'error'};
    renderDaemonAccessDrawer();
  }
};
async function refreshPortalDaemons({render=true}={}){
  if(!uid)return;
  const body=await portalJson('/api/daemons');
  const previousDaemons=new Map(knownDaemons);
  const nextDaemons=Array.isArray(body.daemons)?body.daemons:[];
  if(shouldRetainPreviousDaemons(previousDaemons,nextDaemons,Date.now(),DAEMON_STALE_MS)){
    portalDaemonsLoaded=true;
    if(render)renderDaemonsCol();
    syncCreateSessionButton();
    return;
  }
  knownDaemons.clear();
  for(const daemon of nextDaemons){
    const previous=previousDaemons.get(daemon.daemonId)||{};
    const normalized=mergeDaemonRecord(previous,daemon);
    knownDaemons.set(daemon.daemonId,normalized);
    if(daemonHasMemberAccess(normalized))void ensureDaemonSyncRoom(daemon.daemonId);
  }
  invalidateDelegationTargetsCache();
  portalDaemonsLoaded=true;
  if(currentDaemonId&&!knownDaemons.has(currentDaemonId)){currentDaemonId=null;currentAgentName=null;rid=null;resetChatState()}
  if(render)renderDaemonsCol();
  syncCreateSessionButton();
}
async function refreshPortalSessions({render=true}={}){
  if(!uid)return;
  const queryKey=currentSessionQueryKey();
  const now=Date.now();
  if(!queryKey)return;
  loadingSessionQueryKeys.add(queryKey);
  try{
    const body=await portalJson('/api/sessions');
    sessionListBlockedReason=body.blockedReason||'';
    markSessionQueryLoaded(queryKey);
    if(sessionListBlockedReason){if(render)await renderSessionsCol();return}
    const joined=joinedRoomIds();
    const keep=new Set();
    for(const session of body.sessions||[]){
      if(shouldSkipDeletedSession(session.sessionId,deletedSessions,now,5000)){
        if(!joined.has(session.sessionId))discoveredSessions.delete(session.sessionId);
        continue;
      }
      const scopedSession=applySessionQueryContext(session,{});
      const normalized=normalizeSessionRecord(scopedSession,discoveredSessions.get(session.sessionId)||{});
      keep.add(session.sessionId);
      deletedSessions.delete(session.sessionId);
      upsertDiscoveredSession(normalized);
      const prevJoin=joinRequests.get(session.sessionId)||{};
      if(session.joinStatus){
        // Don't overwrite real-time approved/denied with stale 'pending' from REST
        if((prevJoin.status==='approved'||prevJoin.status==='denied')&&session.joinStatus==='pending'){/* skip stale REST */}
        else joinRequests.set(session.sessionId,{...prevJoin,requestId:session.joinRequestId||'',status:session.joinStatus,requestedAccess:session.requestedAccess||'',updatedAt:session.updatedAt||new Date().toISOString(),autoOpen:true});
      }else if(sessionCanRead(normalized)||joined.has(session.sessionId)){
        joinRequests.set(session.sessionId,{...prevJoin,status:'approved',requestedAccess:sessionAccessLevel(normalized),updatedAt:session.updatedAt||new Date().toISOString(),autoOpen:true});
      }
    }
    for(const [sessionId,meta] of [...discoveredSessions.entries()]){
      if(deletedSessions.has(sessionId)&&!joined.has(sessionId)){
        discoveredSessions.delete(sessionId);
        continue;
      }
      if(keep.has(sessionId)||joined.has(sessionId))continue;
      discoveredSessions.delete(sessionId);
    }
    invalidateDelegationTargetsCache();
    if(render)await renderSessionsCol();
  }finally{loadingSessionQueryKeys.delete(queryKey)}
}
async function refreshPendingJoinRequests(){
  if(!uid)return;
  const body=await portalJson('/api/join-requests');
  const pendingIds=new Set((body.joinRequests||[]).map(request=>request.requestId));
  for(const request of body.joinRequests||[]){
    if(seenPendingJoinRequestIds.has(request.requestId))continue;
    seenPendingJoinRequestIds.add(request.requestId);
    void handleJoinRequest(request);
  }
  for(const requestId of [...seenPendingJoinRequestIds])if(!pendingIds.has(requestId))seenPendingJoinRequestIds.delete(requestId);
}
async function refreshPendingDaemonAccessRequests(){
  if(!uid)return;
  const body=await portalJson('/api/daemon-access-requests');
  const pendingIds=new Set((body.requests||[]).map(request=>request.requestId));
  for(const request of body.requests||[]){
    if(seenPendingDaemonAccessRequestIds.has(request.requestId))continue;
    seenPendingDaemonAccessRequestIds.add(request.requestId);
    void handleDaemonAccessRequest(request);
  }
  for(const requestId of [...seenPendingDaemonAccessRequestIds])if(!pendingIds.has(requestId))seenPendingDaemonAccessRequestIds.delete(requestId);
}
async function refreshPortalRequestApprovals(){
  await refreshPendingJoinRequests();
  await refreshPendingDaemonAccessRequests();
}
function pruneStaleDaemons(){
  if(!uid)return;
  const staleDaemonIds=[...knownDaemons.entries()].filter(([,daemon])=>!isDaemonRecordFresh(daemon,Date.now(),DAEMON_STALE_MS)).map(([daemonId])=>daemonId);
  if(!staleDaemonIds.length)return;
  const selectedWasRemoved=!!currentDaemonId&&staleDaemonIds.includes(currentDaemonId);
  for(const daemonId of staleDaemonIds)knownDaemons.delete(daemonId);
  invalidateDelegationTargetsCache();
  if(selectedWasRemoved){
    currentDaemonId=null;
    currentAgentName=null;
    rid=null;
    resetChatState();
    applyLoggedInState();
    return;
  }
  renderDaemonsCol();
  syncCreateSessionButton();
}
function pulsePortalRefresh(delays=[0],{includeRequests=true}={}){for(const delay of delays)setTimeout(()=>{if(uid)void pollPortalState({render:true,includeRequests})},Math.max(0,Number(delay)||0))}
async function pollPortalState({render=true,includeRequests=false}={}){
  if(portalPollInFlight||!uid)return;
  portalPollInFlight=true;
  try{
    const refreshTasks=[refreshPortalDaemons({render:false}),refreshPortalSessions({render:false})];
    if(includeRequests)refreshTasks.push(refreshPortalRequestApprovals());
    await Promise.all(refreshTasks);
    if(render){
      renderDaemonsCol();
      renderAgentsCol();
      await renderSessionsCol();
      if(createSessionModalOpen)renderCreateSessionModal();
    }
  }catch(err){portalWarn('portal.refresh.failed','Portal refresh failed',{error:err})}finally{portalPollInFlight=false}
}
function startPortalPolling(){
  if(portalPollTimer)clearInterval(portalPollTimer);
  portalPollTimer=setInterval(()=>{pruneStaleDaemons()},5000);
  pulsePortalRefresh([0,300],{includeRequests:true});
}
function stopPortalPolling(){
  if(portalPollTimer){clearInterval(portalPollTimer);portalPollTimer=null}
  portalPollInFlight=false;
  seenPendingJoinRequestIds.clear();
  seenPendingDaemonAccessRequestIds.clear();
}
function cancelLobbyMembershipRecovery(){
  if(lobbyMembershipRetryTimer){clearTimeout(lobbyMembershipRetryTimer);lobbyMembershipRetryTimer=null}
  lobbyMembershipEpoch+=1;
}
function startLobbyMembershipRecovery(userId,{attempt=1,epoch=lobbyMembershipEpoch}={}){
  const run=async()=>{
    if(epoch!==lobbyMembershipEpoch||!cc||uid!==userId)return;
    try{await ensureLobbyMembership(userId)}catch(err){
      if(epoch!==lobbyMembershipEpoch||!cc||uid!==userId)return;
      portalWarn('lobby.membership.sync.delayed','Lobby membership sync delayed',{userId,error:err});
      if(attempt>=3)return;
      const nextDelay=Math.min(3000,500*attempt);
      lobbyMembershipRetryTimer=setTimeout(()=>{
        lobbyMembershipRetryTimer=null;
        void startLobbyMembershipRecovery(userId,{attempt:attempt+1,epoch});
      },nextDelay);
    }
  };
  void run();
}
async function mapLimit(items,limit,iteratee){
  const results=[];
  let index=0;
  async function worker(){
    while(index<items.length){
      const currentIndex=index++;
      results[currentIndex]=await iteratee(items[currentIndex],currentIndex)
    }
  }
  await Promise.all(Array.from({length:Math.max(1,Math.min(limit,items.length||1))},()=>worker()));
  return results
}
async function ensureLobbyMembership(userId){
  if(!cc)throw new Error('Not connected');
  try{await cc.createRoom('Agent Lobby',[userId],LOBBY_ROOM)}catch(err){if(!/already|exists|member/i.test(String(err?.message||'')))portalWarn('lobby.create.failed','Lobby create failed',{userId,error:err})}
  try{await cc.addUserToRoom(LOBBY_ROOM,userId)}catch(err){if(!/already|exists|member/i.test(String(err?.message||'')))portalWarn('lobby.join.failed','Lobby join failed',{userId,error:err})}
  const deadline=Date.now()+4000;
  while(Date.now()<deadline){
    try{
      if(await cc.getRoom(LOBBY_ROOM,false)){
        await ensureLiveRoomSubscription(LOBBY_ROOM,{suppressWarnings:true,retries:1,retryDelayMs:300});
        return;
      }
    }catch{}
    await new Promise(r=>setTimeout(r,150))
  }
  throw new Error('Failed to join lobby')
}
async function ensureDaemonSyncRoom(daemonId){
  if(!cc||!daemonId)return;
  const targetRoomId=daemonSyncRoomId(daemonId);
  const hasLocalRoom=(cc?.rooms||[]).some((room)=>room?.roomId===targetRoomId);
  const hasKnownRoomInfo=hasLocalRoom||supplementalRoomInfos.has(targetRoomId);
  if(daemonSyncRooms.has(daemonId)&&hasLiveRoomJoin(targetRoomId)&&hasKnownRoomInfo)return;
  try{
    const roomInfo=await ensureLocalRoomInfo(targetRoomId,{
      chatRooms:cc?.rooms||[],
      supplementalRoomInfos,
      hasJoinedRoom:(roomId)=>hasLiveRoomJoin(roomId),
      getRoomInfo:(roomId)=>cc.getRoom(roomId,false),
      addSelfToRoom:(roomId,userId)=>cc.addUserToRoom(roomId,userId),
      currentUserId:cc.userId,
    });
    if(roomInfo){
      await ensureLiveRoomSubscription(targetRoomId,{retries:1,retryDelayMs:300});
      daemonSyncRooms.add(daemonId);
    }
  }catch(err){
    if(!/not\s+a\s+member|not found|404|403|forbidden/i.test(String(err?.message||'')))portalWarn('daemon.sync-room.hydrate.failed','Daemon sync room hydrate failed',{daemonId,error:err})
  }
}
async function ensureLiveRoomSubscription(roomId,{suppressWarnings=false,retries=0,retryDelayMs=300}={}){
  const targetRoomId=String(roomId||'').trim();
  if(!targetRoomId||!cc?.connection||typeof cc.connection.joinGroup!=='function')return false;
  let lastErr=null;
  for(let attempt=0;attempt<=retries;attempt++){
    try{
      await cc.connection.joinGroup(targetRoomId);
      return true;
    }catch(err){
      lastErr=err;
      if(attempt<retries)await new Promise(r=>setTimeout(r,retryDelayMs*(attempt+1)));
    }
  }
  if(!suppressWarnings)portalWarn('room.live-join.failed','Live room join failed',{roomId:targetRoomId,error:lastErr,errorDetail:lastErr?.errorDetail?JSON.stringify(lastErr.errorDetail):''});
  return false;
}
async function waitForRoomMembership(roomId,timeout=5000){
  await waitForJoinedRoom(roomId,{
    hasJoinedRoom:(targetRoomId)=>hasLiveRoomJoin(targetRoomId),
    getRoomInfo:(targetRoomId)=>cc.getRoom(targetRoomId,false),
    hydrateJoinedRoom:async(targetRoomId)=>{
      try{await cc.addUserToRoom(targetRoomId,cc.userId)}catch(joinErr){
        if(!/already|exists|member/i.test(String(joinErr?.message||'')))throw joinErr;
      }
      await ensureLiveRoomSubscription(targetRoomId,{retries:1,retryDelayMs:300});
    },
    timeoutMs:timeout,
  })
}
async function forceRoomMembershipRefresh(roomId,timeout=ROOM_MEMBERSHIP_TIMEOUT_MS){
  if(!cc)throw new Error('Not connected');
  try{
    if(cc?.connection&&typeof cc.connection.leaveGroup==='function')await cc.connection.leaveGroup(roomId)
  }catch(err){
    if(!/not\s+a\s+member|not found|404|Failed to send message/i.test(String(err?.message||'')))portalWarn('room.live-leave.failed','Forced live room leave failed',{roomId,error:err})
  }
  await waitForRoomMembership(roomId,timeout)
}
function isRoomLiveSyncEvidenceMessage(roomId,notification){
  const targetRoomId=String(roomId||'').trim();
  const messageRoomId=resolveNotificationRoomId(notification,knownRoomInfosForRouting());
  const messageText=notification?.message?.content?.text;
  if(!targetRoomId||messageRoomId!==targetRoomId||!messageText)return false;
  if(isLocalEchoMessage(notification?.message,uid))return false;
  try{
    const type=String(JSON.parse(messageText)?.type||'').trim();
    return type==='session.state'||type==='session.idle'||type==='assistant.message'||type==='assistant.delta'||type==='assistant.reasoning'||type==='assistant.reasoning_delta'||type==='tool.start'||type==='tool.complete'||type==='permission.request'||type==='permission.response'||type==='session.error'||type==='system.info'||type==='commands.update'||type==='modes.update'||type==='models.update'||type==='mode.changed'||type==='usage.update'
  }catch{return false}
}
function collectResolvedPermissionResponses(messages){
  const respondedPerms=new Map();
  for(const m of messages){if(!m?.content?.text)continue;try{const e=JSON.parse(m.content.text);if(e.type==='permission.response'&&e.requestId)respondedPerms.set(e.requestId,e.cancelled?'cancelled':!!e.approved)}catch{}}
  return respondedPerms
}
function applyRoomHistoryMessages(roomId,messages,sessionMeta,{skipStartupEnvelopes=false}={}){
  const respondedPerms=collectResolvedPermissionResponses(messages);
  let foundSyncEvidence=false;
  const historySummary=createSessionHistorySummary();
  for(const m of messages){
    if(!m?.content?.text)continue;
    if(shouldIgnoreRoomMessage(m,seenRoomMessageIds,historyLoadedAt))continue;
    try{
      const parsed=JSON.parse(m.content.text);
      rememberRoomMessage(m,seenRoomMessageIds);
      if(isRoomLiveSyncEvidenceMessage(roomId,{conversation:{roomId},message:m}))foundSyncEvidence=true;
      for(const e of unpackEnvelope(parsed)){
        recordSessionHistoryEnvelope(historySummary,e);
        if(e.type==='control.create'){
          sessionMeta.agent=sessionMeta.agent||e.agentName;
          sessionMeta.workingDirectory=sessionMeta.workingDirectory||e.workingDirectory;
          sessionMeta.ownerUserId=sessionMeta.ownerUserId||e.userId;
        }
        if(skipStartupEnvelopes&&isHistoricalStartupEnvelope(e))continue;
        if(e.type==='permission.request'&&respondedPerms.has(e.requestId))renderResolvedPerm(e,respondedPerms.get(e.requestId));
        else render(e)
      }
    }catch(err){portalWarn('history.render.failed','History render failed',{roomId,messageId:m?.messageId,error:err})}
  }
  const lastMsg=messages[messages.length-1];
  if(lastMsg?.createdAt)historyLoadedAt=Math.max(historyLoadedAt,new Date(lastMsg.createdAt).getTime());
  syncSessionSelection(roomId,sessionMeta);
  return {historyHasSyncEvidence:foundSyncEvidence,historySummary}
}
async function replayLatestRoomHistory(roomId,sessionMeta,{maxCount=100,skipStartupEnvelopes=false,roomInfo:preloadedRoomInfo=null}={}){
  const roomInfo=preloadedRoomInfo||await cc.getRoom(roomId,false);
  const roomName=resolveRoomDisplayName(roomInfo);
  if(roomName&&roomName!=='Session')sessionMeta.name=roomName;
  const conversationId=roomInfo?.defaultConversationId;
  if(conversationId)sessionMeta.defaultConversationId=conversationId;
  if(!conversationId){latestSessionHistorySummary=createSessionHistorySummary();return {historyHasSyncEvidence:false,historySummary:latestSessionHistorySummary};}
  const history=await cc.listMessage(conversationId,'0',null,maxCount);
  const messages=[...(history?.messages||[])].reverse();
  if(!messages.length){latestSessionHistorySummary=createSessionHistorySummary();return {historyHasSyncEvidence:false,historySummary:latestSessionHistorySummary};}
  const historyResult=applyRoomHistoryMessages(roomId,messages,sessionMeta,{skipStartupEnvelopes});
  latestSessionHistorySummary=historyResult.historySummary||createSessionHistorySummary();
  scroll();
  return historyResult
}
async function waitForRoomLiveState(roomId,timeout=ROOM_LIVE_SYNC_TIMEOUT_MS,sessionMeta={sessionId:roomId},{allowHistoryFallback=true}={}){
  await waitForRoomLiveSync(roomId,{
    subscribeToMessages:(listener)=>cc.addListenerForNewMessage(listener),
    sendSyncRequest:(targetRoomId)=>cc.sendToRoom(targetRoomId,JSON.stringify({type:'session.sync_state'})),
    messageHasSyncEvidence:isRoomLiveSyncEvidenceMessage,
    checkHistoryForSyncEvidence:allowHistoryFallback
      ? async(targetRoomId)=>{
        const historyResult=await replayLatestRoomHistory(targetRoomId,sessionMeta,{maxCount:25,skipStartupEnvelopes:false});
        return !!historyResult?.historyHasSyncEvidence;
      }
      : undefined,
    timeoutMs:timeout,
  })
}
function applyLobbyEnvelope(e){
  if(!e||!e.type)return;
  if(e.type==='portal.daemon'){
    const daemonId=String(e.daemonId||'').trim();
    if(!daemonId)return;
    const previousDaemon=knownDaemons.get(daemonId)||null;
    if(e.online===false){
      if(previousDaemon?.accessResolved===true)portalDaemonsLoaded=true;
      knownDaemons.delete(daemonId);
      if(currentDaemonId===daemonId){
        currentDaemonId=null;
        currentAgentName=null;
        rid=null;
        resetChatState();
        applyLoggedInState();
        return;
      }
      renderDaemonsCol();
      syncCreateSessionButton();
      return;
    }
    const merged=mergeDaemonRecord(previousDaemon,e);
    if(portalDaemonsLoaded||previousDaemon?.accessResolved===true||merged.accessResolved===true)portalDaemonsLoaded=true;
    knownDaemons.set(daemonId,merged);
    if(daemonHasMemberAccess(merged))void ensureDaemonSyncRoom(daemonId);
    renderDaemonsCol();
    renderAgentsCol();
    void renderSessionsCol();
    if(createSessionModalOpen)renderCreateSessionModal();
    syncCreateSessionButton();
    return;
  }
  // Real-time approval/denial notifications from the server
  if((e.type==='portal.access-approved'||e.type==='portal.access-denied')&&e.requesterUserId===uid){
    const approved=e.status==='approved';
    if(e.target==='daemon'&&e.daemonId){
      const daemon=knownDaemons.get(e.daemonId);
      if(daemon){
        const next={...daemon,accessRequestStatus:e.status,requestedAccess:e.requestedAccess||daemon.requestedAccess||''};
        if(approved){next.hasMemberAccess=true;next.canRead=true;if(e.requestedAccess==='admin'){next.hasAdminAccess=true;next.canWrite=true;next.canManage=true;next.approverUserIds=[...new Set([...(portalApproverUserIds(daemon)),uid].filter(Boolean))]}}
        knownDaemons.set(e.daemonId,next);
        if(!currentDaemonId)currentDaemonId=e.daemonId;
        renderDaemonsCol();
        renderAgentsCol();
        syncCreateSessionButton();
        void refreshPortalSessions({render:true});
        if(createSessionModalOpen)renderCreateSessionModal();
        void ensureDaemonSyncRoom(e.daemonId);
      }
      setFormStatus(approved?'Daemon access granted!':'Daemon access denied.',approved?'success':'error',2200,'create');
    }
    if(e.target==='session'&&e.sessionId){
      const prev=joinRequests.get(e.sessionId)||{};
      joinRequests.set(e.sessionId,{...prev,status:approved?'approved':'denied',requestedAccess:e.requestedAccess||prev.requestedAccess||'read',updatedAt:new Date().toISOString(),autoOpen:prev.autoOpen!==false});
      if(approved){
        const sessionPrev=discoveredSessions.get(e.sessionId)||{sessionId:e.sessionId};
        const accessPatch=e.requestedAccess==='write'?{canWrite:true,canRead:true,accessLevel:'write'}:{canRead:true,accessLevel:sessionPrev.accessLevel||'read'};
        discoveredSessions.set(e.sessionId,{...sessionPrev,...accessPatch});
      }
      void renderSessionsCol();
      setFormStatus(approved?'Session access granted!':'Session access denied.',approved?'success':'error',2200,'join');
      if(approved&&prev.autoOpen!==false){
        void(async()=>{try{await ensureJoinedSession(e.sessionId);await openR(e.sessionId)}catch(err){portalWarn('session.auto-open.failed','Auto-open after approval failed',{sessionId:e.sessionId,error:err})}})();
      }
    }
    pulsePortalRefresh([300,1500]);
    return;
  }
}
async function loadLobbyState(){
  return;
}
function applyDaemonSyncEnvelope(e){
  if(e?.type==='portal.join-request'&&e.status==='pending'&&e.requesterUserId!==uid){
    const sessionId=e.sessionId||'';
    const key=e.requestId||`${sessionId}:${e.requesterUserId}`;
    if(!seenPendingJoinRequestIds.has(key)){
      seenPendingJoinRequestIds.add(key);
      void handleJoinRequest({...e,sessionId});
    }
    return;
  }
  if(e?.type==='portal.daemon-access-request'){
    const daemonId=String(e.daemonId||'').trim();
    if(!daemonId)return;
    const requestId=String(e.requestId||'').trim();
    const known=knownDaemons.get(daemonId);
    if(known&&e.requesterUserId===uid){
      const next={...known,accessRequestStatus:e.status||known.accessRequestStatus||'',requestedAccess:e.requestedAccess||known.requestedAccess||''};
      if(e.status==='approved'){
        next.hasMemberAccess=true;
        next.canRead=true;
        if(e.requestedAccess==='admin'){
          next.hasAdminAccess=true;
          next.canWrite=true;
        }
      }
      knownDaemons.set(daemonId,next);
      renderDaemonsCol();
      renderAgentsCol();
      syncCreateSessionButton();
      void renderSessionsCol();
      if(createSessionModalOpen)renderCreateSessionModal();
    }
    if(e.status==='pending'){
      if(requestId&&seenPendingDaemonAccessRequestIds.has(requestId))return;
      if(requestId)seenPendingDaemonAccessRequestIds.add(requestId);
      const canApprove=known?(known.canManage||daemonHasAdminAccess(known)):false;
      if(canApprove)void handleDaemonAccessRequest(e);
      return;
    }
    if(requestId)seenPendingDaemonAccessRequestIds.delete(requestId);
    pulsePortalRefresh([0,300]);
    return;
  }
  const sessionId=e?.sessionId||e?.roomId;
  if(!sessionId)return;
  if(e.type==='session.deleted'){
    removeDiscoveredSession(sessionId);
    joinRequests.delete(sessionId);
    if(rid===sessionId){
      rid=null;
      resetChatState();
      applyLoggedInState();
      updateBreadcrumb();
      updateAutoBtn();
      setFormStatus('This session was deleted.','success',2200,'join');
    }
  }else if(e.type==='session.created'||e.type==='session.touch'||e.type==='session.updated'){
    deletedSessions.delete(sessionId);
    const daemon=knownDaemons.get(e.daemonId)||null;
    const statePatch={};
    if(typeof e.sessionProcessing==='boolean')statePatch.sessionProcessing=e.sessionProcessing;
    if(typeof e.sessionStopping==='boolean')statePatch.sessionStopping=e.sessionStopping;
    if(typeof e.sessionReady==='boolean')statePatch.sessionReady=e.sessionReady;
    if(typeof e.sessionDelegating==='boolean')statePatch.sessionDelegating=e.sessionDelegating;
    upsertDiscoveredSession({...e,...statePatch,...getRealtimeSessionAccessPatch(e,{currentUserId:uid,daemon})});
  }else return;
  void renderSessionsCol();
}
async function sendDaemonEnvelope(payload){
  if(!cc)return;
  const daemonId=String(payload?.daemonId||currentDaemonId||'').trim();
  if(!daemonId)return;
  try{
    await ensureDaemonSyncRoom(daemonId);
    await cc.sendToRoom(daemonSyncRoomId(daemonId),JSON.stringify(payload))
  }catch(err){
    if(!/not\s+a\s+member|403|forbidden/i.test(String(err?.message||'')))portalWarn('daemon.sync.send.failed','Daemon sync send failed',{daemonId,error:err})
  }
}
function announceSession(type,sessionId,extra={}){
  if(!uid||!sessionId)return;
  const known=discoveredSessions.get(sessionId)||{};
  const payload={type,sessionId,ownerUserId:known.ownerUserId||uid,daemonId:known.daemonId||currentDaemonId||undefined,agentName:known.agent||currentAgentName||undefined,roomName:known.name||undefined,workingDirectory:known.workingDirectory||undefined,updatedAt:new Date().toISOString(),...extra};
  if(type==='session.deleted')removeDiscoveredSession(sessionId);else{deletedSessions.delete(sessionId);upsertDiscoveredSession(payload)}
  void sendDaemonEnvelope(payload)
}
async function sendLobbyEnvelope(payload){
  if(!cc)throw new Error('Not connected');
  await cc.sendToRoom(LOBBY_ROOM,JSON.stringify(payload))
}
async function requestJoinSession(sessionId,requestedAccess='read'){
  const session=discoveredSessions.get(sessionId);
  if(!session)throw new Error('Session not found');
  const current=joinRequests.get(sessionId);
  if(current?.status==='pending'&&current?.requestedAccess===requestedAccess)return false;
  const body=await portalJson(`/api/sessions/${encodeURIComponent(sessionId)}/join-requests`,{method:'POST',body:JSON.stringify({requestedAccess})});
  const request={sessionId,requestId:body.requestId||'',requesterUserId:uid,ownerUserId:session.ownerUserId,daemonId:session.daemonId,agentName:session.agent,name:session.name,workingDirectory:session.workingDirectory,updatedAt:new Date().toISOString(),status:body.status||'pending',requestedAccess:body.requestedAccess||requestedAccess,autoOpen:true};
  joinRequests.set(sessionId,request);
  pulsePortalRefresh([600,1800]);
  renderSessionsCol();
  return true
}
window.requestDaemonAccess=async(requestedAccess)=>{
  try{
    const daemon=currentDaemonRecord();
    if(!daemon||!currentDaemonId)throw new Error('Select a daemon first');
    const body=await portalJson(`/api/daemons/${encodeURIComponent(currentDaemonId)}/access-requests`,{method:'POST',body:JSON.stringify({requestedAccess})});
    knownDaemons.set(currentDaemonId,{...daemon,accessRequestStatus:body.status||'pending',requestedAccess:body.requestedAccess||requestedAccess});
    recentDaemonAccessRequests.add(`${currentDaemonId}:${requestedAccess}`);
    setFormStatus(`${requestedAccess==='admin'?'Admin':'Member'} access request sent. Waiting for approval.`,'loading',2600,'create');
    renderDaemonsCol();
    await renderSessionsCol();
    pulsePortalRefresh([600,1800]);
    return body;
  }catch(error){
    setFormStatus(error.message||'Failed to request daemon access.','error',4500,'create');
    return null;
  }
}
async function handleJoinRequest(e){
  const key=e.requestId||`${e.sessionId}:${e.requesterUserId}`;
  if(joinApprovalLocks.has(key))return;
  const session=discoveredSessions.get(e.sessionId)||e;
  const daemon=knownDaemons.get(session.daemonId||e.daemonId||currentDaemonId);
  const isOwner=session.ownerUserId&&session.ownerUserId===uid;
  const isDaemonAdmin=daemon&&(daemon.canManage||daemonHasAdminAccess(daemon));
  if(!isOwner&&!isDaemonAdmin)return;
  joinApprovalLocks.add(key);
  try{
    const session=discoveredSessions.get(e.sessionId)||e;
    const requestedAccess=e.requestedAccess==='write'?'write':'read';
    const allow=await showConfirm(`${e.requesterUserId} wants ${requestedAccess} access to ${sessionLabel(session)}.`, 'Allow');
    await portalJson(`/api/sessions/${encodeURIComponent(e.sessionId)}/join-requests/${encodeURIComponent(e.requestId)}/${allow?'approve':'reject'}`,{method:'POST'});
    pulsePortalRefresh([500,1500]);
    await refreshPortalSessions({render:true});
  }catch(err){
    portalWarn('join-approval.response.failed','Join approval response failed',{requestId:e.requestId,sessionId:e.sessionId,error:err});
    setFormStatus(err?.message||'Failed to send join approval response.','error',4500,'join');
  }finally{joinApprovalLocks.delete(key)}
}
async function handleDaemonAccessRequest(e){
  const key=e.requestId||`${e.daemonId}:${e.requesterUserId}`;
  if(daemonAccessApprovalLocks.has(key))return;
  const daemon=knownDaemons.get(e.daemonId);
  if(daemon&&!daemon.canManage&&!daemonHasAdminAccess(daemon))return;
  daemonAccessApprovalLocks.add(key);
  try{
    const label=(daemon||e).hostname||e.daemonId;
    const allow=await showConfirm(`${e.requesterUserId} wants ${e.requestedAccess} access to ${label}.`,'Allow');
    await portalJson(`/api/daemons/${encodeURIComponent(e.daemonId)}/access-requests/${encodeURIComponent(e.requestId)}/${allow?'approve':'reject'}`,{method:'POST'});
    pulsePortalRefresh([500,1500]);
    await refreshPortalDaemons({render:true});
    await refreshPortalSessions({render:true});
  }catch(err){
    portalWarn('daemon-access.response.failed','Daemon access approval response failed',{requestId:e.requestId,daemonId:e.daemonId,error:err});
    setFormStatus(err?.message||'Failed to send daemon access response.','error',4500,'create');
  }finally{daemonAccessApprovalLocks.delete(key)}
}
function handleJoinResponse(e){
  const prev=joinRequests.get(e.sessionId)||{};
  joinRequests.set(e.sessionId,{...prev,status:e.approved?'approved':'denied',error:e.error||'',updatedAt:e.updatedAt||new Date().toISOString(),autoOpen:prev.autoOpen!==false});
  setFormStatus(e.approved?'Access granted. Opening session…':(e.error||'Join request denied.'),e.approved?'success':'error',e.approved?1800:4500,'join');
  renderSessionsCol()
}
async function ensureJoinedSession(sessionId){
  const targetSessionId=String(sessionId||'').trim();
  if(!targetSessionId)return;
  if(hasLiveRoomJoin(targetSessionId)&&!roomNeedsLiveSyncValidation(targetSessionId))return;
  if(!hasLiveRoomJoin(targetSessionId))roomsPendingLiveSync.add(targetSessionId);
  const access=await portalJson(`/api/sessions/${encodeURIComponent(targetSessionId)}/access-self`,{method:'POST'});
  const accessLevel=access?.accessLevel==='write'?'write':'read';
  upsertDiscoveredSession({
    ...(discoveredSessions.get(targetSessionId)||{}),
    sessionId:targetSessionId,
    accessLevel,
    canRead:true,
    canWrite:accessLevel==='write',
    canDelete:accessLevel==='write',
  });
  const previousJoin=joinRequests.get(targetSessionId)||{};
  joinRequests.set(targetSessionId,{...previousJoin,status:'approved',requestedAccess:accessLevel,updatedAt:new Date().toISOString(),autoOpen:previousJoin.autoOpen!==false});
  await waitForRoomMembership(targetSessionId,ROOM_MEMBERSHIP_TIMEOUT_MS);
  try{
    const roomInfo=await ensureLocalRoomInfo(targetSessionId,{
      chatRooms:cc?.rooms||[],
      supplementalRoomInfos,
      hasJoinedRoom:(roomId)=>hasLiveRoomJoin(roomId),
      getRoomInfo:(roomId)=>cc.getRoom(roomId,false),
      addSelfToRoom:(roomId,userId)=>cc.addUserToRoom(roomId,userId),
      currentUserId:cc.userId,
    });
    if(roomInfo)syncSessionSelection(targetSessionId,{
      defaultConversationId:roomInfo.defaultConversationId||discoveredSessions.get(targetSessionId)?.defaultConversationId||'',
      name:resolveRoomDisplayName(roomInfo),
      updatedAt:roomInfo.updatedAt||roomInfo.createdAt||discoveredSessions.get(targetSessionId)?.updatedAt,
    });
  }catch(err){
    portalWarn('session.joined-room.hydrate.failed','Joined room info hydrate failed',{sessionId:targetSessionId.substring(0,8),error:err})
  }
}
function applyLoggedOutState(message='',isError=false){
  setCompactNav(false);
  closeDaemonAccessDrawer();
  closeCreateSessionModal();
  rid=null;currentDaemonId=null;currentAgentName=null;sessionBooting=false;resetChatState();
  createSessionDraft.daemonId='';
  createSessionDraft.agentName='';
  createSessionDraft.directory='';
  setSelectedDirectory('','auto');
  clearDirectorySuggestions();
  setCol('col-login',true);setCol('col-daemons',false);setCol('col-agents',false);setCol('col-sessions',false);setCol('chat-col',false);
  setColumnDisabled('col-daemons',true);setColumnDisabled('col-agents',true);setColumnDisabled('col-sessions',true);setColumnDisabled('chat-col',true);
  $.chat.classList.add('hidden');$.ibar.classList.add('hidden');syncComposer();
  showChatPlaceholder(true);
  if(!uid&&portalTransportState==='connected')setPortalTransportState('disconnected');
  setLoginMessage(message,isError);syncUserBadge();updateAutoBtn();renderDaemonsCol();renderAgentsCol();renderSessionsCol();updateBreadcrumb();syncCompactButton();
  if($.loginUser&&!$.loginUser.value)$.loginUser.value=getStoredUserId()||DEFAULT_USERNAME;
  if(isMobile())mobShow('col-login')
}
function applyLoggedInState(){
  setColumnDisabled('col-daemons',false);setColumnDisabled('col-agents',false);setColumnDisabled('col-sessions',false);setColumnDisabled('chat-col',false);
  setCol('col-login',false);setCol('col-daemons',true);setCol('col-agents',false);setCol('col-sessions',true);setCol('chat-col',true);
  showChatPlaceholder(!rid);
  if(rid)showChat();else{$.chat.classList.add('hidden');$.ibar.classList.add('hidden')}
  syncComposer();
  setLoginMessage('');syncUserBadge();updateAutoBtn();renderDaemonsCol();renderAgentsCol();renderSessionsCol();
  updateBreadcrumb();
  syncCompactButton();
  if(isMobile())mobShow(mobileWorkflowColumn())
}
async function loginUser(rawUserId){
  const userId=String(rawUserId||'').trim()||DEFAULT_USERNAME;
  if($.loginBtn){$.loginBtn.disabled=true;$.loginBtn.textContent='Logging in…'}
  setPortalTransportState('connecting');
  setLoginMessage('Connecting…');
  clearFormStatus();
  try{
    if(cc&&uid!==userId){try{cc.stop()}catch{}cc=null}
    cancelLobbyMembershipRecovery();
    stopPortalPolling();knownDaemons.clear();discoveredSessions.clear();deletedSessions.clear();loadedSessionQueryKeys.clear();daemonSyncRooms.clear();supplementalRoomInfos.clear();roomsPendingLiveSync.clear();sessionMetadataHydrationInFlight.clear();sessionMetadataHydrationLastAttempt.clear();sessionAutoApprove.clear();joinRequests.clear();joinApprovalLocks.clear();daemonAccessApprovalLocks.clear();pendingCreateRequests.clear();pendingWorkspaceRequests.clear();sessionListBlockedReason='';portalDaemonsLoaded=false;
    await initCC(userId);
    setPortalTransportState('connected');
    setStoredUserId(userId);
    applyLoggedInState();
    setLoginMessage('Loading daemons…');
    return true
  }catch(e){
    if(cc){try{cc.stop()}catch{}}
    setPortalTransportState('failed',e.message||'Failed to connect to WPS');
    cancelLobbyMembershipRecovery();
    stopPortalPolling();cc=null;uid=null;knownDaemons.clear();discoveredSessions.clear();deletedSessions.clear();loadedSessionQueryKeys.clear();daemonSyncRooms.clear();supplementalRoomInfos.clear();roomsPendingLiveSync.clear();sessionMetadataHydrationInFlight.clear();sessionMetadataHydrationLastAttempt.clear();sessionAutoApprove.clear();joinRequests.clear();joinApprovalLocks.clear();daemonAccessApprovalLocks.clear();pendingCreateRequests.clear();pendingWorkspaceRequests.clear();sessionListBlockedReason='';portalDaemonsLoaded=false;
    applyLoggedOutState(e.message||'Login failed',true);
    return false
  }finally{if($.loginBtn){$.loginBtn.disabled=false;$.loginBtn.textContent='Login'}}
}
async function logoutUser(){
  try{if(cc)cc.stop()}catch{}
  cancelLobbyMembershipRecovery();
  stopPortalPolling();cc=null;uid=null;userAvatar='';knownDaemons.clear();discoveredSessions.clear();deletedSessions.clear();loadedSessionQueryKeys.clear();daemonSyncRooms.clear();supplementalRoomInfos.clear();roomsPendingLiveSync.clear();sessionMetadataHydrationInFlight.clear();sessionMetadataHydrationLastAttempt.clear();sessionAutoApprove.clear();joinRequests.clear();joinApprovalLocks.clear();daemonAccessApprovalLocks.clear();pendingCreateRequests.clear();pendingWorkspaceRequests.clear();sessionListBlockedReason='';portalDaemonsLoaded=false;
  // Server-side logout (for OAuth)
  try{await fetch('/auth/logout',{method:'POST'})}catch{}
  setOauthAuthenticatedUser(null);
  setPortalTransportState('disconnected');
  if($.loginUser)$.loginUser.value=getStoredUserId()||DEFAULT_USERNAME;
  applyLoggedOutState()
}

/* Slash commands */
const $slashMenu=document.getElementById('slash-menu');
let slashActive=-1;
function resizeComposerInput(){$.mi.style.height='auto';$.mi.style.height=Math.min($.mi.scrollHeight,120)+'px'}
function normalizeDelegationTarget(target,{mode='delegate-at'}={}){const sessionId=String(target?.sessionId||'').trim();if(!sessionId)return null;const label=String(target?.label||target?.roomName||target?.targetLabel||target?.sessionLabel||sessionId).trim()||sessionId;const description=String(target?.description||'').trim();return{sessionId,label,description,mode}}
function delegationTargetTitle(target){if(!target)return'';return[target.label,target.description,target.sessionId].filter(Boolean).join('\n')}
function renderSelectedDelegationTarget(){const hasTarget=!!selectedDelegationTarget;$.delegationChip?.classList.toggle('hidden',!hasTarget);if(!hasTarget){if($.delegationChip)$.delegationChip.title='';if($.delegationChipLabel)$.delegationChipLabel.textContent='';return}if($.delegationChipLabel)$.delegationChipLabel.textContent=selectedDelegationTarget.label;if($.delegationChip)$.delegationChip.title=delegationTargetTitle(selectedDelegationTarget)}
function clearSelectedDelegationTarget({focusInput=false}={}){selectedDelegationTarget=null;renderSelectedDelegationTarget();syncComposer();if(focusInput){$.mi.focus();resizeComposerInput()}}
function setSelectedDelegationTarget(target,{mode='delegate-at',focusInput=true,preserveInput=false}={}){const normalized=normalizeDelegationTarget(target,{mode});if(!normalized)return;selectedDelegationTarget=normalized;if(!preserveInput)$.mi.value='';renderSelectedDelegationTarget();syncComposer();hideSlashMenu();if(focusInput){$.mi.focus();resizeComposerInput()}}
function selectedDelegationDisplayText(prompt=''){if(!selectedDelegationTarget)return String(prompt||'').trim();const cleanPrompt=String(prompt||'').trim();const prefix=selectedDelegationTarget.mode==='delegate-slash'?`/delegate ${selectedDelegationTarget.label}`:`@${selectedDelegationTarget.label}`;return cleanPrompt?`${prefix} ${cleanPrompt}`:prefix}
window.clearComposerDelegationTarget=(focusInput=false)=>clearSelectedDelegationTarget({focusInput:!!focusInput});
function renderComposerMenu(items,{mode='',context=null}={}){
  const entries=Array.isArray(items)?items.filter(Boolean):[];
  if(!entries.length){hideSlashMenu();return}
  const activeIndex=Math.max(entries.findIndex(item=>!item.disabled),0);
  composerMenuMode=mode;composerMenuItems=entries;composerMenuContext=context;slashActive=activeIndex;
  $slashMenu.innerHTML=entries.map((item,i)=>{const primaryClass=item.primaryClass||'sl-label';const desc=item.description?`<span class="sl-desc">${esc(item.description)}</span>`:'';const meta=item.meta?`<span class="sl-meta">${esc(item.meta)}</span>`:'';return`<div class="slash-item${i===activeIndex?' active':''}${item.disabled?' disabled':''}"${item.disabled?'':` onmousedown="pickComposerMenuItem(${i})"`} data-idx="${i}"><div class="sl-stack"><span class="${primaryClass}">${esc(item.label||'')}</span>${desc}${meta}</div></div>`}).join('');
  $slashMenu.classList.add('show');
}
function showSlashMenu(query){
  const q=query.toLowerCase();
  const matches=SLASH_CMDS.filter(c=>c.cmd.startsWith(q)).map(c=>({kind:'slash',cmd:c.cmd,label:`/${c.cmd}`,description:c.desc,primaryClass:'sl-cmd'}));
  if(!matches.length){hideSlashMenu();return}
  renderComposerMenu(matches,{mode:'slash'});
}
function hideSlashMenu(){$slashMenu.classList.remove('show');slashActive=-1;composerMenuMode='';composerMenuItems=[];composerMenuContext=null;composerMenuRequestToken+=1}
function parseDelegationMenuContext(value){const text=String(value||'');if(/^\/delegate\s*$/i.test(text))return{mode:'delegate-slash',query:'',replaceStart:0,replaceEnd:text.length};const slashMatch=text.match(/^\/delegate\s+(\S*)$/i);if(slashMatch)return{mode:'delegate-slash',query:String(slashMatch[1]||''),replaceStart:0,replaceEnd:text.length};const atMatch=text.match(/^@([^\s@]*)$/);if(atMatch)return{mode:'delegate-at',query:String(atMatch[1]||''),replaceStart:0,replaceEnd:text.length};return null}
async function listDelegationTargets(force=false){const sourceSessionId=String(rid||'').trim();if(!sourceSessionId)return[];const now=Date.now();if(!force&&delegationTargetsCache.sourceSessionId===sourceSessionId&&Array.isArray(delegationTargetsCache.targets)&&now-delegationTargetsCache.loadedAt<DELEGATION_TARGET_CACHE_MS)return delegationTargetsCache.targets;if(delegationTargetsCache.inflight&&delegationTargetsCache.sourceSessionId===sourceSessionId)return await delegationTargetsCache.inflight;delegationTargetsCache.sourceSessionId=sourceSessionId;const requestVersion=delegationTargetsCache.version;const inflightPromise=(async()=>{const body=await portalJson(`/api/delegation-targets?sourceSessionId=${encodeURIComponent(sourceSessionId)}`);const targets=Array.isArray(body?.targets)?body.targets:[];if(requestVersion===delegationTargetsCache.version&&delegationTargetsCache.sourceSessionId===sourceSessionId){delegationTargetsCache.targets=targets;delegationTargetsCache.loadedAt=Date.now()}return requestVersion===delegationTargetsCache.version?targets:delegationTargetsCache.targets})().catch(err=>{if(requestVersion===delegationTargetsCache.version){delegationTargetsCache.targets=[];delegationTargetsCache.loadedAt=0}throw err}).finally(()=>{if(delegationTargetsCache.inflight===inflightPromise)delegationTargetsCache.inflight=null});delegationTargetsCache.inflight=inflightPromise;return await inflightPromise}
function filterDelegationTargets(targets,query=''){const q=String(query||'').trim().toLowerCase();const entries=Array.isArray(targets)?targets:[];if(!q)return[...entries];return entries.filter(target=>[target.sessionId,target.roomName,target.targetLabel,target.daemonId,target.daemonLabel,target.agentName,target.workingDirectory,target.ownerUserId].some(value=>String(value||'').toLowerCase().includes(q)))}
function buildDelegationTargetMenuItems(targets){return targets.map(target=>({kind:'delegation-target',sessionId:String(target.sessionId||'').trim(),label:String(target.roomName||target.targetLabel||target.sessionId||'Session').trim()||'Session',description:[String(target.daemonLabel||target.daemonId||'').trim(),AGENT_NAMES[target.agentName]||String(target.agentName||'').trim()].filter(Boolean).join(' · '),meta:[String(target.sessionId||'').trim(),String(target.workingDirectory||'').trim()].filter(Boolean).join(' · '),primaryClass:'sl-label'}))}
function showDelegationMenuStatus(context,label,description=''){renderComposerMenu([{kind:'status',label,description,disabled:true,primaryClass:'sl-label'}],{mode:'delegation-target',context})}
async function syncComposerSelectionMenu(){const value=String($.mi.value||'');const context=parseDelegationMenuContext(value);if(context){const requestToken=++composerMenuRequestToken;if(!rid||!cc){showDelegationMenuStatus(context,'Open a session first','Delegation starts from the current writable source session.');return}const currentSession=discoveredSessions.get(rid)||{sessionId:rid,accessLevel:'write'};if(!sessionCanWrite(currentSession)){showDelegationMenuStatus(context,'Source session is read-only','Request write access before delegating to another session.');return}showDelegationMenuStatus(context,'Loading writable sessions…','Pick a target session for this delegation.');try{const targets=filterDelegationTargets(await listDelegationTargets(),context.query);if(requestToken!==composerMenuRequestToken)return;if(!targets.length){showDelegationMenuStatus(context,'No writable targets','No other writable sessions match this filter.');return}renderComposerMenu(buildDelegationTargetMenuItems(targets),{mode:'delegation-target',context})}catch(err){if(requestToken!==composerMenuRequestToken)return;showDelegationMenuStatus(context,'Failed to load targets',err?.message||'Could not fetch delegation targets.')}return}if(value.startsWith('/')&&!value.includes(' ')){showSlashMenu(value.slice(1));return}hideSlashMenu()}
function selectDelegationTarget(target){const context=composerMenuContext||parseDelegationMenuContext($.mi.value)||{mode:'delegate-slash'};setSelectedDelegationTarget(target,{mode:context.mode,focusInput:true,preserveInput:false})}
window.pickComposerMenuItem=(index)=>{const item=composerMenuItems[index];if(!item||item.disabled)return;if(item.kind==='slash'){const cmd=String(item.cmd||'').trim();clearSelectedDelegationTarget();$.mi.value='/' + cmd + ' ';$.mi.focus();$.mi.selectionStart=$.mi.selectionEnd=$.mi.value.length;resizeComposerInput();if(cmd==='delegate'){void syncComposerSelectionMenu();return}hideSlashMenu();return}if(item.kind==='delegation-target'){selectDelegationTarget(item);return}hideSlashMenu()};
window.pickSlash=(cmd)=>{const match=SLASH_CMDS.find(item=>item.cmd===cmd);if(!match){$.mi.value='/' + cmd + ' ';$.mi.focus();return}composerMenuItems=[{kind:'slash',cmd:match.cmd,label:`/${match.cmd}`,description:match.desc,primaryClass:'sl-cmd'}];window.pickComposerMenuItem(0)};
function handleSlashNav(e){
  if(!$slashMenu.classList.contains('show'))return false;
  const items=[...$slashMenu.querySelectorAll('.slash-item')];
  const enabledItems=items.filter(item=>!item.classList.contains('disabled'));
  if(!items.length)return false;
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!enabledItems.length)return true;const currentPos=Math.max(enabledItems.findIndex(item=>Number(item.dataset.idx)===slashActive),0);const nextPos=e.key==='ArrowDown'?(currentPos+1)%enabledItems.length:(currentPos-1+enabledItems.length)%enabledItems.length;const nextIdx=Number(enabledItems[nextPos].dataset.idx);items.forEach(item=>item.classList.remove('active'));$slashMenu.querySelector(`.slash-item[data-idx="${nextIdx}"]`)?.classList.add('active');slashActive=nextIdx;return true}
  if(e.key==='Tab'||e.key==='Enter'){e.preventDefault();if(enabledItems.length)window.pickComposerMenuItem(slashActive);return true}
  if(e.key==='Escape'){hideSlashMenu();return true}
  return false;
}

function hideAll(){$.chat.classList.add('hidden');$.ibar.classList.add('hidden');
  document.getElementById('chat-col').style.display='none'}
function showWelcome(){rid=null;renderDaemonsCol()}
function showChat(){$.chat.classList.remove('hidden');$.ibar.classList.remove('hidden');
  showChatPlaceholder(false);
  document.getElementById('chat-col').style.display='flex';
  const mobBack=document.querySelector('.chat-col-mob-back');if(mobBack)mobBack.style.display=isMobile()?'flex':'none';
  syncComposer();updateAutoBtn();syncSessionToolbarMeta();updateToolbarVisibility();updateBreadcrumb();renderSessionContextBar()}

function getSessionStatePill(){
  if(sessionBooting)return {state:'starting',label:'Starting'};
  if(ss.stopping)return {state:'stopping',label:'Stopping'};
  if(currentStatusState==='permission')return {state:'approval',label:'Approval'};
  if(currentStatusState==='error')return {state:'error',label:'Error'};
  if(ss.processing||hasActiveDelegationForSourceSession(rid)||!!discoveredSessions.get(rid)?.sessionDelegating)return {state:'working',label:'Working'};
  if(currentSessionReady===false)return {state:'starting',label:'Starting'};
  return {state:'idle',label:'Idle'};
}
function getSessionListStatusInfo(session){
  if(session?.sessionId===rid)return getSessionStatePill();
  return getSessionRecordStatusInfo(session);
}
function renderSessionContextBar(){
  const ctx=document.getElementById('session-ctx');
  if(!ctx)return;
  if(!rid||!uid){ctx.classList.remove('show');return}
  const session=discoveredSessions.get(rid)||{};
  const agentKey=getAgentVisualKey(session.agent||currentAgentName);
  const agentIcon=AGENT_ICONS[agentKey]||'';
  const agentColor=AGENT_COLORS[agentKey]||'var(--fg4)';
  const name=sessionLabel(session)||'Session';
  const dir=session.workingDirectory||'';
  const owner=session.ownerUserId&&session.ownerUserId!==uid?`by ${session.ownerUserId}`:'';
  const metaParts=[AGENT_NAMES[session.agent||currentAgentName]||'',dir,owner].filter(Boolean);
  const iconEl=document.getElementById('session-ctx-icon');
  const nameEl=document.getElementById('session-ctx-name');
  const metaEl=document.getElementById('session-ctx-meta');
  const pillEl=document.getElementById('session-ctx-pill');
  if(iconEl)iconEl.innerHTML=agentIcon?`<span style="color:${agentColor}">${agentIcon}</span>`:'';
  if(nameEl)nameEl.textContent=name;
  if(metaEl)metaEl.textContent=metaParts.join(' · ');
  const pill=getSessionStatePill();
  if(pillEl){pillEl.dataset.state=pill.state;pillEl.textContent=pill.label}
  ctx.classList.add('show');
}

const TOPBAR_DAEMON_ICON=buildSpriteIcon(UI_SPRITE_PATH,'topbar-daemon',{fill:'none',stroke:'currentColor',strokeWidth:'1.8',strokeLinecap:'round',strokeLinejoin:'round'});
const TOPBAR_SESSION_ICON=buildSpriteIcon(UI_SPRITE_PATH,'topbar-session',{fill:'none',stroke:'currentColor',strokeWidth:'1.8',strokeLinecap:'round',strokeLinejoin:'round'});
function topbarBreadcrumbItems(){
  const items=[];
  if(!rid)return items;
  if(currentDaemonId){
    const daemon=knownDaemons.get(currentDaemonId);
    items.push({kind:'daemon',label:daemon?.hostname||currentDaemonId,icon:TOPBAR_DAEMON_ICON});
  }
  if(currentAgentName){
    const visualKey=getAgentVisualKey(currentAgentName);
    const icon=AGENT_ICONS[visualKey]||'';
    const color=AGENT_COLORS[visualKey]||'var(--accent2)';
    items.push({kind:'agent',label:AGENT_NAMES[currentAgentName]||currentAgentName,icon:`<span style="color:${color}">${icon}</span>`});
  }
  if(rid){
    const session=discoveredSessions.get(rid)||{};
    items.push({kind:'session',label:sessionLabel(session),icon:TOPBAR_SESSION_ICON});
  }
  if(items.length)items[items.length-1].current=true;
  return items;
}
function topbarBreadcrumbMarkup(){
  const items=topbarBreadcrumbItems();
  if(!items.length)return {html:'',empty:true};
  const html=items.map((item,index)=>`${index?'<span class="tb-crumb-sep" aria-hidden="true">›</span>':''}<span class="tb-crumb ${item.kind==='agent'?'is-agent':''} ${item.current?'is-current':''}"><span class="tb-crumb-icon" aria-hidden="true">${item.icon}</span><span class="tb-crumb-text">${esc(item.label)}</span></span>`).join('');
  return {html,empty:false};
}

function updateBreadcrumb(){
  const {html,empty}=topbarBreadcrumbMarkup();
  if($.tbc){
    if($.tbc.innerHTML!==html){$.tbc.style.opacity='0';setTimeout(()=>{$.tbc.innerHTML=html;$.tbc.classList.toggle('is-empty',empty);$.tbc.style.opacity='1'},100)}
    else{$.tbc.classList.toggle('is-empty',empty)}
  }
  renderCompactNav();
}

function syncSessionSelection(sessionId,patch={}){
  const previous=discoveredSessions.get(sessionId)||{sessionId};
  const next={...previous,...patch};
  discoveredSessions.set(sessionId,next);
  if(next.daemonId)currentDaemonId=next.daemonId;
  if(next.agent)currentAgentName=next.agent;
  syncSessionToolbarMeta();
  renderDaemonsCol();
  renderAgentsCol();
  document.getElementById('col-sessions-hdr').textContent='Sessions';
  updateBreadcrumb();
}

// ── Column 1: Workspaces ──
function renderDaemonsCol(){
  const list=document.getElementById('col-daemons-list');
  if(!uid||!cc){list.innerHTML=skeletonColumn(3);renderCompactNav();renderDaemonAccessDrawer();return}
  if(!portalDaemonsLoaded){list.innerHTML=renderColumnLoadingState('Loading daemons…','Waiting for the latest daemon list from the portal.');renderCompactNav();renderDaemonAccessDrawer();return}
  const daemonEntries=[...knownDaemons.entries()].filter(([,d])=>isDaemonRecordFresh(d,Date.now(),DAEMON_STALE_MS));
  if(currentDaemonId&&!daemonEntries.some(([did])=>did===currentDaemonId)){currentDaemonId=null;currentAgentName=null;rid=null}
  if(!daemonEntries.length){list.innerHTML=renderColumnStateCard({icon:'🔌',title:'No daemons found',detail:'Start a local daemon and the portal will pick it up on the next refresh.',extra:'<div class="col-empty-hint">npm run daemon</div>'});renderCompactNav();renderDaemonAccessDrawer();return}
  list.innerHTML=buildDaemonCardsMarkup({daemonEntries,currentDaemonId,normalizeDaemonPlatform,osIcons:OS_ICONS,osNames:OS_NAMES,countSessionsForDaemon,daemonAdminUsersMeta,daemonAccessTag,renderDaemonAccessSummaryCard,escapeHtml:esc});
  renderCompactNav();
  renderDaemonAccessDrawer();
}
window.selectDaemon=(did)=>{
  if(createSessionModalOpen){
    closeDaemonAccessDrawer();
    createSessionDraft.daemonId=did;
    createSessionDraft.agentName='';
    ensureCreateSessionDraft();
    renderCreateSessionModal();
    return;
  }
  currentDaemonId=currentDaemonId===did?null:did;
  currentAgentName=null;
  renderDaemonsCol();renderAgentsCol();renderSessionsCol();updateBreadcrumb();
  if(isMobile())mobShow(currentDaemonId?'col-sessions':'col-daemons');
};

window.toggleCollapsibleSection=(trigger)=>{
  if(!trigger)return;
  const panel=trigger.nextElementSibling;
  if(!panel)return;
  const open=panel.classList.toggle('more-open');
  trigger.classList.toggle('is-open',open);
  trigger.setAttribute('aria-expanded',open?'true':'false');
  const meta=trigger.querySelector('.col-section-toggle-meta');
  if(meta){
    const collapsed=trigger.dataset.collapsedLabel||'expand';
    const expanded=trigger.dataset.expandedLabel||'collapse';
    meta.textContent=open?expanded:collapsed;
  }
};

// ── Column 2: Agents ──
function renderAgentsCol(){
  const list=document.getElementById('col-agents-list');
  if(!uid||!cc){list.innerHTML=skeletonColumn(5);renderCompactNav();return}
  const daemon=knownDaemons.get(currentDaemonId);
  if(!daemon){list.innerHTML=renderSessionEmptyState('Select a daemon first','Pick a daemon to inspect its available agents.','🛰');renderCompactNav();return}
  document.getElementById('col-agents-hdr').textContent='Agents';
  list.innerHTML=buildAgentCardsMarkup({daemon,currentAgentName,agentIcons:AGENT_ICONS,agentColors:AGENT_COLORS,agentNames:AGENT_NAMES,testedAcpAgents:TESTED_ACP_AGENTS,escapeHtml:esc});
  renderCompactNav();
}
window.selectAgent=(agentName)=>{
  if(!createSessionModalOpen)return;
  if(agentName!=='copilot-sdk'&&!TESTED_ACP_AGENTS.has(agentName))return;
  createSessionDraft.agentName=agentName;
  document.getElementById('f-agent').value=agentName;
  renderCreateSessionModal();
};

// ── Column 3: Sessions ──
let sessionGroupBy='none';
window.setSessionGroupBy=function(mode){
  sessionGroupBy=mode;
  document.querySelectorAll('.session-groupby-pill').forEach(p=>p.classList.toggle('is-active',p.textContent.toLowerCase()===mode));
  renderSessionsCol();
  renderCompactNav();
};
function setSessionsHeaderLoadingState(loading=false,label=''){
  const header=document.getElementById('col-sessions-hdr');
  const spinner=document.getElementById('col-sessions-spinner');
  if(header)header.textContent='Sessions';
  if(!spinner)return;
  const active=!!loading;
  spinner.classList.toggle('hidden',!active);
  spinner.title=active?String(label||'').trim():'';
}
async function renderSessionsCol(){
  const list=document.getElementById('col-sessions-list');
  const header=document.getElementById('col-sessions-hdr');
  if(header)header.textContent='Sessions';
  setSessionsHeaderLoadingState(false);
  syncCreateSessionButton();
  if(!uid||!cc){list.innerHTML=skeletonColumn(4);renderCompactNav();return}
  if(!currentDaemonId){
    list.innerHTML=renderColumnStateCard({icon:'👈',title:'Select a workspace',detail:'Pick a workspace from the left panel to see its sessions.'});
    renderCompactNav();
    return
  }
  const queryKey=currentSessionQueryKey();
  const queryLoaded=!queryKey||sessionQueryLoaded(queryKey);
  const queryLoading=!!queryKey&&sessionQueryLoading(queryKey);
  const localSessions=collectVisibleSessions({
    discoveredSessions,
    chatRooms:cc?.rooms||[],
    deletedSessions,
    lobbyRoomId:LOBBY_ROOM,
  });
  setSessionsHeaderLoadingState((!queryLoaded&&!!queryKey)||queryLoading,'Syncing session list…');
  if(queryKey&&!queryLoaded&&!portalPollInFlight&&!queryLoading)void refreshPortalSessions({render:true}).catch(err=>portalWarn('session.refresh.failed','Session refresh failed',{queryKey,error:err}));
  if(shouldShowPortalSessionLoading({queryLoaded,localSessionCount:localSessions.length})){
    list.innerHTML=renderColumnLoadingState('Loading sessions…','Waiting for the latest session list from the portal.');
    renderCompactNav();
    return
  }
  const joined=joinedRoomIds();
  const sessions=[...localSessions];
  const metadataHydrationState=getSessionMetadataHydrationState({sessions,joinedSessionIds:joined,inFlightSessionIds:sessionMetadataHydrationInFlight,lastAttemptBySessionId:sessionMetadataHydrationLastAttempt,cooldownMs:SESSION_METADATA_HYDRATE_COOLDOWN_MS});
  setSessionsHeaderLoadingState((!queryLoaded&&!!queryKey)||queryLoading||metadataHydrationState.shouldShowLoading,((!queryLoaded&&!!queryKey)||queryLoading)?'Syncing session list…':'Loading session details…');
  if(metadataHydrationState.actionableCount>0)void hydrateVisibleSessionMetadata(sessions,joined).then((hydratedCount)=>{if(hydratedCount>0)void renderSessionsCol()}).catch(err=>portalWarn('session.metadata.hydrate.failed','Session metadata hydrate failed',{queryKey,error:err}));
  const filtered=[...sessions].sort((a,b)=>{const ta=a.updatedAt?new Date(a.updatedAt).getTime():0;const tb=b.updatedAt?new Date(b.updatedAt).getTime():0;return tb-ta}).filter(s=>!currentDaemonId||s.daemonId===currentDaemonId);
  if(!filtered.length){
    const daemonEntries=freshDaemonEntries();
    const hasVisibleDaemon=daemonEntries.length>0;
    const hasMemberDaemon=daemonEntries.some(([,daemon])=>daemonHasMemberAccess(daemon));
    const hasCreatableDaemon=daemonEntries.some(([,daemon])=>{const {blocked,readOnly}=getCreateSessionAccessState(daemon);return !blocked&&!readOnly});
    if(!hasVisibleDaemon)list.innerHTML=renderColumnStateCard({icon:'🔌',title:'No daemons found',detail:'Start a local daemon and the portal will pick it up on the next refresh.',extra:'<div class="col-empty-hint">npm run daemon</div>'});
    else if(!hasMemberDaemon)list.innerHTML=renderSessionEmptyState('No accessible sessions yet','You can see daemons in the launcher, but you still need daemon member or admin access before shared sessions appear here.','🔒');
    else if(!hasCreatableDaemon)list.innerHTML=renderSessionEmptyState('No sessions yet','Shared sessions will appear here when they exist. Creating a new one still requires daemon admin access.','💬');
    else list.innerHTML=renderSessionEmptyState('No sessions yet','Use New Session to start one on any daemon where you have admin access.','💬');
    renderCompactNav();
    return
  }
  list.innerHTML=buildSessionCardsMarkup({sessions:filtered.map((session)=>({...session,currentUserId:uid})),currentRoomId:rid,currentDaemonId,joinedSessionIds:joined,recentSessionAccessRequests,agentIcons:AGENT_ICONS,agentColors:AGENT_COLORS,agentNames:AGENT_NAMES,sessionLabel,daemonRecordForSession,sessionAccessLevel,getSessionListAccessPresentation,sessionCanDelete,sessionCanLeave,daemonHasAdminAccess,getSessionListStatusInfo,formatTime:formatRelativeTime,escapeHtml:esc});
  applySessionGroups(list,sessionGroupBy);
  renderCompactNav();
}
window.openSession=async(sid)=>{try{
  clearSessionBanner('error');
  setSessionBanner({source:'history',label:'Loading',text:'Loading session history…',tone:'info'});
  if(!hasLiveRoomJoin(sid)||roomNeedsLiveSyncValidation(sid)){
    await ensureJoinedSession(sid);
  }
  await openR(sid);
  document.getElementById('chat-col').style.display='flex';
  await renderSessionsCol();
  if(isMobile())mobShow('chat-col');
}catch(e){setSessionBanner({source:'error',label:'Open failed',text:e.message||'Failed to open session',tone:'error',actionText:'Retry',action:()=>window.openSession(sid)});addErr(e.message||'Failed to open session')}};
window.requestSessionAccess=async(sid,requestedAccess='read')=>{try{const sent=await requestJoinSession(sid,requestedAccess);if(sent){recentSessionAccessRequests.add(`${sid}:${requestedAccess}`);setFormStatus(`${requestedAccess==='write'?'Write':'Read'} access request sent. Waiting for approval.`,'loading',2600,'join');await renderSessionsCol()}}catch(e){setFormStatus(e.message||'Failed to request access.','error',4500,'join')}};

function esc(s){return s?String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'):''}
function jsq(s){return String(s??'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r?\n/g,'\\n').replace(/</g,'\\x3C').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')}
function sanitizeHref(href){
  try{
    const parsed=new URL(String(href||''),window.location.origin);
    if(['http:','https:','mailto:'].includes(parsed.protocol))return parsed.href;
  }catch{}
  return '#'
}
const mk=new Marked({breaks:true,gfm:true,renderer:(()=>{const r=new Renderer();r.link=({href,text})=>`<a href="${esc(sanitizeHref(href))}" target="_blank" rel="noopener noreferrer">${text||esc(String(href||''))}</a>`;return r})()});
function normalizeMarkdownLine(line){
  if(!line)return [''];
  const pipeCount=(line.match(/\|/g)||[]).length;
  let parts=[line];
  if(pipeCount>=4&&!line.trimStart().startsWith('|')){
    const firstPipe=line.indexOf('|');
    if(firstPipe>0)parts=[line.slice(0,firstPipe).trimEnd(),line.slice(firstPipe).trimStart()].filter(Boolean)
  }
  parts=parts.flatMap(part=>{
    if(!part.trimStart().startsWith('|'))return [part];
    return part.replace(/\|\s+\|(?=\s*(?:---|[^|\s]))/g,'|\n|').split('\n').map(piece=>piece.trim()).filter(Boolean)
  });
  parts=parts.flatMap(part=>{
    const tableSepIndex=part.indexOf('|---');
    if(tableSepIndex>0)return [part.slice(0,tableSepIndex).trimEnd(),part.slice(tableSepIndex).trimStart()].filter(Boolean);
    return [part]
  });
  parts=parts.flatMap(part=>{
    if(!part.trimStart().startsWith('|'))return [part];
    const headingIndex=part.search(/\s+\*\*[^*\n]+?\*\*/);
    if(headingIndex>0)return [part.slice(0,headingIndex).trimEnd(),part.slice(headingIndex).trimStart()].filter(Boolean);
    return [part]
  });
  return parts;
}
function normalizeMarkdownText(text){
  return String(text||'').replace(/\r\n?/g,'\n').split(/(```[\s\S]*?```)/g).map((chunk,index)=>{
    if(index%2===1)return chunk;
    let value=chunk;
    value=value.replace(/([:：])\s+(\*\*[^*\n]+?\*\*)/g,'$1\n\n$2');
    value=value.replace(/(\*\*[^*\n]+?\*\*)\s+(\d+\.\s+)/g,'$1\n\n$2');
    value=value.replace(/\s+(\d+\.\s*\*\*)/g,'\n$1');
    return value.split('\n').flatMap(normalizeMarkdownLine).join('\n');
  }).join('');
}
function md(t){if(!t)return'';try{return DOMPurify.sanitize(mk.parse(normalizeMarkdownText(t)),{USE_PROFILES:{html:true}})}catch{return esc(t)}}
function scroll(){requestAnimationFrame(()=>{$.scroll.scrollTop=$.scroll.scrollHeight})}

function renderSL(list){
  const primary=document.getElementById('slist');
  const secondary=document.getElementById('slist2');
  if(!primary&&!secondary)return;
  const h=list.map(s=>{
    const dir=s.workingDirectory||'';
    const dirName=dir.split(/[/\\]/).pop()||'';
    const nm=dirName||s.name||'Session';
    const parts=[];
    if(s.agent&&s.agent!=='copilot-sdk')parts.push(s.agent);
    else if(s.model)parts.push(s.model);
    if(s.firstPrompt)parts.push(s.firstPrompt.substring(0,40));
    if(s.roomOnly)parts.push('tap to resume');
    const meta=parts.join(' · ');
    const dot=s.active?'on':s.roomOnly?'stale':'';
    const action=sessionCanDelete(s)
      ?`<button class="sr-del" data-action="delete-session" data-session-id="${esc(s.sessionId)}" title="Delete session">\u2715</button>`
      :sessionCanRead(s)
        ?`<button class="sr-del" data-action="leave-session" data-session-id="${esc(s.sessionId)}" title="Leave session">↩</button>`
        :'';
    return`<li><div class="sr${s.sessionId===rid?' active':''}" data-action="switch-session" data-session-id="${esc(s.sessionId)}" title="${esc(dir||s.sessionId)}"><div class="sr-icon">\u2726</div><div class="sr-info"><div class="sr-name">${esc(nm)}</div><div class="sr-meta">${esc(meta)}</div></div>${action}</div></li>`;
  }).join('')||'<li style="text-align:center;color:#555;padding:16px;font-size:13px">No sessions yet</li>';
  if(primary)primary.innerHTML=h;if(secondary)secondary.innerHTML=h;
}
async function refreshSL(){}

function syncSt(){
  if(!uid){$.tst.textContent='';$.tst.removeAttribute('data-tone');syncPortalRail();renderSessionBanner();return}
  let text='';
  let tone='idle';
  if(portalTransportState==='failed'){
    text='WPS unavailable';
    tone='error';
  }else if(portalTransportState==='disconnected'){
    text='WPS disconnected';
    tone='error';
  }else if(portalTransportState==='connecting'){
    text='Connecting';
    tone='busy';
  }else{
    text='';
  }
  $.tst.textContent=text;
  if(text)$.tst.dataset.tone=tone;
  else $.tst.removeAttribute('data-tone');
  renderSessionBanner();
  syncPortalRail();
}
function applyState(e){if(sessionBooting&&(e.ready===true||e.processing||Number(e.pendingCount)>0)){markSessionReady()}else if(sessionBooting){updateSessionBooting('Synchronizing session state…')}if(typeof e.ready==='boolean')currentSessionReady=e.ready;ss.processing=!!e.processing;ss.pendingCount=Number(e.pendingCount)||0;ss.stopping=!!e.stopping;if(!ss.stopping){lastStopRequestAt=0;clearSessionBanner('stop')}if(e.model){ss.model=e.model;const nextToolbarModelId=deriveToolbarModelId(currentModelId,availableModels,e.model);if(nextToolbarModelId!==currentModelId){currentModelId=nextToolbarModelId;syncModelButton();renderModelDropdown();updateToolbarVisibility()}}if(ss.processing)showWorking();else{hideWorking();sendMode='enqueue'}syncComposer();syncSt();refreshSessionPlaceholder();renderSessionContextBar();void renderSessionsCol()}
window.toggleMode=()=>{if(!ss.processing)return;sendMode=sendMode==='enqueue'?'immediate':'enqueue';syncSt()};

async function initCC(userId){
  if(cc&&uid===userId)return cc;uid=userId;
  syncUserBadge();
  const negUrl=userId?`/negotiate:portal?userId=${encodeURIComponent(userId)}`:'/negotiate:portal';
  const negRes=await fetch(negUrl,{headers:createPortalHeaders({},userId)});
  if(negRes.status===401){window.location.href='/auth/login';return}
  const negData=await negRes.json();
  if(negData.error)throw new Error(negData.error);
  if(negData.userId)uid=negData.userId;
  syncUserBadge();
  cc=await new ChatClient(negData.url).login();
  cc.addListenerForNewMessage(onMsg);
  cc.addListenerForNewRoom((room)=>{rememberKnownRoomInfo(supplementalRoomInfos,room);if(room.roomId!==LOBBY_ROOM){const req=joinRequests.get(room.roomId)||{};if(req&&(req.status==='pending'||req.status==='approved')){joinRequests.set(room.roomId,{...req,status:'approved'});openR(room.roomId).catch(err=>{setSessionBanner({source:'error',label:'Open failed',text:err?.message||'Failed to open newly joined session',tone:'error',actionText:'Retry',action:()=>openR(room.roomId)});setFormStatus(err?.message||'Failed to open joined session.','error',4500,'join')});}renderSessionsCol()}});
  cc.addListenerForRoomLeft((info)=>{const leftRoomId=String(info.roomId||'').trim();supplementalRoomInfos.delete(leftRoomId);roomsPendingLiveSync.delete(leftRoomId);if(info.roomId===rid){rid=null;resetChatState();applyLoggedInState();updateBreadcrumb();updateAutoBtn()}renderSessionsCol()});
  cc.onConnected(()=>{setPortalTransportState('connected');clearSessionBanner('portal');setSt('idle');pulsePortalRefresh([0,300],{includeRequests:true})});
  cc.onDisconnected(()=>{setPortalTransportState('disconnected');setSessionBanner({source:'portal',label:'WPS disconnected',text:'Portal lost its Web PubSub connection. Refresh the page or retry the connection.',tone:'error',actionText:oauthMode&&oauthAuthenticatedUser?'Retry':'Refresh',action:oauthMode&&oauthAuthenticatedUser?()=>retryPortalConnection():()=>window.location.reload()});setSt('disconnected')});
  cancelLobbyMembershipRecovery();
  startPortalPolling();
  startLobbyMembershipRecovery(uid);
  return cc;
}
function unpackEnvelope(e){if(e.type!=='transport.chunk')return[e];let s=tc.get(e.chunkId);if(!s){s={parts:new Array(e.total),received:0,startedAt:Date.now()};tc.set(e.chunkId,s)}if(s.parts[e.index]==null){s.parts[e.index]=e.jsonPart;s.received+=1}if(s.received<e.total)return[];tc.delete(e.chunkId);try{return[JSON.parse(s.parts.join(''))]}catch(err){portalWarn('transport.chunk.decode.failed','Chunk decode failed',{chunkId:e.chunkId,error:err});addErr('Failed to decode large message');return[]}}
function pruneStaleChunks(){const now=Date.now();for(const[chunkId,s]of tc){if(now-s.startedAt>15000){portalWarn('transport.chunk.stale.dropped','Dropping stale incomplete chunk',{chunkId,received:s.received,total:s.parts.length});tc.delete(chunkId)}}}
setInterval(pruneStaleChunks,5000);
function onMsg(n){const m=n.message,r=n.conversation?.roomId;if(!m.content?.text)return;
  let resolvedRoomIdForDebug='';
  try{resolvedRoomIdForDebug=resolveNotificationRoomId(n,knownRoomInfosForRouting())}catch{}
  const debugLabel=resolvedRoomIdForDebug===LOBBY_ROOM?'lobby':resolvedRoomIdForDebug?.startsWith(DAEMON_SYNC_ROOM_PREFIX)?'daemon':resolvedRoomIdForDebug===rid?'session':'room';
  let parsedForDebug=null;
  try{parsedForDebug=JSON.parse(m.content.text)}catch{}
  const debugProto=parsedForDebug?.type&&/^(assistant\.|tool\.|permission\.|session\.(state|idle|error)|commands\.|modes\.|models\.|mode\.|usage\.|system\.|user\.(prompt|command))/.test(parsedForDebug.type)?'acp':'';
  try{logDebugMessage('recv',parsedForDebug||m.content.text,debugLabel,debugProto)}catch{logDebugMessage('recv',m.content.text,debugLabel,debugProto)}
  try{
    const parsed=JSON.parse(m.content.text);
    const envelopes=unpackEnvelope(parsed);
    const resolvedRoomId=resolveNotificationRoomId(n,knownRoomInfosForRouting());
    if(resolvedRoomId&&relayRoomDelegations.has(resolvedRoomId)){
      const seen=relaySeenStore(resolvedRoomId);
      if(isLocalEchoMessage(m,uid)){rememberRoomMessage(m,seen);return}
      if(shouldIgnoreRoomMessage(m,seen,0))return;
      rememberRoomMessage(m,seen);
      for(const e of envelopes){if(e?.type==='delegation.stream.event'&&e.targetDaemonId&&m.createdBy!==e.targetDaemonId)continue;applyDelegationRelayEnvelope(e)}
      return
    }
    if(resolvedRoomId&&resolvedRoomId.startsWith(DAEMON_SYNC_ROOM_PREFIX)){
      if(isLocalEchoMessage(m,uid))return;
      for(const e of envelopes)applyDaemonSyncEnvelope(e);
      return
    }
    if(resolvedRoomId===LOBBY_ROOM){
      for(const e of envelopes)applyLobbyEnvelope(e);
      return
    }
    const roomMessageAction=classifyIncomingSessionRoomMessage(n,{currentRoomId:rid,currentUserId:uid,roomInfos:knownRoomInfosForRouting(),seenRoomMessageIds,historyLoadedAt});
    if(roomMessageAction.action!=='render')return;
    for(const e of envelopes){
      if(e.type==='portal.join-request'&&e.status==='pending'&&e.requesterUserId!==uid){
        const key=e.requestId||`${e.sessionId||resolvedRoomId}:${e.requesterUserId}`;
        if(!seenPendingJoinRequestIds.has(key)){
          seenPendingJoinRequestIds.add(key);
          void handleJoinRequest({...e,sessionId:e.sessionId||resolvedRoomId});
        }
        continue;
      }
      render(e);
    }
    scroll()
  }catch(err){portalWarn('message.render.failed','Incoming message render failed',{roomId:r,messageId:m?.messageId,textPreview:m?.content?.text?.substring(0,200),error:err})}
}

async function resumeSess(sid,showErr=true){
  try{await ensureJoinedSession(sid);await openR(sid);await refreshSL();return true}catch(e){if(showErr)setSessionBanner({source:'error',label:'Open failed',text:e.message||'Failed to open session',tone:'error',actionText:'Retry',action:()=>resumeSess(sid,true)});return false}
}
window.switchS=async(s,a)=>{if(s===rid){closePanel();return}try{if(!cc)throw new Error('Log in first');await ensureJoinedSession(s);await openR(s);await refreshSL()}catch(e){setSessionBanner({source:'error',label:'Open failed',text:e.message||'Failed to switch session',tone:'error',actionText:'Retry',action:()=>window.switchS(s,a)})}closePanel()};
window.joinDlg=()=>{const s=prompt('Session ID');if(s?.trim()){(async()=>{if(!cc)throw new Error('Log in first');await resumeSess(s.trim())})().catch(e=>setFormStatus(e.message||'Failed to join session.','error',4500,'join'))}};
const confirmQueue=[];
let activeConfirm=null;
function pumpConfirm(){
  if(activeConfirm||!confirmQueue.length)return;
  activeConfirm=confirmQueue.shift();
  document.getElementById('cf-msg').textContent=activeConfirm.msg;
  const btn=document.getElementById('cf-action');
  btn.textContent=activeConfirm.action;
  btn.className=activeConfirm.action==='Allow'?'cf-allow':'cf-danger';
  document.getElementById('confirm-dlg').classList.add('show')
}
function settleConfirm(value){
  if(!activeConfirm)return;
  document.getElementById('confirm-dlg').classList.remove('show');
  const current=activeConfirm;
  activeConfirm=null;
  current.resolve(value);
  pumpConfirm()
}
function showConfirm(msg,action='Delete'){return new Promise(resolve=>{confirmQueue.push({msg,action,resolve});pumpConfirm()})}
window.cfResolve=(v)=>{settleConfirm(v)};
window.delSess=async(sid)=>{if(!await showConfirm('Delete this session?'))return;try{
  await portalJson(`/api/sessions/${encodeURIComponent(sid)}`,{method:'DELETE'});
  announceSession('session.deleted',sid);
  joinRequests.delete(sid);
  if(rid===sid){rid=null;resetChatState();applyLoggedInState();updateBreadcrumb();updateAutoBtn()}
  await renderSessionsCol();
}catch(e){setFormStatus(e.message||'Failed to delete session.','error',4500,'create')}};
window.leaveSess=async(sid)=>{if(!await showConfirm('Leave this shared session?','Leave'))return;try{
  await portalJson(`/api/sessions/${encodeURIComponent(sid)}/members/${encodeURIComponent(uid)}`,{method:'DELETE'});
  joinRequests.delete(sid);
  removeDiscoveredSession(sid);
  if(rid===sid){rid=null;resetChatState();applyLoggedInState();updateBreadcrumb();updateAutoBtn()}
  await renderSessionsCol();
}catch(e){setFormStatus(e.message||'Failed to leave session.','error',4500,'join')}};
window.createSess=async()=>{
  const daemon=currentCreateDaemon();
  const daemonId=currentCreateDaemonId();
  const d=normalizePickerPath(document.getElementById('f-dir').value.trim(),daemon?.platform),ag=createSessionDraft.agentName||document.getElementById('f-agent').value;
  if(!daemonId)return setFormStatus('Select a workspace first.','error',3500,'create');
  if(!ag)return setFormStatus('Select an agent first.','error',3500,'create');
  if(!cc)return setFormStatus('Not connected. Log in first.','error',3500,'create');
  if(d&&!pathLooksCompatibleWithPlatform(d,daemon?.platform)){
    const fallbackDir=defaultDirectoryForDaemon(daemon);
    if(fallbackDir)setSelectedDirectory(fallbackDir,'auto');
    return setFormStatus(`Directory does not match the selected workspace platform (${daemon?.platform==='win32'?'Windows':'Linux/macOS'}).`,'error',4500,'create');
  }
  const b=document.getElementById('f-btn');b.dataset.busy='true';b.disabled=true;b.classList.remove('is-blocked');b.textContent='Creating…';
  try{
    const agentLabel=AGENT_NAMES[ag]||ag;
    const dirName=(d||'Session').split(/[/\\]/).pop()||'Session';
    const roomName=`${dirName} (${ag})`;
    setFormStatus('Creating session room…','loading',0,'create');
    const room=await portalJson('/api/sessions',{method:'POST',body:JSON.stringify({daemonId,agentName:ag,workingDirectory:d||undefined,roomName})});
    const sessionId=room.sessionId;
    setFormStatus('Joining session room…','loading',0,'create');
    await waitForRoomMembership(sessionId,6000);
    joinRequests.delete(sessionId);
    upsertDiscoveredSession({
      ...room,
      sessionId,
      ownerUserId:room.ownerUserId||uid,
      daemonId:room.daemonId||daemonId,
      agentName:room.agentName||ag,
      workingDirectory:room.workingDirectory??(d||undefined),
      roomName:room.roomName||roomName,
      updatedAt:room.updatedAt||new Date().toISOString(),
    });
    // Reuse the normal room-opening path so a brand-new session also replays any
    // early startup metadata that may have landed before the POST returned.
    setSessionBooting(true,`Starting ${agentLabel}…`);
    setFormStatus(`Starting ${agentLabel}…`,'loading',0,'create');
    updateSessionBooting('Waiting for agent to initialize…');
    setFormStatus('Waiting for agent to initialize…','loading',0,'create');
    sessionAutoApprove.set(sessionId,true);
    await openR(sessionId,{preserveBooting:true,bootStage:`Starting ${agentLabel}…`});
    currentDaemonId=room.daemonId||daemonId;
    currentAgentName=room.agentName||ag;
    createSessionDraft.daemonId=currentDaemonId;
    createSessionDraft.agentName=currentAgentName;
    createSessionDraft.directory=d||'';
    closeCreateSessionModal();
    setSt('idle');ss.processing=false;ss.pendingCount=0;sendMode='enqueue';syncSt();
    await renderSessionsCol();
    if(isMobile())mobShow('chat-col');
  }catch(e){setSessionBooting(false);setFormStatus(e.message||'Failed to create session.','error',5000,'create');if(rid)setSessionBanner({source:'error',label:'Start failed',text:e.message||'Failed to create session',tone:'error'})}finally{delete b.dataset.busy;syncCreateSessionButton()}
};

async function openR(roomId,{preserveBooting=false,bootStage='',retryLiveSyncRecovery=true}={}){
  if(!cc)throw new Error('Not connected');
  cancelSessionLiveSyncRetry();
  let knownMeta=discoveredSessions.get(roomId);
  if(knownMeta)syncSessionSelection(roomId,knownMeta);
  let roomInfo=null;
  const roomInfoPromise=cc.getRoom(roomId,false).catch(err=>{portalWarn('session.open.room-info.failed','Open room info hydrate failed',{roomId:roomId.substring(0,8),error:err});return null});
  rid=roomId;historyLoadedAt=0;seenRoomMessageIds.clear();resetDelegationViewState();$.chat.innerHTML='';pd.clear();rd.clear();at.clear();pp.clear();tc.clear();$wi=null;resetSessionToolbar();clearSelectedDelegationTarget();
  currentSessionReady=null;latestSessionHistorySummary=createSessionHistorySummary();chatPlaceholderOverride=null;
  if(preserveBooting)setSessionBooting(true,bootStage||sessionBootingStage||'Preparing session…');
  else setSessionBooting(false);
  showChat();updateBreadcrumb();
  setSessionBanner({source:'history',label:'Loading',text:'Loading session history…',tone:'info'});
  setSt('idle');ss.processing=false;ss.pendingCount=0;ss.stopping=false;sendMode='enqueue';syncComposer();syncSt();
  // Ensure the WebSocket-level group subscription is active before sync.
  // REST membership (addUserToRoom / hasJoinedRoom) does NOT guarantee WebSocket delivery;
  // the server token must include webpubsub.joinLeaveGroup role, and the client must
  // explicitly joinGroup for rooms joined after the initial login.
  const liveSubscriptionPromise=ensureLiveRoomSubscription(roomId,{retries:1,retryDelayMs:300});
  roomInfo=await roomInfoPromise;
  if(roomInfo){
    rememberKnownRoomInfo(supplementalRoomInfos,roomInfo);
    const roomPatch={
      sessionId:roomId,
      defaultConversationId:roomInfo.defaultConversationId||knownMeta?.defaultConversationId||'',
      name:resolveRoomDisplayName(roomInfo),
      updatedAt:roomInfo.updatedAt||roomInfo.createdAt||knownMeta?.updatedAt,
    };
    syncSessionSelection(roomId,{...(knownMeta||{}),...roomPatch});
    knownMeta=discoveredSessions.get(roomId)||{...(knownMeta||{}),...roomPatch};
  }
  const liveSubscribed=await liveSubscriptionPromise;
  // If joinGroup succeeded, we can trust the WebSocket subscription is active.
  // No need for the expensive session.sync_state round-trip to prove it.
  if(liveSubscribed)roomsPendingLiveSync.delete(roomId);
  try{const sessionMeta={...(knownMeta||{}),sessionId:roomId};
    const shouldWaitForLiveState=(targetRoomId)=>roomNeedsLiveSyncValidation(targetRoomId)||!hasLiveRoomJoin(targetRoomId);
    if(canSkipInitialSessionSync({roomInfo,shouldWaitForLiveState:shouldWaitForLiveState(roomId)})){
      clearSessionBanner('history');
      refreshSessionPlaceholder();
      try{await cc.sendToRoom(roomId,JSON.stringify({type:'session.sync_state'}))}catch{}
      return;
    }
    const openSyncResult=await ensureSessionOpenSync(roomId,{
      replayHistory:(targetRoomId,targetSessionMeta,historyOptions)=>replayLatestRoomHistory(targetRoomId,targetSessionMeta,{...historyOptions,roomInfo:targetRoomId===roomId?roomInfo:null}),
      waitForLiveState:(targetRoomId,timeoutMs,sessionMeta)=>waitForRoomLiveState(targetRoomId,timeoutMs,sessionMeta,{allowHistoryFallback:!roomNeedsLiveSyncValidation(targetRoomId)}),
      sessionMeta,
      timeoutMs:ROOM_LIVE_SYNC_TIMEOUT_MS,
      historyOptions:{maxCount:100,skipStartupEnvelopes:true},
      hasLiveRoomJoin:(targetRoomId)=>hasLiveRoomJoin(targetRoomId),
      shouldWaitForLiveState,
      onWaitingForLiveState:()=>{setSessionBanner({source:'history',label:'Syncing',text:'Waiting for live session sync…',tone:'info'});refreshSessionPlaceholder({forceSyncing:true})},
    });
    latestSessionHistorySummary=openSyncResult?.historySummary||latestSessionHistorySummary||createSessionHistorySummary();
    if(typeof latestSessionHistorySummary.readyState==='boolean')currentSessionReady=latestSessionHistorySummary.readyState;
    roomsPendingLiveSync.delete(roomId);
    clearSessionBanner('history');
    refreshSessionPlaceholder();
    // Always request the latest toolbar state (models, modes, commands, usage)
    // from the daemon after opening a session. History replay may not contain
    // them, and the live sync phase is skipped when joinGroup succeeds.
    try{await cc.sendToRoom(roomId,JSON.stringify({type:'session.sync_state'}))}catch{}
  }catch(e){
    const message=String(e?.message||'');
    if(retryLiveSyncRecovery&&(/not a member of the specified room|NoPermissionInRoom|permission in room|forbidden/i.test(message))){
      try{
        setSessionBanner({source:'history',label:'Resyncing',text:'Refreshing room membership…',tone:'info'});
        await forceRoomMembershipRefresh(roomId,ROOM_MEMBERSHIP_TIMEOUT_MS);
        return await openR(roomId,{preserveBooting,bootStage,retryLiveSyncRecovery:false})
      }catch(rejoinErr){
        e=rejoinErr
      }
    }
    if(shouldSuppressSessionOpenError(e,latestSessionHistorySummary)){
      currentSessionReady=false;
      setSessionBanner({source:'history',label:'Starting',text:'This session is still initializing. Keep this room open and it should become ready automatically.',tone:'info'});
      refreshSessionPlaceholder();
      return;
    }
    if(shouldBackgroundRetrySessionOpenError(e,latestSessionHistorySummary)){
      setSessionBanner({source:'history',label:'Sync delayed',text:'History loaded, but live updates have not started yet. Keeping the room open and retrying in the background…',tone:'warn'});
      refreshSessionPlaceholder({forceSyncing:true});
      scheduleSessionLiveSyncRetry(roomId);
      return;
    }
    setSessionBanner({source:'error',label:'History error',text:e.message||'Failed to load history',tone:'error',actionText:'Retry',action:()=>openR(roomId)});addErr('History: '+(e?.message||e))
  }
}

window.stopCurrentTurn=async()=>{
  if(!rid||!cc||(!ss.processing&&!ss.stopping))return;
  const now=Date.now();
  const retrying=!!ss.stopping;
  if(retrying&&now-lastStopRequestAt<STOP_RETRY_COOLDOWN_MS)return;
  lastStopRequestAt=now;
  ss.stopping=true;
  setWorkingLabel('Stopping current response…');
  setSessionBanner({source:'stop',label:retrying?'Retrying stop':'Stopping',text:retrying?'Sent another cancel request. Waiting for the agent to stop…':'Stop requested. If the agent keeps running, click stop again to retry.',tone:'warn'});
  syncComposer();
  syncSt();
  try{
    await cc.sendToRoom(rid,JSON.stringify({type:'control.cancel'}));
    await announceSession('session.touch',rid,{updatedAt:new Date().toISOString()});
  }catch(e){
    lastStopRequestAt=0;
    ss.stopping=false;
    clearSessionBanner('stop');
    syncComposer();
    setSessionBanner({source:'error',label:'Stop failed',text:e.message||'Failed to stop current response',tone:'error'});
    addErr(e.message||'Failed to stop current response');
  }
};
window.handleComposerAction=()=>{if(ss.processing||ss.stopping)return window.stopCurrentTurn();return window.sendMsg()};

window.sendMsg=async()=>{
  const t=$.mi.value.trim();if(!t){if(selectedDelegationTarget){setSessionBanner({source:'error',label:'Delegation incomplete',text:'Add the prompt text you want to delegate to the selected session.',tone:'error'})}return}
  if(!rid||!cc){setSessionBanner({source:'error',label:'No active session',text:'Open or create a session first.',tone:'error'});addErr('Not connected — open or create a session first');return}
  if(sessionBooting){setSessionBanner({source:'boot',label:'Starting',text:sessionBootingStage||'Agent is still starting… please wait.',tone:'info'});syncComposer();return}
  if(ss.stopping)return;
  const typedDelegationCmd=parseDelegationCommand(t)||parseMentionDelegationCommand(t);
  const activeDelegationTarget=selectedDelegationTarget?{...selectedDelegationTarget}:null;
  const delegationCmd=typedDelegationCmd||(!typedDelegationCmd&&activeDelegationTarget?{targetSessionId:activeDelegationTarget.sessionId,prompt:t,displayText:selectedDelegationDisplayText(t)}:null);
  if(delegationCmd){
    const currentSession=discoveredSessions.get(rid)||{sessionId:rid,accessLevel:'write'};
    if(!sessionCanWrite(currentSession)){setSessionBanner({source:'error',label:'Read-only session',text:'You need write access to the current source session before creating a delegation.',tone:'error'});return}
    if(activeDelegationTarget)clearSelectedDelegationTarget();
    $.mi.value='';resizeComposerInput();
    clearSessionBanner('error');
    setSessionBanner({source:'history',label:'Delegating',text:'Dispatching prompt to the target session…',tone:'info'});
    try{
      await createDelegationRequest(delegationCmd.targetSessionId,delegationCmd.prompt,delegationCmd.displayText||t);
      clearSessionBanner('history');
      scroll();
    }catch(e){
      if(activeDelegationTarget)setSelectedDelegationTarget(activeDelegationTarget,{mode:activeDelegationTarget.mode,focusInput:false,preserveInput:true});
      $.mi.value=t;$.mi.focus();
      resizeComposerInput();
      setSessionBanner({source:'error',label:'Delegation failed',text:e.message||'Failed to create delegation',tone:'error',actionText:'Restore draft',action:async()=>{$.mi.value=t;$.mi.focus()}});
      addErr(e.message||'Failed to create delegation');
    }
    return
  }
  if(/^\/delegate(?:\s+\S*)?$/i.test(t)||/^@\S*$/.test(t)){
    setSessionBanner({source:'error',label:'Delegation incomplete',text:'Pick a target session, then add the prompt text you want to delegate.',tone:'error'});
    return
  }
  $.mi.value='';resizeComposerInput();
  const mode=ss.processing?sendMode:'enqueue';
  clearSessionBanner('error');
  try{
    if(t.startsWith('/')){setWorkingLabel(mode==='immediate'?'Sending steering update…':'Sending command…');addSys(t);if(ss.processing&&mode==='enqueue'){addSys('Queued');ss.pendingCount+=1}if(!ss.processing)ss.processing=true;const env={type:'user.command',command:t,mode};logDebugMessage('send',env);await cc.sendToRoom(rid,JSON.stringify(env));await announceSession('session.touch',rid,{updatedAt:new Date().toISOString()});sendMode='enqueue';syncSt();scroll();return}
    setWorkingLabel('Waiting for agent response…');
    addUB(t);setSt('busy');if(ss.processing&&mode==='enqueue'){addSys('Queued');ss.pendingCount+=1}if(!ss.processing)ss.processing=true;
    const env={type:'user.prompt',content:t,mode};logDebugMessage('send',env);await cc.sendToRoom(rid,JSON.stringify(env));await announceSession('session.touch',rid,{updatedAt:new Date().toISOString()});sendMode='enqueue';syncSt();scroll();
  }catch(e){$.mi.value=t;$.mi.focus();resizeComposerInput();setSessionBanner({source:'error',label:'Send failed',text:e.message||'Failed to send message',tone:'error',actionText:'Restore draft',action:async()=>{$.mi.value=t;$.mi.focus()}});addErr(e.message||'Failed to send message')}
};
$.mi.addEventListener('keydown',e=>{if(handleSlashNav(e))return;if(e.key==='Backspace'&&selectedDelegationTarget&&!$.mi.value){e.preventDefault();clearSelectedDelegationTarget({focusInput:false});return}if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();hideSlashMenu();handleComposerAction()}});
$.mi.addEventListener('input',()=>{resizeComposerInput();void syncComposerSelectionMenu()});

function isDelegationSummaryType(type){return /^delegation\.(prompt|dispatched|started|completed|failed|cancelled|expired)$/.test(String(type||''))}
function isDelegationTerminalType(type){return /^(delegation\.(completed|failed|cancelled|expired))$/.test(String(type||''))}
function delegationStatusFromSummaryType(type){const value=String(type||'').trim();if(value==='delegation.prompt')return'creating';if(value==='delegation.dispatched')return'dispatched';if(value==='delegation.started')return'started';if(value==='delegation.completed')return'completed';if(value==='delegation.failed')return'failed';if(value==='delegation.cancelled')return'cancelled';if(value==='delegation.expired')return'expired';return''}
function delegationStatusLabel(status){const value=String(status||'').trim();if(value==='creating')return'Creating';if(value==='dispatched')return'Dispatched';if(value==='started')return'Started';if(value==='streaming')return'Streaming';if(value==='cancel_requested')return'Cancelling';if(value==='completed')return'Completed';if(value==='failed')return'Failed';if(value==='cancelled')return'Cancelled';if(value==='expired')return'Expired';return'Delegation'}
function relaySeenStore(roomId){const key=String(roomId||'').trim();if(!relaySeenMessageIds.has(key))relaySeenMessageIds.set(key,new Set());return relaySeenMessageIds.get(key)}
function resetDelegationViewState(){delegationViews.clear();relayRoomDelegations.clear();relaySeenMessageIds.clear()}
function hasActiveDelegationForSourceSession(sessionId){const normalizedSessionId=String(sessionId||'').trim();if(!normalizedSessionId)return false;for(const view of delegationViews.values()){if(String(view?.sourceSessionId||'').trim()!==normalizedSessionId)continue;if(!/^(completed|failed|cancelled|expired)$/.test(String(view?.status||'')))return true}return false}
function syncLocalSourceSessionDelegationState(sessionId){const normalizedSessionId=String(sessionId||'').trim();if(!normalizedSessionId)return;upsertDiscoveredSession({sessionId:normalizedSessionId,sessionDelegating:hasActiveDelegationForSourceSession(normalizedSessionId)});if(normalizedSessionId===rid)renderSessionContextBar();void renderSessionsCol()}
function updateDelegationStatus(view,status){if(!view)return;const next=String(status||'').trim();if(!next)return;const current=String(view.status||'').trim();if(/^(completed|failed|cancelled|expired)$/.test(current)&&!/^(completed|failed|cancelled|expired)$/.test(next))return;view.status=next;view.statusEl.dataset.state=next;view.statusEl.textContent=delegationStatusLabel(next);updateDelegationControls(view)}
function renderDelegationCardExpansion(view){if(!view)return;const collapsed=isDelegationCardCollapsed(view.timelineState);view.card.classList.toggle('is-collapsed',collapsed);view.toggleBtn.setAttribute('aria-expanded',collapsed?'false':'true');view.toggleBtn.title=collapsed?'Expand delegation details':'Collapse delegation details'}
function renderDelegationHeaderSummary(view){if(!view)return;const summary=buildDelegationCardHeaderSummary({prompt:view.promptEl.textContent||'',model:view.model,usage:view.usage,error:view.error});view.headPromptEl.textContent=summary.promptPreview;view.headMetaEl.textContent=summary.metaPreview;view.headPromptEl.classList.toggle('hidden',!summary.promptPreview);view.headMetaEl.classList.toggle('hidden',!summary.metaPreview)}
function syncDelegationDetailVisibility(view){if(!view)return;const sectionState=getDelegationCardSectionState({prompt:view.promptEl.textContent||'',model:view.model,usage:view.usage,error:view.error,timelineItems:view.timelineState?.items||[],targetSessionId:view.targetSessionId,delegationId:view.delegationId,status:view.status});view.promptEl.classList.toggle('hidden',!sectionState.showPrompt);view.bodyEl.classList.toggle('hidden',!sectionState.showBody);view.metaEl.textContent=sectionState.metaText;view.metaEl.classList.toggle('hidden',!sectionState.showMeta);view.openBtn.classList.toggle('hidden',!sectionState.showOpenTarget);view.cancelBtn.classList.toggle('hidden',!sectionState.showCancel);view.actionsEl.classList.toggle('hidden',!sectionState.showActions);view.detailEl.classList.toggle('hidden',!sectionState.showDetail);renderDelegationHeaderSummary(view)}
function updateDelegationMeta(view){if(!view)return;syncDelegationDetailVisibility(view)}
function updateDelegationControls(view){if(!view)return;const terminal=/^(completed|failed|cancelled|expired)$/.test(String(view.status||''));view.cancelBtn.disabled=terminal||!view.delegationId;view.openBtn.disabled=!view.targetSessionId;syncDelegationDetailVisibility(view)}
function delegationToolSignature(payload){const name=String(payload?.name||'Tool').trim()||'Tool';let args='';try{if(payload&&Object.prototype.hasOwnProperty.call(payload,'args'))args=typeof payload.args==='string'?payload.args:JSON.stringify(payload.args??'')}catch{args=String(payload?.args??'')}return`${name}\n${args}`}
function delegationToolStateLabel(item){if(item?.state==='failed')return'Failed';if(item?.state==='done')return'Done';return'Running'}
function delegationToolDisplayName(item){const normalizedName=String(item?.name||'Tool').trim()||'Tool';const repeatCount=Math.max(1,Number(item?.repeatCount)||1);return repeatCount>1?`${normalizedName} ×${repeatCount}`:normalizedName}
function renderDelegationTimeline(view){if(!view?.bodyEl)return;const fragment=document.createDocumentFragment();for(const item of view.timelineState.items){if(item.kind==='assistant'){const messageEl=document.createElement('div');messageEl.className=`deleg-msg${item.streaming?' streaming':''}`;if(item.streaming)messageEl.textContent=item.content||'';else messageEl.innerHTML=item.content?md(item.content):'';fragment.appendChild(messageEl);continue}if(item.kind==='reasoning'){const reasoningWrap=document.createElement('details');reasoningWrap.className='deleg-reasoning show';reasoningWrap.open=item.expanded!==false;const summaryEl=document.createElement('summary');summaryEl.textContent='Reasoning';const reasoningBody=document.createElement('div');reasoningBody.className=`deleg-reasoning-body${item.streaming?' streaming':''}`;if(item.streaming)reasoningBody.textContent=item.content||'';else reasoningBody.innerHTML=item.content?md(item.content):'';reasoningWrap.append(summaryEl,reasoningBody);reasoningWrap.addEventListener('toggle',()=>setDelegationCardReasoningExpanded(view.timelineState,item.id,reasoningWrap.open));fragment.appendChild(reasoningWrap);continue}if(item.kind==='tool'){const row=document.createElement('div');row.className='deleg-tool';row.dataset.state=item.state||'running';row.innerHTML=`<span class="deleg-tool-name"></span><span class="deleg-tool-state"></span>`;row.querySelector('.deleg-tool-name').textContent=delegationToolDisplayName(item);row.querySelector('.deleg-tool-state').textContent=delegationToolStateLabel(item);fragment.appendChild(row)}}view.bodyEl.replaceChildren(fragment);syncDelegationDetailVisibility(view)}
function ensureDelegationView(envelope){const delegationId=String(envelope?.delegationId||'').trim();if(!delegationId)return null;let view=delegationViews.get(delegationId);if(!view){const card=document.createElement('div');card.className='deleg-card';card.dataset.delegationId=delegationId;card.innerHTML=`<div class="deleg-head"><div class="deleg-head-main"><div class="deleg-head-copy"><div class="deleg-kicker">Cross-Agent Communication</div><div class="deleg-title"></div></div><div class="deleg-head-summary"><div class="deleg-head-prompt hidden"></div><div class="deleg-head-meta hidden"></div></div></div><div class="deleg-head-side"><span class="deleg-state">Delegation</span><button class="deleg-toggle" type="button" aria-expanded="true" title="Collapse delegation details"><span class="deleg-toggle-chevron">›</span></button></div></div><div class="deleg-detail"><div class="deleg-prompt hidden"></div><div class="deleg-body hidden"></div><div class="deleg-meta hidden"></div><div class="deleg-actions hidden"><button type="button">Open target</button><button type="button">Cancel</button></div></div>`;$.chat.appendChild(card);const actions=card.querySelectorAll('.deleg-actions button');view={delegationId,sourceSessionId:'',targetSessionId:'',relayRoomId:'',targetLabel:'',status:'creating',lastSeenSeq:0,messageBuffer:'',reasoningBuffer:'',model:'',usage:{},error:'',relayConnectPromise:null,timelineState:createDelegationCardState(),card,titleEl:card.querySelector('.deleg-title'),statusEl:card.querySelector('.deleg-state'),promptEl:card.querySelector('.deleg-prompt'),bodyEl:card.querySelector('.deleg-body'),metaEl:card.querySelector('.deleg-meta'),detailEl:card.querySelector('.deleg-detail'),actionsEl:card.querySelector('.deleg-actions'),headPromptEl:card.querySelector('.deleg-head-prompt'),headMetaEl:card.querySelector('.deleg-head-meta'),toggleBtn:card.querySelector('.deleg-toggle'),openBtn:actions[0],cancelBtn:actions[1]};view.toggleBtn.addEventListener('click',event=>{event.stopPropagation();toggleDelegationCardCollapsed(view.timelineState);renderDelegationCardExpansion(view)});view.openBtn.addEventListener('click',event=>{event.stopPropagation();if(view.targetSessionId)window.openSession(view.targetSessionId)});view.cancelBtn.addEventListener('click',event=>{event.stopPropagation();if(view.delegationId)void cancelDelegation(view.delegationId)});renderDelegationCardExpansion(view);syncDelegationDetailVisibility(view);delegationViews.set(delegationId,view)}view.sourceSessionId=view.sourceSessionId||String(envelope?.sourceSessionId||'').trim();view.targetSessionId=String(envelope?.targetSessionId||view.targetSessionId||'').trim();view.relayRoomId=String(envelope?.relayRoomId||view.relayRoomId||'').trim();view.targetLabel=String(envelope?.targetLabel||view.targetLabel||'').trim();if(view.targetLabel)view.titleEl.textContent=view.targetLabel;updateDelegationControls(view);return view}
async function ensureDelegationRelayConnection(view,{replay=true}={}){if(!view||!cc||!view.relayRoomId)return;if(view.relayConnectPromise)return await view.relayConnectPromise;relayRoomDelegations.set(view.relayRoomId,view.delegationId);view.relayConnectPromise=createDelegationRelayConnectionPromise(async()=>{const relayRoomId=view.relayRoomId;await ensureLocalRoomInfo(relayRoomId,{chatRooms:cc?.rooms||[],supplementalRoomInfos,hasJoinedRoom:(roomId)=>hasLiveRoomJoin(roomId),getRoomInfo:(roomId)=>cc.getRoom(roomId,false),addSelfToRoom:(roomId,userId)=>cc.addUserToRoom(roomId,userId),currentUserId:cc.userId});let liveSubscribed=await ensureLiveRoomSubscription(relayRoomId,{suppressWarnings:true,retries:1,retryDelayMs:300});if(!liveSubscribed){await waitForRoomMembership(relayRoomId,ROOM_MEMBERSHIP_TIMEOUT_MS);liveSubscribed=await ensureLiveRoomSubscription(relayRoomId,{retries:1,retryDelayMs:300})}if(replay)await replayDelegationRelayHistory(view)},{onError:(err)=>{view.error=err?.message||'Failed to subscribe relay';updateDelegationMeta(view)},onFinally:()=>{view.relayConnectPromise=null}});return await view.relayConnectPromise}
async function replayDelegationRelayHistory(view,maxCount=100){if(!view?.relayRoomId||!cc)return;const roomInfo=await cc.getRoom(view.relayRoomId,false);const conversationId=roomInfo?.defaultConversationId;if(!conversationId)return;const history=await cc.listMessage(conversationId,'0',null,clampDelegationRelayHistoryMaxCount(maxCount));const messages=[...(history?.messages||[])].reverse();const seen=relaySeenStore(view.relayRoomId);for(const message of messages){if(!message?.content?.text)continue;if(shouldIgnoreRoomMessage(message,seen,0))continue;rememberRoomMessage(message,seen);let parsed=null;try{parsed=JSON.parse(message.content.text)}catch{continue}for(const envelope of unpackEnvelope(parsed)){if(envelope?.type==='delegation.stream.event'&&envelope.targetDaemonId&&message.createdBy!==envelope.targetDaemonId)continue;applyDelegationRelayEnvelope(envelope)}}}
function applyDelegationRelayEnvelope(envelope){if(envelope?.type!=='delegation.stream.event')return;const view=delegationViews.get(String(envelope.delegationId||'').trim());if(!view)return;if(view.relayRoomId&&String(envelope.relayRoomId||'').trim()!==view.relayRoomId)return;const nextSeq=Number(envelope.seq)||0;if(!nextSeq||nextSeq<=Number(view.lastSeenSeq||0))return;view.lastSeenSeq=nextSeq;const payload=envelope.payload||{};if(payload?.model)view.model=String(payload.model||'');let timelineChanged=false;switch(String(envelope.streamType||'')){case'stream.open':updateDelegationStatus(view,'started');break;case'assistant.message_delta':{const chunk=String(payload.content||payload.deltaContent||'');if(chunk){view.messageBuffer+=chunk;timelineChanged=applyDelegationCardRelayEvent(view.timelineState,'assistant.message_delta',payload)||timelineChanged;updateDelegationStatus(view,'streaming')}break}case'assistant.message':{const content=String(payload.content||view.messageBuffer||'');if(content)view.messageBuffer=content;timelineChanged=applyDelegationCardRelayEvent(view.timelineState,'assistant.message',{...payload,content})||timelineChanged;break}case'assistant.reasoning_delta':{const chunk=String(payload.content||payload.deltaContent||'');if(chunk){view.reasoningBuffer+=chunk;timelineChanged=applyDelegationCardRelayEvent(view.timelineState,'assistant.reasoning_delta',payload)||timelineChanged}break}case'assistant.reasoning':{const content=String(payload.content||view.reasoningBuffer||'');if(content)view.reasoningBuffer=content;timelineChanged=applyDelegationCardRelayEvent(view.timelineState,'assistant.reasoning',{...payload,content})||timelineChanged;break}case'tool.start':timelineChanged=applyDelegationCardRelayEvent(view.timelineState,'tool.start',{...payload,signature:delegationToolSignature(payload)})||timelineChanged;break;case'tool.complete':timelineChanged=applyDelegationCardRelayEvent(view.timelineState,'tool.complete',{...payload,signature:delegationToolSignature(payload)})||timelineChanged;break;case'session.state':if(payload.processing)updateDelegationStatus(view,'streaming');if(payload.model)view.model=String(payload.model||'');break;case'usage.update':view.usage={used:Number.isFinite(Number(payload.used))?Number(payload.used):undefined,size:Number.isFinite(Number(payload.size))?Number(payload.size):undefined};break;case'terminal.completed':timelineChanged=finalizeDelegationCardStreamingItems(view.timelineState)||timelineChanged;timelineChanged=settleDelegationCardToolItems(view.timelineState,true)||timelineChanged;updateDelegationStatus(view,'completed');if(payload.summary?.finalContent){if(!view.messageBuffer)view.messageBuffer=String(payload.summary.finalContent);timelineChanged=reconcileDelegationCardTerminalSummaryContent(view.timelineState,payload.summary.finalContent)||timelineChanged}if(payload.summary?.model)view.model=String(payload.summary.model||'');if(payload.summary?.usage)view.usage=payload.summary.usage||view.usage;break;case'terminal.failed':timelineChanged=finalizeDelegationCardStreamingItems(view.timelineState)||timelineChanged;timelineChanged=settleDelegationCardToolItems(view.timelineState,false)||timelineChanged;updateDelegationStatus(view,'failed');view.error=String(payload.errorMessage||view.error||'Delegation failed');if(payload.summary?.finalContent){if(!view.messageBuffer)view.messageBuffer=String(payload.summary.finalContent);timelineChanged=reconcileDelegationCardTerminalSummaryContent(view.timelineState,payload.summary.finalContent)||timelineChanged}break;case'terminal.cancelled':timelineChanged=finalizeDelegationCardStreamingItems(view.timelineState)||timelineChanged;timelineChanged=settleDelegationCardToolItems(view.timelineState,false)||timelineChanged;updateDelegationStatus(view,'cancelled');view.error=String(payload.errorMessage||'');break}if(timelineChanged)renderDelegationTimeline(view);updateDelegationMeta(view);if(view.sourceSessionId)syncLocalSourceSessionDelegationState(view.sourceSessionId);scroll()}
function handleDelegationSummary(envelope,{fromHistory=false}={}){const view=ensureDelegationView(envelope);if(!view)return;const summaryStatus=delegationStatusFromSummaryType(envelope.type);if(envelope.type==='delegation.prompt'&&envelope.message)view.promptEl.textContent=String(envelope.message);else if(!view.promptEl.textContent&&envelope.message)view.promptEl.textContent=String(envelope.message);renderDelegationHeaderSummary(view);let timelineChanged=false;if(envelope.summary?.finalContent){if(!view.messageBuffer)view.messageBuffer=String(envelope.summary.finalContent);timelineChanged=ensureDelegationCardSummaryContent(view.timelineState,envelope.summary.finalContent)||timelineChanged}if(/^(completed|failed|cancelled|expired)$/.test(summaryStatus)){timelineChanged=finalizeDelegationCardStreamingItems(view.timelineState)||timelineChanged;timelineChanged=settleDelegationCardToolItems(view.timelineState,summaryStatus==='completed')||timelineChanged}if(envelope.summary?.model)view.model=String(envelope.summary.model||'');if(envelope.summary?.usage)view.usage=envelope.summary.usage||view.usage;if(envelope.message&&/delegation\.(failed|expired)$/.test(String(envelope.type||'')))view.error=String(envelope.message);if(timelineChanged)renderDelegationTimeline(view);updateDelegationStatus(view,summaryStatus||view.status);updateDelegationMeta(view);if(view.sourceSessionId)syncLocalSourceSessionDelegationState(view.sourceSessionId);if(view.relayRoomId&&!isDelegationTerminalType(envelope.type)&&rid===view.sourceSessionId){void ensureDelegationRelayConnection(view,{replay:fromHistory||Number(view.lastSeenSeq||0)===0})}scroll()}
function parseDelegationCommand(command){const match=String(command||'').trim().match(/^\/delegate\s+(\S+)\s+([\s\S]+)$/i);if(!match)return null;const targetSessionId=String(match[1]||'').trim();const prompt=String(match[2]||'').trim();if(!targetSessionId||!prompt)return null;return{targetSessionId,prompt}}
function parseMentionDelegationCommand(command){const match=String(command||'').trim().match(/^@(\S+)\s+([\s\S]+)$/i);if(!match)return null;const targetSessionId=String(match[1]||'').trim();const prompt=String(match[2]||'').trim();if(!targetSessionId||!prompt)return null;return{targetSessionId,prompt}}
async function createDelegationRequest(targetSessionId,prompt,displayText=''){const response=await portalJson('/api/delegations',{method:'POST',body:JSON.stringify({sourceSessionId:rid,targetSessionId,prompt,displayText})});handleDelegationSummary({type:'delegation.prompt',delegationId:response.delegationId,relayRoomId:response.relayRoomId,sourceSessionId:rid,targetSessionId:response.targetSessionId||targetSessionId,targetLabel:response.targetLabel||response.target?.sessionLabel||targetSessionId,message:prompt},{fromHistory:false});handleDelegationSummary({type:'delegation.dispatched',delegationId:response.delegationId,relayRoomId:response.relayRoomId,sourceSessionId:rid,targetSessionId:response.targetSessionId||targetSessionId,targetLabel:response.targetLabel||response.target?.sessionLabel||targetSessionId,message:displayText||prompt},{fromHistory:false});const view=delegationViews.get(response.delegationId);if(view)void ensureDelegationRelayConnection(view,{replay:true});return response}
async function cancelDelegation(delegationId){const normalizedId=String(delegationId||'').trim();if(!normalizedId)return;await portalJson(`/api/delegations/${encodeURIComponent(normalizedId)}/cancel`,{method:'POST'});const view=delegationViews.get(normalizedId);if(view){updateDelegationStatus(view,'cancel_requested');view.error='';updateDelegationMeta(view);if(view.sourceSessionId)syncLocalSourceSessionDelegationState(view.sourceSessionId)}}

/* ── Render ── */
function render(e){if(isDelegationSummaryType(e?.type))return handleDelegationSummary(e,{fromHistory:false});switch(e.type){
  case'assistant.delta':return rDelta(e);case'assistant.message':return rMsg(e);
  case'assistant.reasoning_delta':return rThinkD(e);case'assistant.reasoning':return rThink(e);
  case'tool.start':return rTS(e);case'tool.complete':return rTC(e);
  case'permission.request':return rPR(e);case'permission.response':return rPResp(e);case'session.state':return applyState(e);
  case'session.idle':if(sessionBooting)markSessionReady();currentSessionReady=true;resetSessionStateToIdle(ss);lastStopRequestAt=0;clearSessionBanner('stop');syncComposer();refreshSessionPlaceholder();void renderSessionsCol();return setSt('idle');case'session.error':if(isStartupWaitMessage(e.message)){currentSessionReady=false;if(sessionBooting)updateSessionBooting(e.message);refreshSessionPlaceholder();return}return addErr(e.message);
  case'commands.update':mergeSlashCommands((e.commands||[]).map(c=>({cmd:c.name,desc:c.description||'',hasInput:!!c.hasInput})));return;
  case'models.update':if(sessionBooting)updateSessionBooting('Receiving available models…');availableModels=e.models||[];currentModelId=e.currentModelId||'';syncModelButton();renderModelDropdown();updateToolbarVisibility();return;
  case'modes.update':if(sessionBooting)updateSessionBooting('Receiving agent controls…');availableModes=e.modes||[];currentModeId=e.currentModeId||'';syncModeButton();renderModeDropdown();updateToolbarVisibility();return;
  case'mode.changed':currentModeId=e.currentModeId||'';syncModeButton();renderModeDropdown();return;
  case'usage.update':return updateUsageRing(Number.isFinite(e.used)?e.used:0,Number.isFinite(e.size)?e.size:0);
  case'system.info':if(sessionBooting){const message=String(e.message||'');if(/^Starting\b/.test(message))updateSessionBooting(message);if(/^Connected to\b/.test(message))markSessionReady()}return addStatus(e.message);case'system.clear':$.chat.innerHTML='';pd.clear();rd.clear();at.clear();pp.clear();refreshSessionPlaceholder();return;
  case'user.prompt':return addUB(e.content);case'user.command':return addSys(e.command);
}}

/* AI streaming text — smooth character-by-character, markdown on final */
function rDelta(e){noteLiveSessionActivity();clearSessionBanner('permission');setWorkingLabel('Responding…');setSt('busy');lastTN=null;let s=pd.get(e.messageId);if(!s){const d=document.createElement('div');d.className='ai-msg streaming';const span=document.createElement('span');d.appendChild(span);$.chat.appendChild(d);s={el:d,span,raw:'',raf:null};pd.set(e.messageId,s)}s.raw+=e.content;
  // Append new text directly for smooth streaming (no re-render)
  if(!s.raf){s.raf=requestAnimationFrame(()=>{s.span.textContent=s.raw;s.raf=null;scroll()})}}
function rMsg(e){noteLiveSessionActivity();lastTN=null;const x=pd.get(e.messageId);if(x){if(x.raf)cancelAnimationFrame(x.raf);if(!e.content){x.el.remove();pd.delete(e.messageId);return}x.el.className='ai-msg';x.el.innerHTML=md(e.content);pd.delete(e.messageId);lastSemanticRender={type:'assistant.message',content:e.content,at:Date.now()};scroll()}else if(e.content){if(shouldIgnoreSemanticDuplicate(lastSemanticRender,'assistant.message',e.content))return;addAI(e.content);lastSemanticRender={type:'assistant.message',content:e.content,at:Date.now()}}}

/* Thinking — single collapsible line */
function rThinkD(e){noteLiveSessionActivity();clearSessionBanner('permission');setWorkingLabel('Agent is thinking…');setSt('busy');lastTN=null;let s=rd.get(e.reasoningId);if(!s){const w=document.createElement('div');const hdr=document.createElement('div');hdr.className='think-row';hdr.innerHTML='<span class="arrow open">▶</span><span>💭 thinking…</span>';const body=document.createElement('div');body.className='think-body show';hdr.addEventListener('click',()=>{const a=hdr.querySelector('.arrow');a.classList.toggle('open');body.classList.toggle('show')});w.appendChild(hdr);w.appendChild(body);$.chat.appendChild(w);s={wrap:w,hdr,body,content:''};rd.set(e.reasoningId,s)}s.content+=e.content;s.body.innerHTML=md(s.content)}
function rThink(e){noteLiveSessionActivity();const x=rd.get(e.reasoningId);if(x){if(e.content){x.body.innerHTML=md(e.content)}else{x.wrap.remove();rd.delete(e.reasoningId);return}x.hdr.querySelector('span:last-child').textContent='💭 thought';x.hdr.querySelector('.arrow').classList.remove('open');x.body.classList.remove('show');rd.delete(e.reasoningId);lastSemanticRender={type:'assistant.reasoning',content:e.content,at:Date.now()};return}
  if(!e.content)return;
  if(shouldIgnoreSemanticDuplicate(lastSemanticRender,'assistant.reasoning',e.content))return;
  const w=document.createElement('div');const hdr=document.createElement('div');hdr.className='think-row';hdr.innerHTML='<span class="arrow">▶</span><span>💭 thought</span>';const body=document.createElement('div');body.className='think-body';body.innerHTML=md(e.content);hdr.addEventListener('click',()=>{hdr.querySelector('.arrow').classList.toggle('open');body.classList.toggle('show')});w.appendChild(hdr);w.appendChild(body);$.chat.appendChild(w);lastSemanticRender={type:'assistant.reasoning',content:e.content,at:Date.now()}}

/* Tools — compact row */
let lastTN=null;
function tIcon(n){if(!n)return'✦';const l=n.toLowerCase();if(l.includes('read')||l==='view')return'📄';if(l.includes('edit')||l.includes('write'))return'✏️';if(l.includes('shell')||l.includes('bash')||l.includes('execute'))return'⌘';if(l.includes('search')||l.includes('grep')||l.includes('find'))return'🔎';if(l.includes('think'))return'💭';if(l==='report_intent')return'🎯';if(l.startsWith('mcp_'))return'🔌';return'⊙'}
function tKind(n){if(!n)return'g';const l=n.toLowerCase();if(l.includes('shell')||l.includes('bash')||l.includes('execute'))return'sh';return'g'}
function tSum(n,a){return a?(a.path||a.command||a.query||a.intent||a.pattern||''):''}
function tDet(a){if(!a||Object.keys(a).length===0)return'';try{return JSON.stringify(a,null,2)}catch{return String(a)}}
function tRes(v){if(v==null||v==='')return'';if(typeof v==='string')return v;if(typeof v==='object'){const out=[];if(typeof v.stdout==='string'&&v.stdout.trim())out.push(v.stdout.trimEnd());if(typeof v.stderr==='string'&&v.stderr.trim())out.push(`stderr:\n${v.stderr.trimEnd()}`);if(typeof v.message==='string'&&v.message.trim()&&!out.length)out.push(v.message.trim());if(v.interrupted)out.push('[interrupted]');if(!out.length){try{return JSON.stringify(v,null,2)}catch{return String(v)}}return out.join('\n\n')}return String(v)}
function tCmd(v){const s=String(v||'').trim().toLowerCase();return !!s&&s!=='tool'&&s!=='terminal'&&s!=='bash'&&(/^([a-z0-9_.-]+)(\s|$)/i.test(v||''))&&(String(v).includes(' ')||String(v).includes('/')||String(v).includes('\\')||String(v).includes('--'))}
function tNameReplace(cur,next){if(!next)return false;const c=String(cur||'').trim();const n=String(next||'').trim();if(!c||c==='Tool'||c==='Terminal')return true;if(c.length>40&&n.length<=20)return true;return false}
function tUpdate(row,name,summary,done){if(!row)return;const tn=row.querySelector('.t-name');const ts=row.querySelector('.t-sum');const st=row.querySelector('.t-st');if(name&&(!tn||tNameReplace(tn.textContent,name))){if(tn)tn.textContent=name}if(summary){if(ts)ts.textContent=summary;else row.insertAdjacentHTML('beforeend',`<span class="t-sum">${esc(summary)}</span>`)}if(st){st.className=`t-st ${done?'ok':'run'}`;st.textContent=done?'✓':'⟳'}}

function rTS(e){noteLiveSessionActivity();clearSessionBanner('permission');setWorkingLabel(`Running ${e.name||'tool'}…`);setSt('busy');const ic=tIcon(e.name),sm=tSum(e.name,e.args);
  const existing=at.get(e.toolCallId);
  if(existing){
    const row=existing.querySelector(`.tool-row[data-tid="${e.toolCallId}"]`)||existing.querySelector('.tool-row');
    tUpdate(row,e.name,sm,false);
    lastTN=e.name;return;
  }
  const last=$.chat.lastElementChild;
  // Group consecutive same-name tools
  if(lastTN===e.name&&last?.classList.contains('tool-grp-wrap')){
    const items=last.querySelector('.tool-grp-items');const cnt=items.children.length/2+1;
    last.querySelector('.tool-grp-cnt').textContent=cnt;
    const row=mk_tool_row(e.toolCallId,ic,sm);const det=document.createElement('div');det.className='tool-det';det.dataset.tid=e.toolCallId;const d=tDet(e.args);if(d)det.innerHTML=`<div class="tool-out">${esc(d)}</div>`;
    items.appendChild(row);items.appendChild(det);at.set(e.toolCallId,items.closest('.tool-grp-wrap'));lastTN=e.name;return;
  }
  if(lastTN===e.name&&last?.classList.contains('tool-wrap')){
    const grp=document.createElement('div');grp.className='tool-grp-wrap';
    grp.innerHTML=`<div class="tool-grp-hdr" data-action="toggle-tool-group"><span>${ic}</span><span>${esc(e.name)}</span><span class="tool-grp-cnt">2</span></div><div class="tool-grp-items"></div>`;
    const items=grp.querySelector('.tool-grp-items');
    // Move previous row + its detail
    const prevRow=last.querySelector('.tool-row');const prevDet=last.querySelector('.tool-det');
    const prevTid=prevRow?.dataset.tid;
    if(prevRow)items.appendChild(prevRow);if(prevDet)items.appendChild(prevDet);
    const row=mk_tool_row(e.toolCallId,ic,sm);const det=document.createElement('div');det.className='tool-det';det.dataset.tid=e.toolCallId;const d=tDet(e.args);if(d)det.innerHTML=`<div class="tool-out">${esc(d)}</div>`;
    items.appendChild(row);items.appendChild(det);
    last.replaceWith(grp);if(prevTid)at.set(prevTid,grp);at.set(e.toolCallId,grp);lastTN=e.name;return;
  }
  const w=document.createElement('div');w.className='tool-wrap';
  const row=mk_tool_row(e.toolCallId,ic,sm,e.name);w.appendChild(row);
  const det=document.createElement('div');det.className='tool-det';det.dataset.tid=e.toolCallId;const d=tDet(e.args);if(d)det.innerHTML=`<div class="tool-out">${esc(d)}</div>`;
  row.after(det);
  $.chat.appendChild(w);at.set(e.toolCallId,w);lastTN=e.name;
}
function mk_tool_row(tid,icon,summary,name){
  const r=document.createElement('div');r.className='tool-row';r.dataset.tid=tid;
  r.innerHTML=`<span class="t-icon">${icon}</span>${name?`<span class="t-name">${esc(name)}</span>`:''}${summary?`<span class="t-sum">${esc(summary)}</span>`:''}<span class="t-st run">⟳</span>`;
  r.addEventListener('click',()=>{let d=r.nextElementSibling;if(d&&d.classList.contains('tool-det'))d.classList.toggle('open')});
  return r;
}

function isDiff(t){return t&&t.includes('@@')&&(t.includes('+++')||t.includes('---'))}
function renderDiff(t){const ls=t.split('\n');let h='<div class="diff-view">',ln=0;for(const l of ls){if(l.startsWith('+++')||l.startsWith('---'))h+=`<div class="diff-file">${esc(l)}</div>`;else if(l.startsWith('@@')){h+=`<div class="diff-hunk">${esc(l)}</div>`;const m=l.match(/@@ -\d+(?:,\d+)? \+(\d+)/);ln=m?parseInt(m[1],10)-1:0}else if(l.startsWith('+')){ln++;h+=`<div class="diff-line diff-add"><span class="diff-num">${ln}</span><span class="diff-txt">${esc(l)}</span></div>`}else if(l.startsWith('-'))h+=`<div class="diff-line diff-del"><span class="diff-num"></span><span class="diff-txt">${esc(l)}</span></div>`;else{ln++;h+=`<div class="diff-line diff-ctx"><span class="diff-num">${ln}</span><span class="diff-txt">${esc(l)}</span></div>`}}return h+'</div>'}

function rTC(e){noteLiveSessionActivity();
  const w=at.get(e.toolCallId),k=tKind(e.name),r=tRes(e.detailedResult??e.result??'');
  if(w){
    const root=w;
    // Find row by data-tid, fall back to first row
    const row=root.querySelector(`.tool-row[data-tid="${e.toolCallId}"]`)||root.querySelector('.tool-row');
    if(row){
      const st=row.querySelector('.t-st');
      if(st){st.className=`t-st ${e.success!==false?'ok':'err'}`;st.textContent=e.success!==false?'✓':'✕'}
      const tn=row.querySelector('.t-name');
      if(e.name&&tn&&tNameReplace(tn.textContent,e.name))tn.textContent=e.name;
      const sum=tSum(e.name,e.args)||(tCmd(e.name)?e.name:'');
      const ts=row.querySelector('.t-sum');
      if(sum){if(ts)ts.textContent=sum;else row.insertAdjacentHTML('beforeend',`<span class="t-sum">${esc(sum)}</span>`)}
    }
    // Find detail by data-tid, fall back to sibling
    let det=root.querySelector(`.tool-det[data-tid="${e.toolCallId}"]`);
    if(!det){det=row?.nextElementSibling;if(det&&!det.classList.contains('tool-det'))det=null}
    if(!det){det=document.createElement('div');det.className='tool-det';det.dataset.tid=e.toolCallId;if(row)row.after(det)}
    if(r){
      const cmd=e.args?.command||e.args?.fullCommandText||row?.querySelector('.t-sum')?.textContent||'';
      if(k==='sh')det.innerHTML=`<div class="tool-out">${cmd?`$ ${esc(cmd)}\n`:''}${esc(r)}</div>`;
      else if(isDiff(String(r)))det.innerHTML=renderDiff(String(r));
      else det.innerHTML=`<div class="tool-out">${esc(r)}</div>`;
      det.classList.add('open');
    } else if(!det.textContent.trim()) {
      det.innerHTML='';det.classList.remove('open');
    }
  }else{
    const sum=tSum(e.name,e.args)||(tCmd(e.name)?e.name:'');
    const cmd=e.args?.command||e.args?.fullCommandText||sum||'';
    const content=isDiff(String(r))?renderDiff(String(r)):(r?`<div class="tool-out">${k==='sh'&&cmd?`${esc(`$ ${cmd}`)}\n`:''}${esc(r)}</div>`:'');
    const w2=document.createElement('div');w2.className='tool-wrap';
    w2.innerHTML=`<div class="tool-row" data-tid="${esc(e.toolCallId||'')}" ><span class="t-icon">${tIcon(e.name)}</span><span class="t-name">${esc(e.name||'Tool')}</span>${sum?`<span class="t-sum">${esc(sum)}</span>`:''}<span class="t-st ${e.success!==false?'ok':'err'}">${e.success!==false?'✓':'✕'}</span></div><div class="tool-det${content?' open':''}">${content}</div>`;
    w2.querySelector('.tool-row').addEventListener('click',()=>w2.querySelector('.tool-det').classList.toggle('open'));
    $.chat.appendChild(w2);
    if(e.toolCallId)at.set(e.toolCallId,w2);
  }
  lastTN=null;
}

/* Permission */
function pIcon(k){return({read:'📖',write:'✏️',shell:'⌘',url:'🌐',mcp:'🔌',memory:'🧠','custom-tool':'🧰'}[k]||'🔐')}
function pTitle(k){return({read:'Read',write:'Write',shell:'Shell',url:'URL',mcp:'MCP',memory:'Memory','custom-tool':'Tool'}[k]||'Permission')}
function pSum(e){if(e.intention)return e.intention;if(e.kind==='read'&&e.path)return e.path;if(e.kind==='write'&&e.fileName)return e.fileName;if(e.kind==='shell'&&e.fullCommandText)return e.fullCommandText;if(e.kind==='url'&&e.url)return e.url;return e.description||e.command||e.tool||''}
function pFields(e){const r=[];const a=(l,v,c)=>{if(v==null||v==='')return;const t=Array.isArray(v)?v.join('\n'):typeof v==='object'?JSON.stringify(v,null,2):String(v);if(t.trim())r.push({l,t,c})};a('Path',e.path,1);a('File',e.fileName,1);a('Intent',e.intention);a('Command',e.fullCommandText||e.command,1);a('URL',e.url,1);a('Tool',e.toolTitle||e.toolName||e.tool);a('Warning',e.warning);return r}
function pItem(e){const fs=pFields(e).map(f=>`<div class="perm-det-fl"><div class="perm-det-lbl">${esc(f.l)}</div><div class="perm-det-val${f.c?' code':''}">${esc(f.t)}</div></div>`).join('');return`<li><div class="perm-det-item" data-id="${e.requestId}"><span class="perm-det-kind">${pIcon(e.kind)} ${esc(e.kind||'permission')}</span><div class="perm-det-sum">${esc(pSum(e))}</div>${fs?`<div class="perm-det-fields">${fs}</div>`:''}</div></li>`}
function permResolutionPresentation(state){return state==='approved'?{label:'✓ Approved',color:'#50d167',approved:'true'}:state==='cancelled'?{label:'■ Cancelled',color:'var(--fg4)',approved:'cancelled'}:{label:'✕ Denied',color:'#e55',approved:'false'}}
function markPermItemResolved(item,state,label=''){if(!item||item.dataset.resolved==='true')return;const view=permResolutionPresentation(state);item.dataset.resolved='true';item.dataset.approved=view.approved;if(!item.querySelector('.perm-done'))item.insertAdjacentHTML('beforeend',`<div style="margin-top:6px"><span class="perm-done" style="color:${view.color}">${esc(label||view.label)}</span></div>`) }
function createSinglePermRow(e,{resolved=false,resolution='approved',label=''}={}){const row=document.createElement('div');row.className='perm-row is-single';if(resolved)row.dataset.resolved='true';row.innerHTML=`<div class="perm-det perm-det-single expanded"><ul>${pItem(e)}</ul></div>${resolved?'':`<div class="perm-btns"><button class="deny" data-action="permission-bulk" data-approved="false">Deny</button><button class="allow" data-action="permission-bulk" data-approved="true">Allow</button></div>`}`;const item=row.querySelector(`.perm-det-item[data-id="${e.requestId}"]`);if(resolved)markPermItemResolved(item,resolution,label||permResolutionPresentation(resolution).label);return row}
function finalizePermRow(row,state,label=''){if(!row)return;const view=permResolutionPresentation(state);row.dataset.resolved='true';const el=row.querySelector('.perm-btns');if(el)el.remove();const hdr=row.querySelector('.perm-hdr');if(hdr){const tog=hdr.querySelector('.p-toggle');if(tog)tog.remove();const existing=hdr.querySelector('.perm-done');if(existing)existing.remove();hdr.insertAdjacentHTML('beforeend',`<span class="perm-done" style="color:${view.color}">${esc(label||view.label)}</span>`)}if(!pp.size)setSt('busy')}
function appendResolvedPermRow(e,resolution='approved',label=''){
  const c=createSinglePermRow(e,{resolved:true,resolution,label});
  $.chat.appendChild(c);
  scroll();
  return c;
}

function rPR(e){noteLiveSessionActivity();setSt('permission');
  const alreadyResolved=livePermissionResponses.get(e.requestId);
  if(alreadyResolved!=null){renderResolvedPerm(e,alreadyResolved);return}
  // Auto-approve if enabled
  if(getAutoApprove()){void(async()=>{try{await cc.sendToRoom(rid,JSON.stringify({type:'permission.response',requestId:e.requestId,approved:true}));livePermissionResponses.set(e.requestId,true);appendResolvedPermRow(e,'approved','✓ Auto-approved');addStatus('Auto-approved: '+pSum(e));setSt('busy')}catch(err){addErr(err?.message||'Failed to auto-approve permission request')}})();return}
  const last=$.chat.lastElementChild;
  if(last?.classList.contains('perm-row')&&!last.dataset.resolved){
    if(last.classList.contains('is-single')){
      const existingList=last.querySelector('.perm-det ul')?.innerHTML||'';
      const existingIds=[...last.querySelectorAll('.perm-det-item')].map(item=>item.dataset.id).filter(Boolean);
      const c=document.createElement('div');c.className='perm-row';
      c.innerHTML=`<div class="perm-hdr"><span class="p-icon">${pIcon(e.kind)}</span><span class="p-title">${esc(pTitle(e.kind))}</span><span class="p-badge">2</span><span class="p-sum">2 actions</span><button class="p-toggle" data-action="toggle-permission-row">Hide</button></div><div class="perm-det expanded"><ul>${existingList}${pItem(e)}</ul></div><div class="perm-btns"><button class="deny" data-action="permission-bulk" data-approved="false">Deny</button><button class="allow" data-action="permission-bulk" data-approved="true">Allow</button></div>`;
      last.replaceWith(c);
      for(const id of existingIds)pp.set(id,c);
      pp.set(e.requestId,c);
      return;
    }
    const ul=last.querySelector('.perm-det ul');const cnt=ul.children.length+1;
    ul.insertAdjacentHTML('beforeend',pItem(e));last.querySelector('.p-badge').textContent=cnt;
    const sm=last.querySelector('.p-sum');if(sm)sm.textContent=`${cnt} actions`;
    pp.set(e.requestId,last);return;
  }
  const c=createSinglePermRow(e);
  $.chat.appendChild(c);pp.set(e.requestId,c);
}
function rPResp(e){if(!e?.requestId)return;livePermissionResponses.set(e.requestId,!!e.approved);const row=pp.get(e.requestId);if(!row)return;const resolution=e.cancelled?'cancelled':(e.approved?'approved':'denied');const item=row.querySelector(`.perm-det-item[data-id="${e.requestId}"]`);markPermItemResolved(item,resolution);pp.delete(e.requestId);const items=[...row.querySelectorAll('.perm-det-item')];const unresolved=items.filter(i=>i.dataset.resolved!=='true');const badge=row.querySelector('.p-badge');if(badge)badge.textContent=String(unresolved.length||items.length);const summary=row.querySelector('.p-sum');if(summary){summary.textContent=unresolved.length?`${unresolved.length} actions pending`:`${items.length} actions resolved`}if(!unresolved.length){const allApproved=items.every(i=>i.dataset.approved==='true');const allCancelled=items.every(i=>i.dataset.approved==='cancelled');finalizePermRow(row,allApproved?'approved':allCancelled?'cancelled':'denied')}}
window.pAll=async(g,ok)=>{if(!g)return;const roomId=rid;const ids=[...g.querySelectorAll('.perm-det-item')].map(i=>i.dataset.id);for(const item of g.querySelectorAll('.perm-det-item'))markPermItemResolved(item,ok?'approved':'denied');finalizePermRow(g,ok?'approved':'denied');for(const id of ids){livePermissionResponses.set(id,ok);await cc.sendToRoom(roomId,JSON.stringify({type:'permission.response',requestId:id,approved:ok}));pp.delete(id)}};

/* Render already-resolved permission from history */
function renderResolvedPerm(e,approved=true){
  const resolution=approved===true?'approved':approved===false?'denied':approved||'approved';
  appendResolvedPermRow(e,resolution);
}

/* Simple elements */
function addUB(t){noteChatContentVisible();const d=document.createElement('div');d.className='u-msg';d.textContent=t;$.chat.appendChild(d)}
function addAI(c){noteChatContentVisible();const d=document.createElement('div');d.className='ai-msg';d.innerHTML=md(c);$.chat.appendChild(d)}
function addSys(m){noteChatContentVisible();const d=document.createElement('div');d.className='sys-line';d.textContent=m;$.chat.appendChild(d)}
function addStatus(m){const now=Date.now();if(lastStatusMessage===m&&now-lastStatusAt<1500)return;lastStatusMessage=m;lastStatusAt=now;noteChatContentVisible();const d=document.createElement('div');d.className='status-line';d.innerHTML=`<span class="sl-dot"></span>${esc(m)}`;$.chat.appendChild(d)}
function addErr(m){setSessionBooting(false);ss.processing=false;ss.stopping=false;ss.pendingCount=0;sendMode='enqueue';resetWorkingLabel();syncComposer();setSt('error');noteChatContentVisible();const d=document.createElement('div');d.className='err-line';d.textContent='⚠ '+m;$.chat.appendChild(d);syncSt()}
let $wi=null;
function showWorking(){if($.toolbarWorkingText)$.toolbarWorkingText.textContent=currentWorkingLabel;$.toolbarWorking?.classList.add('show');$wi=$.toolbarWorking;updateToolbarVisibility()}
function hideWorking(){if($.toolbarWorking)$.toolbarWorking.classList.remove('show');$wi=null;updateToolbarVisibility()}
function setSt(s){currentStatusState=s;$.sd.className=`dot ${s}`;$.sd.title={idle:'Ready',busy:'Working…',permission:'Approval needed',error:'Error',disconnected:'Disconnected'}[s]||'';if(s==='busy')showWorking();else{hideWorking();if(s!=='permission')resetWorkingLabel()}syncSt();renderSessionContextBar()}
function handleDirectoryInput(){
  syncCreateSessionButton();
  setDirectoryMeta(directoryMetaText(currentCreateDaemon(),$.dirIn?.value||''));
  scheduleDirectorySuggestions($.dirIn?.value||'');
}
function handleDirectoryBlur(){
  setSelectedDirectory($.dirIn?.value||'','input');
  const daemon=currentCreateDaemon();
  const value=normalizePickerPath($.dirIn?.value||'',daemon?.platform);
  if(value&&!pathLooksCompatibleWithPlatform(value,daemon?.platform))setDirectoryMeta(`Directory does not match the selected ${daemon?.platform==='win32'?'Windows':'Linux/macOS'} daemon.`,'error');
  else setDirectoryMeta(directoryMetaText(daemon,value),value?'success':'');
}

function datasetBool(value){return String(value||'').trim().toLowerCase()==='true'}
function handlePortalActionClick(event){
  const target=event.target;
  if(!(target instanceof Element))return;
  const actionEl=target.closest('[data-action]');
  if(!actionEl)return;
  const action=String(actionEl.dataset.action||'').trim();
  if(!action)return;
  switch(action){
    case'toggle-columns':
      window.toggleColumns?.();
      return;
    case'toggle-auto-approve':
      toggleAutoApprove();
      return;
    case'toggle-debug':
      toggleDebug();
      return;
    case'toggle-theme':
      toggleTheme();
      return;
    case'oauth-action':
      handleOauthAction();
      return;
    case'mob-show':
      mobShow(actionEl.dataset.colId||'');
      return;
    case'set-session-groupby':
      window.setSessionGroupBy?.(actionEl.dataset.groupMode||'none');
      return;
    case'toggle-model-dropdown':
      window.toggleModelDropdown?.();
      return;
    case'toggle-mode-dropdown':
      window.toggleModeDropdown?.();
      return;
    case'run-session-banner-action':
      window.runSessionBannerAction?.();
      return;
    case'clear-composer-delegation-target':
      window.clearComposerDelegationTarget?.(datasetBool(actionEl.dataset.focusInput));
      return;
    case'handle-composer-action':
      window.handleComposerAction?.();
      return;
    case'confirm-resolve':
      settleConfirm(datasetBool(actionEl.dataset.confirmValue));
      return;
    case'export-debug-log':
      exportDebugLog();
      return;
    case'clear-debug-log':
      clearDebugLog();
      return;
    case'hide-debug-panel':
      hideDebugPanel();
      return;
    case'close-daemon-access-drawer':
      closeDaemonAccessDrawer();
      return;
    case'close-create-session-modal':
      closeCreateSessionModal();
      return;
    case'select-model':
      window.selectModel?.(actionEl.dataset.modelId||'');
      return;
    case'select-mode':
      window.selectMode?.(actionEl.dataset.modeId||'');
      return;
    case'open-daemon-access-drawer':
      event.preventDefault();
      openDaemonAccessDrawer(actionEl.dataset.daemonId||'');
      return;
    case'select-create-agent':
      window.selectCreateAgent?.(actionEl.dataset.agentName||'');
      return;
    case'request-daemon-access':
      void window.requestDaemonAccess?.(actionEl.dataset.requestedAccess||'member');
      return;
    case'remove-daemon-access-user':
      window.removeDaemonAccessUser?.(actionEl.dataset.daemonId||'',actionEl.dataset.field||'',actionEl.dataset.user||'');
      return;
    case'focus-daemon-access-input':
      window.focusDaemonAccessInput?.(actionEl.dataset.inputId||'');
      return;
    case'save-daemon-access':
      void window.saveDaemonAccess?.();
      return;
    case'select-daemon':
      window.selectDaemon?.(actionEl.dataset.daemonId||'');
      return;
    case'toggle-more-agents':{
      const panel=actionEl.nextElementSibling;
      if(!panel)return;
      const open=panel.classList.toggle('more-open');
      const meta=actionEl.querySelector('.ci-meta');
      if(meta)meta.textContent=open?'collapse':String(actionEl.dataset.moreLabel||'expand');
      return;
    }
    case'toggle-collapsible-section':
      window.toggleCollapsibleSection?.(actionEl);
      return;
    case'select-agent':
      window.selectAgent?.(actionEl.dataset.agentName||'');
      return;
    case'delete-session':
      void window.delSess?.(actionEl.dataset.sessionId||'');
      return;
    case'leave-session':
      void window.leaveSess?.(actionEl.dataset.sessionId||'');
      return;
    case'request-session-access':
      void window.requestSessionAccess?.(actionEl.dataset.sessionId||'',actionEl.dataset.requestedAccess||'read');
      return;
    case'open-session':
      void window.openSession?.(actionEl.dataset.sessionId||'');
      return;
    case'switch-session':
      void window.switchS?.(actionEl.dataset.sessionId||'');
      return;
    case'toggle-permission-row':{
      const row=actionEl.closest('.perm-row');
      const detail=row?.querySelector('.perm-det');
      if(!detail)return;
      detail.classList.toggle('expanded');
      actionEl.textContent=detail.classList.contains('expanded')?'Hide':'…';
      return;
    }
    case'permission-bulk':{
      const row=actionEl.closest('.perm-row');
      if(!row)return;
      void window.pAll?.(row,datasetBool(actionEl.dataset.approved));
      return;
    }
    case'toggle-tool-group':{
      const panel=actionEl.nextElementSibling;
      if(panel)panel.classList.toggle('expanded');
      return;
    }
  }
}
function handlePortalActionKeydown(event){
  const target=event.target;
  if(!(target instanceof Element))return;
  const actionEl=target.closest('[data-keydown-action]');
  if(!actionEl)return;
  const action=String(actionEl.dataset.keydownAction||'').trim();
  if(action==='daemon-access-editor'){
    window.handleDaemonAccessEditorKeyDown?.(event,actionEl.dataset.daemonId||'',actionEl.dataset.field||'');
  }
}

/* Poll server state every 5s to recover from missed events */
let pollTimer=null;
function startPoll(){}
function stopPoll(){}

(async()=>{
  window.pickAgent=()=>{}; // agent selection handled by column 2
  window.loginUser=()=>loginUser($.loginUser?.value);
  window.logoutUser=()=>logoutUser();
  window.addEventListener('keydown',(event)=>{
    if(event.key!=='Escape')return;
    if(createSessionModalOpen){closeCreateSessionModal();return}
    if(daemonAccessDrawerOpen)closeDaemonAccessDrawer()
  });
  document.addEventListener('click',handlePortalActionClick);
  document.addEventListener('keydown',handlePortalActionKeydown);

  if($.logoutBtn)$.logoutBtn.addEventListener('click',()=>logoutUser());
  if($.compactBtn)$.compactBtn.addEventListener('click',()=>setCompactNav(!compactNav));
  if($.openCreateSessionBtn)$.openCreateSessionBtn.addEventListener('click',()=>openCreateSessionModal());
  if($.dirIn)$.dirIn.addEventListener('input',handleDirectoryInput);
  if($.dirIn)$.dirIn.addEventListener('focus',()=>{void refreshDirectorySuggestions($.dirIn.value,{silent:true})});
  if($.dirIn)$.dirIn.addEventListener('blur',handleDirectoryBlur);
  if(document.getElementById('f-btn'))document.getElementById('f-btn').addEventListener('click',()=>{void window.createSess()});

  renderSelectedDirectory();
  syncCreateSessionButton();
  renderCreateSessionModal();
  mobInit();
  syncSt();

  // Detect OAuth mode
  let autoLoggedIn=false;
  try{
    const cfg=await(await fetch('/auth/config')).json();
    oauthMode=!!cfg.oauth;
  }catch{}

  if(oauthMode){
    // OAuth mode — hide local login, show GitHub button
    document.getElementById('login-card-local').style.display='none';
    document.getElementById('login-card-oauth').style.display='';
    syncOauthLoginCard();
    // Check if already authenticated
    try{
      const me=await(await fetch('/auth/me')).json();
      if(me.user){
        // Already logged in via OAuth — auto-connect
        setOauthAuthenticatedUser(me.user);
        userAvatar=me.user.avatar||'';
        autoLoggedIn=await loginUser(me.user.login);
      }
    }catch{}
  }else{
    // Local mode — hide OAuth card, show username input
    document.getElementById('login-card-oauth').style.display='none';
    document.getElementById('login-card-local').style.display='';
    if($.loginUser)$.loginUser.value=getStoredUserId()||DEFAULT_USERNAME;
    if($.loginBtn)$.loginBtn.addEventListener('click',()=>loginUser($.loginUser.value));
    if($.loginUser)$.loginUser.addEventListener('keydown',(e)=>{if(e.key==='Enter'){e.preventDefault();loginUser($.loginUser.value)}});
  }

  if(!autoLoggedIn)applyLoggedOutState();
})();
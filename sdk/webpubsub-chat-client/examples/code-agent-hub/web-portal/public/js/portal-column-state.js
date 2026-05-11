function safeEscape(escapeHtml, value) {
  return typeof escapeHtml === 'function' ? escapeHtml(value) : String(value ?? '')
}

function normalizePlatformAlias(platform) {
  const value = String(platform || '').trim().toLowerCase()
  if (!value) return ''
  if (value === 'win32' || value === 'windows' || value === 'win') return 'win32'
  if (value === 'darwin' || value === 'macos' || value === 'mac' || value === 'osx') return 'darwin'
  if (['linux', 'ubuntu', 'debian', 'fedora', 'alpine', 'centos', 'rhel'].includes(value)) return 'linux'
  return value
}

function compactEmpty(text) {
  return `<div class="compact-empty">${text}</div>`
}

function compactSection(title, content) {
  return `<div class="compact-section"><div class="compact-hdr">${title}</div><div class="compact-list">${content}</div></div>`
}

function normalizeSortText(value) {
  return String(value || '').trim().toLowerCase()
}

function sessionTimestamp(value) {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function sortSessionsForDisplay({
  sessions = [],
  mode = 'name',
  sessionLabel = (session) => session?.name || session?.sessionId || '',
  agentNames = {},
} = {}) {
  const normalizedMode = ['name', 'time', 'agent'].includes(String(mode || '').trim().toLowerCase())
    ? String(mode || '').trim().toLowerCase()
    : 'name'
  return [...sessions].sort((left, right) => {
    const leftName = normalizeSortText(sessionLabel(left))
    const rightName = normalizeSortText(sessionLabel(right))
    const leftAgent = normalizeSortText(agentNames[left?.agent] || left?.agent || '')
    const rightAgent = normalizeSortText(agentNames[right?.agent] || right?.agent || '')
    const leftId = normalizeSortText(left?.sessionId || '')
    const rightId = normalizeSortText(right?.sessionId || '')
    const leftTime = sessionTimestamp(left?.updatedAt)
    const rightTime = sessionTimestamp(right?.updatedAt)
    if (normalizedMode === 'time') {
      return rightTime - leftTime || leftName.localeCompare(rightName) || leftAgent.localeCompare(rightAgent) || leftId.localeCompare(rightId)
    }
    if (normalizedMode === 'agent') {
      return leftAgent.localeCompare(rightAgent) || leftName.localeCompare(rightName) || leftId.localeCompare(rightId)
    }
    return leftName.localeCompare(rightName) || leftAgent.localeCompare(rightAgent) || leftId.localeCompare(rightId)
  })
}

export function buildCompactNavMarkup({
  daemonsHtml = '',
  sessionsHtml = '',
  groupByHtml = '',
} = {}) {
  return [
    compactSection('Workspaces', daemonsHtml || compactEmpty('Connect first')),
    compactSection('Sessions', `${groupByHtml || ''}${sessionsHtml || compactEmpty('Select a workspace')}`),
  ].join('')
}

export function buildDaemonCardsMarkup({
  daemonEntries = [],
  currentDaemonId = '',
  hiddenDaemonIds = new Set(),
  hiddenDaemonsExpanded = false,
  normalizeDaemonPlatform = (platform) => platform || '',
  osIcons = {},
  osNames = {},
  countSessionsForDaemon = () => 0,
  daemonAdminUsersMeta = () => '',
  daemonAccessTag = () => '',
  renderDaemonAccessSummaryCard = () => '',
  escapeHtml,
} = {}) {
  const isHidden = (daemonId) => hiddenDaemonIds instanceof Set && hiddenDaemonIds.has(daemonId)
  const visibleEntries = daemonEntries.filter(([daemonId]) => !isHidden(daemonId))
  const hiddenEntries = daemonEntries.filter(([daemonId]) => isHidden(daemonId))
  const renderCard = ([daemonId, daemon], { hidden = false } = {}) => {
    const platform = normalizePlatformAlias(normalizeDaemonPlatform(daemon.platform))
    const osIcon = osIcons[platform] || '🖥'
    const osName = osNames[platform] || ''
    const hostnameMeta = daemon.hostname && daemon.hostname !== daemonId ? `${daemon.hostname} · ` : ''
    const accessTag = daemonAccessTag(daemon)
    const sessionCount = countSessionsForDaemon(daemonId)
    const hideAction = hidden
      ? `<button class="ci-hide-btn" type="button" title="Show workspace" aria-label="Show workspace" data-action="unhide-daemon" data-daemon-id="${safeEscape(escapeHtml, daemonId)}">+</button>`
      : `<button class="ci-hide-btn" type="button" title="Hide workspace" aria-label="Hide workspace" data-action="hide-daemon" data-daemon-id="${safeEscape(escapeHtml, daemonId)}">×</button>`
    const statusUi = `<div class="ci-side"><div class="ci-access-slot">${accessTag}</div><span class="ci-indicator-slot"><span class="ci-dot"></span></span>${hideAction}</div>`
    const card = `<div class="col-item${daemonId === currentDaemonId ? ' selected' : ''}${hidden ? ' is-hidden-daemon' : ''}" data-action="select-daemon" data-daemon-id="${safeEscape(escapeHtml, daemonId)}"><span class="ci-icon">${osIcon}</span><div class="ci-info"><div class="ci-name-row"><div class="ci-name">${safeEscape(escapeHtml, daemonId)}</div></div><div class="ci-meta">${safeEscape(escapeHtml, `${hostnameMeta}${osName ? `${osName} · ` : ''}${sessionCount} session${sessionCount !== 1 ? 's' : ''}`)}</div><div class="ci-submeta">${safeEscape(escapeHtml, daemonAdminUsersMeta(daemon))}</div></div>${statusUi}</div>`
    if (daemonId !== currentDaemonId) return card
    return `<div class="daemon-stack">${card}${renderDaemonAccessSummaryCard(daemonId, daemon)}</div>`
  }
  const visibleHtml = visibleEntries.map((entry) => renderCard(entry)).join('')
  if (!hiddenEntries.length) return visibleHtml
  const hiddenHtml = hiddenEntries.map((entry) => renderCard(entry, { hidden: true })).join('')
  return `${visibleHtml}<div class="hidden-daemons-section"><button class="hidden-daemons-toggle${hiddenDaemonsExpanded ? ' is-open' : ''}" type="button" data-action="toggle-hidden-daemons" aria-expanded="${hiddenDaemonsExpanded ? 'true' : 'false'}"><span>Hidden workspaces</span><span class="hidden-daemons-toggle-meta">${hiddenEntries.length}</span></button><div class="hidden-daemons-list${hiddenDaemonsExpanded ? ' is-open' : ''}">${hiddenHtml}</div></div>`
}

export function buildAgentCardsMarkup({
  daemon = null,
  currentAgentName = '',
  agentIcons = {},
  agentColors = {},
  agentNames = {},
  testedAcpAgents = new Set(),
  escapeHtml,
} = {}) {
  if (!daemon) return ''
  const acpAgents = (daemon.agents || []).filter((agentName) => agentName !== 'copilot-sdk')
  const sdkAgents = (daemon.agents || []).includes('copilot-sdk') ? ['copilot-sdk'] : []
  const preferredOrder = ['copilot', 'claude', 'codex', 'gemini', 'opencode']
  const sortedAcp = [...acpAgents].sort((left, right) => (preferredOrder.indexOf(left) === -1 ? 99 : preferredOrder.indexOf(left)) - (preferredOrder.indexOf(right) === -1 ? 99 : preferredOrder.indexOf(right)))
  const mainAcp = sortedAcp.slice(0, 3)
  const moreAcp = sortedAcp.slice(3)
  const renderAcpAgent = (agentName) => {
    const icon = agentIcons[agentName] || agentIcons.opencode || ''
    const color = agentColors[agentName] || '#aaa'
    const name = agentNames[agentName] || agentName
    const supported = testedAcpAgents.has(agentName)
    return `<div class="col-item${agentName === currentAgentName ? ' selected' : ''}${supported ? '' : ' disabled'}"${supported ? ` data-action="select-agent" data-agent-name="${safeEscape(escapeHtml, agentName)}"` : ''} style="--agent-color:${color}"><span class="ci-icon" style="color:${color}">${icon}</span><div class="ci-info"><div class="ci-name">${safeEscape(escapeHtml, name)}</div></div></div>`
  }

  let html = ''
  if (sortedAcp.length) {
    html += '<div class="col-section-hdr">ACP Compatible</div>'
    html += mainAcp.map(renderAcpAgent).join('')
    if (moreAcp.length) {
      html += `<div class="col-item" data-action="toggle-more-agents" data-more-label="${safeEscape(escapeHtml, `${moreAcp.length} more…`)}" style="cursor:pointer;opacity:.7"><span class="ci-icon" style="color:var(--fg5)">···</span><div class="ci-info"><div class="ci-name">More agents</div><div class="ci-meta">${moreAcp.length} more…</div></div></div>`
      html += `<div class="more-agents-wrap">${moreAcp.map(renderAcpAgent).join('')}</div>`
    }
  }

  if (sdkAgents.length) {
    const sdkSelected = sdkAgents.some((agentName) => agentName === currentAgentName)
    html += `<button type="button" class="col-section-toggle${sdkSelected ? ' is-open' : ''}" aria-expanded="${sdkSelected ? 'true' : 'false'}" data-action="toggle-collapsible-section" data-collapsed-label="expand" data-expanded-label="collapse"><span class="col-section-toggle-copy"><span class="col-section-toggle-label">Managed by SDK</span></span><span class="col-section-toggle-side"><span class="col-section-toggle-meta">${sdkSelected ? 'collapse' : 'expand'}</span><span class="col-section-toggle-chevron">›</span></span></button>`
    html += `<div class="more-agents-wrap${sdkSelected ? ' more-open' : ''}">${sdkAgents.map((agentName) => `<div class="col-item${agentName === currentAgentName ? ' selected' : ''}" data-action="select-agent" data-agent-name="${safeEscape(escapeHtml, agentName)}"><span class="ci-icon" style="color:${agentColors.copilot || '#6baaff'}">${agentIcons.copilot || ''}</span><div class="ci-info"><div class="ci-name">GitHub Copilot SDK</div><div class="ci-meta">Copilot SDK</div></div></div>`).join('')}</div>`
  }

  return html
}

export function formatRelativeTime(date, now = Date.now()) {
  const seconds = Math.floor((now - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export function buildSessionCardsMarkup({
  sessions = [],
  currentRoomId = '',
  currentDaemonId = '',
  joinedSessionIds = new Set(),
  recentSessionAccessRequests = new Set(),
  agentIcons = {},
  agentColors = {},
  agentNames = {},
  sessionLabel = () => 'Session',
  daemonRecordForSession = () => null,
  sessionAccessLevel = () => 'none',
  getSessionListAccessPresentation = () => ({ badgeClassName: '', badgeLabel: '', isRequestable: false, requestReadLabel: 'Request Read', requestWriteLabel: 'Request Write' }),
  sessionCanDelete = () => false,
  sessionCanLeave = () => false,
  daemonHasAdminAccess = () => false,
  getSessionListStatusInfo = () => null,
  formatTime = formatRelativeTime,
  escapeHtml,
} = {}) {
  return sessions.map((session) => {
    const daemon = daemonRecordForSession(session)
    const accessLevel = sessionAccessLevel(session)
    const accessPresentation = getSessionListAccessPresentation(accessLevel, { suppressGrantedAccessBadge: daemonHasAdminAccess(daemon) })
    const joinedSession = joinedSessionIds.has(session.sessionId) || accessLevel !== 'none'
    const canOpenSessionCard = joinedSession
    const isRequestableSessionCard = accessPresentation.isRequestable && !canOpenSessionCard
    const name = sessionLabel(session)
    const icon = agentIcons[session.agent] || '✦'
    const color = agentColors[session.agent] || '#888'
    const timeLabel = session.updatedAt ? formatTime(new Date(session.updatedAt)) : ''
    const daemonLabel = daemon?.hostname || session.daemonId || 'Unknown daemon'
    const agentLabel = agentNames[session.agent] || session.agent || 'Unknown agent'
    const owner = session.ownerUserId && session.ownerUserId !== session.currentUserId ? `Owner: ${session.ownerUserId}` : ''
    const path = session.workingDirectory || ''
    const meta = [timeLabel].filter(Boolean).join(' · ')
    const canDelete = sessionCanDelete(session)
    const canLeave = sessionCanLeave(session, daemon)
    const manageAction = canDelete
      ? `<button class="ci-del ci-del-delete ci-del-icon" title="Delete session" aria-label="Delete session" data-action="delete-session" data-session-id="${safeEscape(escapeHtml, session.sessionId)}">🗑</button>`
      : canLeave
        ? `<button class="ci-del ci-del-leave" title="Leave session" data-action="leave-session" data-session-id="${safeEscape(escapeHtml, session.sessionId)}">Leave</button>`
        : ''
    const statusInfo = getSessionListStatusInfo(session)
    const inlineAction = joinedSession
      ? (accessLevel === 'read' && !daemonHasAdminAccess(daemon)
        ? ''
        : manageAction)
      : ''
    const blockAction = joinedSession
      ? (accessLevel === 'read' && !daemonHasAdminAccess(daemon)
        ? `<div class="ci-actions"><button class="ci-join" data-action="request-session-access" data-session-id="${safeEscape(escapeHtml, session.sessionId)}" data-requested-access="write">${recentSessionAccessRequests.has(`${session.sessionId}:write`) ? 'Requested' : accessPresentation.requestWriteLabel}</button>${manageAction}</div>`
        : '')
      : daemonHasAdminAccess(daemon)
        ? ''
        : `<div class="ci-actions"><button class="ci-join" data-action="request-session-access" data-session-id="${safeEscape(escapeHtml, session.sessionId)}" data-requested-access="read">${recentSessionAccessRequests.has(`${session.sessionId}:read`) ? 'Requested' : accessPresentation.requestReadLabel}</button><button class="ci-join" data-action="request-session-access" data-session-id="${safeEscape(escapeHtml, session.sessionId)}" data-requested-access="write">${recentSessionAccessRequests.has(`${session.sessionId}:write`) ? 'Requested' : accessPresentation.requestWriteLabel}</button></div>`
    const accessBadge = accessPresentation.badgeLabel
      ? `<span class="session-row-kicker ${accessPresentation.badgeClassName}">${accessPresentation.badgeLabel}</span>`
      : ''
    const ownerHtml = owner ? `<div class="session-row-owner">${safeEscape(escapeHtml, owner)}</div>` : ''
    const pathHtml = path ? `<div class="session-row-path">${safeEscape(escapeHtml, path)}</div>` : ''
    const nameHtml = name ? `<div class="session-row-name">${safeEscape(escapeHtml, name)}</div>` : ''
    const inlineMeta = (meta || statusInfo) ? `${meta ? `<span class="ci-meta-copy">${safeEscape(escapeHtml, meta)}</span>` : ''}${statusInfo ? `<span class="ci-status-inline" data-state="${statusInfo.state}">${safeEscape(escapeHtml, statusInfo.label)}</span>` : ''}` : ''
    const nameLineHtml = (nameHtml || inlineMeta) ? `<div class="session-row-nameline">${nameHtml}${inlineMeta}</div>` : ''
    const daemonKicker = currentDaemonId ? '' : `<span class="session-row-kicker is-daemon"><span class="kicker-label">Workspace</span> ${safeEscape(escapeHtml, daemonLabel)}</span>`
    return `<div class="col-item${session.sessionId === currentRoomId ? ' selected' : ''}${isRequestableSessionCard ? ' is-requestable' : ''}"${canOpenSessionCard ? ` data-action="open-session" data-session-id="${safeEscape(escapeHtml, session.sessionId)}"` : ''} data-daemon-id="${safeEscape(escapeHtml, session.daemonId || '')}" data-agent="${safeEscape(escapeHtml, session.agent || '')}" data-daemon-label="${safeEscape(escapeHtml, daemonLabel)}" data-agent-label="${safeEscape(escapeHtml, agentLabel)}"><span class="ci-icon" style="color:${color}">${icon}</span><div class="ci-info">${nameLineHtml}<div class="session-row-kickers">${daemonKicker}<span class="session-row-kicker is-agent"><span class="kicker-label">Agent</span> ${safeEscape(escapeHtml, agentLabel)}</span>${accessBadge}</div>${pathHtml}${ownerHtml}${blockAction}</div>${inlineAction}</div>`
  }).join('')
}

export function applySessionGroups(listElement, groupBy = 'none') {
  if (groupBy === 'none') return
  const items = [...listElement.querySelectorAll('.col-item')]
  const groups = new Map()
  for (const element of items) {
    const key = element.dataset.agentLabel
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(element)
  }
  listElement.innerHTML = ''
  for (const [label, elements] of groups) {
    const header = document.createElement('div')
    header.className = 'session-group-hdr'
    header.textContent = label || 'Unknown'
    listElement.appendChild(header)
    for (const element of elements) listElement.appendChild(element)
  }
}
const DEFAULT_AGENT_ORDER = ['copilot', 'claude', 'codex', 'gemini', 'opencode']

function safeEscape(escapeHtml, value) {
  return typeof escapeHtml === 'function' ? escapeHtml(value) : String(value ?? '')
}

export function isCreateSelectableDaemon(daemon, getCreateSessionAccessState) {
  const { blocked, readOnly } = getCreateSessionAccessState(daemon)
  return !blocked && !readOnly
}

export function buildCreateSessionAgentOptions(
  daemon,
  {
    testedAgents = new Set(),
    agentNames = {},
    agentIcons = {},
    agentColors = {},
    preferredOrder = DEFAULT_AGENT_ORDER,
  } = {},
) {
  if (!daemon) return []

  const preferredIndexes = new Map(preferredOrder.map((agentName, index) => [agentName, index]))
  const acpAgents = (daemon.agents || []).filter((agentName) => agentName !== 'copilot-sdk')
  const sdkAgents = (daemon.agents || []).includes('copilot-sdk') ? ['copilot-sdk'] : []
  const sortedAcp = [...acpAgents].sort((left, right) => {
    const leftIndex = preferredIndexes.get(left) ?? 99
    const rightIndex = preferredIndexes.get(right) ?? 99
    if (leftIndex !== rightIndex) return leftIndex - rightIndex
    return left.localeCompare(right)
  })
  const options = []

  for (const agentName of sortedAcp) {
    options.push({
      agentName,
      supported: testedAgents.has(agentName),
      label: agentNames[agentName] || agentName,
      icon: agentIcons[agentName] || agentIcons.opencode || '',
      color: agentColors[agentName] || '#aaa',
      meta: 'ACP',
    })
  }

  for (const agentName of sdkAgents) {
    options.push({
      agentName,
      supported: true,
      label: 'GitHub Copilot SDK',
      icon: agentIcons.copilot || '',
      color: agentColors.copilot || '#6baaff',
      meta: 'Copilot SDK',
    })
  }

  return options
}

export function pickDefaultCreateDaemonId({ daemonEntries = [], currentDaemonId = '', isCreateSelectableDaemon } = {}) {
  if (currentDaemonId) {
    const currentEntry = daemonEntries.find(([daemonId]) => daemonId === currentDaemonId)
    if (currentEntry && isCreateSelectableDaemon(currentEntry[1])) return currentDaemonId
  }

  const creatableEntry = daemonEntries.find(([, daemon]) => isCreateSelectableDaemon(daemon))
  return creatableEntry?.[0] || ''
}

export function pickDefaultCreateAgentName(
  daemon,
  {
    preferred = '',
    currentAgentName = '',
    buildAgentOptions = () => [],
  } = {},
) {
  const options = buildAgentOptions(daemon)
  if (!options.length) return ''

  const supported = options.filter((option) => option.supported)
  if (preferred && supported.some((option) => option.agentName === preferred)) return preferred
  if (currentAgentName && supported.some((option) => option.agentName === currentAgentName)) return currentAgentName
  return supported[0]?.agentName || options[0]?.agentName || ''
}

export function normalizePickerPath(pathValue, platform) {
  let value = String(pathValue || '').trim()
  if (!value) return ''

  if (platform === 'win32') {
    value = value.replace(/\//g, '\\')
    if (/^[a-zA-Z]:$/.test(value)) return `${value}\\`
    if (/^[a-zA-Z]:\\+$/.test(value)) return `${value.slice(0, 2)}\\`
    return value.replace(/\\+$/, '')
  }

  value = value.replace(/\\/g, '/')
  return value === '/' ? '/' : value.replace(/\/+$/, '')
}

export function pathLooksCompatibleWithPlatform(pathValue, platform) {
  const value = String(pathValue || '').trim()
  if (!value) return true
  if (platform === 'win32') return /^[a-zA-Z]:[\\/]/.test(value) || /^\\\\[^\\]+\\[^\\]+/.test(value)
  return value.startsWith('/') && !/^[a-zA-Z]:[\\/]/.test(value) && !value.startsWith('\\\\')
}

export function defaultDirectoryForDaemon(daemon) {
  return (daemon?.workspaces || []).find(Boolean) || ''
}

export function buildCreateSessionDraft({
  draft = { daemonId: '', agentName: '', directory: '' },
  daemonEntries = [],
  currentDaemonId = '',
  currentAgentName = '',
  directoryInputValue = '',
  preserveDirectory = false,
  getDaemonById = () => null,
  isCreateSelectableDaemon = () => false,
  buildAgentOptions = () => [],
} = {}) {
  const selectedDaemonId = String(draft.daemonId || '').trim()
  const selectedEntry = daemonEntries.find(([daemonId]) => daemonId === selectedDaemonId)
  const daemonId = selectedEntry && isCreateSelectableDaemon(selectedEntry[1])
    ? selectedEntry[0]
    : pickDefaultCreateDaemonId({ daemonEntries, currentDaemonId, isCreateSelectableDaemon })
  const daemon = daemonId ? getDaemonById(daemonId) : null

  if (!daemon) {
    return { daemonId: '', agentName: '', directory: '' }
  }

  const agentName = pickDefaultCreateAgentName(daemon, {
    preferred: draft.agentName,
    currentAgentName,
    buildAgentOptions,
  })
  const currentDirectory = normalizePickerPath(directoryInputValue || draft.directory || '', daemon.platform)
  const directory = !preserveDirectory || !currentDirectory || !pathLooksCompatibleWithPlatform(currentDirectory, daemon.platform)
    ? normalizePickerPath(defaultDirectoryForDaemon(daemon), daemon.platform)
    : currentDirectory

  return { daemonId, agentName, directory }
}

export function buildCreateDaemonListMarkup({
  daemonId = '',
  daemon = null,
  sessionCount = 0,
  normalizeDaemonPlatform = (platform) => platform || '',
  osIcons = {},
  osNames = {},
  escapeHtml,
} = {}) {
  if (!daemon) {
    return '<div class="csm-section-copy">Select a workspace from the left panel first.</div>'
  }

  const platform = normalizeDaemonPlatform(daemon.platform)
  const osIcon = osIcons[platform] || '🖥'
  const osName = osNames[platform] || ''
  const meta = [
    daemon.hostname && daemon.hostname !== daemonId ? daemon.hostname : '',
    osName,
    `${sessionCount} session${sessionCount !== 1 ? 's' : ''}`,
  ].filter(Boolean)
  const metaHtml = meta.length
    ? `<div class="create-daemon-meta">${meta.map((item) => `<span class="create-daemon-meta-item">${safeEscape(escapeHtml, item)}</span>`).join('')}</div>`
    : ''

  return `<div class="create-daemon-card is-selected" style="cursor:default"><div class="create-daemon-head"><div class="create-daemon-copy"><div class="create-daemon-name">${osIcon} ${safeEscape(escapeHtml, daemonId)}</div>${metaHtml}</div></div></div>`
}

export function buildCreateAgentListMarkup({
  daemon = null,
  selectedAgentName = '',
  hasCreatableDaemonEntry = false,
  buildAgentOptions = () => [],
  renderEmptyState = () => '',
  escapeHtml,
} = {}) {
  if (!daemon) {
    return renderEmptyState({
      title: hasCreatableDaemonEntry ? 'Select a workspace' : 'No eligible workspace',
      detail: hasCreatableDaemonEntry
        ? 'Pick a workspace first to load its available agents.'
        : 'You need workspace admin access before agent choices become available here.',
      icon: '✦',
    })
  }

  const options = buildAgentOptions(daemon)
  if (!options.length) {
    return renderEmptyState({
      title: 'No agents found',
      detail: 'This workspace is available, but it did not publish any supported agents yet.',
      icon: '🛰',
    })
  }

  const renderGroup = (title, groupOptions) => groupOptions.length
    ? `<div class="create-agent-group"><div class="create-agent-group-title">${title}</div><div class="create-agent-group-options">${groupOptions.map((option) => `<button class="create-agent-option${option.agentName === selectedAgentName ? ' is-selected' : ''}${option.supported ? '' : ' is-disabled'}" type="button"${option.supported ? ` data-action="select-create-agent" data-agent-name="${safeEscape(escapeHtml, option.agentName)}"` : ''}><span style="color:${option.color}">${option.icon}</span><span>${safeEscape(escapeHtml, option.label)}</span></button>`).join('')}</div></div>`
    : ''

  const acpOptions = options.filter((option) => option.meta === 'ACP')
  const sdkOptions = options.filter((option) => option.meta === 'Copilot SDK')
  return [
    renderGroup('ACP Compatible', acpOptions),
    // renderGroup('Managed by SDK', sdkOptions),
  ].filter(Boolean).join('')
}

export function buildCreateSessionButtonState({
  openDaemonId = '',
  openDaemon = null,
  selectedDaemonId = '',
  selectedDaemon = null,
  selectedAgentName = '',
  directoryValue = '',
  hasCreatableDaemonEntry = false,
  isCreateSelectableDaemon = () => false,
  getCreateSessionAccessState = () => ({ blocked: false, readOnly: false }),
} = {}) {
  const canOpen = !!openDaemonId && !!openDaemon && isCreateSelectableDaemon(openDaemon)
  const openButtonTitle = !openDaemonId
    ? 'Select a workspace first'
    : !canOpen
      ? 'Creating sessions requires workspace admin access'
      : 'Create a new session'
  const invalidDirectory = !!selectedDaemonId && !!directoryValue && !pathLooksCompatibleWithPlatform(directoryValue, selectedDaemon?.platform)
  const { blocked, readOnly } = getCreateSessionAccessState(selectedDaemon)
  const platformLabel = selectedDaemon?.platform === 'win32' ? 'Windows' : 'Linux/macOS'

  return {
    openButtonDisabled: !canOpen,
    openButtonTitle,
    submitDisabled: !selectedDaemonId || !selectedAgentName || invalidDirectory || blocked || readOnly,
    submitText: !selectedDaemonId
      ? (hasCreatableDaemonEntry ? 'Select a Workspace' : 'No Workspace Access')
      : blocked
        ? 'No Workspace Access'
        : readOnly
          ? 'Admin Required'
          : 'Create',
    submitTitle: !selectedDaemonId
      ? (hasCreatableDaemonEntry ? 'Select a workspace first.' : 'No workspace with admin create access is currently available.')
      : blocked
        ? 'You need member or admin permission on this workspace before sessions are visible.'
        : readOnly
          ? 'Creating sessions requires workspace admin access. You currently have member (read-only) access.'
          : invalidDirectory
            ? `Directory does not match the selected ${platformLabel} workspace.`
            : !selectedAgentName
              ? 'Choose an agent for this workspace.'
              : '',
    submitBlocked: blocked || readOnly,
  }
}

export function buildDirectorySuggestionsMarkup(items = [], response = null, escapeHtml) {
  const seen = new Set()
  const options = []

  for (const item of items) {
    const path = item?.path || ''
    if (!path || seen.has(path)) continue

    seen.add(path)
    const labelParts = []
    if (item?.name && item.name !== path) labelParts.push(item.name)
    if (item?.kind === 'favorite') labelParts.push('workspace')
    else if (item?.kind === 'root') labelParts.push('root')
    else if (response?.base) labelParts.push(response.base)
    options.push(`<option value="${safeEscape(escapeHtml, path)}" label="${safeEscape(escapeHtml, labelParts.join(' · '))}"></option>`)
  }

  return options.join('')
}
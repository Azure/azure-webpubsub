function safeEscape(escapeHtml, value) {
  return typeof escapeHtml === 'function' ? escapeHtml(value) : String(value ?? '')
}

export function daemonAccessFieldKey(field) {
  const value = String(field || '').trim()
  if (value === 'member' || value === 'memberUsers' || value === 'reader' || value === 'readerUsers') return 'member'
  if (value === 'admin' || value === 'adminUsers' || value === 'writer' || value === 'writerUsers') return 'admin'
  return value
}

export function daemonAccessInputId(field) {
  return `daemon-${daemonAccessFieldKey(field)}-users-input`
}

export function daemonAccessValueId(field) {
  return `daemon-${daemonAccessFieldKey(field)}-users`
}

export function buildDaemonAccessSectionMarkup({
  daemonId,
  field,
  title,
  description,
  sectionClass,
  rawValue = '',
  users = [],
  escapeHtml,
} = {}) {
  const inputId = daemonAccessInputId(field)
  const chips = users.length
    ? users.map((user) => `<span class="daemon-access-chip"><span class="daemon-access-chip-text">${safeEscape(escapeHtml, user)}</span><button type="button" data-action="remove-daemon-access-user" data-daemon-id="${safeEscape(escapeHtml, daemonId)}" data-field="${safeEscape(escapeHtml, field)}" data-user="${safeEscape(escapeHtml, user)}" aria-label="Remove ${safeEscape(escapeHtml, user)}">×</button></span>`).join('')
    : '<span class="daemon-access-empty">No users added yet</span>'
  return `<div class="daemon-access-section ${sectionClass}"><div class="daemon-access-section-head"><div><div class="daemon-access-section-title">${title}</div><div class="daemon-access-section-copy">${description}</div></div><span class="daemon-access-count">${users.length}</span></div><div class="daemon-access-chipbox" data-action="focus-daemon-access-input" data-input-id="${safeEscape(escapeHtml, inputId)}">${chips}<input id="${inputId}" class="daemon-access-input" type="text" placeholder="Add username and press Enter" data-keydown-action="daemon-access-editor" data-daemon-id="${safeEscape(escapeHtml, daemonId)}" data-field="${safeEscape(escapeHtml, field)}"></div><textarea id="${daemonAccessValueId(field)}" class="hidden">${safeEscape(escapeHtml, rawValue)}</textarea></div>`
}

export function captureDaemonAccessInputState(documentRef) {
  const active = documentRef?.activeElement
  if (!(active instanceof HTMLTextAreaElement) && !(active instanceof HTMLInputElement)) return null
  if (!/^daemon-(member|admin)-users(?:-input)?$/.test(active.id)) return null
  return {
    id: active.id,
    value: active.value,
    selectionStart: typeof active.selectionStart === 'number' ? active.selectionStart : null,
    selectionEnd: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
    scrollTop: active.scrollTop,
  }
}

export function restoreDaemonAccessInputState(documentRef, state) {
  if (!state) return
  const input = documentRef?.getElementById(state.id)
  if (!(input instanceof HTMLTextAreaElement) && !(input instanceof HTMLInputElement)) return
  if (input.value !== state.value) input.value = state.value
  input.focus()
  if (typeof state.selectionStart === 'number' && typeof state.selectionEnd === 'number') input.setSelectionRange(state.selectionStart, state.selectionEnd)
  if (typeof state.scrollTop === 'number') input.scrollTop = state.scrollTop
}

export function collectDaemonAccessEditorUsers({
  documentRef,
  parseUserListInput = () => [],
  fields = ['memberUsers', 'adminUsers'],
} = {}) {
  return Object.fromEntries(fields.map((field) => {
    const storedInput = documentRef?.getElementById(daemonAccessValueId(field))
    const pendingInput = documentRef?.getElementById(daemonAccessInputId(field))
    const users = [...new Set([
      ...parseUserListInput(storedInput?.value || ''),
      ...parseUserListInput(pendingInput?.value || ''),
    ])]
    return [field, users]
  }))
}
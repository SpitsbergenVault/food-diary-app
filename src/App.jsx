import { useEffect, useMemo, useRef, useState } from 'react'

const GOOGLE_CLIENT_ID =
  '102248618002-qdabmk5jkrc99v5jtga2df4j1ed7mavv.apps.googleusercontent.com'

const GOOGLE_SHEETS_SCOPE =
  'https://www.googleapis.com/auth/spreadsheets'

const RAW_SHEET_NAME = 'RawData'

const TIME_OPTIONS = [
  '12:00 AM',
  '1:00 AM',
  '2:00 AM',
  '3:00 AM',
  '4:00 AM',
  '5:00 AM',
  '6:00 AM',
  '7:00 AM',
  '8:00 AM',
  '9:00 AM',
  '10:00 AM',
  '11:00 AM',
  '12:00 PM',
  '1:00 PM',
  '2:00 PM',
  '3:00 PM',
  '4:00 PM',
  '5:00 PM',
  '6:00 PM',
  '7:00 PM',
  '8:00 PM',
  '9:00 PM',
  '10:00 PM',
  '11:00 PM'
]

function loadEntries() {
  try {
    const saved = localStorage.getItem('foodEntries')

    if (!saved) return []

    const parsed = JSON.parse(saved)

    if (!Array.isArray(parsed)) {
      console.error('Saved entries are not an array')
      return []
    }

    return parsed
  } catch (error) {
    console.error('Failed to load entries:', error)
    return []
  }
}

function saveEntries(entries) {
  try {
    localStorage.setItem('foodEntries', JSON.stringify(entries))
  } catch (error) {
    console.error('Failed to save entries:', error)
    alert('Unable to save entries. Storage may be full.')
  }
}

const AUTO_ARCHIVE_KEY = 'foodEntries_backup'
const SNAPSHOT_ARCHIVE_KEY = 'foodEntries_snapshots'
const MAX_AUTO_SNAPSHOTS = 10

function saveBackup(entries) {
  try {
    localStorage.setItem(
      AUTO_ARCHIVE_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        data: entries
      })
    )
  } catch (error) {
    console.error('Backup failed:', error)
  }
}

function loadSnapshots() {
  try {
    const saved = localStorage.getItem(SNAPSHOT_ARCHIVE_KEY)

    if (!saved) return []

    const parsed = JSON.parse(saved)

    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error('Failed to load snapshots:', error)
    return []
  }
}

function saveSnapshots(snapshots) {
  try {
    localStorage.setItem(
      SNAPSHOT_ARCHIVE_KEY,
      JSON.stringify(snapshots.slice(0, MAX_AUTO_SNAPSHOTS))
    )
  } catch (error) {
    console.error('Failed to save snapshots:', error)
  }
}

function saveSnapshot(entries, reason = 'AUTO SNAPSHOT') {
  try {
    if (!Array.isArray(entries)) return

    const sortedEntries = sortEntries(entries)
    const existingSnapshots = loadSnapshots()
    const latestSnapshot = existingSnapshots[0]

    if (
      latestSnapshot &&
      JSON.stringify(latestSnapshot.data) === JSON.stringify(sortedEntries)
    ) {
      return
    }

    const snapshot = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      reason,
      data: sortedEntries
    }

    saveSnapshots([snapshot, ...existingSnapshots])
  } catch (error) {
    console.error('Snapshot failed:', error)
  }
}

function removeSnapshot(snapshotId) {
  const remainingSnapshots = loadSnapshots().filter(
    snapshot => snapshot.id !== snapshotId
  )

  saveSnapshots(remainingSnapshots)
}

function convertTimeTo24Hour(timeString) {
  const [time, modifier] = timeString.split(' ')
  let [hours, minutes] = time.split(':')

  hours = parseInt(hours, 10)

  if (modifier === 'PM' && hours !== 12) hours += 12
  if (modifier === 'AM' && hours === 12) hours = 0

  return `${hours.toString().padStart(2, '0')}:${minutes}`
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    const dateTimeA = `${a.date}T${convertTimeTo24Hour(a.time)}`
    const dateTimeB = `${b.date}T${convertTimeTo24Hour(b.time)}`

    return new Date(dateTimeB) - new Date(dateTimeA)
  })
}

function getStoredSpreadsheetId() {
  return localStorage.getItem('foodDiarySpreadsheetId')
}

function storeSpreadsheetId(spreadsheetId) {
  localStorage.setItem('foodDiarySpreadsheetId', spreadsheetId)
}

function clearStoredSpreadsheetId() {
  localStorage.removeItem('foodDiarySpreadsheetId')
}

function entriesToSheetValues(entries) {
  return [
    ['Date', 'Time', 'Food'],
    ...sortEntries(entries).map(entry => [entry.date, entry.time, entry.food])
  ]
}

function isValidDateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00`)

  return !Number.isNaN(date.getTime())
}

function normalizeImportedEntries(importedEntries) {
  if (!Array.isArray(importedEntries)) {
    throw new Error('Backup must be an array')
  }

  return importedEntries.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Entry ${index + 1} is not valid`)
    }

    const food = typeof entry.food === 'string' ? entry.food.trim() : ''

    if (!isValidDateValue(entry.date)) {
      throw new Error(`Entry ${index + 1} has an invalid date`)
    }

    if (!TIME_OPTIONS.includes(entry.time)) {
      throw new Error(`Entry ${index + 1} has an invalid time`)
    }

    if (!food) {
      throw new Error(`Entry ${index + 1} is missing food text`)
    }

    return {
      ...entry,
      id: typeof entry.id === 'string' && entry.id ? entry.id : crypto.randomUUID(),
      date: entry.date,
      time: entry.time,
      food,
      createdAt:
        typeof entry.createdAt === 'number' ? entry.createdAt : Date.now()
    }
  })
}

function requestGoogleAccessToken() {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services has not loaded yet.'))
      return
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SHEETS_SCOPE,
      callback: response => {
        if (response.error) {
          reject(response)
          return
        }

        resolve(response.access_token)
      }
    })

    tokenClient.requestAccessToken({ prompt: '' })
  })
}

async function createFoodDiarySpreadsheet(accessToken) {
  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: {
        title: 'PANA Intake Registry'
      },
      sheets: [
        {
          properties: {
            title: RAW_SHEET_NAME
          }
        },
        {
          properties: {
            title: 'Formatted'
          }
        }
      ]
    })
  })

  if (!response.ok) {
    throw new Error('Failed to create spreadsheet')
  }

  return response.json()
}

async function clearRawData(accessToken, spreadsheetId) {
  const range = encodeURIComponent(`${RAW_SHEET_NAME}!A:C`)

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:clear`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    }
  )

  if (!response.ok) {
    throw new Error('Failed to clear existing sheet data')
  }
}

async function updateRawData(accessToken, spreadsheetId, entries) {
  const range = encodeURIComponent(`${RAW_SHEET_NAME}!A1`)
  const values = entriesToSheetValues(entries)

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values })
    }
  )

  if (!response.ok) {
    throw new Error('Failed to update sheet data')
  }
}

function formatDateForDisplay(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function formatTimeNow() {
  return new Date().toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function App() {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const currentHour = now.getHours()

  const formattedHour =
    currentHour === 0
      ? '12:00 AM'
      : currentHour < 12
      ? `${currentHour}:00 AM`
      : currentHour === 12
      ? '12:00 PM'
      : `${currentHour - 12}:00 PM`

  const [date, setDate] = useState(today)
  const [time, setTime] = useState(formattedHour)
  const [food, setFood] = useState('')
  const [entries, setEntries] = useState(loadEntries)
  const [showArchive, setShowArchive] = useState(false)
  const [showSystem, setShowSystem] = useState(false)
  const [toast, setToast] = useState('')
  const [spreadsheetId, setSpreadsheetId] = useState(getStoredSpreadsheetId)
  const [syncStatus, setSyncStatus] = useState('')
  const [clock, setClock] = useState(formatTimeNow())
  const [editingEntryId, setEditingEntryId] = useState(null)
  const [snapshotCount, setSnapshotCount] = useState(() => loadSnapshots().length)
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editFood, setEditFood] = useState('')

  const fileInputRef = useRef(null)

  useEffect(() => {
    saveEntries(entries)
    saveBackup(entries)
    setSnapshotCount(loadSnapshots().length)
  }, [entries])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(formatTimeNow())
    }, 30000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    async function lockPortrait() {
      try {
        if (screen.orientation?.lock) {
          await screen.orientation.lock('portrait')
        }
      } catch (error) {
        // iOS Safari and some browsers block orientation locking for PWAs.
        // The landscape guard below still keeps the experience portrait-first.
      }
    }

    lockPortrait()
  }, [])


  useEffect(() => {
    let viewportMeta = document.querySelector('meta[name="viewport"]')

    if (!viewportMeta) {
      viewportMeta = document.createElement('meta')
      viewportMeta.setAttribute('name', 'viewport')
      document.head.appendChild(viewportMeta)
    }

    viewportMeta.setAttribute(
      'content',
      'width=device-width, initial-scale=1, viewport-fit=cover'
    )
  }, [])

  const sortedEntries = useMemo(() => sortEntries(entries), [entries])

  const groupedEntries = useMemo(
    () =>
      sortedEntries.reduce((groups, entry) => {
        if (!groups[entry.date]) groups[entry.date] = []
        groups[entry.date].push(entry)
        return groups
      }, {}),
    [sortedEntries]
  )

  const todayEntries = useMemo(
    () => entries.filter(entry => entry.date === today),
    [entries, today]
  )

  const latestEntry = sortedEntries[0]

  function showSystemMessage(message) {
    setToast(message)

    window.setTimeout(() => {
      setToast('')
    }, 2200)
  }

  function addEntry() {
    const trimmedFood = food.trim()

    if (!trimmedFood) {
      showSystemMessage('INVALID ENTRY FORMAT')
      return
    }

    const newEntry = {
      id: crypto.randomUUID(),
      date,
      time,
      food: trimmedFood,
      createdAt: Date.now()
    }

    saveSnapshot(entries, 'BEFORE ADD')
    setSnapshotCount(loadSnapshots().length)
    setEntries(sortEntries([...entries, newEntry]))
    setFood('')
    showSystemMessage('ENTRY ARCHIVED')
  }

  function startEditEntry(entry) {
    setEditingEntryId(entry.id)
    setEditDate(entry.date)
    setEditTime(entry.time)
    setEditFood(entry.food)
  }

  function cancelEditEntry() {
    setEditingEntryId(null)
    setEditDate('')
    setEditTime('')
    setEditFood('')
  }

  function saveEditedEntry(id) {
    const trimmedFood = editFood.trim()

    if (!trimmedFood) {
      showSystemMessage('INVALID ENTRY FORMAT')
      return
    }

    saveSnapshot(entries, 'BEFORE EDIT')
    setSnapshotCount(loadSnapshots().length)

    setEntries(
      sortEntries(
        entries.map(entry =>
          entry.id === id
            ? {
                ...entry,
                date: editDate,
                time: editTime,
                food: trimmedFood,
                updatedAt: Date.now()
              }
            : entry
        )
      )
    )

    cancelEditEntry()
    showSystemMessage('RECORD UPDATED')
  }

  function deleteEntry(id) {
    const entry = entries.find(item => item.id === id)
    const label = entry?.food ? `\n\n${entry.time} / ${entry.food}` : ''

    const shouldDelete = window.confirm(
      `Void this intake record?${label}\n\nYou can restore the previous snapshot from System Operations.`
    )

    if (!shouldDelete) return

    saveSnapshot(entries, 'BEFORE DELETE')
    setSnapshotCount(loadSnapshots().length)
    setEntries(entries.filter(entry => entry.id !== id))
    showSystemMessage('RECORD VOIDED')
  }

  async function connectGoogleSheets() {
    try {
      setSyncStatus('CREATING EXTERNAL ARCHIVE...')

      const accessToken = await requestGoogleAccessToken()
      const spreadsheet = await createFoodDiarySpreadsheet(accessToken)

      storeSpreadsheetId(spreadsheet.spreadsheetId)
      setSpreadsheetId(spreadsheet.spreadsheetId)

      await updateRawData(accessToken, spreadsheet.spreadsheetId, entries)

      setSyncStatus('EXTERNAL ARCHIVE LINKED')
      showSystemMessage('SHEETS ARCHIVE LINKED')
    } catch (error) {
      console.error(error)
      setSyncStatus('GOOGLE SHEETS CONNECTION FAILED')
      showSystemMessage('CONNECTION FAILED')
    }
  }

  async function syncToGoogleSheets() {
    try {
      if (!spreadsheetId) {
        await connectGoogleSheets()
        return
      }

      setSyncStatus('SYNCING TO GOOGLE SHEETS...')

      const accessToken = await requestGoogleAccessToken()

      await clearRawData(accessToken, spreadsheetId)
      await updateRawData(accessToken, spreadsheetId, entries)

      setSyncStatus('EXTERNAL ARCHIVE UPDATED')
      showSystemMessage('SYNC COMPLETE')
    } catch (error) {
      console.error(error)
      setSyncStatus('GOOGLE SHEETS SYNC FAILED')
      showSystemMessage('SYNC FAILED')
    }
  }

  function disconnectGoogleSheets() {
    const shouldForget = window.confirm(
      'Forget this Google Sheet connection on this device?\n\nThis does not delete the Sheet and does not revoke Google account permissions.'
    )

    if (!shouldForget) return

    clearStoredSpreadsheetId()
    setSpreadsheetId(null)
    setSyncStatus('SHEET CONNECTION FORGOTTEN ON THIS DEVICE')
    showSystemMessage('SHEET LINK FORGOTTEN')
  }

  function openGoogleSheet() {
    if (!spreadsheetId) {
      showSystemMessage('NO SHEET LINK FOUND')
      return
    }

    window.open(
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  function restoreLastBackup() {
    try {
      const snapshots = loadSnapshots()
      const latestSnapshot = snapshots[0]

      if (latestSnapshot?.data && Array.isArray(latestSnapshot.data)) {
        const sorted = sortEntries(latestSnapshot.data)

        removeSnapshot(latestSnapshot.id)
        setSnapshotCount(loadSnapshots().length)
        setEntries(sorted)
        saveEntries(sorted)
        saveBackup(sorted)
        cancelEditEntry()
        showSystemMessage('PREVIOUS SNAPSHOT RESTORED')
        return
      }

      const saved = localStorage.getItem(AUTO_ARCHIVE_KEY)

      if (!saved) {
        showSystemMessage('NO SNAPSHOT FOUND')
        return
      }

      const parsed = JSON.parse(saved)

      if (!parsed?.data || !Array.isArray(parsed.data)) {
        showSystemMessage('BACKUP CORRUPTED')
        return
      }

      const sorted = sortEntries(parsed.data)

      setEntries(sorted)
      saveEntries(sorted)
      saveBackup(sorted)
      cancelEditEntry()
      showSystemMessage('AUTO-ARCHIVE RESTORED')
    } catch (error) {
      showSystemMessage('RESTORE FAILED')
    }
  }

  function exportToCSV() {
    if (entries.length === 0) {
      showSystemMessage('NO RECORDS TO EXPORT')
      return
    }

    const headers = ['Date', 'Time', 'Food']
    const rows = sortEntries(entries).map(entry => [
      `"${entry.date}"`,
      `"${entry.time}"`,
      `"${entry.food.replace(/"/g, '""')}"`
    ])

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = 'pana-intake-registry.csv'
    link.click()

    URL.revokeObjectURL(url)
    showSystemMessage('ARCHIVE CSV EXPORTED')
  }

  function exportBackup() {
    if (entries.length === 0) {
      showSystemMessage('NO REGISTRY DATA')
      return
    }

    const sorted = sortEntries(entries)
    const blob = new Blob([JSON.stringify(sorted, null, 2)], {
      type: 'application/json'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')

    a.href = url
    a.download = `pana-registry-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()

    URL.revokeObjectURL(url)
    showSystemMessage('REGISTRY BACKUP EXPORTED')
  }

  function importBackup(event) {
    const file = event.target.files[0]

    if (!file) return

    const reader = new FileReader()

    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result)

        const normalizedEntries = normalizeImportedEntries(parsed)
        const sorted = sortEntries(normalizedEntries)

        saveSnapshot(entries, 'BEFORE IMPORT')
        setSnapshotCount(loadSnapshots().length)
        setEntries(sorted)
        saveEntries(sorted)
        showSystemMessage('REGISTRY BACKUP IMPORTED')
      } catch (error) {
        console.error(error)
        showSystemMessage('BACKUP IMPORT FAILED')
      }
    }

    reader.readAsText(file)
    event.target.value = ''
  }

  function triggerImport() {
    fileInputRef.current?.click()
  }

  return (
    <div style={styles.appShell}>
      <style>{globalCss}</style>

      <div className="pana-landscape-guard" style={styles.landscapeGuard}>
        <div style={styles.guardPanel}>
          <div style={styles.guardIcon}>▯</div>
          <strong>PORTRAIT TERMINAL REQUIRED</strong>
          <span>Rotate device to resume intake registration.</span>
        </div>
      </div>

      <main style={styles.mainTerminal}>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          onChange={importBackup}
          style={{ display: 'none' }}
        />

        <header style={styles.identityPanel}>
          <div>
            <div style={styles.brand}>PANA</div>
            <div style={styles.subtitle}>Pan-American Nutrition Authority</div>
            <div style={styles.nodeLine}>NIGHT TERMINAL // NODE ACTIVE</div>
          </div>

          <div style={styles.clockBox}>
            <span>{formatDateForDisplay(today)}</span>
            <strong>{clock}</strong>
          </div>
        </header>

        <section style={styles.panel}>
          <PanelTitle title="REGISTER INTAKE EVENT" tone="aqua" />

          <div style={styles.dateTimeGrid}>
            <div style={styles.fieldStack}>
              <label style={styles.compactLabel} htmlFor="registry-date">
                DATE
              </label>
              <input
                id="registry-date"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                style={{ ...styles.input, ...styles.compactInput }}
              />
            </div>

            <div style={styles.fieldStack}>
              <label style={styles.compactLabel} htmlFor="local-time">
                TIME
              </label>
              <select
                id="local-time"
                value={time}
                onChange={e => setTime(e.target.value)}
                style={{ ...styles.input, ...styles.compactInput }}
              >
                {TIME_OPTIONS.map(hour => (
                  <option key={hour} value={hour}>
                    {hour}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label style={styles.label} htmlFor="intake-event">
            DESCRIBE INTAKE EVENT
          </label>
          <textarea
            id="intake-event"
            value={food}
            onChange={e => setFood(e.target.value)}
            placeholder="Describe intake event..."
            rows={4}
            style={{ ...styles.input, ...styles.textarea }}
          />

          <button onClick={addEntry} style={styles.primaryButton}>
            <span>REGISTER INTAKE</span>
            <span aria-hidden="true">›</span>
          </button>
        </section>

        <section style={styles.summaryPanel}>
          <PanelTitle title="TODAY'S REGISTRY SUMMARY" tone="aqua" />

          <div style={styles.summaryGrid}>
            <Metric label="EVENTS REGISTERED" value={todayEntries.length.toString().padStart(2, '0')} />
            <Metric label="TOTAL ARCHIVE" value={entries.length.toString().padStart(2, '0')} />
            <div style={styles.waveBox} aria-hidden="true">
              <svg viewBox="0 0 120 48" style={styles.waveSvg}>
                <polyline
                  points="4,34 20,34 30,22 42,38 56,12 70,28 84,18 98,26 116,26"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </section>

        <section style={styles.commandGrid}>
          <button
            onClick={() => setShowArchive(true)}
            style={{ ...styles.commandCard, ...styles.magentaCard }}
          >
            <span style={styles.commandIcon}>▤</span>
            <span>
              <strong>VIEW ARCHIVE </strong>
              <small>BROWSE INTAKE LOG</small>
            </span>
            <span aria-hidden="true">›</span>
          </button>

          <button
            onClick={syncToGoogleSheets}
            style={{ ...styles.commandCard, ...styles.aquaCard }}
          >
            <span style={styles.commandIcon}>▦</span>
            <span>
              <strong>SYNC TO SHEETS </strong>
              <small>{spreadsheetId ? 'EXTERNAL ARCHIVE READY' : 'CREATE ARCHIVE LINK'}</small>
            </span>
            <span aria-hidden="true">›</span>
          </button>
        </section>

        <button onClick={() => setShowSystem(true)} style={styles.systemButton}>
          <span style={styles.commandIcon}>⚙</span>
          <span>
            <strong>SYSTEM OPERATIONS</strong><br></br>
            <small>BACKUPS, EXPORTS, SETTINGS</small>
          </span>
          <span aria-hidden="true">›</span>
        </button>

        <section style={styles.statusRail}>
          <span>LOCAL STORAGE: ONLINE</span>
          <span>{spreadsheetId ? 'EXTERNAL ARCHIVE: LINKED' : 'EXTERNAL ARCHIVE: OFFLINE'}</span>
        </section>

        <section style={styles.infoPanel}>
          <h2 style={styles.infoTitle}>MAIN TERMINAL</h2>
          <p style={styles.infoCopy}>
            Primary workflow: register intake, view archive, sync to Google Sheets.
          </p>
          {latestEntry && (
            <p style={styles.latestLine}>
              LAST ENTRY: {latestEntry.time} / {latestEntry.food}
            </p>
          )}
          {syncStatus && <p style={styles.syncStatus}>{syncStatus}</p>}
        </section>
      </main>

      {showArchive && (
        <Modal title="PANA ARCHIVE" subtitle="INTAKE EVENT LOG" tone="magenta" onClose={() => setShowArchive(false)}>
          {sortedEntries.length === 0 ? (
            <div style={styles.emptyState}>NO INTAKE RECORDS FOUND</div>
          ) : (
            Object.entries(groupedEntries).map(([groupDate, items]) => (
              <section key={groupDate} style={styles.archiveGroup}>
                <div style={styles.archiveGroupHeader}>
                  <span>{formatDateForDisplay(groupDate).toUpperCase()}</span>
                  <span>{items.length.toString().padStart(2, '0')} EVENTS</span>
                </div>

                {items.map(entry => {
                  const isEditing = editingEntryId === entry.id

                  return (
                    <article key={entry.id} style={styles.archiveRecord}>
                      {isEditing ? (
                        <div style={styles.editStack}>
                          <div style={styles.editGrid}>
                            <div style={styles.fieldStack}>
                              <label style={styles.compactLabel} htmlFor={`edit-date-${entry.id}`}>
                                DATE
                              </label>
                              <input
                                id={`edit-date-${entry.id}`}
                                type="date"
                                value={editDate}
                                onChange={e => setEditDate(e.target.value)}
                                style={{ ...styles.input, ...styles.compactInput }}
                              />
                            </div>

                            <div style={styles.fieldStack}>
                              <label style={styles.compactLabel} htmlFor={`edit-time-${entry.id}`}>
                                TIME
                              </label>
                              <select
                                id={`edit-time-${entry.id}`}
                                value={editTime}
                                onChange={e => setEditTime(e.target.value)}
                                style={{ ...styles.input, ...styles.compactInput }}
                              >
                                {TIME_OPTIONS.map(hour => (
                                  <option key={hour} value={hour}>
                                    {hour}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <label style={styles.compactLabel} htmlFor={`edit-food-${entry.id}`}>
                            INTAKE EVENT
                          </label>
                          <textarea
                            id={`edit-food-${entry.id}`}
                            value={editFood}
                            onChange={e => setEditFood(e.target.value)}
                            rows={3}
                            style={{ ...styles.input, ...styles.editTextarea }}
                          />

                          <div style={styles.editButtonRow}>
                            <button onClick={() => saveEditedEntry(entry.id)} style={styles.saveEditButton}>
                              SAVE CHANGES
                            </button>
                            <button onClick={cancelEditEntry} style={styles.cancelEditButton}>
                              CANCEL
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={styles.recordTime}>{entry.time}</div>
                          <div style={styles.recordFood}>{entry.food}</div>
                          <div style={styles.recordFooter}>
                            <span>STATUS: ARCHIVED</span>
                            <div style={styles.recordActions}>
                              <button onClick={() => startEditEntry(entry)} style={styles.editButton}>
                                EDIT RECORD
                              </button>
                              <button onClick={() => deleteEntry(entry.id)} style={styles.voidButton}>
                                VOID RECORD
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </article>
                  )
                })}
              </section>
            ))
          )}
        </Modal>
      )}

      {showSystem && (
        <Modal title="SYSTEM OPERATIONS" subtitle="MAINTENANCE & DATA MANAGEMENT" tone="yellow" onClose={() => setShowSystem(false)}>
          <SystemAction title="EXPORT ARCHIVE CSV " description="Download intake data" onClick={exportToCSV} />
          <SystemAction title="EXPORT REGISTRY BACKUP " description="Create full data backup" onClick={exportBackup} />
          <SystemAction title="IMPORT REGISTRY BACKUP " description="Restore from backup file" onClick={triggerImport} />
          <SystemAction title="RESTORE PREVIOUS SNAPSHOT " description="Undo latest data change" onClick={restoreLastBackup} />
          <SystemAction
            title={spreadsheetId ? 'CREATE NEW GOOGLE SHEET ' : 'CONNECT GOOGLE SHEETS '}
            description={spreadsheetId ? 'Generate and connect new sheet' : 'Create external archive'}
            onClick={connectGoogleSheets}
          />
          <SystemAction title="SYNC TO GOOGLE SHEETS " description="Push latest data to connected sheet" onClick={syncToGoogleSheets} />
          {spreadsheetId && (
            <SystemAction title="OPEN GOOGLE SHEET " description="View connected spreadsheet" onClick={openGoogleSheet} />
          )}
          {spreadsheetId && (
            <SystemAction title="FORGET SHEET CONNECTION " description="Remove saved Sheet ID from this device only" onClick={disconnectGoogleSheets} danger />
          )}

          <div style={styles.snapshotInfoBox}>
            <span>RESTORE SNAPSHOTS AVAILABLE</span>
            <strong>{snapshotCount.toString().padStart(2, '0')}</strong>
          </div>

          {spreadsheetId && (
            <div style={styles.sheetIdBox}>
              <span>CONNECTED SHEET ID</span>
              <code>{spreadsheetId}</code>
            </div>
          )}
        </Modal>
      )}

      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  )
}

function PanelTitle({ title, tone }) {
  return (
    <div style={styles.panelTitleRow}>
      <h2 style={{ ...styles.panelTitle, color: tone === 'yellow' ? tokens.yellow : tokens.aqua }}>
        {title}
      </h2>
      <span style={styles.hatch}>////////</span>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div style={styles.metricBox}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Modal({ title, subtitle, tone, children, onClose }) {
  const borderColor = tone === 'yellow' ? tokens.yellow : tokens.magenta

  return (
    <div style={styles.modalOverlay}>
      <div style={{ ...styles.modalContent, borderColor, boxShadow: `0 0 28px ${hexToGlow(borderColor)}` }}>
        <button onClick={onClose} style={{ ...styles.closeButton, color: borderColor, borderColor }} aria-label="Close panel">
          ×
        </button>
        <header style={styles.modalHeader}>
          <h2 style={{ ...styles.modalTitle, color: borderColor }}>{title}</h2>
          <p style={styles.modalSubtitle}>{subtitle}</p>
        </header>
        {children}
      </div>
    </div>
  )
}

function SystemAction({ title, description, onClick, danger = false }) {
  return (
    <button onClick={onClick} style={styles.systemAction}>
      <span style={{ ...styles.systemActionIcon, color: danger ? tokens.magenta : tokens.yellow }}>
        {danger ? '×' : '↧'}
      </span>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <span aria-hidden="true">›</span>
    </button>
  )
}

function hexToGlow(hex) {
  if (hex === tokens.yellow) return 'rgba(255, 212, 0, 0.28)'
  if (hex === tokens.magenta) return 'rgba(255, 61, 141, 0.24)'
  return 'rgba(45, 226, 230, 0.24)'
}

const tokens = {
  night: '#07090f',
  panel: 'rgba(5, 14, 18, 0.88)',
  panelSoft: 'rgba(11, 22, 28, 0.74)',
  line: 'rgba(45, 226, 230, 0.42)',
  lineSoft: 'rgba(245, 241, 232, 0.18)',
  text: '#F5F1E8',
  muted: '#9EA3B3',
  aqua: '#2DE2E6',
  green: '#3CF58A',
  orange: '#FF6A2A',
  magenta: '#FF3D8D',
  yellow: '#FFD400'
}

const globalCss = `
  :root {
    color-scheme: dark;
    background: ${tokens.night};
  }

  * {
    box-sizing: border-box;
  }

  html,
  body,
  #root {
    width: 100%;
    min-height: 100%;
    margin: 0;
    background: ${tokens.night};
    overflow-x: hidden;
  }

  body {
    min-width: 0;
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
  }

  button,
  input,
  textarea,
  select {
    min-width: 0;
    max-width: 100%;
    font: inherit;
  }

  input,
  textarea,
  select {
    -webkit-appearance: none;
    appearance: none;
  }

  button {
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  input[type='date']::-webkit-calendar-picker-indicator {
    filter: invert(1);
    opacity: 0.85;
  }

  select {
    background-image: linear-gradient(45deg, transparent 50%, ${tokens.text} 50%), linear-gradient(135deg, ${tokens.text} 50%, transparent 50%);
    background-position: calc(100% - 16px) 50%, calc(100% - 10px) 50%;
    background-size: 6px 6px, 6px 6px;
    background-repeat: no-repeat;
    padding-right: 32px !important;
  }


  @media (max-width: 380px) {
    .pana-landscape-guard + main {
      gap: 10px !important;
    }
  }

  @media (orientation: landscape) and (max-height: 520px) {
    .pana-landscape-guard {
      display: flex !important;
    }
  }
`

const styles = {
  appShell: {
    width: '100%',
    minWidth: 0,
    minHeight: '100dvh',
    color: tokens.text,
    fontFamily:
      'IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    background:
      'radial-gradient(circle at top left, rgba(45, 226, 230, 0.16), transparent 36%), radial-gradient(circle at bottom right, rgba(255, 61, 141, 0.12), transparent 34%), #07090f',
    padding: 'max(10px, env(safe-area-inset-top)) clamp(8px, 3vw, 14px) max(14px, env(safe-area-inset-bottom))'
  },
  mainTerminal: {
    width: '100%',
    maxWidth: 'min(520px, 100%)',
    margin: '0 auto',
    display: 'grid',
    gap: 'clamp(10px, 2.8vw, 14px)'
  },
  landscapeGuard: {
    display: 'none',
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: 'rgba(7, 9, 15, 0.97)'
  },
  guardPanel: {
    width: 'min(360px, 100%)',
    border: `1px solid ${tokens.aqua}`,
    borderRadius: 10,
    padding: 22,
    display: 'grid',
    gap: 10,
    textAlign: 'center',
    color: tokens.aqua,
    boxShadow: '0 0 32px rgba(45, 226, 230, 0.24)'
  },
  guardIcon: {
    fontSize: 46,
    transform: 'rotate(90deg)'
  },
  identityPanel: {
    border: `1px solid ${tokens.aqua}`,
    borderRadius: 10,
    padding: 'clamp(14px, 4vw, 20px)',
    minHeight: 126,
    display: 'flex',
    justifyContent: 'space-between',
    gap: 'clamp(10px, 3vw, 18px)',
    alignItems: 'center',
    background:
      'linear-gradient(135deg, rgba(45, 226, 230, 0.08), rgba(5, 14, 18, 0.92))',
    boxShadow: '0 0 32px rgba(45, 226, 230, 0.14), inset 0 0 40px rgba(45, 226, 230, 0.04)'
  },
  brand: {
    color: tokens.aqua,
    fontSize: 'clamp(42px, 13vw, 62px)',
    lineHeight: 0.9,
    fontWeight: 800,
    letterSpacing: '0.09em',
    textShadow: '0 0 18px rgba(45, 226, 230, 0.55)'
  },
  subtitle: {
    marginTop: 10,
    color: tokens.aqua,
    fontSize: 14,
    letterSpacing: '0.04em'
  },
  nodeLine: {
    marginTop: 7,
    color: tokens.aqua,
    fontSize: 13,
    letterSpacing: '0.04em'
  },
  clockBox: {
    flex: '0 0 auto',
    minWidth: 0,
    width: 'clamp(100px, 28vw, 118px)',
    border: `1px solid ${tokens.aqua}`,
    borderRadius: 7,
    padding: '13px 10px',
    display: 'grid',
    gap: 10,
    textAlign: 'right',
    color: tokens.aqua,
    background: 'rgba(5, 8, 10, 0.62)',
    fontSize: 13
  },
  panel: {
    border: `1px solid ${tokens.aqua}`,
    borderRadius: 10,
    padding: 'clamp(14px, 4vw, 18px)',
    background: tokens.panel,
    boxShadow: 'inset 0 0 28px rgba(45, 226, 230, 0.05)'
  },
  panelTitleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    marginBottom: 18,
    borderBottom: `1px solid ${tokens.lineSoft}`,
    paddingBottom: 12
  },
  panelTitle: {
    margin: 0,
    fontSize: 'clamp(17px, 5vw, 20px)',
    letterSpacing: '0.06em',
    fontWeight: 700
  },
  hatch: {
    color: 'rgba(45, 226, 230, 0.26)',
    letterSpacing: '0.18em',
    overflow: 'hidden',
    whiteSpace: 'nowrap'
  },
  label: {
    display: 'block',
    color: tokens.muted,
    fontSize: 13,
    letterSpacing: '0.08em',
    margin: '17px 0 8px'
  },
  compactLabel: {
    display: 'block',
    color: tokens.muted,
    fontSize: 12,
    letterSpacing: '0.1em',
    margin: '0 0 8px'
  },
  dateTimeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    columnGap: 'clamp(10px, 3vw, 14px)',
    rowGap: 10,
    alignItems: 'end',
    marginTop: 17
  },
  fieldStack: {
    width: '100%',
    minWidth: 0
  },
  input: {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    padding: '14px 15px',
    color: tokens.text,
    background: 'rgba(2, 7, 10, 0.72)',
    border: `1px solid ${tokens.lineSoft}`,
    borderRadius: 7,
    outline: 'none',
    fontSize: 16,
    boxShadow: 'inset 0 0 18px rgba(0, 0, 0, 0.28)'
  },
  compactInput: {
    height: 'clamp(50px, 13vw, 54px)',
    minHeight: 'clamp(50px, 13vw, 54px)',
    padding: '10px clamp(8px, 2.8vw, 12px)',
    fontSize: 'clamp(12px, 3.45vw, 14px)',
    lineHeight: 1.15,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  textarea: {
    resize: 'none',
    minHeight: 106
  },
  primaryButton: {
    width: '100%',
    marginTop: 18,
    padding: '16px 18px',
    display: 'flex',
    justifyContent: 'center',
    gap: 28,
    alignItems: 'center',
    color: tokens.aqua,
    background: 'linear-gradient(180deg, rgba(45, 226, 230, 0.12), rgba(45, 226, 230, 0.02))',
    border: `1px solid ${tokens.aqua}`,
    borderRadius: 7,
    textTransform: 'uppercase',
    letterSpacing: '0.11em',
    fontWeight: 800,
    fontSize: 'clamp(15px, 4.6vw, 18px)',
    boxShadow: '0 0 20px rgba(45, 226, 230, 0.26), inset 0 0 24px rgba(45, 226, 230, 0.08)'
  },
  summaryPanel: {
    border: `1px solid ${tokens.line}`,
    borderRadius: 10,
    padding: 'clamp(10px, 3vw, 14px)',
    background: 'rgba(5, 14, 18, 0.74)'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 0.8fr',
    gap: 10
  },
  metricBox: {
    minHeight: 74,
    padding: 10,
    border: `1px solid ${tokens.lineSoft}`,
    background: 'rgba(2, 7, 10, 0.45)',
    display: 'grid',
    alignContent: 'space-between'
  },
  waveBox: {
    minHeight: 74,
    display: 'grid',
    placeItems: 'center',
    color: tokens.aqua,
    border: `1px solid ${tokens.lineSoft}`,
    background: 'rgba(2, 7, 10, 0.45)'
  },
  waveSvg: {
    width: '82%',
    opacity: 0.95,
    filter: 'drop-shadow(0 0 8px rgba(45, 226, 230, 0.38))'
  },
  commandGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: 'clamp(10px, 3vw, 14px)'
  },
  commandCard: {
    minHeight: 'clamp(82px, 22vw, 94px)',
    padding: 14,
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    gap: 12,
    borderRadius: 8,
    background: tokens.panelSoft,
    textAlign: 'left'
  },
  magentaCard: {
    color: tokens.magenta,
    border: `1px solid ${tokens.magenta}`,
    boxShadow: '0 0 18px rgba(255, 61, 141, 0.12)'
  },
  aquaCard: {
    color: tokens.aqua,
    border: `1px solid ${tokens.aqua}`,
    boxShadow: '0 0 18px rgba(45, 226, 230, 0.12)'
  },
  commandIcon: {
    fontSize: 'clamp(22px, 6vw, 28px)',
    lineHeight: 1
  },
  systemButton: {
    width: '100%',
    minHeight: 'clamp(76px, 20vw, 86px)',
    padding: 'clamp(12px, 3.5vw, 16px)',
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    gap: 14,
    border: `1px solid ${tokens.yellow}`,
    borderRadius: 8,
    color: tokens.yellow,
    background: 'rgba(15, 13, 2, 0.44)',
    textAlign: 'left',
    boxShadow: '0 0 18px rgba(255, 212, 0, 0.10)'
  },
  statusRail: {
    border: `1px solid ${tokens.line}`,
    borderRadius: 8,
    padding: '12px 14px',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
    color: tokens.green,
    background: 'rgba(0, 18, 18, 0.42)',
    fontSize: 12,
    letterSpacing: '0.04em'
  },
  infoPanel: {
    border: `1px solid ${tokens.lineSoft}`,
    borderRadius: 10,
    padding: 16,
    background: 'rgba(5, 14, 18, 0.66)'
  },
  infoTitle: {
    margin: 0,
    color: tokens.aqua,
    fontSize: 16,
    letterSpacing: '0.08em'
  },
  infoCopy: {
    margin: '10px 0 0',
    color: tokens.text,
    lineHeight: 1.55
  },
  latestLine: {
    margin: '10px 0 0',
    color: tokens.muted,
    fontSize: 12,
    lineHeight: 1.4
  },
  syncStatus: {
    margin: '10px 0 0',
    color: tokens.green,
    fontSize: 12
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 50,
    padding: 'max(14px, env(safe-area-inset-top)) 14px max(14px, env(safe-area-inset-bottom))',
    background: 'rgba(7, 9, 15, 0.86)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'stretch'
  },
  modalContent: {
    position: 'relative',
    width: 'min(520px, 100%)',
    maxHeight: '100%',
    overflowY: 'auto',
    border: '1px solid',
    borderRadius: 12,
    padding: 18,
    background: 'rgba(5, 7, 12, 0.96)'
  },
  closeButton: {
    position: 'sticky',
    top: 0,
    float: 'right',
    zIndex: 2,
    width: 42,
    height: 42,
    border: '1px solid',
    borderRadius: 8,
    background: 'rgba(5, 7, 12, 0.94)',
    fontSize: 30,
    lineHeight: '34px'
  },
  modalHeader: {
    paddingBottom: 18,
    marginBottom: 16,
    borderBottom: `1px solid ${tokens.lineSoft}`
  },
  modalTitle: {
    margin: 0,
    fontSize: 24,
    letterSpacing: '0.08em'
  },
  modalSubtitle: {
    margin: '4px 0 0',
    color: tokens.text,
    fontSize: 13,
    letterSpacing: '0.06em'
  },
  emptyState: {
    color: tokens.muted,
    border: `1px dashed ${tokens.lineSoft}`,
    borderRadius: 8,
    padding: 18,
    textAlign: 'center'
  },
  archiveGroup: {
    marginBottom: 18
  },
  archiveGroupHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    color: tokens.magenta,
    marginBottom: 10,
    fontSize: 13,
    letterSpacing: '0.06em'
  },
  archiveRecord: {
    border: `1px solid ${tokens.lineSoft}`,
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
    background: 'rgba(5, 14, 18, 0.72)'
  },
  recordTime: {
    color: tokens.aqua,
    fontWeight: 800,
    marginBottom: 8,
    fontSize: 18
  },
  recordFood: {
    lineHeight: 1.5,
    marginBottom: 14
  },
  recordFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    color: tokens.green,
    fontSize: 12
  },
  recordActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end'
  },
  editStack: {
    display: 'grid',
    gap: 12
  },
  editGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 10
  },
  editTextarea: {
    resize: 'vertical',
    minHeight: 84
  },
  editButtonRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10
  },
  editButton: {
    color: tokens.aqua,
    background: 'transparent',
    border: `1px solid rgba(45, 226, 230, 0.48)`,
    borderRadius: 6,
    padding: '7px 9px',
    fontSize: 11
  },
  saveEditButton: {
    color: tokens.green,
    background: 'rgba(60, 245, 138, 0.08)',
    border: `1px solid rgba(60, 245, 138, 0.55)`,
    borderRadius: 6,
    padding: '10px 9px',
    fontSize: 12,
    fontWeight: 800
  },
  cancelEditButton: {
    color: tokens.muted,
    background: 'transparent',
    border: `1px solid ${tokens.lineSoft}`,
    borderRadius: 6,
    padding: '10px 9px',
    fontSize: 12,
    fontWeight: 800
  },
  voidButton: {
    color: tokens.magenta,
    background: 'transparent',
    border: `1px solid rgba(255, 61, 141, 0.48)`,
    borderRadius: 6,
    padding: '7px 9px',
    fontSize: 11
  },
  systemAction: {
    width: '100%',
    minHeight: 64,
    display: 'grid',
    gridTemplateColumns: '34px 1fr auto',
    gap: 12,
    alignItems: 'center',
    padding: '12px 10px',
    color: tokens.text,
    background: 'rgba(5, 14, 18, 0.72)',
    border: `1px solid rgba(255, 212, 0, 0.24)`,
    borderRadius: 6,
    textAlign: 'left',
    marginBottom: 8
  },
  systemActionIcon: {
    fontSize: 24,
    textAlign: 'center'
  },
  snapshotInfoBox: {
    marginTop: 12,
    border: `1px solid ${tokens.lineSoft}`,
    borderRadius: 8,
    padding: 12,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    color: tokens.yellow,
    fontSize: 12,
    letterSpacing: '0.06em'
  },
  sheetIdBox: {
    marginTop: 12,
    border: `1px solid ${tokens.lineSoft}`,
    borderRadius: 8,
    padding: 12,
    display: 'grid',
    gap: 8,
    color: tokens.muted,
    wordBreak: 'break-all',
    fontSize: 12
  },
  toast: {
    position: 'fixed',
    left: '50%',
    bottom: 'max(18px, env(safe-area-inset-bottom))',
    transform: 'translateX(-50%)',
    zIndex: 70,
    minWidth: 220,
    maxWidth: 'calc(100vw - 32px)',
    padding: '13px 18px',
    textAlign: 'center',
    color: tokens.green,
    background: 'rgba(3, 8, 10, 0.96)',
    border: `1px solid ${tokens.green}`,
    borderRadius: 999,
    boxShadow: '0 0 24px rgba(60, 245, 138, 0.22)',
    letterSpacing: '0.08em',
    fontSize: 13
  }
}


export default App

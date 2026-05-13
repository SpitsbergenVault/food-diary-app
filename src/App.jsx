import { useEffect, useState, useRef } from 'react'

const GOOGLE_CLIENT_ID =
  '102248618002-qdabmk5jkrc99v5jtga2df4j1ed7mavv.apps.googleusercontent.com'

const GOOGLE_SHEETS_SCOPE =
  'https://www.googleapis.com/auth/spreadsheets'

const RAW_SHEET_NAME = 'RawData'

// Safe localStorage loader
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
    localStorage.setItem(
      'foodEntries',
      JSON.stringify(entries)
    )
  } catch (error) {
    console.error('Failed to save entries:', error)

    alert(
      'Unable to save entries. Storage may be full.'
    )
  }
}

function saveBackup(entries) {
  try {
    localStorage.setItem(
      'foodEntries_backup',
      JSON.stringify({
        timestamp: Date.now(),
        data: entries
      })
    )
  } catch (error) {
    console.error('Backup failed:', error)
  }
}

function convertTimeTo24Hour(timeString) {
  const [time, modifier] = timeString.split(' ')

  let [hours, minutes] = time.split(':')

  hours = parseInt(hours)

  if (modifier === 'PM' && hours !== 12) {
    hours += 12
  }

  if (modifier === 'AM' && hours === 12) {
    hours = 0
  }

  return `${hours
    .toString()
    .padStart(2, '0')}:${minutes}`
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    const dateTimeA = `${a.date}T${convertTimeTo24Hour(
      a.time
    )}`

    const dateTimeB = `${b.date}T${convertTimeTo24Hour(
      b.time
    )}`

    return (
      new Date(dateTimeB) -
      new Date(dateTimeA)
    )
  })
}

function getStoredSpreadsheetId() {
  return localStorage.getItem(
    'foodDiarySpreadsheetId'
  )
}

function storeSpreadsheetId(spreadsheetId) {
  localStorage.setItem(
    'foodDiarySpreadsheetId',
    spreadsheetId
  )
}

function clearStoredSpreadsheetId() {
  localStorage.removeItem(
    'foodDiarySpreadsheetId'
  )
}

function entriesToSheetValues(entries) {
  return [
    ['Date', 'Time', 'Food'],
    ...sortEntries(entries).map(entry => [
      entry.date,
      entry.time,
      entry.food
    ])
  ]
}

function requestGoogleAccessToken() {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(
        new Error(
          'Google Identity Services has not loaded yet.'
        )
      )
      return
    }

    const tokenClient =
      window.google.accounts.oauth2.initTokenClient({
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

    tokenClient.requestAccessToken({
      prompt: ''
    })
  })
}

async function createFoodDiarySpreadsheet(accessToken) {
  const response = await fetch(
    'https://sheets.googleapis.com/v4/spreadsheets',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          title: 'Food Diary'
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
    }
  )

  if (!response.ok) {
    throw new Error(
      'Failed to create spreadsheet'
    )
  }

  return response.json()
}

async function clearRawData(
  accessToken,
  spreadsheetId
) {
  const range = encodeURIComponent(
    `${RAW_SHEET_NAME}!A:C`
  )

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
    throw new Error(
      'Failed to clear existing sheet data'
    )
  }
}

async function updateRawData(
  accessToken,
  spreadsheetId,
  entries
) {
  const range = encodeURIComponent(
    `${RAW_SHEET_NAME}!A1`
  )

  const values = entriesToSheetValues(entries)

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values
      })
    }
  )

  if (!response.ok) {
    throw new Error(
      'Failed to update sheet data'
    )
  }
}

function App() {
  const now = new Date()

  const today = now
    .toISOString()
    .split('T')[0]

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
  const [time, setTime] =
    useState(formattedHour)
  const [food, setFood] = useState('')
  const [showModal, setShowModal] =
    useState(false)
  const [entries, setEntries] = useState(
    loadEntries
  )
  const [showToast, setShowToast] =
    useState(false)
  const [
    spreadsheetId,
    setSpreadsheetId
  ] = useState(getStoredSpreadsheetId)
  const [syncStatus, setSyncStatus] =
    useState('')

  const fileInputRef = useRef(null)

  useEffect(() => {
    saveEntries(entries)
    saveBackup(entries)
  }, [entries])

  function addEntry() {
    const trimmedFood = food.trim()

    if (!trimmedFood) return

    const newEntry = {
      id: crypto.randomUUID(),
      date,
      time,
      food: trimmedFood,
      createdAt: Date.now()
    }

    const updated = sortEntries([
      ...entries,
      newEntry
    ])

    setEntries(updated)
    setShowToast(true)

    setTimeout(() => {
      setShowToast(false)
    }, 2000)

    setFood('')
  }

  function deleteEntry(id) {
    setEntries(
      entries.filter(entry => entry.id !== id)
    )
  }

  async function connectGoogleSheets() {
    try {
      setSyncStatus('Connecting to Google...')

      const accessToken =
        await requestGoogleAccessToken()

      const spreadsheet =
        await createFoodDiarySpreadsheet(
          accessToken
        )

      storeSpreadsheetId(
        spreadsheet.spreadsheetId
      )

      setSpreadsheetId(
        spreadsheet.spreadsheetId
      )

      await updateRawData(
        accessToken,
        spreadsheet.spreadsheetId,
        entries
      )

      setSyncStatus(
        'Google Sheet created and synced.'
      )
    } catch (error) {
      console.error(error)

      setSyncStatus(
        'Google Sheets connection failed.'
      )
    }
  }

  async function syncToGoogleSheets() {
    try {
      if (!spreadsheetId) {
        alert(
          'Please connect Google Sheets first.'
        )
        return
      }

      setSyncStatus('Syncing to Google Sheets...')

      const accessToken =
        await requestGoogleAccessToken()

      await clearRawData(
        accessToken,
        spreadsheetId
      )

      await updateRawData(
        accessToken,
        spreadsheetId,
        entries
      )

      setSyncStatus(
        'Synced to Google Sheets.'
      )
    } catch (error) {
      console.error(error)

      setSyncStatus(
        'Google Sheets sync failed.'
      )
    }
  }

  function disconnectGoogleSheets() {
    clearStoredSpreadsheetId()
    setSpreadsheetId(null)

    setSyncStatus(
      'Google Sheets disconnected from this browser.'
    )
  }

  function restoreLastBackup() {
    try {
      const saved = localStorage.getItem(
        'foodEntries_backup'
      )

      if (!saved) {
        alert('No backup found')
        return
      }

      const parsed = JSON.parse(saved)

      if (
        !parsed?.data ||
        !Array.isArray(parsed.data)
      ) {
        alert('Backup is corrupted')
        return
      }

      const sorted = sortEntries(parsed.data)

      setEntries(sorted)
      saveEntries(sorted)

      alert(
        'Restored last backup successfully!'
      )
    } catch (error) {
      alert('Failed to restore backup')
    }
  }

  function exportToCSV() {
    if (entries.length === 0) {
      alert('No entries to export')
      return
    }

    const headers = ['Date', 'Time', 'Food']

    const rows = sortEntries(entries).map(entry => [
      `"${entry.date}"`,
      `"${entry.time}"`,
      `"${entry.food.replace(/"/g, '""')}"`
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')

    const blob = new Blob([csvContent], {
      type: 'text/csv;charset=utf-8;'
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = 'food-diary.csv'
    link.click()

    URL.revokeObjectURL(url)
  }

  function exportBackup() {
    if (entries.length === 0) {
      alert('No data to export')
      return
    }

    const sorted = sortEntries(entries)

    const blob = new Blob(
      [JSON.stringify(sorted, null, 2)],
      {
        type: 'application/json'
      }
    )

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')

    a.href = url

    a.download = `food-diary-backup-${
      new Date()
        .toISOString()
        .split('T')[0]
    }.json`

    a.click()

    URL.revokeObjectURL(url)
  }

  function importBackup(event) {
    const file = event.target.files[0]

    if (!file) return

    const reader = new FileReader()

    reader.onload = e => {
      try {
        const parsed = JSON.parse(
          e.target.result
        )

        if (!Array.isArray(parsed)) {
          alert('Invalid backup file')
          return
        }

        const sorted = sortEntries(parsed)

        setEntries(sorted)
        saveEntries(sorted)

        alert(
          'Backup restored successfully!'
        )
      } catch (error) {
        alert('Failed to restore backup')
      }
    }

    reader.readAsText(file)
    event.target.value = ''
  }

  function triggerImport() {
    fileInputRef.current?.click()
  }

  const sortedEntries =
    sortEntries(entries)

  const groupedEntries =
    sortedEntries.reduce((groups, entry) => {
      if (!groups[entry.date]) {
        groups[entry.date] = []
      }

      groups[entry.date].push(entry)

      return groups
    }, {})

  return (
    <div
      style={{
        padding: 20,
        fontFamily: 'Arial',
        maxWidth: 500,
        margin: '0 auto'
      }}
    >
      <h1 style={{ textAlign: 'center' }}>
        Food Diary
      </h1>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        onChange={importBackup}
        style={{ display: 'none' }}
      />

      <div style={{ marginBottom: 15 }}>
        <label>Date</label>

        <input
          type="date"
          value={date}
          onChange={e =>
            setDate(e.target.value)
          }
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: 15 }}>
        <label>Time</label>

        <select
          value={time}
          onChange={e =>
            setTime(e.target.value)
          }
          style={inputStyle}
        >
          {[
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
          ].map(hour => (
            <option key={hour} value={hour}>
              {hour}
            </option>
          ))}
        </select>
      </div>

      <textarea
        value={food}
        onChange={e =>
          setFood(e.target.value)
        }
        placeholder="Enter food description"
        rows={4}
        style={{
          ...inputStyle,
          resize: 'none'
        }}
      />

      <button
        onClick={addEntry}
        style={primaryButton}
      >
        Add Entry
      </button>

      <button
        onClick={() => setShowModal(true)}
        style={secondaryButton}
      >
        View Entries
      </button>

      <button
        onClick={exportToCSV}
        style={secondaryButton}
      >
        Export CSV
      </button>

      <button
        onClick={exportBackup}
        style={secondaryButton}
      >
        Export Backup (JSON)
      </button>

      <button
        onClick={triggerImport}
        style={secondaryButton}
      >
        Import Backup (JSON)
      </button>

      <button
        onClick={restoreLastBackup}
        style={secondaryButton}
      >
        Restore Last Auto-Backup
      </button>

      <button
        onClick={connectGoogleSheets}
        style={secondaryButton}
      >
        {spreadsheetId
          ? 'Create New Google Sheet'
          : 'Connect Google Sheets'}
      </button>

      <button
        onClick={syncToGoogleSheets}
        style={secondaryButton}
      >
        Sync to Google Sheets
      </button>

      {spreadsheetId && (
        <button
          onClick={disconnectGoogleSheets}
          style={secondaryButton}
        >
          Disconnect Google Sheets
        </button>
      )}

      {syncStatus && (
        <p style={syncStatusStyle}>
          {syncStatus}
        </p>
      )}

      {spreadsheetId && (
        <p style={sheetConnectedStyle}>
          Connected Sheet ID:
          <br />
          <code>{spreadsheetId}</code>
        </p>
      )}

      {showModal && (
        <div style={modalOverlay}>
          <div style={modalContent}>
            <button
              onClick={() =>
                setShowModal(false)
              }
              style={closeButton}
              aria-label="Close entries modal"
            >
              ×
            </button>

            <h2 style={{ marginTop: 0 }}>
              Entries
            </h2>

            {sortedEntries.length === 0 ? (
              <p>No entries yet.</p>
            ) : (
              Object.entries(groupedEntries).map(
                ([date, items]) => (
                  <div key={date}>
                    <h3>
                      {new Date(
                        `${date}T00:00:00`
                      ).toLocaleDateString()}
                    </h3>

                    {items.map(entry => (
                      <div
                        key={entry.id}
                        style={
                          groupedEntryRow
                        }
                      >
                        <strong>
                          {entry.time}
                        </strong>

                        <span>
                          — {entry.food}
                        </span>

                        <button
                          onClick={() =>
                            deleteEntry(
                              entry.id
                            )
                          }
                          style={
                            smallDeleteButton
                          }
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )
              )
            )}
          </div>
        </div>
      )}

      {showToast && (
        <div style={toastStyle}>
          Entry Added
        </div>
      )}
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: 12,
  fontSize: 16,
  marginTop: 6,
  borderRadius: 10,
  border: '1px solid #ccc'
}

const primaryButton = {
  width: '100%',
  padding: 14,
  fontSize: 18,
  borderRadius: 12,
  backgroundColor: '#007AFF',
  color: 'white',
  border: 'none',
  marginTop: 10
}

const secondaryButton = {
  width: '100%',
  padding: 14,
  fontSize: 18,
  borderRadius: 12,
  backgroundColor: '#444',
  color: 'white',
  border: 'none',
  marginTop: 10
}

const modalOverlay = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.5)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: 20
}

const modalContent = {
  position: 'relative',
  backgroundColor: 'white',
  maxWidth: 500,
  width: '100%',
  maxHeight: '80vh',
  overflowY: 'auto',
  padding: 20,
  paddingTop: 56,
  borderRadius: 16
}

const groupedEntryRow = {
  display: 'flex',
  gap: 8,
  padding: '8px 0',
  borderBottom: '1px solid #eee'
}

const smallDeleteButton = {
  marginLeft: 'auto',
  backgroundColor: 'red',
  color: 'white',
  border: 'none',
  borderRadius: 6
}

const closeButton = {
  position: 'sticky',
  top: 0,
  float: 'right',
  zIndex: 10,
  width: 36,
  height: 36,
  borderRadius: '50%',
  border: 'none',
  backgroundColor: '#eee',
  color: '#333',
  fontSize: 28,
  lineHeight: '36px',
  cursor: 'pointer'
}

const toastStyle = {
  position: 'fixed',
  bottom: 30,
  left: '50%',
  transform: 'translateX(-50%)',
  backgroundColor: '#000',
  color: '#fff',
  padding: 10,
  borderRadius: 20
}

const syncStatusStyle = {
  textAlign: 'center',
  fontSize: 14,
  marginTop: 10
}

const sheetConnectedStyle = {
  textAlign: 'center',
  fontSize: 12,
  color: '#555',
  wordBreak: 'break-all'
}

export default App
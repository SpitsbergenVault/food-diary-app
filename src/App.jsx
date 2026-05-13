import { useEffect, useState, useRef } from 'react'

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

// Primary save
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

// Auto backup
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

// Convert 12h time → 24h
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

// Stable chronological sorting
function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    const dateTimeA = `${a.date}T${convertTimeTo24Hour(
      a.time
    )}`

    const dateTimeB = `${b.date}T${convertTimeTo24Hour(
      b.time
    )}`

    return (
      new Date(dateTimeA) -
      new Date(dateTimeB)
    )
  })
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

  const fileInputRef = useRef(null)

  // Save + backup sync
  useEffect(() => {
    saveEntries(entries)
    saveBackup(entries)
  }, [entries])

  // ADD ENTRY
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

  // DELETE ENTRY
  function deleteEntry(id) {
    setEntries(
      entries.filter(entry => entry.id !== id)
    )
  }

  // RESTORE AUTO BACKUP
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

  // CSV EXPORT
  function exportToCSV() {
    if (entries.length === 0) {
      alert('No entries to export')
      return
    }

    const headers = ['Date', 'Time', 'Food']

    const rows = entries.map(entry => [
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

  // EXPORT BACKUP JSON
  function exportBackup() {
    if (entries.length === 0) {
      alert('No data to export')
      return
    }

    const blob = new Blob(
      [JSON.stringify(entries, null, 2)],
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

  // IMPORT BACKUP
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

  // ALWAYS SORT BEFORE RENDER
  const sortedEntries =
    sortEntries(entries)

  // Group entries by date
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

      {/* hidden import input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        onChange={importBackup}
        style={{ display: 'none' }}
      />

      {/* Date */}
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

      {/* Time */}
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

      {/* Food */}
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

      {/* Modal */}
      {showModal && (
        <div style={modalOverlay}>
          <div style={modalContent}>
            <div
              style={{
                display: 'flex',
                justifyContent:
                  'space-between'
              }}
            >
              <h2>Entries</h2>

              <button
                onClick={() =>
                  setShowModal(false)
                }
                style={closeButton}
              >
                Close
              </button>
            </div>

            {sortedEntries.length === 0 ? (
              <p>No entries yet.</p>
            ) : (
              Object.entries(groupedEntries).map(
                ([date, items]) => (
                  <div key={date}>
                    <h3>
                      {new Date(
                        date
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

      {/* Toast */}
      {showToast && (
        <div style={toastStyle}>
          Entry Added
        </div>
      )}
    </div>
  )
}

// Styles
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
  alignItems: 'center'
}

const modalContent = {
  backgroundColor: 'white',
  maxWidth: 500,
  width: '100%',
  maxHeight: '80vh',
  overflowY: 'auto',
  padding: 20,
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
  backgroundColor: '#444',
  color: 'white',
  border: 'none',
  padding: 8,
  borderRadius: 8
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

export default App
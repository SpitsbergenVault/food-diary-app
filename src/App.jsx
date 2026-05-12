import { useEffect, useState } from 'react'

// Safe localStorage loader
function loadEntries() {
  try {
    const saved = localStorage.getItem('foodEntries')

    if (!saved) {
      return []
    }

    const parsed = JSON.parse(saved)

    // Validate structure
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

// Safe localStorage saver
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

function App() {
  // Create today's date
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

  // Form fields
  const [date, setDate] = useState(today)
  const [time, setTime] = useState(formattedHour)
  const [food, setFood] = useState('')

  // Modal state
  const [showModal, setShowModal] = useState(false)

  // Entries
  const [entries, setEntries] = useState(loadEntries)

  // Toast
  const [showToast, setShowToast] = useState(false)

  // Auto-save whenever entries change
  useEffect(() => {
    saveEntries(entries)
  }, [entries])

  // Add entry
  function addEntry() {
    const trimmedFood = food.trim()

    // Prevent blank entries
    if (!trimmedFood) {
      return
    }

    const newEntry = {
      id: crypto.randomUUID(),
      date,
      time,
      food: trimmedFood,
      createdAt: Date.now()
    }

    const updatedEntries = [...entries, newEntry]

    // Sort newest first
    updatedEntries.sort((a, b) => {
      const dateA = new Date(`${a.date} ${a.time}`)
      const dateB = new Date(`${b.date} ${b.time}`)

      return dateB - dateA
    })

    setEntries(updatedEntries)

    // Show toast
    setShowToast(true)

    setTimeout(() => {
      setShowToast(false)
    }, 2000)

    // Clear field
    setFood('')
  }

  // Export entries to CSV
  function exportToCSV() {
    if (entries.length === 0) {
      alert('No entries to export')
      return
    }

    // CSV headers
    const headers = ['Date', 'Time', 'Food']

    // Convert entries into CSV rows
    const rows = entries.map(entry => [
      `"${entry.date}"`,
      `"${entry.time}"`,
      `"${entry.food.replace(/"/g, '""')}"`
    ])

    // Combine into CSV
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')

    // Create downloadable file
    const blob = new Blob([csvContent], {
      type: 'text/csv;charset=utf-8;'
    })

    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')

    link.href = url
    link.setAttribute('download', 'food-diary.csv')

    document.body.appendChild(link)

    link.click()

    document.body.removeChild(link)

    URL.revokeObjectURL(url)
  }

  // Delete entry
  function deleteEntry(id) {
    const updatedEntries = entries.filter(
      entry => entry.id !== id
    )

    setEntries(updatedEntries)
  }

  // Group entries by date
  const groupedEntries = entries.reduce(
    (groups, entry) => {
      if (!groups[entry.date]) {
        groups[entry.date] = []
      }

      groups[entry.date].push(entry)

      return groups
    },
    {}
  )

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

      {/* Date */}
      <div style={{ marginBottom: 15 }}>
        <label>Date</label>

        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={inputStyle}
        />
      </div>

      {/* Time */}
      <div style={{ marginBottom: 15 }}>
        <label>Time</label>

        <select
          value={time}
          onChange={e => setTime(e.target.value)}
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
      <div style={{ marginBottom: 20 }}>
        <label>Food Eaten</label>

        <textarea
          value={food}
          onChange={e => setFood(e.target.value)}
          placeholder="Enter meal description"
          rows={4}
          style={{
            ...inputStyle,
            resize: 'none',
            width: '100%',
            display: 'block'
          }}
        />
      </div>

      {/* Add Button */}
      <button
        onClick={addEntry}
        style={primaryButton}
      >
        Add Entry
      </button>

      {/* View Entries Button */}
      <button
        onClick={() => setShowModal(true)}
        style={{
          ...secondaryButton,
          marginTop: 12
        }}
      >
        View Entries
      </button>

      {/* Export CSV Button */}
      <button
        onClick={exportToCSV}
        style={{
          ...secondaryButton,
          marginTop: 12
        }}
      >
        Export CSV
      </button>

      {/* Modal */}
      {showModal && (
        <div style={modalOverlay}>
          <div style={modalContent}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 20
              }}
            >
              <h2>Entries</h2>

              <button
                onClick={() => setShowModal(false)}
                style={closeButton}
              >
                Close
              </button>
            </div>

            {entries.length === 0 ? (
              <p>No entries yet.</p>
            ) : (
              Object.entries(groupedEntries).map(
                ([date, dateEntries]) => (
                  <div
                    key={date}
                    style={{ marginBottom: 24 }}
                  >
                    <h3
                      style={{
                        borderBottom: '1px solid #ddd',
                        paddingBottom: 6,
                        marginBottom: 12
                      }}
                    >
                      {new Date(date).toLocaleDateString(
                        'en-US',
                        {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        }
                      )}
                    </h3>

                    {dateEntries.map(entry => (
                      <div
                        key={entry.id}
                        style={groupedEntryRow}
                      >
                        <strong>
                          {entry.time}
                        </strong>

                        <span>
                          — {entry.food}
                        </span>

                        <button
                          onClick={() =>
                            deleteEntry(entry.id)
                          }
                          style={smallDeleteButton}
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
  border: '1px solid #ccc',
  boxSizing: 'border-box'
}

const primaryButton = {
  width: '100%',
  padding: 14,
  fontSize: 18,
  borderRadius: 12,
  border: 'none',
  backgroundColor: '#007AFF',
  color: 'white'
}

const secondaryButton = {
  width: '100%',
  padding: 14,
  fontSize: 18,
  borderRadius: 12,
  border: 'none',
  backgroundColor: '#444',
  color: 'white'
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
  backgroundColor: 'white',
  width: '100%',
  maxWidth: 500,
  maxHeight: '80vh',
  overflowY: 'auto',
  borderRadius: 16,
  padding: 20
}

const groupedEntryRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 0',
  borderBottom: '1px solid #eee',
  flexWrap: 'wrap'
}

const smallDeleteButton = {
  marginLeft: 'auto',
  padding: '6px 10px',
  border: 'none',
  borderRadius: 8,
  backgroundColor: '#ff3b30',
  color: 'white',
  fontSize: 14
}

const closeButton = {
  padding: '8px 14px',
  border: 'none',
  borderRadius: 8,
  backgroundColor: '#444',
  color: 'white'
}

const toastStyle = {
  position: 'fixed',
  bottom: 30,
  left: '50%',
  transform: 'translateX(-50%)',
  backgroundColor: 'rgba(0,0,0,0.8)',
  color: 'white',
  padding: '12px 20px',
  borderRadius: 999,
  fontSize: 16,
  zIndex: 1000
}

export default App
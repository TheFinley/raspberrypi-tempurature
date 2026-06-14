import { useEffect, useState } from 'react'

function App() {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    fetch('/mock_recent_temp.json')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(json => {
        setData(json)
        setStatus('ok')
      })
      .catch(() => setStatus('error'))
  }, [])

  const badge = status === 'ok' ? 'badge-ok' : status === 'error' ? 'badge-error' : 'badge-loading'
  const label = status === 'ok' ? 'Mock data loaded' : status === 'error' ? 'Load failed' : 'Loading…'

  return (
    <div className="app">
      <h1>Pi Telemetry Dashboard</h1>

      <div className="sandbox-status">
        <h2>Milestone 1 — Sandbox Verification</h2>
        <table>
          <tbody>
            <tr>
              <td>Data source</td>
              <td>/mock_recent_temp.json</td>
            </tr>
            <tr>
              <td>Status</td>
              <td><span className={`badge ${badge}`}>{label}</span></td>
            </tr>
            {data && <>
              <tr>
                <td>Data points</td>
                <td>{data.values.length} hourly readings (30 days)</td>
              </tr>
              <tr>
                <td>Current temp</td>
                <td>{data.current_temp} °C</td>
              </tr>
              <tr>
                <td>Last updated</td>
                <td>{data.last_updated}</td>
              </tr>
              <tr>
                <td>Range</td>
                <td>{Math.min(...data.values).toFixed(2)} °C – {Math.max(...data.values).toFixed(2)} °C</td>
              </tr>
              <tr>
                <td>Date span</td>
                <td>{data.labels[0]} → {data.labels[data.labels.length - 1]}</td>
              </tr>
            </>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default App

import { useEffect, useState } from 'react'
import DashboardLayout from './layouts/DashboardLayout.jsx'
import DashboardHeader from './components/DashboardHeader.jsx'
import MetricsGrid from './components/MetricsGrid.jsx'
import MetricCard from './components/MetricCard.jsx'
import AnalyticsContainer from './components/AnalyticsContainer.jsx'
import TelemetryChart from './components/TelemetryChart.jsx'

function getTempStatus(temp) {
  if (temp > 30) return 'critical'
  if (temp > 27) return 'warning'
  return 'nominal'
}

function timeSince(dateStr) {
  const d = new Date(dateStr.replace(/\//g, '-').replace(' ', 'T'))
  const mins = Math.round((Date.now() - d) / 60000)
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 min ago'
  return `${mins} mins ago`
}

function App() {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    fetch(`/mock_recent_temp.json?t=${Date.now()}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(json => { setData(json); setStatus('ok') })
      .catch(() => setStatus('error'))
  }, [])

  if (status === 'loading') return <div className="app-loading">Loading telemetry…</div>
  if (status === 'error')   return <div className="app-error">Failed to load telemetry data.</div>

  const [datePart, timePart] = data.last_updated.split(' ')

  return (
    <DashboardLayout>
      <DashboardHeader />
      <MetricsGrid>
        <MetricCard
          title="Ambient Temperature"
          value={data.current_temp.toFixed(2)}
          unit="°C"
          subtitle={`Last recorded ${timeSince(data.last_updated)}`}
          status={getTempStatus(data.current_temp)}
        />
        <MetricCard
          title="Last Sync"
          value={timePart}
          unit=""
          subtitle={datePart}
          status="nominal"
        />
      </MetricsGrid>
      <AnalyticsContainer>
        <TelemetryChart labels={data.labels} dataPoints={data.values} />
      </AnalyticsContainer>
    </DashboardLayout>
  )
}

export default App

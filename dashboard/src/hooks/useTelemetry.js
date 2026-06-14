import { useState, useEffect, useRef } from 'react'

const DATA_URL = 'https://raw.githubusercontent.com/TheFinley/raspberrypi-temperature/main/data/recent_temp.json'
const POLL_MS  = 5 * 60 * 1000  // 5 minutes — matches Pi cron cadence

export function useTelemetry() {
  const [state, setState] = useState({
    currentTemp:  null,
    lastUpdated:  null,
    chartLabels:  [],
    chartValues:  [],
    syncStatus:   'idle',
    errorMessage: null,
  })

  const lastUpdatedRef = useRef(null)

  useEffect(() => {
    function fetchData() {
      setState(prev => ({ ...prev, syncStatus: 'fetching' }))

      fetch(`${DATA_URL}?t=${Date.now()}`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json()
        })
        .then(json => {
          // Shallow equality — suppress re-render if Pi hasn't pushed new data
          if (json.last_updated === lastUpdatedRef.current) {
            setState(prev => ({ ...prev, syncStatus: 'idle' }))
            return
          }
          lastUpdatedRef.current = json.last_updated
          setState({
            currentTemp:  json.current_temp,
            lastUpdated:  json.last_updated,
            chartLabels:  json.labels,
            chartValues:  json.values,
            syncStatus:   'idle',
            errorMessage: null,
          })
        })
        .catch(err => {
          setState(prev => ({
            ...prev,
            syncStatus:   'error',
            errorMessage: err.message,
          }))
        })
    }

    fetchData()                                 // immediate fetch on mount
    const id = setInterval(fetchData, POLL_MS)  // single permanent interval
    return () => clearInterval(id)
  }, [])  // empty dep array — interval registered once, never recreated

  return state
}

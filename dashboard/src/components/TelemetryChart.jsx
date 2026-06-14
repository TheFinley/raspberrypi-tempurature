import { useEffect, useRef } from 'react'
import {
  Chart,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  LineController,
  Tooltip,
  Filler,
} from 'chart.js'

Chart.register(CategoryScale, LinearScale, LineElement, PointElement, LineController, Tooltip, Filler)

function TelemetryChart({ labels, dataPoints }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  // Mount once — create the Chart.js instance and bind it to the raw canvas
  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d')

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: dataPoints,
          borderColor: '#58a6ff',
          backgroundColor: 'rgba(88, 166, 255, 0.07)',
          borderWidth: 1.5,
          pointRadius: 0,
          fill: true,
          tension: 0.3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#161b22',
            borderColor: '#30363d',
            borderWidth: 1,
            titleColor: '#8b949e',
            bodyColor: '#e6edf3',
            callbacks: {
              label: item => `${item.parsed.y.toFixed(2)} °C`,
            },
          },
        },
        scales: {
          x: {
            ticks: {
              maxTicksLimit: 8,
              color: '#8b949e',
              font: { size: 11 },
            },
            grid: { color: '#30363d' },
          },
          y: {
            ticks: {
              color: '#8b949e',
              font: { size: 11 },
              callback: val => `${val} °C`,
            },
            grid: { color: '#30363d' },
          },
        },
      },
    })

    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [])

  // When data refreshes, update the canvas directly — no React re-render
  useEffect(() => {
    if (!chartRef.current) return
    chartRef.current.data.labels = labels
    chartRef.current.data.datasets[0].data = dataPoints
    chartRef.current.update('none')
  }, [labels, dataPoints])

  return (
    <div className="telemetry-chart">
      <canvas ref={canvasRef} />
    </div>
  )
}

export default TelemetryChart

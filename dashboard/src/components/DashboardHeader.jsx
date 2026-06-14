function DashboardHeader() {
  return (
    <header className="dashboard-header">
      <div>
        <h1 className="dashboard-header__title">Pi Telemetry</h1>
        <span className="dashboard-header__subtitle">
          Raspberry Pi 3B+ · DS18B20 · 1-min cadence · 5-min sync
        </span>
      </div>
      <div className="dashboard-header__tags">
        <span className="tag tag--live">● Live</span>
        <span className="tag">Netlify Edge</span>
      </div>
    </header>
  )
}

export default DashboardHeader

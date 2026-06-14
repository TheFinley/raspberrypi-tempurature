function MetricCard({ title, value, unit, subtitle, status = 'nominal' }) {
  return (
    <div className={`metric-card metric-card--${status}`}>
      <p className="metric-card__title">{title}</p>
      <div className="metric-card__value">
        <span className="metric-card__number">{value}</span>
        {unit && <span className="metric-card__unit">{unit}</span>}
      </div>
      <p className="metric-card__subtitle">{subtitle}</p>
    </div>
  )
}

export default MetricCard

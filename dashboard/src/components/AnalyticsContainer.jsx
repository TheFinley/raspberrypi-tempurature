function AnalyticsContainer({ title = '30-Day Temperature History', children }) {
  return (
    <section className="analytics-container">
      <h2 className="analytics-container__header">{title}</h2>
      {children}
    </section>
  )
}

export default AnalyticsContainer

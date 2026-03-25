export default function Alert({ type = 'error', children, className = '' }) {
  const styles = {
    error: 'bg-red-50 border-red-200 text-red-700',
    success: 'bg-green-50 border-green-200 text-green-700',
    info: 'bg-blue-50 border-blue-200 text-blue-700',
  }
  return (
    <div className={`border rounded-lg p-3 text-sm ${styles[type] ?? styles.error} ${className}`}>
      {children}
    </div>
  )
}

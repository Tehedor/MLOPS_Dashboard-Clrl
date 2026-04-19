const STATUS_STYLES = {
  queued:         'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  waiting_parent: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  dispatching:    'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  running:        'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300',
  success:        'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  failed:         'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  canceled:       'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
}

export default function StatusBadge({ status }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[status] ?? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}
    >
      {status}
    </span>
  )
}

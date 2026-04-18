const STATUS_STYLES = {
  queued:         'bg-yellow-900 text-yellow-300',
  waiting_parent: 'bg-orange-900 text-orange-300',
  dispatching:    'bg-blue-900 text-blue-300',
  running:        'bg-cyan-900 text-cyan-300',
  success:        'bg-green-900 text-green-300',
  failed:         'bg-red-900 text-red-300',
  canceled:       'bg-gray-700 text-gray-300',
}

export default function StatusBadge({ status }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[status] ?? 'bg-gray-700 text-gray-300'}`}
    >
      {status}
    </span>
  )
}

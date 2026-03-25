export default function MessageBubble({ message, currentUserId }) {
  const isMine = message.sender_id === currentUserId
  const senderName = message.sender?.full_name ?? 'Unknown'
  const time = new Date(message.created_at).toLocaleString()

  return (
    <div className={`flex flex-col gap-1 ${isMine ? 'items-end' : 'items-start'}`}>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="font-medium">{senderName}</span>
        {message.is_internal && (
          <span className="bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded text-xs font-medium">
            Internal Note
          </span>
        )}
        <span>{time}</span>
      </div>
      <div
        className={`max-w-lg px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
          message.is_internal
            ? 'bg-yellow-50 border border-yellow-200 text-yellow-900'
            : isMine
            ? 'bg-primary text-white'
            : 'bg-gray-100 text-gray-900'
        }`}
      >
        {message.content}
      </div>
    </div>
  )
}

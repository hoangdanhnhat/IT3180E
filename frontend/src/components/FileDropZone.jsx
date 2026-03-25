import { useDropzone } from 'react-dropzone'

const ACCEPTED = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
}

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

export default function FileDropZone({ files, setFiles }) {
  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    accept: ACCEPTED,
    maxSize: MAX_SIZE,
    onDrop: (accepted) => setFiles((prev) => [...prev, ...accepted]),
  })

  const remove = (index) => setFiles((prev) => prev.filter((_, i) => i !== index))

  return (
    <div className="space-y-2">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-primary bg-indigo-50'
            : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
        }`}
      >
        <input {...getInputProps()} />
        <p className="text-sm text-gray-500">
          {isDragActive ? 'Drop files here…' : 'Drag & drop files or click to browse'}
        </p>
        <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, GIF, WEBP — max 10 MB each</p>
      </div>

      {fileRejections.length > 0 && (
        <p className="text-xs text-red-600">{fileRejections[0].errors[0].message}</p>
      )}

      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li
              key={i}
              className="flex items-center justify-between text-sm bg-gray-50 px-3 py-2 rounded-lg"
            >
              <span className="truncate text-gray-700">{f.name}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-red-500 hover:text-red-700 ml-2 shrink-0 text-xs font-medium"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const SIZES = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' }

export default function Spinner({ size = 'md' }) {
  return (
    <span
      className={`inline-block border-2 border-primary border-t-transparent rounded-full animate-spin ${SIZES[size] ?? SIZES.md}`}
    />
  )
}

import { useState, useEffect, useCallback } from 'react'
import { listFaqs, listFaqCategories, getFaq, createFaq, deleteFaq } from '../../api/faq'
import { useAuthStore } from '../../store/authStore'
import Spinner from '../../components/ui/Spinner'

/* ─── helpers ───────────────────────────────────────────────────── */

function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

/* ─── tiny UI atoms ─────────────────────────────────────────────── */

function Tag({ label }) {
  return (
    <span className="inline-block bg-indigo-50 text-indigo-700 text-xs font-medium px-2 py-0.5 rounded-full border border-indigo-100">
      {label}
    </span>
  )
}

function CategoryChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs font-medium rounded-full border transition-all ${
        active
          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
          : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
      }`}
    >
      {label}
    </button>
  )
}

/* ─── Detail Modal ──────────────────────────────────────────────── */

function FaqDetailModal({ faqId, onClose }) {
  const [faq, setFaq] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true); setError(null)
    getFaq(faqId)
      .then(setFaq)
      .catch(() => setError('Could not load this FAQ.'))
      .finally(() => setLoading(false))
  }, [faqId])

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-4 p-6 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="h-5 w-48 bg-gray-100 rounded animate-pulse" />
            ) : faq ? (
              <>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="inline-block bg-violet-100 text-violet-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                    {faq.category}
                  </span>
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    {faq.view_count}
                  </span>
                </div>
                <h2 className="text-lg font-semibold text-gray-900 leading-snug">{faq.question}</h2>
              </>
            ) : null}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 mt-0.5" aria-label="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {loading && <div className="flex justify-center py-12"><Spinner /></div>}
          {error && <p className="text-red-500 text-sm text-center py-8">{error}</p>}
          {!loading && faq && (
            <>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{faq.answer}</p>
              {faq.tags?.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {faq.tags.map((t) => <Tag key={t} label={t} />)}
                </div>
              )}
              <p className="mt-5 text-xs text-gray-400">ID: <span className="font-mono select-all">{faq.id}</span></p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Create FAQ Modal (admin) ──────────────────────────────────── */

const EMPTY_FORM = { question: '', answer: '', category: '', tags: '', is_active: true }

function CreateFaqModal({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.question.trim() || !form.answer.trim() || !form.category.trim()) {
      setError('Question, answer and category are required.')
      return
    }
    setSaving(true); setError(null)
    try {
      const tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean)
      const created = await createFaq({ ...form, tags })
      onCreated(created)
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create FAQ.')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent'
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Create FAQ</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          <div>
            <label className={labelCls}>Question *</label>
            <input value={form.question} onChange={set('question')} maxLength={500} required placeholder="Enter the question…" className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Answer *</label>
            <textarea value={form.answer} onChange={set('answer')} required rows={5} placeholder="Enter the answer…" className={`${inputCls} resize-none`} />
          </div>

          <div>
            <label className={labelCls}>Category *</label>
            <input value={form.category} onChange={set('category')} maxLength={100} required placeholder="e.g. Billing, Route, General…" className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Tags <span className="text-gray-400 font-normal">(comma-separated)</span></label>
            <input value={form.tags} onChange={set('tags')} placeholder="e.g. refund, payment, bus" className={inputCls} />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input type="checkbox" checked={form.is_active} onChange={set('is_active')} className="rounded accent-indigo-600" />
            Active (visible to all users)
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating…' : 'Create FAQ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── FAQ Card ──────────────────────────────────────────────────── */

function FaqCard({ faq, isAdmin, onClick, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete(e) {
    e.stopPropagation()
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    try {
      await deleteFaq(faq.id)
      onDelete(faq.id)
    } catch {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <article
      className="group relative bg-white rounded-xl border border-gray-200 p-5
                 hover:border-indigo-300 hover:shadow-md transition-all duration-200"
    >
      {/* admin delete */}
      {isAdmin && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          title={confirmDelete ? 'Click again to confirm delete' : 'Delete FAQ'}
          className={`absolute top-3 right-3 z-10 flex items-center gap-1 px-2 py-1 text-xs rounded-md border transition-all
            ${confirmDelete
              ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
              : 'text-gray-400 border-transparent hover:text-red-500 hover:border-red-200 hover:bg-red-50 opacity-0 group-hover:opacity-100'}
          `}
        >
          {deleting ? (
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          )}
          {confirmDelete ? 'Confirm' : 'Delete'}
        </button>
      )}

      {/* card body — clickable */}
      <div onClick={onClick} className="cursor-pointer">
        <div className="flex items-center gap-2 flex-wrap mb-3 pr-16">
          <span className="inline-block bg-violet-100 text-violet-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
            {faq.category}
          </span>
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            {faq.view_count}
          </span>
        </div>

        <h3 className="text-sm font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors line-clamp-2 mb-2 leading-snug">
          {faq.question}
        </h3>

        <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed mb-3">
          {faq.answer}
        </p>

        {faq.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {faq.tags.slice(0, 4).map((t) => <Tag key={t} label={t} />)}
            {faq.tags.length > 4 && <span className="text-xs text-gray-400">+{faq.tags.length - 4}</span>}
          </div>
        )}
      </div>
    </article>
  )
}

/* ─── Empty State ───────────────────────────────────────────────── */
function EmptyState({ hasQuery }) {
  return (
    <div className="col-span-full flex flex-col items-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
        </svg>
      </div>
      <p className="text-gray-600 font-medium">{hasQuery ? 'No results found' : 'No FAQs yet'}</p>
      <p className="text-gray-400 text-sm mt-1">{hasQuery ? 'Try a different keyword or category' : 'FAQs will appear here once created'}</p>
    </div>
  )
}

/* ─── Main Page ─────────────────────────────────────────────────── */

export default function FaqPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  const [faqs, setFaqs]               = useState([])
  const [categories, setCategories]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [searchText, setSearchText]   = useState('')
  const [searchId, setSearchId]       = useState('')
  const [activeCategory, setActiveCategory] = useState('')
  const [selectedId, setSelectedId]   = useState(null)
  const [showCreate, setShowCreate]   = useState(false)

  const debouncedText = useDebounce(searchText, 350)
  const debouncedId   = useDebounce(searchId,   300)

  // Load categories once
  useEffect(() => {
    listFaqCategories().then(setCategories).catch(() => {})
  }, [])

  // Load FAQs on filter change
  useEffect(() => {
    setLoading(true); setError(null)
    const params = {}
    if (debouncedText.trim()) params.q        = debouncedText.trim()
    if (activeCategory)        params.category = activeCategory

    listFaqs(params)
      .then((data) => {
        if (debouncedId.trim()) {
          const needle = debouncedId.trim().toLowerCase()
          setFaqs(data.filter((f) => f.id.toLowerCase().includes(needle)))
        } else {
          setFaqs(data)
        }
      })
      .catch(() => setError('Failed to load FAQs. Please try again.'))
      .finally(() => setLoading(false))
  }, [debouncedText, debouncedId, activeCategory])

  const handleDelete  = useCallback((id) => setFaqs((prev) => prev.filter((f) => f.id !== id)), [])
  const handleCreated = useCallback((faq) => {
    setFaqs((prev) => [faq, ...prev])
    // refresh categories if new one appeared
    listFaqCategories().then(setCategories).catch(() => {})
  }, [])

  const hasQuery = debouncedText.trim() || debouncedId.trim() || activeCategory

  return (
    <div>
      {/* ── Header row ── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Frequently Asked Questions</h1>
          <p className="text-sm text-gray-500 mt-1">Search by keyword, ID, or browse by category.</p>
        </div>
        {isAdmin && (
          <button
            id="faq-create-btn"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600
                       rounded-lg hover:bg-indigo-700 active:bg-indigo-800 transition-colors shadow-sm flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Create FAQ
          </button>
        )}
      </div>

      {/* ── Search inputs ── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            id="faq-search-text"
            type="search"
            placeholder="Search by keyword…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg bg-white
                       focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
          />
        </div>
        <div className="relative sm:w-60">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0" />
          </svg>
          <input
            id="faq-search-id"
            type="search"
            placeholder="Filter by ID…"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg bg-white font-mono
                       focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
          />
        </div>
      </div>

      {/* ── Category chips ── */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <CategoryChip label="All" active={activeCategory === ''} onClick={() => setActiveCategory('')} />
          {categories.map((cat) => (
            <CategoryChip
              key={cat}
              label={cat}
              active={activeCategory === cat}
              onClick={() => setActiveCategory(cat === activeCategory ? '' : cat)}
            />
          ))}
        </div>
      )}

      {/* ── Count ── */}
      {!loading && !error && (
        <p className="text-xs text-gray-400 mb-4">
          {faqs.length} result{faqs.length !== 1 ? 's' : ''}{hasQuery ? ' for current filters' : ''}
        </p>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* ── Grid ── */}
      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {faqs.length === 0 ? (
            <EmptyState hasQuery={hasQuery} />
          ) : (
            faqs.map((faq) => (
              <FaqCard
                key={faq.id}
                faq={faq}
                isAdmin={isAdmin}
                onClick={() => setSelectedId(faq.id)}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {selectedId && <FaqDetailModal faqId={selectedId} onClose={() => setSelectedId(null)} />}
      {showCreate  && <CreateFaqModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
    </div>
  )
}

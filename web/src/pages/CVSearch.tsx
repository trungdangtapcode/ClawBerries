import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Search,
  Upload,
  FileText,
  MoreHorizontal,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  PlusCircle,
  ArrowUpDown,
  File,
  Download,
  ExternalLink,
} from "lucide-react"
import { cn } from "@/lib/utils"

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001"
const ACCEPTED_TYPES = ".pdf,.doc,.docx,.txt,.rtf"

// ── Types ─────────────────────────────────────────────────────────────────────
interface CVFile {
  id: string
  name: string
  type: string
  candidateName: string | null
  candidateEmail: string | null
  status: string
  overallRating: string | null
  date: string
  completedAt: string | null
  tags: string[]
}

const typeConfig: Record<string, { bg: string; text: string; label: string }> = {
  pdf: { bg: "bg-red-50", text: "text-red-600", label: "PDF Document" },
  docx: { bg: "bg-blue-50", text: "text-blue-600", label: "Word Doc" },
  doc: { bg: "bg-blue-50", text: "text-blue-600", label: "Word Doc" },
  txt: { bg: "bg-orange-50", text: "text-orange-600", label: "Text File" },
  rtf: { bg: "bg-orange-50", text: "text-orange-600", label: "Rich Text" },
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  return `${weeks}w ago`
}

// ── File Preview Modal ────────────────────────────────────────────────────────
interface PreviewFile { id: string; name: string; type: string }

function FilePreviewModal({ file, onClose }: { file: PreviewFile; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null)
  const [textLoading, setTextLoading] = useState(false)
  const fileUrl = `${API_BASE}/api/cv-file/${file.id}`

  useEffect(() => {
    if (file.type === "txt") {
      setTextLoading(true)
      fetch(fileUrl)
        .then((r) => r.text())
        .then((t) => setText(t))
        .catch(() => setText("Could not load file content."))
        .finally(() => setTextLoading(false))
    }
  }, [file.id, file.type, fileUrl])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  const cfg = typeConfig[file.type] || typeConfig["pdf"]!

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 flex flex-col w-full max-w-4xl h-[85vh] bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-outline-variant/10 shrink-0">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", cfg.bg, cfg.text)}>
            {file.type === "txt" ? <File className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-on-surface text-sm truncate">{file.name}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-outline">{cfg.label}</p>
          </div>
          <a
            href={fileUrl}
            download={file.name}
            className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant hover:text-primary transition-colors px-3 py-1.5 rounded-lg hover:bg-surface-container-low"
          >
            <Download className="h-4 w-4" /> Download
          </a>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-container rounded-xl text-outline transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {file.type === "pdf" ? (
            <iframe
              src={fileUrl}
              title={file.name}
              className="w-full h-full border-0"
            />
          ) : file.type === "txt" ? (
            <div className="h-full overflow-auto p-6">
              {textLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <pre className="font-mono text-sm text-on-surface whitespace-pre-wrap break-words">{text}</pre>
              )}
            </div>
          ) : (
            /* DOC/DOCX — offer Google Docs view or download */
            <div className="flex flex-col items-center justify-center h-full gap-4 text-on-surface-variant">
              <FileText className="h-16 w-16 opacity-20" />
              <p className="text-sm font-semibold text-center">
                {file.name.toUpperCase().includes("DOCX") ? "Word documents" : "This file type"} can't be previewed in the browser.
              </p>
              <div className="flex gap-3">
                <a
                  href={`https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline uppercase tracking-widest"
                >
                  <ExternalLink className="h-4 w-4" /> Open with Google Docs
                </a>
                <a
                  href={fileUrl}
                  download={file.name}
                  className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline uppercase tracking-widest"
                >
                  <Download className="h-4 w-4" /> Download
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function CVSearch() {
  const [searchQuery, setSearchQuery] = useState("")
  const [files, setFiles] = useState<CVFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null)
  const [searchResults, setSearchResults] = useState<CVFile[] | null>(null) // null = not searching
  const [searching, setSearching] = useState(false)

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Fetch files ──────────────────────────────────────────────────────────
  const fetchFiles = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/cv-library`)
      if (!res.ok) throw new Error("API error")
      const data = await res.json()
      setFiles(data.files ?? [])
    } catch {
      setError("Could not load CV library. Make sure the API server and database are running.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchFiles() }, [fetchFiles])

  // ── Upload handler ───────────────────────────────────────────────────────
  const uploadFiles = useCallback(async (fileList: FileList | File[]) => {
    const filesToUpload = Array.from(fileList)
    if (filesToUpload.length === 0) return

    setUploading(true)
    setUploadResult(null)

    try {
      const formData = new FormData()
      for (const file of filesToUpload) {
        formData.append("files", file, file.name)
      }

      const res = await fetch(`${API_BASE}/api/cv-upload`, {
        method: "POST",
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setUploadResult({ ok: false, message: data.error || "Upload failed" })
        return
      }

      setUploadResult({
        ok: true,
        message: `Successfully uploaded ${data.count} file${data.count !== 1 ? "s" : ""}`,
      })

      await fetchFiles()
    } catch {
      setUploadResult({ ok: false, message: "Upload failed. Check that the API server is running." })
    } finally {
      setUploading(false)
      setTimeout(() => setUploadResult(null), 4000)
    }
  }, [fetchFiles])

  const openFilePicker = () => fileInputRef.current?.click()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files)
      e.target.value = ""
    }
  }

  // ── Drag and drop ───────────────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false) }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files)
  }

  // ── Client-side filtering ────────────────────────────────────────────────
  const filteredFiles = searchResults !== null
    ? searchResults // backend search results override
    : files.filter((f) => {
      const q = searchQuery.toLowerCase()
      return !q || f.name.toLowerCase().includes(q) || (f.candidateName?.toLowerCase().includes(q) ?? false)
    })

  // ── Debounced backend text search ────────────────────────────────────────
  useEffect(() => {
    const q = searchQuery.trim()
    if (q.length < 2) {
      setSearchResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/cv-search?q=${encodeURIComponent(q)}`)
        if (!res.ok) throw new Error("Search failed")
        const data = await res.json()
        setSearchResults(data.files ?? [])
      } catch {
        setSearchResults(null) // fall back to client-side filter
      } finally {
        setSearching(false)
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [searchQuery])

  return (
    <div className="flex min-h-[calc(100vh-64px)]">
      {/* File preview modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES} multiple className="hidden" onChange={handleFileChange} />

      {/* Upload toast notification */}
      {(uploading || uploadResult) && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-3 shadow-lg border border-outline-variant/10">
            {uploading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
                <span className="text-sm font-semibold">Uploading…</span>
              </>
            ) : uploadResult?.ok ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-tertiary-container shrink-0" />
                <span className="text-sm font-semibold">{uploadResult.message}</span>
                <button onClick={() => setUploadResult(null)} className="ml-2">
                  <X className="h-4 w-4 text-on-surface-variant" />
                </button>
              </>
            ) : (
              <>
                <AlertCircle className="h-5 w-5 text-error shrink-0" />
                <span className="text-sm font-semibold text-error">{uploadResult?.message}</span>
                <button onClick={() => setUploadResult(null)} className="ml-2">
                  <X className="h-4 w-4 text-on-surface-variant" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Main content ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-bold font-heading text-on-surface">Personal File Library</h2>
        </header>

        {/* Search bar */}
        <div className="mt-6 mb-12 flex justify-center w-full">
          <div className="relative w-full max-w-2xl group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-outline group-focus-within:text-primary transition-colors" />
            <input
              className="w-full pl-14 pr-14 py-5 bg-white border-none rounded-2xl text-lg shadow-sm focus:outline-none focus:ring-4 focus:ring-primary/5 placeholder:text-outline/50 transition-all font-body"
              placeholder="Search CVs by name, skills, company, or any content…"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {/* Search spinner or clear button */}
            {searching ? (
              <Loader2 className="absolute right-5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
            ) : searchQuery ? (
              <button
                onClick={() => { setSearchQuery(""); setSearchResults(null) }}
                className="absolute right-5 top-1/2 -translate-y-1/2 h-4 w-4 text-outline hover:text-on-surface transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        {/* File count + sort bar */}
        <div className="flex items-center justify-between mb-6 px-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-on-surface">All Files</span>
            <span className="text-xs font-medium text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-full">
              {loading ? "…" : filteredFiles.length}
            </span>
          </div>
          <button className="flex items-center gap-1 text-xs font-bold text-on-surface-variant hover:text-primary transition-colors">
            <ArrowUpDown className="h-3.5 w-3.5" />
            Name
          </button>
        </div>

        {/* ── File grid ──────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 text-on-surface-variant">
            <AlertCircle className="mb-4 h-12 w-12 text-error opacity-60" />
            <p className="text-sm font-semibold text-error">{error}</p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-on-surface-variant">
            <FileText className="mb-4 h-12 w-12 opacity-20" />
            <p className="text-sm font-semibold">No CVs found</p>
            <p className="mt-1 text-xs">
              {searchQuery ? "Try a different search term." : "Upload some CVs to get started."}
            </p>
            <button
              onClick={openFilePicker}
              className="mt-4 text-primary font-bold text-xs hover:underline uppercase tracking-widest"
            >
              Upload CVs
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredFiles.map((file) => {
              const cfg = typeConfig[file.type] || typeConfig["pdf"]!
              return (
                <div
                  key={file.id}
                  onClick={() => setPreviewFile({ id: file.id, name: file.name, type: file.type })}
                  className="bg-white p-5 rounded-2xl border border-outline-variant/10 group cursor-pointer transition-all hover:shadow-md"
                  style={{
                    boxShadow: "0 1px 3px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.04)",
                  }}
                >
                  <div className="flex flex-col gap-4">
                    {/* File type icon */}
                    <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", cfg.bg, cfg.text)}>
                      {file.type === "pdf" ? (
                        <FileText className="h-7 w-7" />
                      ) : file.type === "txt" ? (
                        <File className="h-7 w-7" />
                      ) : (
                        <FileText className="h-7 w-7" />
                      )}
                    </div>

                    {/* File info */}
                    <div className="flex-1 min-w-0">
                      <h3
                        className="font-bold text-on-surface truncate group-hover:text-primary transition-colors text-sm"
                        title={file.name}
                      >
                        {file.name}
                      </h3>
                      <p className="text-[11px] text-on-surface-variant mt-1 font-medium">
                        {file.candidateName ? `${file.candidateName} • ` : ""}
                        Added {timeAgo(file.date)}
                      </p>
                    </div>

                    {/* Footer */}
                    <div className="flex justify-between items-center pt-2 border-t border-outline-variant/5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
                        {cfg.label}
                      </span>
                      <button className="p-1 hover:bg-surface-container rounded-lg text-outline transition-colors">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Drag and drop zone ─────────────────────────────────────── */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={openFilePicker}
          className={cn(
            "mt-12 flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-3xl cursor-pointer transition-all",
            isDragOver
              ? "border-primary bg-primary-fixed/10 scale-[1.01]"
              : "border-outline-variant/20 hover:border-primary/20"
          )}
        >
          {uploading ? (
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          ) : (
            <PlusCircle className={cn("h-12 w-12 mb-4", isDragOver ? "text-primary" : "text-outline-variant")} />
          )}
          <p className={cn("text-sm font-semibold", isDragOver ? "text-primary" : "text-on-surface-variant")}>
            {isDragOver ? "Drop files here to upload" : "Drag and drop more files to your library"}
          </p>
          <button
            className="mt-4 text-primary font-bold text-xs hover:underline uppercase tracking-widest"
            onClick={(e) => { e.stopPropagation(); openFilePicker() }}
          >
            Browse local files
          </button>
        </div>

        {/* Mobile upload button (only visible on <lg) */}
        <div className="lg:hidden mt-6">
          <Button onClick={openFilePicker} disabled={uploading} className="w-full">
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {uploading ? "Uploading…" : "Upload CVs"}
          </Button>
        </div>
      </div>
    </div>
  )
}

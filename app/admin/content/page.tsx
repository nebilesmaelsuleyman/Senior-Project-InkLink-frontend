'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Eye, Search, Trash2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { AdminDashboardService, type AdminContentDto } from '@/app/services/admin-dashboard.service'
import { useAuthStore } from '@/app/store/authstore'
import { extractApiErrorMessage } from '@/lib/api'
import { toast } from 'sonner'
import { cn } from '@/lib/cn'

export default function AdminContentPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const [chapters, setChapters] = useState<AdminContentDto[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState<'success' | 'warning' | 'fail'>('success')
  const [selectedChapter, setSelectedChapter] = useState<AdminContentDto | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.replace('/dashboard')
    }
  }, [router, user])

  useEffect(() => {
    if (user?.role !== 'admin') return

    const run = async () => {
      try {
        setError(null)
        setChapters(await AdminDashboardService.getContent())
      } catch (e) {
        setError(extractApiErrorMessage(e, 'Failed to load content'))
      }
    }

    void run()
  }, [user?.role])

  const filteredChapters = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase()
    return chapters.filter((chapter) => {
      const matchesSearch =
        !needle ||
        chapter.title.toLowerCase().includes(needle) ||
        chapter.author.toLowerCase().includes(needle) ||
        chapter.workTitle.toLowerCase().includes(needle) ||
        chapter.content.toLowerCase().includes(needle)

      return matchesSearch && chapter.status === activeTab
    })
  }, [activeTab, chapters, searchTerm])

  const statusCounts = useMemo(
    () => ({
      success: chapters.filter((entry) => entry.status === 'success').length,
      warning: chapters.filter((entry) => entry.status === 'warning').length,
      fail: chapters.filter((entry) => entry.status === 'fail').length,
    }),
    [chapters],
  )

  const handleDeleteChapter = async (chapterId: string) => {
    const confirmed = window.confirm('Delete this chapter?')
    if (!confirmed) return

    try {
      await AdminDashboardService.deleteContent(chapterId)
      setChapters((prev) => prev.filter((entry) => entry.id !== chapterId))
      if (selectedChapter?.id === chapterId) {
        setSelectedChapter(null)
      }
      toast.success('Chapter deleted')
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Failed to delete chapter'))
    }
  }

  const handlePublishChapter = async (chapterId: string) => {
    try {
      await AdminDashboardService.publishContent(chapterId)
      setChapters((prev) =>
        prev.map((entry) =>
          entry.id === chapterId ? { ...entry, status: 'success' as const } : entry,
        ),
      )
      setSelectedChapter((prev) =>
        prev && prev.id === chapterId ? { ...prev, status: 'success' } : prev,
      )
      toast.success('Chapter published')
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Failed to publish chapter'))
    }
  }

  if (!user || user.role !== 'admin') return null

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950 transition-colors duration-300">
      <div className="sticky top-0 z-20 border-b bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-neutral-200 dark:border-neutral-800">
        <div className="w-full px-6 py-8">
          <Link
            href="/admin"
            className="mb-4 inline-flex items-center gap-2 text-primary transition-all hover:opacity-80"
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="text-sm font-black uppercase tracking-widest">Back</span>
          </Link>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white">Content</h1>
            <p className="mt-1 text-sm font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">{chapters.length} total chapters</p>
            {error && <p className="mt-2 text-sm font-bold text-red-500">{error}</p>}
          </div>
        </div>
      </div>

      <div className="w-full px-6 py-12">
        <div className="mb-12 flex flex-col gap-6">
          <div className="relative max-w-md group">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400 group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder="Search chapters, works, authors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-2xl border border-neutral-200 bg-white py-4 pl-12 pr-4 text-base transition-all outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:focus:border-primary"
            />
          </div>

          <div className="flex flex-wrap gap-2 p-1 w-fit rounded-2xl bg-neutral-200/50 dark:bg-neutral-800/50">
            {([
              ['success', 'Published'],
              ['warning', 'Pending'],
              ['fail', 'Failed'],
            ] as const).map(([status, label]) => (
              <button
                key={status}
                onClick={() => setActiveTab(status)}
                className={cn(
                  "px-6 py-2.5 font-bold text-xs rounded-xl transition-all duration-300 uppercase tracking-widest",
                  activeTab === status
                    ? "bg-white dark:bg-neutral-700 text-primary shadow-sm"
                    : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400"
                )}
              >
                {label} ({statusCounts[status]})
              </button>
            ))}
          </div>
        </div>

        {filteredChapters.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {filteredChapters.map((chapter) => (
              <div
                key={chapter.id}
                className="group relative overflow-hidden rounded-3xl border border-neutral-200 bg-white p-6 transition-all duration-300 hover:shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-bold text-neutral-900 dark:text-white">{chapter.title}</h3>
                      <span
                        className={cn(
                          "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest",
                          chapter.status === 'success'
                            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
                            : chapter.status === 'warning'
                              ? "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
                              : "bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400"
                        )}
                      >
                        {chapter.status === 'success'
                          ? 'Live'
                          : chapter.status === 'warning'
                            ? 'Review'
                            : 'Failed'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                      <span className="font-black text-primary uppercase tracking-wider">{chapter.workTitle}</span>
                      <span className="mx-2 text-neutral-300">/</span>
                      <span className="text-neutral-900 dark:text-white">@{chapter.author}</span>
                    </p>
                    <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400 italic">
                      "{chapter.content || 'No description provided.'}"
                    </p>
                    <div className="mt-4 flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                      <span>Ref ID: {chapter.id.slice(-6)}</span>
                      <span className="h-1 w-1 rounded-full bg-neutral-300" />
                      <span>{new Date(chapter.publishedAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-2">
                    <button
                      onClick={() => setSelectedChapter(chapter)}
                      className="rounded-xl border border-neutral-200 bg-white p-3 text-neutral-600 transition-all hover:bg-neutral-50 hover:text-primary dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400"
                      title="Preview content"
                    >
                      <Eye className="h-5 w-5" />
                    </button>
                    {chapter.status !== 'success' && (
                      <button
                        onClick={() => void handlePublishChapter(chapter.id)}
                        className="rounded-xl bg-primary px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95"
                      >
                        Approve
                      </button>
                    )}
                    <button
                      onClick={() => void handleDeleteChapter(chapter.id)}
                      className="rounded-xl border border-neutral-200 bg-white p-3 text-neutral-400 transition-all hover:bg-rose-50 hover:text-rose-600 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-rose-900/20"
                      title="Delete entry"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-neutral-200 py-32 text-center dark:border-neutral-800">
            <p className="text-2xl font-black text-neutral-900 dark:text-white">No content found</p>
            <p className="mt-2 text-neutral-500 dark:text-neutral-400">Try adjusting your filters or search keywords.</p>
          </div>
        )}
      </div>

      {/* Modal Overlay */}
      {selectedChapter && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300"
          onClick={() => setSelectedChapter(null)}
        >
          <div 
            className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-[2.5rem] bg-white shadow-2xl dark:bg-neutral-900 animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-neutral-100 px-8 py-8 dark:border-neutral-800">
              <div className="space-y-1">
                <h2 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white">{selectedChapter.title}</h2>
                <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-primary">
                  <span>{selectedChapter.workTitle}</span>
                  <span className="text-neutral-300">by</span>
                  <span className="text-neutral-600 dark:text-neutral-300">@{selectedChapter.author}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedChapter(null)}
                className="rounded-2xl bg-neutral-100 p-3 text-neutral-500 transition-all hover:bg-neutral-200 hover:text-neutral-900 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-white"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="max-h-[calc(90vh-140px)] overflow-y-auto px-10 py-10">
              <div className="prose prose-neutral dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap text-lg leading-relaxed text-neutral-700 dark:text-neutral-300">
                  {selectedChapter.content || 'This chapter has no content body.'}
                </p>
              </div>
            </div>
            <div className="border-t border-neutral-100 p-6 flex justify-end dark:border-neutral-800">
               <button 
                onClick={() => setSelectedChapter(null)}
                className="px-8 py-3 rounded-2xl bg-primary text-white font-black uppercase tracking-widest text-xs"
               >
                 Close Preview
               </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

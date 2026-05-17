'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Bell, Plus, User, BookOpen, Crown, LogOut, Shield, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/app/store/authstore'
import { EditorWorksService, WorkDto } from '@/app/services/editor-works.service'
import { libraryService } from '@/app/services/library.service'
import { PostsService, PostDto } from '@/app/services/posts.service'
import { Clock, Heart as HeartIcon, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

export default function HomePage() {
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [continueReading, setContinueReading] = useState<any[]>([])
  const [topPicks, setTopPicks] = useState<WorkDto[]>([])
  const [topRated, setTopRated] = useState<WorkDto[]>([])
  const [feed, setFeed] = useState<PostDto[]>([])
  const [isFeedLoading, setIsFeedLoading] = useState(false)

  // Search State
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<WorkDto[]>([])
  const [isSearchLoading, setIsSearchLoading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)

  const fetchData = async () => {
    try {
      setLoading(true)
      const [lib, works] = await Promise.all([
        libraryService.getLibrary().catch(() => null),
        EditorWorksService.browse(),
      ])

      if (lib?.currentlyReading) {
        const uniqueReads = new Map();
        for (const item of lib.currentlyReading) {
          const wId = item.workId?._id || item.workId;
          if (!uniqueReads.has(wId)) {
            uniqueReads.set(wId, item);
          }
        }
        
        setContinueReading(Array.from(uniqueReads.values()).slice(0, 4).map((item: any) => ({
          id: item.workId?._id || item.workId,
          title: item.workId?.title || 'Unknown',
          author: item.workId?.authorId?.username || 'Author',
          image: item.workId?.coverImage || 'https://images.unsplash.com/photo-1507842217343-583f20270319?w=300&h=450&fit=crop',
          progress: item.progress || 0,
        })))
      }

      if (works) {
        // Shuffle works to make the "Top Picks" dynamic for the session
        const shuffled = [...works].sort(() => Math.random() - 0.5)
        setTopPicks(shuffled.slice(0, 4)) // Show 1 row of 4

        // Sort by averageRating descending for Top Rated
        const rated = [...works].sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0))
        setTopRated(rated.slice(0, 4))
      }

      // Fetch Feed
      if (user) {
        setIsFeedLoading(true)
        PostsService.getFeed()
          .then(setFeed)
          .catch(err => console.error('Failed to fetch feed:', err))
          .finally(() => setIsFeedLoading(false))
      }
    } catch (error) {
      console.error('Failed to fetch home data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setMounted(true)
    if (user?.role === 'admin' || user?.email === 'admin@gmail.com') {
      router.push('/admin')
      return
    }
    fetchData()
  }, [user, router])

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        setIsSearching(true)
        setIsSearchLoading(true)
        try {
          const results = await EditorWorksService.search(searchQuery)
          setSearchResults(results)
        } catch (error) {
          console.error('Search failed:', error)
        } finally {
          setIsSearchLoading(false)
        }
      } else {
        setIsSearching(false)
        setSearchResults([])
      }
    }, 500)

    return () => clearTimeout(delayDebounceFn)
  }, [searchQuery])

  const handleLogout = async () => {
    await logout()
    router.push('/auth/login')
  }

  const handleLikePost = async (postId: string) => {
    try {
      const updatedPost = await PostsService.like(postId)
      // Since backend populate authorId, we need to preserve it or refetch. 
      // But let's just update likes and likesCount manually for UI smoothness if populate isn't returned identically
      setFeed(feed.map(p => {
        if (p._id === postId) {
          return { ...p, likesCount: updatedPost.likesCount, likes: updatedPost.likes }
        }
        return p
      }))
    } catch (error) {
      console.error('Failed to like post:', error)
    }
  }

  const handleDismissPost = async (postId: string) => {
    try {
      await PostsService.dismiss(postId)
      setFeed(feed.filter(p => p._id !== postId))
      toast.success('Update dismissed')
    } catch (error) {
      console.error('Failed to dismiss post:', error)
    }
  }

  const usernameDisplay = user?.username || user?.name || 'Guest'

  const BookCard = ({ book }: { book: WorkDto }) => {
    const bookId = book.id || book._id;
    return (
      <Link href={`/book/${bookId}`} className="group cursor-pointer">
        <div className="relative overflow-hidden rounded-xl mb-3 bg-muted aspect-[3/4] shadow-sm transition-all group-hover:shadow-md">
          <img
            src={book.coverImage || 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=300&h=400&fit=crop'}
            alt={book.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <h3 className="font-bold text-sm line-clamp-2 leading-tight group-hover:text-primary transition-colors">{book.title}</h3>
        <p className="text-muted-foreground text-xs mt-1">{book.authorUsername || 'InkLink Author'}</p>
      </Link>
    )
  }

  const RatedBookCard = ({ book }: { book: WorkDto }) => {
    const bookId = book.id || book._id;
    return (
      <Link href={`/book/${bookId}`} className="group cursor-pointer">
        <div className="relative overflow-hidden rounded-xl mb-3 bg-muted aspect-[3/4] shadow-sm transition-all group-hover:shadow-md">
          <img
            src={book.coverImage || 'https://images.unsplash.com/photo-1507842217343-583f20270319?w=300&h=400&fit=crop'}
            alt={book.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-background/95 backdrop-blur-sm px-2.5 py-1 rounded-full text-xs font-bold shadow-sm border border-border/50">
            <span className="text-amber-500 text-sm">★</span>
            <span className="text-foreground">{book.averageRating || 0}</span>
          </div>
        </div>
        <h3 className="font-bold text-sm line-clamp-2 leading-tight group-hover:text-primary transition-colors">{book.title}</h3>
        <p className="text-muted-foreground text-xs mt-1">{book.authorUsername || 'InkLink Author'}</p>
      </Link>
    )
  }

  const ContinueReadingCard = ({ book }: { book: any }) => (
    <Link href={`/book/${book.id}`} className="group cursor-pointer">
      <div className="relative overflow-hidden rounded-xl mb-3 bg-muted aspect-[3/4] shadow-sm transition-all group-hover:shadow-md">
        <img
          src={book.image}
          alt={book.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-black/5" />
        <div className="absolute bottom-3 left-3 right-3 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-black text-white drop-shadow-md">
            <span className="bg-primary/90 px-2 py-0.5 rounded-sm uppercase tracking-tighter">In Progress</span>
            <span>{book.progress}%</span>
          </div>
          <div className="w-full bg-white/20 backdrop-blur-md rounded-full h-1.5 p-[1px] border border-white/10">
            <div
              className="bg-primary h-full rounded-full transition-all duration-1000"
              style={{ width: `${book.progress}%` }}
            />
          </div>
        </div>
      </div>
      <h3 className="font-bold text-sm line-clamp-2 leading-tight group-hover:text-primary transition-colors">{book.title}</h3>
      <p className="text-muted-foreground text-xs mt-1">{book.author}</p>
    </Link>
  )

  if (!mounted) return null

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Personalized Welcome */}
        <div className="mb-12 mt-6">
          <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">
            Feed your <span className="text-primary italic">imagination</span>.
          </h2>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mt-8">
            <p className="text-muted-foreground text-lg max-w-xl">
              You currently have <span className="text-foreground font-bold">{continueReading.length} stories</span> in your queue.
            </p>
            <div className="relative w-full max-w-md group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
                <Search size={20} />
              </div>
              <input
                type="text"
                placeholder="Search by book name or author..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-secondary/50 border-2 border-border/50 rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:outline-none focus:border-primary/50 focus:bg-background transition-all shadow-sm"
              />
              {isSearchLoading && (
                <div className="absolute inset-y-0 right-4 flex items-center">
                  <Loader2 size={20} className="animate-spin text-primary" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Search Results Section */}
        <AnimatePresence>
          {isSearching && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="mb-20 bg-secondary/10 p-8 rounded-[2.5rem] border border-border/50"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-3xl font-black">Search Results</h2>
                  <p className="text-sm text-muted-foreground">Found {searchResults.length} matches for "{searchQuery}"</p>
                </div>
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
                >
                  Clear Search
                </button>
              </div>

              {searchResults.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-12">
                  {searchResults.map((book) => (
                    <BookCard key={book.id || (book as any)._id} book={book} />
                  ))}
                </div>
              ) : !isSearchLoading ? (
                <div className="text-center py-20 bg-background/50 rounded-3xl border-2 border-dashed border-border/50">
                  <p className="text-lg font-bold text-muted-foreground">No books or authors found.</p>
                  <p className="text-sm text-muted-foreground/60 mt-1">Try a different keyword or check your spelling.</p>
                </div>
              ) : null}
            </motion.section>
          )}
        </AnimatePresence>

        {/* Roles Quick Access */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
          {user?.role === 'child' && (
            <Link href="/children" className="group p-8 rounded-3xl bg-gradient-to-br from-rose-400 to-orange-400 text-white shadow-xl shadow-rose-500/10 transition-transform active:scale-95">
              <div className="flex items-center justify-between font-black">
                <div>
                  <p className="text-xs opacity-80 uppercase tracking-widest mb-1">Authenticated Magic</p>
                  <p className="text-3xl">Go to Kids Mode</p>
                </div>
                <span className="text-5xl">🎨</span>
              </div>
            </Link>
          )}

          {user?.role === 'parent' && (
            <Link href="/dashboard/parent" className="group p-8 rounded-3xl bg-primary text-primary-foreground shadow-xl shadow-primary/10 transition-transform active:scale-95">
              <div className="flex items-center justify-between font-bold">
                <div>
                  <p className="text-xs opacity-80 uppercase tracking-widest mb-1">Administrative Access</p>
                  <p className="text-3xl">Parent Dashboard</p>
                </div>
                <Shield size={48} className="opacity-80" />
              </div>
            </Link>
          )}
        </div>

        {/* Author Updates Section (Feed) - MOVED & LIMITED */}
        {user && feed.length > 0 && (
          <section className="mb-20">
            <div className="flex items-center justify-between mb-8 px-1">
              <div className="space-y-1">
                <h2 className="text-3xl font-black">Author Updates</h2>
                <p className="text-sm text-muted-foreground">Latest news from authors you follow.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {feed.slice(0, 4).map((post) => (
                <div key={post._id} className="bg-secondary/20 border border-border/50 rounded-[2rem] p-6 hover:shadow-lg transition-all group relative overflow-hidden">
                  <button
                    onClick={() => handleDismissPost(post._id)}
                    className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-all z-10"
                    title="Dismiss"
                  >
                    <X size={16} />
                  </button>

                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary overflow-hidden border-2 border-primary/20">
                      {post.authorId?.profilePicture ? (
                        <img src={post.authorId.profilePicture} alt={post.authorId.username} className="w-full h-full object-cover" />
                      ) : (
                        post.authorId?.username?.[0] || 'A'
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold">@{post.authorId?.username || 'Author'}</p>
                    </div>
                  </div>
                  <p className="text-foreground/80 text-xs leading-relaxed mb-6 line-clamp-4 group-hover:line-clamp-none transition-all">
                    {post.content}
                  </p>
                  <div className="flex items-center justify-between pt-4 border-t border-border/30 mt-auto">
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-black uppercase tracking-widest">
                      <Clock size={10} />
                      {new Date(post.createdAt).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleLikePost(post._id)}
                        className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-red-500 transition-colors"
                      >
                        <HeartIcon
                          size={14}
                          className={cn(
                            post.likes?.includes(user?.sub || user?.id || user?._id) ? "text-red-500 fill-red-500" : ""
                          )}
                        />
                        {post.likesCount}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* My Reading Section (4-Column Grid) */}
        <section className="mb-20">
          <div className="flex items-end justify-between mb-8">
            <div className="space-y-1">
              <h2 className="text-3xl font-black">My Reading</h2>
              <p className="text-sm text-muted-foreground">Stories you are still exploring.</p>
            </div>
            <Link href="/library" className="text-primary text-sm font-bold hover:underline mb-1">Browse All</Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-12">
            {continueReading.length > 0 ? (
              continueReading.map((book) => (
                <ContinueReadingCard key={book.id} book={book} />
              ))
            ) : (
              <div className="col-span-full h-40 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-3xl bg-secondary/20">
                <p className="text-muted-foreground font-medium">Your reading list is empty.</p>
                <Link href="/explore" className="text-primary text-sm font-bold mt-2">Find a story</Link>
              </div>
            )}
          </div>
        </section>

        {/* Top Picks Section (Grid) */}
        <section className="mb-20">
          <div className="flex items-end justify-between mb-8 px-1">
            <h2 className="text-3xl font-black tracking-tight">Top Picks for You</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-12">
            {topPicks.map((book) => (
              <BookCard key={book.id || (book as any)._id} book={book} />
            ))}
          </div>
        </section>

        {/* Top Rated Section (Improved) */}
        <section className="mb-20">
          <div className="flex items-end justify-between mb-8 px-1">
            <div className="space-y-1">
              <h2 className="text-sm font-black text-primary uppercase tracking-[0.2em]">Highest Quality</h2>
              <h3 className="text-3xl font-black">Top Rated</h3>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-12">
            {topRated.map((book) => (
              <RatedBookCard key={book.id || (book as any)._id} book={book} />
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

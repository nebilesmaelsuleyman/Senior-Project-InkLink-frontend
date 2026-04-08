'use client'

import { use, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Heart, MessageCircle, ChevronLeft, ChevronRight, Gift, Moon, Sun, Lock, Crown, ShoppingCart, Loader2, Volume2, VolumeX, RotateCcw } from 'lucide-react'
import { ttsService } from '@/app/services/tts.service'
import { useTheme } from 'next-themes'
import { ReactionsService } from '@/app/services/reactions.service'
import { RatingsService, RatingResponse } from '@/app/services/ratings.service'
import { SubscriptionService, ChapterAccess } from '@/app/services/subscription.service'
import { StarRating } from '@/components/star-rating'
import { useAuthStore } from '@/app/store/authstore'
import { toast } from 'sonner'

export default function ChapterReadingPage({ params }: { params: Promise<{ id: string; chapterId: string }> }) {
  const { id, chapterId } = use(params)
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isLiked, setIsLiked] = useState(false)
  const [likes, setLikes] = useState(0)
  const [showComments, setShowComments] = useState(false)
  const [commentsCount, setCommentsCount] = useState(0)
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState('')
  const [ratingData, setRatingData] = useState<RatingResponse | null>(null)
  const { user } = useAuthStore()

  const [chapter, setChapter] = useState<any>(null);
  const [work, setWork] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // ─── Paywall State ──────────────────────────────────────────────────
  const [access, setAccess] = useState<ChapterAccess | null>(null)
  const [accessLoading, setAccessLoading] = useState(true)
  const [purchasing, setPurchasing] = useState(false)
  const [showSubscribeModal, setShowSubscribeModal] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const [plans, setPlans] = useState<any[]>([])

  // ─── Read Tracking ──────────────────────────────────────────────────
  const articleRef = useRef<HTMLDivElement>(null)
  const hasLoggedRead = useRef(false)
  
  // ─── TTS State ──────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false)
  const [ttsLoading, setTtsLoading] = useState(false)
  const [audioReady, setAudioReady] = useState(false)  // true once synthesis is done
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)

  useEffect(() => {
    setMounted(true)

    // Stop TTS on chapter change — but don't revoke cached blob URLs
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    // Only revoke if NOT in the cache (keep cached audio alive)
    if (audioUrlRef.current) {
      ttsService.revokeUrl(audioUrlRef.current, { skipIfCached: true });
      audioUrlRef.current = null;
    }
    setIsPlaying(false);
    setAudioReady(false);

    const fetchData = async () => {
      try {
        const { EditorWorksService } = await import('@/app/services/editor-works.service');
        const { libraryService } = await import('@/app/services/library.service');
        
        const workData = await EditorWorksService.getById(id);
        setWork(workData);
        
        const chapterData = workData.chapters?.find((c: any) => (c.id || c._id) === chapterId);
        setChapter(chapterData);

        // Update Reading Progress
        if (workData.chapters?.length) {
          const index = workData.chapters.findIndex((c: any) => (c.id || c._id) === chapterId);
          if (index !== -1) {
            const progress = Math.round(((index + 1) / workData.chapters.length) * 100);
            await libraryService.updateProgress(id, progress).catch(err => {
              console.warn('Failed to update progress:', err);
            });
          }
        }

        setLikes(Number(chapterData?.likesCount ?? 0));
        setIsLiked(Boolean(chapterData?.viewerHasLiked ?? false));
        setCommentsCount(Number(chapterData?.commentsCount ?? 0));

        const commentsPage = await ReactionsService.listComments(chapterId, { limit: 50 });
        setComments(commentsPage.items || []);

        const rating = await RatingsService.getWorkRating(id, user?.id).catch(() => null);
        setRatingData(rating);

        // Check chapter access
        try {
          const accessData = await SubscriptionService.checkAccess(chapterId);
          setAccess(accessData);
        } catch (err) {
          console.error('Access check failed:', err);
          setAccess({ hasAccess: false, accessType: 'none', price: chapterData?.price || 0, isPremiumSubscriber: false });
        }
      } catch (err) {
        console.error(err);
        toast.error('Failed to load chapter content');
      } finally {
        setLoading(false);
        setAccessLoading(false);
      }
    };
    fetchData();

    // Check for payment return
    const url = new URL(window.location.href);
    if (url.searchParams.has('trx_ref') || url.searchParams.has('status')) {
      toast.info('Verifying your payment...', { id: 'payment-verify' });
      // Refresh access after a short delay to allow webhook processing
      setTimeout(async () => {
        try {
          const accessData = await SubscriptionService.checkAccess(chapterId);
          setAccess(accessData);
          if (accessData.hasAccess) {
            toast.success('Chapter unlocked!', { id: 'payment-verify' });
            // Re-fetch work to get the content
            const { EditorWorksService } = await import('@/app/services/editor-works.service');
            const workData = await EditorWorksService.getById(id);
            setWork(workData);
            const chapterData = workData.chapters?.find((c: any) => (c.id || c._id) === chapterId);
            setChapter(chapterData);
          }
        } catch (err) {
           console.error('Re-verification failed', err);
        }
      }, 3000);
    }
  }, [id, chapterId, user]);

  // ─── Scroll-based read tracking ─────────────────────────────────────
  useEffect(() => {
    if (!access?.hasAccess || !user || hasLoggedRead.current) return;

    const handleScroll = () => {
      if (!articleRef.current || hasLoggedRead.current) return;
      const rect = articleRef.current.getBoundingClientRect();
      const totalHeight = articleRef.current.scrollHeight;
      const viewportBottom = window.innerHeight;
      const scrolled = Math.max(0, -rect.top + viewportBottom);
      const percentage = Math.min(100, Math.round((scrolled / totalHeight) * 100));

      if (percentage >= 50 && !hasLoggedRead.current) {
        hasLoggedRead.current = true;
        SubscriptionService.logReadProgress(chapterId, percentage).catch(() => {});
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [access, user, chapterId]);

  const handleLike = async () => {
    try {
      const res = await ReactionsService.toggleLike(chapterId);
      setIsLiked(Boolean(res.viewerHasLiked));
      setLikes(Number(res.likesCount ?? 0));
    } catch (err) {
      console.error(err);
    }
  }

  const handleAddComment = async () => {
    const text = newComment.trim();
    if (!text) return;

    try {
      const created = await ReactionsService.addComment(chapterId, { text });
      setComments((prev) => [created, ...prev]);
      setCommentsCount((prev) => prev + 1);
      setNewComment('');
      setShowComments(true);
    } catch (err) {
      console.error(err);
    }
  }

  const handleRate = async (value: number) => {
    try {
      const updatedRating = await RatingsService.rateWork(id, value)
      setRatingData(updatedRating)
    } catch (error) {
      console.error('Failed to rate work:', error)
    }
  }

  // ─── TTS Handler ────────────────────────────────────────────────────
  const handleTts = async () => {
    // ── PAUSE: currently playing → pause at current position
    if (isPlaying && audioRef.current) {
      audioRef.current.pause()
      setIsPlaying(false)
      return
    }

    // ── RESUME: audio loaded and paused → continue from same position
    if (audioRef.current && !audioRef.current.ended && !isPlaying) {
      try {
        await audioRef.current.play()
        setIsPlaying(true)
      } catch (err) {
        console.error('Resume failed:', err)
      }
      return
    }

    // ── RESTART from end: audio finished → restart without re-synthesizing
    if (audioRef.current && audioRef.current.ended) {
      audioRef.current.currentTime = 0
      try {
        await audioRef.current.play()
        setIsPlaying(true)
      } catch (err) {
        console.error('Restart-from-end failed:', err)
      }
      return
    }

    // ── SYNTHESIZE OR LOAD FROM CACHE
    if (!chapter?.contentText) {
      toast.error('No content to read')
      return
    }

    // Clean up any previous audio
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (audioUrlRef.current) {
      ttsService.revokeUrl(audioUrlRef.current)
      audioUrlRef.current = null
    }

    setTtsLoading(true)
    const isCached = ttsService.isCached(chapterId)
    if (!isCached) {
      toast.info('Preparing audio…', { id: 'tts-loading', duration: 60_000 })
    }

    try {
      // Detect Amharic characters (U+1200–U+137F)
      const isAmharic = /[\u1200-\u137F]/.test(chapter.contentText)
      const lang = isAmharic ? 'am' : 'en'

      // Pass chapterId as cache key — returns cached URL instantly on repeat listens
      const blobUrl = await ttsService.synthesize(chapter.contentText, lang, chapterId)
      audioUrlRef.current = blobUrl

      const audio = new Audio(blobUrl)
      audio.playbackRate = playbackSpeed
      audioRef.current = audio

      audio.onended = () => setIsPlaying(false)
      audio.onerror = () => {
        setIsPlaying(false)
        toast.error('Audio playback error')
      }

      toast.dismiss('tts-loading')
      await audio.play()
      setIsPlaying(true)
      setAudioReady(true)
    } catch (err: any) {
      console.error('TTS failed:', err)
      toast.dismiss('tts-loading')
      toast.error('Failed to generate audio. Check your connection.')
    } finally {
      setTtsLoading(false)
    }
  }

  // ── Restart from the beginning (re-uses already-downloaded audio)
  const handleRestart = async () => {
    if (!audioRef.current) return
    audioRef.current.currentTime = 0
    try {
      await audioRef.current.play()
      setIsPlaying(true)
    } catch (err) {
      console.error('Restart failed:', err)
    }
  }

  // ── Sync playback speed in real time
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed
    }
  }, [playbackSpeed])

  // ── Stop and free audio element on unmount (do NOT revoke cached blob URLs)
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      if (audioUrlRef.current) {
        // skipIfCached: true → cached chapters keep their blob URL alive
        ttsService.revokeUrl(audioUrlRef.current, { skipIfCached: true })
        audioUrlRef.current = null
      }
    }
  }, [])

  // ─── Purchase Handler ───────────────────────────────────────────────
  const handlePurchase = async () => {
    if (!user) {
      toast.error('Please log in to purchase')
      router.push('/auth/login')
      return
    }
    setPurchasing(true)
    try {
      await SubscriptionService.purchaseChapter(chapterId)
      toast.success('Chapter purchased successfully!')
      setAccess({ hasAccess: true, accessType: 'purchase', price: access?.price || 0, isPremiumSubscriber: false })
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Purchase failed')
    } finally {
      setPurchasing(false)
    }
  }

  // ─── Subscribe Handler ──────────────────────────────────────────────
  const handleOpenSubscribe = async () => {
    if (!user) {
      toast.error('Please log in to subscribe')
      router.push('/auth/login')
      return
    }
    try {
      const p = await SubscriptionService.getPlans()
      setPlans(p)
      setShowSubscribeModal(true)
    } catch {
      toast.error('Failed to load plans')
    }
  }

  const handleSubscribe = async (plan: 'weekly' | 'monthly' | 'yearly') => {
    setSubscribing(true)
    try {
      await SubscriptionService.subscribe(plan)
      toast.success('Subscribed successfully! Enjoy unlimited reading.')
      setAccess({ hasAccess: true, accessType: 'subscription', price: access?.price || 0, isPremiumSubscriber: true })
      setShowSubscribeModal(false)
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Subscription failed')
    } finally {
      setSubscribing(false)
    }
  }

  const chapters = work?.chapters || [];
  const currentIndex = chapters.findIndex((c: any) => (c.id || c._id) === chapterId);
  const previousChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const nextChapter = currentIndex >= 0 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

  if (!mounted || loading) return null

  if (!chapter) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Chapter not found.</p>
        <Link href={`/book/${id}`} className="text-primary ml-2 underline">Go back</Link>
      </div>
    );
  }

  // ─── Paywall UI ─────────────────────────────────────────────────────
  const isLocked = access && !access.hasAccess;

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 hover:bg-secondary rounded-lg transition-colors"
              aria-label="Toggle theme"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <Link
              href={`/book/${id}`}
              className="p-2 hover:bg-secondary rounded-lg transition-colors flex items-center gap-2"
              title="Back to book"
            >
              <ArrowLeft size={20} />
              <span className="hidden sm:inline text-sm font-medium">Back</span>
            </Link>
            {!isLocked && (
              <button
                onClick={handleTts}
                disabled={ttsLoading}
                className={`p-2 rounded-lg transition-all flex items-center gap-2 ${
                  isPlaying 
                    ? 'bg-primary text-primary-foreground shadow-sm' 
                    : 'hover:bg-secondary text-foreground'
                }`}
                title={isPlaying ? "Pause reading" : "Read aloud"}
              >
                {ttsLoading ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : isPlaying ? (
                  <VolumeX size={20} />
                ) : (
                  <Volume2 size={20} />
                )}
                <span className="hidden md:inline text-sm font-medium">
                  {isPlaying ? "Reading..." : "Read Aloud"}
                </span>
              </button>
            )}
            {/* Speed + Restart buttons — visible whenever audio is ready */}
            {audioReady && !ttsLoading && (
              <>
                <button
                  onClick={() => setPlaybackSpeed(prev => prev >= 2 ? 0.75 : Math.round((prev + 0.25) * 100) / 100)}
                  className="px-2 py-1 hover:bg-secondary rounded-md transition-colors text-[10px] font-black border border-border/50 shadow-sm"
                  title="Change playback speed"
                >
                  {playbackSpeed % 1 === 0 ? playbackSpeed : playbackSpeed.toFixed(2)}x
                </button>
                <button
                  onClick={handleRestart}
                  className="p-1.5 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground"
                  title="Restart from beginning"
                >
                  <RotateCcw size={15} />
                </button>
              </>
            )}
          </div>
            <h1 className="text-lg font-bold text-center flex-1 line-clamp-1 px-4">{work?.title || 'Loading...'}</h1>
            <div className="flex items-center gap-2">
              {access?.isPremiumSubscriber && (
                <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-100 px-2 py-1 rounded-full">
                  <Crown size={12} /> Premium
                </span>
              )}
              <div className="w-8" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Chapter Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-sm text-muted-foreground">Chapter {currentIndex + 1}</p>
            {(chapter.price || 0) > 0 && (
              <span className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                access?.hasAccess 
                  ? 'text-green-600 bg-green-100' 
                  : 'text-amber-600 bg-amber-100'
              }`}>
                {access?.hasAccess ? (
                  access.accessType === 'subscription' ? <><Crown size={10} /> Premium</> :
                  access.accessType === 'purchase' ? '✓ Purchased' : '✓ Unlocked'
                ) : (
                  <><Lock size={10} /> {chapter.price} ETB</>
                )}
              </span>
            )}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-4">{chapter.title}</h1>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{work?.authorUsername || 'Author'}</span>
            <span>{new Date(chapter.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        {/* ─── Paywall Gate ──────────────────────────────────────────── */}
        {isLocked ? (
          <div className="relative">
            {/* Blurred preview */}
            <div className="relative overflow-hidden rounded-2xl">
              <article className="prose prose-invert max-w-none opacity-30 blur-sm select-none pointer-events-none" style={{ maxHeight: '300px', overflow: 'hidden' }}>
                <div className="space-y-6 text-foreground leading-relaxed">
                  {chapter.contentText ? chapter.contentText.split('\n\n').slice(0, 3).map((paragraph: string, index: number) => (
                    <p key={index} className="text-base sm:text-lg">
                      {paragraph}
                    </p>
                  )) : <p className="italic opacity-50">Premium content.</p>}
                </div>
              </article>
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background" />
            </div>

            {/* Paywall Card */}
            <div className="relative -mt-20 z-10 mx-auto max-w-lg">
              <div className="bg-card border-2 border-primary/20 rounded-3xl p-8 shadow-2xl shadow-primary/5 text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-5">
                  <Lock size={28} className="text-primary" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Premium Chapter</h2>
                <p className="text-muted-foreground mb-8">
                  This chapter is locked. Choose how you'd like to read it:
                </p>

                <div className="space-y-4">
                  {/* Option 1: Buy this chapter */}
                  <button
                    onClick={handlePurchase}
                    disabled={purchasing}
                    className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-primary text-primary-foreground rounded-2xl font-bold text-base hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-60"
                  >
                    {purchasing ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <ShoppingCart size={20} />
                    )}
                    Buy this chapter for {access?.price || chapter.price} ETB
                  </button>

                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground font-bold uppercase">or</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  {/* Option 2: Subscribe */}
                  <button
                    onClick={handleOpenSubscribe}
                    className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-2xl font-bold text-base hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg shadow-amber-500/20"
                  >
                    <Crown size={20} />
                    Subscribe for unlimited reading
                  </button>
                  <p className="text-xs text-muted-foreground">
                    Starting from 50 ETB/week — read all locked chapters
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Chapter Content */}
            <article ref={articleRef} className="prose prose-invert max-w-none mb-12">
              <div className="space-y-6 text-foreground leading-relaxed">
                {chapter.contentText ? chapter.contentText.split('\n\n').map((paragraph: string, index: number) => (
                  <p key={index} className="text-base sm:text-lg">
                    {paragraph}
                  </p>
                )) : <p className="italic opacity-50">No content available.</p>}
              </div>
            </article>

            {/* Interaction Buttons */}
            <div className="flex flex-wrap gap-4 mb-12 pb-8 border-b border-border">
              <button
                onClick={handleLike}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  isLiked
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary hover:bg-secondary/80 text-foreground'
                }`}
              >
                <Heart size={18} fill={isLiked ? 'currentColor' : 'none'} />
                <span className="font-medium">{likes} Likes</span>
              </button>

              <button
                onClick={() => setShowComments(!showComments)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  showComments ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-secondary hover:bg-secondary/80 text-foreground'
                }`}
              >
                <MessageCircle size={18} />
                <span className="font-medium">{commentsCount} Comments</span>
              </button>

              <div className="flex flex-col items-center gap-1 bg-secondary px-4 py-1.5 rounded-lg border border-border/50">
                <StarRating 
                  initialRating={ratingData?.userRating || Math.round(ratingData?.averageRating || 0)} 
                  onRate={handleRate} 
                  size={18} 
                  readonly={!user}
                />
                <span className="text-[10px] font-bold uppercase tracking-tighter opacity-70">
                  {ratingData?.averageRating?.toFixed(1) || '0.0'} ({ratingData?.ratingsCount || 0})
                </span>
              </div>

              <Link
                href="#donate"
                className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 rounded-lg transition-colors ml-auto"
              >
                <Gift size={18} />
                <span className="font-medium">Donate</span>
              </Link>
            </div>

            {/* Comments Section */}
            {showComments && (
              <div className="mb-12 space-y-6">
                <h2 className="text-2xl font-bold">Comments ({commentsCount})</h2>

                {/* Add Comment */}
                <div className="space-y-3 p-4 bg-secondary/30 rounded-lg border border-border">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Share your thoughts..."
                    className="w-full px-4 py-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    rows={3}
                  />
                  <button
                    onClick={handleAddComment}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
                  >
                    Post Comment
                  </button>
                </div>

                {/* Comments List */}
                <div className="space-y-4">
                  {comments.map((comment) => (
                    <div key={comment.id} className="flex gap-4 p-4 bg-secondary/20 rounded-lg border border-border">
                      <img
                        src={comment.avatar}
                        alt={comment.author}
                        className="w-10 h-10 rounded-full flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm mb-1">{comment.author}</p>
                        <p className="text-foreground text-sm break-words">{comment.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex gap-4 justify-between mb-12">
              {previousChapter ? (
                <Link
                  href={`/book/${id}/chapter/${previousChapter.id || previousChapter._id}`}
                  className="flex items-center gap-2 px-6 py-3 bg-secondary hover:bg-secondary/80 rounded-lg transition-colors font-medium"
                >
                  <ChevronLeft size={20} />
                  Previous Chapter
                </Link>
              ) : (
                <div />
              )}

              {nextChapter ? (
                <Link
                  href={`/book/${id}/chapter/${nextChapter.id || nextChapter._id}`}
                  className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors font-medium"
                >
                  Next Chapter
                  <ChevronRight size={20} />
                </Link>
              ) : (
                <div />
              )}
            </div>

            {/* Donate Section */}
            <section id="donate" className="bg-secondary/30 border border-border rounded-lg p-8 text-center">
              <h2 className="text-2xl font-bold mb-3">Support the Author</h2>
              <p className="text-muted-foreground mb-6">Love this story? Show your support by donating to help the author continue writing amazing chapters.</p>
              <Link
                href={`/donate?author=${work?.authorId}&username=${work?.authorUsername}`}
                className="inline-block px-8 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
              >
                <Gift size={18} className="inline mr-2" />
                Donate
              </Link>
            </section>
          </>
        )}
      </main>

      {/* ─── Subscribe Modal ────────────────────────────────────────── */}
      {showSubscribeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-3xl max-w-xl w-full p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowSubscribeModal(false)}
              className="absolute top-4 right-4 p-2 hover:bg-secondary rounded-lg transition-colors text-muted-foreground"
            >
              ✕
            </button>

            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/30">
                <Crown size={28} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-2">InkLink Premium</h2>
              <p className="text-muted-foreground">Unlock all locked chapters across the platform</p>
            </div>

            <div className="grid gap-4">
              {plans.map((plan) => (
                <button
                  key={plan.plan}
                  onClick={() => handleSubscribe(plan.plan)}
                  disabled={subscribing}
                  className="flex items-center justify-between p-5 border-2 border-border rounded-2xl hover:border-primary/50 hover:bg-primary/5 transition-all group disabled:opacity-60"
                >
                  <div className="text-left">
                    <h3 className="font-bold text-lg capitalize group-hover:text-primary transition-colors">
                      {plan.plan}
                    </h3>
                    <p className="text-sm text-muted-foreground">{plan.days} days of unlimited reading</p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black text-primary">{plan.price}</span>
                    <span className="text-sm text-muted-foreground ml-1">ETB</span>
                  </div>
                </button>
              ))}
            </div>

            <p className="text-center text-xs text-muted-foreground mt-6">
              Authors earn from the subscription pool based on how many chapters you read.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

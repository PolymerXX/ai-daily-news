'use client';

import { useState, useMemo, useCallback } from 'react';
import Sidebar from '@/components/layout/sidebar';
import NewsCard from '@/components/news/news-card';
import HighlightCard from '@/components/news/highlight-card';
import MobileNav from '@/components/layout/mobile-nav';
import { ToastProvider, useToast } from '@/components/layout/toast-provider';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, TrendingUp, RefreshCw, Loader2, Zap, Newspaper, Globe, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NewsItem } from '@/types/news';
import { CATEGORIES } from '@/lib/constants';
import { useFavorites } from '@/hooks/use-favorites';

type Source = 'agent' | 'smol';

function HomeContent() {
  const [newsData, setNewsData] = useState<NewsItem[]>([]);
  const [smolData, setSmolData] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [smolLoading, setSmolLoading] = useState(false);
  const [error, setError] = useState('');
  const [smolError, setSmolError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [source, setSource] = useState<Source>('agent');
  const { favorites, toggleFavorite: originalToggle, isFavorite } = useFavorites();
  const { showToast } = useToast();

  const fetchNews = useCallback(async (force = false) => {
    setLoading(true);
    setError('');

    try {
      const params = force ? '?force_refresh=true' : '';
      const res = await fetch(`/api/news${params}`, {
        signal: AbortSignal.timeout(180_000),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || '获取新闻失败');
      }

      setNewsData(data.news || []);
      showToast(`已加载 ${data.news?.length || 0} 条资讯`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '未知错误';
      setError(msg);
      showToast('加载失败: ' + msg);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const fetchSmolNews = useCallback(async () => {
    setSmolLoading(true);
    setSmolError('');
    try {
      const res = await fetch('/api/news/smol', {
        signal: AbortSignal.timeout(30_000),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || '获取 smol.ai 资讯失败');
      }
      setSmolData(data.news || []);
      showToast(`已加载 ${data.news?.length || 0} 条 smol.ai 资讯`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '未知错误';
      setSmolError(msg);
      showToast('加载失败: ' + msg);
    } finally {
      setSmolLoading(false);
    }
  }, [showToast]);

  const handleRefresh = useCallback(() => {
    if (source === 'agent') fetchNews(true);
    else fetchSmolNews();
  }, [fetchNews, fetchSmolNews, source]);

  const toggleFavorite = useCallback((id: string) => {
    originalToggle(id);
    if (!isFavorite(id)) {
      showToast('已添加到收藏');
    } else {
      showToast('已取消收藏');
    }
  }, [originalToggle, isFavorite, showToast]);

  const currentData = source === 'agent' ? newsData : smolData;
  const currentError = source === 'agent' ? error : smolError;
  const currentLoading = source === 'agent' ? loading : smolLoading;
  const hasData = currentData.length > 0;

  const filteredNews = useMemo(() => {
    return currentData.filter((news: NewsItem) => {
      const matchesSearch =
        searchQuery === '' ||
        news.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        news.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        news.source.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory =
        selectedCategory === '全部' || news.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [currentData, searchQuery, selectedCategory]);

  const highlights = useMemo(() => {
    return filteredNews.filter((news: NewsItem) => news.highlight).slice(0, 3);
  }, [filteredNews]);

  const regularNews = useMemo(() => {
    return filteredNews.filter((news: NewsItem) => !news.highlight);
  }, [filteredNews]);

  // Group non-highlight news by date for smol.ai source
  const groupedByDate = useMemo(() => {
    if (source !== 'smol') return null;
    const map = new Map<string, NewsItem[]>();
    for (const item of regularNews) {
      const raw = item.publishTime || '未知日期';
      let label = raw;
      // Format "2026-04-16" -> "2026年4月16日 星期四"
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        try {
          const dt = new Date(raw + 'T00:00:00');
          label = dt.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
        } catch { /* keep raw */ }
      }
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(item);
    }
    // Sort groups by first item's date descending
    const groups: { date: string; items: NewsItem[] }[] = [];
    map.forEach((items, date) => groups.push({ date, items }));
    groups.sort((a, b) => (a.items[0]?.publishTime || '').localeCompare(b.items[0]?.publishTime || '') * -1);
    return groups;
  }, [source, regularNews]);

  const sourceDescription = source === 'agent'
    ? '由 AI Agent 通过 Brave 搜索 + Jina 抓取中文新闻'
    : '来自 smol.ai — Karpathy 推荐的 AI 工程师日报';

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 lg:ml-64 pb-16 lg:pb-0">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <header className="mb-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                  今日AI资讯
                </h1>
                <p className="text-muted-foreground text-lg flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  {new Date().toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'long',
                  })}
                </p>
              </div>
              <button
                onClick={handleRefresh}
                disabled={currentLoading}
                className={cn(
                  'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all',
                  'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <RefreshCw className={cn('h-4 w-4', currentLoading && 'animate-spin')} />
                {currentLoading ? '加载中...' : '刷新资讯'}
              </button>
            </div>
          </header>

          {/* Source Tabs */}
          <div className="mb-6 flex gap-2">
            <button
              onClick={() => setSource('agent')}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
                source === 'agent'
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                  : 'bg-card text-muted-foreground hover:bg-accent border border-border/50'
              )}
            >
              <Bot className="w-4 h-4" />
              AI Agent 生成
            </button>
            <button
              onClick={() => { setSource('smol'); if (smolData.length === 0 && !smolLoading) fetchSmolNews(); }}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
                source === 'smol'
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                  : 'bg-card text-muted-foreground hover:bg-accent border border-border/50'
              )}
            >
              <Globe className="w-4 h-4" />
              smol.ai
              <span className="text-xs opacity-70">by Karpathy</span>
            </button>
          </div>

          {/* Source description */}
          <p className="text-sm text-muted-foreground mb-6">{sourceDescription}</p>

          {/* Empty State */}
          {!currentLoading && !currentError && !hasData && (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                {source === 'agent'
                  ? <Newspaper className="w-10 h-10 text-primary/60" />
                  : <Globe className="w-10 h-10 text-primary/60" />
                }
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                {source === 'agent' ? '还没有资讯' : 'smol.ai 资讯'}
              </h2>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                {source === 'agent'
                  ? '点击「刷新资讯」按钮，AI Agent 将通过 Brave 搜索 + Jina 抓取今日真实 AI 新闻'
                  : '点击「刷新资讯」获取来自 smol.ai 的最新英文 AI 资讯'
                }
              </p>
              <button
                onClick={handleRefresh}
                disabled={currentLoading}
                className={cn(
                  'flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all',
                  'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <Zap className="w-5 h-5" />
                开始获取
              </button>
            </div>
          )}

          {/* Loading State */}
          {currentLoading && (
            <div className="flex flex-col items-center justify-center py-24">
              <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
              <p className="text-lg text-muted-foreground mb-2">
                {source === 'agent' ? 'AI Agent 正在搜索最新资讯...' : '正在获取 smol.ai 资讯...'}
              </p>
              <p className="text-sm text-muted-foreground/70">
                {source === 'agent'
                  ? '通过 Brave 搜索 + Jina 抓取真实新闻源，约需 1-2 分钟'
                  : '解析 RSS 订阅源...'
                }
              </p>
            </div>
          )}

          {/* Error State */}
          {currentError && !currentLoading && (
            <div className="flex flex-col items-center justify-center py-24">
              <p className="text-lg text-destructive mb-4">{currentError}</p>
              <button
                onClick={handleRefresh}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <RefreshCw className="h-4 w-4" />
                重试
              </button>
            </div>
          )}

          {/* News Content */}
          {!currentLoading && !currentError && hasData && (
            <>
              <div className="mb-8 space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    placeholder="搜索资讯标题、摘要或来源..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-12 text-base bg-card border-border/50 focus:border-primary/50"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((category) => (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={cn(
                        'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                        selectedCategory === category
                          ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                          : 'bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground border border-border/50'
                      )}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>

              {highlights.length > 0 && (
                <section className="mb-12">
                  <div className="flex items-center gap-2 mb-6">
                    <TrendingUp className="h-6 w-6 text-primary" />
                    <h2 className="text-2xl font-semibold">今日亮点</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {highlights.map((news: NewsItem) => (
                      <HighlightCard key={news.id} news={news} />
                    ))}
                  </div>
                </section>
              )}

              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-semibold">全部资讯</h2>
                  <div className="flex items-center gap-2">
                    {source === 'smol' && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        English source
                      </span>
                    )}
                    <Badge variant="outline" className="text-sm">
                      共 {filteredNews.length} 条
                    </Badge>
                  </div>
                </div>

                {regularNews.length > 0 ? (
                  source === 'smol' && groupedByDate ? (
                    <div className="space-y-8">
                      {groupedByDate.map(({ date, items }) => (
                        <div key={date}>
                          <div className="flex items-center gap-3 mb-4">
                            <div className="h-px flex-1 bg-border/50" />
                            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                              {date}
                            </span>
                            <div className="h-px flex-1 bg-border/50" />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {items.map((news: NewsItem) => (
                              <NewsCard
                                key={news.id}
                                news={news}
                                isFavorite={isFavorite(news.id)}
                                onToggleFavorite={toggleFavorite}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {regularNews.map((news: NewsItem) => (
                        <NewsCard
                          key={news.id}
                          news={news}
                          isFavorite={isFavorite(news.id)}
                          onToggleFavorite={toggleFavorite}
                        />
                      ))}
                    </div>
                  )
                ) : (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground text-lg">没有找到匹配的资讯</p>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>
      <MobileNav />
    </div>
  );
}

export default function Home() {
  return (
    <ToastProvider>
      <HomeContent />
    </ToastProvider>
  );
}

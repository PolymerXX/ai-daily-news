'use client';

import Sidebar from '@/components/layout/sidebar';
import NewsCard from '@/components/news/news-card';
import MobileNav from '@/components/layout/mobile-nav';
import { ToastProvider, useToast } from '@/components/layout/toast-provider';
import { Star } from 'lucide-react';
import newsData from '@/data/news.json';
import { NewsItem } from '@/types/news';
import { useFavorites } from '@/hooks/use-favorites';
import { useCallback } from 'react';

function FavoritesContent() {
  const { favorites, toggleFavorite: originalToggle, isFavorite } = useFavorites();
  const { showToast } = useToast();

  const toggleFavorite = useCallback((id: string) => {
    originalToggle(id);
    if (!isFavorite(id)) {
      showToast('已添加到收藏');
    } else {
      showToast('已取消收藏');
    }
  }, [originalToggle, isFavorite, showToast]);

  const favoriteNews = newsData.filter((news: NewsItem) => favorites.has(news.id));

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 lg:ml-64 pb-16 lg:pb-0">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <header className="mb-8">
            <div className="flex items-center gap-3">
              <Star className="h-8 w-8 text-primary fill-primary" />
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-yellow-600 via-orange-600 to-red-600 bg-clip-text text-transparent">
                  收藏的资讯
                </h1>
                <p className="text-muted-foreground text-lg mt-1">
                  共 {favoriteNews.length} 条收藏
                </p>
              </div>
            </div>
          </header>

          {favoriteNews.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {favoriteNews.map((news: NewsItem) => (
                <NewsCard
                  key={news.id}
                  news={news}
                  isFavorite={isFavorite(news.id)}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <Star className="h-20 w-20 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground text-lg mb-2">还没有收藏的资讯</p>
              <p className="text-muted-foreground/70">
                前往首页浏览资讯，点击星标图标即可收藏
              </p>
            </div>
          )}
        </div>
      </main>
      <MobileNav />
    </div>
  );
}

export default function Favorites() {
  return (
    <ToastProvider>
      <FavoritesContent />
    </ToastProvider>
  );
}
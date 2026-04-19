'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Star, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NewsItem } from '@/types/news';
import { cn } from '@/lib/utils';
import { categoryColors } from '@/lib/constants';

interface NewsCardProps {
  news: NewsItem;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
}

export default function NewsCard({ news, isFavorite, onToggleFavorite }: NewsCardProps) {
  const router = useRouter();
  const isSlow = /^not much/i.test(news.title);

  const publishDate = new Date(news.publishTime).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const publishTime = new Date(news.publishTime).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const calculateReadingTime = (content: string): number => {
    const wordsPerMinute = 300;
    const wordCount = content.length;
    return Math.ceil(wordCount / wordsPerMinute);
  };

  const readingTime = calculateReadingTime(news.content);

  return (
    <Card
      className={cn(
        "group hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 hover:-translate-y-1 cursor-pointer border-border/50 hover:border-primary/30 overflow-hidden",
        isSlow && "opacity-50 hover:opacity-70"
      )}
      onClick={() => router.push(`/news/${news.id}`)}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <CardTitle className={cn(
            "text-lg font-semibold leading-tight group-hover:text-primary transition-colors",
            isSlow && "italic text-muted-foreground"
          )}>
            {isSlow ? '今日无重大资讯' : news.title}
          </CardTitle>
          {onToggleFavorite && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(news.id);
              }}
              className={cn(
                'flex-shrink-0 transition-all duration-200 hover:scale-110',
                isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground hover:text-yellow-400'
              )}
            >
              <Star className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="outline"
            className={cn('text-xs', categoryColors[news.category] || 'bg-gray-500/10 text-gray-600 dark:text-gray-400')}
          >
            {news.category}
          </Badge>
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />
            {news.source}
          </span>
          <span className="text-xs text-muted-foreground">•</span>
          <span className="text-xs text-muted-foreground">{publishDate}</span>
          <span className="text-xs text-muted-foreground">{publishTime}</span>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
          {isSlow ? '当日 AI 领域暂无重大新闻发布' : news.summary}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            约 {readingTime} 分钟阅读
          </span>
          <span className="text-xs text-primary group-hover:underline inline-flex items-center gap-1">
            阅读全文 →
          </span>
        </div>
        {news.highlight && (
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1 flex-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full opacity-60" />
            <span className="text-xs font-medium text-muted-foreground">亮点</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

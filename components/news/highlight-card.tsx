import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NewsItem } from '@/types/news';
import { cn } from '@/lib/utils';
import { categoryColors } from '@/lib/constants';

interface HighlightCardProps {
  news: NewsItem;
}

export default function HighlightCard({ news }: HighlightCardProps) {
  const publishDate = new Date(news.publishTime).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // 计算阅读时间（约300字/分钟）
  const contentLength = news.content.length;
  const readingTime = Math.ceil(contentLength / 300);

  return (
    <Link href={`/news/${news.id}`}>
      <Card className="h-full hover:shadow-2xl hover:shadow-primary/20 transition-all duration-500 hover:-translate-y-2 bg-gradient-to-br from-card via-card to-muted/30 border-primary/20 hover:border-primary/40 group">
        <CardHeader>
          <div className="flex items-center gap-2 mb-3">
            <Badge className={cn('text-xs font-semibold', categoryColors[news.category])}>
              {news.category}
            </Badge>
            <span className="text-xs text-muted-foreground">{news.source}</span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-xs text-muted-foreground">{publishDate}</span>
          </div>
          <CardTitle className="text-xl font-bold leading-tight group-hover:text-primary transition-colors bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
            {news.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
            {news.summary}
          </p>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs font-medium text-primary">阅读全文 →</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{readingTime} 分钟阅读</span>
              <div className="flex gap-1">
                <div className="h-1 w-1 rounded-full bg-gradient-to-r from-blue-500 to-purple-500" />
                <div className="h-1 w-1 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" />
                <div className="h-1 w-1 rounded-full bg-gradient-to-r from-pink-500 to-orange-500" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
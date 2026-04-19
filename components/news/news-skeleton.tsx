'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Star } from 'lucide-react';

export function NewsSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="h-6 w-3/4 animate-pulse bg-muted/50 rounded" />
          <Star className="h-5 w-5 text-muted/50" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="h-5 w-16 animate-pulse bg-muted/50 rounded-full" />
          <div className="h-4 w-20 animate-pulse bg-muted/50 rounded" />
          <span className="text-xs text-muted-foreground">•</span>
          <div className="h-4 w-24 animate-pulse bg-muted/50 rounded" />
          <div className="h-4 w-16 animate-pulse bg-muted/50 rounded" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="h-4 w-full animate-pulse bg-muted/50 rounded" />
          <div className="h-4 w-full animate-pulse bg-muted/50 rounded" />
          <div className="h-4 w-3/4 animate-pulse bg-muted/50 rounded" />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-1 flex-1 animate-pulse bg-muted/50 rounded-full" />
          <div className="h-4 w-10 animate-pulse bg-muted/50 rounded" />
        </div>
      </CardContent>
    </Card>
  );
}

export function NewsDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="h-8 w-3/4 animate-pulse bg-muted/50 rounded" />
        <div className="flex items-center gap-3">
          <div className="h-5 w-24 animate-pulse bg-muted/50 rounded-full" />
          <span className="text-xs text-muted-foreground">•</span>
          <div className="h-5 w-20 animate-pulse bg-muted/50 rounded" />
          <span className="text-xs text-muted-foreground">•</span>
          <div className="h-5 w-32 animate-pulse bg-muted/50 rounded" />
        </div>
      </div>
      
      <div className="space-y-3">
        <div className="h-5 w-full animate-pulse bg-muted/50 rounded" />
        <div className="h-5 w-full animate-pulse bg-muted/50 rounded" />
        <div className="h-5 w-11/12 animate-pulse bg-muted/50 rounded" />
      </div>
      
      <div className="space-y-3 pt-4 border-t">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-full animate-pulse bg-muted/50 rounded" />
            <div className="h-4 w-11/12 animate-pulse bg-muted/50 rounded" />
          </div>
        ))}
        <div className="h-4 w-8/12 animate-pulse bg-muted/50 rounded" />
      </div>
    </div>
  );
}

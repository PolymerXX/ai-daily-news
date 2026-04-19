'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/sidebar';
import MobileNav from '@/components/layout/mobile-nav';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Star, ArrowLeft, ExternalLink, Newspaper, Calendar, Tag, BookOpen, Sparkles, Hash, Share2, List, ChevronDown, ChevronRight } from 'lucide-react';
import { NewsItem } from '@/types/news';
import { cn } from '@/lib/utils';
import { categoryColors } from '@/lib/constants';
import { useFavorites } from '@/hooks/use-favorites';
import { useToast } from '@/components/layout/toast-provider';
import { NewsDetailSkeleton } from '@/components/news/news-skeleton';

/* ─── Section splitting utilities ─── */

interface ContentSection {
  id: string;
  title: string;
  body: string;
}

/** Split raw content into logical sections with short titles.
 *  Supports markdown headings (## / ###) as natural section dividers.
 */
function splitIntoSections(content: string): ContentSection[] {
  if (!content) return [];

  const charCount = content.replace(/\s/g, '').length;

  // Short content — single section
  if (charCount < 500) {
    return [{ id: 's-0', title: '概述', body: content }];
  }

  // Strategy 0: split by markdown headings (## / ###) — best for scraped pages
  const mdSections = splitByMarkdownHeadings(content);
  if (mdSections.length > 1) {
    return mdSections;
  }

  // Strategy 1: split by double newline (natural paragraphs)
  let blocks = content
    .replace(/\n{3,}/g, '\n\n')
    .split('\n\n')
    .map((b) => b.trim())
    .filter(Boolean);

  // If single block but long, split by "Meanwhile" / transition phrases, or by char count
  if (blocks.length === 1) {
    blocks = splitByTransitions(content);
  }

  if (blocks.length <= 1) {
    return [{ id: 's-0', title: '概述', body: content }];
  }

  // Merge very short blocks (< 80 chars) into the previous block
  const merged: string[] = [];
  for (const block of blocks) {
    if (merged.length > 0 && block.length < 80) {
      merged[merged.length - 1] += ' ' + block;
    } else {
      merged.push(block);
    }
  }

  // Limit to max 8 sections
  const sectioned = merged.length > 8
    ? mergeToCount(merged, 8)
    : merged;

  return sectioned.map((block, i) => ({
    id: `s-${i}`,
    title: extractSectionTitle(block, i, sectioned.length),
    body: block,
  }));
}

/** Split content by markdown headings (## / ### / standalone **bold**) into titled sections */
function splitByMarkdownHeadings(content: string): ContentSection[] {
  const lines = content.split('\n');
  const sections: ContentSection[] = [];
  let currentTitle = '';
  let currentBody: string[] = [];
  let sectionIndex = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Match ## or ### headings
    const headingMatch = trimmed.match(/^#{2,3}\s+(.+)$/);
    // Match standalone bold line as section heading (smol.ai style)
    const boldLineMatch = /^\*\*(.+)\*\*$/.test(trimmed) && trimmed.length > 10;

    if (headingMatch || boldLineMatch) {
      // Save previous section
      if (currentBody.length > 0) {
        const body = currentBody.join('\n').trim();
        if (body) {
          sections.push({
            id: `s-${sectionIndex}`,
            title: currentTitle || `第 ${sectionIndex + 1} 部分`,
            body,
          });
          sectionIndex++;
        }
      }
      currentTitle = boldLineMatch
        ? trimmed.replace(/\*\*/g, '')
        : (headingMatch![1].replace(/\*\*/g, '').trim());
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }

  // Save last section
  if (currentBody.length > 0) {
    const body = currentBody.join('\n').trim();
    if (body) {
      sections.push({
        id: `s-${sectionIndex}`,
        title: currentTitle || `第 ${sectionIndex + 1} 部分`,
        body,
      });
    }
  }

  // Filter out sections that are just a heading (no real body content)
  return sections.filter((s) => s.body.replace(/\s/g, '').length > 20);
}

/** Split by transition phrases or fall back to equal-length chunks */
function splitByTransitions(text: string): string[] {
  // Common transition phrases in English news summaries
  const transitions = /\b(Meanwhile|Additionally|Furthermore|In other news|On another note|Separately|Also|However|Looking ahead)\b/gi;

  // Find all transition positions
  const positions: number[] = [0];
  let match: RegExpExecArray | null;
  while ((match = transitions.exec(text)) !== null) {
    positions.push(match.index);
  }

  if (positions.length >= 3) {
    // We have enough transitions to split meaningfully
    const chunks: string[] = [];
    for (let i = 0; i < positions.length; i++) {
      const start = positions[i];
      const end = i + 1 < positions.length ? positions[i + 1] : text.length;
      const chunk = text.substring(start, end).trim();
      if (chunk) chunks.push(chunk);
    }
    return chunks.length > 1 ? chunks : [text];
  }

  // Fallback: split into ~4 equal chunks at sentence boundaries
  const target = 4;
  const chunkSize = Math.ceil(text.length / target);
  const chunks: string[] = [];

  // First, split into sentences
  const sentenceEnds = [...text.matchAll(/(?<=[.。!！?？])\s+(?=[A-Z\u4e00-\u9fff"『【])/g)].map(m => m.index!);

  if (sentenceEnds.length >= target - 1) {
    // Pick split points closest to ideal chunk boundaries
    for (let i = 0; i < target; i++) {
      const idealEnd = (i + 1) * chunkSize;
      // Find the sentence end closest to our ideal boundary
      let bestIdx = sentenceEnds.findIndex(p => p >= idealEnd);
      if (bestIdx === -1) bestIdx = sentenceEnds.length - 1;
      // Store the split position
      if (i === 0) {
        chunks.push(text.substring(0, sentenceEnds[bestIdx] + 1).trim());
      } else if (i < target - 1) {
        const prevEnd = sentenceEnds[sentenceEnds.findIndex(p => p >= i * chunkSize)];
        chunks.push(text.substring(prevEnd + 1, sentenceEnds[bestIdx] + 1).trim());
      } else {
        // Last chunk gets everything remaining
        const prevEnd = sentenceEnds[sentenceEnds.findIndex(p => p >= i * chunkSize)];
        chunks.push(text.substring(prevEnd + 1).trim());
      }
    }
  } else {
    // Not enough sentences for clean splitting — equal char chunks at word boundaries
    for (let i = 0; i < target; i++) {
      const start = i * chunkSize;
      const end = i + 1 < target ? (i + 1) * chunkSize : text.length;
      let chunk = text.substring(start, end);

      if (i > 0 && start > 0) {
        const spaceIdx = chunk.indexOf(' ');
        if (spaceIdx > 0 && spaceIdx < 30) {
          chunk = chunk.substring(spaceIdx + 1);
        }
      }
      if (i + 1 < target) {
        const lastSpace = chunk.lastIndexOf(' ');
        if (lastSpace > chunk.length * 0.5) {
          chunk = chunk.substring(0, lastSpace);
        }
      }
      if (chunk.trim()) chunks.push(chunk.trim());
    }
  }
  return chunks.filter(c => c.length > 0).length > 1 ? chunks.filter(c => c.length > 0) : [text];
}

/** Merge array to target count */
function mergeToCount(blocks: string[], target: number): string[] {
  if (blocks.length <= target) return blocks;
  const step = blocks.length / target;
  const result: string[] = [];
  for (let i = 0; i < target; i++) {
    const start = Math.round(i * step);
    const end = Math.round((i + 1) * step);
    result.push(blocks.slice(start, end).join('\n\n'));
  }
  return result;
}

/** Extract a short title from a content block */
function extractSectionTitle(block: string, index: number, total: number): string {
  const clean = block.replace(/\*\*/g, '');

  // Check if block starts with a known transition phrase — skip it and use the next entity
  const transitionSkip = clean.match(/^(Meanwhile|Additionally|Furthermore|In other news|Separately|Also|However)\s*,?\s*/i);
  const body = transitionSkip ? clean.substring(transitionSkip[0].length) : clean;

  // Find first "proper noun" style entity: capitalized words (skip articles/prepositions), numbers, or known brands
  const noArticles = body.replace(/^(The|This|That|These|Those|It|An|A|In|On|At|To|For|With|By)\s+/i, '');
  const entityMatch = noArticles.match(/^([A-Z][a-zA-Z0-9&'.]+(?:\s+[A-Z][a-zA-Z0-9&'.]+){0,2})/);
  if (entityMatch && entityMatch[1].length >= 4 && entityMatch[1].length <= 40) {
    return entityMatch[1].trim();
  }

  // Find any **bold** entity in the block as title
  const boldMatch = block.match(/\*\*([^*]{4,35})\*\*/);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Find AI/domain keywords in the block
  const aiKeywords = [
    /\b(artificial intelligence|machine learning|deep learning)\b/i,
    /\b(harness engineering|agent|prompt|inference|training|fine-?tun\w*)\b/i,
    /\b(GPT|LLM|SSM|transformer|benchmark|MCP|DSPy)\b/,
    /\b(AI|API|GPU|TPU|NLP|RLHF|DPO|LoRA)\b/,
  ];
  for (const kw of aiKeywords) {
    const m = block.match(kw);
    if (m) {
      const found = m[1] || m[0];
      if (found.length >= 2 && found.length <= 35) return found;
    }
  }

  // For Chinese text, find first topic-like phrase
  const cnMatch = body.match(/^([\u4e00-\u9fff]{2,10}(?:公司|模型|发布|推出|更新|宣布|上线|开源|芯片|政策|法规){0,1})/);
  if (cnMatch && cnMatch[1].length >= 2) return cnMatch[1];

  // First few words as fallback
  const words = body.split(/[\s,;，；]+/).slice(0, 4).join(' ');
  if (words.length >= 3 && words.length <= 40) return words;

  // Generic fallback
  if (total <= 1) return '概述';
  if (total <= 3) return ['概述', '详情', '补充'][index] || `第 ${index + 1} 节`;
  return `第 ${index + 1} 部分`;
}

/* ─── Component ─── */

export default function NewsDetail() {
  const params = useParams();
  const router = useRouter();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { showToast } = useToast();
  const [news, setNews] = useState<NewsItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scraping, setScraping] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('');
  const [tocOpen, setTocOpen] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);

  const isSmol = useMemo(() => (params.id as string).startsWith('smol-'), [params.id]);

  useEffect(() => {
    async function fetchNews() {
      setLoading(true);
      setError('');
      try {
        const id = params.id as string;
        const apiUrl = isSmol ? '/api/news/smol' : '/api/news';
        const res = await fetch(apiUrl, { signal: AbortSignal.timeout(30_000) });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || '获取新闻失败');
        const found = (data.news || []).find((item: NewsItem) => item.id === id);
        setNews(found ?? null);

        // For smol.ai articles, scrape the full page for richer content
        if (found?.url && (id as string).startsWith('smol-')) {
          try {
            setScraping(true);
            const scrapeRes = await fetch(`/api/news/scrape?url=${encodeURIComponent(found.url)}`, {
              signal: AbortSignal.timeout(20_000),
            });
            const scrapeData = await scrapeRes.json();
            if (scrapeData.content && scrapeData.content.length > 500) {
              setNews((prev) => prev ? { ...prev, content: scrapeData.content } : null);
            }
          } catch {
            // Scrape failed — keep RSS content as fallback
          } finally {
            setScraping(false);
          }
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : '未知错误');
      } finally {
        setLoading(false);
      }
    }
    fetchNews();
  }, [params.id, isSmol]);

  const sections = useMemo(() => splitIntoSections(news?.content || ''), [news]);

  // Intersection observer for active TOC tracking
  useEffect(() => {
    if (sections.length <= 1) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 }
    );
    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    // Set first section active initially
    if (sections.length > 0) setActiveSection(sections[0].id);
    return () => observer.disconnect();
  }, [sections]);

  const handleToggleFavorite = useCallback(() => {
    if (!news) return;
    const wasFavorite = isFavorite(news.id);
    toggleFavorite(news.id);
    showToast(wasFavorite ? '已取消收藏' : '已收藏');
  }, [news, toggleFavorite, showToast, isFavorite]);

  const handleShare = useCallback(() => {
    if (!news) return;
    navigator.clipboard.writeText(window.location.href);
    showToast('链接已复制');
  }, [news, showToast]);

  const scrollToSection = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const dateInfo = useMemo(() => {
    if (!news) return null;
    const d = new Date(news.publishTime);
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return {
      full: d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }),
      weekday: `星期${weekdays[d.getDay()]}`,
    };
  }, [news]);

  const readingTime = useMemo(() => {
    if (!news) return '';
    const charCount = ((news.summary || '') + (news.content || '')).replace(/\s/g, '').length;
    return `${Math.max(1, Math.ceil(charCount / 300))} 分钟阅读`;
  }, [news]);

  const highlights = useMemo(() => {
    if (!news?.content) return [];
    const matches = news.content.match(/\*\*([^*]+)\*\*/g) || [];
    return [...new Set(matches.map((m) => m.replace(/\*\*/g, '')))].slice(0, 8);
  }, [news]);

  const showToc = sections.length > 1;

  if (loading) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 lg:ml-64 pb-16 lg:pb-0">
          <div className="container mx-auto px-4 py-8 max-w-4xl">
            <NewsDetailSkeleton />
          </div>
        </main>
        <MobileNav />
      </div>
    );
  }

  if (!news) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 lg:ml-64 pb-16 lg:pb-0">
          <div className="container mx-auto px-4 py-8 max-w-4xl text-center">
            <p className="text-muted-foreground mb-4">{error || '新闻未找到'}</p>
            <button onClick={() => router.back()} className="flex items-center gap-2 text-primary hover:underline mx-auto">
              <ArrowLeft className="h-4 w-4" /> 返回首页
            </button>
          </div>
        </main>
        <MobileNav />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 lg:ml-64 pb-16 lg:pb-0">
        <div className="container mx-auto px-4 py-8">
          <div className="flex gap-8 max-w-7xl mx-auto">
            {/* ── Main column ── */}
            <div className="flex-1 min-w-0 max-w-4xl">
              <button
                onClick={() => router.back()}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6 group"
              >
                <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                <span>返回列表</span>
              </button>

              <article className="space-y-6">
                {/* Meta bar */}
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="outline" className={cn('text-sm font-semibold', categoryColors[news.category] || '')}>
                    {news.category}
                  </Badge>
                  {news.highlight && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                      <Sparkles className="h-3 w-3" /> 今日亮点
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {isSmol ? 'smol.ai' : 'AI Agent'}
                  </span>
                </div>

                {/* Title */}
                <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight tracking-tight">
                  {news.title}
                </h1>

                {/* Info grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <InfoPill icon={Newspaper} label="来源" value={news.source} />
                  {dateInfo && <InfoPill icon={Calendar} label="发布" value={`${dateInfo.full} ${dateInfo.weekday}`} />}
                  <InfoPill icon={BookOpen} label="预计" value={readingTime} />
                </div>

                {/* Highlights */}
                {highlights.length > 0 && (
                  <div className="rounded-xl border border-border/50 bg-card/50 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="h-4 w-4 text-amber-500" />
                      <span className="text-sm font-semibold text-foreground">关键要点</span>
                      <span className="text-xs text-muted-foreground">{highlights.length} 项</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {highlights.map((h, i) => (
                        <span key={i} className="inline-flex items-center gap-1 text-xs bg-muted/80 text-muted-foreground px-2.5 py-1 rounded-md hover:bg-accent/50 transition-colors">
                          <Hash className="h-3 w-3 shrink-0" /> {h}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Summary */}
                <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-1 w-4 rounded-full bg-primary" />
                      <h2 id="toc-summary" className="text-sm font-semibold text-foreground uppercase tracking-wider">摘要</h2>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{renderMarkdown(news.summary)}</p>
                  </CardContent>
                </Card>

                {/* ── Content with sections ── */}
                <Card className="border-border/50">
                  <CardContent className="p-5 md:p-6" ref={contentRef}>
                    <div className="flex items-center gap-2 mb-5">
                      <div className="h-1 w-4 rounded-full bg-blue-500" />
                      <h2 id="toc-content" className="text-sm font-semibold text-foreground uppercase tracking-wider">详细内容</h2>
                      {scraping && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs text-blue-500">
                          <span className="inline-block h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                          正在加载完整内容...
                        </span>
                      )}
                      {showToc && !scraping && (
                        <span className="ml-auto text-xs text-muted-foreground">{sections.length} 个章节</span>
                      )}
                    </div>

                    <div className="space-y-8">
                      {sections.map((section, idx) => (
                        <section
                          key={section.id}
                          id={section.id}
                          className={cn(
                            'scroll-mt-24',
                            idx > 0 && 'pt-6 border-t border-border/30'
                          )}
                        >
                          <h3
                            className="text-base font-semibold text-foreground mb-3 flex items-center gap-2 cursor-pointer hover:text-primary transition-colors"
                            onClick={() => scrollToSection(section.id)}
                          >
                            <span className="text-xs font-mono text-muted-foreground bg-muted w-6 h-6 rounded flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            {section.title}
                          </h3>
                          <div className="text-sm text-muted-foreground leading-[1.85] pl-8">
                            {renderMarkdown(section.body)}
                          </div>
                        </section>
                      ))}
                    </div>

                    {/* Source URL */}
                    {'url' in news && news.url && (
                      <div className="mt-8 pt-4 border-t border-border/50 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        <a
                          href={news.url as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium"
                        >
                          <ExternalLink className="h-4 w-4" /> 查看原文
                        </a>
                        <span className="text-xs text-muted-foreground truncate max-w-xs sm:max-w-md">
                          {news.url as string}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Bottom action bar */}
                <div className="flex items-center justify-between pt-2 pb-4">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Tag className="h-3 w-3" />
                    <span>ID: {news.id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={handleShare} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
                      <Share2 className="h-4 w-4" /> 分享
                    </button>
                    <button
                      onClick={handleToggleFavorite}
                      className={cn(
                        'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                        isFavorite(news.id)
                          ? 'bg-yellow-500/10 text-yellow-600 border border-yellow-500/30 hover:bg-yellow-500/20'
                          : 'bg-muted text-muted-foreground border border-border/50 hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <Star className={cn('h-4 w-4', isFavorite(news.id) && 'fill-current')} />
                      {isFavorite(news.id) ? '已收藏' : '收藏'}
                    </button>
                  </div>
                </div>
              </article>
            </div>

            {/* ── Sidebar TOC (desktop) ── */}
            {showToc && (
              <aside className="hidden lg:block w-56 shrink-0">
                <div className="sticky top-24 space-y-4">
                  {/* TOC card */}
                  <div className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <List className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-semibold text-foreground uppercase tracking-wider">目录</span>
                    </div>
                    <nav className="space-y-1">
                      {/* Summary & Content as top-level anchors */}
                      {[
                        { id: 'toc-summary', label: '摘要' },
                        { id: 'toc-content', label: '详细内容' },
                      ].map((item) => (
                        <button
                          key={item.id}
                          onClick={() => scrollToSection(item.id)}
                          className={cn(
                            'block w-full text-left text-xs px-2 py-1.5 rounded-md transition-colors truncate',
                            activeSection === item.id
                              ? 'text-primary bg-primary/10 font-medium'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                          )}
                        >
                          {item.label}
                        </button>
                      ))}
                      {/* Section items */}
                      {sections.map((section, idx) => (
                        <button
                          key={section.id}
                          onClick={() => scrollToSection(section.id)}
                          className={cn(
                            'block w-full text-left text-xs px-2 py-1.5 rounded-md transition-colors truncate',
                            activeSection === section.id
                              ? 'text-primary bg-primary/10 font-medium'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                          )}
                        >
                          <span className="text-[10px] font-mono text-muted-foreground/60 mr-1">{idx + 1}.</span>
                          {section.title}
                        </button>
                      ))}
                    </nav>
                  </div>

                  {/* Quick stats */}
                  <div className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-4 space-y-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">章节</span>
                      <span className="font-medium">{sections.length}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">字数</span>
                      <span className="font-medium">{(news.content || '').replace(/\s/g, '').length}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">要点</span>
                      <span className="font-medium">{highlights.length}</span>
                    </div>
                  </div>
                </div>
              </aside>
            )}
          </div>
        </div>
      </main>

      {/* ── Mobile TOC (horizontal scroll bar) ── */}
      {showToc && (
        <div className="lg:hidden fixed bottom-16 left-0 right-0 z-30 bg-background/95 backdrop-blur-sm border-t border-border/50">
          <button
            onClick={() => setTocOpen(!tocOpen)}
            className="flex items-center gap-2 w-full px-4 py-2 text-xs font-semibold text-foreground"
          >
            {tocOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <List className="h-3 w-3" />
            目录 · {sections.length} 章节
          </button>
          {tocOpen && (
            <div className="flex gap-1 px-4 pb-2 overflow-x-auto scrollbar-hide">
              {sections.map((section, idx) => (
                <button
                  key={section.id}
                  onClick={() => {
                    scrollToSection(section.id);
                    setTocOpen(false);
                  }}
                  className={cn(
                    'shrink-0 text-[11px] px-3 py-1 rounded-full border transition-colors',
                    activeSection === section.id
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-muted/50 text-muted-foreground border-transparent hover:border-border/50'
                  )}
                >
                  {idx + 1}. {section.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <MobileNav />
    </div>
  );
}

/* ─── Helpers ─── */

/** Render **bold** markdown in plain text */
/** Render markdown-like text: bold, links, lists, paragraphs */
function renderMarkdown(text: string): React.ReactNode {
  if (!text) return null;
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inList = false;
  let listType: 'ul' | 'ol' = 'ul';
  let listItems: React.ReactNode[] = [];
  let keyIdx = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      const Tag = listType;
      elements.push(
        <Tag key={`list-${keyIdx++}`} className={cn('pl-4 my-2', listType === 'ol' ? 'list-decimal' : 'list-disc')}>
          {listItems}
        </Tag>
      );
      listItems = [];
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Ordered list item
    const olMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (olMatch) {
      if (!inList || listType !== 'ol') { flushList(); inList = true; listType = 'ol'; }
      listItems.push(<li key={`li-${keyIdx++}`} className="text-sm text-muted-foreground leading-[1.85]">{renderInline(olMatch[2])}</li>);
      continue;
    }

    // Unordered list item
    const ulMatch = line.match(/^[-*]\s+(.+)/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') { flushList(); inList = true; listType = 'ul'; }
      listItems.push(<li key={`li-${keyIdx++}`} className="text-sm text-muted-foreground leading-[1.85]">{renderInline(ulMatch[1])}</li>);
      continue;
    }

    // Empty line
    if (!line) {
      flushList();
      elements.push(<br key={`br-${keyIdx++}`} />);
      continue;
    }

    // Regular paragraph line
    flushList();
    elements.push(
      <span key={`p-${keyIdx++}`} className="text-sm text-muted-foreground leading-[1.85]">
        {renderInline(line)}
      </span>
    );
  }
  flushList();
  return <>{elements}</>;
}

/** Render inline markdown: **bold** and [text](url) */
function renderInline(text: string): React.ReactNode {
  // Split by links first, then by bold
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer"
           className="text-primary hover:underline">
          {renderBoldInline(linkMatch[1], i)}
        </a>
      );
    }
    return renderBoldInline(part, i);
  });
}

function renderBoldInline(text: string, baseKey: number): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, j) => {
    const boldMatch = part.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) {
      return <strong key={`${baseKey}-b${j}`} className="text-foreground font-medium">{boldMatch[1]}</strong>;
    }
    return part;
  });
}

function InfoPill({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground truncate">{value}</span>
    </div>
  );
}

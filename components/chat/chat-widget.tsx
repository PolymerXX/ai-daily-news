'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Trash2, Bot, User, GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const MIN_W = 300;
const MIN_H = 350;
const MAX_W = 800;
const MAX_H = 700;
const DEFAULT_W = 380;
const DEFAULT_H = 520;

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function toRect(w: number, h: number, right: number, bottom: number, vw: number, vh: number): Rect {
  return {
    left: vw - right - w,
    top: vh - bottom - h,
    width: w,
    height: h,
  };
}

function toCSS(r: Rect, vw: number, vh: number): { left: number; top: number; width: number; height: number } {
  return {
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
  };
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Use left/top positioning internally for simpler math
  // Initialize with 0s on both server & client to avoid hydration mismatch,
  // then set correct position after mount.
  const [rect, setRect] = useState<Rect>({ left: 0, top: 0, width: DEFAULT_W, height: DEFAULT_H });
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    setRect(toRect(DEFAULT_W, DEFAULT_H, 24, 24, window.innerWidth, window.innerHeight));
  }, []);

  const modeRef = useRef<'move' | 'resize' | null>(null);
  const edgeRef = useRef<Edge | null>(null);
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const rectStartRef = useRef<Rect>({ left: 0, top: 0, width: DEFAULT_W, height: DEFAULT_H });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  // ── Move (drag header) ──
  const onHeaderDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    modeRef.current = 'move';
    edgeRef.current = null;
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    rectStartRef.current = { ...rect };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [rect]);

  // ── Resize (drag edges) ──
  const onEdgeDown = useCallback((edge: Edge) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    modeRef.current = 'resize';
    edgeRef.current = edge;
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    rectStartRef.current = { ...rect };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [rect]);

  // ── Pointer move/up ──
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const mode = modeRef.current;
      if (!mode) return;

      const dx = e.clientX - pointerStartRef.current.x;
      const dy = e.clientY - pointerStartRef.current.y;
      const s = rectStartRef.current;

      if (mode === 'move') {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let newLeft = s.left + dx;
        let newTop = s.top + dy;
        // Clamp so at least 60px stays visible
        newLeft = Math.max(-s.width + 60, Math.min(newLeft, vw - 60));
        newTop = Math.max(-s.height + 60, Math.min(newTop, vh - 60));
        setRect({ ...s, left: newLeft, top: newTop });
        return;
      }

      // Resize — keep opposite edges fixed
      const edge = edgeRef.current!;

      let newLeft = s.left;
      let newTop = s.top;
      let newW = s.width;
      let newH = s.height;

      // Right edge moves
      if (edge.includes('e')) {
        newW = Math.min(Math.max(s.width + dx, MIN_W), MAX_W);
      }
      // Left edge moves — keep right edge fixed
      if (edge.includes('w')) {
        const possibleW = Math.min(Math.max(s.width - dx, MIN_W), MAX_W);
        newLeft = s.left + (s.width - possibleW);
        newW = possibleW;
      }
      // Bottom edge moves
      if (edge.includes('s')) {
        newH = Math.min(Math.max(s.height + dy, MIN_H), MAX_H);
      }
      // Top edge moves — keep bottom edge fixed
      if (edge.includes('n')) {
        const possibleH = Math.min(Math.max(s.height - dy, MIN_H), MAX_H);
        newTop = s.top + (s.height - possibleH);
        newH = possibleH;
      }

      setRect({ left: newLeft, top: newTop, width: newW, height: newH });
    };

    const onUp = () => {
      modeRef.current = null;
      edgeRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    let assistantContent = '';
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) throw new Error('请求失败');

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No response body');

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.done) continue;
            if (parsed.error) {
              assistantContent = `⚠️ ${parsed.error}`;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
                return updated;
              });
              continue;
            }
            if (parsed.text) {
              assistantContent += parsed.text;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
                return updated;
              });
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } catch (err) {
      assistantContent = `抱歉，出错了：${err instanceof Error ? err.message : '未知错误'}`;
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  const edgeStyle = (edge: Edge): React.CSSProperties => {
    const base: React.CSSProperties = { position: 'absolute', zIndex: 10 };
    switch (edge) {
      case 'n':  return { ...base, top: -3, left: 8, right: 8, height: 6, cursor: 'n-resize' };
      case 's':  return { ...base, bottom: -3, left: 8, right: 8, height: 6, cursor: 's-resize' };
      case 'w':  return { ...base, left: -3, top: 8, bottom: 8, width: 6, cursor: 'w-resize' };
      case 'e':  return { ...base, right: -3, top: 8, bottom: 8, width: 6, cursor: 'e-resize' };
      case 'nw': return { ...base, top: -4, left: -4, width: 12, height: 12, cursor: 'nw-resize' };
      case 'ne': return { ...base, top: -4, right: -4, width: 12, height: 12, cursor: 'ne-resize' };
      case 'sw': return { ...base, bottom: -4, left: -4, width: 12, height: 12, cursor: 'sw-resize' };
      case 'se': return { ...base, bottom: -4, right: -4, width: 12, height: 12, cursor: 'se-resize' };
    }
  };

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };

  return (
    <>
      {/* Floating bubble */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'fixed z-50 flex items-center justify-center',
          'w-14 h-14 rounded-full shadow-lg transition-all duration-300',
          'bg-primary text-primary-foreground hover:scale-110',
          open && 'scale-0 opacity-0 pointer-events-none'
        )}
        style={{ right: 24, bottom: 24 }}
        aria-label="打开AI对话"
      >
        <MessageCircle className="w-6 h-6" />
      </button>

      {/* Chat panel */}
      <div
        className={cn(
          'z-50 flex flex-col overflow-hidden',
          'rounded-2xl shadow-2xl border border-border/50',
          'bg-background/95 backdrop-blur-xl',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        style={panelStyle}
      >
        {/* Resize edges */}
        {(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as Edge[]).map(edge => (
          <div
            key={edge}
            style={edgeStyle(edge)}
            onPointerDown={onEdgeDown(edge)}
          />
        ))}

        {/* Header — draggable */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/30 flex-shrink-0 select-none"
          style={{ cursor: 'grab' }}
          onPointerDown={onHeaderDown}
        >
          <div className="flex items-center gap-2">
            <GripHorizontal className="w-4 h-4 text-muted-foreground/50" />
            <Bot className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm">AI 资讯助手</span>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="清空对话"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <Bot className="w-10 h-10 mb-3 text-primary/40" />
              <p className="text-sm mb-1">你好！我是 AI 资讯助手</p>
              <p className="text-xs">可以问我任何关于 AI 的问题</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              {msg.role === 'assistant' && (
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-muted rounded-bl-md'
                )}
              >
                {msg.content || (
                  <span className="inline-block w-1.5 h-4 bg-current animate-pulse rounded-full" />
                )}
              </div>
              {msg.role === 'user' && (
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
                  <User className="w-4 h-4 text-primary" />
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-border/50 flex-shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的问题..."
              rows={1}
              className={cn(
                'flex-1 resize-none rounded-xl px-3.5 py-2.5 text-sm',
                'bg-muted border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary/50',
                'placeholder:text-muted-foreground',
                'max-h-24 overflow-y-auto'
              )}
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className={cn(
                'flex-shrink-0 p-2.5 rounded-xl transition-all',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed'
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

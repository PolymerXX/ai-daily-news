"""AI Daily News Backend - Jina Reader + Brave Search + Pydantic AI agent.

The agent uses Brave Search to find AI news and Jina Reader to scrape content,
then returns structured NewsItem[] for the frontend.

Usage:
    cd python-backend
    uv run uvicorn app.server:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import json
import os
import re
import time
import httpx
from datetime import date, datetime
from contextlib import asynccontextmanager
from pathlib import Path

# Fix proxy: ensure httpx can reach external APIs via Mihomo on port 7890.
# The system env vars may point to dead ports (e.g. 7899) or socks:// scheme (unsupported by httpx).
_PROXY = "http://127.0.0.1:7890"
for _k in ('all_proxy', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY'):
    os.environ[_k] = _PROXY

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider
from starlette.responses import JSONResponse, StreamingResponse

load_dotenv(Path(__file__).parent.parent / ".env")


# ── Config ────────────────────────────────────────────────

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "")
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "openai:xiaomi/mimo-v2-flash")

MODEL_NAME = DEFAULT_MODEL.split(":", 1)[1] if ":" in DEFAULT_MODEL else DEFAULT_MODEL

JINA_API_KEY = os.getenv("JINA_API_KEY", "")
BRAVE_API_KEY = os.getenv("BRAVE_API_KEY", "")
FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY", "")  # kept as fallback


# ── Output Types ──────────────────────────────────────────


class NewsItem(BaseModel):
    """A single news article, matching the frontend NewsItem type."""

    id: str = Field(description="Unique ID, use format like 'ai-20250417-01'")
    title: str = Field(description="News headline in Chinese")
    summary: str = Field(description="Brief summary in Chinese, 1-2 sentences")
    source: str = Field(description="Source website name, e.g. '量子位', '36kr'")
    url: str = Field(description="Original article URL")
    publishTime: str = Field(description="Publish time in format YYYY-MM-DD")
    category: str = Field(
        description="Category: 大模型, 芯片, 政策, 应用, 开源, or 自动驾驶"
    )
    highlight: bool = Field(
        description="Whether this is a top/highlight article (true for top 3)"
    )
    content: str = Field(description="Full article content in Chinese, at least 200 chars")


class NewsList(BaseModel):
    """List of generated news items."""

    news: list[NewsItem] = Field(description="List of AI news articles")


# ── Model ─────────────────────────────────────────────────


def create_model() -> OpenAIModel:
    """Create model with custom provider (OpenRouter)."""
    provider = OpenAIProvider(
        base_url=OPENAI_BASE_URL,
        api_key=OPENAI_API_KEY,
        http_client=httpx.AsyncClient(proxy=None),
    )
    return OpenAIModel(MODEL_NAME, provider=provider)


# ── Jina Reader (scraping) ───────────────────────────────


async def jina_scrape(url: str, timeout: int = 30) -> str:
    """Scrape a URL using Jina Reader API and return markdown content.

    Jina free tier works without a key. If JINA_API_KEY is set, it's sent
    for higher rate limits. Falls back to Firecrawl if Jina fails.
    """
    # Try Jina Reader (free tier works without key)
    try:
        headers = {
            "X-Return-Format": "markdown",
            "X-No-Cache": "true",
        }
        if JINA_API_KEY:
            headers["Authorization"] = f"Bearer {JINA_API_KEY}"
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(
                f"https://r.jina.ai/{url}",
                headers=headers,
            )
            resp.raise_for_status()
            text = resp.text.strip()
            if text and len(text) > 50:
                return text
    except Exception as e:
        print(f"[jina] scrape failed for {url}: {e}")

    # Fallback to Firecrawl
    if FIRECRAWL_API_KEY:
        try:
            from firecrawl import Firecrawl
            fc = Firecrawl(api_key=FIRECRAWL_API_KEY)
            result = fc.scrape(url, formats=["markdown"])
            markdown = getattr(result, "markdown", "") or ""
            if markdown and len(markdown) > 50:
                return markdown
        except Exception as e:
            print(f"[firecrawl] fallback scrape failed for {url}: {e}")

    return ""


# ── Brave Search ──────────────────────────────────────────


async def brave_search(query: str, count: int = 10) -> list[dict]:
    """Search the web using Brave Search API.

    Falls back to Firecrawl search if Brave fails and Firecrawl key is available.
    Returns list of {title, url, description} dicts.
    """
    # Try Brave Search first
    if BRAVE_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    "https://api.search.brave.com/res/v1/web/search",
                    params={"q": query, "count": str(count)},
                    headers={
                        "X-Subscription-Token": BRAVE_API_KEY,
                        "Accept": "application/json",
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                results = []
                for item in data.get("web", {}).get("results", []):
                    results.append({
                        "title": item.get("title", ""),
                        "url": item.get("url", ""),
                        "description": item.get("description", ""),
                    })
                if results:
                    return results
        except Exception as e:
            print(f"[brave] search failed for '{query}': {e}")

    # Fallback to Firecrawl search
    if FIRECRAWL_API_KEY:
        try:
            from firecrawl import Firecrawl
            fc = Firecrawl(api_key=FIRECRAWL_API_KEY)
            result = fc.search(query, limit=count)
            items = []
            web_results = result.web if hasattr(result, "web") and result.web else []
            for r in web_results:
                items.append({
                    "title": getattr(r, "title", ""),
                    "url": getattr(r, "url", ""),
                    "description": getattr(r, "description", ""),
                })
            if items:
                return items
        except Exception as e:
            print(f"[firecrawl] fallback search failed for '{query}': {e}")

    return []


# ── News Agent ────────────────────────────────────────────

GENERATE_NEWS_PROMPT = """\
你是一个专业的 AI 资讯编辑。你的任务是为"AI 日报"生成今日 AI 领域的重要新闻列表。

工作流程：
1. 先用 get_smol_ai_news 工具获取 smol.ai 的最新英文 AI 资讯摘要
2. 再用 search_web 工具搜索中文 AI 新闻（尝试不同关键词，如"AI大模型"、"人工智能最新进展"、"AI芯片"、"LLM"等）
3. 综合两个来源，选择最重要、最有趣的新闻（8-12条）
4. 对于重要新闻，用 scrape_article 工具获取详细内容
5. 整理成结构化新闻列表返回

要求：
- 新闻必须真实，基于搜索到的实际内容
- 标题和摘要用中文
- 内容要充实（每条至少200字）
- 选出 3 条最重要的高亮新闻（highlight=true）
- 覆盖不同分类：大模型、芯片、政策、应用、开源等
- 发布时间尽量准确，用 YYYY-MM-DD 格式
- source 填来源网站名称
- url 填原文链接
"""

model = create_model()

agent = Agent(
    model,
    deps_type=None,
    output_type=NewsList,
    instructions=GENERATE_NEWS_PROMPT,
    retries=2,
)


@agent.tool
async def search_web(ctx: RunContext, query: str) -> str:
    """Search the web for AI news articles.

    Args:
        query: Search query, e.g. "AI大模型 最新进展 2025"
    """
    try:
        items = await brave_search(query, count=10)
        if not items:
            return f"搜索 '{query}' 没有找到结果。请尝试其他关键词。"
        return json.dumps(items, ensure_ascii=False)
    except Exception as e:
        return f"搜索失败: {e}"


@agent.tool
async def scrape_article(ctx: RunContext, url: str) -> str:
    """Scrape full article content from a URL.

    Args:
        url: The article URL to scrape.
    """
    try:
        markdown = await jina_scrape(url)
        if not markdown:
            return f"抓取失败，页面内容为空: {url}"
        # Truncate to avoid token limits
        return markdown[:6000]
    except Exception as e:
        return f"抓取失败: {e}"


@agent.tool
async def get_smol_ai_news(ctx: RunContext) -> str:
    """Get the latest AI news summary from smol.ai (AINews by smol.ai).

    Returns recent AI headlines from top AI Twitters, Reddits and Discords.
    Use this as an additional source alongside Chinese web search results.
    """
    try:
        markdown = await jina_scrape("https://news.smol.ai/")
        if not markdown or len(markdown) < 100:
            return "获取 smol.ai 资讯失败，页面内容为空"
        # Trim to useful content
        return markdown[:8000]
    except Exception as e:
        return f"获取 smol.ai 资讯失败: {e}"


# ── Chat Agent (text streaming) ──────────────────────────


class ChatDeps(BaseModel):
    """Dependencies injected into the chat agent."""

    news_summary: str = Field(description="Summary of current news headlines")


CHAT_SYSTEM_PROMPT = """\
你是一个 AI 资讯助手，专注于人工智能领域的知识和新闻。

你拥有今日最新 AI 资讯的上下文信息（包含中文新闻和 smol.ai 英文 AI 资讯）。
当用户问到今天的新闻、热点话题、某个领域的最新进展时，优先基于你掌握的最新资讯来回答。

你可以回答关于 AI 大模型、芯片、应用、政策等方面的问题。
回答要简洁、准确、有深度，使用中文。如果引用英文来源的新闻，翻译成中文后说明来源。
"""

chat_agent = Agent(
    create_model(),
    deps_type=ChatDeps,
    system_prompt=CHAT_SYSTEM_PROMPT,
    retries=2,
)


# ── FastAPI App ───────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    providers = []
    if JINA_API_KEY:
        providers.append("jina")
    if BRAVE_API_KEY:
        providers.append("brave")
    if FIRECRAWL_API_KEY:
        providers.append("firecrawl(fallback)")
    print(f"[startup] model={DEFAULT_MODEL}, providers={'+'.join(providers) or 'none'}")
    yield
    print("[shutdown] bye")


app = FastAPI(
    title="AI Daily News API",
    description="Jina Reader + Brave Search + Pydantic AI powered news generation",
    version="0.4.0",
    lifespan=lifespan,
)

cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Cache ─────────────────────────────────────────────────

_news_cache: list[dict] = []
_cache_date: str = ""
_cache_timestamp: float = 0
_smol_cache: list[str] = []  # smol.ai headline cache for chat context
CACHE_TTL = 3600  # 1 hour


# ── API Routes ────────────────────────────────────────────


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model": DEFAULT_MODEL,
        "jina": "ready",  # free tier works without key
        "brave": "ready" if BRAVE_API_KEY else "no-key",
        "firecrawl": "fallback" if FIRECRAWL_API_KEY else "none",
        "cached_news": len(_news_cache),
    }


@app.get("/api/news")
async def get_news(force_refresh: bool = False):
    """Get AI news. Returns cached if available, otherwise generates new."""
    global _news_cache, _cache_date, _cache_timestamp

    today = date.today().isoformat()

    # Return cache if fresh
    if (
        not force_refresh
        and _news_cache
        and _cache_date == today
        and (time.time() - _cache_timestamp) < CACHE_TTL
    ):
        return {"news": _news_cache, "total": len(_news_cache), "cached": True}

    # Generate new news
    return await generate_news_internal(today)


async def generate_news_internal(today: str) -> dict:
    """Run the agent to generate news, update cache, return result."""
    global _news_cache, _cache_date, _cache_timestamp, _smol_cache

    try:
        result = await agent.run(
            f"请搜索并整理今天（{today}）最重要的 AI 领域新闻。"
        )
        news_list = result.output

        news_dicts = [item.model_dump() for item in news_list.news]
        _news_cache = news_dicts
        _cache_date = today
        _cache_timestamp = time.time()

        # Update smol.ai cache for chat context (use Jina to scrape smol.ai)
        try:
            smol_md = await jina_scrape("https://news.smol.ai/")
            if smol_md:
                _smol_cache = re.findall(
                    r"(?:Apr|Mar|Feb|Jan|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+(.+?)(?:\s+Show|$)",
                    smol_md,
                )
                _smol_cache = [t.strip() for t in _smol_cache if "not much" not in t.lower()][:20]
        except Exception:
            pass

        usage = result.usage()
        return {
            "news": news_dicts,
            "total": len(news_dicts),
            "cached": False,
            "usage": {
                "input_tokens": usage.input_tokens,
                "output_tokens": usage.output_tokens,
            },
        }
    except Exception as e:
        # If generation fails, return stale cache if available
        if _news_cache:
            return {
                "news": _news_cache,
                "total": len(_news_cache),
                "cached": True,
                "stale": True,
                "error": str(e),
            }
        return JSONResponse(
            status_code=502,
            content={"error": "生成新闻失败", "detail": str(e)},
        )


@app.get("/api/news/smol")
async def get_smol_news():
    """Get latest AI news from smol.ai RSS feed (parsed into NewsItem format)."""
    global _smol_cache, _news_cache, _cache_date
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get("https://news.smol.ai/rss.xml")
            resp.raise_for_status()

        from xml.etree import ElementTree as ET
        root = ET.fromstring(resp.text)
        items = []
        for entry in root.findall(".//item"):
            title_el = entry.find("title")
            link_el = entry.find("link")
            desc_el = entry.find("description")
            pub_el = entry.find("pubDate")

            title = title_el.text if title_el is not None else ""
            link = link_el.text if link_el is not None else ""
            desc = desc_el.text if desc_el is not None else ""
            pub = pub_el.text if pub_el is not None else ""

            if not title:
                continue

            # Parse date — keep full ISO string for sorting
            pub_date = ""
            pub_timestamp = 0
            if pub:
                try:
                    from email.utils import parsedate_to_datetime
                    dt = parsedate_to_datetime(pub)
                    pub_date = dt.strftime("%Y-%m-%d")
                    pub_timestamp = dt.timestamp()
                except Exception:
                    pass

            # Clean HTML from description
            clean_desc = re.sub(r"<[^>]+>", "", desc).strip()

            items.append({
                "id": f"smol-{pub_date}-{len(items):02d}",
                "title": title,
                "summary": clean_desc[:200] if clean_desc else title,
                "content": clean_desc[:3000] if clean_desc else title,
                "source": "smol.ai",
                "url": link,
                "category": _classify_smol_title(title),
                "highlight": False,
                "publishTime": pub_date,
                "_timestamp": pub_timestamp,
            })

        # Sort by time descending, take top 60
        items.sort(key=lambda x: x.get("_timestamp", 0), reverse=True)
        items = items[:60]

        # Mark top 3 as highlights
        for i, item in enumerate(items):
            if i < 3:
                item["highlight"] = True
            # Remove internal sort key
            item.pop("_timestamp", None)

        _smol_cache = [item["title"] for item in items]
        _news_cache = items
        _cache_date = date.today().isoformat()
        return {"news": items, "total": len(items), "cached": False}

    except Exception as e:
        return JSONResponse(
            status_code=502,
            content={"error": "获取 smol.ai 资讯失败", "detail": str(e)},
        )


def _classify_smol_title(title: str) -> str:
    """Simple keyword-based classification for English titles."""
    t = title.lower()
    if any(k in t for k in ["model", "llm", "gpt", "claude", "gemini", "qwen", "lama", "mistral"]):
        return "大模型"
    if any(k in t for k in ["chip", "gpu", "nvidia", "tpu", "inference"]):
        return "芯片"
    if any(k in t for k in ["open source", "apache", "huggingface", "release"]):
        return "开源"
    if any(k in t for k in ["regulation", "policy", "gov", "eu act", "ban"]):
        return "政策"
    if any(k in t for k in ["coding", "codex", "agent", "devin", "cursor"]):
        return "应用"
    return "行业"


@app.get("/api/news/scrape")
async def scrape_url(url: str):
    """Scrape a URL and return full markdown content. Used for smol.ai detail pages.

    Uses Jina Reader (primary) with Firecrawl fallback.
    """
    if not url:
        return JSONResponse(status_code=400, content={"error": "url is required"})
    try:
        markdown = await jina_scrape(url, timeout=30)
        if not markdown or len(markdown) < 50:
            return {"content": "", "error": "页面内容为空"}

        # Clean up: remove navigation/footer noise from smol.ai
        lines = markdown.split("\n")
        cleaned = []
        skip_patterns = [
            r"^Title:", r"^URL Source:", r"^Published Time:", r"^Markdown Content:",
            r"^\[.*\]\(https://news\.smol\.ai",  # smol.ai internal links
            r"^\[Back to issues\]", r"^\[Skip to Main\]",
            r"^show/hide tags$", r"^Subscribe$", r"^RSS$",
            r"^Back to top$", r"^Share$", r"^← Back$",
            r"^!\[",  # images
            r"^\[!\[",  # image links
            r"^---+$",  # horizontal rules
        ]
        in_tags = False
        for line in lines:
            stripped = line.strip()
            if not stripped:
                if cleaned and cleaned[-1].strip():
                    cleaned.append("")  # keep single blank lines
                continue
            # Skip tags section (### Companies, ### Topics etc.)
            if re.match(r"^###\s+(Companies|Topics|Authors|Tags|Sources)$", stripped):
                in_tags = True
                continue
            if in_tags:
                if re.match(r"^##\s", stripped) or re.match(r"^#\s", stripped):
                    in_tags = False
                else:
                    continue
            # Skip noise patterns
            if any(re.match(p, stripped) for p in skip_patterns):
                continue
            # Skip short lines that are just navigation artifacts
            if len(stripped) < 5 and not re.match(r"^#{1,4}\s", stripped):
                continue
            cleaned.append(line)
        content = "\n".join(cleaned).strip()
        # Collapse multiple blank lines
        content = re.sub(r"\n{3,}", "\n\n", content)
        # Clean up escaped brackets: \[ text ](url) → text (url)
        content = re.sub(r'\\\[\s*', '', content)
        content = re.sub(r'\\\]\s*', '', content)
        # Remove bare URLs that immediately follow markdown links (duplicate cleanup)
        content = re.sub(r'\]\((https?://[^\)]+)\)(https?://\S+)', r'](\\1)', content)
        return {"content": content[:15000], "length": len(content)}
    except Exception as e:
        return JSONResponse(status_code=502, content={"error": f"抓取失败: {e}"})


@app.post("/api/news/refresh")
async def refresh_news():
    """Force regenerate news."""
    today = date.today().isoformat()
    return await generate_news_internal(today)


@app.post("/api/chat")
async def chat(request: dict):
    """SSE streaming chat endpoint with news context."""
    message = request.get("message", "") or request.get("content", "")
    if not message:
        return JSONResponse(status_code=400, content={"error": "empty message"})

    # Build news summary from cache
    news_lines = []
    for item in _news_cache[:20]:
        title = item.get("title", "")
        cat = item.get("category", "")
        src = item.get("source", "")
        summary = item.get("summary", "")
        news_lines.append(f"- [{cat}] {title}（{src}）{summary}")
    news_text = "\n".join(news_lines) if news_lines else "暂无新闻数据"

    smol_text = ""
    if _smol_cache:
        smol_lines = [f"- {item}" for item in _smol_cache[:15]]
        smol_text = "\n\nsmol.ai 英文 AI 资讯（来源: AI Twitter/Reddit/Discord）：\n" + "\n".join(smol_lines)

    deps = ChatDeps(news_summary=f"今日AI资讯（{_cache_date}）：\n{news_text}{smol_text}")

    # Inject news context into the prompt so the model actually sees it
    context_block = f"\n\n---\n以下是你掌握的今日AI资讯，回答时请结合这些信息：\n{deps.news_summary}\n---\n\n"
    full_message = context_block + message

    async def event_stream():
        try:
            async with chat_agent.run_stream(full_message, deps=deps) as result:
                async for text in result.stream_text(delta=True):
                    yield f"data: {json.dumps({'text': text}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Run directly ──────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app.server:app", host=host, port=port, reload=True)

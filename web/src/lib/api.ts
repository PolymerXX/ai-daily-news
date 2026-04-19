/**
 * API client for the Video Agent FastAPI backend.
 *
 * All functions use the fetch API with no external dependencies.
 * Base URL is read from NEXT_PUBLIC_API_URL (defaults to http://localhost:8001).
 */

// ── Configuration ────────────────────────────────────────────────

const API_BASE_URL =
  typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : "http://localhost:8001";

// ── Types ────────────────────────────────────────────────────────

export interface Video {
  id: string;
  title: string;
  filename?: string;
  youtube_url?: string;
  thumbnail_url?: string;
  duration_seconds?: number;
  created_at: string;
  status: VideoStatus["status"];
}

export interface Utterance {
  start: number;
  end: number;
  speaker?: string;
  text: string;
}

export interface Transcript {
  video_id: string;
  language?: string;
  utterances: Utterance[];
  full_text?: string;
}

export interface VideoSummary {
  video_id: string;
  title: string;
  summary: string;
  key_points: string[];
  topics?: string[];
}

export interface VideoStatus {
  video_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress?: number;
  message?: string;
  error?: string;
  transcript_ready: boolean;
  summary_ready: boolean;
}

export interface QuestionRequest {
  question: string;
}

export interface QuestionResponse {
  answer: string;
  sources?: string[];
}

export interface SSEDeltaEvent {
  type: "delta";
  content: string;
}

export interface SSEDoneEvent {
  type: "done";
  sources?: string[];
}

export interface SSEErrorEvent {
  type: "error";
  error: string;
}

export type SSEEvent = SSEDeltaEvent | SSEDoneEvent | SSEErrorEvent;

// ── Helpers ──────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      // ignore
    }
    throw new ApiError(res.status, res.statusText, body || res.statusText);
  }
  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

// ── API Functions ────────────────────────────────────────────────

/** GET /health */
export async function healthCheck(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE_URL}/health`);
  return handleResponse<{ status: string }>(res);
}

/** GET /api/videos - list all videos */
export async function listVideos(): Promise<Video[]> {
  const res = await fetch(`${API_BASE_URL}/api/videos`);
  return handleResponse<Video[]>(res);
}

/** POST /api/youtube - submit a YouTube URL for processing */
export async function submitYoutube(
  url: string,
): Promise<Video> {
  const res = await fetch(`${API_BASE_URL}/api/youtube`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return handleResponse<Video>(res);
}

/** POST /api/videos/upload - upload a video file */
export async function uploadVideo(file: File): Promise<Video> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE_URL}/api/videos/upload`, {
    method: "POST",
    body: formData,
    // Do NOT set Content-Type manually; browser sets multipart boundary.
  });
  return handleResponse<Video>(res);
}

/** GET /api/videos/{id}/status */
export async function getVideoStatus(id: string): Promise<VideoStatus> {
  const res = await fetch(`${API_BASE_URL}/api/videos/${encodeURIComponent(id)}/status`);
  return handleResponse<VideoStatus>(res);
}

/** GET /api/videos/{id}/transcript */
export async function getTranscript(id: string): Promise<Transcript> {
  const res = await fetch(`${API_BASE_URL}/api/videos/${encodeURIComponent(id)}/transcript`);
  return handleResponse<Transcript>(res);
}

/** GET /api/videos/{id}/summary */
export async function getSummary(id: string): Promise<VideoSummary> {
  const res = await fetch(`${API_BASE_URL}/api/videos/${encodeURIComponent(id)}/summary`);
  return handleResponse<VideoSummary>(res);
}

/** POST /api/videos/{id}/question - ask a question about a video (non-streaming) */
export async function askQuestion(
  id: string,
  question: string,
): Promise<QuestionResponse> {
  const res = await fetch(`${API_BASE_URL}/api/videos/${encodeURIComponent(id)}/question`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  return handleResponse<QuestionResponse>(res);
}

/**
 * POST /api/videos/{id}/question/stream - streaming question via SSE.
 *
 * Returns an async generator that yields parsed SSE events.
 * The backend sends lines like:  data: {"type":"delta","content":"..."}
 *                                data: {"type":"done","sources":[...]}
 *                                data: {"type":"error","error":"..."}
 */
export async function* askQuestionStream(
  id: string,
  question: string,
): AsyncGenerator<SSEEvent, void, undefined> {
  const res = await fetch(
    `${API_BASE_URL}/api/videos/${encodeURIComponent(id)}/question/stream`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    },
  );

  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      // ignore
    }
    throw new ApiError(res.status, res.statusText, body || res.statusText);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE lines are separated by \n. We may receive partial lines.
      const lines = buffer.split("\n");
      // Keep the last (potentially incomplete) line in the buffer.
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines and comments (SSE spec)
        if (!trimmed || trimmed.startsWith(":")) {
          continue;
        }

        // Parse "data: {...}" lines
        if (trimmed.startsWith("data:")) {
          const data = trimmed.slice(5).trim();
          if (!data) continue; // empty data (keepalive)

          try {
            const parsed: SSEEvent = JSON.parse(data);
            yield parsed;

            // Stop reading if we get a terminal event
            if (parsed.type === "done" || parsed.type === "error") {
              return;
            }
          } catch {
            // If JSON parse fails, yield as a raw delta
            console.warn("Failed to parse SSE data:", data);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** DELETE /api/videos/{id} */
export async function deleteVideo(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/videos/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return handleResponse<void>(res);
}

/**
 * Returns the URL to use for streaming video playback (range requests).
 * Uses the Next.js rewrite proxy so the browser talks to our own origin.
 */
export function streamVideoUrl(id: string): string {
  return `/api/videos/${encodeURIComponent(id)}/stream`;
}

/**
 * Returns the URL for the HTML preview page of a video.
 * Uses the Next.js rewrite proxy.
 */
export function previewVideoUrl(id: string): string {
  return `/api/videos/${encodeURIComponent(id)}/preview`;
}

// ── Export ApiError for consumer error handling ──────────────────

export { ApiError };

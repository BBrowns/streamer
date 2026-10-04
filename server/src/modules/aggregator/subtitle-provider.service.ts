import { randomUUID } from "node:crypto";
import { fetchSafeAddonText } from "../addon/addon-fetcher.js";
import {
  MAX_SUBTITLE_CANDIDATES,
  type SubtitleCandidate,
} from "@streamer/shared";
import { z } from "zod";
import { addonSupportsResource, getUserAddons } from "./addon-data.js";
import {
  buildAddonPolicyKey,
  resilientFetch,
  secureAgent,
} from "./upstream.js";

const MAX_SUBTITLE_PROVIDERS = 16;
const MAX_SUBTITLES_PER_PROVIDER = 200;
const SUBTITLE_CATALOG_TIMEOUT_MS = 5_000;
const SUBTITLE_DOCUMENT_TIMEOUT_MS = 10_000;
const SUBTITLE_DOCUMENT_CACHE_TTL_MS = 10 * 60_000;
const SUBTITLE_DOCUMENT_CACHE_MAX_ENTRIES = MAX_SUBTITLE_CANDIDATES;
const SUBTITLE_DOCUMENT_MAX_BYTES = 8 * 1024 * 1024;

type SubtitleDocumentCacheEntry = {
  userId: string;
  url: string;
  expiresAt: number;
};

type UncachedSubtitleCandidate = {
  candidate: Omit<SubtitleCandidate, "fetchIdentity">;
  documentUrl: string;
};

const addonSubtitleResponseSchema = z
  .object({
    subtitles: z
      .array(
        z
          .object({
            id: z.string().max(512).optional(),
            url: z.string().min(1).max(4_096),
            lang: z.string().max(32).optional(),
            language: z.string().max(32).optional(),
            title: z.string().max(512).optional(),
            name: z.string().max(512).optional(),
          })
          .strip(),
      )
      .max(MAX_SUBTITLES_PER_PROVIDER),
  })
  .strip();

function normalizeSubtitleLanguage(value: unknown) {
  const primary =
    typeof value === "string"
      ? value.trim().toLowerCase().split(/[-_]/)[0]
      : "";
  const aliases: Record<string, string> = {
    eng: "en",
    nld: "nl",
    dut: "nl",
    spa: "es",
    esp: "es",
    deu: "de",
    ger: "de",
    fra: "fr",
    fre: "fr",
    ita: "it",
    por: "pt",
  };
  return aliases[primary] || primary || "unknown";
}

function subtitleFormatFromUrl(url: string): SubtitleCandidate["format"] {
  try {
    const extension = new URL(url).pathname
      .toLowerCase()
      .match(/\.(srt|vtt|ass|ssa)$/)?.[1];
    return extension === "srt" ||
      extension === "vtt" ||
      extension === "ass" ||
      extension === "ssa"
      ? extension
      : ("unknown" as const);
  } catch {
    return "unknown" as const;
  }
}

function normalizeHttpSubtitleUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function deduplicateAndBoundSubtitleCandidates(
  batches: Array<UncachedSubtitleCandidate[] | undefined>,
) {
  const candidates: UncachedSubtitleCandidate[] = [];
  const candidateIds = new Set<string>();
  const documentUrls = new Set<string>();

  // Promise.allSettled preserves provider order. Keeping the first occurrence
  // therefore makes duplicate selection deterministic without exposing or
  // ranking by the provider-controlled document URL.
  for (const batch of batches) {
    for (const entry of batch ?? []) {
      if (
        candidateIds.has(entry.candidate.id) ||
        documentUrls.has(entry.documentUrl)
      ) {
        continue;
      }
      candidateIds.add(entry.candidate.id);
      documentUrls.add(entry.documentUrl);
      candidates.push(entry);
      if (candidates.length >= MAX_SUBTITLE_CANDIDATES) {
        return candidates;
      }
    }
  }

  return candidates;
}

export class SubtitleProviderService {
  private readonly subtitleDocuments = new Map<
    string,
    SubtitleDocumentCacheEntry
  >();

  private pruneSubtitleDocuments() {
    const now = Date.now();
    for (const [identity, entry] of this.subtitleDocuments) {
      if (entry.expiresAt <= now) this.subtitleDocuments.delete(identity);
    }
    while (this.subtitleDocuments.size > SUBTITLE_DOCUMENT_CACHE_MAX_ENTRIES) {
      const oldest = this.subtitleDocuments.keys().next().value;
      if (oldest === undefined) break;
      this.subtitleDocuments.delete(oldest);
    }
  }

  private cacheSubtitleDocument(userId: string, url: string) {
    this.pruneSubtitleDocuments();
    while (this.subtitleDocuments.size >= SUBTITLE_DOCUMENT_CACHE_MAX_ENTRIES) {
      const oldest = this.subtitleDocuments.keys().next().value;
      if (oldest === undefined) break;
      this.subtitleDocuments.delete(oldest);
    }
    const fetchIdentity = randomUUID();
    this.subtitleDocuments.set(fetchIdentity, {
      userId,
      url,
      expiresAt: Date.now() + SUBTITLE_DOCUMENT_CACHE_TTL_MS,
    });
    return fetchIdentity;
  }

  async getSubtitleCandidates(
    userId: string,
    type: string,
    id: string,
    requestId: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<SubtitleCandidate[]> {
    const addons = await getUserAddons(userId);
    const providers = addons
      .filter((addon) =>
        addonSupportsResource(addon.manifest, "subtitles", type),
      )
      .slice(0, MAX_SUBTITLE_PROVIDERS);

    const batches = await Promise.allSettled(
      providers.map(async (addon) => {
        const response = await resilientFetch(
          addon.transportUrl,
          buildAddonPolicyKey(userId, addon.id, addon.transportUrl),
          `subtitles/${type}/${encodeURIComponent(id)}.json`,
          requestId,
          addonSubtitleResponseSchema,
          {
            timeoutMs: SUBTITLE_CATALOG_TIMEOUT_MS,
            maxResponseBytes: 512 * 1024,
            signal: options.signal,
            callerSignal: options.signal,
          },
        );

        return response.subtitles.flatMap((subtitle, index) => {
          const documentUrl = normalizeHttpSubtitleUrl(subtitle.url);
          if (!documentUrl) return [];
          const label =
            subtitle.title ||
            subtitle.name ||
            `${normalizeSubtitleLanguage(
              subtitle.lang || subtitle.language,
            ).toUpperCase()} · ${addon.manifest.name}`;
          const evidence = `${subtitle.id || ""} ${label}`;

          return [
            {
              candidate: {
                id: `addon:${addon.id}:${subtitle.id || index}`,
                providerId: addon.id,
                providerName: addon.manifest.name,
                language: normalizeSubtitleLanguage(
                  subtitle.lang || subtitle.language,
                ),
                format: subtitleFormatFromUrl(documentUrl),
                source: "addon" as const,
                label,
                hearingImpaired:
                  /\b(?:sdh|hearing impaired|closed captions?|\bcc\b)\b/i.test(
                    evidence,
                  ),
                forced: /\bforced\b/i.test(evidence),
                fileHashMatch: false,
                fileNameMatch: false,
                contentIdMatch: true,
                confidence: 0.9,
                active: false,
              },
              documentUrl,
            },
          ];
        });
      }),
    );

    return deduplicateAndBoundSubtitleCandidates(
      batches.map((batch) =>
        batch.status === "fulfilled" ? batch.value : undefined,
      ),
    ).map(({ candidate, documentUrl }) => ({
      ...candidate,
      fetchIdentity: this.cacheSubtitleDocument(userId, documentUrl),
    }));
  }

  async getSubtitleDocument(
    userId: string,
    fetchIdentity: string,
    signal?: AbortSignal,
  ) {
    this.pruneSubtitleDocuments();
    const entry = this.subtitleDocuments.get(fetchIdentity);
    if (!entry || entry.userId !== userId) return null;

    return fetchSafeAddonText(entry.url, {
      timeoutMs: SUBTITLE_DOCUMENT_TIMEOUT_MS,
      maxResponseBytes: SUBTITLE_DOCUMENT_MAX_BYTES,
      signal,
      axiosOptions: { httpsAgent: secureAgent },
    });
  }
}

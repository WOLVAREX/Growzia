// Two-tier matching: "strong" keywords are full platform names or unambiguous tokens
// (safe to match anywhere in the text). "weak" keywords are short abbreviations
// ("yt", "fb", "tg", "ig") that are only trusted as a last-resort fallback, and only once
// every platform's strong keywords have already failed to match — otherwise a service like
// "WhatsApp Channel Followers" could get misclassified as YouTube just because some other
// platform's loose abbreviation happens to appear first in priority order.
interface PlatformRule {
  platform: string;
  strong: readonly RegExp[];
  weak: readonly RegExp[];
}

const PLATFORM_RULES: readonly PlatformRule[] = [
  { platform: "instagram", strong: [/instagram/i, /igtv/i], weak: [/\big\b/i] },
  { platform: "tiktok", strong: [/tiktok/i, /tik ?tok/i, /douyin/i], weak: [] },
  { platform: "youtube", strong: [/youtube/i], weak: [/\byt\b/i, /\bshorts\b/i] },
  { platform: "facebook", strong: [/facebook/i, /fanpage/i], weak: [/\bfb\b/i] },
  // Deliberately no bare "x" fallback: a single letter is too likely to appear in
  // unrelated text (e.g. "1000 x followers", "x2 bonus") to trust as a platform signal.
  { platform: "x", strong: [/twitter/i, /x\.com/i], weak: [] },
  { platform: "telegram", strong: [/telegram/i], weak: [/\btg\b/i] },
  { platform: "whatsapp", strong: [/whatsapp/i, /whats ?app/i], weak: [] },
  { platform: "spotify", strong: [/spotify/i], weak: [] },
  { platform: "soundcloud", strong: [/soundcloud/i, /sound ?cloud/i], weak: [] },
  { platform: "linkedin", strong: [/linkedin/i, /linked ?in/i], weak: [] },
  { platform: "snapchat", strong: [/snapchat/i, /snap ?chat/i], weak: [] },
  { platform: "twitch", strong: [/twitch/i], weak: [] },
  { platform: "pinterest", strong: [/pinterest/i], weak: [] },
  { platform: "discord", strong: [/discord/i], weak: [] },
  { platform: "threads", strong: [/threads/i], weak: [] },
];

const SERVICE_TYPES: readonly string[] = [
  "Followers",
  "Subscribers",
  "Likes",
  "Views",
  "Comments",
  "Shares",
  "Members",
  "Plays",
  "Reactions",
  "Reviews",
  "Status",
  "Channels",
  "Channel",
  "Groups",
  "Group",
  "Stories",
  "Story",
  "Polls",
  "Saves",
];

const REGION_KEYWORDS: readonly string[] = [
  "kenya",
  "kenyan",
  "nigeria",
  "nigerian",
  "ghana",
  "tanzania",
  "uganda",
  "south africa",
  "usa",
  "united states",
  "america",
  "uk",
  "united kingdom",
  "india",
  "indian",
  "pakistan",
  "bangladesh",
  "indonesia",
  "brazil",
  "brazilian",
  "russia",
  "russian",
  "turkey",
  "turkish",
  "arab",
  "saudi",
  "egypt",
  "morocco",
  "france",
  "french",
  "german",
  "germany",
  "spain",
  "spanish",
  "italy",
  "italian",
  "china",
  "chinese",
  "japan",
  "japanese",
  "korea",
  "korean",
  "philippines",
  "vietnam",
  "thailand",
  "malaysia",
  "canada",
  "australia",
  "europe",
  "european",
  "africa",
  "african",
  "asia",
  "asian",
  "latin",
];

const FLAG_PATTERN = /[\u{1F1E6}-\u{1F1FF}]{2}/u;

function haystack(name: string, category: string): string {
  return ` ${String(name ?? "")} ${String(category ?? "")} `.toLowerCase().replace(/\s+/g, " ");
}

function detectStrongPlatform(text: string): string | null {
  const match = PLATFORM_RULES.find((rule) => rule.strong.some((pattern) => pattern.test(text)));
  return match?.platform ?? null;
}
export function detectPlatformId(name: string, category: string): string {
  // Prefer the service name. Provider categories are often broad or stale and
  // may contain another platform name (for example, a WhatsApp service under a
  // generic/YouTube category). Only use the category when the name is silent.
  const nameMatch = detectStrongPlatform(String(name ?? "").toLowerCase());
  if (nameMatch) return nameMatch;
  const categoryMatch = detectStrongPlatform(String(category ?? "").toLowerCase());
  if (categoryMatch) return categoryMatch;
  const text = haystack(name, category);
  const weakMatch = PLATFORM_RULES.find((rule) => rule.weak.some((pattern) => pattern.test(text)));
  return weakMatch ? weakMatch.platform : "other";
}

export function detectServiceType(name: string, category: string): string {
  const text = haystack(name, category);
  const found = SERVICE_TYPES.find((type) => text.includes(type.toLowerCase()));
  if (found) return found;
  if (text.includes("follower")) return "Followers";
  if (text.includes("subscriber") || text.includes("subs ")) return "Subscribers";
  if (text.includes("like")) return "Likes";
  if (text.includes("view")) return "Views";
  if (text.includes("comment")) return "Comments";
  if (text.includes("share")) return "Shares";
  if (text.includes("member")) return "Members";
  if (text.includes("play")) return "Plays";
  if (text.includes("react")) return "Reactions";
  if (text.includes("review")) return "Reviews";
  return "Other";
}

export function detectIsRegionVariant(name: string, category: string): boolean {
  const source = `${category ?? ""} ${name ?? ""}`;
  if (FLAG_PATTERN.test(source)) return true;
  const text = haystack(name, category);
  return REGION_KEYWORDS.some((keyword) => text.includes(keyword));
}

export function detectRegion(name: string, category: string): string {
  const source = `${category ?? ""} ${name ?? ""}`;
  const flag = source.match(FLAG_PATTERN);
  if (flag) return slug(flag[0]);
  const text = haystack(name, category);
  const matched = REGION_KEYWORDS.find((keyword) => text.includes(keyword));
  return matched ? slug(matched) : "global";
}

export function slug(value: string): string {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (normalized !== "") return normalized;
  const codePoints = Array.from(String(value ?? ""))
    .map((char) => char.codePointAt(0) ?? 0)
    .filter((code) => code > 0)
    .map((code) => code.toString(16))
    .join("");
  return codePoints !== "" ? `r${codePoints}` : "global";
}

export function buildCanonicalKey(
  platformId: string,
  serviceType: string,
  isRegionVariant: boolean,
  region: string,
): string {
  return `${platformId}:${serviceType}:${isRegionVariant ? slug(region) : "global"}`;
}

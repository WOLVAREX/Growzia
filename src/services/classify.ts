const PLATFORM_KEYWORDS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["instagram", ["instagram", "insta ", " ig ", "igtv"]],
  ["tiktok", ["tiktok", "tik tok", "douyin"]],
  ["youtube", ["youtube", "yt ", "shorts"]],
  ["facebook", ["facebook", " fb ", "fanpage"]],
  ["x", ["twitter", "x.com", " x "]],
  ["telegram", ["telegram", " tg "]],
  ["whatsapp", ["whatsapp", "whats app"]],
  ["spotify", ["spotify"]],
  ["soundcloud", ["soundcloud", "sound cloud"]],
  ["linkedin", ["linkedin", "linked in"]],
  ["snapchat", ["snapchat", "snap chat"]],
  ["twitch", ["twitch"]],
  ["pinterest", ["pinterest"]],
  ["discord", ["discord"]],
  ["threads", ["threads"]],
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
  return ` ${String(category ?? "")} ${String(name ?? "")} `.toLowerCase().replace(/\s+/g, " ");
}

export function detectPlatformId(name: string, category: string): string {
  const text = haystack(name, category);
  const found = PLATFORM_KEYWORDS.find(([, keywords]) => keywords.some((keyword) => text.includes(keyword)));
  return found ? found[0] : "other";
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

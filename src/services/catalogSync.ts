import { env } from "../lib/env";
import { errorMessage, logger } from "../lib/logger";
import { ProviderRawService } from "../models/ProviderRawService";
import { ServiceCatalog } from "../models/ServiceCatalog";
import { SyncLog } from "../models/SyncLog";
import { buildCanonicalKey, detectIsRegionVariant, detectPlatformId, detectRegion, detectServiceType } from "./classify";
import { sellPrice } from "./pricing";
import { getDisabledPlatforms, getDisabledProviderServices, getMarginPercent } from "./settings";
import { bwmClient } from "./providers/bwm";
import { cheapGainsClient } from "./providers/cheapgains";
import type { ProviderClient, RawProviderService } from "./providers/types";

export interface NormalizedProviderService extends RawProviderService {
  platformId: string;
  serviceType: string;
  isRegionVariant: boolean;
  canonicalKey: string;
}

export interface PublicCatalogEntry {
  id: string;
  canonicalKey: string;
  platformId: string;
  serviceType: string;
  name: string;
  category: string;
  sellKesPer1000: number;
  min: number;
  max: number;
  isRegionVariant: boolean;
}

export interface SyncOptions {
  triggeredBy?: "cron" | "admin" | "startup";
  clients?: ProviderClient[];
}

interface CatalogCache {
  entries: PublicCatalogEntry[];
  loadedAt: number;
  count: number;
  updatedAt: string | null;
}

let cache: CatalogCache | null = null;
let refreshing = false;
let syncing: Promise<{ count: number; updatedAt: string }> | null = null;

export function normalizeProviderService(raw: RawProviderService): NormalizedProviderService {
  const platformId = detectPlatformId(raw.name, raw.category);
  const serviceType = detectServiceType(raw.name, raw.category);
  const isRegionVariant = detectIsRegionVariant(raw.name, raw.category);
  const region = isRegionVariant ? detectRegion(raw.name, raw.category) : "global";
  return {
    ...raw,
    platformId,
    serviceType,
    isRegionVariant,
    canonicalKey: buildCanonicalKey(platformId, serviceType, isRegionVariant, region),
  };
}

export function pickCheapestPerCanonicalKey(
  services: NormalizedProviderService[],
): NormalizedProviderService[] {
  const best = new Map<string, NormalizedProviderService>();
  for (const service of services) {
    if (!Number.isFinite(service.baseKesPer1000) || service.baseKesPer1000 <= 0) continue;
    const existing = best.get(service.canonicalKey);
    if (!existing || service.baseKesPer1000 < existing.baseKesPer1000) {
      best.set(service.canonicalKey, service);
    }
  }
  return Array.from(best.values());
}

function defaultClients(): ProviderClient[] {
  return [bwmClient, cheapGainsClient];
}

async function fetchAll(
  clients: ProviderClient[],
): Promise<{ services: NormalizedProviderService[]; counts: Record<string, number>; errors: string[] }> {
  const settled = await Promise.allSettled(clients.map((client) => client.fetchServices()));
  const services: NormalizedProviderService[] = [];
  const counts: Record<string, number> = {};
  const errors: string[] = [];

  settled.forEach((result, index) => {
    const client = clients[index];
    if (!client) return;
    if (result.status === "fulfilled") {
      counts[client.code] = result.value.length;
      for (const raw of result.value) services.push(normalizeProviderService(raw));
      return;
    }
    counts[client.code] = 0;
    errors.push(`${client.code}: ${errorMessage(result.reason)}`);
  });

  return { services, counts, errors };
}

async function persistRawServices(services: NormalizedProviderService[], syncedAt: Date): Promise<void> {
  if (services.length === 0) return;
  const docs = services.map((service) => ({
    providerCode: service.providerCode,
    providerServiceId: service.providerServiceId,
    name: service.name,
    category: service.category,
    rawRate: service.rawRate,
    rawCurrency: service.rawCurrency,
    baseKesPer1000: service.baseKesPer1000,
    min: service.min,
    max: service.max,
    platformId: service.platformId,
    serviceType: service.serviceType,
    canonicalKey: service.canonicalKey,
    isRegionVariant: service.isRegionVariant,
    syncedAt,
  }));
  await ProviderRawService.insertMany(docs, { ordered: false });
}

async function upsertWinners(
  winners: NormalizedProviderService[],
  marginPercent: number,
): Promise<{ mergedCount: number; removedCount: number }> {
  if (winners.length > 0) {
    const existing = await ServiceCatalog.find({ canonicalKey: { $in: winners.map((winner) => winner.canonicalKey) } })
      .select("canonicalKey +sellPriceOverrideKesPer1000")
      .lean()
      .exec();
    const overrides = new Map(existing.map((doc) => [doc.canonicalKey, doc.sellPriceOverrideKesPer1000]));
    const operations = winners.map((winner) => ({
      updateOne: {
        filter: { canonicalKey: winner.canonicalKey },
        update: {
          $set: {
            platformId: winner.platformId,
            serviceType: winner.serviceType,
            name: winner.name,
            category: winner.category,
            providerCode: winner.providerCode,
            providerServiceId: winner.providerServiceId,
            baseKesPer1000: winner.baseKesPer1000,
            sellKesPer1000: overrides.get(winner.canonicalKey) ?? sellPrice(winner.baseKesPer1000, marginPercent),
            min: winner.min,
            max: winner.max,
            isRegionVariant: winner.isRegionVariant,
          },
          $setOnInsert: { canonicalKey: winner.canonicalKey, isDisabled: false },
        },
        upsert: true,
      },
    }));
    await ServiceCatalog.bulkWrite(operations, { ordered: false });
  }

  const keys = winners.map((winner) => winner.canonicalKey);
  const removal = await ServiceCatalog.deleteMany({ canonicalKey: { $nin: keys } }).exec();
  return { mergedCount: winners.length, removedCount: removal.deletedCount ?? 0 };
}

async function loadCatalogFromDb(): Promise<CatalogCache> {
  const disabledPlatforms = new Set(await getDisabledPlatforms());
  const docs = await ServiceCatalog.find({ isDisabled: false })
    .select("canonicalKey platformId serviceType name category sellKesPer1000 min max isRegionVariant updatedAt")
    .sort({ platformId: 1, serviceType: 1, name: 1 })
    .lean()
    .exec();

  let latest = 0;
  const entries: PublicCatalogEntry[] = [];
  for (const doc of docs) {
    if (disabledPlatforms.has(doc.platformId.toLowerCase())) continue;
    const updated = doc.updatedAt instanceof Date ? doc.updatedAt.getTime() : 0;
    if (updated > latest) latest = updated;
    entries.push({
      id: String(doc._id),
      canonicalKey: doc.canonicalKey,
      platformId: doc.platformId,
      serviceType: doc.serviceType,
      name: doc.name,
      category: doc.category,
      sellKesPer1000: doc.sellKesPer1000,
      min: doc.min,
      max: doc.max,
      isRegionVariant: doc.isRegionVariant,
    });
  }

  return {
    entries,
    loadedAt: Date.now(),
    count: entries.length,
    updatedAt: latest === 0 ? null : new Date(latest).toISOString(),
  };
}

function refreshCacheInBackground(): void {
  if (refreshing) return;
  refreshing = true;
  void loadCatalogFromDb()
    .then((fresh) => {
      cache = fresh;
    })
    .catch((error: unknown) => {
      logger.warn(`Catalog cache refresh failed: ${errorMessage(error)}`);
    })
    .finally(() => {
      refreshing = false;
    });
}

async function ensureCache(): Promise<CatalogCache> {
  const ttlMs = Math.max(1, env.CATALOG_CACHE_TTL_SECONDS) * 1000;
  if (!cache) {
    cache = await loadCatalogFromDb();
    return cache;
  }
  if (Date.now() - cache.loadedAt > ttlMs) refreshCacheInBackground();
  return cache;
}

export function invalidateCatalogCache(): void {
  cache = null;
}

export async function syncCatalog(options: SyncOptions = {}): Promise<{ count: number; updatedAt: string }> {
  if (syncing) return syncing;
  syncing = runSync(options).finally(() => {
    syncing = null;
  });
  return syncing;
}

async function runSync(options: SyncOptions): Promise<{ count: number; updatedAt: string }> {
  const clients = options.clients && options.clients.length > 0 ? options.clients : defaultClients();
  const startedAt = new Date();
  const marginPercent = await getMarginPercent();

  const { services, counts, errors } = await fetchAll(clients);
  const disabledProviderServices = new Set(await getDisabledProviderServices());
  const eligibleServices = services.filter((service) => !disabledProviderServices.has(`${service.providerCode}:${service.canonicalKey}`));
  const winners = pickCheapestPerCanonicalKey(eligibleServices);

  let mergedCount = 0;
  let removedCount = 0;

  if (services.length > 0) {
    try {
      await persistRawServices(services, startedAt);
    } catch (error: unknown) {
      errors.push(`raw-audit: ${errorMessage(error)}`);
    }
    const result = await upsertWinners(winners, marginPercent);
    mergedCount = result.mergedCount;
    removedCount = result.removedCount;
  } else {
    errors.push("No provider returned any services; catalogue left unchanged");
  }

  const finishedAt = new Date();
  await SyncLog.create({
    startedAt,
    finishedAt,
    bwmCount: counts.bwm ?? 0,
    cheapgainsCount: counts.cheapgains ?? 0,
    mergedCount,
    removedCount,
    marginPercent,
    errors,
    triggeredBy: options.triggeredBy ?? "cron",
  });

  invalidateCatalogCache();
  const fresh = await ensureCache();
  logger.info(
    `Catalogue sync finished: merged=${mergedCount} removed=${removedCount} errors=${errors.length}`,
  );

  return { count: fresh.count, updatedAt: fresh.updatedAt ?? finishedAt.toISOString() };
}

export async function getCachedCatalog(q?: string, category?: string): Promise<PublicCatalogEntry[]> {
  const current = await ensureCache();
  const query = String(q ?? "").trim().toLowerCase();
  const cat = String(category ?? "").trim().toLowerCase();

  return current.entries.filter((entry) => {
    if (cat !== "" && entry.category.toLowerCase() !== cat) return false;
    if (query === "") return true;
    const haystack = `${entry.name} ${entry.category} ${entry.platformId} ${entry.serviceType}`.toLowerCase();
    return haystack.includes(query);
  });
}

export async function getCatalogCategories(): Promise<string[]> {
  const current = await ensureCache();
  const set = new Set<string>();
  for (const entry of current.entries) {
    if (entry.category.trim() !== "") set.add(entry.category);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function getCatalogMeta(): { count: number; updatedAt: string | null } {
  if (!cache) return { count: 0, updatedAt: null };
  return { count: cache.count, updatedAt: cache.updatedAt };
}

export async function repriceCatalog(marginPercent: number): Promise<number> {
  const docs = await ServiceCatalog.find({})
    .select("+baseKesPer1000")
    .lean()
    .exec();
  if (docs.length === 0) return 0;

  const operations = docs.map((doc) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: { sellKesPer1000: doc.sellPriceOverrideKesPer1000 ?? sellPrice(doc.baseKesPer1000, marginPercent) } },
    },
  }));
  await ServiceCatalog.bulkWrite(operations, { ordered: false });
  invalidateCatalogCache();
  return docs.length;
}

import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler";
import { errorMessage } from "../../lib/logger";
import { ProviderRawService } from "../../models/ProviderRawService";
import { ServiceCatalog } from "../../models/ServiceCatalog";
import { SyncLog } from "../../models/SyncLog";
import { getCatalogMeta, syncCatalog } from "../../services/catalogSync";

const rawQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const adminCatalogRouter = Router();

adminCatalogRouter.get(
  "/meta",
  asyncHandler(async (_req, res) => {
    const [lastSync, mergedCount, perProvider] = await Promise.all([
      SyncLog.findOne({}).sort({ startedAt: -1 }).lean().exec(),
      ServiceCatalog.countDocuments({}).exec(),
      ProviderRawService.aggregate<{ _id: string; count: number; latest: Date }>([
        { $group: { _id: "$providerCode", count: { $sum: 1 }, latest: { $max: "$syncedAt" } } },
      ]).exec(),
    ]);

    res.json({
      mergedCount,
      cache: getCatalogMeta(),
      lastSync: lastSync
        ? {
            startedAt: lastSync.startedAt,
            finishedAt: lastSync.finishedAt,
            bwmCount: lastSync.bwmCount,
            cheapgainsCount: lastSync.cheapgainsCount,
            mergedCount: lastSync.mergedCount,
            removedCount: lastSync.removedCount,
            marginPercent: lastSync.marginPercent,
            errors: lastSync.errors,
            triggeredBy: lastSync.triggeredBy,
          }
        : null,
      providers: perProvider.map((row) => ({ providerCode: row._id, rawRecords: row.count, lastSyncedAt: row.latest })),
    });
  }),
);

adminCatalogRouter.post(
  "/sync",
  asyncHandler(async (_req, res) => {
    try {
      const result = await syncCatalog({ triggeredBy: "admin" });
      res.json({ synced: true, ...result });
    } catch (error: unknown) {
      res.status(502).json({ error: `Catalogue sync failed: ${errorMessage(error)}` });
    }
  }),
);

adminCatalogRouter.get(
  "/raw",
  asyncHandler(async (req, res) => {
    const query = rawQuerySchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;
    const search = query.q ? query.q.toLowerCase() : "";

    const latest = await ProviderRawService.findOne({}).sort({ syncedAt: -1 }).select("syncedAt").lean().exec();
    if (!latest) {
      res.json({ page: query.page, limit: query.limit, total: 0, syncedAt: null, rows: [] });
      return;
    }

    const rawDocs = await ProviderRawService.find({ syncedAt: latest.syncedAt }).lean().exec();
    const winners = await ServiceCatalog.find({})
      .select("+providerCode +baseKesPer1000 +providerServiceId")
      .lean()
      .exec();
    const winnerByKey = new Map(winners.map((doc) => [doc.canonicalKey, doc]));

    const grouped = new Map<
      string,
      {
        canonicalKey: string;
        platformId: string;
        serviceType: string;
        bwm: { name: string; baseKesPer1000: number; rawRate: number; rawCurrency: string } | null;
        cheapgains: { name: string; baseKesPer1000: number; rawRate: number; rawCurrency: string } | null;
      }
    >();

    for (const doc of rawDocs) {
      if (search !== "" && !`${doc.name} ${doc.category} ${doc.canonicalKey}`.toLowerCase().includes(search)) continue;
      const existing = grouped.get(doc.canonicalKey) ?? {
        canonicalKey: doc.canonicalKey,
        platformId: doc.platformId,
        serviceType: doc.serviceType,
        bwm: null,
        cheapgains: null,
      };
      const entry = {
        name: doc.name,
        baseKesPer1000: doc.baseKesPer1000,
        rawRate: doc.rawRate,
        rawCurrency: doc.rawCurrency,
      };
      if (doc.providerCode === "bwm") {
        if (!existing.bwm || entry.baseKesPer1000 < existing.bwm.baseKesPer1000) existing.bwm = entry;
      } else if (!existing.cheapgains || entry.baseKesPer1000 < existing.cheapgains.baseKesPer1000) {
        existing.cheapgains = entry;
      }
      grouped.set(doc.canonicalKey, existing);
    }

    const rows = Array.from(grouped.values())
      .sort((a, b) => a.canonicalKey.localeCompare(b.canonicalKey))
      .map((row) => {
        const winner = winnerByKey.get(row.canonicalKey);
        return {
          canonicalKey: row.canonicalKey,
          platformId: row.platformId,
          serviceType: row.serviceType,
          bwm: row.bwm,
          cheapgains: row.cheapgains,
          winner: winner
            ? {
                providerCode: winner.providerCode,
                providerServiceId: winner.providerServiceId,
                baseKesPer1000: winner.baseKesPer1000,
                sellKesPer1000: winner.sellKesPer1000,
              }
            : null,
        };
      });

    res.json({
      page: query.page,
      limit: query.limit,
      total: rows.length,
      syncedAt: latest.syncedAt,
      rows: rows.slice(skip, skip + query.limit),
    });
  }),
);

adminCatalogRouter.get(
  "/sync-logs",
  asyncHandler(async (_req, res) => {
    const logs = await SyncLog.find({}).sort({ startedAt: -1 }).limit(20).lean().exec();
    res.json({ count: logs.length, logs });
  }),
);

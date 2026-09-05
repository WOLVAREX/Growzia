import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderClient, RawProviderService } from "../src/services/providers/types";

const bulkWrite = vi.fn(async () => ({ ok: 1 }));
const insertMany = vi.fn(async () => []);
const createSyncLog = vi.fn(async () => ({}));

const catalogRows = [
  {
    _id: "catalog-1",
    canonicalKey: "instagram:Followers:global",
    platformId: "instagram",
    serviceType: "Followers",
    name: "Instagram Followers",
    category: "Instagram Services",
    sellKesPer1000: 80.5,
    min: 100,
    max: 10000,
    isRegionVariant: false,
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
];

vi.mock("../src/models/ProviderRawService", () => ({
  ProviderRawService: {
    insertMany,
    findOne: () => ({ sort: () => ({ select: () => ({ lean: () => ({ exec: async () => null }) }) }) }),
    aggregate: () => ({ exec: async () => [] }),
  },
}));

vi.mock("../src/models/ServiceCatalog", () => ({
  ServiceCatalog: {
    bulkWrite,
    deleteMany: () => ({ exec: async () => ({ deletedCount: 0 }) }),
    find: () => ({
      select: () => ({
        sort: () => ({ lean: () => ({ exec: async () => catalogRows }) }),
        lean: () => ({ exec: async () => catalogRows }),
      }),
    }),
  },
}));

vi.mock("../src/models/SyncLog", () => ({
  SyncLog: { create: createSyncLog },
}));

vi.mock("../src/services/settings", () => ({
  getMarginPercent: async () => 15,
  getMaintenanceMode: async () => false,
  getDisabledServices: async () => [],
  getDisabledProviderServices: async () => [],
}));

function makeClient(code: "bwm" | "cheapgains", services: RawProviderService[]): ProviderClient {
  return {
    code,
    fetchServices: async () => services,
    placeOrder: async () => ({ providerOrderId: "1" }),
    getOrderStatus: async () => ({ status: "pending" }),
  };
}

const bwmService: RawProviderService = {
  providerCode: "bwm",
  providerServiceId: "1",
  name: "Instagram Followers",
  category: "Instagram Services",
  rawRate: 70,
  rawCurrency: "KES",
  baseKesPer1000: 70,
  min: 100,
  max: 10000,
};

const cheapGainsService: RawProviderService = {
  providerCode: "cheapgains",
  providerServiceId: "55",
  name: "Instagram Followers",
  category: "Instagram Services",
  rawRate: 400,
  rawCurrency: "KES",
  baseKesPer1000: 400,
  min: 100,
  max: 20000,
};

describe("catalog sync", () => {
  beforeEach(() => {
    bulkWrite.mockClear();
    insertMany.mockClear();
    createSyncLog.mockClear();
  });

  it("keeps the cheapest provider per canonical key", async () => {
    const { normalizeProviderService, pickCheapestPerCanonicalKey } = await import("../src/services/catalogSync");
    const normalized = [bwmService, cheapGainsService].map(normalizeProviderService);
    const winners = pickCheapestPerCanonicalKey(normalized);

    expect(winners).toHaveLength(1);
    expect(winners[0]?.providerCode).toBe("bwm");
    expect(winners[0]?.baseKesPer1000).toBe(70);
    expect(winners[0]?.canonicalKey).toBe("instagram:Followers:global");
  });

  it("stores the winner with margin applied and audits both providers", async () => {
    const { syncCatalog, invalidateCatalogCache } = await import("../src/services/catalogSync");
    invalidateCatalogCache();

    const result = await syncCatalog({
      triggeredBy: "admin",
      clients: [makeClient("bwm", [bwmService]), makeClient("cheapgains", [cheapGainsService])],
    });

    expect(result.count).toBe(1);
    expect(insertMany).toHaveBeenCalledTimes(1);
    const audited = insertMany.mock.calls[0]?.[0] as unknown as RawProviderService[];
    expect(audited).toHaveLength(2);

    expect(bulkWrite).toHaveBeenCalledTimes(1);
    const operations = bulkWrite.mock.calls[0]?.[0] as unknown as Array<{
      updateOne: { update: { $set: { providerCode: string; baseKesPer1000: number; sellKesPer1000: number } } };
    }>;
    expect(operations).toHaveLength(1);
    expect(operations[0]?.updateOne.update.$set.providerCode).toBe("bwm");
    expect(operations[0]?.updateOne.update.$set.baseKesPer1000).toBe(70);
    expect(operations[0]?.updateOne.update.$set.sellKesPer1000).toBe(80.5);
    expect(createSyncLog).toHaveBeenCalledTimes(1);
  });

  it("continues when one provider fails", async () => {
    const { syncCatalog, invalidateCatalogCache } = await import("../src/services/catalogSync");
    invalidateCatalogCache();

    const failing: ProviderClient = {
      code: "cheapgains",
      fetchServices: async () => {
        throw new Error("upstream down");
      },
      placeOrder: async () => ({ providerOrderId: "1" }),
      getOrderStatus: async () => ({ status: "pending" }),
    };

    const result = await syncCatalog({
      triggeredBy: "cron",
      clients: [makeClient("bwm", [bwmService]), failing],
    });

    expect(result.count).toBe(1);
    const logged = createSyncLog.mock.calls[0]?.[0] as unknown as { errors: string[]; bwmCount: number };
    expect(logged.bwmCount).toBe(1);
    expect(logged.errors.some((entry) => entry.includes("cheapgains"))).toBe(true);
  });
});

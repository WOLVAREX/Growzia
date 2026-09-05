import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler";
import { env } from "../../lib/env";
import { sessionOrApiKey } from "../../middleware/sessionOrApiKey";
import { getCachedCatalog, getCatalogCategories, getCatalogMeta } from "../../services/catalogSync";
import { convertFromKes, listCurrencies, resolveCurrency } from "../../services/pricing";

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(120).optional(),
  currency: z.string().trim().max(8).optional(),
});

export const catalogRouter = Router();

catalogRouter.get(
  "/services",
  sessionOrApiKey,
  asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query);
    const currency = resolveCurrency(query.currency ?? env.DEFAULT_CURRENCY);
    const entries = await getCachedCatalog(query.q, query.category);

    res.json({
      currency: { code: currency.code, symbol: currency.symbol },
      count: entries.length,
      updatedAt: getCatalogMeta().updatedAt,
      services: entries.map((entry) => ({
        id: entry.id,
        name: entry.name,
        category: entry.category,
        platformId: entry.platformId,
        serviceType: entry.serviceType,
        isRegionVariant: entry.isRegionVariant,
        min: entry.min,
        max: entry.max,
        pricePer1000: convertFromKes(entry.sellKesPer1000, currency.code),
      })),
    });
  }),
);

catalogRouter.get(
  "/categories",
  sessionOrApiKey,
  asyncHandler(async (_req, res) => {
    const categories = await getCatalogCategories();
    res.json({ count: categories.length, categories });
  }),
);

catalogRouter.get(
  "/currencies",
  sessionOrApiKey,
  asyncHandler(async (_req, res) => {
    res.json({
      defaultCurrency: env.DEFAULT_CURRENCY,
      currencies: listCurrencies().map((item) => ({ code: item.code, symbol: item.symbol })),
    });
  }),
);

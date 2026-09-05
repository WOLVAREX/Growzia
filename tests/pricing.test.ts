import { describe, expect, it } from "vitest";
import { convertFromKes, convertToKes, quantityCostKes, sellPrice } from "../src/services/pricing";
import { normalizeBoostStatus } from "../src/services/statusNormalizer";
import { detectIsRegionVariant, detectPlatformId, detectServiceType } from "../src/services/classify";

describe("pricing", () => {
  it("applies the margin on top of the base KES price", () => {
    expect(sellPrice(70, 15)).toBe(80.5);
    expect(sellPrice(400, 15)).toBe(460);
    expect(sellPrice(100, 0)).toBe(100);
  });

  it("never returns negative prices", () => {
    expect(sellPrice(-10, 15)).toBe(0);
    expect(sellPrice(70, -5)).toBe(70);
  });

  it("converts between KES and other currencies", () => {
    expect(convertFromKes(1300, "USD")).toBe(10);
    expect(convertToKes(10, "USD")).toBe(1300);
    expect(convertFromKes(500, "KES")).toBe(500);
  });

  it("falls back to KES for unknown currencies", () => {
    expect(convertFromKes(250, "XYZ")).toBe(250);
  });

  it("computes per-quantity cost from the per-1000 rate", () => {
    expect(quantityCostKes(80.5, 1000)).toBe(80.5);
    expect(quantityCostKes(80.5, 500)).toBe(40.25);
    expect(quantityCostKes(80.5, 0)).toBe(0);
  });
});

describe("status normalizer", () => {
  it("maps provider strings onto the shared enum", () => {
    expect(normalizeBoostStatus("In progress")).toBe("processing");
    expect(normalizeBoostStatus("COMPLETED")).toBe("completed");
    expect(normalizeBoostStatus("partially_completed")).toBe("partial");
    expect(normalizeBoostStatus("Canceled")).toBe("failed");
    expect(normalizeBoostStatus("refund")).toBe("refunded");
    expect(normalizeBoostStatus("queued")).toBe("pending");
  });

  it("uses the fallback for unknown or empty values", () => {
    expect(normalizeBoostStatus(undefined)).toBe("pending");
    expect(normalizeBoostStatus("weird-state", "processing")).toBe("processing");
  });
});

describe("classification", () => {
  it("detects platforms", () => {
    expect(detectPlatformId("Instagram Followers", "Instagram Services")).toBe("instagram");
    expect(detectPlatformId("Tik Tok Likes", "Boosting")).toBe("tiktok");
    expect(detectPlatformId("Unknown Widget", "General")).toBe("other");
  });

  it("detects service types", () => {
    expect(detectServiceType("Instagram Followers", "Instagram Services")).toBe("Followers");
    expect(detectServiceType("YouTube Watch Time", "YouTube")).toBe("Other");
    expect(detectServiceType("TikTok Video Views", "TikTok")).toBe("Views");
  });

  it("detects region variants", () => {
    expect(detectIsRegionVariant("Nigeria Instagram Followers", "Instagram")).toBe(true);
    expect(detectIsRegionVariant("Instagram Followers", "Instagram")).toBe(false);
  });
});

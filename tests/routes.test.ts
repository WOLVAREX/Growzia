import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { resetRateLimits } from "../src/middleware/rateLimit";

let maintenanceMode = false;

vi.mock("../src/services/settings", () => ({
  getMaintenanceMode: async () => maintenanceMode,
  getMarginPercent: async () => 15,
  getDisabledServices: async () => [],
  setMaintenanceMode: async (value: boolean) => value,
  setMarginPercent: async (value: number) => value,
  setDisabledServices: async (value: string[]) => value,
  clearSettingsCache: () => undefined,
  SETTING_KEYS: { maintenanceMode: "maintenanceMode", marginPercent: "marginPercent", disabledServices: "disabledServices" },
}));

vi.mock("../src/services/catalogSync", () => ({
  getCachedCatalog: async () => [],
  getCatalogCategories: async () => [],
  getCatalogMeta: () => ({ count: 0, updatedAt: null }),
  syncCatalog: async () => ({ count: 0, updatedAt: new Date().toISOString() }),
  repriceCatalog: async () => 0,
  invalidateCatalogCache: () => undefined,
}));

describe("route protection", () => {
  beforeEach(() => {
    maintenanceMode = false;
    resetRateLimits();
  });

  it("rejects unauthenticated catalog reads", async () => {
    const { createApp } = await import("../src/app");
    const response = await request(createApp()).get("/api/boost/services");
    expect(response.status).toBe(401);
    expect(response.body.error).toBeTypeOf("string");
  });

  it("rejects unauthenticated order placement", async () => {
    const { createApp } = await import("../src/app");
    const response = await request(createApp())
      .post("/api/boost/order")
      .send({ serviceId: "abc", link: "https://instagram.com/example", quantity: 100 });
    expect(response.status).toBe(401);
  });

  it("rejects admin routes without a token", async () => {
    const { createApp } = await import("../src/app");
    const response = await request(createApp()).get("/api/admin/stats");
    expect(response.status).toBe(401);
  });

  it("rejects admin routes for a non-admin token", async () => {
    const { createApp } = await import("../src/app");
    const { signAuthToken } = await import("../src/lib/tokens");
    const token = signAuthToken({ sub: "507f1f77bcf86cd799439011", email: "user@example.com", role: "user" });

    const response = await request(createApp()).get("/api/admin/stats").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(403);
  });

  it("issues an admin token for valid env credentials", async () => {
    const { User } = await import("../src/models/User");
    const adminDoc = { _id: "507f1f77bcf86cd799439012", username: "admin", isAdmin: true, isBanned: false, save: async () => undefined };
    vi.spyOn(User, "findOne").mockReturnValue({ exec: async () => adminDoc } as never);

    const { createApp } = await import("../src/app");
    const response = await request(createApp())
      .post("/api/admin/auth/login")
      .send({ identifier: "admin@example.com", password: "change-me" });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeTypeOf("string");
    expect(response.body.admin.email).toBe("admin@example.com");
  });

  it("rejects wrong admin credentials", async () => {
    const { createApp } = await import("../src/app");
    const response = await request(createApp())
      .post("/api/admin/auth/login")
      .send({ identifier: "admin@example.com", password: "wrong-password" });
    expect(response.status).toBe(401);
  });

  it("returns 503 on boost routes while maintenance mode is on", async () => {
    maintenanceMode = true;
    const { createApp } = await import("../src/app");
    const app = createApp();

    const services = await request(app).get("/api/boost/services");
    expect(services.status).toBe(503);

    const order = await request(app)
      .post("/api/boost/order")
      .send({ serviceId: "abc", link: "https://instagram.com/example", quantity: 100 });
    expect(order.status).toBe(503);
  });

  it("keeps admin routes reachable during maintenance mode", async () => {
    maintenanceMode = true;
    const { createApp } = await import("../src/app");
    const response = await request(createApp()).get("/api/admin/stats");
    expect(response.status).toBe(401);
  });

  it("rejects unknown API keys on the v2 endpoint", async () => {
    const { User } = await import("../src/models/User");
    vi.spyOn(User, "findOne").mockReturnValue({ exec: async () => null } as never);

    const { createApp } = await import("../src/app");
    const response = await request(createApp())
      .post("/api/v2")
      .type("form")
      .send({ key: "bogus", action: "services" });
    expect(response.status).toBe(401);
  });
});

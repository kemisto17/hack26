import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/api/errors";
import { requireJobActor } from "@/lib/api/job-auth";
import { bindBillingServices } from "@/modules/billing/service";
import type { BillingServices } from "@/modules/billing/service";
import { createBillingRunHandler } from "@/modules/billing/runner";
import { IDS, makeBindings } from "./fixtures";

const job = { kind: "billing_job" } as const;

function handler(runBilling: BillingServices["runBilling"], verifyJob = vi.fn(async () => job)) {
  return {
    POST: createBillingRunHandler({
      verifyJob,
      services: { runBilling } as unknown as BillingServices,
    }),
    verifyJob,
  };
}

function request(body: string, init: RequestInit = {}) {
  return new Request("https://app.test/api/v1/billing/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    ...init,
  });
}

describe("billing runner handler", () => {
  it("binds D1's job-secret verifier directly without a user session", async () => {
    vi.stubEnv("BILLING_JOB_SECRET", "fake-billing-job-secret-at-least-32-characters");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const listDue = vi.fn(async () => [] as string[]);
      const services = bindBillingServices(makeBindings({
        requireActor: async () => { throw new Error("A billing job must not use a user session"); },
        listDueSubscriptionIds: listDue,
      }));
      const POST = createBillingRunHandler({ verifyJob: requireJobActor, services });
      const response = await POST(request("{}", { headers: {
        "content-type": "application/json",
        authorization: "Bearer fake-billing-job-secret-at-least-32-characters",
      } }));
      expect(response.status).toBe(200);
      expect(listDue).toHaveBeenCalledWith(100);
    } finally {
      vi.unstubAllEnvs();
      log.mockRestore();
    }
  });

  it("uses only the verified job actor and returns a private batch result", async () => {
    const runBilling = vi.fn(async () => ({ processed: 2, failed: 0, has_more: false }));
    const { POST, verifyJob } = handler(runBilling);
    const incoming = request(JSON.stringify({ limit: 5 }));
    const response = await POST(incoming);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      data: { processed: 2, failed: 0, has_more: false },
      request_id: expect.any(String),
    });
    expect(verifyJob).toHaveBeenCalledWith(incoming);
    expect(runBilling).toHaveBeenCalledWith(job, { limit: 5 });
  });

  it("rejects methods, content types, malformed JSON and unverified jobs", async () => {
    const runBilling = vi.fn(async () => ({ processed: 0, failed: 0, has_more: false }));
    const { POST, verifyJob } = handler(runBilling);

    expect((await POST(new Request("https://app.test/api/v1/billing/run", { method: "GET" }))).status).toBe(404);
    expect(verifyJob).not.toHaveBeenCalled();

    const noJson = await POST(request("{}", { headers: { "content-type": "text/plain" } }));
    expect(noJson.status).toBe(400);
    expect(runBilling).not.toHaveBeenCalled();

    const malformed = await POST(request("{"));
    expect(malformed.status).toBe(400);

    const denied = createBillingRunHandler({
      verifyJob: async () => {
        throw new AppError("UNAUTHENTICATED", "A job secret is required.");
      },
      services: { runBilling } as unknown as BillingServices,
    });
    const response = await denied(request("{}"));
    expect(response.status).toBe(401);
    expect(runBilling).not.toHaveBeenCalled();
  });

  it("does not accept a client-supplied actor and redacts unexpected failures", async () => {
    const listDue = vi.fn(async () => [] as string[]);
    const services = bindBillingServices(makeBindings({ listDueSubscriptionIds: listDue }));
    const real = createBillingRunHandler({ verifyJob: async () => job, services });
    const spoofed = await real(
      request(JSON.stringify({ limit: 1, actor_id: IDS.admin, role: "admin" })),
    );
    expect(spoofed.status).toBe(400);
    expect(listDue).not.toHaveBeenCalled();

    const runBilling = vi.fn(async () => {
      throw new Error("secret database detail");
    });
    const { POST } = handler(runBilling);
    const response = await POST(request(JSON.stringify({ limit: 1 })));
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).not.toContain("secret database detail");
    expect(text).toContain("INTERNAL_ERROR");
    expect(runBilling).toHaveBeenCalledWith(job, { limit: 1 });
  });

  it("maps verified job authorization failures without invoking billing", async () => {
    const runBilling = vi.fn();
    const denied = createBillingRunHandler({
      verifyJob: async () => {
        throw new AppError("FORBIDDEN", "Not a billing job.");
      },
      services: { runBilling } as unknown as BillingServices,
    });
    const response = await denied(request("{}"));
    expect(response.status).toBe(403);
    expect(runBilling).not.toHaveBeenCalled();
  });
});

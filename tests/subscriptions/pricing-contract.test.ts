import { expectTypeOf, it } from "vitest";
import type { priceQuote } from "@/modules/catalog/service";
import type { SubscriptionBindings } from "@/modules/subscriptions/service";

it("accepts the catalog quote preview without persisted line IDs", () => {
  expectTypeOf<typeof priceQuote>().toMatchTypeOf<SubscriptionBindings["priceQuote"]>();
});

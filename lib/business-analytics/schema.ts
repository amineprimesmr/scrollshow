import { pgTable, text, timestamp, jsonb, primaryKey, uniqueIndex, index, foreignKey } from "drizzle-orm/pg-core";
import type { OwnedEntity } from "./model";

/** Project registry provides a real cascading ownership boundary, independent of billing's JSONB. */
export const businessProjects = pgTable("ss_business_projects", {
  userId: text("user_id").notNull(), projectId: text("project_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
}, t => [primaryKey({ columns: [t.userId, t.projectId] })]);

/** Minimal deletion fence: old in-flight workers cannot recreate erased user data. */
export const businessDeletedUsers = pgTable("ss_business_deleted_users", {
  userId: text("user_id").primaryKey(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

function recordTable(name: string) {
  return pgTable(name, {
    id: text("id").notNull(), userId: text("user_id").notNull(), projectId: text("project_id").notNull(),
    naturalKey: text("natural_key").notNull(), lookupKey: text("lookup_key"),
    connectionId: text("connection_id"), currency: text("currency"),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    /** One bounded entity per row, not a shared workspace document. Indexed dimensions stay relational. */
    data: jsonb("data").$type<OwnedEntity>().notNull(),
  }, t => [
    primaryKey({ columns: [t.userId, t.projectId, t.id] }),
    uniqueIndex(`${name}_natural`).on(t.userId, t.projectId, t.naturalKey),
    uniqueIndex(`${name}_lookup`).on(t.lookupKey),
    index(`${name}_period`).on(t.userId, t.projectId, t.occurredAt),
    index(`${name}_connection`).on(t.userId, t.projectId, t.connectionId),
    foreignKey({ columns: [t.userId, t.projectId], foreignColumns: [businessProjects.userId, businessProjects.projectId] }).onDelete("cascade"),
  ]);
}
export const businessConnections = recordTable("ss_business_connections");
export const businessPublications = recordTable("ss_business_publications");
export const businessTransactions = recordTable("ss_business_transactions");
export const businessAdjustments = recordTable("ss_business_adjustments");
export const businessLinks = recordTable("ss_business_links");
export const businessClicks = recordTable("ss_business_clicks");
export const businessIdentities = recordTable("ss_business_identities");
export const businessEvents = recordTable("ss_business_events");
export const businessCosts = recordTable("ss_business_costs");
export const businessExperiments = recordTable("ss_business_experiments");
export const businessSettings = recordTable("ss_business_settings");
export const businessTrackingKeys = recordTable("ss_business_tracking_keys");
export const businessTables = {
  connections: businessConnections, publications: businessPublications, transactions: businessTransactions,
  adjustments: businessAdjustments, links: businessLinks, clicks: businessClicks, identities: businessIdentities,
  events: businessEvents, costs: businessCosts, experiments: businessExperiments, settings: businessSettings, trackingKeys: businessTrackingKeys,
};

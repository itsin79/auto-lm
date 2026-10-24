import { sqliteTable, text, integer, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";
export const inspections = sqliteTable("inspections", {
  ownerId: text("owner_id").notNull(), id: text("id").notNull(),
  requestId: text("request_id").notNull(), requestHash: text("request_hash").notNull(),
  revision: integer("revision").notNull().default(1), search: text("search").notNull(),
  updatedAt: text("updated_at").notNull(), record: text("record").notNull(),
}, (t) => [primaryKey({ columns: [t.ownerId, t.id] }), uniqueIndex("inspections_request").on(t.ownerId, t.requestId)]);

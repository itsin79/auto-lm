import { env } from "cloudflare:workers";
import { normalize } from "./domain.mjs";
export type StoredRecord = {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  vehicle: {
    model: string;
    year: string;
    mileage: string;
    plate: string;
    inspector: string;
    color: string;
    vin: string;
    date: string;
  };
  items: Record<string, { condition: "healthy" | "review" | "faulty" | null; note: string; evidence: string }>;
  step: string;
  complete: boolean;
  provenance: "user_description";
  additionalNotes: string[];
  sourceHistory: Array<{ text: string; recordedAt: string }>;
};
function db() { if (!env.DB) throw new Error("Database unavailable"); return env.DB; }
const search = (r:StoredRecord) => normalize([r.id, r.vehicle.model, r.vehicle.plate, r.vehicle.inspector].join(" "));
export const repository = {
  async get(owner:string, id:string):Promise<StoredRecord|null> {
    const row = await db().prepare("SELECT record FROM inspections WHERE owner_id = ? AND id = ?").bind(owner,id).first<{record:string}>();
    return row ? JSON.parse(row.record) : null;
  },
  async create(owner:string, requestId:string, hash:string, record:StoredRecord) {
    await db().prepare("INSERT OR IGNORE INTO inspections (owner_id,id,request_id,request_hash,revision,search,updated_at,record) VALUES (?,?,?,?,?,?,?,?)").bind(owner,record.id,requestId,hash,record.revision,search(record),record.updatedAt,JSON.stringify(record)).run();
    const row = await db().prepare("SELECT record, request_hash FROM inspections WHERE owner_id = ? AND request_id = ?").bind(owner,requestId).first<{record:string;request_hash:string}>();
    if (!row || row.request_hash !== hash) throw new Error("REQUEST_CONFLICT");
    return JSON.parse(row.record);
  },
  async update(owner:string, expected:number, record:StoredRecord) {
    const result = await db().prepare("UPDATE inspections SET record = ?,revision = ?,search = ?,updated_at = ? WHERE owner_id = ? AND id = ? AND revision = ?").bind(JSON.stringify(record),record.revision,search(record),record.updatedAt,owner,record.id,expected).run();
    if (result.meta.changes !== 1) throw new Error("REVISION_CONFLICT");
    return record;
  },
  async list(owner:string, query:string, limit:number) {
    const result = await db().prepare("SELECT record FROM inspections WHERE owner_id = ? AND search LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT ?").bind(owner,`%${normalize(query).replace(/[\\%_]/g, "\\$&")}%`,limit).all<{record:string}>();
    return result.results.map(r=>JSON.parse(r.record));
  },
};

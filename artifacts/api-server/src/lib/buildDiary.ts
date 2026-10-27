/*
 * Construction diary helpers: the optional tags of a photo (floor, room, which template shot) and the stage status
 * people see. A photo never means the work is done; only the owner marks a stage done.
 */
import { FLOOR_RANGE, ROOM_KINDS, templateOf } from "./buildTemplates";

export type DiaryStatus = "not_started" | "photos" | "done";
export const diaryStatus = (status: string, photos: number): DiaryStatus => (status === "confirmed" ? "done" : photos > 0 ? "photos" : "not_started");

const has = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
/**
 * Tags from a client. Unknown values become null (never guessed). With `partial`, only keys the client sent are
 * returned, so a PATCH changes only those.
 */
export function photoTags(raw: Record<string, unknown>, templateKey: string | null, partial = false) {
  const out: { floorLevel?: number | null; roomKind?: string | null; shotKey?: string | null } = {};
  if (!partial || has(raw, "floorLevel")) {
    const f = typeof raw.floorLevel === "number" ? raw.floorLevel : typeof raw.floorLevel === "string" && raw.floorLevel.trim() ? Number(raw.floorLevel) : null;
    out.floorLevel = f != null && Number.isInteger(f) && f >= FLOOR_RANGE[0] && f <= FLOOR_RANGE[1] ? f : null;
  }
  if (!partial || has(raw, "roomKind")) out.roomKind = typeof raw.roomKind === "string" && (ROOM_KINDS as readonly string[]).includes(raw.roomKind) ? raw.roomKind : null;
  if (!partial || has(raw, "shotKey")) {
    const shots = templateOf(templateKey)?.shots ?? [];
    out.shotKey = typeof raw.shotKey === "string" && shots.some((s) => s.key === raw.shotKey) ? raw.shotKey : null;
  }
  return out;
}

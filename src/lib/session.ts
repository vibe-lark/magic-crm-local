import type { NextRequest } from "next/server";
import { crm } from "@/lib/crm/service";
import type { Actor } from "@/lib/crm/types";

export const ACTOR_COOKIE = "crm_actor";
export const DEFAULT_ACTOR_ID = "user_admin";

export function actorFromRequest(request: NextRequest): Actor {
  return crm.actor(request.cookies.get(ACTOR_COOKIE)?.value || DEFAULT_ACTOR_ID);
}

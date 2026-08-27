import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/crm/error";
import { crm } from "@/lib/crm/service";
import { ACTOR_COOKIE, DEFAULT_ACTOR_ID } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    const actor = crm.actor(request.cookies.get(ACTOR_COOKIE)?.value || DEFAULT_ACTOR_ID);
    return NextResponse.json({ ok: true, data: { actor, users: crm.users() } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();
    const actor = crm.actor(String(userId || ""));
    const response = NextResponse.json({ ok: true, data: actor });
    response.cookies.set(ACTOR_COOKIE, actor.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 86_400 });
    return response;
  } catch (error) { return errorResponse(error); }
}

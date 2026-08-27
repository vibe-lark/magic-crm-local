import { revokeToken } from "@/lib/oauth";

export async function POST(request:Request){const type=request.headers.get("content-type")||"";const input=type.includes("application/json")?await request.json():Object.fromEntries(await request.formData());revokeToken(String(input.token||""));return new Response(null,{status:200,headers:{"Cache-Control":"no-store"}});}

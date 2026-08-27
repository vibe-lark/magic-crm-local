import { authorizationServerMetadata } from "@/lib/oauth";
export async function GET(){return Response.json(authorizationServerMetadata(),{headers:{"Cache-Control":"no-store"}});}

import { authorizationServerMetadata } from "@/lib/oauth";
import { oauthDiagnostic } from "@/lib/oauth-diagnostics";
export async function GET(){oauthDiagnostic("authorization_metadata_read");return Response.json(authorizationServerMetadata(),{headers:{"Cache-Control":"no-store"}});}

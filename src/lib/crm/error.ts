export class CrmError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "CrmError";
  }
}

export function errorResponse(error: unknown): Response {
  const normalized = error instanceof CrmError
    ? error
    : new CrmError("INTERNAL_ERROR", error instanceof Error ? error.message : "服务异常", 500);
  return Response.json(
    { ok: false, error: { code: normalized.code, message: normalized.message } },
    { status: normalized.status, headers: { "Cache-Control": "no-store" } },
  );
}

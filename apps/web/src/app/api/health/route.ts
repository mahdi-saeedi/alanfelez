// Liveness/readiness probe for Kubernetes and compose. Keep it dependency-free.
export function GET() {
  return Response.json({ status: "ok" });
}

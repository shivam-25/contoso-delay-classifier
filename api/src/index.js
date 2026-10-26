// Azure Functions v4 programming model: routes are registered in code.
const { app } = require("@azure/functions");
const crypto = require("crypto");
const { validate, score, container, REQUESTS, RUNS, model } = require("./shared");

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

// Logging must never break a prediction, so every failure here is swallowed.
async function logRequest(context, doc) {
  try {
    const c = container(REQUESTS);
    if (!c) return context.warn?.("Cosmos not configured - request not logged");
    const now = new Date();
    await c.items.create({
      id: crypto.randomUUID(),
      date: now.toISOString().slice(0, 10), // partition key
      ts: now.toISOString(),
      model: `${model.model_name}@${model.version}`,
      ...doc,
      latency_ms: Number(Number(doc.latency_ms).toFixed(2)),
    });
  } catch (err) {
    context.error?.("request log failed: " + err.message);
  }
}

app.http("predict", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "predict",
  handler: async (request, context) => {
    const started = process.hrtime.bigint();
    const latency = () => Number(process.hrtime.bigint() - started) / 1e6;

    let body = {};
    try { body = await request.json(); } catch { body = {}; }

    const { ok, errors, value } = validate(body);
    if (!ok) {
      // 400s are logged too, so the reported error rate is honest.
      await logRequest(context, { status: 400, latency_ms: latency(), errors, input: body });
      return { status: 400, headers: JSON_HEADERS,
               jsonBody: { error: "validation_failed", details: errors } };
    }

    const result = score(value);
    const latency_ms = latency();
    await logRequest(context, {
      status: 200, latency_ms, input: value,
      probability: result.probability, label: result.label,
    });

    return {
      status: 200,
      headers: JSON_HEADERS,
      jsonBody: {
        label: result.label,
        delayed: result.delayed,
        probability: Number(result.probability.toFixed(4)),
        threshold: model.threshold,
        model: `${model.model_name}@${model.version}`,
        latency_ms: Number(latency_ms.toFixed(2)),
      },
    };
  },
});

const percentile = (sorted, p) => {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Number(sorted[Math.max(0, i)].toFixed(2));
};

app.http("metrics", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "metrics",
  handler: async (request, context) => {
    const look = Math.min(Number(request.query.get("limit")) || 200, 1000);
    const out = {
      model: `${model.model_name}@${model.version}`,
      training_metrics: model.metrics,
      cosmos_connected: false,
      window: look,
    };

    const reqs = container(REQUESTS);
    if (!reqs) {
      out.note = "Cosmos not configured; live request metrics unavailable.";
      return { status: 200, headers: JSON_HEADERS, jsonBody: out };
    }

    try {
      const { resources } = await reqs.items.query({
        query: "SELECT TOP @n c.ts, c.status, c.latency_ms, c.label, c.probability " +
               "FROM c ORDER BY c.ts DESC",
        parameters: [{ name: "@n", value: look }],
      }).fetchAll();

      const lat = resources.map((r) => r.latency_ms)
                           .filter(Number.isFinite).sort((a, b) => a - b);
      const errors = resources.filter((r) => r.status >= 400).length;

      out.cosmos_connected = true;
      out.total_requests = resources.length;
      out.errors = errors;
      out.error_rate_pct = resources.length
        ? Number(((100 * errors) / resources.length).toFixed(2)) : 0;
      out.latency_ms = {
        p50: percentile(lat, 50), p95: percentile(lat, 95),
        min: lat.length ? Number(lat[0].toFixed(2)) : null,
        max: lat.length ? Number(lat[lat.length - 1].toFixed(2)) : null,
      };
      out.recent = resources.slice(0, 10);

      const runs = container(RUNS);
      if (runs) {
        const r = await runs.items.query(
          "SELECT TOP 5 c.model_name, c.version, c.auc, c.f1, c.recall, c.trained_at " +
          "FROM c ORDER BY c.trained_at DESC").fetchAll();
        out.model_runs = r.resources;
      }
    } catch (err) {
      context.error?.("metrics query failed: " + err.message);
      out.error = "metrics_query_failed";
      out.detail = err.message;
    }

    return { status: 200, headers: JSON_HEADERS, jsonBody: out };
  },
});

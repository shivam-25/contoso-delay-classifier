const { container, REQUESTS, RUNS, model } = require("../shared");

const percentile = (sorted, p) => {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Number(sorted[Math.max(0, i)].toFixed(2));
};

module.exports = async function (context, req) {
  const look = Math.min(Number(req.query.limit) || 200, 1000);
  const out = {
    model: `${model.model_name}@${model.version}`,
    training_metrics: model.metrics,
    cosmos_connected: false,
    window: look,
  };

  const reqs = container(REQUESTS);
  if (!reqs) {
    out.note = "Cosmos not configured; live request metrics unavailable.";
    context.res = { status: 200, headers: json(), body: out };
    return;
  }

  try {
    // Cross-partition by design: the dashboard reads a small recent slice.
    const { resources } = await reqs.items
      .query({
        query:
          "SELECT TOP @n c.ts, c.status, c.latency_ms, c.label, c.probability " +
          "FROM c ORDER BY c.ts DESC",
        parameters: [{ name: "@n", value: look }],
      })
      .fetchAll();

    const lat = resources.map((r) => r.latency_ms).filter(Number.isFinite).sort((a, b) => a - b);
    const errors = resources.filter((r) => r.status >= 400).length;

    out.cosmos_connected = true;
    out.total_requests = resources.length;
    out.errors = errors;
    out.error_rate_pct = resources.length
      ? Number(((100 * errors) / resources.length).toFixed(2))
      : 0;
    out.latency_ms = { p50: percentile(lat, 50), p95: percentile(lat, 95), 
                       min: lat.length ? Number(lat[0].toFixed(2)) : null,
                       max: lat.length ? Number(lat[lat.length - 1].toFixed(2)) : null };
    out.recent = resources.slice(0, 10);

    const runs = container(RUNS);
    if (runs) {
      const r = await runs.items
        .query("SELECT TOP 5 c.model_name, c.version, c.auc, c.f1, c.trained_at FROM c ORDER BY c.trained_at DESC")
        .fetchAll();
      out.model_runs = r.resources;
    }
  } catch (err) {
    context.log.error("metrics query failed", err.message);
    out.error = "metrics_query_failed";
    out.detail = err.message;
  }

  context.res = { status: 200, headers: json(), body: out };
};

const json = () => ({ "Content-Type": "application/json", "Cache-Control": "no-store" });

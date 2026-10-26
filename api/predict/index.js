const crypto = require("crypto");
const { validate, score, container, REQUESTS, model } = require("../shared");

module.exports = async function (context, req) {
  const started = process.hrtime.bigint();
  const latency = () => Number(process.hrtime.bigint() - started) / 1e6;

  const { ok, errors, value } = validate(req.body);
  if (!ok) {
    // Still logged: a 400 is part of the error rate the portal reports.
    await log(context, { status: 400, latency_ms: latency(), errors, input: req.body });
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: { error: "validation_failed", details: errors },
    };
    return;
  }

  const result = score(value);
  const latency_ms = latency();

  await log(context, {
    status: 200,
    latency_ms,
    input: value,
    probability: result.probability,
    label: result.label,
  });

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: {
      label: result.label,
      delayed: result.delayed,
      probability: Number(result.probability.toFixed(4)),
      threshold: model.threshold,
      model: `${model.model_name}@${model.version}`,
      latency_ms: Number(latency_ms.toFixed(2)),
    },
  };
};

// Request logging must never break a prediction, so every failure is swallowed.
async function log(context, doc) {
  try {
    const c = container(REQUESTS);
    if (!c) {
      context.log.warn("Cosmos not configured - request not logged");
      return;
    }
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
    context.log.error("request log failed", err.message);
  }
}

#!/usr/bin/env node
/* Area C: write the training run into Cosmos `model_runs`.
   usage: COSMOS_ENDPOINT=... COSMOS_KEY=... node scripts/seed_model_runs.js */
const { CosmosClient } = require("@azure/cosmos");
const model = require("../api/model.json");

(async () => {
  const { COSMOS_ENDPOINT: endpoint, COSMOS_KEY: key } = process.env;
  if (!endpoint || !key) {
    console.error("set COSMOS_ENDPOINT and COSMOS_KEY"); process.exit(1);
  }
  const c = new CosmosClient({ endpoint, key })
    .database(process.env.COSMOS_DB || "contoso")
    .container(process.env.COSMOS_RUNS_CONTAINER || "model_runs");

  const trained_at = new Date().toISOString();
  for (const [name, m] of Object.entries(model.metrics)) {
    const doc = {
      id: `${name}-${trained_at}`,
      model_name: name,                 // partition key
      version: model.version,
      shipped: name === "LogisticRegression",
      trained_at,
      trained_rows: model.trained_rows,
      auc: m.auc, precision: m.precision, recall: m.recall,
      f1: m.f1, accuracy: m.accuracy, confusion: m.confusion,
    };
    await c.items.upsert(doc);
    console.log(`wrote ${name}: AUC ${m.auc}  F1 ${m.f1}  recall ${m.recall}`);
  }
  console.log("model_runs seeded");
})().catch((e) => { console.error(e.message); process.exit(1); });

// Shared scoring + Cosmos helpers for the Contoso delay API.
// The model is plain JSON weights, so scoring needs no Python runtime.
const model = require("./model.json");
const { CosmosClient } = require("@azure/cosmos");

const DB = process.env.COSMOS_DB || "contoso";
const REQUESTS = process.env.COSMOS_REQUESTS_CONTAINER || "requests";
const RUNS = process.env.COSMOS_RUNS_CONTAINER || "model_runs";

let _client = null;
// Lazily built so a missing key degrades to "logging off" instead of a 500.
function cosmos() {
  if (_client) return _client;
  const endpoint = process.env.COSMOS_ENDPOINT;
  const key = process.env.COSMOS_KEY;
  if (!endpoint || !key) return null;
  _client = new CosmosClient({ endpoint, key });
  return _client;
}

function container(name) {
  const c = cosmos();
  return c ? c.database(DB).container(name) : null;
}

const FIELDS = {
  distance_km:       { min: 0,  max: 10000 },
  weight_kg:         { min: 0,  max: 1000  },
  items:             { min: 1,  max: 1000  },
  order_hour:        { min: 0,  max: 23    },
  is_sale_day:       { min: 0,  max: 1     },
  warehouse_backlog: { min: 0,  max: 1000  },
  weather_index:     { min: 0,  max: 1     },
};

// Returns { ok, errors[], value } - never throws on bad user input.
function validate(body) {
  const errors = [];
  if (!body || typeof body !== "object") {
    return { ok: false, errors: ["body must be a JSON object"] };
  }
  const carrier = body.carrier;
  if (!carrier || !model.carriers.includes(carrier)) {
    errors.push(`carrier must be one of: ${model.carriers.join(", ")}`);
  }
  const value = { carrier };
  for (const [f, rule] of Object.entries(FIELDS)) {
    const raw = body[f];
    if (raw === undefined || raw === null || raw === "") {
      errors.push(`${f} is required`);
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      errors.push(`${f} must be a number`);
    } else if (n < rule.min || n > rule.max) {
      errors.push(`${f} must be between ${rule.min} and ${rule.max}`);
    } else {
      value[f] = n;
    }
  }
  return { ok: errors.length === 0, errors, value };
}

// sigmoid(w . z + b) where z is the standardised feature vector.
function score(v) {
  const row = model.feature_order.map((name) => {
    if (name.startsWith("carrier_")) {
      return v.carrier === name.slice("carrier_".length) ? 1 : 0;
    }
    return v[name];
  });
  let z = model.intercept;
  for (let i = 0; i < row.length; i++) {
    z += ((row[i] - model.mean[i]) / model.scale[i]) * model.coef[i];
  }
  const probability = 1 / (1 + Math.exp(-z));
  return {
    probability,
    delayed: probability >= model.threshold,
    label: probability >= model.threshold ? "Likely delayed" : "Likely on time",
  };
}

module.exports = { model, validate, score, container, DB, REQUESTS, RUNS };

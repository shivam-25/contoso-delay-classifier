"""Contoso Delay Classifier :: Area B :: training + evaluation.

Trains two candidates on the 10,000-row history, reports the full metric set
(AUC, precision, recall, F1 - not just accuracy), and exports the chosen model
as plain JSON so the serving layer needs no Python runtime.
"""
import json, pathlib, sys
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (roc_auc_score, precision_score, recall_score,
                             f1_score, accuracy_score, confusion_matrix)

ROOT = pathlib.Path(__file__).resolve().parents[1]
CSV = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "data" / "contoso_delay_training.csv")
CARRIERS = ["BlueDart", "Delhivery", "EcomExp", "IndiaPost"]
NUMERIC = ["distance_km", "weight_kg", "items", "order_hour",
           "is_sale_day", "warehouse_backlog", "weather_index"]


def featurise(df):
    """Numeric columns + one-hot carrier. Column order is the model's contract."""
    X = df[NUMERIC].astype(float).copy()
    for c in CARRIERS:                      # drop-first avoids collinearity
        if c != CARRIERS[0]:
            X[f"carrier_{c}"] = (df["carrier"] == c).astype(float)
    return X


def report(name, y, proba, thr=0.5):
    pred = (proba >= thr).astype(int)
    m = dict(
        model=name,
        auc=round(roc_auc_score(y, proba), 4),
        precision=round(precision_score(y, pred, zero_division=0), 4),
        recall=round(recall_score(y, pred, zero_division=0), 4),
        f1=round(f1_score(y, pred, zero_division=0), 4),
        accuracy=round(accuracy_score(y, pred), 4),
    )
    tn, fp, fn, tp = confusion_matrix(y, pred).ravel()
    m["confusion"] = dict(tn=int(tn), fp=int(fp), fn=int(fn), tp=int(tp))
    return m


def main():
    df = pd.read_csv(CSV)
    print(f"loaded {len(df):,} rows from {CSV}")
    print(f"class balance: delayed={df.delayed.mean():.1%}")

    X, y = featurise(df), df["delayed"].astype(int)
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2,
                                          random_state=42, stratify=y)

    scaler = StandardScaler().fit(Xtr)
    Xtr_s, Xte_s = scaler.transform(Xtr), scaler.transform(Xte)

    results = []

    # Candidate 1: logistic regression - exportable to pure JSON.
    lr = LogisticRegression(max_iter=2000, class_weight="balanced").fit(Xtr_s, ytr)
    results.append(report("LogisticRegression", yte, lr.predict_proba(Xte_s)[:, 1]))

    # Candidate 2: gradient boosting - the accuracy ceiling, for comparison.
    gb = HistGradientBoostingClassifier(random_state=42).fit(Xtr, ytr)
    results.append(report("HistGradientBoosting", yte, gb.predict_proba(Xte)[:, 1]))

    print(f"\n=== held-out test metrics (20% split, n={len(yte)}) ===")
    hdr = f"{'model':<24}{'AUC':>8}{'prec':>8}{'recall':>8}{'F1':>8}{'acc':>8}"
    print(hdr); print("-" * len(hdr))
    for m in results:
        print(f"{m['model']:<24}{m['auc']:>8}{m['precision']:>8}"
              f"{m['recall']:>8}{m['f1']:>8}{m['accuracy']:>8}")
    for m in results:
        print(f"\n{m['model']} confusion: {m['confusion']}")

    # Export the logistic model: the serving layer is Node, so we ship weights
    # rather than a pickle. Scoring is sigmoid(w . z + b) on standardised input.
    out = dict(
        model_name="contoso-delay-lr",
        version="1.0.0",
        trained_rows=int(len(Xtr)),
        feature_order=list(X.columns),
        carriers=CARRIERS,
        baseline_carrier=CARRIERS[0],
        mean=[round(v, 8) for v in scaler.mean_.tolist()],
        scale=[round(v, 8) for v in scaler.scale_.tolist()],
        coef=[round(v, 8) for v in lr.coef_[0].tolist()],
        intercept=round(float(lr.intercept_[0]), 8),
        threshold=0.5,
        metrics={m["model"]: m for m in results},
    )
    (ROOT / "api").mkdir(exist_ok=True)
    (ROOT / "api" / "model.json").write_text(json.dumps(out, indent=2))
    (ROOT / "ml" / "metrics.json").write_text(json.dumps(results, indent=2))
    print(f"\nexported -> api/model.json  ({len(X.columns)} features)")
    print("exported -> ml/metrics.json")


if __name__ == "__main__":
    main()

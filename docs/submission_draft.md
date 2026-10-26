| Field | Details |
|---|---|
| Name | Shivam |
| GitHub | @shivam-25 |
| 🔗 Repo | https://github.com/shivam-25/contoso-delay-classifier |
| 🌐 Live portal URL | __SWA_URL__ |
| 🎥 Demo video | __VIDEO_URL__ |
| 🧭 Approach (2–4 lines) | Loaded the 10k-row CSV into Azure SQL behind a `vw_DelayTraining` view so features and analysis can't drift, then answered the three questions as **rates** rather than counts: IndiaPost is 2.2× worse than BlueDart (28.6% vs 13.2%), a sale day almost exactly doubles delays (32.1% vs 16.2%), and backlog is a monotonic gradient (15.2% → 26.8%). Trained LogisticRegression vs HistGradientBoosting and shipped the **lower-accuracy** model on purpose: at 18.1% positives, HistGB scores 81.8% accuracy while catching only 17% of real delays, so I shipped LogReg (AUC 0.743, recall 0.673, F1 0.451). The model serves as JSON weights inside a Node Functions API (verified identical to scikit-learn to 0.0), with every request — including 400s — logged to Cosmos `requests` and surfaced as live p50/p95 and error rate. |
| 🚧 Unfinished / stuck on | __UNFINISHED__ |

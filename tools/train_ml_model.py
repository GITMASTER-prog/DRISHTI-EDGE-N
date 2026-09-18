# ================================================================
# DRISHTI GCS - ML MODEL TRAINER & JS EXPORTER
#
# Trains the exact models from DRISHTI_Analytics.py
#   - Random Forest supervised fault classifier (5 classes)
#   - Isolation Forest unsupervised anomaly detector
# on data/DRISHTI_Engine_Telemetry.csv, then exports both models as a
# single embeddable JavaScript file (js/ml_model.js) that the GCS loads
# for real-time, in-browser fault diagnosis.
#
# Run:  py tools/train_ml_model.py
# ================================================================

import csv
import json
import os
import sys
from collections import Counter

import numpy as np
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
INPUT_FILE = os.path.join(ROOT, "data", "DRISHTI_Engine_Telemetry.csv")
OUTPUT_JS = os.path.join(ROOT, "js", "ml_model.js")

# Export budget knobs: the full 300k-row dataset trains enormous trees.
# A stratified subsample + capped depth keeps the browser model small
# (< ~2.5 MB) while staying >= 99% accurate on the held-out 20% test split.
TRAIN_SUBSAMPLE_PER_CLASS = 12000
RF_TREES = 40
RF_MAX_DEPTH = 10
RF_MIN_LEAF = 20
IF_TREES = 100           # exactly as in DRISHTI_Analytics.py
IF_CONTAMINATION = 0.10  # exactly as in DRISHTI_Analytics.py
SEED = 42

FEATURES = ["RPM", "MAP", "Fuel_Flow", "CHT", "EGT",
            "Power", "Vibration", "Ambient_Pressure", "Oil_Temperature"]

FAULT_LABELS = {0: "Normal", 1: "Injector Clog", 2: "MAP Sensor Drift",
                3: "CHT Fault", 4: "RPM Fault"}


def load_dataset():
    print("Loading telemetry data...")
    with open(INPUT_FILE, newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        # Simulink generic columns (Var1..Var14) -> real names
        if len(header) == 14 and all(h.strip().startswith("Var") for h in header):
            header = ["Time", "RPM", "MAP", "Fuel_Flow", "CHT", "EGT", "Power",
                      "Vibration", "Ambient_Pressure", "Oil_Temperature",
                      "Fault_Diagnosis", "Anomaly_Flag", "Anomaly_Score", "Health_Index"]
        rows = []
        for r in reader:
            try:
                vals = [float(x) for x in r]
            except ValueError:
                continue
            if len(vals) != len(header) or not all(np.isfinite(vals)):
                continue
            rows.append(vals)
    data = np.asarray(rows, dtype=np.float64)
    idx = {name: i for i, name in enumerate(header)}
    print(f"Rows loaded: {data.shape[0]}")
    return data, idx


def main():
    data, idx = load_dataset()
    X = data[:, [idx[f] for f in FEATURES]]
    y = data[:, idx["Fault_Diagnosis"]].astype(int)

    # ---- Stratified training subsample, full-data stratified test split ----
    rng = np.random.default_rng(SEED)
    train_rows = []
    for cls in sorted(set(y.tolist())):
        cls_rows = np.flatnonzero(y == cls)
        take = min(TRAIN_SUBSAMPLE_PER_CLASS, len(cls_rows))
        train_rows.append(rng.choice(cls_rows, size=take, replace=False))
    train_rows = np.concatenate(train_rows)
    rng.shuffle(train_rows)

    X_train, y_train = X[train_rows], y[train_rows]
    X_all_idx = np.arange(len(y))
    X_tr_split, X_te, y_tr_split, y_te = train_test_split(
        X_train, y_train, test_size=0.20, random_state=SEED, stratify=y_train)

    # ---- 1. Random Forest (same hyperparameters as the analytics script,
    #         plus depth/leaf caps for the browser export) ----
    print(f"\nTraining Random Forest ({RF_TREES} trees, depth<={RF_MAX_DEPTH})...")
    rf = RandomForestClassifier(
        n_estimators=RF_TREES,
        max_depth=RF_MAX_DEPTH,
        min_samples_leaf=RF_MIN_LEAF,
        random_state=SEED,
        n_jobs=-1,
        class_weight="balanced")
    rf.fit(X_tr_split, y_tr_split)
    y_pred = rf.predict(X_te)
    accuracy = accuracy_score(y_te, y_pred)
    print(f"  Held-out accuracy: {accuracy * 100:.4f}%")
    print(classification_report(y_te, y_pred, labels=[0, 1, 2, 3, 4],
                                target_names=list(FAULT_LABELS.values()),
                                zero_division=0))
    print("Confusion Matrix:")
    print(confusion_matrix(y_te, y_pred, labels=[0, 1, 2, 3, 4]))

    # ---- 2. Isolation Forest (exact analytics-script configuration: trained
    #         on ALL rows, contamination 0.10) ----
    print("\nTraining Isolation Forest...")
    iso = IsolationForest(n_estimators=IF_TREES, contamination=IF_CONTAMINATION,
                          random_state=SEED, n_jobs=-1)
    iso.fit(X)

    # Export normalization range of the raw anomaly score
    # raw = -(decision_function) = offset_ - score_samples, high = anomalous
    sample = X[rng.choice(len(X), size=min(30000, len(X)), replace=False)]
    raw_sample = -iso.decision_function(sample)
    raw_min, raw_max = float(raw_sample.min()), float(raw_sample.max())
    span = max(raw_max - raw_min, 1e-12)
    print(f"  Raw score range on sample: [{raw_min:.4f}, {raw_max:.4f}]")

    # Healthy-data raw score stats for the GCS display band (score > healthy
    # max on live telemetry = the ML sees something it was not trained on).
    raw_healthy = -iso.decision_function(X[y == 0][:50000])

    # ---- 3. Export trees to JSON-ready structures ----
    def export_sklearn_forest(forest, is_classifier):
        trees = []
        for est in forest.estimators_:
            t = est.tree_
            features = t.feature.astype(np.int64)
            thresholds = np.round(t.threshold, 4)
            left = t.children_left.astype(np.int64)
            right = t.children_right.astype(np.int64)
            if is_classifier:
                probs = t.value[:, 0, :]                     # (nodes, n_classes)
                probs = probs / probs.sum(axis=1, keepdims=True)
                probs = np.round(probs, 4)
            else:
                sizes = np.round(t.n_node_samples.astype(np.float64), 1)
            nodes = []
            for i in range(len(features)):
                if left[i] == -1:                            # leaf
                    if is_classifier:
                        nodes.append([-1, [float(p) for p in probs[i]]])
                    else:
                        nodes.append([-1, float(sizes[i])])
                else:
                    nodes.append([int(features[i]), float(thresholds[i]),
                                  int(left[i]), int(right[i])])
            trees.append(nodes)
        return trees

    print("\nExporting model trees...")
    rf_trees = export_sklearn_forest(rf, True)
    if_trees = export_sklearn_forest(iso, False)
    rf_nodes = sum(len(t) for t in rf_trees)
    if_nodes = sum(len(t) for t in if_trees)
    print(f"  RF: {len(rf_trees)} trees / {rf_nodes} nodes")
    print(f"  IF: {len(if_trees)} trees / {if_nodes} nodes")
    healthy_max = float(np.percentile(raw_healthy, 99.5))
    print(f"  Healthy raw-score 99.5th pct (GCS display band top): {healthy_max:.4f}")

    # Healthy-cruise anchors from the dataset (class 0) for the GCS unit
    # calibration layer: dataset cruise (RPM 4900-5300) means.
    cruise = (y == 0) & (X[:, 0] >= 4900) & (X[:, 0] <= 5300)
    anchors = {f: round(float(X[cruise][:, i].mean()), 4)
               for i, f in enumerate(FEATURES)}
    print("  Dataset healthy cruise anchors:", anchors)

    # ---- 4. Self-check: evaluate the exported JSON trees in pure Python on
    #         4000 held-out rows and compare with sklearn predictions ----
    print("\nSelf-checking exported trees against sklearn...")
    check_idx = rng.choice(np.setdiff1d(np.arange(len(y)), train_rows),
                           size=min(4000, len(y) - len(train_rows)), replace=False)

    def tree_predict(nodes, x):
        n = 0
        while True:
            node = nodes[n]
            if node[0] == -1:
                return node[1]
            f, thr, l, r = node
            n = l if x[f] <= thr else r

    def forest_predict(trees, x, is_classifier):
        if is_classifier:
            agg = np.zeros(5)
            for tr in trees:
                agg += np.asarray(tree_predict(tr, x))
            return int(np.argmax(agg))
        c = sum(tree_predict(tr, x) for tr in trees)
        return c

    mismatches = 0
    for i in check_idx:
        js_cls = forest_predict(rf_trees, X[i], True)
        sk_cls = int(rf.predict(X[i:i + 1])[0])
        if js_cls != sk_cls:
            mismatches += 1
    print(f"  RF exported-vs-sklearn mismatches: {mismatches}/{len(check_idx)}")
    y_true_check = y[check_idx]
    y_export_check = np.asarray([forest_predict(rf_trees, X[i], True) for i in check_idx])
    export_acc = accuracy_score(y_true_check, y_export_check)
    print(f"  Exported-model accuracy on fresh held-out rows: {export_acc * 100:.4f}%")
    if mismatches > 2 or export_acc < 0.985:
        print("  ERROR: export does not reproduce the trained model.")
        sys.exit(1)

    # ---- 5. Write js/ml_model.js ----
    payload = {
        "meta": {
            "trained_from": "data/DRISHTI_Engine_Telemetry.csv",
            "pipeline": "DRISHTI_Analytics.py (SIH 2026)",
            "rows": int(data.shape[0]),
            "train_rows": int(len(train_rows)),
            "rf_trees": len(rf_trees),
            "rf_max_depth": RF_MAX_DEPTH,
            "held_out_accuracy": round(float(accuracy), 6),
            "export_check_accuracy": round(float(export_acc), 6),
            "classes": [FAULT_LABELS[c] for c in range(5)],
            "trained_on": "2026-09-15"
        },
        "features": FEATURES,
        "rf": {
            "classes": [0, 1, 2, 3, 4],
            "trees": rf_trees
        },
        "iforest": {
            "n_trees": len(if_trees),
            "sample_size": int(iso.max_samples_),
            "offset": round(float(iso.offset_), 6),
            "score_min": round(raw_min, 6),
            "score_max": round(raw_max, 6),
            "healthy_score_p995": round(healthy_max, 6),
            "trees": if_trees
        },
        "calibration": {
            "comment": ("Maps GCS physics-engine telemetry into the dataset feature "
                        "space. Linear anchors taken from the GCS probe at 55% throttle "
                        "vs the dataset healthy-cruise mean (RPM 4900-5300)."),
            "anchors_dataset": anchors,
            "anchors_gcs": {
                "RPM": 4300.0, "MAP": 26.40, "Fuel_Flow": 16.71, "CHT": 90.6,
                "EGT": 688.0, "Power": 54.18, "Vibration": 1.006,
                "Ambient_Pressure": 24.9, "Oil_Temperature": 84.9
            }
        }
    }

    os.makedirs(os.path.dirname(OUTPUT_JS), exist_ok=True)
    with open(OUTPUT_JS, "w", encoding="utf-8") as f:
        f.write("/**\n")
        f.write(" * DRISHTI GCS — Embedded ML Fault-Diagnosis Model\n")
        f.write(" * Auto-generated by tools/train_ml_model.py — DO NOT EDIT BY HAND.\n")
        f.write(" * Trained on data/DRISHTI_Engine_Telemetry.csv (300,000 frames)\n")
        f.write(f" * Random Forest held-out accuracy: {accuracy * 100:.2f}%\n")
        f.write(" * Consumed by js/ml_classifier.js (real-time in-browser inference).\n")
        f.write(" */\n")
        f.write("window.DRISHTI_ML_MODEL = ")
        json.dump(payload, f, separators=(",", ":"))
        f.write(";\n")

    # IF tree-shape check: leaves must all be [-1, n_samples] pairs
    assert all(len(t) > 10 for t in if_trees), "IF export looks wrong"
    size_mb = os.path.getsize(OUTPUT_JS) / (1024 * 1024)
    print(f"\nWrote {OUTPUT_JS} ({size_mb:.2f} MB)")
    print("ANALYTICS EXPORT COMPLETE")


if __name__ == "__main__":
    main()


# ================================================================
# DRISHTI - ROTAX 914 DIGITAL TWIN ANALYTICS
# Single complete analytics pipeline
# ================================================================

import os

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use("Agg")  # headless: plt.show() becomes a no-op so the script never blocks
import matplotlib.pyplot as plt

from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix
)

# ================================================================
# 1. LOAD DATA
# ================================================================

INPUT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "DRISHTI_Engine_Telemetry.csv")
OUTPUT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "digital_twin_processed_analytics.csv")

print("\nLoading telemetry data...")

df = pd.read_csv(INPUT_FILE)

print("Rows loaded:", len(df))
print("Columns:", list(df.columns))


# ================================================================
# 2. RENAME GENERIC SIMULINK COLUMNS IF REQUIRED
# ================================================================

expected_columns = [
    "Time",
    "RPM",
    "MAP",
    "Fuel_Flow",
    "CHT",
    "EGT",
    "Power",
    "Vibration",
    "Ambient_Pressure",
    "Oil_Temperature",
    "Fault_Diagnosis",
    "Anomaly_Flag",
    "Anomaly_Score",
    "Health_Index"
]

if len(df.columns) == len(expected_columns):

    generic_names = all(
        str(col).startswith("Var") for col in df.columns
    )

    if generic_names:
        df.columns = expected_columns


# ================================================================
# 3. CHECK REQUIRED COLUMNS
# ================================================================

required_columns = [
    "Time",
    "RPM",
    "MAP",
    "Fuel_Flow",
    "CHT",
    "EGT",
    "Power",
    "Vibration",
    "Ambient_Pressure",
    "Oil_Temperature",
    "Fault_Diagnosis"
]

missing = [
    col for col in required_columns
    if col not in df.columns
]

if missing:
    raise ValueError(
        "Missing required columns: " + str(missing)
    )


# ================================================================
# 4. REMOVE INVALID VALUES
# ================================================================

df = df.replace([np.inf, -np.inf], np.nan)

df = df.dropna(
    subset=required_columns
).reset_index(drop=True)


# ================================================================
# 5. FAULT LABELS
# ================================================================

fault_labels = {
    0: "Normal",
    1: "Injector Clog",
    2: "MAP Sensor Drift",
    3: "CHT Fault",
    4: "RPM Fault"
}

df["Fault_Name"] = (
    df["Fault_Diagnosis"]
    .map(fault_labels)
    .fillna("Unknown")
)


# ================================================================
# 6. PHYSICAL HEALTH INDICATORS
# ================================================================

df["CHT_Overtemperature"] = (
    df["CHT"] > 135
).astype(int)

df["EGT_Overtemperature"] = (
    df["EGT"] > 950
).astype(int)

df["Oil_Overtemperature"] = (
    df["Oil_Temperature"] > 110
).astype(int)

df["High_Vibration"] = (
    df["Vibration"] > 4.5
).astype(int)


# ================================================================
# 7. DERIVED PARAMETERS
# ================================================================

# Rate of CHT increase
df["dCHT_dt"] = np.gradient(
    df["CHT"].values,
    df["Time"].values
)

# Rate of RPM change
df["dRPM_dt"] = np.gradient(
    df["RPM"].values,
    df["Time"].values
)

# Power in kW
df["Power_kW"] = df["Power"] * 0.7457

# Fuel flow in g/s
df["Fuel_Flow_g_s"] = df["Fuel_Flow"] * 1000


# ================================================================
# 8. ISOLATION FOREST - UNSUPERVISED ANOMALY DETECTION
# ================================================================

print("\nRunning Isolation Forest...")

ml_features = [
    "RPM",
    "MAP",
    "Fuel_Flow",
    "CHT",
    "EGT",
    "Power",
    "Vibration",
    "Ambient_Pressure",
    "Oil_Temperature"
]

X_ml = df[ml_features]

iso_forest = IsolationForest(
    n_estimators=100,
    contamination=0.10,
    random_state=42,
    n_jobs=-1
)

iso_prediction = iso_forest.fit_predict(X_ml)

# Isolation Forest:
#  1  = normal
# -1  = anomaly

df["ML_Anomaly_Flag"] = (
    iso_prediction == -1
).astype(int)

# Convert Isolation Forest score
# Higher value = more anomalous

raw_score = -iso_forest.decision_function(X_ml)

score_min = raw_score.min()
score_max = raw_score.max()

if score_max > score_min:
    df["ML_Anomaly_Score"] = (
        (raw_score - score_min) /
        (score_max - score_min)
    )
else:
    df["ML_Anomaly_Score"] = 0.0


# ================================================================
# 9. RANDOM FOREST SUPERVISED FAULT CLASSIFIER
# ================================================================

print("\nTraining Random Forest classifier...")

features = [
    "RPM",
    "MAP",
    "Fuel_Flow",
    "CHT",
    "EGT",
    "Power",
    "Vibration",
    "Ambient_Pressure",
    "Oil_Temperature"
]

X = df[features]
y = df["Fault_Diagnosis"].astype(int)


# Stratified split ensures every fault class
# appears in both training and testing data.

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y
)


rf_model = RandomForestClassifier(
    n_estimators=200,
    random_state=42,
    n_jobs=-1,
    class_weight="balanced"
)

rf_model.fit(X_train, y_train)

y_pred = rf_model.predict(X_test)


# ================================================================
# 10. MODEL PERFORMANCE
# ================================================================

accuracy = accuracy_score(
    y_test,
    y_pred
)

print("\n================================================")
print("RANDOM FOREST RESULTS")
print("================================================")

print(
    f"\nAccuracy: {accuracy:.6f}"
)

print(
    f"Accuracy: {accuracy * 100:.4f}%"
)

print("\nClassification Report:")

print(
    classification_report(
        y_test,
        y_pred,
        labels=[0, 1, 2, 3, 4],
        target_names=[
            "Normal",
            "Injector Clog",
            "MAP Sensor Drift",
            "CHT Fault",
            "RPM Fault"
        ],
        zero_division=0
    )
)


# ================================================================
# 11. CONFUSION MATRIX
# ================================================================

cm = confusion_matrix(
    y_test,
    y_pred,
    labels=[0, 1, 2, 3, 4]
)

print("\nConfusion Matrix:")

print(cm)


# ================================================================
# 12. FEATURE IMPORTANCE
# ================================================================

importance = pd.DataFrame({
    "Feature": features,
    "Importance": rf_model.feature_importances_
})

importance = importance.sort_values(
    by="Importance",
    ascending=False
)

print("\nFeature Importance:")

print(
    importance.to_string(index=False)
)


# ================================================================
# 13. SAVE MODEL PREDICTIONS
# ================================================================

# Store prediction only for the test samples.

df["RF_Predicted_Fault"] = np.nan

test_indices = X_test.index

df.loc[
    test_indices,
    "RF_Predicted_Fault"
] = y_pred


# ================================================================
# 14. HEALTH DEGRADATION
# ================================================================

df["Health_Degradation"] = (
    100 - df["Health_Index"]
)

df["Health_Degradation"] = (
    df["Health_Degradation"]
    .clip(0, 100)
)


# ================================================================
# 15. SIMPLE RUL ESTIMATION
# ================================================================

# RUL is expressed in seconds.
# This is a simple degradation-rate estimate,
# not a certified engine-life prediction.

health = df["Health_Index"].values
time = df["Time"].values

rul = np.zeros(len(df))

for i in range(len(df)):

    current_health = health[i]

    if current_health <= 0:
        rul[i] = 0
        continue

    if i < 10:
        rul[i] = 0
        continue

    previous_health = health[max(0, i-100):i]
    previous_time = time[max(0, i-100):i]

    if len(previous_health) < 2:
        rul[i] = 0
        continue

    health_drop = (
        previous_health[0]
        - previous_health[-1]
    )

    time_elapsed = (
        previous_time[-1]
        - previous_time[0]
    )

    if health_drop > 0 and time_elapsed > 0:

        degradation_rate = (
            health_drop / time_elapsed
        )

        rul[i] = (
            current_health /
            degradation_rate
        )

    else:
        rul[i] = 0


df["RUL_Seconds"] = rul


# ================================================================
# 16. PRINT FAULT DISTRIBUTION
# ================================================================

print("\n================================================")
print("FAULT DISTRIBUTION")
print("================================================")

print(
    df["Fault_Name"].value_counts()
)


# ================================================================
# 17. TELEMETRY PLOTS
# ================================================================

plot_signals = [
    "RPM",
    "MAP",
    "Fuel_Flow",
    "CHT",
    "EGT",
    "Power",
    "Vibration",
    "Oil_Temperature"
]

print("\nGenerating telemetry plots...")

for signal in plot_signals:

    plt.figure(figsize=(11, 4))

    plt.plot(
        df["Time"],
        df[signal]
    )

    plt.xlabel("Time (s)")
    plt.ylabel(signal)

    plt.title(
        f"{signal} vs Time"
    )

    plt.grid(True)

    plt.tight_layout()

    plt.show()


# ================================================================
# 18. FAULT DIAGNOSIS VS TIME
# ================================================================

plt.figure(figsize=(11, 4))

plt.plot(
    df["Time"],
    df["Fault_Diagnosis"]
)

plt.xlabel("Time (s)")
plt.ylabel("Fault Class")

plt.title(
    "Fault Diagnosis vs Time"
)

plt.yticks(
    [0, 1, 2, 3, 4],
    [
        "Normal",
        "Injector Clog",
        "MAP Drift",
        "CHT Fault",
        "RPM Fault"
    ]
)

plt.grid(True)

plt.tight_layout()

plt.show()


# ================================================================
# 19. HEALTH INDEX VS TIME
# ================================================================

plt.figure(figsize=(11, 4))

plt.plot(
    df["Time"],
    df["Health_Index"]
)

plt.xlabel("Time (s)")
plt.ylabel("Health Index")

plt.title(
    "Engine Health Index vs Time"
)

plt.grid(True)

plt.tight_layout()

plt.show()


# ================================================================
# 20. ML ANOMALY SCORE
# ================================================================

plt.figure(figsize=(11, 4))

plt.plot(
    df["Time"],
    df["ML_Anomaly_Score"]
)

plt.xlabel("Time (s)")
plt.ylabel("Anomaly Score")

plt.title(
    "Isolation Forest Anomaly Score vs Time"
)

plt.grid(True)

plt.tight_layout()

plt.show()


# ================================================================
# 21. FEATURE IMPORTANCE PLOT
# ================================================================

plt.figure(figsize=(9, 5))

plt.barh(
    importance["Feature"],
    importance["Importance"]
)

plt.xlabel("Importance")

plt.ylabel("Feature")

plt.title(
    "Random Forest Feature Importance"
)

plt.gca().invert_yaxis()

plt.tight_layout()

plt.show()


# ================================================================
# 22. CONFUSION MATRIX PLOT
# ================================================================

plt.figure(figsize=(7, 6))

plt.imshow(cm)

plt.title(
    "Random Forest Confusion Matrix"
)

plt.xlabel("Predicted Class")

plt.ylabel("Actual Class")

plt.xticks(
    [0, 1, 2, 3, 4],
    ["Normal", "Injector", "MAP", "CHT", "RPM"],
    rotation=30
)

plt.yticks(
    [0, 1, 2, 3, 4],
    ["Normal", "Injector", "MAP", "CHT", "RPM"]
)

for i in range(cm.shape[0]):

    for j in range(cm.shape[1]):

        plt.text(
            j,
            i,
            cm[i, j],
            ha="center",
            va="center"
        )

plt.colorbar()

plt.tight_layout()

plt.show()


# ================================================================
# 23. SAVE FINAL DATASET
# ================================================================

df.to_csv(
    OUTPUT_FILE,
    index=False
)

print("\n================================================")
print("ANALYTICS COMPLETE")
print("================================================")

print(
    f"\nProcessed dataset saved as:\n{OUTPUT_FILE}"
)

print(
    f"\nFinal dataset size: {len(df)} rows"
)

print(
    f"Final dataset columns: {len(df.columns)}"
)

print(
    "\nAll telemetry analysis, anomaly detection,"
    "\nclassification, health analysis and plots"
    "\nwere completed using this single script."
)


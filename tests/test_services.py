import json

import numpy as np
import pytest

from app.services import compare_algorithms, dataset_info, run_clustering
from core.datasets import load_dataset
from core.preprocessing import standardize
from app.resources import DATASETS


def test_replay_conserves_samples_and_uses_full_feature_sse():
    result = run_clustering({"dataset": "wine", "algorithm": "improved", "k": 3, "seed": 42})
    json.dumps(result, allow_nan=False)
    x = standardize(load_dataset("wine", DATASETS).features)
    assert np.shape(result["points_2d"]) == (178, 2)
    assert x.shape == (178, 13)
    assert sum(result["explained_variance_ratio"]) < 1
    for n, frame in enumerate(result["frames"]):
        assert frame["step"] == n
        assert len(frame["cluster_ids"]) == len(x)
        assert set(frame["cluster_ids"]) == set(frame["center_ids"])
        assert sum(cluster["size"] for cluster in frame["clusters"]) == len(x)
        by_id = {c["id"]: c["center"] for c in frame["clusters"]}
        residuals = x - np.array([by_id[cluster] for cluster in frame["cluster_ids"]])
        assert frame["sse"] == pytest.approx(float(np.square(residuals).sum()))
    last = result["frames"][-1]
    assert len(last["center_ids"]) == 3
    assert last["sse"] == pytest.approx(result["metrics"]["sse"])


def test_ablation_is_paired_and_matches_individual_demo():
    comparison = compare_algorithms(dict(dataset="seeds", k=3, k_min=1, k_max=2, seed=42, repeats=2))
    assert comparison["seeds"] == [42, 43]
    assert [row["k"] for row in comparison["sensitivity"]] == [1, 2]
    rows = { (r["algorithm"], r["k"], r["seed"]): r for r in comparison["runs"] }
    assert len(rows) == 6 * 3 * 2
    for summary in comparison["summary"]:
        variant = summary["algorithm"]
        runs = [rows[variant, 3, seed] for seed in comparison["seeds"]]
        assert summary["mean_sse"] == pytest.approx(np.mean([r["sse"] for r in runs]))
        direct = run_clustering(dict(dataset="seeds", k=3, seed=42, algorithm=variant))
        assert direct["metrics"]["sse"] == pytest.approx(runs[0]["sse"])
        assert rows[variant, 1, 42]["silhouette"] is None
    assert rows["b2", 3, 42]["candidate_evaluations"] > rows["b1", 3, 42]["candidate_evaluations"]


@pytest.mark.parametrize("name,counts", [("seeds", (210, 7, 3)), ("wine", (178, 13, 3))])
def test_offline_uci_asset(name, counts):
    info = dataset_info(name)
    assert (info["samples"], info["features"], info["classes"]) == counts

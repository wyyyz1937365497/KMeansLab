from collections.abc import Mapping
from dataclasses import dataclass
from time import perf_counter

import numpy as np

from algorithms import bisecting, improved, kmeans
from core.datasets import list_datasets, load_dataset
from core.metrics import adjusted_rand_index, euclidean_distances, silhouette_score
from core.pca import PCA
from core.preprocessing import standardize

from .resources import DATASETS


@dataclass(frozen=True)
class Algorithm:
    bisect: bool = True
    init: str = "random"
    strategy: str = "max_sse"
    restart: bool = False


VARIANTS = {
    "kmeans": Algorithm(bisect=False),
    "kmeans_pp": Algorithm(bisect=False, init="kmeans++"),
    "b0": Algorithm(),
    "b0_pp": Algorithm(init="kmeans++"),
    "b1": Algorithm(init="kmeans++", restart=True),
    "b2": Algorithm(init="kmeans++", strategy="max_gain", restart=True),
}
ALIASES = {"bisecting": "b0", "improved": "b2"}


def _int(config, name, default, low, high):
    value = config.get(name, default)
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f"{name} 必须为 {low} 至 {high} 之间的整数。")
    return value


def _settings(config):
    if not isinstance(config, Mapping):
        raise ValueError("实验配置必须为对象。")
    name = config.get("dataset", "seeds")
    data = load_dataset(name, DATASETS)
    tol = config.get("tol", 1e-6)
    if type(tol) not in (int, float) or not 0 <= tol <= 1:
        raise ValueError("tol 必须在 [0, 1] 之间。")
    params = {
        "k": _int(config, "k", min(3, len(data.features)), 1, len(data.features)),
        "seed": _int(config, "seed", 42, 0, 2**32 - 1),
        "max_iter": _int(config, "max_iter", 100, 1, 1000),
        "tol": tol,
        "restarts": _int(config, "restarts", 5, 1, 20),
    }
    return data, standardize(data.features), params


def _fit(x, algorithm, params, record, init_override=None):
    variant = VARIANTS[algorithm]
    kwargs = dict(max_iter=params["max_iter"], tol=params["tol"],
                  random_state=params["seed"], init_method=init_override or variant.init)
    module = (improved if variant.restart else bisecting) if variant.bisect else kmeans
    if variant.bisect:
        kwargs.update(strategy=variant.strategy,
                      restarts=params["restarts"] if variant.restart else 1)
    start = perf_counter()
    result = (module.fit_steps if record else module.fit)(x, params["k"], **kwargs)
    return result, (perf_counter() - start) * 1000


def _metrics(x, truth, result, elapsed, distances=None):
    return {
        "sse": float(result.sse),
        "ari": None if truth is None else adjusted_rand_index(truth, result.labels),
        "silhouette": silhouette_score(x, result.labels, distances=distances),
        "elapsed_ms": elapsed,
        "iterations": int(result.iterations),
        "candidate_evaluations": int(result.candidate_evaluations),
    }


def dataset_info(name):
    dataset = load_dataset(name, DATASETS)
    return {
        "id": name,
        "name": dataset.name,
        "description": dataset.description,
        "source": dataset.source,
        "samples": len(dataset.features),
        "features": len(dataset.feature_names),
        "classes": None if dataset.labels is None else len(np.unique(dataset.labels)),
        "feature_names": list(dataset.feature_names),
    }


def datasets():
    return [dataset_info(name) for name in list_datasets()]


def run_clustering(config):
    data, x, params = _settings(config)
    requested = config.get("algorithm", "bisecting")
    algorithm = ALIASES.get(requested, requested)
    if algorithm not in VARIANTS:
        raise ValueError(f"未知算法：{requested}")
    variant = VARIANTS[algorithm]
    override = config.get("init_method") if algorithm == "kmeans" else None
    if override not in (None, "random", "kmeans++"):
        raise ValueError("初始化方法必须是 random 或 kmeans++。")
    result, elapsed = _fit(x, algorithm, params, True, override)
    pca = PCA.fit(x)
    frames = []
    for step, frame in enumerate(result.frames):
        ids = [int(cluster) for cluster in frame.center_ids]
        clusters = []
        for ident, center in zip(ids, frame.centers, strict=True):
            members = x[frame.labels == ident]
            delta = members - center
            clusters.append({"id": ident, "size": len(members),
                             "sse": float(np.einsum("ij,ij->", delta, delta)),
                             "center": center.tolist()})
        frames.append({
            "step": step,
            "event": frame.event,
            "cluster_ids": frame.labels.tolist(),
            "centers_2d": pca.transform(frame.centers).tolist(),
            "center_ids": ids,
            "sse": float(frame.sse),
            "iteration": frame.iteration,
            "split_id": frame.split_id,
            "split_before_sse": frame.split_before_sse,
            "split_after_sse": frame.split_after_sse,
            "tree": frame.tree,
            "clusters": clusters,
            "details": frame.details,
        })
    return {
        "dataset": config.get("dataset", "seeds"),
        "algorithm": requested,
        "parameters": dict(params, init_method=override or variant.init,
                           restarts=params["restarts"] if variant.restart else 1),
        "points_2d": pca.transform(x).tolist(),
        "explained_variance_ratio": pca.explained_variance_ratio.tolist(),
        "frames": frames,
        "metrics": _metrics(x, data.labels, result, elapsed),
        "feature_names": list(data.feature_names),
    }


def _summarize(algorithm, rows):
    def mean(key):
        values = [row[key] for row in rows if row[key] is not None]
        return float(np.mean(values)) if values else None

    objectives = [row["sse"] for row in rows]
    return {
        "algorithm": algorithm,
        "mean_sse": mean("sse"),
        "std_sse": float(np.std(objectives)),
        "best_sse": min(objectives),
        "mean_ari": mean("ari"),
        "mean_silhouette": mean("silhouette"),
        "mean_elapsed_ms": mean("elapsed_ms"),
        "mean_iterations": mean("iterations"),
        "mean_candidate_evaluations": mean("candidate_evaluations"),
    }


def compare_algorithms(config):
    data, x, params = _settings(config)
    repeats = _int(config, "repeats", 20, 1, 100)
    low = _int(config, "k_min", 1, 1, len(x))
    high = _int(config, "k_max", min(8, len(x)), low, len(x))
    seeds = [(params["seed"] + offset) % 2**32 for offset in range(repeats)]
    distances = euclidean_distances(x)
    runs = []
    summaries = {}
    for k in sorted({params["k"], *range(low, high + 1)}):
        summaries[k] = []
        for algorithm in VARIANTS:
            rows = []
            for seed in seeds:
                result, elapsed = _fit(x, algorithm, dict(params, k=k, seed=seed), False)
                rows.append({"algorithm": algorithm, "k": k, "seed": seed,
                             **_metrics(x, data.labels, result, elapsed, distances)})
            runs.extend(rows)
            summaries[k].append(_summarize(algorithm, rows))
    return {
        "dataset": config.get("dataset", "seeds"), "k": params["k"],
        "k_range": [low, high], "repeats": repeats, "seeds": seeds,
        "parameters": params, "summary": summaries[params["k"]],
        "sensitivity": [{"k": k, "summary": summaries[k]} for k in range(low, high + 1)],
        "runs": runs,
    }

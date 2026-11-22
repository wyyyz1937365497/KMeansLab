"""DBSCAN：基于密度的聚类（基础版，纯 NumPy）。

核心概念：
- 核心点：eps 邻域内样本数（含自身）≥ min_samples；
- 边界点：不是核心点，但落在某个核心点的 eps 邻域内；
- 噪声点：既不是核心点也不是边界点，标签记为 -1。

复杂度 O(n²d)（这里直接算全距离矩阵）；样本量在 200 左右时足够。
"""
from dataclasses import dataclass

import numpy as np

from core.metrics import euclidean_distances
from core.preprocessing import feature_matrix


@dataclass(frozen=True)
class DBSCANResult:
    labels: np.ndarray
    core_mask: np.ndarray
    n_clusters: int
    n_noise: int
    eps: float
    min_samples: int


def _validate(values, eps, min_samples):
    x = feature_matrix(values)
    if isinstance(eps, (bool, np.bool_)) or not np.isscalar(eps) or not np.isfinite(eps) or eps <= 0:
        raise ValueError("eps 必须为有限正数。")
    if isinstance(min_samples, (bool, np.bool_)) or not isinstance(min_samples, (int, np.integer)) or min_samples < 1:
        raise ValueError("min_samples 必须为正整数。")
    return x


def fit(values, eps, min_samples):
    """执行 DBSCAN，返回每个样本的簇标签（-1 表示噪声）。"""
    x = _validate(values, eps, min_samples)
    n = len(x)
    distances = euclidean_distances(x)
    neighbours = distances <= eps          # 含自身
    neighbour_counts = neighbours.sum(axis=1)
    core_mask = neighbour_counts >= min_samples

    labels = np.full(n, -1, dtype=np.intp)
    cluster = 0
    for seed in range(n):
        if not core_mask[seed] or labels[seed] != -1:
            continue
        labels[seed] = cluster
        # 以核心点为种子做 BFS；边界点只归入当前簇，不再向外扩展。
        queue = list(np.flatnonzero(neighbours[seed]))
        while queue:
            point = queue.pop()
            if labels[point] == -1:
                labels[point] = cluster
            if not core_mask[point]:
                continue
            for other in np.flatnonzero(neighbours[point]):
                if labels[other] == -1:
                    labels[other] = cluster
                    queue.append(other)
        cluster += 1

    return DBSCANResult(
        labels=labels,
        core_mask=core_mask,
        n_clusters=cluster,
        n_noise=int(np.count_nonzero(labels == -1)),
        eps=float(eps),
        min_samples=int(min_samples),
    )

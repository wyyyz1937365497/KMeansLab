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
    """执行 DBSCAN，返回每个样本的簇标签（-1 表示噪声）。

    两步：
    1. 找核心点：对每个点数一数 eps 邻域内有几个样本（含自己），≥ min_samples 即为核心点；
    2. 连通扩张：从还没归簇的核心点出发做 BFS，邻居进同一簇；邻居也是核心点才继续向外扩。
    """
    x = _validate(values, eps, min_samples)
    n = len(x)
    # 第 1 步：全距离矩阵（n×n），后面数邻居直接查表
    distances = euclidean_distances(x)
    neighbours = distances <= eps          # 含自身
    # 邻居数 = 距离 ≤ eps 的样本数（对角线为 0，所以包含自己）
    neighbour_counts = neighbours.sum(axis=1)
    # 判定核心点：邻居数 ≥ min_samples
    core_mask = neighbour_counts >= min_samples

    # 第 2 步：标签全设为 -1（未归簇）；最后没被任何簇吸收的就是噪声
    labels = np.full(n, -1, dtype=np.intp)
    cluster = 0
    # 只从「核心点且尚未归簇」的样本开始新簇；簇编号按发现顺序 0, 1, 2…
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
            # 边界点只被归入当前簇，不通过它继续扩张
            if not core_mask[point]:
                continue
            # 核心点：把尚未归簇的邻居拉进来，加入队列继续扩张
            for other in np.flatnonzero(neighbours[point]):
                if labels[other] == -1:
                    labels[other] = cluster
                    queue.append(other)
        cluster += 1

    # 没有被任何簇吸收的样本保持 -1，即噪声
    return DBSCANResult(
        labels=labels,
        core_mask=core_mask,
        n_clusters=cluster,
        n_noise=int(np.count_nonzero(labels == -1)),
        eps=float(eps),
        min_samples=int(min_samples),
    )

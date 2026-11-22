import numpy as np


def initialize_centers(x, n_clusters, rng, method="random"):
    """Sample distinct row indices, including when their coordinates are equal."""
    if method == "random":
        return x[rng.choice(len(x), n_clusters, replace=False)]
    if method != "kmeans++":
        raise ValueError("初始化方式必须为 random 或 kmeans++。")

    chosen = np.empty(n_clusters, dtype=np.intp)
    available = np.ones(len(x), dtype=bool)
    closest = np.full(len(x), np.inf)
    row = int(rng.integers(len(x)))
    for i in range(n_clusters):
        chosen[i] = row
        available[row] = False
        if i + 1 == n_clusters:
            break
        delta = x - x[row]
        np.minimum(closest, np.einsum("ij,ij->i", delta, delta), out=closest)
        closest[row] = 0
        weight = closest.sum()
        row = int(rng.choice(len(x), p=closest / weight) if weight else rng.choice(np.flatnonzero(available)))
    return x[chosen]

import numpy as np

from .preprocessing import feature_matrix


def calculate_sse(values, labels, centers):
    """SSE for dense labels indexing the supplied center rows."""
    delta = np.asarray(values) - np.asarray(centers)[np.asarray(labels)]
    return float(np.einsum("ij,ij->", delta, delta))


def euclidean_distances(values):
    x = feature_matrix(values)
    delta = x[:, None, :] - x[None, :, :]
    return np.sqrt(np.einsum("ijk,ijk->ij", delta, delta))


def silhouette_score(values, labels, *, distances=None):
    ids = np.asarray(labels)
    if ids.ndim != 1 or len(ids) != len(values):
        raise ValueError("轮廓系数需要每个样本对应一个簇 ID。")
    _, inverse, sizes = np.unique(ids, return_inverse=True, return_counts=True)
    if not 2 <= len(sizes) < len(ids):
        return None
    if distances is None:
        distances = euclidean_distances(values)
    means = np.column_stack([distances[:, inverse == i].mean(axis=1) for i in range(len(sizes))])
    rows = np.arange(len(ids))
    own_sizes = sizes[inverse]
    within = np.divide(means[rows, inverse] * own_sizes, own_sizes - 1,
                       out=np.zeros(len(ids)), where=own_sizes > 1)
    means[rows, inverse] = np.inf
    between = means.min(axis=1)
    denom = np.maximum(within, between)
    samples = np.divide(between - within, denom, out=np.zeros(len(ids)),
                        where=(denom > 0) & (own_sizes > 1))
    return float(samples.mean())


def adjusted_rand_index(truth, labels):
    truth, labels = np.asarray(truth), np.asarray(labels)
    if truth.ndim != 1 or labels.shape != truth.shape:
        raise ValueError("ARI 需要等长的一维标签。")
    _, a, ac = np.unique(truth, return_inverse=True, return_counts=True)
    _, b, bc = np.unique(labels, return_inverse=True, return_counts=True)
    _, together = np.unique(a * len(bc) + b, return_counts=True)

    def pairs(counts):
        return int(np.sum(counts * (counts - 1) // 2))

    aa, bb, ab = pairs(ac), pairs(bc), pairs(together)
    n = len(truth)
    all_pairs = n * (n - 1) // 2
    numerator = 2 * (ab * all_pairs - aa * bb)
    denominator = (aa + bb) * all_pairs - 2 * aa * bb
    return numerator / denominator if denominator else 1.0

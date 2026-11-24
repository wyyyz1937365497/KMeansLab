import numpy as np

from .preprocessing import feature_matrix


def calculate_sse(values, labels, centers):
    """SSE（簇内平方误差和）：每个样本到自己中心距离的平方之和。labels 是簇下标，centers 按行对应。"""
    delta = np.asarray(values) - np.asarray(centers)[np.asarray(labels)]
    return float(np.einsum("ij,ij->", delta, delta))


def euclidean_distances(values):
    """n×n 的欧氏距离矩阵。"""
    x = feature_matrix(values)
    delta = x[:, None, :] - x[None, :, :]
    return np.sqrt(np.einsum("ijk,ijk->ij", delta, delta))


def silhouette_score(values, labels, *, distances=None):
    """轮廓系数：对每个样本比较「簇内平均距离 a」和「最近的其他簇平均距离 b」。

    s = (b − a) / max(a, b)，取值约 −1…1，越大表示簇内越紧、簇间越远。
    簇数少于 2 或等于样本数时返回 None。
    """
    ids = np.asarray(labels)
    if ids.ndim != 1 or len(ids) != len(values):
        raise ValueError("轮廓系数需要每个样本对应一个簇 ID。")
    _, inverse, sizes = np.unique(ids, return_inverse=True, return_counts=True)
    if not 2 <= len(sizes) < len(ids):
        return None
    if distances is None:
        distances = euclidean_distances(values)
    # means[i, c]：样本 i 到簇 c 中所有样本的平均距离
    means = np.column_stack([distances[:, inverse == i].mean(axis=1) for i in range(len(sizes))])
    rows = np.arange(len(ids))
    own_sizes = sizes[inverse]
    # a：到自己簇内其他样本的平均距离 = (到本簇总和 × 簇大小) / (簇大小 − 1)
    within = np.divide(means[rows, inverse] * own_sizes, own_sizes - 1,
                       out=np.zeros(len(ids)), where=own_sizes > 1)
    # 把自己簇的距离设为无穷，剩下的最小值就是 b（最近的别的簇）
    means[rows, inverse] = np.inf
    between = means.min(axis=1)
    denom = np.maximum(within, between)
    samples = np.divide(between - within, denom, out=np.zeros(len(ids)),
                        where=(denom > 0) & (own_sizes > 1))
    return float(samples.mean())


def adjusted_rand_index(truth, labels):
    """ARI（调整兰德指数）：衡量聚类标签和真实标签的一致性，不受簇编号重排影响。

    思路是数「样本对」：真实同类且预测同簇、真实异类且预测异簇都算一致，
    再扣掉随机情况下的一致比例。1 = 完全一致，0 约等于随机。
    """
    truth, labels = np.asarray(truth), np.asarray(labels)
    if truth.ndim != 1 or labels.shape != truth.shape:
        raise ValueError("ARI 需要等长的一维标签。")
    _, a, ac = np.unique(truth, return_inverse=True, return_counts=True)
    _, b, bc = np.unique(labels, return_inverse=True, return_counts=True)
    # 用 (真实类, 预测簇) 的组合编码，统计每个组合里的样本数
    _, together = np.unique(a * len(bc) + b, return_counts=True)

    # 从 n 个里取 2 个的对数
    def pairs(counts):
        return int(np.sum(counts * (counts - 1) // 2))

    # aa：真实同类的对数；bb：预测同簇的对数；ab：两者都相同的对数
    aa, bb, ab = pairs(ac), pairs(bc), pairs(together)
    n = len(truth)
    all_pairs = n * (n - 1) // 2
    numerator = 2 * (ab * all_pairs - aa * bb)
    denominator = (aa + bb) * all_pairs - 2 * aa * bb
    return numerator / denominator if denominator else 1.0

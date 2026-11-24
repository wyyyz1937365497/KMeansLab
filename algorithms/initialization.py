"""初始中心的两种选法。

- random：不重复地随机抽 K 个样本；
- kmeans++：第一个随机，之后按「到最近已选中心的距离平方」加权抽样，让中心彼此分散。
"""

import numpy as np


def initialize_centers(x, n_clusters, rng, method="random"):
    """返回 K 个互不相同的初始中心（按行下标取样，坐标相同的行也算不同样本）。"""
    if method == "random":
        return x[rng.choice(len(x), n_clusters, replace=False)]
    if method != "kmeans++":
        raise ValueError("初始化方式必须为 random 或 kmeans++。")

    # kmeans++：D² 加权采样
    chosen = np.empty(n_clusters, dtype=np.intp)
    available = np.ones(len(x), dtype=bool)
    # 每个样本到「已选中心集合」的最小平方距离
    closest = np.full(len(x), np.inf)
    # 第一个中心完全随机
    row = int(rng.integers(len(x)))
    for i in range(n_clusters):
        chosen[i] = row
        available[row] = False
        if i + 1 == n_clusters:
            break
        # 用新选中的中心更新 closest（取更小者）
        delta = x - x[row]
        np.minimum(closest, np.einsum("ij,ij->i", delta, delta), out=closest)
        # 已选中的点距离记 0，不会再被选中
        closest[row] = 0
        # 按距离平方归一化作为概率抽取下一个中心；若所有点重合（权重和为 0），退化为从剩余样本里随机取
        weight = closest.sum()
        row = int(rng.choice(len(x), p=closest / weight) if weight else rng.choice(np.flatnonzero(available)))
    return x[chosen]

"""凝聚层次聚类：自底向上合并（基础版，纯 NumPy）。

每个样本先自成一簇，每轮合并距离最近的两簇，直到只剩一簇。
支持 single / average / complete 三种链接方式：

- single：两簇最近点距离；
- complete：两簇最远点距离；
- average：两簇所有点对距离的均值（UPGMA）。

合并历史即树状图（dendrogram）的 Z 矩阵；cut(k) 按前 n-k 次合并切出 k 个簇。
"""
from dataclasses import dataclass

import numpy as np

from core.metrics import euclidean_distances
from core.preprocessing import feature_matrix

LINKAGES = ("single", "average", "complete")


@dataclass(frozen=True)
class Merge:
    left: int          # 左子树在 dendrogram 中的编号
    right: int         # 右子树编号
    distance: float    # 合并时的簇间距离
    size: int          # 合并后的样本数
    left_rep: int      # 左子树代表样本（用于 cut 的并查集）
    right_rep: int


@dataclass(frozen=True)
class Hierarchy:
    n: int
    linkage: str
    merges: tuple[Merge, ...]

    def linkage_matrix(self):
        """返回 (n-1, 4) 的 Z 矩阵，可直接用于 scipy/matplotlib 的 dendrogram。"""
        return np.asarray([[m.left, m.right, m.distance, m.size] for m in self.merges],
                          dtype=np.float64)

    def cut(self, n_clusters):
        """把树切成 n_clusters 个簇，返回长度 n 的标签数组。"""
        if isinstance(n_clusters, (bool, np.bool_)) or not isinstance(n_clusters, (int, np.integer)):
            raise ValueError("簇数必须为整数。")
        if not 1 <= n_clusters <= self.n:
            raise ValueError(f"簇数必须在 1 至 {self.n} 之间。")
        # 并查集：初始每个样本自成一个集合
        parent = list(range(self.n))

        def find(a):
            while parent[a] != a:
                parent[a] = parent[parent[a]]
                a = parent[a]
            return a

        # 前 n-k 次合并：连通块数从 n 降到 k。
        for merge in self.merges[: self.n - n_clusters]:
            a, b = find(merge.left_rep), find(merge.right_rep)
            if a != b:
                parent[b] = a
        # 每个连通块（根）按首次出现顺序编号 0..k-1
        roots = {}
        labels = np.empty(self.n, dtype=np.intp)
        for i in range(self.n):
            root = find(i)
            labels[i] = roots.setdefault(root, len(roots))
        return labels


def _validate(values, linkage):
    x = feature_matrix(values)
    if len(x) < 2:
        raise ValueError("层次聚类至少需要 2 个样本。")
    if linkage not in LINKAGES:
        raise ValueError(f"linkage 必须是 {LINKAGES} 之一。")
    return x


def fit(values, linkage="average"):
    """执行凝聚层次聚类，返回合并历史。"""
    x = _validate(values, linkage)
    n = len(x)
    # 初始簇间距离 = 点与点的欧氏距离；对角线设为无穷，避免自己和自己合并
    distances = euclidean_distances(x)
    np.fill_diagonal(distances, np.inf)

    # active：哪些簇还在；sizes：簇内样本数；nodes：簇在树状图里的编号；reps：簇的代表样本
    active = np.ones(n, dtype=bool)
    sizes = np.ones(n, dtype=np.int64)
    nodes = np.arange(n)                 # 当前簇对应的 dendrogram 编号
    reps = np.arange(n)                  # 当前簇的代表样本下标
    # 合并历史：每轮一条，最后就是树状图
    merges = []

    # n 个簇合并成 1 个，正好 n-1 次
    for step in range(n - 1):
        # 只在仍存活的簇之间找最小距离（其余位置遮成无穷）
        masked = np.where(active[:, None] & active[None, :], distances, np.inf)
        flat = int(np.argmin(masked))
        i, j = divmod(flat, n)
        # 固定左右顺序（小的在前），保证平局时结果确定
        if i > j:
            i, j = j, i
        merge_distance = float(distances[i, j])
        # 记录这次合并：两个子树编号、合并距离、合并后的样本数
        merges.append(Merge(int(nodes[i]), int(nodes[j]), merge_distance,
                            int(sizes[i] + sizes[j]), int(reps[i]), int(reps[j])))

        # 按链接方式更新「新簇 i」到其他簇的距离
        if linkage == "single":
            new = np.minimum(distances[i], distances[j])
        elif linkage == "complete":
            new = np.maximum(distances[i], distances[j])
        else:
            new = (sizes[i] * distances[i] + sizes[j] * distances[j]) / (sizes[i] + sizes[j])
        # 写回第 i 行 / 第 i 列（距离矩阵保持对称）
        merged = distances[i].copy()
        merged[:] = new
        distances[i] = merged
        distances[:, i] = merged
        # 新簇自己到自己 = 无穷；被合并的 j 整行整列作废
        distances[i, i] = np.inf
        distances[j, :] = np.inf
        distances[:, j] = np.inf

        # j 并入 i：j 停用，i 的样本数累加，i 换成新的树状图编号 n+step
        active[j] = False
        sizes[i] += sizes[j]
        nodes[i] = n + step

    return Hierarchy(n=n, linkage=linkage, merges=tuple(merges))

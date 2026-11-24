"""PCA 二维降维（NumPy SVD 实现），只用于把结果画到平面上。

聚类 / 距离 / SSE 始终在完整的标准化特征空间计算，PCA 不参与算法本身。
"""

from dataclasses import dataclass

import numpy as np

from .preprocessing import feature_matrix


@dataclass(frozen=True)
class PCA:
    """前两个主成分：均值、投影方向（components）以及各主成分解释的方差比例。"""
    mean: np.ndarray
    components: np.ndarray
    explained_variance_ratio: np.ndarray

    @classmethod
    def fit(cls, values):
        """用 SVD 求前两个主成分；并固定每个分量的符号，保证同一份数据每次投影方向一致。"""
        x = feature_matrix(values)
        mean = x.mean(axis=0)
        # 对去均值后的矩阵做 SVD：vt 的前两行就是方差最大的两个方向
        _, s, vt = np.linalg.svd(x - mean, full_matrices=False)
        n = min(2, len(s))
        components = np.zeros((2, x.shape[1]))
        components[:n] = vt[:n]
        # 符号约定：让每个分量里绝对值最大的系数为正
        pivots = np.argmax(np.abs(components[:n]), axis=1)
        signs = np.where(components[np.arange(n), pivots] < 0, -1, 1)
        components[:n] *= signs[:, None]
        # 奇异值平方 = 各方向的方差，除以总和得到解释比例
        weights = np.square(s)
        total = weights.sum()
        ratio = np.zeros(2)
        if total:
            ratio[:n] = weights[:n] / total
        return cls(mean, components, ratio)

    def transform(self, values):
        """把样本投影到二维：(x − mean) · componentsᵀ。"""
        x = feature_matrix(values)
        if x.shape[1] != self.mean.size:
            raise ValueError("PCA 投影需要与拟合时相同的特征数。")
        return (x - self.mean) @ self.components.T

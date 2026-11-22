from dataclasses import dataclass

import numpy as np

from .preprocessing import feature_matrix


@dataclass(frozen=True)
class PCA:
    mean: np.ndarray
    components: np.ndarray
    explained_variance_ratio: np.ndarray

    @classmethod
    def fit(cls, values):
        x = feature_matrix(values)
        mean = x.mean(axis=0)
        _, s, vt = np.linalg.svd(x - mean, full_matrices=False)
        n = min(2, len(s))
        components = np.zeros((2, x.shape[1]))
        components[:n] = vt[:n]
        pivots = np.argmax(np.abs(components[:n]), axis=1)
        signs = np.where(components[np.arange(n), pivots] < 0, -1, 1)
        components[:n] *= signs[:, None]
        weights = np.square(s)
        total = weights.sum()
        ratio = np.zeros(2)
        if total:
            ratio[:n] = weights[:n] / total
        return cls(mean, components, ratio)

    def transform(self, values):
        x = feature_matrix(values)
        if x.shape[1] != self.mean.size:
            raise ValueError("PCA 投影需要与拟合时相同的特征数。")
        return (x - self.mean) @ self.components.T

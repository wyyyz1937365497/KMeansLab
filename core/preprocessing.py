import numpy as np


def feature_matrix(values):
    x = np.asarray(values, dtype=np.float64)
    if x.ndim != 2 or not x.shape[0] or not x.shape[1]:
        raise ValueError("特征矩阵必须是非空的二维数组。")
    if not np.isfinite(x).all():
        raise ValueError("特征矩阵不能包含 NaN 或无穷值。")
    return x


def standardize(values):
    """Population Z-score; constant columns are exactly zero."""
    x = feature_matrix(values)
    centered = x - x.mean(axis=0)
    scale = x.std(axis=0)
    constant = np.ptp(x, axis=0) == 0
    scale[constant | (scale == 0)] = 1
    centered[:, constant] = 0
    return centered / scale

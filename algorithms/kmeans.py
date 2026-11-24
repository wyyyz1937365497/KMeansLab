"""标准 K-Means（Lloyd 迭代），纯 NumPy 实现。

两步循环：分配（每个样本归最近中心）→ 更新（中心挪到簇均值）。
目标函数 SSE = Σ ‖x − μ_c(x)‖²，每轮不增，所以一定会收敛。
"""

import numpy as np

from core.history import Frame, Result
from core.metrics import calculate_sse
from core.preprocessing import feature_matrix

from .initialization import initialize_centers


def _validate(values, n_clusters, max_iter, tol):
    """校验参数并返回二维特征矩阵：K 在 1..n，max_iter ≥ 1，tol ≥ 0。"""
    x = feature_matrix(values)
    if isinstance(n_clusters, (bool, np.bool_)) or not isinstance(n_clusters, (int, np.integer)) or not 1 <= n_clusters <= len(x):
        raise ValueError(f"簇数 K 必须为 1 至 {len(x)} 之间的整数。")
    if isinstance(max_iter, (bool, np.bool_)) or not isinstance(max_iter, (int, np.integer)) or max_iter < 1:
        raise ValueError("max_iter 必须为正整数。")
    if not np.isfinite(tol) or tol < 0:
        raise ValueError("tol 必须为有限的非负数。")
    return x


def _nearest(x, centers):
    """「分配」一步：算每个样本到每个中心的平方距离，取最近的中心。

    返回 (簇标签, 每个样本到自己中心的最小平方距离)；平局取下标更小的中心。
    """
    delta = x[:, None, :] - centers
    distances = np.einsum("nkd,nkd->nk", delta, delta)
    labels = np.argmin(distances, axis=1)
    return labels, distances[np.arange(len(x)), labels]


def assign_clusters(x, centers):
    """按最近中心分配；距离相同时取下标更小的中心。"""
    return _nearest(x, centers)[0]


def _nonempty_labels(x, centers):
    """分配并修复空簇：某个中心没有分到样本时，从「还有余量的簇」里拿走离自己中心最远的点。

    没有空簇时结果与 assign_clusters 完全一致。
    """
    labels, distances = _nearest(x, centers)
    counts = np.bincount(labels, minlength=len(centers))
    for empty in np.flatnonzero(counts == 0):
        # 只在样本数 > 1 的簇里挑：取离自己中心最远的点；平局取下标最小者。
        sample = np.argmax(np.where(counts[labels] > 1, distances, -np.inf))
        counts[labels[sample]] -= 1
        labels[sample] = empty
        counts[empty] = 1
    return labels


def update_centers(x, labels, n_clusters):
    """「更新」一步：每个中心挪到所属样本的均值。调用前必须没有空簇。"""
    counts = np.bincount(labels, minlength=n_clusters)
    if np.any(counts == 0):
        raise ValueError("更新质心前必须修复空簇。")
    centers = np.zeros((n_clusters, x.shape[1]))
    np.add.at(centers, labels, x)
    centers /= counts[:, None]
    return centers


def _fit(x, n_clusters, max_iter, tol, random_state, init_method, record):
    """标准 K-Means 主循环（Lloyd 迭代）。

    1. 初始化：随机（或 K-Means++）选出 K 个中心；
    2. 分配：每个样本归到最近的中心，得到 K 个簇；
    3. 更新：中心挪到簇均值；
    4. 重复 2-3，直到中心位移 ≤ tol、分配不再变化，或达到 max_iter。

    record=True 时每一轮都存一帧（标签、中心、SSE），供界面逐帧回放。
    """
    centers = initialize_centers(x, n_clusters, np.random.default_rng(random_state), init_method)
    ids = tuple(range(n_clusters))
    labels = _nonempty_labels(x, centers)
    frames = []

    def frame(event, steps, details):
        frames.append(Frame(event, labels.copy(), centers.copy(), ids,
                            calculate_sse(x, labels, centers), steps, details=details))

    if record:
        frame("initial", 0, {"init_method": init_method})
    for step in range(1, max_iter + 1):
        # 保存上一轮中心，用来判断这一轮挪动了多少
        previous = centers
        centers = update_centers(x, labels, n_clusters)
        shift = float(np.linalg.norm(centers - previous, axis=1).max())
        # 最大位移：所有中心里挪得最远的那个
        if record:
            frame("iteration", step, {"center_shift": shift})
        # 收敛条件 1：中心基本不动了
        if shift <= tol:
            reason = "tolerance"
            break
        # 收敛条件 2：按新中心重新分配，结果和上一轮一样
        next_labels = _nonempty_labels(x, centers)
        if np.array_equal(next_labels, labels):
            reason = "stable_assignment"
            break
        # 没收敛就带着新标签进入下一轮
        if step < max_iter:
            labels = next_labels
    # 循环正常跑完（没有 break）说明是达到 max_iter 才停的
    else:
        reason = "max_iter"
    # 最后一帧：标注停止原因（tolerance / stable_assignment / max_iter）
    if record:
        frame("converged" if reason != "max_iter" else "stopped", step, {"reason": reason})
    return Result(labels, centers, ids, calculate_sse(x, labels, centers), step, 0, tuple(frames))


def fit(values, n_clusters, *, max_iter=100, tol=1e-6, random_state=42, init_method="random"):
    """只返回最终结果（标签、中心、SSE、迭代数），不记录帧。"""
    x = _validate(values, n_clusters, max_iter, tol)
    return _fit(x, n_clusters, max_iter, tol, random_state, init_method, False)


def fit_steps(values, n_clusters, *, max_iter=100, tol=1e-6, random_state=42, init_method="random"):
    """与 fit 相同，但额外返回逐帧记录，供界面回放。"""
    x = _validate(values, n_clusters, max_iter, tol)
    return _fit(x, n_clusters, max_iter, tol, random_state, init_method, True)

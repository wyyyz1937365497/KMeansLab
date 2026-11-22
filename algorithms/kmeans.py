import numpy as np

from core.history import Frame, Result
from core.metrics import calculate_sse
from core.preprocessing import feature_matrix

from .initialization import initialize_centers


def _validate(values, n_clusters, max_iter, tol):
    x = feature_matrix(values)
    if isinstance(n_clusters, (bool, np.bool_)) or not isinstance(n_clusters, (int, np.integer)) or not 1 <= n_clusters <= len(x):
        raise ValueError(f"簇数 K 必须为 1 至 {len(x)} 之间的整数。")
    if isinstance(max_iter, (bool, np.bool_)) or not isinstance(max_iter, (int, np.integer)) or max_iter < 1:
        raise ValueError("max_iter 必须为正整数。")
    if not np.isfinite(tol) or tol < 0:
        raise ValueError("tol 必须为有限的非负数。")
    return x


def _nearest(x, centers):
    delta = x[:, None, :] - centers
    distances = np.einsum("nkd,nkd->nk", delta, delta)
    labels = np.argmin(distances, axis=1)
    return labels, distances[np.arange(len(x)), labels]


def assign_clusters(x, centers):
    """Nearest center, breaking distance ties by smallest center index."""
    return _nearest(x, centers)[0]


def _nonempty_labels(x, centers):
    labels, distances = _nearest(x, centers)
    counts = np.bincount(labels, minlength=len(centers))
    for empty in np.flatnonzero(counts == 0):
        # Largest donor residual; argmax takes the earliest sample in a tie.
        sample = np.argmax(np.where(counts[labels] > 1, distances, -np.inf))
        counts[labels[sample]] -= 1
        labels[sample] = empty
        counts[empty] = 1
    return labels


def update_centers(x, labels, n_clusters):
    counts = np.bincount(labels, minlength=n_clusters)
    if np.any(counts == 0):
        raise ValueError("更新质心前必须修复空簇。")
    centers = np.zeros((n_clusters, x.shape[1]))
    np.add.at(centers, labels, x)
    centers /= counts[:, None]
    return centers


def _fit(x, n_clusters, max_iter, tol, random_state, init_method, record):
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
        previous = centers
        centers = update_centers(x, labels, n_clusters)
        shift = float(np.linalg.norm(centers - previous, axis=1).max())
        if record:
            frame("iteration", step, {"center_shift": shift})
        if shift <= tol:
            reason = "tolerance"
            break
        next_labels = _nonempty_labels(x, centers)
        if np.array_equal(next_labels, labels):
            reason = "stable_assignment"
            break
        if step < max_iter:
            labels = next_labels
    else:
        reason = "max_iter"
    if record:
        frame("converged" if reason != "max_iter" else "stopped", step, {"reason": reason})
    return Result(labels, centers, ids, calculate_sse(x, labels, centers), step, 0, tuple(frames))


def fit(values, n_clusters, *, max_iter=100, tol=1e-6, random_state=42, init_method="random"):
    x = _validate(values, n_clusters, max_iter, tol)
    return _fit(x, n_clusters, max_iter, tol, random_state, init_method, False)


def fit_steps(values, n_clusters, *, max_iter=100, tol=1e-6, random_state=42, init_method="random"):
    x = _validate(values, n_clusters, max_iter, tol)
    return _fit(x, n_clusters, max_iter, tol, random_state, init_method, True)

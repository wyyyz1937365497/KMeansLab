"""改进二分 K-Means：只是 bisecting 的一组默认参数。

默认 init_method="kmeans++"、restarts=5、strategy="max_gain"，即 B2：
- K-Means++ 初始化（改进 A）
- 每个候选簇重启 5 次择优（改进 B）
- 按全局 SSE 降幅选分裂簇（改进 C）

把 strategy 改成 "max_sse" 就是 B1（保留 A、B，关掉 C）。
"""

from . import bisecting


def fit(values, n_clusters, *, max_iter=100, tol=1e-6, random_state=42,
        init_method="kmeans++", restarts=5, strategy="max_gain"):
    """B2：kmeans++ + 5 次重启 + 最大 SSE 降幅选簇。"""
    return bisecting.fit(values, n_clusters, max_iter=max_iter, tol=tol, random_state=random_state,
                         init_method=init_method, restarts=restarts, strategy=strategy)


def fit_steps(values, n_clusters, *, max_iter=100, tol=1e-6, random_state=42,
              init_method="kmeans++", restarts=5, strategy="max_gain"):
    """同 fit，但返回逐帧记录。"""
    return bisecting.fit_steps(values, n_clusters, max_iter=max_iter, tol=tol, random_state=random_state,
                               init_method=init_method, restarts=restarts, strategy=strategy)

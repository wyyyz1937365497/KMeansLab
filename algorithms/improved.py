from . import bisecting


def fit(values, n_clusters, *, max_iter=100, tol=1e-6, random_state=42,
        init_method="kmeans++", restarts=5, strategy="max_gain"):
    return bisecting.fit(values, n_clusters, max_iter=max_iter, tol=tol, random_state=random_state,
                         init_method=init_method, restarts=restarts, strategy=strategy)


def fit_steps(values, n_clusters, *, max_iter=100, tol=1e-6, random_state=42,
              init_method="kmeans++", restarts=5, strategy="max_gain"):
    return bisecting.fit_steps(values, n_clusters, max_iter=max_iter, tol=tol, random_state=random_state,
                               init_method=init_method, restarts=restarts, strategy=strategy)

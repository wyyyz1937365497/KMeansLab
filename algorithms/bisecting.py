from dataclasses import dataclass

import numpy as np

from core.history import Frame, Result

from . import kmeans


@dataclass(frozen=True)
class _Cluster:
    members: np.ndarray
    center: np.ndarray
    sse: float


@dataclass(frozen=True)
class _Candidate:
    parent_id: int
    seed: int
    result: Result
    gain: float
    trials: list[float]

    def stats(self):
        return {
            "cluster_id": self.parent_id,
            "best_seed": self.seed,
            "trial_sse": self.trials,
            "mean_sse": float(np.mean(self.trials)),
            "std_sse": float(np.std(self.trials)),
            "best_sse": self.result.sse,
            "sse_gain": self.gain,
        }


def _cluster(x, members):
    points = x[members]
    center = points.mean(axis=0)
    delta = points - center
    return _Cluster(members, center, float(np.einsum("ij,ij->", delta, delta)))


def _candidate(x, parent, parent_id, seeds, max_iter, tol, init_method):
    trials = []
    winner = None
    for index, seed in enumerate(seeds):
        result = kmeans._fit(x, 2, max_iter, tol, int(seed), init_method, False)
        trials.append(result.sse)
        if not index or result.sse < winner.sse:
            best_seed, winner = int(seed), result
    return _Candidate(parent_id, best_seed, winner, parent.sse - winner.sse, trials)


def _fit(values, n_clusters, max_iter, tol, random_state, init_method, restarts, strategy, record):
    x = kmeans._validate(values, n_clusters, max_iter, tol)
    if isinstance(restarts, (bool, np.bool_)) or not isinstance(restarts, (int, np.integer)) or restarts < 1:
        raise ValueError("重启次数必须为正整数。")
    if strategy not in ("max_sse", "max_gain"):
        raise ValueError("分裂策略必须为 max_sse 或 max_gain。")
    if init_method not in ("random", "kmeans++"):
        raise ValueError("初始化方式必须为 random 或 kmeans++。")
    entropy = np.random.SeedSequence(random_state).entropy
    labels = np.zeros(len(x), dtype=np.intp)
    active = {0: _cluster(x, np.arange(len(x)))}
    tree_sizes = {0: len(x)}
    edges = {}
    frames = []
    iterations = evaluations = 0

    def tree(ident, sizes, draft=None):
        node = {"id": ident, "size": sizes.get(ident, tree_sizes.get(ident))}
        children = draft[1] if draft and ident == draft[0] else edges.get(ident)
        if children:
            node["children"] = [tree(i, sizes, draft) for i in children]
        return node

    def capture(event, current, assigned=labels, *, iteration=0, parent=None,
                before=None, after=None, details=None, draft=None):
        ids = tuple(sorted(current))
        frames.append(Frame(event, assigned.copy(), np.stack([current[i].center for i in ids]), ids,
                            sum(c.sse for c in current.values()), iteration, parent, before, after,
                            tree(0, {i: len(c.members) for i, c in current.items()}, draft), details or {}))

    if record:
        capture("initial", active)
    for round_idx in range(n_clusters - 1):
        eligible = [ident for ident, cluster in active.items() if len(cluster.members) > 1]
        if strategy == "max_sse":
            eligible = [max(eligible, key=lambda ident: (active[ident].sse, -ident))]
        candidates = []
        for ident in eligible:
            seeds = np.random.SeedSequence(entropy, spawn_key=(round_idx, ident)).generate_state(restarts)
            parent = active[ident]
            candidates.append(_candidate(x[parent.members], parent, ident, seeds, max_iter, tol, init_method))
        selected = max(candidates, key=lambda c: (c.gain, -c.parent_id))
        evaluations += len(candidates)
        ident = selected.parent_id
        parent = active[ident]
        local = x[parent.members]
        result = selected.result
        kids = (2 * round_idx + 1, 2 * round_idx + 2)
        child_ids = np.array(kids, dtype=np.intp)
        iterations += result.iterations
        before, after = parent.sse, result.sse
        if record:
            details = {**selected.stats(), "strategy": strategy,
                       "candidate_evaluations": len(candidates), "restart_attempts": len(candidates) * restarts,
                       "candidates": [candidate.stats() for candidate in candidates]}
            capture("split_selected", active, parent=ident, before=before, details=details)
        del active[ident]
        if record:
            replay = kmeans._fit(local, 2, max_iter, tol, selected.seed, init_method, True)
            temporary_labels = labels.copy()
            temporary = active.copy()
            for frame in replay.frames:
                if frame.event not in ("initial", "iteration"):
                    continue
                temporary_labels[parent.members] = child_ids[frame.labels]
                for i, kid in enumerate(kids):
                    mask = frame.labels == i
                    points = local[mask] - frame.centers[i]
                    temporary[kid] = _Cluster(parent.members[mask], frame.centers[i],
                                              float(np.einsum("ij,ij->", points, points)))
                capture("split_initial" if frame.event == "initial" else "iteration", temporary,
                        temporary_labels, iteration=frame.iteration, parent=ident, before=before,
                        after=sum(temporary[k].sse for k in kids), details=frame.details, draft=(ident, kids))
        labels[parent.members] = child_ids[result.labels]
        for i, kid in enumerate(kids):
            cluster = _cluster(x, parent.members[result.labels == i])
            active[kid] = cluster
            tree_sizes[kid] = len(cluster.members)
        edges[ident] = kids
        if record:
            capture("split_complete", active, iteration=result.iterations, parent=ident,
                    before=before, after=after, details=details)

    if record:
        capture("converged", active, details={"reason": "target_k", "candidate_evaluations": evaluations})
    ids = tuple(sorted(active))
    return Result(labels, np.stack([active[i].center for i in ids]), ids, sum(c.sse for c in active.values()),
                  iterations, evaluations, tuple(frames))


def fit(values, n_clusters, *, max_iter=100, tol=1e-6, random_state=42,
        init_method="random", restarts=1, strategy="max_sse"):
    return _fit(values, n_clusters, max_iter, tol, random_state, init_method, restarts, strategy, False)


def fit_steps(values, n_clusters, *, max_iter=100, tol=1e-6, random_state=42,
              init_method="random", restarts=1, strategy="max_sse"):
    return _fit(values, n_clusters, max_iter, tol, random_state, init_method, restarts, strategy, True)

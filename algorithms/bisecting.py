"""二分 K-Means（B0 / B0++ / B1 / B2 共用一套实现）。

全部样本先构成根簇；每一轮挑一个可分裂的叶簇，对它跑 K=2 的 K-Means，
把父簇替换成两个子簇，直到叶簇数达到 K。

用参数区分四个版本：
- init_method：random（B0）或 kmeans++（B0++ / B1 / B2）
- restarts：每个候选簇内部重启几次，取 SSE 最低的一次（B1 / B2 为 5）
- strategy：max_sse = 只分裂 SSE 最大的叶簇（B0 / B0++ / B1）
            max_gain = 每个候选都试劈一次，分裂让整体 SSE 降得最多的（B2）
"""

from dataclasses import dataclass

import numpy as np

from core.history import Frame, Result

from . import kmeans


# 一个簇：成员下标、中心（均值）、簇内 SSE
@dataclass(frozen=True)
class _Cluster:
    members: np.ndarray
    center: np.ndarray
    sse: float


# 一次「候选分裂」的完整记录：对哪个父簇、用哪个种子、结果如何
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
    """由成员下标建一个簇：中心取均值，SSE = Σ ‖x − center‖²。"""
    points = x[members]
    center = points.mean(axis=0)
    delta = points - center
    return _Cluster(members, center, float(np.einsum("ij,ij->", delta, delta)))


def _candidate(x, parent, parent_id, seeds, max_iter, tol, init_method):
    """对一个父簇做 restarts 次 K=2 的 K-Means，取 SSE 最低的一次。

    gain = 父簇 SSE − 最优子簇的 SSE，即这次分裂让整体 SSE 降了多少。
    """
    trials = []
    winner = None
    # 多次重启择优：每次换一个种子，保留 SSE 最低的结果
    for index, seed in enumerate(seeds):
        result = kmeans._fit(x, 2, max_iter, tol, int(seed), init_method, False)
        trials.append(result.sse)
        # 第一次直接当最优；之后只有 SSE 更低才替换
        if not index or result.sse < winner.sse:
            best_seed, winner = int(seed), result
    return _Candidate(parent_id, best_seed, winner, parent.sse - winner.sse, trials)


def _fit(values, n_clusters, max_iter, tol, random_state, init_method, restarts, strategy, record):
    """二分 K-Means 主循环。

    每一轮（round_idx）做四件事：
    1. eligible：挑出还可以劈的叶簇（成员数 > 1）；
       strategy=max_sse 时只保留 SSE 最大的那一个，max_gain 时全部保留做候选；
    2. 对每个候选簇跑 restarts 次 K=2 的 K-Means，取 SSE 最低的一次，算出增益 gain；
    3. 选 gain 最大的候选，把父簇替换成两个子簇（编号 2r+1、2r+2）；
    4. 记录帧：split_selected → split_initial / iteration（回放内部迭代）→ split_complete。
    """
    x = kmeans._validate(values, n_clusters, max_iter, tol)
    if isinstance(restarts, (bool, np.bool_)) or not isinstance(restarts, (int, np.integer)) or restarts < 1:
        raise ValueError("重启次数必须为正整数。")
    if strategy not in ("max_sse", "max_gain"):
        raise ValueError("分裂策略必须为 max_sse 或 max_gain。")
    if init_method not in ("random", "kmeans++"):
        raise ValueError("初始化方式必须为 random 或 kmeans++。")
    # 所有随机性都由 random_state 派生：同一轮、同一簇的种子固定，结果可复现
    entropy = np.random.SeedSequence(random_state).entropy
    labels = np.zeros(len(x), dtype=np.intp)
    # 初始只有一个簇（编号 0），包含全部样本
    active = {0: _cluster(x, np.arange(len(x)))}
    # 分裂树：每个节点的样本数、父子边
    tree_sizes = {0: len(x)}
    edges = {}
    frames = []
    iterations = evaluations = 0

    # 把当前簇结构导出成界面用的树快照；draft 用于在「子簇刚建出来」时临时挂上两个新节点
    def tree(ident, sizes, draft=None):
        node = {"id": ident, "size": sizes.get(ident, tree_sizes.get(ident))}
        children = draft[1] if draft and ident == draft[0] else edges.get(ident)
        if children:
            node["children"] = [tree(i, sizes, draft) for i in children]
        return node

    # 存一帧：全样本标签、各簇中心、全局 SSE（各簇 SSE 之和）以及树快照
    def capture(event, current, assigned=labels, *, iteration=0, parent=None,
                before=None, after=None, details=None, draft=None):
        ids = tuple(sorted(current))
        frames.append(Frame(event, assigned.copy(), np.stack([current[i].center for i in ids]), ids,
                            sum(c.sse for c in current.values()), iteration, parent, before, after,
                            tree(0, {i: len(c.members) for i, c in current.items()}, draft), details or {}))

    if record:
        capture("initial", active)
    # 每轮让叶簇数 +1，所以只需要 K-1 轮
    for round_idx in range(n_clusters - 1):
        # 可分裂的叶簇：至少要有 2 个样本才分得开
        eligible = [ident for ident, cluster in active.items() if len(cluster.members) > 1]
        # 策略一（B0 / B1）：只考虑 SSE 最大的叶簇；平局取编号小的
        if strategy == "max_sse":
            eligible = [max(eligible, key=lambda ident: (active[ident].sse, -ident))]
        # 策略二（B2）：所有候选都试劈，之后按 gain 选
        candidates = []
        for ident in eligible:
            # 每个候选簇的 restarts 个种子由 (轮次, 簇编号) 确定
            seeds = np.random.SeedSequence(entropy, spawn_key=(round_idx, ident)).generate_state(restarts)
            parent = active[ident]
            candidates.append(_candidate(x[parent.members], parent, ident, seeds, max_iter, tol, init_method))
        # 选增益最大的候选；平局取父簇编号小的
        selected = max(candidates, key=lambda c: (c.gain, -c.parent_id))
        # 记录这一轮一共评估了几个候选（B2 比 B1 多的地方就在这里）
        evaluations += len(candidates)
        ident = selected.parent_id
        parent = active[ident]
        local = x[parent.members]
        result = selected.result
        # 两个子簇的编号：第 r 轮得到 2r+1、2r+2；父簇编号保留在树里
        kids = (2 * round_idx + 1, 2 * round_idx + 2)
        child_ids = np.array(kids, dtype=np.intp)
        iterations += result.iterations
        before, after = parent.sse, result.sse
        # 「选中分裂」帧：把每个候选的试算结果也带上
        if record:
            details = {**selected.stats(), "strategy": strategy,
                       "candidate_evaluations": len(candidates), "restart_attempts": len(candidates) * restarts,
                       "candidates": [candidate.stats() for candidate in candidates]}
            capture("split_selected", active, parent=ident, before=before, details=details)
        # 父簇退出活动集，接下来由两个子簇代替
        del active[ident]
        # 回放内部迭代：用选中的种子重跑一次 K=2 的 K-Means，把它每一帧映射回全样本标签
        if record:
            replay = kmeans._fit(local, 2, max_iter, tol, selected.seed, init_method, True)
            temporary_labels = labels.copy()
            temporary = active.copy()
            for frame in replay.frames:
                if frame.event not in ("initial", "iteration"):
                # 只重放 initial / iteration 帧；收敛帧由 split_complete 代替
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
        # 用最优结果更新全样本标签和活动簇
        labels[parent.members] = child_ids[result.labels]
        for i, kid in enumerate(kids):
            cluster = _cluster(x, parent.members[result.labels == i])
            active[kid] = cluster
            tree_sizes[kid] = len(cluster.members)
        # 分裂树长出两个子节点
        edges[ident] = kids
        # 「分裂完成」帧：记录分裂前后的 SSE
        if record:
            capture("split_complete", active, iteration=result.iterations, parent=ident,
                    before=before, after=after, details=details)

    # 最后一帧：达到目标 K
    if record:
        capture("converged", active, details={"reason": "target_k", "candidate_evaluations": evaluations})
    ids = tuple(sorted(active))
    return Result(labels, np.stack([active[i].center for i in ids]), ids, sum(c.sse for c in active.values()),
                  iterations, evaluations, tuple(frames))


def fit(values, n_clusters, *, max_iter=100, tol=1e-6, random_state=42,
        init_method="random", restarts=1, strategy="max_sse"):
    """只返回最终结果。"""
    return _fit(values, n_clusters, max_iter, tol, random_state, init_method, restarts, strategy, False)


def fit_steps(values, n_clusters, *, max_iter=100, tol=1e-6, random_state=42,
              init_method="random", restarts=1, strategy="max_sse"):
    """额外返回逐帧记录，供界面回放。"""
    return _fit(values, n_clusters, max_iter, tol, random_state, init_method, restarts, strategy, True)

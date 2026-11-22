"""基础 DBSCAN 与凝聚层次聚类的补充实验（生成展示图与指标）。

只实现基础算法，不接入主界面的回放时间轴：
- DBSCAN：在双月数据上看非凸簇，在 Seeds 上看参数敏感性；
- 层次聚类：average linkage，在 Seeds 上画树状图并按 K=3 切分；
- 对比图：同一组双月数据上 K-Means 与 DBSCAN 的差别。

运行（需要 matplotlib，可用 docs 环境）：
    /home/wyyyz/.local/share/uv-envs/docs/bin/python scripts/run_clustering_extras.py
"""
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from algorithms import dbscan, hierarchical, kmeans  # noqa: E402
from core.datasets import load_dataset  # noqa: E402
from core.metrics import adjusted_rand_index, silhouette_score  # noqa: E402
from core.pca import PCA  # noqa: E402
from core.preprocessing import standardize  # noqa: E402

OUT = ROOT / "docs" / "figures"
COLORS = ("#4C78A8", "#F58518", "#54A24B", "#B279A2", "#E45756", "#72B7B2")

plt.rcParams["font.sans-serif"] = ["Noto Sans CJK SC", "SimHei", "DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False


def two_moons(n=300, noise=0.05, seed=2026):
    rng = np.random.default_rng(seed)
    half = n // 2
    theta = np.linspace(0, np.pi, half)
    upper = np.column_stack([np.cos(theta), np.sin(theta)])
    lower = np.column_stack([1 - np.cos(theta), 0.5 - np.sin(theta)])
    values = np.vstack([upper, lower]) + rng.normal(0, noise, (2 * half, 2))
    return values, np.repeat([0, 1], half)


def scatter_clusters(ax, points, labels, title, centers=None):
    unique = [c for c in np.unique(labels) if c != -1]
    for index, cluster in enumerate(unique):
        mask = labels == cluster
        ax.scatter(points[mask, 0], points[mask, 1], s=18, color=COLORS[index % len(COLORS)],
                   alpha=0.85, linewidths=0, label=f"簇 {index}")
    noise = labels == -1
    if noise.any():
        ax.scatter(points[noise, 0], points[noise, 1], s=22, marker="x", color="#555",
                   linewidths=0.9, label=f"噪声 ({noise.sum()})")
    if centers is not None:
        ax.scatter(centers[:, 0], centers[:, 1], s=110, marker="*", color="#111",
                   edgecolors="white", linewidths=0.8, zorder=5, label="中心")
    ax.set_title(title, fontsize=11)
    ax.set_xticks([])
    ax.set_yticks([])
    ax.legend(fontsize=8, loc="best", frameon=False)


def draw_dendrogram(ax, hierarchy, max_leaves=90):
    z = hierarchy.linkage_matrix()
    height = {i: 0.0 for i in range(hierarchy.n)}
    xpos = {i: float(i) for i in range(hierarchy.n)}
    leaves = np.arange(hierarchy.n, dtype=float)
    for row, (left, right, distance, size) in enumerate(z):
        left, right = int(left), int(right)
        for child in (left, right):
            ax.plot([xpos[child], xpos[child]], [height[child], distance],
                    color="#8a8a8a", linewidth=0.7)
        ax.plot([xpos[left], xpos[right]], [distance, distance],
                color="#4C78A8", linewidth=0.9)
        node = hierarchy.n + row
        height[node] = float(distance)
        left_size = size / 2 if left >= hierarchy.n else 1
        right_size = size / 2 if right >= hierarchy.n else 1
        # 以样本数为权重确定父节点的横坐标
        lw = z[left - hierarchy.n, 3] if left >= hierarchy.n else 1
        rw = z[right - hierarchy.n, 3] if right >= hierarchy.n else 1
        xpos[node] = (xpos[left] * lw + xpos[right] * rw) / (lw + rw)
    ax.set_xlim(-0.5, hierarchy.n - 0.5)
    ax.set_ylim(0, z[:, 2].max() * 1.05)
    ax.set_title("Seeds 子集：average linkage 树状图", fontsize=11)
    ax.set_ylabel("合并距离")
    ax.set_xticks([])
    ax.spines[["top", "right"]].set_visible(False)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    summary = {}

    moons, truth = two_moons()
    density = dbscan.fit(moons, eps=0.25, min_samples=5)
    lloyd = kmeans.fit(moons, 2, random_state=0)
    summary["moons"] = {
        "kmeans": {
            "ari": round(adjusted_rand_index(truth, lloyd.labels), 4),
            "sse": round(lloyd.sse, 4),
        },
        "dbscan": {
            "clusters": density.n_clusters,
            "noise": density.n_noise,
            "ari": round(adjusted_rand_index(truth, density.labels), 4),
        },
    }

    fig, axes = plt.subplots(1, 2, figsize=(10, 4.3))
    scatter_clusters(axes[0], moons, lloyd.labels,
                     f"K-Means (K=2) · ARI {summary['moons']['kmeans']['ari']:.2f}",
                     centers=lloyd.centers)
    scatter_clusters(axes[1], moons, density.labels,
                     f"DBSCAN (eps=0.25, min_samples=5) · ARI {summary['moons']['dbscan']['ari']:.2f}")
    fig.suptitle("非凸数据：K-Means 假设球状簇，DBSCAN 按密度连通", fontsize=12)
    fig.tight_layout()
    fig.savefig(OUT / "kmeans-vs-dbscan.png", dpi=170)
    plt.close(fig)

    seeds = load_dataset("seeds", ROOT / "datasets")
    x = standardize(seeds.features)
    seeds_db = dbscan.fit(x, eps=0.8, min_samples=5)
    keep = seeds_db.labels != -1
    db_sil = silhouette_score(x[keep], seeds_db.labels[keep]) if len(set(seeds_db.labels[keep])) > 1 else None
    summary["seeds_dbscan"] = {
        "eps": 0.8,
        "min_samples": 5,
        "clusters": seeds_db.n_clusters,
        "noise": seeds_db.n_noise,
        "ari": round(adjusted_rand_index(seeds.labels, seeds_db.labels), 4),
        "silhouette": None if db_sil is None else round(db_sil, 4),
    }

    pca = PCA.fit(x)
    coords = pca.transform(x)
    fig, ax = plt.subplots(figsize=(5.4, 4.4))
    scatter_clusters(ax, coords, seeds_db.labels,
                     f"Seeds · DBSCAN eps=0.8 · {seeds_db.n_clusters} 簇 / {seeds_db.n_noise} 噪声",
                     )
    fig.tight_layout()
    fig.savefig(OUT / "dbscan.png", dpi=170)
    plt.close(fig)

    # 层次聚类：每类取前 30 个样本，画树更清楚
    idx = np.concatenate([np.flatnonzero(seeds.labels == c)[:30] for c in np.unique(seeds.labels)])
    sub_x, sub_labels = x[idx], seeds.labels[idx]
    tree = hierarchical.fit(sub_x, linkage="average")
    tree_labels = tree.cut(3)
    tree_sil = silhouette_score(sub_x, tree_labels) if len(set(tree_labels)) > 1 else None
    summary["seeds_hierarchical"] = {
        "linkage": "average",
        "n": int(len(idx)),
        "k": 3,
        "ari": round(adjusted_rand_index(sub_labels, tree_labels), 4),
        "silhouette": None if tree_sil is None else round(tree_sil, 4),
    }

    sub_pca = PCA.fit(sub_x)
    sub_coords = sub_pca.transform(sub_x)
    fig, axes = plt.subplots(1, 2, figsize=(11, 4.4), gridspec_kw={"width_ratios": [1.5, 1]})
    draw_dendrogram(axes[0], tree)
    scatter_clusters(axes[1], sub_coords, tree_labels, "按 K=3 切开后的簇")
    fig.tight_layout()
    fig.savefig(OUT / "hierarchical.png", dpi=170)
    plt.close(fig)

    payload = {"pca_explained": [round(float(v), 4) for v in pca.explained_variance_ratio],
               **summary}
    (ROOT / "docs" / "clustering_extras.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

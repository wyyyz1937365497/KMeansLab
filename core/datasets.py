import csv
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .preprocessing import feature_matrix


@dataclass(frozen=True)
class Dataset:
    name: str
    description: str
    source: str
    feature_names: tuple[str, ...]
    features: np.ndarray
    labels: np.ndarray | None


_METADATA = {
    "seeds": ("Seeds", "210 个小麦籽粒的 7 项形态特征，来自三个小麦品种。", "https://archive.ics.uci.edu/dataset/236/seeds"),
    "wine": ("Wine", "178 个葡萄酒样本的 13 项化学指标，来自三种葡萄品种。", "https://archive.ics.uci.edu/dataset/109/wine"),
    "synthetic": ("人造二维", "三团部分重叠的二维散点；用于观察中心移动及分裂。", "程序生成（固定种子 2026）"),
    "edge": ("重复点边界", "包含重复坐标和单独的离群点，用于观察平局、空簇修复和 K 接近 N。", "程序内置"),
}


def list_datasets():
    return tuple(_METADATA)


def _read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.reader(stream)
        header = next(reader, [])
        if len(header) < 2 or header[-1] != "label" or len(set(header)) != len(header):
            raise ValueError(f"数据文件 {path.name} 的列名非法。")
        features, labels = [], []
        for row in reader:
            if not row or not any(cell.strip() for cell in row):
                continue
            try:
                if len(row) != len(header):
                    raise ValueError("列数不符")
                features.append([float(value) for value in row[:-1]])
                labels.append(int(row[-1]))
            except ValueError as error:
                raise ValueError(f"数据文件 {path.name}:{reader.line_num} 含无效数值或列数。") from error
    return tuple(header[:-1]), feature_matrix(features), np.asarray(labels, dtype=np.intp)


def load_dataset(name, root: Path):
    if not isinstance(name, str) or name not in _METADATA:
        raise ValueError(f"未知数据集：{name}")
    if name in ("seeds", "wine"):
        names, features, labels = _read_csv(root / f"{name}.csv")
    elif name == "synthetic":
        rng = np.random.default_rng(2026)
        centers = np.array([[-2.0, -0.6], [0.4, 1.7], [2.2, -0.8]])
        features = (rng.normal(size=(3, 50, 2)) * 0.68 + centers[:, None, :]).reshape(-1, 2)
        names, labels = ("x", "y"), np.repeat(np.arange(3), 50)
    else:
        features = np.array([[0., 0.], [0., 0.], [0., 0.], [1., 1.], [1., 1.], [1., 1.], [5., -3.]])
        names, labels = ("x", "y"), None
    return Dataset(*_METADATA[name], names, features, labels)

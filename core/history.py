from dataclasses import dataclass, field

import numpy as np


@dataclass(frozen=True)
class Frame:
    event: str
    labels: np.ndarray
    centers: np.ndarray
    center_ids: tuple[int, ...]
    sse: float
    iteration: int = 0
    split_id: int | None = None
    split_before_sse: float | None = None
    split_after_sse: float | None = None
    tree: dict | None = None
    details: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Result:
    labels: np.ndarray
    centers: np.ndarray
    center_ids: tuple[int, ...]
    sse: float
    iterations: int
    candidate_evaluations: int
    frames: tuple[Frame, ...] = ()

import numpy as np
import pytest

from algorithms.bisecting import fit, fit_steps


def leaves(node):
    if not node.get("children"):
        return {node["id"]: node["size"]}
    return {ident: size for child in node["children"] for ident, size in leaves(child).items()}


@pytest.mark.parametrize("k", [1, 2, 8])
def test_split_frames_reconstruct_current_tree_and_active_clusters(k):
    x = np.array([[0., 0.], [0., 0.], [0., 0.], [1., 0.], [1., 0.], [1., 0.], [5., 4.], [5., 4.]])
    result = fit_steps(x, k)
    splits = [f for f in result.frames if f.event == "split_complete"]
    assert [len(f.center_ids) for f in splits] == list(range(2, k + 1))
    assert len(result.center_ids) == k
    assert [f.event for f in result.frames].count("split_initial") == k - 1
    for frame in result.frames:
        assert leaves(frame.tree) == {i: int(np.sum(frame.labels == i)) for i in frame.center_ids}
        centers = dict(zip(frame.center_ids, frame.centers))
        residual = x - np.array([centers[i] for i in frame.labels])
        assert frame.sse == pytest.approx(np.square(residual).sum())
    assert all(f.split_before_sse >= f.split_after_sse - 1e-10 for f in splits)
    np.testing.assert_array_equal(fit(x, k).labels, result.labels)
    if k == len(x):
        assert result.sse == 0

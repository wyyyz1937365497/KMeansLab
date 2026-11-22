import numpy as np
import pytest

from algorithms.kmeans import fit, fit_steps


@pytest.mark.parametrize("init_method", ["random", "kmeans++"])
@pytest.mark.parametrize("k", [1, 2, 6])
def test_repeated_points_never_drop_a_cluster(k, init_method):
    x = np.repeat([[2., -1.]], 6, axis=0)
    result = fit_steps(x, k, init_method=init_method)
    for frame in result.frames:
        assert set(frame.labels) == set(range(k))
        np.testing.assert_array_equal(frame.centers, np.repeat(x[:1], k, axis=0))
        assert frame.sse == 0
    assert result.frames[-1].event == "converged"


def test_seeded_lloyd_has_monotone_objective_and_consistent_final_centers():
    x = np.random.default_rng(7).normal(size=(60, 4))
    result = fit_steps(x, 5, random_state=12)
    fitted = fit(x, 5, random_state=12)
    assert np.all(np.diff([f.sse for f in result.frames]) <= 1e-10)
    np.testing.assert_array_equal(fitted.labels, result.labels)
    np.testing.assert_allclose(result.centers, [x[result.labels == i].mean(axis=0) for i in range(5)])
    assert result.sse == pytest.approx(np.square(x - result.centers[result.labels]).sum())


def test_iteration_cap_keeps_label_centroid_consistency():
    result = fit_steps(np.arange(10).reshape(-1, 1), 2, max_iter=1, random_state=6)
    assert result.iterations == 1
    assert result.frames[-1].labels.tolist() == result.labels.tolist()
    assert result.frames[-1].sse == pytest.approx(result.sse)


@pytest.mark.parametrize("k", [0, 3, 1.5, True])
def test_invalid_k(k):
    with pytest.raises(ValueError, match="K"):
        fit([[0], [1]], k)

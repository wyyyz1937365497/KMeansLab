import numpy as np
import pytest

from algorithms import dbscan


def test_two_dense_groups_and_noise():
    values = np.array([[0.0, 0.0], [0.1, 0.0], [0.0, 0.1],
                       [5.0, 5.0], [5.1, 5.0], [5.0, 5.1],
                       [9.0, 9.0]])
    result = dbscan.fit(values, eps=0.5, min_samples=3)
    assert result.n_clusters == 2
    assert result.n_noise == 1
    assert result.labels[0] == result.labels[1] == result.labels[2]
    assert result.labels[3] == result.labels[4] == result.labels[5]
    assert result.labels[0] != result.labels[3]
    assert result.labels[6] == -1
    assert result.core_mask.tolist() == [True, True, True, True, True, True, False]


def test_small_eps_marks_everything_noise():
    values = np.array([[0.0, 0.0], [1.0, 1.0], [2.0, 2.0]])
    result = dbscan.fit(values, eps=0.1, min_samples=2)
    assert result.n_clusters == 0
    assert result.n_noise == 3
    assert not result.core_mask.any()


def test_single_point_and_min_samples_one():
    result = dbscan.fit(np.array([[1.0, 2.0]]), eps=1.0, min_samples=1)
    assert result.labels.tolist() == [0]
    assert result.n_clusters == 1


@pytest.mark.parametrize("eps,min_samples", [(0, 3), (-1, 3), (np.nan, 3), (0.5, 0), (0.5, 1.5), (True, 3)])
def test_invalid_parameters(eps, min_samples):
    with pytest.raises(ValueError):
        dbscan.fit(np.zeros((3, 2)), eps=eps, min_samples=min_samples)

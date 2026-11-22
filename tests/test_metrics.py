import numpy as np
import pytest

from core.metrics import adjusted_rand_index, calculate_sse, silhouette_score
from core.pca import PCA
from core.preprocessing import standardize


def test_metrics_match_analytical_values_and_ignore_label_permutation():
    x = np.array([[0.], [1.], [10.], [11.]])
    labels = [0, 0, 1, 1]
    assert calculate_sse(x, labels, [[.5], [10.5]]) == 1
    assert silhouette_score(x, [4, 4, 9, 9]) == pytest.approx(1 - (1 / 10.5 + 1 / 9.5) / 2)
    assert adjusted_rand_index(labels, [7, 7, 5, 5]) == 1
    assert adjusted_rand_index(labels, [0, 1, 0, 1]) == -0.5
    assert silhouette_score(x, [0] * 4) is None
    assert silhouette_score(x, list(range(4))) is None
    assert silhouette_score(np.zeros((4, 1)), [0, 0, 0, 1]) == 0


def test_pca_padding_and_constant_columns():
    x = standardize([[1.], [2.], [3.]])
    model = PCA.fit(x)
    projected = model.transform(x)
    np.testing.assert_allclose(projected[:, 0], x[:, 0])
    np.testing.assert_array_equal(projected[:, 1], 0)
    np.testing.assert_array_equal(model.explained_variance_ratio, [1, 0])
    row = standardize([[0, .1]])
    model = PCA.fit(row)
    np.testing.assert_array_equal(model.transform(row), [[0, 0]])
    np.testing.assert_array_equal(model.explained_variance_ratio, [0, 0])

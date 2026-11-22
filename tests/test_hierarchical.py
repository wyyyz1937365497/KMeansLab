import numpy as np
import pytest

from algorithms import hierarchical


def sample():
    return np.array([[0.0, 0.0], [0.1, 0.0], [10.0, 10.0], [10.1, 10.0]])


def test_cut_two_groups():
    labels = hierarchical.fit(sample()).cut(2)
    assert labels[0] == labels[1]
    assert labels[2] == labels[3]
    assert labels[0] != labels[2]


def test_cut_extremes():
    result = hierarchical.fit(sample())
    assert len(set(result.cut(4))) == 4
    assert len(set(result.cut(1))) == 1


def test_linkage_matrix_shape_and_monotonic_heights():
    result = hierarchical.fit(sample())
    z = result.linkage_matrix()
    assert z.shape == (3, 4)
    assert z[-1, 3] == 4
    assert np.all(np.diff(z[:, 2]) >= -1e-12)
    # 前两个合并各是一对近邻，第三行合并两个内部节点。
    assert {z[0, 0], z[0, 1]} == {2, 3}
    assert {z[1, 0], z[1, 1]} == {0, 1}
    assert {z[2, 0], z[2, 1]} == {4, 5}


def test_single_complete_linkage_agree_on_clear_groups():
    for linkage in hierarchical.LINKAGES:
        labels = hierarchical.fit(sample(), linkage=linkage).cut(2)
        assert labels[0] == labels[1]
        assert labels[2] == labels[3]
        assert labels[0] != labels[2]


@pytest.mark.parametrize("n_clusters", [0, 5])
def test_cut_out_of_range(n_clusters):
    with pytest.raises(ValueError):
        hierarchical.fit(sample()).cut(n_clusters)


def test_invalid_inputs():
    with pytest.raises(ValueError):
        hierarchical.fit(np.zeros((1, 2)))
    with pytest.raises(ValueError):
        hierarchical.fit(sample(), linkage="ward")

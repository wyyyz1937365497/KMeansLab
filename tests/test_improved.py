import numpy as np
import pytest

from algorithms import improved


def test_each_chosen_split_uses_lowest_restart_sse_and_maximum_gain():
    x = np.random.default_rng(4).normal(size=(80, 3))
    b1 = improved.fit(x, 5, random_state=15, restarts=4, strategy="max_sse")
    b2 = improved.fit_steps(x, 5, random_state=15, restarts=4)
    assert b1.candidate_evaluations == 4
    assert b2.candidate_evaluations > b1.candidate_evaluations
    splits = [f for f in b2.frames if f.event == "split_complete"]
    assert sum(len(f.details["candidates"]) for f in splits) == b2.candidate_evaluations
    for f in splits:
        candidates = f.details["candidates"]
        expected = max(candidates, key=lambda c: (c["sse_gain"], -c["cluster_id"]))
        assert f.split_id == expected["cluster_id"]
        for c in candidates:
            assert len(c["trial_sse"]) == 4
            assert c["best_sse"] == min(c["trial_sse"])
            assert c["mean_sse"] == pytest.approx(np.mean(c["trial_sse"]))
            assert c["std_sse"] == pytest.approx(np.std(c["trial_sse"]))
        assert f.split_before_sse - f.split_after_sse == pytest.approx(expected["sse_gain"])
    np.testing.assert_array_equal(improved.fit(x, 5, random_state=15, restarts=4).labels, b2.labels)


def test_gain_ties_split_smallest_non_singleton_id():
    x = np.zeros((8, 2))
    result = improved.fit_steps(x, 4)
    for f in result.frames:
        if f.event == "split_complete":
            assert f.split_id == min(c["cluster_id"] for c in f.details["candidates"])

"""Reproduce the numeric evidence included in the experiment report."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services import compare_algorithms, run_clustering


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for dataset in ("seeds", "wine"):
        config = dict(dataset=dataset, k=3, seed=42, restarts=5, max_iter=100, tol=1e-6)
        records = {
            f"{dataset}_comparison": compare_algorithms(dict(config, repeats=20, k_min=1, k_max=8)),
            f"{dataset}_demo": run_clustering(dict(config, algorithm="bisecting")),
        }
        for name, record in records.items():
            (args.output / f"{name}.json").write_text(
                json.dumps(record, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8"
            )


if __name__ == "__main__":
    main()

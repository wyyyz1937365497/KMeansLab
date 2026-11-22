import base64
import json
from pathlib import Path

import webview

from . import services


class AppAPI:
    def list_datasets(self):
        return services.datasets()

    def get_dataset_info(self, name):
        return services.dataset_info(name)

    def run_clustering(self, config):
        return services.run_clustering(config)

    def compare_algorithms(self, config):
        return services.compare_algorithms(config)

    def save_result(self, result):
        return self._save("kmeanslab-result.json", "JSON (*.json)",
                          json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False).encode())

    def save_chart(self, data_url):
        prefix = "data:image/png;base64,"
        if not isinstance(data_url, str) or not data_url.startswith(prefix):
            raise ValueError("图表必须为 PNG。")
        payload = base64.b64decode(data_url[len(prefix):], validate=True)
        if not payload.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError("无效的 PNG 数据。")
        return self._save("kmeanslab-clusters.png", "PNG (*.png)", payload)

    def _save(self, name, file_type, payload):
        selected = webview.windows[0].create_file_dialog(
            webview.FileDialog.SAVE, save_filename=name, file_types=(file_type,)
        )
        if not selected:
            return {"saved": False, "path": None}
        path = Path(selected[0] if isinstance(selected, (tuple, list)) else selected)
        if not path.suffix:
            path = path.with_suffix(Path(name).suffix)
        path.write_bytes(payload)
        return {"saved": True, "path": str(path)}

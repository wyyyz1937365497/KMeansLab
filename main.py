import sys

import webview

from app.api import AppAPI
from app.resources import FRONTEND


def _has_webview2() -> bool:
    import winreg

    runtime = r"Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
    for hive, view in ((winreg.HKEY_CURRENT_USER, 0),
                       (winreg.HKEY_LOCAL_MACHINE, winreg.KEY_WOW64_32KEY)):
        try:
            with winreg.OpenKey(hive, rf"SOFTWARE\{runtime}", 0, winreg.KEY_READ | view) as key:
                version = winreg.QueryValueEx(key, "pv")[0]
                if int(version.split(".", 1)[0]) >= 86:
                    return True
        except (OSError, ValueError):
            continue
    return False


def main() -> None:
    gui = {"linux": "qt", "win32": "edgechromium"}.get(sys.platform)
    if gui is None:
        raise SystemExit("KMeansLab supports Linux (Qt) and Windows (WebView2).")
    if sys.platform == "win32" and not _has_webview2():
        from ctypes import windll

        windll.user32.MessageBoxW(
            None,
            "未找到 Microsoft Edge WebView2 Runtime。请使用随附的离线安装器"
            "（或从微软下载 Evergreen Standalone Installer）安装后重试。",
            "KMeansLab",
            0x10,
        )
        raise SystemExit(1)
    webview.create_window(
        "KMeansLab · 聚类实验室",
        str(FRONTEND),
        js_api=AppAPI(),
        width=1440,
        height=920,
        min_size=(860, 620),
    )
    webview.start(gui=gui)


if __name__ == "__main__":
    main()

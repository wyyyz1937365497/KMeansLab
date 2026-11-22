"""把 docs/experiment_report.md 渲染为 A4 PDF。

用法：
    uv run --locked --group linux python scripts/build_report.py
    uv run --locked --group linux python scripts/build_report.py 自定义.md 输出.pdf

依赖：Linux 下的 PyQt6 QtWebEngine（pywebview[qt] 已包含）与 `markdown` 命令
（Arch: pacman -S discount）。Windows 无 Qt，请在 Linux 上生成 PDF。
"""
from pathlib import Path
from shutil import which
from subprocess import check_output
import sys

from PyQt6.QtCore import QMarginsF, QUrl
from PyQt6.QtGui import QPageLayout, QPageSize
from PyQt6.QtWidgets import QApplication
from PyQt6.QtWebEngineCore import QWebEnginePage

ROOT = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'docs/experiment_report.md'
output = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT.parent / 'KMeansLab_Submission/04_Report/实验报告.pdf'
source, output = source.resolve(), output.resolve()

if not which('markdown'):
    raise SystemExit('缺少 markdown 命令：Arch 下执行 pacman -S discount')

STYLE = """body{font:10.5pt/1.65 'Noto Sans CJK SC',sans-serif;color:#1a1a1a;margin:0}
h1{font-size:26pt;color:#111;margin:10mm 0 4mm}h2{font-size:16pt;color:#111;border-bottom:1px solid #bbb;margin:6mm 0 3mm;break-after:avoid}
h3{font-size:12pt;color:#333;margin:4mm 0 2mm;break-after:avoid}p{margin:2.5mm 0}
code{font-family:monospace;background:#f2f2f2;overflow-wrap:anywhere}pre{padding:2mm;background:#f2f2f2;white-space:pre-wrap}
table{font-size:8.7pt;border-collapse:collapse;width:100%;margin:3mm 0}tr{break-inside:avoid}
th,td{padding:.7mm 1.5mm;border-bottom:1px solid #ddd}th{background:#f2f2f2;text-align:left}
img{display:block;max-width:100%;max-height:84mm;margin:1mm auto;break-inside:avoid}a{color:#333}li{margin:1mm 0}
.formula{font-family:'Cambria Math','Times New Roman',serif;font-size:11pt;background:#f7f7f7;border-left:2px solid #999;padding:2mm 3mm;margin:2mm 0}"""

app = QApplication(sys.argv[:1])
page = QWebEnginePage()
html = ('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>' + STYLE + '</style>'
        + check_output(['markdown', str(source)], text=True))
layout = QPageLayout(QPageSize(QPageSize.PageSizeId.A4), QPageLayout.Orientation.Portrait,
                     QMarginsF(13, 13, 13, 13))
page.pdfPrintingFinished.connect(lambda _, ok: app.exit(0 if ok else 1))
page.loadFinished.connect(lambda ok: page.printToPdf(str(output), layout) if ok else app.exit(1))
page.setHtml(html, QUrl.fromLocalFile(str(source.parent) + '/'))
print('写入', output)
sys.exit(app.exec())

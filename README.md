# KMeansLab · 聚类实验室

离线桌面应用。用同一份标准化数据演示标准 K-Means、二分 K-Means 和改进二分 K-Means；PCA 仅用于二维显示，真实类别仅用于 ARI 评估。

## 从源码运行

需要 `uv`。项目固定 Python 3.11，`pyproject.toml` 配置中国科大 PyPI 镜像，`uv.lock` 锁定 Linux / Windows 依赖。

```sh
# Linux / Arch：Qt WebEngine
uv sync --locked --group linux
uv run --locked --group linux python main.py
```

```powershell
# Windows：Edge WebView2 Runtime
uv sync --locked
uv run --locked python main.py
powershell -ExecutionPolicy Bypass -File scripts/build_windows.ps1
```

项目内置 ECharts 5.6.0（Apache-2.0）及数据，无需 CDN、npm 或 Web 服务。Windowed 打包默认生成 `dist/KMeansLab/KMeansLab.exe`；**必须保留整个 `KMeansLab/` 文件夹**。已有 WebView2 Runtime 的机器可直接双击，且无需 Python/uv；若缺少 Runtime，先用 [微软官方下载页](https://developer.microsoft.com/microsoft-edge/webview2/#download-section)的 Evergreen Standalone Installer（x64）离线安装。若交付目录附带 `install_webview2.cmd` 和安装程序，可直接使用该脚本。

## 操作

1. 选择 Seeds、Wine、人造二维数据或重复点边界样本。将算法设为 **二分 K-Means (B0)**，取 `K=3`、`seed=42`，点击运行。
2. 用时间轴拖动、单步进退、播放或跳到下次分裂。当前帧同时驱动散点、中心轨迹、SSE 和分裂树；点击簇查看样本数、簇内 SSE 和完整标准化特征中心。
3. 导出当前散点图 PNG，或导出含全部帧和指标的 JSON。
4. 对比实验默认以 20 个连续种子运行标准随机 / K-Means++、B0、单次 K-Means++ 二分、B1 和 B2，同时扫描 `K=1–8`。SSE 趋势用于观察 K，表格和逐次记录用于比较固定 K 下的质量、波动与代价。`—` 表示不适用。

## 验证与报告

```sh
uv run --locked pytest -v
uv run --locked python scripts/run_experiments.py ./experiment_results
```

批处理输出 Seeds/Wine 逐次对比结果、K 扫描及固定种子的演示帧。耗时受硬件和进程调度影响；跨平台对比应针对 SSE、ARI、轮廓系数等数值使用浮点容差。算法和数据层不依赖 GUI；`app/` 统一记录/投影/序列化，`frontend/` 只播放已记录状态。

## DBSCAN 与层次聚类

实验台的算法下拉里可直接选择，不需要改代码：

- **DBSCAN**：填写 `eps` 与 `min_samples`；散点中红色 × 为噪声，右侧指标显示簇数、噪声数、ARI 与轮廓系数；时间轴、分裂树、SSE 会自动切到对应的空态说明。
- **层次聚类**：选择 `linkage`（single/average/complete）与切树簇数 `k`；中栏显示树状图（黄色虚线为切 K），SSE 卡片换成“合并距离”曲线。

命令行仍可一次性导出展示用图：

```sh
# 需要 matplotlib；可直接用已装绘图库的 docs 环境
/home/wyyyz/.local/share/uv-envs/docs/bin/python scripts/run_clustering_extras.py
```

- `algorithms/dbscan.py`：核心点 / 边界点 / 噪声，eps 与 min_samples；
- `algorithms/hierarchical.py`：三种链接，输出 dendrogram 的 Z 矩阵，`cut(k)` 切树；
- 图：`docs/figures/kmeans-vs-dbscan.png`（双月数据上 K-Means 失败、DBSCAN 成功）、`docs/figures/dbscan.png`、`docs/figures/hierarchical.png`；
- 指标：`docs/clustering_extras.json`（ARI、轮廓系数、噪声数）。

展示材料：

- [演示稿（按算法顺序，含每个方法的代码位置）](docs/presentation_script.md)
- [一页速查卡](docs/算法速查卡.pdf)

- [数据来源与许可](datasets/SOURCES.md)
- [实验报告](docs/experiment_report.md)

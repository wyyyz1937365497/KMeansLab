# 数据来源

- [UCI Seeds](https://doi.org/10.24432/C5H30K)，Charytanowicz、Niewczas、Kulczycki、Kowalski、Lukasik（2010）。210 个小麦籽粒，7 个特征、3 个真实类别。由 `seeds_dataset.txt` 转为 CSV，保留原始数值和样本顺序。
- [UCI Wine](https://doi.org/10.24432/C5PC7J)，Aeberhard、Forina（1992）。178 个葡萄酒样本，13 个特征、3 个真实类别。由 `wine.data` 转为 CSV，将类别从首列移到末列，保留原始数值和样本顺序。

两份数据按 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 分发；修改仅为添加列名、整理分隔符及重排列。类别列 `label` 不参与聚类。

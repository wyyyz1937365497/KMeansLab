/* ============================================================
 * KMeansLab — 全局状态与事件总线（state.js）
 *  - State：数据集、配置、聚类结果、当前帧、选中簇、对比结果；
 *  - Bus：轻量发布订阅，串联时间轴 / 图表 / 面板；
 *  - buildColorMap：簇 ID → 颜色（按 center_ids 首次出现顺序稳定分配）；
 *  - buildTrajectories：从帧序列历史推导每个簇质心的 PCA 平面轨迹。
 * ============================================================ */
(function (global) {
  'use strict';

  var PALETTE = [
    '#f2f2f2', '#9e9e9e', '#d8b26a', '#8fbf7f', '#c98f8f', '#a9b8a0',
    '#cfc6b8', '#6f6f6f', '#e2d8c6', '#b9a07a', '#9fb7a8', '#d2c2a8',
    '#8a8a8a', '#c7c7c7', '#b08f8f', '#a8a8a8'
  ];
  var PALETTE_LIGHT = [
    '#1f1f1f', '#6f6f6f', '#8a6a2f', '#3d7a45', '#a33a3a', '#4f6b5f',
    '#7a6a52', '#3f3f3f', '#5c4a2e', '#2f5a6b', '#6b3f5a', '#4a4a2f',
    '#2f2f2f', '#8a8a8a', '#7a4a4a', '#555555'
  ];

  function palette() {
    return document.documentElement.dataset.theme === 'light' ? PALETTE_LIGHT : PALETTE;
  }

  var State = {
    datasets: [],        // list_datasets 结果
    datasetId: null,     // 当前选中的数据集 id
    datasetInfo: null,   // get_dataset_info 结果
    result: null,        // run_clustering 完整结果
    frameIndex: 0,       // 当前帧下标
    selectedCluster: null,
    compare: null,       // compare_algorithms 结果
    colorMap: {},        // 簇 id -> 颜色
    running: false,
    comparing: false
  };

  var listeners = {};
  var Bus = {
    on: function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    emit: function (ev, payload) {
      (listeners[ev] || []).slice().forEach(function (fn) {
        try { fn(payload); } catch (e) { console.error('[Bus:' + ev + ']', e); }
      });
    }
  };

  /** 按 center_ids（回退 cluster_ids）首次出现顺序为每个簇分配稳定颜色。 */
  function buildColorMap(result) {
    var map = {};
    var i = 0;
    var colors = palette();
    var frames = (result && result.frames) || [];
    frames.forEach(function (f) {
      ((f && f.center_ids) || []).forEach(function (id) {
        if (!(id in map)) map[id] = colors[i++ % colors.length];
      });
    });
    frames.forEach(function (f) {
      ((f && f.cluster_ids) || []).forEach(function (id) {
        if (!(id in map)) map[id] = colors[i++ % colors.length];
      });
    });
    return map;
  }

  /** 应用一次完整聚类结果，重置帧游标与选中簇。 */
  State.applyResult = function (result) {
    State.result = result || null;
    State.frameIndex = 0;
    State.selectedCluster = null;
    State.colorMap = result ? buildColorMap(result) : {};
  };

  /** 从帧序列历史推导各簇质心轨迹：{ [clusterId]: [[x,y], ...] }。 */
  function buildTrajectories(result, upto) {
    var paths = {};
    var frames = (result && result.frames) || [];
    if (upto !== undefined && upto !== null) frames = frames.slice(0, Math.max(0, upto));
    frames.forEach(function (f) {
      var ids = (f && f.center_ids) || [];
      var pts = (f && f.centers_2d) || [];
      ids.forEach(function (id, i) {
        var p = pts[i];
        if (!p || p.length < 2) return;
        var x = Number(p[0]), y = Number(p[1]);
        if (!isFinite(x) || !isFinite(y)) return;
        if (!paths[id]) paths[id] = [];
        var last = paths[id][paths[id].length - 1];
        if (last && Math.abs(last[0] - x) < 1e-9 && Math.abs(last[1] - y) < 1e-9) return;
        paths[id].push([x, y]);
      });
    });
    return paths;
  }

  global.State = State;
  global.Bus = Bus;
  global.PALETTE = PALETTE;
  global.buildColorMap = buildColorMap;
  global.buildTrajectories = buildTrajectories;
})(window);

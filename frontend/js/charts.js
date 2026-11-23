/* ============================================================
 * KMeansLab — 图表渲染模块（charts.js）
 * 全部基于本地 ECharts。渲染函数：
 *  - renderScatter      主视图 PCA 散点 + 质心 + 历史轨迹
 *  - renderTree         分裂树（与时间轴同步，支持点击跳转）
 *  - renderSse          SSE 曲线（当前帧高亮，分裂帧标记，可点击跳转）
 *  - renderCompareBar   对比：指标柱状图（平均 SSE / ARI / 耗时；SSE 含 ±1σ 误差棒）
 *  - renderSensitivity  对比：平均 SSE 随 k 变化折线
 * 另提供 initCharts / ensureCompareCharts / dataURL / resizeAll /
 * clearMain / loadECharts（本地脚本探测加载）。
 * ============================================================ */
(function (global) {
  'use strict';

  var C = {
    text: '#f2f2f2',
    textDim: '#a8a8a8',
    textFaint: '#757575',
    axis: '#333333',
    splitLine: '#242424',
    accent: '#f2f2f2',
    white: '#ffffff',
    tooltipBg: '#1f1f1f'
  };

  function cssVar(name, fallback) {
    var value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  /** 从 CSS 变量重读图表配色；切换明暗主题后由 main.js 调用。 */
  function refreshTheme() {
    C.text = cssVar('--text', '#f2f2f2');
    C.textDim = cssVar('--text-dim', '#a8a8a8');
    C.textFaint = cssVar('--text-faint', '#757575');
    C.axis = cssVar('--border', '#333333');
    C.splitLine = cssVar('--border-soft', '#242424');
    C.accent = C.text;
    C.white = C.text;
    C.tooltipBg = cssVar('--card-2', '#1f1f1f');
  }

  function isLight() {
    return document.documentElement.dataset.theme === 'light';
  }

  function linePalette() {
    return isLight()
      ? ['#1f1f1f', '#6f6f6f', '#8a6a2f', '#3d7a45', '#a33a3a', '#4f6b5f', '#7a6a52', '#3f3f3f']
      : ['#f2f2f2', '#9e9e9e', '#d8b26a', '#8fbf7f', '#c98f8f', '#a9b8a0', '#cfc6b8', '#6f6f6f'];
  }

  refreshTheme();

  var ech = null;
  var instances = {};
  var OVERLAYS = { scatter: 'hero-empty', tree: 'tree-empty', sse: 'sse-empty' };

  /* ---------------- 本地 ECharts 探测加载 ---------------- */

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(src); };
      s.onerror = function () { reject(new Error('加载失败：' + src)); };
      document.head.appendChild(s);
    });
  }

  /** 依次探测本地 echarts 脚本路径，成功即止。 */
  async function loadECharts() {
    if (global.echarts) return;
    var candidates = [
      'vendor/echarts.min.js',
      'vendor/echarts.js',
      'vendor/js/echarts.min.js',
      '../vendor/echarts.min.js',
      '../vendor/echarts.js'
    ];
    var errs = [];
    for (var i = 0; i < candidates.length; i++) {
      try {
        await loadScript(candidates[i]);
        if (global.echarts) return;
        errs.push(candidates[i] + '（无 window.echarts）');
      } catch (e) {
        errs.push(e.message);
      }
    }
    throw new Error('无法加载本地 ECharts，尝试过：' + errs.join('；'));
  }

  /* ---------------- 初始化 ---------------- */

  function makeChart(key, sel) {
    if (instances[key]) return instances[key];
    var dom = document.querySelector(sel);
    if (!dom) return null;
    if (!ech) {
      if (!global.echarts) return null;
      ech = global.echarts;
    }
    instances[key] = ech.init(dom, null, { renderer: 'canvas' });
    return instances[key];
  }

  /** 主视图三图（散点 / 分裂树 / SSE）在启动时初始化。 */
  function initCharts() {
    if (!global.echarts) throw new Error('window.echarts 不存在：请在 frontend/vendor/ 下放置本地 echarts.min.js');
    ech = global.echarts;
    makeChart('scatter', '#chart-scatter');
    makeChart('tree', '#chart-tree');
    makeChart('sse', '#chart-sse');
    return instances;
  }

  /** 对比区图表按需初始化（pane 展开后才有尺寸）。 */
  function ensureCompareCharts() {
    if (!global.echarts) return false;
    if (!ech) ech = global.echarts;
    makeChart('compbar', '#chart-compbar');
    makeChart('sens', '#chart-sens');
    return true;
  }

  /* ---------------- 通用小件 ---------------- */

  function setOverlay(name, show) {
    var id = OVERLAYS[name];
    var node = id && document.getElementById(id);
    if (node) node.classList.toggle('show', !!show);
  }

  function setOverlayText(name, text) {
    var id = OVERLAYS[name];
    var node = id && document.getElementById(id);
    if (!node) return;
    var p = node.querySelector('p');
    if (p && text) p.textContent = text;
  }

  function pct(v) {
    return (typeof v === 'number' && isFinite(v)) ? (v * 100).toFixed(1) + '%' : '';
  }

  function toNumId(id) {
    var n = Number(id);
    return isNaN(n) ? id : n;
  }

  /** 单调链凸包；点数不足或共线时返回 null。 */
  function convexHull(points) {
    if (points.length < 3) return null;
    var p = points.slice().sort(function (a, b) {
      return a[0] - b[0] || a[1] - b[1];
    });
    function cross(o, a, b) {
      return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    }
    var lower = [], upper = [], i;
    for (i = 0; i < p.length; i++) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p[i]) <= 0) lower.pop();
      lower.push(p[i]);
    }
    for (i = p.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p[i]) <= 0) upper.pop();
      upper.push(p[i]);
    }
    lower.pop();
    upper.pop();
    var hull = lower.concat(upper);
    return hull.length >= 3 ? hull : null;
  }

  function tooltipBase() {
    return {
      backgroundColor: C.tooltipBg,
      borderColor: C.axis,
      textStyle: { color: C.text, fontSize: 11 }
    };
  }

  function axisLabelStyle() { return { color: C.textDim, fontSize: 10 }; }

  function valueAxis(name) {
    return {
      type: 'value',
      scale: true,
      name: name,
      nameLocation: 'middle',
      nameGap: 22,
      nameTextStyle: { color: C.textFaint, fontSize: 10 },
      axisLabel: axisLabelStyle(),
      axisLine: { lineStyle: { color: C.axis } },
      splitLine: { lineStyle: { color: C.splitLine } }
    };
  }

  /* ---------------- 主视图：PCA 散点 + 质心 + 轨迹 ---------------- */

  function renderScatter(opts) {
    var inst = instances.scatter;
    if (!inst) return;
    var result = opts.result;
    var frame = opts.frame;
    if (!result || !frame || !result.points_2d || !result.points_2d.length) {
      inst.clear();
      setOverlay('scatter', true);
      return;
    }
    setOverlay('scatter', false);

    var colorMap = opts.colorMap || {};
    var selectedId = opts.selectedId;
    var points = result.points_2d;
    var ids = frame.cluster_ids || [];
    var series = [];
    var samples = [];

    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (!p || p.length < 2) continue;
      var cid = toNumId(ids[i]);
      var sel = selectedId !== null && selectedId !== undefined &&
        String(selectedId) === String(cid);
      var noise = cid === -1;
      samples.push({
        value: [Number(p[0]), Number(p[1])],
        cluster: cid,
        symbol: noise ? 'x' : undefined,
        itemStyle: {
          color: noise ? '#e45756' : (colorMap[cid] || C.textDim),
          opacity: noise ? 0.75 : (sel ? 1 : 0.82)
        },
        symbolSize: noise ? 7 : (sel ? 8.5 : undefined)
      });
    }
    if (samples.length) {
      series.push({
        name: '样本',
        type: 'scatter',
        data: samples,
        symbolSize: 6.5,
        emphasis: { scale: 1.4 },
        z: 5
      });
    }

    // 箭头最小位移：按数据跨度自适应，避免抖动产生密集箭头
    var minArrow = 0.05;
    var xs = [], ys = [];
    for (var q = 0; q < points.length; q++) {
      var pp = points[q];
      if (!pp || pp.length < 2) continue;
      xs.push(Number(pp[0]));
      ys.push(Number(pp[1]));
    }
    var span = 1;
    if (xs.length) {
      span = Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs),
        Math.max.apply(null, ys) - Math.min.apply(null, ys));
      minArrow = span * 0.03;
    }

    // 簇包络：虚线闭合轮廓；选中簇加粗并轻微填充
    var byCluster = {};
    for (var b = 0; b < samples.length; b++) {
      var smp = samples[b];
      (byCluster[smp.cluster] = byCluster[smp.cluster] || []).push(smp.value);
    }
    Object.keys(byCluster).forEach(function (key) {
      if (toNumId(key) === -1) return;
      var hull = convexHull(byCluster[key]);
      if (!hull) return;
      var cx = 0, cy = 0;
      hull.forEach(function (v) { cx += v[0]; cy += v[1]; });
      cx /= hull.length;
      cy /= hull.length;
      var pad = span * 0.02;
      var ring = hull.map(function (v) {
        var dx = v[0] - cx, dy = v[1] - cy;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        return [v[0] + dx / len * pad, v[1] + dy / len * pad];
      });
      ring.push(ring[0]);
      var cidEnv = toNumId(key);
      var selEnv = selectedId !== null && selectedId !== undefined &&
        String(selectedId) === String(cidEnv);
      var envColor = colorMap[cidEnv] || C.textDim;
      var envelope = {
        name: '包络 ' + cidEnv,
        type: 'line',
        data: ring,
        smooth: 0.4,
        symbol: 'none',
        silent: true,
        z: 1,
        lineStyle: {
          color: envColor,
          width: selEnv ? 1.8 : 1.1,
          opacity: selEnv ? 0.9 : 0.32,
          type: 'dashed'
        }
      };
      if (selEnv) envelope.areaStyle = { color: C.accent, opacity: 0.06 };
      series.push(envelope);
    });

    // 质心轨迹：只画到当前帧，每段中点放方向箭头
    if (opts.showTraj) {
      var upto = opts.index === undefined ? (result.frames || []).length : opts.index + 1;
      var activeIds = (frame.center_ids || []).map(String);
      var paths = global.buildTrajectories(result, upto);
      Object.keys(paths).forEach(function (k) {
        var cid = toNumId(k);
        if (activeIds.indexOf(String(cid)) < 0) return;
        var path = paths[k];
        if (path.length < 2) return;
        var color = colorMap[cid] || C.textDim;
        series.push({
          name: '轨迹 ' + cid,
          type: 'line',
          data: path,
          silent: true,
          z: 2,
          symbol: 'none',
          lineStyle: { color: color, width: 1.6, opacity: 0.7, type: 'solid' }
        });
        var arrows = [];
        var steps = [];
        for (var j = 1; j < path.length; j++) {
          var a = path[j - 1], b = path[j];
          var dx = b[0] - a[0], dy = b[1] - a[1];
          if (Math.sqrt(dx * dx + dy * dy) < minArrow) continue;
          steps.push([a, b, dx, dy]);
        }
        var stride = Math.max(1, Math.ceil(steps.length / 4));
        for (var k = 0; k < steps.length; k += stride) {
          var seg = steps[k];
          arrows.push({
            value: [(seg[0][0] + seg[1][0]) / 2, (seg[0][1] + seg[1][1]) / 2],
            symbolRotate: -Math.atan2(seg[3], seg[2]) * 180 / Math.PI
          });
        }
        if (arrows.length) {
          series.push({
            name: '方向 ' + cid,
            type: 'scatter',
            data: arrows,
            symbol: 'arrow',
            symbolSize: 9,
            silent: true,
            z: 3,
            itemStyle: { color: color, opacity: 0.9 }
          });
        }
      });
    }

    // 质心：白描边方块 + 外圈准星，与普通样本点明确区分
    var centersData = [];
    var cids = frame.center_ids || [];
    var cpts = frame.centers_2d || [];
    cids.forEach(function (cid, idx) {
      var p = cpts[idx];
      if (!p || p.length < 2) return;
      centersData.push({
        value: [Number(p[0]), Number(p[1])],
        id: cid,
        itemStyle: { color: colorMap[cid] || '#d0d0d0' }
      });
    });
    if (centersData.length) {
      series.push({
        name: '质心圈',
        type: 'scatter',
        data: centersData.map(function (d) { return [d.value[0], d.value[1]]; }),
        symbol: 'circle',
        symbolSize: 23,
        silent: true,
        z: 10,
        itemStyle: { color: 'transparent', borderColor: C.white, borderWidth: 1, opacity: 0.55 }
      });
      series.push({
        name: '质心',
        type: 'scatter',
        data: centersData,
        symbol: 'rect',
        symbolSize: 12,
        z: 12,
        itemStyle: { borderColor: C.white, borderWidth: 2 },
        emphasis: { scale: 1.25 }
      });
    }

    var evr = result.explained_variance_ratio || [];
    inst.setOption({
      backgroundColor: 'transparent',
      animation: false,
      grid: { left: 10, right: 20, top: 28, bottom: 23, containLabel: true },
      tooltip: Object.assign(tooltipBase(), {
        trigger: 'item',
        formatter: function (params) {
          var v = params.value;
          var pos = '(' + global.UI.fmtNum(v[0], 3) + ', ' + global.UI.fmtNum(v[1], 3) + ')';
          if (params.seriesName === '质心') return '质心 #' + (params.data.id !== undefined ? params.data.id : '?') + '<br/>PCA ' + pos;
          if (params.seriesName === '样本') {
            var label = params.data.cluster === -1 ? '噪声点' : '簇 #' + (params.data.cluster !== undefined ? params.data.cluster : '?');
            return label + '<br/>PCA ' + pos;
          }
          return params.seriesName || '';
        }
      }),
      xAxis: valueAxis('PC1 ' + pct(evr[0])),
      yAxis: Object.assign(valueAxis('PC2 ' + pct(evr[1])), { nameLocation: 'end', nameGap: 8 }),
      series: series
    }, { notMerge: true });
  }

  /** 散点点击：命中“簇 x”或“质心”序列时回调 clusterId。 */
  function bindScatterClick(handler) {
    var inst = instances.scatter;
    if (!inst) return;
    inst.off('click');
    inst.on('click', function (params) {
      var raw = null;
      if (params.seriesName === '质心' && params.data && params.data.id !== undefined) raw = params.data.id;
      else if (params.seriesName === '样本' && params.data && params.data.cluster !== undefined) raw = params.data.cluster;
      if (raw !== null) handler(toNumId(raw));
    });
  }

  /* ---------------- 分裂树 ---------------- */

  function treeConvert(node, colorMap, splitId) {
    var isSplit = splitId !== null && splitId !== undefined &&
      String(splitId) === String(node.id);
    var out = {
      name: '#' + node.id,
      id: node.id,
      size: node.size,
      value: node.size,
      itemStyle: {
        color: colorMap[node.id] || C.textDim,
        borderColor: isSplit ? C.white : C.splitLine,
        borderWidth: isSplit ? 2 : 1
      },
      label: { color: isSplit ? C.white : C.textDim, fontWeight: isSplit ? 'bold' : 'normal' },
      children: []
    };
    (node.children || []).forEach(function (ch) {
      out.children.push(treeConvert(ch, colorMap, splitId));
    });
    return out;
  }

  function renderTree(frame, colorMap) {
    var inst = instances.tree;
    if (!inst) return;
    var tree = frame && frame.tree;
    if (!tree || typeof tree !== 'object') {
      inst.clear();
      setOverlay('tree', true);
      return;
    }
    setOverlay('tree', false);
    var data = treeConvert(tree, colorMap || {}, frame.split_id);
    inst.setOption({
      backgroundColor: 'transparent',
      animationDuration: 260,
      tooltip: Object.assign(tooltipBase(), {
        formatter: function (params) {
          return '簇 #' + params.data.id +
            (params.data.size !== undefined && params.data.size !== null
              ? '<br/>样本数：' + params.data.size : '');
        }
      }),
      series: [{
        type: 'tree',
        data: [data],
        orient: 'LR',
        left: 14,
        right: 110,
        top: 10,
        bottom: 10,
        symbol: 'circle',
        symbolSize: 11,
        initialTreeDepth: -1,
        expandAndCollapse: false,
        lineStyle: { color: C.axis, width: 1.2 },
        label: {
          position: 'right',
          distance: 6,
          fontSize: 10,
          color: C.textDim,
          formatter: function (params) {
            var t = params.name;
            if (params.data.size !== undefined && params.data.size !== null) t += '  n=' + params.data.size;
            return t;
          }
        },
        leaves: { label: { position: 'right', distance: 6 } }
      }]
    }, { notMerge: true });
  }

  /** 树节点点击：回调节点簇 id。 */
  function bindTreeClick(handler) {
    var inst = instances.tree;
    if (!inst) return;
    inst.off('click');
    inst.on('click', function (params) {
      if (params.data && params.data.id !== undefined) handler(toNumId(params.data.id));
    });
  }

  /* ---------------- SSE 曲线 ---------------- */

  function renderSse(result, frameIndex) {
    var inst = instances.sse;
    if (!inst) return;
    var frames = (result && result.frames) || [];
    if (!frames.length) {
      inst.clear();
      setOverlay('sse', true);
      return;
    }
    setOverlay('sse', false);

    var steps = frames.map(function (f, i) { return String(i); });
    var ys = frames.map(function (f) {
      return (f && typeof f.sse === 'number') ? Number(f.sse.toFixed(4)) : null;
    });
    var cur = frames[frameIndex] || frames[frames.length - 1];
    var curVal = (cur && typeof cur.sse === 'number') ? cur.sse : null;

    var series = [{
      name: 'SSE',
      type: 'line',
      data: ys,
      smooth: 0.25,
      showSymbol: false,
      z: 3,
      lineStyle: { color: C.accent, width: 1.8 },
      areaStyle: { color: C.accent, opacity: 0.06 }
    }];

    // 分裂完成帧标记
    var splitPts = [];
    frames.forEach(function (f, i) {
      if (f && f.event === 'split_complete' && typeof f.sse === 'number') splitPts.push([i, f.sse]);
    });
    if (splitPts.length) {
      series.push({
        name: '分裂完成',
        type: 'scatter',
        data: splitPts,
        symbol: 'triangle',
        symbolSize: 7,
        itemStyle: { color: '#d8b26a' },
        z: 5
      });
    }
    // 当前帧高亮
    if (curVal !== null && frameIndex !== undefined) {
      series.push({
        name: '当前帧',
        type: 'scatter',
        data: [[frameIndex, curVal]],
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: { color: C.white, borderColor: C.accent, borderWidth: 2 },
        z: 6,
        silent: true
      });
    }

    inst.setOption({
      backgroundColor: 'transparent',
      grid: { left: 10, right: 16, top: 14, bottom: 6, containLabel: true },
      tooltip: Object.assign(tooltipBase(), {
        trigger: 'axis',
        formatter: function (params) {
          var p = params[0];
          var f = frames[p.dataIndex];
          if (!f) return '';
          return '第 ' + p.dataIndex + ' 步 · ' + global.UI.eventLabel(f.event) +
            '<br/>SSE：' + global.UI.fmtNum(f.sse);
        }
      }),
      xAxis: {
        type: 'category',
        data: steps,
        axisLabel: axisLabelStyle(),
        axisLine: { lineStyle: { color: C.axis } },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        name: 'SSE',
        nameTextStyle: { color: C.textFaint, fontSize: 10 },
        axisLabel: { color: C.textDim, fontSize: 10, formatter: function (v) { return global.UI.fmtNum(v, 1); } },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: C.splitLine } }
      },
      series: series
    }, { notMerge: true });
  }

  /** SSE 曲线点击：回调帧下标。 */
  function bindSseClick(handler) {
    var inst = instances.sse;
    if (!inst) return;
    inst.off('click');
    inst.on('click', function (params) {
      if (params.seriesName === 'SSE' && params.dataIndex !== undefined) handler(params.dataIndex);
    });
  }

  /* ---------------- 对比：指标柱状图（SSE / ARI / 耗时） ---------------- */

  function summaryTip(r) {
    return '<b>' + global.UI.algoLabel(r.algorithm) + '</b>' +
      '<br/>平均 SSE：' + global.UI.fmtNum(r.mean_sse) + ' ± ' + global.UI.fmtNum(r.std_sse) +
      '<br/>最优 SSE：' + global.UI.fmtNum(r.best_sse) +
      '<br/>平均 ARI：' + global.UI.fmtNum(r.mean_ari) +
      ' · 平均轮廓：' + global.UI.fmtNum(r.mean_silhouette) +
      '<br/>平均耗时：' + global.UI.fmtNum(r.mean_elapsed_ms, 1) + ' ms' +
      ' · 平均迭代：' + global.UI.fmtNum(r.mean_iterations, 1);
  }

  var BAR_METRICS = {
    mean_sse: { axis: '平均 SSE', lowerBetter: true, digits: 2, errBars: true },
    mean_ari: { axis: '平均 ARI', lowerBetter: false, digits: 3, errBars: false },
    mean_elapsed_ms: { axis: '平均耗时 (ms)', lowerBetter: true, digits: 1, errBars: false }
  };

  function renderCompareBar(summary, metricKey) {
    var inst = instances.compbar;
    if (!inst) return;
    var rows = (summary || []).slice();
    if (!rows.length) { inst.clear(); return; }

    var metric = BAR_METRICS[metricKey] || BAR_METRICS.mean_sse;
    var labels = rows.map(function (r) { return global.UI.algoLabel(r.algorithm); });

    // 最优方向：SSE / 耗时取最小，ARI 取最大
    var bestIdx = -1, best = null;
    rows.forEach(function (r, i) {
      var v = r[metricKey];
      if (typeof v !== 'number' || !isFinite(v)) return;
      if (best === null || (metric.lowerBetter ? v < best : v > best)) { best = v; bestIdx = i; }
    });

    var series = [{
      name: metric.axis,
      type: 'bar',
      barMaxWidth: 42,
      data: rows.map(function (r, i) {
        return {
          value: r[metricKey],
          itemStyle: {
            color: i === bestIdx ? '#8fbf7f' : C.accent,
            borderRadius: 0,
            opacity: 0.9
          }
        };
      }),
      label: {
        show: true,
        position: 'top',
        color: C.textDim,
        fontSize: 10,
        formatter: function (p) { return global.UI.fmtNum(p.value, metric.digits); }
      }
    }];

    // ±1 标准差误差棒（仅平均 SSE 柱）
    if (metric.errBars && rows.some(function (r) { return typeof r.std_sse === 'number' && r.std_sse > 0; })) {
      series.push({
        id: 'stdbar',
        name: 'std',
        type: 'custom',
        silent: true,
        z: 6,
        renderItem: function (params, api) {
          var i = api.value(0);
          var lo = api.coord([i, api.value(1)]);
          var hi = api.coord([i, api.value(2)]);
          return {
            type: 'group',
            children: [
              { type: 'line', shape: { x1: lo[0], y1: lo[1], x2: hi[0], y2: hi[1] }, style: { stroke: '#8a8a8a', lineWidth: 1.4 } },
              { type: 'line', shape: { x1: lo[0] - 4, y1: lo[1], x2: lo[0] + 4, y2: lo[1] }, style: { stroke: '#8a8a8a', lineWidth: 1.4 } },
              { type: 'line', shape: { x1: hi[0] - 4, y1: hi[1], x2: hi[0] + 4, y2: hi[1] }, style: { stroke: '#8a8a8a', lineWidth: 1.4 } }
            ]
          };
        },
        data: rows.map(function (r, i) {
          var m = (typeof r.mean_sse === 'number') ? r.mean_sse : 0;
          var s = (typeof r.std_sse === 'number') ? r.std_sse : 0;
          return [i, m - s, m + s];
        })
      });
    }

    inst.setOption({
      backgroundColor: 'transparent',
      grid: { left: 10, right: 16, top: 30, bottom: 6, containLabel: true },
      tooltip: Object.assign(tooltipBase(), {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: function (params) { return summaryTip(rows[params[0].dataIndex] || {}); }
      }),
      xAxis: {
        type: 'category',
        data: labels,
        axisLabel: Object.assign(axisLabelStyle(), { interval: 0, rotate: labels.length > 5 ? 24 : 0 }),
        axisLine: { lineStyle: { color: C.axis } },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        name: metric.axis,
        nameTextStyle: { color: C.textFaint, fontSize: 10 },
        axisLabel: { color: C.textDim, fontSize: 10, formatter: function (v) { return global.UI.fmtNum(v, 1); } },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: C.splitLine } }
      },
      series: series
    }, { notMerge: true });
  }

  /* ---------------- 对比：参数敏感性（SSE vs k） ---------------- */

  function renderSensitivity(sensitivity) {
    var inst = instances.sens;
    if (!inst) return;
    var rows = (sensitivity || []).slice();
    if (!rows.length) { inst.clear(); return; }

    var ks = rows.map(function (r) { return String(r.k); });
    var algos = [];
    rows.forEach(function (r) {
      ((r && r.summary) || []).forEach(function (s) {
        if (algos.indexOf(s.algorithm) < 0) algos.push(s.algorithm);
      });
    });

    var palette = linePalette();
    var series = algos.map(function (a, i) {
      return {
        name: global.UI.algoLabel(a),
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        z: 4,
        lineStyle: { width: 2, color: palette[i % palette.length] },
        itemStyle: { color: palette[i % palette.length] },
        data: rows.map(function (r) {
          var hit = ((r.summary) || []).filter(function (x) { return x.algorithm === a; })[0];
          return hit && typeof hit.mean_sse === 'number' ? Number(hit.mean_sse.toFixed(4)) : null;
        })
      };
    });

    inst.setOption({
      backgroundColor: 'transparent',
      color: palette,
      legend: {
        top: 2,
        right: 8,
        textStyle: { color: C.textDim, fontSize: 10 },
        itemWidth: 14,
        itemHeight: 8
      },
      grid: { left: 10, right: 16, top: 34, bottom: 22, containLabel: true },
      tooltip: Object.assign(tooltipBase(), { trigger: 'axis' }),
      xAxis: {
        type: 'category',
        name: 'k',
        nameLocation: 'middle',
        nameGap: 24,
        data: ks,
        nameTextStyle: { color: C.textFaint, fontSize: 10 },
        axisLabel: axisLabelStyle(),
        axisLine: { lineStyle: { color: C.axis } },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        name: '平均 SSE',
        nameTextStyle: { color: C.textFaint, fontSize: 10 },
        axisLabel: { color: C.textDim, fontSize: 10, formatter: function (v) { return global.UI.fmtNum(v, 1); } },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: C.splitLine } }
      },
      series: series
    }, { notMerge: true });
  }

  /* ---------------- 层次聚类：树状图与合并距离 ---------------- */

  function renderDendrogram(result) {
    var inst = instances.tree;
    if (!inst) return;
    var d = result && result.dendrogram;
    if (!d || !Array.isArray(d.merges) || !d.merges.length) {
      inst.clear();
      setOverlay('tree', true);
      return;
    }
    setOverlay('tree', false);

    var n = d.n, merges = d.merges;
    var height = {}, xpos = {}, weight = {}, data = [];
    var i;
    for (i = 0; i < n; i++) { height[i] = 0; xpos[i] = i; weight[i] = 1; }
    merges.forEach(function (row, idx) {
      var l = row[0], r = row[1], dist = row[2], size = row[3];
      var node = n + idx;
      data.push([xpos[l], height[l]], [xpos[l], dist], null);
      data.push([xpos[r], height[r]], [xpos[r], dist], null);
      data.push([xpos[l], dist], [xpos[r], dist], null);
      height[node] = dist;
      weight[node] = size;
      xpos[node] = (xpos[l] * weight[l] + xpos[r] * weight[r]) / (weight[l] + weight[r]);
    });

    var cutIndex = n - d.cut;
    var series = [{
      name: '合并',
      type: 'line',
      data: data,
      showSymbol: false,
      symbol: 'none',
      connectNulls: false,
      silent: true,
      z: 2,
      lineStyle: { color: C.textDim, width: 1.1 }
    }];
    if (cutIndex > 0 && cutIndex < merges.length) {
      series[0].markLine = {
        silent: true,
        symbol: 'none',
        label: { formatter: '切 K=' + d.cut, color: C.textFaint, fontSize: 9, position: 'insideEndTop' },
        lineStyle: { color: '#d8b26a', width: 1.2, type: 'dashed' },
        data: [{ yAxis: merges[cutIndex - 1][2] }]
      };
    }

    inst.setOption({
      backgroundColor: 'transparent',
      animationDuration: 260,
      grid: { left: 44, right: 18, top: 26, bottom: 22, containLabel: true },
      tooltip: Object.assign(tooltipBase(), { trigger: 'item', formatter: function () { return ''; }, show: false }),
      xAxis: {
        type: 'value', min: -0.5, max: n - 0.5,
        axisLabel: { show: false }, axisLine: { lineStyle: { color: C.axis } },
        splitLine: { show: false }
      },
      yAxis: valueAxis('合并距离'),
      series: series
    }, { notMerge: true });
  }

  function renderMergeCurve(result) {
    var inst = instances.sse;
    if (!inst) return;
    var d = result && result.dendrogram;
    if (!d || !Array.isArray(d.merges) || !d.merges.length) {
      inst.clear();
      setOverlay('sse', true);
      return;
    }
    setOverlay('sse', false);
    var data = d.merges.map(function (row, i) { return [i + 1, row[2]]; });
    var cutIndex = d.n - d.cut;
    var series = [{
      name: '合并距离',
      type: 'line',
      data: data,
      smooth: 0.15,
      showSymbol: false,
      z: 3,
      lineStyle: { color: C.accent, width: 1.8 },
      areaStyle: { color: C.accent, opacity: 0.06 }
    }];
    if (cutIndex > 0 && cutIndex <= data.length) {
      series[0].markLine = {
        silent: true,
        symbol: 'none',
        label: { formatter: '切 K=' + d.cut, color: C.textFaint, fontSize: 9 },
        lineStyle: { color: '#d8b26a', width: 1.2, type: 'dashed' },
        data: [{ xAxis: cutIndex }]
      };
    }
    inst.setOption({
      backgroundColor: 'transparent',
      animationDuration: 260,
      grid: { left: 44, right: 20, top: 28, bottom: 23, containLabel: true },
      tooltip: Object.assign(tooltipBase(), {
        trigger: 'axis',
        formatter: function (params) {
          var p = params && params[0];
          if (!p) return '';
          return '第 ' + p.value[0] + ' 次合并<br/>距离 ' + global.UI.fmtNum(p.value[1], 3);
        }
      }),
      xAxis: Object.assign(valueAxis('合并次数'), { type: 'value' }),
      yAxis: valueAxis('合并距离'),
      series: series
    }, { notMerge: true });
  }

  /* ---------------- 导出 / 其他 ---------------- */

  /** 取图表 PNG dataURL；pixelRatio=2，带深色底。 */
  function dataURL(name) {
    var inst = instances[name];
    if (!inst) return null;
    try {
      return inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#141414' });
    } catch (e) {
      return null;
    }
  }

  function resizeAll() {
    Object.keys(instances).forEach(function (k) {
      try { instances[k].resize(); } catch (e) { /* 容器不可见时忽略 */ }
    });
  }

  /** 清空主视图三图并显示空态覆盖层。 */
  function clearMain() {
    ['scatter', 'tree', 'sse'].forEach(function (k) {
      var inst = instances[k];
      if (inst) {
        try { inst.clear(); } catch (e) { /* noop */ }
      }
      setOverlay(k, true);
    });
  }

  global.Charts = {
    loadECharts: loadECharts,
    initCharts: initCharts,
    ensureCompareCharts: ensureCompareCharts,
    renderScatter: renderScatter,
    renderTree: renderTree,
    renderSse: renderSse,
    renderDendrogram: renderDendrogram,
    renderMergeCurve: renderMergeCurve,
    setOverlayText: setOverlayText,
    renderCompareBar: renderCompareBar,
    renderSensitivity: renderSensitivity,
    bindScatterClick: bindScatterClick,
    bindTreeClick: bindTreeClick,
    bindSseClick: bindSseClick,
    dataURL: dataURL,
    resizeAll: resizeAll,
    refreshTheme: refreshTheme,
    clearMain: clearMain
  };
})(window);

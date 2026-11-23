/* ============================================================
 * KMeansLab — 主控（main.js）
 * 启动流程、事件接线、运行 / 对比 / 导出处理、就绪指示。
 *
 * 就绪选择器（供外部验证）：
 *   html[data-ready="1"]    UI 就绪（ECharts 已加载、事件已接线）
 *   html[data-api="1"]      pywebview 后端已连接
 *   #card-hero[data-result="1"]  已有聚类结果渲染
 *   #status-pill[data-state]     boot | ok | busy | error
 *   window.__KML__.uiReady / apiReady / hasResult / frameIndex
 * ============================================================ */
(function (global) {
  'use strict';

  var $ = global.UI.$;
  var $all = global.UI.$all;
  var el = global.UI.el;
  var fmtNum = global.UI.fmtNum;

  /* ---------------- 帧渲染总入口 ---------------- */

  function renderAll(payload) {
    var frame = payload.frame, index = payload.index, total = payload.total;
    global.State.frameIndex = index;

    if (!frame) {
      $('#tl-pos').textContent = '0 / 0';
      var chip0 = $('#tl-event');
      chip0.textContent = '—';
      chip0.className = 'badge ev';
      $('#tl-iter').textContent = '迭代 —';
      $('#pca-note').textContent = '—';
      global.Panels.renderFrame(null, 0, 0);
      global.Panels.renderClusters(null, null, {});
      return;
    }

    global.Charts.renderScatter({
      result: global.State.result,
      frame: frame,
      index: index,
      colorMap: global.State.colorMap,
      showTraj: $('#chk-traj').checked,
      selectedId: global.State.selectedCluster
    });
    var kind = (global.State.result && global.State.result.kind) || 'kmeans';
    if (kind === 'hierarchical') {
      global.Charts.renderDendrogram(global.State.result);
      global.Charts.renderMergeCurve(global.State.result);
    } else if (kind === 'dbscan') {
      global.Charts.renderTree(null, {});
      global.Charts.setOverlayText('tree', 'DBSCAN 没有分裂树；红色 × 为噪声点。');
      global.Charts.renderSse(null);
      global.Charts.setOverlayText('sse', 'DBSCAN 不使用 SSE；评价见右侧指标。');
    } else {
      global.Charts.renderTree(frame, global.State.colorMap);
      global.Charts.renderSse(global.State.result, index);
    }
    global.Panels.renderFrame(frame, index, total);
    global.Panels.renderClusters(frame, global.State.selectedCluster, global.State.colorMap);

    $('#tl-pos').textContent = index + ' / ' + Math.max(total - 1, 0);
    var chip = $('#tl-event');
    chip.textContent = global.UI.eventLabel(frame.event);
    chip.className = 'badge ev ev-' + String(frame.event || 'none');
    $('#tl-iter').textContent = '迭代 ' + (frame.iteration != null ? frame.iteration : '—');

    var evr = (global.State.result && global.State.result.explained_variance_ratio) || [];
    $('#pca-note').textContent = evr.length >= 2
      ? 'PC1 ' + (evr[0] * 100).toFixed(1) + '% · PC2 ' + (evr[1] * 100).toFixed(1) + '%'
      : '—';
  }

  /** 只重绘散点（选中簇 / 轨迹开关变化时）。 */
  function redrawScatter() {
    var cur = global.Timeline.current();
    if (!cur.frame || !global.State.result) return;
    global.Charts.renderScatter({
      result: global.State.result,
      frame: cur.frame,
      index: cur.index,
      colorMap: global.State.colorMap,
      showTraj: $('#chk-traj').checked,
      selectedId: global.State.selectedCluster
    });
  }

  /* ---------------- 结果清空 ---------------- */

  function applyKindChrome(kind) {
    var simple = kind === 'dbscan' || kind === 'hierarchical';
    var hier = kind === 'hierarchical';
    $('#card-timeline').classList.toggle('hidden', simple);
    var traj = $('#chk-traj');
    if (traj && traj.closest('label')) traj.closest('label').classList.toggle('hidden', simple);
    $('#tree-title').textContent = hier ? '树状图' : '分裂树';
    $('#tree-sub').textContent = hier
      ? 'average linkage · 黄色虚线为切 K'
      : (kind === 'dbscan' ? 'DBSCAN 不使用分裂树' : '与时间轴同步 · 点击节点可跳转');
    $('#sse-title').textContent = hier ? '合并距离' : 'SSE 曲线';
    $('#sse-sub').textContent = hier
      ? '第 n 次合并的簇间距离'
      : (kind === 'dbscan' ? 'DBSCAN 不使用 SSE' : '▲ 为分裂完成帧 · 点击可跳转');
    if (kind === 'kmeans') {
      global.Charts.setOverlayText('tree', '尚无分裂树');
      global.Charts.setOverlayText('sse', '尚无数据');
    }
  }

  function clearResultView() {
    global.State.result = null;
    global.State.selectedCluster = null;
    global.State.colorMap = {};
    global.State.frameIndex = 0;
    applyKindChrome('kmeans');
    $('#card-hero').dataset.result = '0';
    $('#btn-export-png').disabled = true;
    $('#btn-export-json').disabled = true;
    global.Timeline.load([]);
    global.Charts.clearMain();
    global.Panels.renderMetrics(null);
  }

  /* ---------------- 数据集 ---------------- */

  async function initDatasets() {
    var list = await global.Bridge.call('list_datasets');
    global.State.datasets = Array.isArray(list) ? list : [];
    var sel = $('#sel-dataset');
    sel.textContent = '';
    if (!global.State.datasets.length) {
      sel.appendChild(el('option', null, '（无可用数据集）'));
      global.UI.toastWarn('后端未返回任何数据集');
      return;
    }
    global.State.datasets.forEach(function (d) {
      var o = el('option', null, d.name || d.id);
      o.value = d.id;
      sel.appendChild(o);
    });
    $('#dataset-count-badge').textContent = global.State.datasets.length + ' 个';
    sel.value = global.State.datasets[0].id;
    await loadDatasetInfo(global.State.datasets[0].id);
  }

  async function loadDatasetInfo(id) {
    global.State.datasetId = id;
    try {
      var info = await global.Bridge.getDatasetInfo(id);
      global.State.datasetInfo = info;
      global.Panels.renderDatasetSummary(info);
    } catch (e) {
      global.UI.toastError('数据集信息加载失败：' + e.message);
    }
  }

  /* ---------------- 配置收集 ---------------- */

  function intVal(sel, dft) {
    var v = parseInt($(sel).value, 10);
    return isNaN(v) ? dft : v;
  }
  function floatVal(sel, dft) {
    var v = parseFloat($(sel).value);
    return isNaN(v) ? dft : v;
  }

  function collectConfig() {
    var cfg = {
      dataset: global.State.datasetId,
      algorithm: $('#sel-algorithm').value,
      k: intVal('#inp-k', 3),
      seed: intVal('#inp-seed', 42),
      max_iter: intVal('#inp-max-iter', 100),
      tol: floatVal('#inp-tol', 1e-6),
      restarts: intVal('#inp-restarts', 5),
      init_method: $('#sel-init').value,
      eps: floatVal('#inp-eps', 0.8),
      min_samples: intVal('#inp-min-samples', 5),
      linkage: $('#sel-linkage').value
    };
    var n = global.State.datasetInfo && global.State.datasetInfo.samples;
    if (!cfg.dataset) throw new Error('请先选择数据集');
    if (cfg.algorithm === 'dbscan') {
      if (!(cfg.eps > 0 && cfg.eps <= 10)) throw new Error('eps 必须在 (0, 10] 之间');
      if (!(cfg.min_samples >= 1)) throw new Error('min_samples 必须 ≥ 1');
      if (n && cfg.min_samples > n) throw new Error('min_samples 不能超过样本数（' + n + '）');
    } else {
      if (!(cfg.k >= 1)) throw new Error('簇数 k 必须 ≥ 1');
      if (n && cfg.k > n) throw new Error('簇数 k 不能超过样本数（' + n + '）');
      if (cfg.algorithm !== 'hierarchical') {
        if (!(cfg.max_iter >= 1)) throw new Error('最大迭代必须 ≥ 1');
        if (!(cfg.tol >= 0)) throw new Error('收敛容差不能为负');
        if (!(cfg.restarts >= 1)) throw new Error('重启次数必须 ≥ 1');
      }
    }
    return cfg;
  }

  function syncAlgorithmFields() {
    var a = $('#sel-algorithm').value;
    var isDb = a === 'dbscan';
    var isHier = a === 'hierarchical';
    var isKm = !isDb && !isHier;
    $('#row-k').classList.toggle('hidden', isDb);
    $('#field-seed').classList.toggle('hidden', !isKm);
    $('#row-iter').classList.toggle('hidden', !isKm);
    $('#row-restarts').classList.toggle('hidden', !isKm);
    $('#row-dbscan').classList.toggle('hidden', !isDb);
    $('#row-hier').classList.toggle('hidden', !isHier);
    if (isDb) {
      $('#inp-eps').title = '标准化特征空间中的邻域半径';
      $('#inp-min-samples').title = '成为核心点所需的最少邻居数（含自身）';
    }
  }

  function validateResult(res) {
    if (!res || typeof res !== 'object') throw new Error('后端返回数据不完整');
    if (!Array.isArray(res.points_2d) || !res.points_2d.length) throw new Error('后端返回数据不完整：缺少 points_2d');
    if (!Array.isArray(res.frames) || !res.frames.length) throw new Error('后端返回数据不完整：缺少 frames');
  }

  /* ---------------- 运行聚类 ---------------- */

  async function runClustering() {
    if (global.State.running) return;
    var cfg;
    try { cfg = collectConfig(); }
    catch (e) { global.UI.toastWarn(e.message); return; }

    var btn = $('#btn-run');
    global.State.running = true;
    global.UI.setLoading(btn, true, '⏳ 计算中…');
    global.UI.setStatus('busy', '计算中…');
    try {
      var res = await global.Bridge.call('run_clustering', cfg);
      validateResult(res);
      global.State.applyResult(res);
      applyKindChrome(res.kind || 'kmeans');
      $('#card-hero').dataset.result = '1';
      $('#btn-export-png').disabled = false;
      $('#btn-export-json').disabled = false;
      global.Timeline.load(res.frames);           // 触发 frame → renderAll
      global.Panels.renderMetrics(global.State.result);
      var m = res.metrics || {};
      var summary = m.sse != null
        ? 'SSE=' + fmtNum(m.sse)
        : '簇数=' + fmtNum(m.clusters, 0) + (m.noise ? '，噪声=' + m.noise : '');
      global.UI.toastSuccess('聚类完成：' + summary + '，耗时 ' + fmtNum(m.elapsed_ms, 0) + ' ms');
      global.UI.setStatus('ok', '就绪');
    } catch (e) {
      global.UI.toastError(e.message);
      global.UI.setStatus('error', '运行失败');
    } finally {
      global.UI.setLoading(btn, false);
      global.State.running = false;
    }
  }

  /* ---------------- 对比实验 ---------------- */

  async function runCompare() {
    if (global.State.comparing) return;
    if (global.State.running) { global.UI.toastWarn('聚类正在运行，请稍候'); return; }
    var cfg;
    try { cfg = collectConfig(); }
    catch (e) { global.UI.toastWarn(e.message); return; }
    cfg.repeats = intVal('#inp-repeats', 20);
    cfg.restarts = intVal('#inp-cmp-restarts', 5);   // 对比实验默认 restarts=5
    cfg.k_min = intVal('#inp-k-min', 1);
    cfg.k_max = intVal('#inp-k-max', 8);
    if (!(cfg.repeats >= 1)) { global.UI.toastWarn('重复次数必须 ≥ 1'); return; }
    if (!(cfg.k_min >= 1) || !(cfg.k_max >= 1)) { global.UI.toastWarn('k 范围必须 ≥ 1'); return; }
    if (cfg.k_min > cfg.k_max) {
      var t = cfg.k_min; cfg.k_min = cfg.k_max; cfg.k_max = t;
      $('#inp-k-min').value = cfg.k_min;
      $('#inp-k-max').value = cfg.k_max;
      global.UI.toastInfo('k 上下限已自动对调');
    }

    var btn = $('#btn-compare');
    global.State.comparing = true;
    global.UI.setLoading(btn, true, '⏳ 对比实验进行中…');
    global.UI.setStatus('busy', '对比实验中…');
    try {
      var cmp = await global.Bridge.call('compare_algorithms', cfg);
      if (!cmp || !Array.isArray(cmp.summary)) throw new Error('对比实验返回数据不完整');
      global.State.compare = cmp;
      $('#card-compare').dataset.open = '1';
      switchTab('pane-summary');
      global.Panels.renderCompare(cmp);
      refreshCompareBar();
      rafResize();
      $('#card-compare').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      global.UI.toastSuccess('对比实验完成：' + cmp.summary.length + ' 种算法');
      global.UI.setStatus('ok', '就绪');
    } catch (e) {
      global.UI.toastError(e.message);
      global.UI.setStatus('error', '对比失败');
    } finally {
      global.UI.setLoading(btn, false);
      global.State.comparing = false;
    }
  }

  /* ---------------- 对比柱状图（指标可选） ---------------- */

  function refreshCompareBar() {
    if (!global.State.compare) return;
    if (!global.Charts.ensureCompareCharts()) return;
    var metric = $('#sel-compbar-metric').value || 'mean_sse';
    global.Charts.renderCompareBar(global.State.compare.summary, metric);
  }

  function refreshSensitivity() {
    if (!global.State.compare) return;
    if (!global.Charts.ensureCompareCharts()) return;
    global.Charts.renderSensitivity(global.State.compare.sensitivity);
  }

  function switchTab(paneId) {
    $all('#compare-tabs .tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.pane === paneId);
    });
    $all('#card-compare .pane').forEach(function (p) {
      p.classList.toggle('active', p.id === paneId);
    });
    if (paneId === 'pane-bar') { refreshCompareBar(); rafResize(); }
    if (paneId === 'pane-sens') { refreshSensitivity(); rafResize(); }
  }

  /* ---------------- 导出 ---------------- */

  function fallbackDownload(href, filename) {
    var a = el('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function exportPNG(chartKey, filename) {
    var url = global.Charts.dataURL(chartKey);
    if (!url) { global.UI.toastWarn('图表尚未渲染，无法导出'); return; }
    if (global.Bridge.ready()) {
      try {
        var r = await global.Bridge.call('save_chart', url);
        if (r && r.saved) global.UI.toastSuccess('PNG 已保存：' + (r.path || ''));
        else global.UI.toastWarn('PNG 保存未成功' + (r && r.path ? '：' + r.path : ''));
      } catch (e) {
        global.UI.toastError('保存 PNG 失败：' + e.message);
      }
      return;
    }
    fallbackDownload(url, filename);   // 无后端时退化为浏览器下载
  }

  async function exportJSON() {
    if (!global.State.result) { global.UI.toastWarn('尚无聚类结果可导出'); return; }
    if (global.Bridge.ready()) {
      try {
        var r = await global.Bridge.call('save_result', global.State.result);
        if (r && r.saved) global.UI.toastSuccess('JSON 已保存：' + (r.path || ''));
        else global.UI.toastWarn('JSON 保存未成功' + (r && r.path ? '：' + r.path : ''));
      } catch (e) {
        global.UI.toastError('保存 JSON 失败：' + e.message);
      }
      return;
    }
    var blob = new Blob([JSON.stringify(global.State.result, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    fallbackDownload(url, 'kmeans_result.json');
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* ---------------- 分裂树 / SSE 点击跳转 ---------------- */

  function jumpToSplit(nodeId) {
    var frames = (global.State.result && global.State.result.frames) || [];
    var target = -1, i, f;
    for (i = 0; i < frames.length; i++) {
      f = frames[i];
      if (f.event === 'split_complete' && String(f.split_id) === String(nodeId)) { target = i; break; }
    }
    if (target < 0) {
      for (i = 0; i < frames.length; i++) {
        f = frames[i];
        if (f.event === 'split_selected' && String(f.split_id) === String(nodeId)) { target = i; break; }
      }
    }
    if (target >= 0) global.Timeline.go(target);
    else global.UI.toastInfo('未找到簇 #' + nodeId + ' 对应的分裂帧');
  }

  /* ---------------- 明暗主题 ---------------- */

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('kml-theme', theme); } catch (e) { /* 忽略存储失败 */ }
    var btn = $('#btn-theme');
    if (btn) btn.textContent = theme === 'light' ? '◐ 暗色' : '◐ 亮色';
    if (!global.Charts || !global.Charts.refreshTheme) return;
    global.Charts.refreshTheme();
    if (global.State.result) {
      global.State.colorMap = global.buildColorMap(global.State.result);
      var cur = global.Timeline.current();
      if (cur && cur.frame) renderAll(cur);
    }
    if (global.State.compare) {
      global.Panels.renderCompare(global.State.compare);
      refreshCompareBar();
      refreshSensitivity();
    }
  }

  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem('kml-theme'); } catch (e) { /* 忽略 */ }
    applyTheme(saved === 'light' ? 'light' : 'dark');
  }

  /* ---------------- 视图切换 ---------------- */

  function switchView(name) {
    document.querySelectorAll('.view-tab').forEach(function (tab) {
      tab.classList.toggle('active', tab.dataset.view === name);
    });
    $('#view-lab').classList.toggle('hidden', name !== 'lab');
    $('#view-explain').classList.toggle('hidden', name !== 'explain');
    if (name === 'lab' && global.Charts.resizeAll) {
      setTimeout(function () { global.Charts.resizeAll(); }, 60);
    }
    window.scrollTo(0, 0);
  }

  /* ---------------- 事件接线 ---------------- */

  function wireDom() {
    // 运行 / 对比
    $('#btn-run').addEventListener('click', runClustering);
    $('#btn-compare').addEventListener('click', runCompare);
    document.querySelectorAll('.view-tab').forEach(function (tab) {
      tab.addEventListener('click', function () { switchView(tab.dataset.view); });
    });
    $('#btn-go-lab').addEventListener('click', function () { switchView('lab'); });
    $('#btn-go-compare').addEventListener('click', function () {
      switchView('lab');
      setTimeout(function () { runCompare(); }, 120);
    });
    $('#btn-random-seed').addEventListener('click', function () {
      var seed = Math.floor(Math.random() * 10000);
      $('#inp-seed').value = String(seed);
      global.UI.toastInfo('随机种子已改为 ' + seed + '，再次运行可看到不同的初始中心');
    });
    $('#btn-theme').addEventListener('click', function () {
      applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
    });

    // 算法切换时的初始化方式建议
    $('#sel-algorithm').addEventListener('change', function () {
      var a = $('#sel-algorithm').value;
      if (a === 'improved') $('#sel-init').value = 'kmeans++';
      else if (a === 'kmeans') $('#sel-init').value = 'random';
      syncAlgorithmFields();
    });

    // 数据集切换：结果属于旧数据集，必须清空
    $('#sel-dataset').addEventListener('change', async function (e) {
      var id = e.target.value;
      if (!id) return;
      if (global.State.result) {
        clearResultView();
        global.UI.toastInfo('已切换数据集，请重新运行聚类');
      }
      await loadDatasetInfo(id);
    });

    // 时间轴
    $('#tl-first').addEventListener('click', function () { global.Timeline.pause(); global.Timeline.first(); });
    $('#tl-prev').addEventListener('click', function () { global.Timeline.pause(); global.Timeline.prev(); });
    $('#tl-next').addEventListener('click', function () { global.Timeline.pause(); global.Timeline.next(); });
    $('#tl-last').addEventListener('click', function () { global.Timeline.pause(); global.Timeline.last(); });
    $('#tl-next-split').addEventListener('click', function () { global.Timeline.pause(); global.Timeline.nextSplit(); });
    $('#tl-play').addEventListener('click', function () { global.Timeline.toggle(); });
    $('#tl-speed').addEventListener('change', function (e) {
      global.Timeline.setSpeed(parseFloat(e.target.value));
    });
    $('#tl-slider').addEventListener('input', function (e) {
      global.Timeline.pause();
      global.Timeline.go(parseInt(e.target.value, 10) || 0);
    });

    // 轨迹开关
    $('#chk-traj').addEventListener('change', redrawScatter);

    // 导出
    $('#btn-export-png').addEventListener('click', function () { exportPNG('scatter', 'kmeans_pca.png'); });
    $('#btn-export-json').addEventListener('click', exportJSON);
    $('#btn-export-compbar').addEventListener('click', function () { exportPNG('compbar', 'kmeans_compare.png'); });
    $('#btn-export-sens').addEventListener('click', function () { exportPNG('sens', 'kmeans_sensitivity.png'); });

    // 对比 tabs
    $all('#compare-tabs .tab').forEach(function (t) {
      t.addEventListener('click', function () { switchTab(t.dataset.pane); });
    });
    $('#sel-compbar-metric').addEventListener('change', refreshCompareBar);

    // 明细表筛选
    $('#runs-filter-algo').addEventListener('change', function () { global.Panels.renderRunsTable(); });
    $('#runs-filter-k').addEventListener('change', function () { global.Panels.renderRunsTable(); });

    // 图表点击
    global.Charts.bindScatterClick(function (id) { Bus.emit('selectCluster', id); });
    global.Charts.bindTreeClick(jumpToSplit);
    global.Charts.bindSseClick(function (i) { global.Timeline.go(i); });

    // Bus
    Bus.on('frame', renderAll);
    Bus.on('slider', function (p) {
      var s = $('#tl-slider');
      s.max = String(Math.max(p.total - 1, 0));
      s.value = String(p.index);
      s.disabled = p.total === 0;
      ['tl-first', 'tl-prev', 'tl-play', 'tl-next', 'tl-next-split', 'tl-last'].forEach(function (id) {
        $('#' + id).disabled = p.total === 0;
      });
    });
    Bus.on('playstate', function (playing) {
      $('#tl-play').textContent = playing ? '⏸' : '▶';
      $('#tl-play').classList.toggle('active', !!playing);
    });
    Bus.on('toast', function (p) { global.UI.toast(p.kind, p.message); });
    Bus.on('selectCluster', function (rawId) {
      if (!global.State.result) return;
      if (Number(rawId) === -1) {
        global.UI.toastInfo('噪声点不属于任何簇（DBSCAN 的 -1 标签）');
        return;
      }
      var same = global.State.selectedCluster !== null &&
        String(global.State.selectedCluster) === String(rawId);
      global.State.selectedCluster = same ? null : rawId;
      redrawScatter();
      var cur = global.Timeline.current();
      global.Panels.renderClusters(cur.frame, global.State.selectedCluster, global.State.colorMap);
    });

    // 键盘：←/→ 步进，空格播放（输入控件内不劫持）
    document.addEventListener('keydown', function (e) {
      var tag = e.target && e.target.tagName;
      if (tag === 'INPUT' && e.target.type !== 'range') return;
      if (tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      if (!global.State.result) return;
      if (e.key === 'ArrowLeft') { global.Timeline.pause(); global.Timeline.prev(); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { global.Timeline.pause(); global.Timeline.next(); e.preventDefault(); }
      else if (e.key === ' ') { global.Timeline.toggle(); e.preventDefault(); }
    });

    // 窗口尺寸变化
    var resizeTimer = null;
    global.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { global.Charts.resizeAll(); }, 150);
    });
  }

  function rafResize() {
    requestAnimationFrame(function () { global.Charts.resizeAll(); });
  }

  /* ---------------- 启动 ---------------- */

  async function boot() {
    // 1) 本地 ECharts（index.html 已带静态 script 标签；此处兜底探测备用路径）
    var chartsOk = true;
    try {
      await global.Charts.loadECharts();
      global.Charts.initCharts();
    } catch (e) {
      chartsOk = false;
      global.UI.fatal('本地 ECharts 加载失败，图表功能不可用', e.message);
      global.UI.setStatus('error', '图表库缺失');
    }

    // 2) 初始空态面板
    initTheme();
    global.Panels.renderMetrics(null);
    global.Panels.renderFrame(null, 0, 0);
    global.Panels.renderClusters(null, null, {});

    // 3) 事件接线
    wireDom();
    syncAlgorithmFields();

    // UI 自身就绪（无论后端是否可用），暴露验证选择器
    document.documentElement.dataset.ready = '1';

    // 4) 后端
    if (chartsOk) global.UI.setStatus('boot', '连接后端…');
    try {
      await global.Bridge.wait();
      document.documentElement.dataset.api = '1';
      if (chartsOk) global.UI.setStatus('ok', '后端已连接');
      await initDatasets();
      if (chartsOk) global.UI.setStatus('ok', '就绪');
    } catch (e) {
      document.documentElement.dataset.api = '0';
      global.UI.setStatus('error', '后端不可用');
      global.UI.fatal('无法连接后端（pywebview API）', e.message);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { boot(); }, { once: true });
  } else {
    boot();
  }

  /* ---------------- 验证辅助 ---------------- */

  Object.defineProperty(global, '__KML__', {
    value: {
      get uiReady() { return document.documentElement.dataset.ready === '1'; },
      get apiReady() { return document.documentElement.dataset.api === '1'; },
      get hasResult() { return !!global.State.result; },
      get dataset() { return global.State.datasetId; },
      get algorithm() { var s = $('#sel-algorithm'); return s ? s.value : null; },
      get frameIndex() { return global.State.frameIndex; },
      get playing() { return global.Timeline.isPlaying(); }
    },
    writable: false,
    enumerable: true,
    configurable: false
  });
})(window);

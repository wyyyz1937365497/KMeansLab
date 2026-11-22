/* ============================================================
 * KMeansLab — 面板渲染（panels.js）
 * DOM 渲染函数（不直接读取输入控件）：
 *  - renderDatasetSummary  数据集摘要 + 特征名列表
 *  - renderMetrics         整体运行指标（SSE / ARI / 轮廓 / 耗时…）
 *  - renderFrame           当前帧信息（事件 / 分裂前后 SSE / details）
 *  - renderClusters        聚类统计（簇标签、大小、簇内 SSE、全特征中心）
 *  - renderCompare         对比实验：元信息 + 汇总表 + 明细表筛选
 * ============================================================ */
(function (global) {
  'use strict';

  var el = global.UI.el;
  var fmtNum = global.UI.fmtNum;

  function addKv(root, k, v, cls) {
    var row = el('div', 'kv-row');
    row.appendChild(el('dt', null, k));
    var dd = el('dd', cls || null, v);
    row.appendChild(dd);
    root.appendChild(row);
    return dd;
  }

  function clearNode(node) { node.textContent = ''; }

  /** details 等任意 JSON 值的可读化。 */
  function fmtGeneric(v) {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'number') return fmtNum(v);
    if (typeof v === 'boolean') return v ? '是' : '否';
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) {
      var head = v.slice(0, 8).map(function (x) { return typeof x === 'number' ? fmtNum(x) : String(x); });
      return head.join(', ') + (v.length > 8 ? ' …(' + v.length + ')' : '');
    }
    try {
      var s = JSON.stringify(v);
      return s.length > 80 ? s.slice(0, 80) + '…' : s;
    } catch (e) { return String(v); }
  }

  /* ---------------- 数据集摘要 ---------------- */

  function renderDatasetSummary(info) {
    if (!info) {
      global.UI.$('#ds-samples').textContent = '—';
      global.UI.$('#ds-features').textContent = '—';
      global.UI.$('#ds-classes').textContent = '—';
      global.UI.$('#ds-source').textContent = '—';
      global.UI.$('#ds-description').textContent = '—';
      clearNode(global.UI.$('#ds-feature-chips'));
      return;
    }
    global.UI.$('#ds-samples').textContent = fmtNum(info.samples, 0);
    global.UI.$('#ds-features').textContent = fmtNum(info.features, 0);
    global.UI.$('#ds-classes').textContent =
      (info.classes === null || info.classes === undefined) ? '无标签' : fmtNum(info.classes, 0);
    global.UI.$('#ds-source').textContent = info.source || '—';
    global.UI.$('#ds-description').textContent = info.description || '—';

    var wrap = global.UI.$('#ds-feature-chips');
    clearNode(wrap);
    var names = info.feature_names || [];
    names.slice(0, 24).forEach(function (f) {
      wrap.appendChild(el('span', 'chip', f));
    });
    if (names.length > 24) {
      wrap.appendChild(el('span', 'chip', '+' + (names.length - 24)));
    }
  }

  /* ---------------- 运行指标 ---------------- */

  function renderMetrics(result) {
    var kv = global.UI.$('#metrics-kv');
    var hint = global.UI.$('#metrics-hint');
    clearNode(kv);
    if (!result || !result.metrics) {
      if (hint) hint.classList.remove('hidden');
      global.UI.$('#metrics-algo').textContent = '—';
      return;
    }
    if (hint) hint.classList.add('hidden');
    var m = result.metrics;
    addKv(kv, 'SSE（簇内平方和）', fmtNum(m.sse));
    addKv(kv, 'ARI（调整兰德指数）', fmtNum(m.ari));
    addKv(kv, '轮廓系数', fmtNum(m.silhouette));
    addKv(kv, '耗时', m.elapsed_ms != null ? fmtNum(m.elapsed_ms, 1) + ' ms' : '—');
    addKv(kv, '迭代轮数', fmtNum(m.iterations, 0));
    addKv(kv, '候选中心评估', fmtNum(m.candidate_evaluations, 0));
    global.UI.$('#metrics-algo').textContent = global.UI.algoLabel(result.algorithm || '');
  }

  /* ---------------- 当前帧 ---------------- */

  function renderFrame(frame, index, total) {
    var kv = global.UI.$('#frame-kv');
    var hint = global.UI.$('#frame-hint');
    var det = global.UI.$('#frame-details');
    clearNode(kv);
    clearNode(det);
    if (!frame) {
      if (hint) hint.classList.remove('hidden');
      return;
    }
    if (hint) hint.classList.add('hidden');

    addKv(kv, '步骤', (index != null ? index : '—') + ' / ' + (total != null && total > 0 ? total - 1 : '—'));
    addKv(kv, '事件', global.UI.eventLabel(frame.event));
    addKv(kv, '局部迭代', frame.iteration != null ? frame.iteration : '—');
    addKv(kv, '当前 SSE', fmtNum(frame.sse));
    addKv(kv, '活动簇数', (frame.center_ids || []).length);
    if (frame.split_id !== undefined && frame.split_id !== null) {
      addKv(kv, '分裂簇 #', frame.split_id);
    }
    if (frame.split_before_sse != null) {
      addKv(kv, '分裂前 SSE', fmtNum(frame.split_before_sse));
    }
    if (frame.split_after_sse != null) {
      addKv(kv, '分裂后 SSE', fmtNum(frame.split_after_sse));
      if (frame.split_before_sse != null) {
        var d = frame.split_after_sse - frame.split_before_sse;
        var cls = d <= 0 ? 'good' : 'bad';
        addKv(kv, '分裂变化 Δ', (d > 0 ? '+' : '') + fmtNum(d), cls);
      }
    }

    if (frame.details && typeof frame.details === 'object' && Object.keys(frame.details).length) {
      det.appendChild(el('h3', 'sub-head', '附加信息'));
      Object.keys(frame.details).forEach(function (k) {
        addKv(det, k, fmtGeneric(frame.details[k]));
      });
    }
  }

  /* ---------------- 聚类统计 ---------------- */

  function renderClusters(frame, selectedId, colorMap) {
    var chips = global.UI.$('#cluster-chips');
    var detail = global.UI.$('#cluster-detail');
    clearNode(chips);
    clearNode(detail);
    var clusters = (frame && frame.clusters) || [];
    if (!clusters.length) {
      detail.appendChild(el('p', 'muted small', '尚无聚类结果；运行后点击散点、质心或标签查看簇统计。'));
      return;
    }

    var total = clusters.reduce(function (s, c) { return s + (c.size || 0); }, 0) || 1;
    clusters.forEach(function (c) {
      var active = selectedId !== null && selectedId !== undefined &&
        String(selectedId) === String(c.id);
      var chip = el('button', 'chip cluster-chip' + (active ? ' active' : ''));
      chip.type = 'button';
      var dot = el('span', 'dot');
      dot.style.background = (colorMap || {})[c.id] || '#888';
      chip.appendChild(dot);
      chip.appendChild(el('span', null, '#' + c.id + ' · ' + c.size));
      chip.addEventListener('click', function () { Bus.emit('selectCluster', c.id); });
      chips.appendChild(chip);
    });

    var sel = null;
    clusters.forEach(function (c) {
      if (selectedId !== null && selectedId !== undefined && String(selectedId) === String(c.id)) sel = c;
    });
    if (!sel) {
      detail.appendChild(el('p', 'muted small', '点击散点、质心或上方标签查看该簇的统计与全特征中心。'));
      return;
    }

    var head = el('div', 'cluster-head');
    var dot = el('span', 'dot');
    dot.style.background = (colorMap || {})[sel.id] || '#888';
    head.appendChild(dot);
    head.appendChild(el('h3', null, '簇 #' + sel.id));
    detail.appendChild(head);

    var kv = el('div');
    kv.style.display = 'flex';
    kv.style.flexDirection = 'column';
    addKv(kv, '样本数', fmtNum(sel.size, 0));
    addKv(kv, '样本占比', (Math.round((sel.size || 0) / total * 1000) / 10) + '%');
    addKv(kv, '簇内 SSE', fmtNum(sel.sse));
    detail.appendChild(kv);

    var names = (global.State.result && global.State.result.feature_names) || [];
    var center = sel.center || [];
    if (center.length) {
      detail.appendChild(el('h3', 'sub-head', '质心（全特征空间）'));
      var tbl = el('table', 'data mini');
      var thead = el('thead');
      var hr = el('tr');
      hr.appendChild(el('th', null, '特征'));
      hr.appendChild(el('th', null, '中心值'));
      thead.appendChild(hr);
      tbl.appendChild(thead);
      var tbody = el('tbody');
      center.forEach(function (v, i) {
        var tr = el('tr');
        var td1 = el('td', null, names[i] || ('特征 ' + i));
        td1.style.fontFamily = 'var(--mono)';
        tr.appendChild(td1);
        tr.appendChild(el('td', null, fmtNum(v)));
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      var scroll = el('div', 'table-scroll');
      scroll.style.maxHeight = '170px';
      scroll.appendChild(tbl);
      detail.appendChild(scroll);
    } else {
      detail.appendChild(el('p', 'muted small', '（该簇无中心数据）'));
    }
  }

  /* ---------------- 对比实验 ---------------- */

  function metricOf(run, key) {
    if (!run) return null;
    if (run[key] !== undefined) return run[key];
    if (run.metrics && run.metrics[key] !== undefined) return run.metrics[key];
    return null;
  }

  function algoCell(tr, alg) {
    var td = el('td');
    td.appendChild(el('span', null, global.UI.algoLabel(alg)));
    if (String(global.UI.algoLabel(alg)) !== String(alg)) {
      td.appendChild(el('span', 'raw-code', alg));
    }
    tr.appendChild(td);
    return td;
  }

  function numCell(tr, v, best) {
    tr.appendChild(el('td', best ? 'best' : null, fmtNum(v)));
  }

  function renderSummaryTable(summary) {
    var tbl = global.UI.$('#tbl-summary');
    clearNode(tbl);
    var rows = summary || [];
    if (!rows.length) {
      tbl.appendChild(el('caption', 'muted small', '无汇总数据'));
      return;
    }
    function extremeOf(key, isMax) {
      var b = null;
      rows.forEach(function (r) {
        var v = r[key];
        if (typeof v !== 'number' || !isFinite(v)) return;
        if (b === null || (isMax ? v > b : v < b)) b = v;
      });
      return b;
    }
    var bestSse = extremeOf('mean_sse', false);
    var bestAri = extremeOf('mean_ari', true);
    var bestSil = extremeOf('mean_silhouette', true);

    var thead = el('thead');
    var hr = el('tr');
    ['算法', '平均 SSE', 'σ', '最优 SSE', '平均 ARI', '平均轮廓', '耗时 (ms)', '迭代', '候选评估']
      .forEach(function (h) { hr.appendChild(el('th', null, h)); });
    thead.appendChild(hr);
    tbl.appendChild(thead);

    var tbody = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr');
      algoCell(tr, r.algorithm);
      numCell(tr, r.mean_sse, typeof bestSse === 'number' && r.mean_sse === bestSse);
      numCell(tr, r.std_sse, false);
      numCell(tr, r.best_sse, false);
      numCell(tr, r.mean_ari, typeof bestAri === 'number' && r.mean_ari === bestAri);
      numCell(tr, r.mean_silhouette, typeof bestSil === 'number' && r.mean_silhouette === bestSil);
      numCell(tr, r.mean_elapsed_ms, false);
      numCell(tr, r.mean_iterations, false);
      numCell(tr, r.mean_candidate_evaluations, false);
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
  }

  function buildRunFilters(runs) {
    var selA = global.UI.$('#runs-filter-algo');
    var selK = global.UI.$('#runs-filter-k');
    selA.textContent = '';
    selK.textContent = '';
    selA.appendChild(el('option', null, '全部'));
    selA.value = 'all';
    selK.appendChild(el('option', null, '全部'));
    selK.value = 'all';
    var algos = [];
    var ks = [];
    (runs || []).forEach(function (r) {
      var a = r.algorithm;
      if (a !== undefined && algos.indexOf(a) < 0) algos.push(a);
      var k = r.k;
      if (k !== undefined && ks.indexOf(k) < 0) ks.push(k);
    });
    algos.forEach(function (a) {
      var o = el('option', null, global.UI.algoLabel(a));
      o.value = String(a);
      selA.appendChild(o);
    });
    ks.sort(function (x, y) { return x - y; }).forEach(function (k) {
      var o = el('option', null, String(k));
      o.value = String(k);
      selK.appendChild(o);
    });
  }

  function renderRunsTable() {
    var cmp = global.State.compare;
    var tbl = global.UI.$('#tbl-runs');
    var note = global.UI.$('#runs-note');
    clearNode(tbl);
    if (!cmp || !(cmp.runs || []).length) {
      note.textContent = '';
      return;
    }
    var fa = global.UI.$('#runs-filter-algo').value;
    var fk = global.UI.$('#runs-filter-k').value;
    var rows = (cmp.runs || []).filter(function (r) {
      if (fa !== 'all' && String(r.algorithm) !== fa) return false;
      if (fk !== 'all' && String(r.k) !== fk) return false;
      return true;
    });
    var CAP = 500;
    var shown = rows.slice(0, CAP);
    note.textContent = rows.length > CAP
      ? '共 ' + rows.length + ' 条，仅显示前 ' + CAP + ' 条'
      : '共 ' + rows.length + ' 条';

    var thead = el('thead');
    var hr = el('tr');
    ['算法', 'k', '种子', 'SSE', 'ARI', '轮廓', '耗时 (ms)', '迭代', '候选评估']
      .forEach(function (h) { hr.appendChild(el('th', null, h)); });
    thead.appendChild(hr);
    tbl.appendChild(thead);
    var tbody = el('tbody');
    shown.forEach(function (r) {
      var tr = el('tr');
      algoCell(tr, r.algorithm);
      tr.appendChild(el('td', null, r.k != null ? r.k : '—'));
      tr.appendChild(el('td', null, r.seed != null ? r.seed : '—'));
      numCell(tr, metricOf(r, 'sse'), false);
      numCell(tr, metricOf(r, 'ari'), false);
      numCell(tr, metricOf(r, 'silhouette'), false);
      numCell(tr, metricOf(r, 'elapsed_ms'), false);
      numCell(tr, metricOf(r, 'iterations'), false);
      numCell(tr, metricOf(r, 'candidate_evaluations'), false);
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
  }

  function renderCompare(cmp) {
    var seeds = cmp.seeds;
    var seedsTxt = Array.isArray(seeds)
      ? seeds.slice(0, 6).join(', ') + (seeds.length > 6 ? ' …' : '')
      : String(seeds != null ? seeds : '—');
    var range = Array.isArray(cmp.k_range) ? cmp.k_range.join('–') : '—';
    global.UI.$('#compare-meta').textContent =
      '数据集：' + (cmp.dataset || '—') +
      ' · 重复 ' + (cmp.repeats != null ? cmp.repeats : '—') + ' 次' +
      ' · k 范围：' + range +
      ' · 种子：' + seedsTxt;
    renderSummaryTable(cmp.summary || []);
    buildRunFilters(cmp.runs || []);
    renderRunsTable();
  }

  global.Panels = {
    renderDatasetSummary: renderDatasetSummary,
    renderMetrics: renderMetrics,
    renderFrame: renderFrame,
    renderClusters: renderClusters,
    renderCompare: renderCompare,
    renderRunsTable: renderRunsTable
  };
})(window);

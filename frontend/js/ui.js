/* ============================================================
 * KMeansLab — 基础 UI 工具（ui.js）
 * DOM 辅助、数字格式化、状态指示、Toast、致命错误横幅、按钮加载态。
 * ============================================================ */
(function (global) {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  /** 数字格式化：null/NaN → '—'；过大过小转科学计数；去尾零。 */
  function fmtNum(v, digits) {
    if (v === null || v === undefined) return '—';
    if (typeof v !== 'number') return String(v);
    if (!isFinite(v)) return '—';
    var d = (digits === undefined) ? 4 : digits;
    var abs = Math.abs(v);
    if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) return v.toExponential(2);
    var s = v.toFixed(d);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  var EVENT_LABELS = {
    initial: '初始化',
    split_selected: '选中分裂',
    split_initial: '初始化子簇',
    iteration: '迭代',
    split_complete: '分裂完成',
    converged: '收敛',
    stopped: '达到迭代上限'
  };
  var ALGO_LABELS = {
    kmeans: 'K-Means',
    kmeans_pp: 'K-Means++',
    bisecting: '二分 K-Means',
    improved: '改进 K-Means',
    b0: '二分 b0',
    b0_pp: '二分 b0++',
    b1: '变体 b1',
    b2: '变体 b2'
  };
  function eventLabel(e) { return EVENT_LABELS[e] || (e || '—'); }
  function algoLabel(a) { return ALGO_LABELS[a] || String(a); }

  /* ---- 状态指示（顶栏 pill）---- */
  function setStatus(state, text) {
    var pill = $('#status-pill');
    if (!pill) return;
    pill.dataset.state = state;
    var t = $('#status-text');
    if (t) t.textContent = text;
  }

  /* ---- 致命错误横幅（初始化失败等不可恢复问题）---- */
  function fatal(message, detail) {
    var box = $('#fatal-banner');
    if (!box) return;
    box.classList.remove('hidden');
    box.textContent = '';
    box.appendChild(el('strong', null, '⚠ ' + message));
    if (detail) box.appendChild(el('span', 'fatal-detail', String(detail)));
  }

  /* ---- Toast ---- */
  var TOAST_ICONS = { info: 'ℹ', success: '✔', error: '✖', warn: '⚠' };
  function toast(kind, message, ms) {
    var wrap = $('#toasts');
    if (!wrap) return;
    var t = el('div', 'toast toast-' + kind);
    t.appendChild(el('span', 'toast-icon', TOAST_ICONS[kind] || 'ℹ'));
    t.appendChild(el('span', 'toast-msg', message));
    wrap.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    var life = ms || (kind === 'error' ? 6000 : 3200);
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 300);
    }, life);
  }

  /* ---- 按钮加载态 ---- */
  function setLoading(btn, loading, loadingText) {
    if (!btn) return;
    if (loading) {
      btn.dataset.label = btn.textContent;
      btn.disabled = true;
      btn.textContent = loadingText || '计算中…';
      btn.classList.add('loading');
    } else {
      btn.disabled = false;
      if (btn.dataset.label) btn.textContent = btn.dataset.label;
      btn.classList.remove('loading');
    }
  }

  global.UI = {
    $: $, $all: $all, el: el, fmtNum: fmtNum,
    setStatus: setStatus, fatal: fatal, toast: toast, setLoading: setLoading,
    eventLabel: eventLabel, algoLabel: algoLabel,
    EVENT_LABELS: EVENT_LABELS, ALGO_LABELS: ALGO_LABELS,
    toastInfo: function (m) { toast('info', m); },
    toastSuccess: function (m) { toast('success', m); },
    toastWarn: function (m) { toast('warn', m); },
    toastError: function (m) { toast('error', m); }
  };
})(window);

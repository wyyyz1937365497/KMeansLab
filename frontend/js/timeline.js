/* ============================================================
 * KMeansLab — 时间轴控制器（timeline.js）
 * 帧序列的步进 / 播放 / 速度 / 拖拽（scrub）/ 跳到下一分裂。
 * 自身不直接操作 DOM 与图表：通过 Bus 发出
 *   'frame'     {frame, index, total}   当前帧变化
 *   'slider'    {index, total}          滑杆/按钮可用性同步
 *   'playstate' boolean                 播放状态
 *   'toast'     {kind, message}
 * ============================================================ */
(function (global) {
  'use strict';

  var BASE_MS = 650;      // 1× 速度下每帧停留时长
  var frames = [];
  var idx = 0;
  var timer = null;
  var speed = 1;
  var playing = false;

  function clamp(i) {
    return Math.max(0, Math.min(frames.length - 1, i));
  }

  function emitFrame() {
    Bus.emit('frame', { frame: frames[idx] || null, index: idx, total: frames.length });
  }

  function syncSlider() {
    Bus.emit('slider', { index: idx, total: frames.length });
  }

  /** 载入新帧序列，重置到第 0 帧并广播。 */
  function load(frs) {
    stop();
    frames = (frs || []).slice();
    idx = 0;
    syncSlider();
    emitFrame();
  }

  function go(i) {
    if (!frames.length) return;
    idx = clamp(i);
    syncSlider();
    emitFrame();
  }

  function current() {
    return { frame: frames[idx] || null, index: idx, total: frames.length };
  }

  function next() { go(idx + 1); }
  function prev() { go(idx - 1); }
  function first() { go(0); }
  function last() { go(frames.length - 1); }

  /** 跳到当前之后的下一个分裂事件帧（split_selected 或 split_complete）。 */
  function nextSplit() {
    if (!frames.length) return;
    for (var j = idx + 1; j < frames.length; j++) {
      var ev = frames[j] && frames[j].event;
      if (ev === 'split_selected' || ev === 'split_complete') { go(j); return; }
    }
    Bus.emit('toast', { kind: 'info', message: '当前步骤之后已没有分裂事件' });
    last();
  }

  function tick() {
    clearInterval(timer);
    var ms = Math.max(60, BASE_MS / speed);
    timer = setInterval(function () {
      if (idx >= frames.length - 1) { stop(); return; }
      go(idx + 1);
    }, ms);
  }

  function play() {
    if (!frames.length || playing) return;
    if (idx >= frames.length - 1) go(0);
    playing = true;
    Bus.emit('playstate', true);
    tick();
  }

  function stop() {
    playing = false;
    if (timer) { clearInterval(timer); timer = null; }
    Bus.emit('playstate', false);
  }

  function pause() { stop(); }
  function toggle() { playing ? pause() : play(); }

  function setSpeed(s) {
    speed = Number(s) || 1;
    if (playing) tick();
  }

  function isPlaying() { return playing; }
  function hasFrames() { return frames.length > 0; }

  global.Timeline = {
    load: load,
    go: go,
    current: current,
    next: next,
    prev: prev,
    first: first,
    last: last,
    nextSplit: nextSplit,
    play: play,
    pause: pause,
    stop: stop,
    toggle: toggle,
    setSpeed: setSpeed,
    isPlaying: isPlaying,
    hasFrames: hasFrames
  };
})(window);

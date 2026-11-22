/* ============================================================
 * KMeansLab — pywebview 桥接层（api.js）
 * 职责：
 *  - 以事件 + 轮询双通道等待后端（pywebviewready，兼容事件先于监听、
 *    api 为 Promise 的旧版、方法延迟注入等情形）；
 *  - 统一调用入口 call(name, ...args)，把 pywebview 的 rejection /
 *    traceback 规整为可读 Error。
 * ============================================================ */
(function (global) {
  'use strict';

  var READY_TIMEOUT_MS = 20000;
  var POLL_MS = 120;
  var resolvedApi = null;

  function hasMethods(api) {
    try {
      if (!api || typeof api !== 'object') return false;
      var o = api;
      while (o && o !== Object.prototype) {
        var names = Object.getOwnPropertyNames(o);
        for (var i = 0; i < names.length; i++) {
          var k = names[i];
          if (k.charAt(0) !== '_' && typeof o[k] === 'function') return true;
        }
        o = Object.getPrototypeOf(o);
      }
      return false;
    } catch (e) { return false; }
  }

  /** 等待后端就绪；Resolve(window.pywebview.api)，Reject(Error)。 */
  function wait(timeoutMs) {
    var limit = timeoutMs || READY_TIMEOUT_MS;
    return new Promise(function (resolve, reject) {
      var done = false;
      var start = Date.now();

      function finish(ok, val) {
        if (done) return;
        done = true;
        if (ok) { resolvedApi = val; resolve(val); }
        else reject(val);
      }

      function attempt() {
        if (done) return;
        var pv = global.pywebview;
        var api = pv && pv.api;
        var next = function () {
          if (done) return;
          if (hasMethods(api)) return finish(true, api);
          if (Date.now() - start > limit) {
            return finish(false, new Error(
              '等待后端（pywebview API）超时。请通过桌面入口启动应用，' +
              '而非直接用浏览器打开本页面。'));
          }
          setTimeout(attempt, POLL_MS);
        };
        if (api && typeof api.then === 'function') {
          // 旧版 pywebview：pywebview.api 是 Promise
          Promise.race([
            api,
            new Promise(function (r) { setTimeout(r, 800); })
          ]).then(function (a) { api = a; next(); }, function () { api = null; next(); });
        } else {
          next();
        }
      }

      attempt();
      global.addEventListener('pywebviewready', attempt, { once: true });
    });
  }

  /** 把 pywebview 的 rejection（字符串 / Error / 对象 / traceback）规整为 Error。 */
  function normalizeError(err, name) {
    var msg;
    if (!err) msg = '未知错误';
    else if (typeof err === 'string') msg = err;
    else if (err instanceof Error) msg = err.message;
    else if (typeof err === 'object') {
      msg = err.message || err.msg || err.error ||
        (function () { try { return JSON.stringify(err); } catch (e) { return String(err); } })();
    } else msg = String(err);
    // pywebview 常回传完整 traceback，取最后一行更有可读性
    if (msg.indexOf('\n') >= 0) {
      var lines = msg.trim().split('\n').filter(function (l) { return l.trim(); });
      msg = lines[lines.length - 1];
    }
    return new Error((name ? name + '：' : '') + msg);
  }

  /** 统一调用入口；后端不可用 / 方法缺失 / 调用失败均抛可读 Error。 */
  function call(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    if (!resolvedApi) throw new Error('后端尚未就绪，无法调用 ' + name);
    var fn = resolvedApi[name];
    if (typeof fn !== 'function') throw new Error('后端缺少方法 ' + name + '（前后端版本不匹配？）');
    try {
      return Promise.resolve(fn.apply(resolvedApi, args)).catch(function (err) {
        throw normalizeError(err, name);
      });
    } catch (err) {
      return Promise.reject(normalizeError(err, name));
    }
  }

  global.Bridge = {
    /** 后端是否已就绪。 */
    ready: function () { return !!resolvedApi; },
    wait: wait,
    call: call,
    /** get_dataset_info 兼容两种签名：字符串 id 或 {id} 对象。 */
    getDatasetInfo: function (id) {
      return call('get_dataset_info', id).catch(function () {
        return call('get_dataset_info', { id: id });
      });
    }
  };
})(window);

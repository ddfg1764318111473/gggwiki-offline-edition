/* Googology Wiki 离线版 —— 分片加载版
 * 资源配置通过相对路径，可直接部署到 GitHub Pages（含 /<repo>/ 子路径）。
 */
(function () {
  'use strict';

  var main = document.getElementById('main');
  var statusEl = document.getElementById('status');
  var q = document.getElementById('q');

  var PAGES = [];          // [{id,t,ns,c}]
  var BY_KEY = {};         // 'page-id' -> meta
  var CHUNKS = {};         // '001' -> Promise<Map<id, html>>
  var TOTAL_CHUNKS = 0;
  var mjLoading = null;

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
  function setStatus(msg) { statusEl.textContent = msg || ''; }
  function keyOf(id) { return id.slice(2); }

  /* ---------- 数据加载 ---------- */

  function loadIndex() {
    return fetch('data/index.json').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) {
      PAGES = d.pages;
      TOTAL_CHUNKS = d.chunks;
      PAGES.forEach(function (p) { BY_KEY[keyOf(p.id)] = p; });
    });
  }

  function loadChunk(name) {
    if (!CHUNKS[name]) {
      CHUNKS[name] = fetch('data/chunks/' + name + '.json')
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (arr) {
          var m = {};
          arr.forEach(function (p) { m[keyOf(p.id)] = p.h; });
          return m;
        })
        .catch(function (e) {
          delete CHUNKS[name];
          throw e;
        });
    }
    return CHUNKS[name];
  }

  function fetchHtml(key) {
    var meta = BY_KEY[key];
    if (!meta) return Promise.reject(new Error('未找到页面：' + key));
    return loadChunk(meta.c).then(function (m) {
      if (m[key] == null) throw new Error('分片 ' + meta.c + ' 中缺少该页面');
      return m[key];
    });
  }

  /* ---------- 视图 ---------- */

  function groups() {
    var g = {};
    PAGES.forEach(function (p) { (g[p.ns] = g[p.ns] || []).push(p); });
    return Object.keys(g).sort(function (a, b) {
      return (a !== '(主)') - (b !== '(主)') || a.localeCompare(b);
    }).map(function (ns) {
      return { ns: ns, items: g[ns].slice().sort(function (a, b) { return a.t.localeCompare(b.t, 'zh'); }) };
    });
  }

  function renderIndex() {
    document.title = 'Googology Wiki 离线版';
    var h = '<h1>Googology Wiki 离线版</h1>'
      + '<p>共 ' + PAGES.length + ' 个页面 · 分片按需加载 · 原站：'
      + '<a href="https://wiki.googology.top" target="_blank" rel="noopener">wiki.googology.top</a></p>'
      + '<div class="toc-box"><strong>提示</strong>：在上方搜索框输入关键词后按 <em>回车</em> 可按标题过滤，'
      + '点「全文搜索」会在所有页面正文中查找（首次运行需下载全部分片）。</div>'
      + '<div id="list">';
    groups().forEach(function (grp) {
      h += '<h2 class="ns">' + esc(grp.ns) + '</h2><ul>';
      grp.items.forEach(function (p) {
        h += '<li class="pg" data-t="' + esc(p.t.toLowerCase()) + '">'
          + '<a href="#page/' + keyOf(p.id) + '">' + esc(p.t) + '</a></li>';
      });
      h += '</ul>';
    });
    h += '</div>';
    main.innerHTML = h;
    setStatus('');
    window.scrollTo(0, 0);
  }

  function filterIndex(term) {
    var v = term.trim().toLowerCase();
    document.querySelectorAll('#list li.pg').forEach(function (li) {
      li.style.display = (!v || li.dataset.t.indexOf(v) >= 0) ? '' : 'none';
    });
    document.querySelectorAll('#list h2.ns').forEach(function (h2) {
      var el = h2.nextElementSibling, any = false;
      if (el && el.tagName === 'UL') {
        any = Array.prototype.some.call(el.children, function (li) { return li.style.display !== 'none'; });
        el.style.display = any ? '' : 'none';
      }
      h2.style.display = any ? '' : 'none';
    });
  }

  var pendingAnchor = null;

  function renderPage(key, anchor) {
    var meta = BY_KEY[key];
    setStatus('加载中…');
    fetchHtml(key).then(function (html) {
      document.title = meta.t + ' - Googology Wiki';
      main.innerHTML = '';
      var nav = document.createElement('div');
      nav.className = 'nav';
      nav.innerHTML = '<a href="#">首页</a> / ' + esc(meta.ns === '(主)' ? '' : meta.ns + '：') + esc(meta.t);
      main.appendChild(nav);

      var box = document.createElement('div');
      box.innerHTML = html;
      main.appendChild(box);

      var foot = document.createElement('p');
      foot.className = 'nav';
      foot.innerHTML = '<hr>离线存档自 <a href="https://wiki.googology.top" target="_blank" rel="noopener">Googology Wiki</a>'
        + ' · 抓取时间 2026-09-29';
      main.appendChild(foot);

      setStatus('');
      var target = anchor || pendingAnchor;
      pendingAnchor = null;
      if (target) {
        var el = document.getElementById(target) || document.getElementsByName(target)[0];
        if (el) { el.scrollIntoView(); return; }
      }
      window.scrollTo(0, 0);

      if (/\\[([]/.test(main.textContent)) ensureMathJax().then(function () {
        if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([main]).catch(function () {});
      });
    }).catch(function (e) {
      setStatus('加载失败：' + e.message);
      main.innerHTML = '<h1>加载失败</h1><p>无法读取页面 <code>' + esc(key) + '</code>：'
        + esc(e.message) + '</p><p><a href="#">返回首页</a></p>';
    });
  }

  function ensureMathJax() {
    if (window.MathJax && MathJax.typesetPromise) return Promise.resolve();
    if (!mjLoading) {
      mjLoading = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = 'assets/vendor/mathjax.js';
        s.onload = resolve;
        s.onerror = function () { reject(new Error('mathjax.js 加载失败')); };
        document.head.appendChild(s);
      });
    }
    return mjLoading;
  }

  /* ---------- 全文搜索 ---------- */

  var fullSearching = false;

  function fullTextSearch(term) {
    if (fullSearching) return;
    fullSearching = true;
    var key = term.trim().toLowerCase();
    var results = [];
    setStatus('全文搜索中… 0/' + TOTAL_CHUNKS);
    var names = [];
    for (var i = 0; i < TOTAL_CHUNKS; i++) names.push(('000' + i).slice(-3));

    var p = Promise.resolve();
    names.forEach(function (name, i) {
      p = p.then(function () {
        return loadChunk(name).then(function (m) {
          Object.keys(m).forEach(function (k) {
            var text = m[k].replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
            var pos = text.toLowerCase().indexOf(key);
            if (pos >= 0) {
              var raw = text.replace(/\s+/g, ' ');
              var at = Math.max(0, raw.toLowerCase().indexOf(key));
              results.push({
                key: k,
                title: (BY_KEY[k] && BY_KEY[k].t) || k,
                snippet: (at > 40 ? '…' : '') + raw.slice(Math.max(0, at - 40), at + 160)
              });
            }
          });
        }).catch(function () {}).then(function () {
          setStatus('全文搜索中… ' + (i + 1) + '/' + TOTAL_CHUNKS);
        });
      });
    });

    p.then(function () {
      fullSearching = false;
      var h = '<h1>全文搜索：' + esc(term) + '</h1>'
        + '<p>命中 ' + results.length + ' 个页面 · <a href="#">返回首页</a></p><ul>';
      results.forEach(function (r) {
        h += '<li><a href="#page/' + esc(r.key) + '">' + esc(r.title) + '</a>'
          + '<div class="snippet">' + highlight(r.snippet, term) + '</div></li>';
      });
      h += '</ul>';
      main.innerHTML = h;
      setStatus('搜索完成，共 ' + results.length + ' 条');
      window.scrollTo(0, 0);
    });
  }

  function highlight(text, term) {
    var lower = text.toLowerCase(), t = term.trim().toLowerCase(), out = '', i = 0;
    if (!t) return esc(text);
    while (true) {
      var p = lower.indexOf(t, i);
      if (p < 0) { out += esc(text.slice(i)); break; }
      out += esc(text.slice(i, p)) + '<mark>' + esc(text.slice(p, p + t.length)) + '</mark>';
      i = p + t.length;
    }
    return out;
  }

  /* ---------- 路由 ---------- */

  function route() {
    var h = location.hash || '';
    if (!h || h === '#' || h === '#index') { renderIndex(); return; }
    if (h.indexOf('#page/') === 0) {
      var rest = h.slice(6);
      var slash = rest.indexOf('#');
      var key = slash >= 0 ? rest.slice(0, slash) : rest;
      var anchor = slash >= 0 ? rest.slice(slash + 1) : null;
      renderPage(key, anchor);
      return;
    }
    if (h.indexOf('#search/') === 0) {
      fullTextSearch(decodeURIComponent(h.slice(8)));
      return;
    }
    // 页面内锚点：记录并在下次渲染后跳转
    pendingAnchor = decodeURIComponent(h.slice(1));
  }

  /* ---------- 启动 ---------- */

  q.addEventListener('input', function () {
    if (document.getElementById('list')) filterIndex(q.value);
  });
  q.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    if (location.hash && location.hash !== '#' && location.hash !== '#index') {
      location.hash = '#';           // 回到首页并过滤
      setTimeout(function () { filterIndex(q.value); }, 0);
    } else {
      filterIndex(q.value);
    }
  });
  document.getElementById('btn-full').addEventListener('click', function () {
    var v = q.value.trim();
    if (!v) { setStatus('请先输入关键词'); q.focus(); return; }
    location.hash = '#search/' + encodeURIComponent(v);
  });
  document.getElementById('btn-random').addEventListener('click', function () {
    if (!PAGES.length) return;
    var p = PAGES[Math.floor(Math.random() * PAGES.length)];
    location.hash = '#page/' + keyOf(p.id);
  });

  window.addEventListener('hashchange', route);

  loadIndex().then(function () {
    route();
  }).catch(function (e) {
    setStatus('索引加载失败：' + e.message);
    main.innerHTML = '<h1>索引加载失败</h1>'
      + '<p>无法读取 <code>data/index.json</code>：' + esc(e.message) + '</p>'
      + '<p>若通过 <code>file://</code> 直接打开本文件，浏览器会拦截跨源请求。'
      + '请用本地服务器（如 <code>python3 -m http.server</code>）或部署到 GitHub Pages 后访问。</p>';
  });
})();

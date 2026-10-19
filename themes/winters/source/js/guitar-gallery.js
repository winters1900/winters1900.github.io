/* 吉他谱专栏：筛选 / 搜索 / 用 PDF.js 懒加载渲染每份谱的第一页缩略图 */
(function () {
  'use strict';

  /* ---------- PDF.js 加载（本地同源优先，CDN 兜底） ---------- */
  var SCRIPT_BASE = (function () {
    var s = document.currentScript;
    return s ? s.src.replace(/[^/]*$/, '') : '/js/';
  })();
  var PDF_SOURCES = [
    { lib: SCRIPT_BASE + 'vendor/pdf.min.js', worker: SCRIPT_BASE + 'vendor/pdf.worker.min.js' },
    {
      lib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
      worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    },
    {
      lib: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
      worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
    }
  ];

  var pdfReady = null;
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.onload = resolve;
      el.onerror = reject;
      document.head.appendChild(el);
    });
  }
  function ensurePdf() {
    if (window.pdfjsLib && window.pdfjsLib.__guitarWorker) return Promise.resolve(window.pdfjsLib);
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_SOURCES[0].worker;
      window.pdfjsLib.__guitarWorker = true;
      return Promise.resolve(window.pdfjsLib);
    }
    if (pdfReady) return pdfReady;
    pdfReady = (function () {
      var chain = Promise.reject();
      PDF_SOURCES.forEach(function (src) {
        chain = chain.catch(function () {
          return loadScript(src.lib).then(function () {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = src.worker;
            window.pdfjsLib.__guitarWorker = true;
            return window.pdfjsLib;
          });
        });
      });
      return chain.catch(function () {
        window.pdfjsLib = null;
        return null;
      });
    })();
    return pdfReady;
  }

  /* ---------- 缩略图渲染 ---------- */
  function renderThumb(link) {
    var frame = link.querySelector('.sheet-thumb-frame');
    var canvas = link.querySelector('.sheet-thumb-canvas');
    if (!frame || !canvas || frame.dataset.rendered) return;
    frame.dataset.rendered = '1';

    ensurePdf().then(function (pdfjsLib) {
      if (!pdfjsLib) return; // 全部 CDN 失败，保留占位图
      var task = pdfjsLib.getDocument({ url: link.dataset.pdf });
      return task.promise.then(function (pdf) {
        return pdf.getPage(1).then(function (page) {
          var base = page.getViewport({ scale: 1 });
          var cssWidth = frame.clientWidth || 300;
          var scale = cssWidth / base.width;
          var viewport = page.getViewport({ scale: scale });
          var dpr = Math.min(window.devicePixelRatio || 1, 2);
          var ctx = canvas.getContext('2d');
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = Math.floor(viewport.width) + 'px';
          canvas.style.height = Math.floor(viewport.height) + 'px';
          var params = { canvasContext: ctx, viewport: viewport };
          if (dpr !== 1) params.transform = [dpr, 0, 0, dpr, 0, 0];
          return page.render(params).promise;
        }).then(function () {
          frame.classList.add('is-ready');
        });
      });
    }).catch(function () {
      // 单个 PDF 失败时静默保留占位图
    });
  }

  /* ---------- 懒加载 + 滚动揭示 ---------- */
  var links = Array.prototype.slice.call(document.querySelectorAll('.sheet-thumb[data-pdf]'));
  var cards = Array.prototype.slice.call(document.querySelectorAll('.sheet-card'));

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var link = entry.target;
        renderThumb(link);
        io.unobserve(link);
      });
    }, { rootMargin: '300px 0px' });
    links.forEach(function (link) { io.observe(link); });

    var reveal = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          reveal.unobserve(entry.target);
        }
      });
    }, { threshold: 0.05 });
    cards.forEach(function (card, i) {
      card.style.transitionDelay = (i % 4) * 60 + 'ms';
      card.classList.add('reveal');
      reveal.observe(card);
    });
  } else {
    links.forEach(renderThumb);
    cards.forEach(function (c) { c.classList.add('visible'); });
  }

  /* ---------- 筛选 + 搜索 ---------- */
  var chips = Array.prototype.slice.call(document.querySelectorAll('.guitar-filters .chip'));
  var input = document.getElementById('guitar-search-input');
  var empty = document.getElementById('guitar-empty');
  var num = document.getElementById('guitar-count-num');
  var activeFilter = 'all';

  function apply() {
    var q = (input && input.value ? input.value : '').trim().toLowerCase();
    var shown = 0;
    cards.forEach(function (card) {
      var okType = activeFilter === 'all' || card.dataset.type === activeFilter;
      var okText = !q || (card.dataset.search || '').toLowerCase().indexOf(q) !== -1;
      var show = okType && okText;
      card.classList.toggle('is-hidden', !show);
      if (show) shown++;
    });
    if (num) num.textContent = shown;
    if (empty) empty.hidden = shown !== 0;
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      chips.forEach(function (c) { c.classList.remove('is-active'); });
      chip.classList.add('is-active');
      activeFilter = chip.dataset.filter;
      apply();
    });
  });
  if (input) input.addEventListener('input', apply);
})();

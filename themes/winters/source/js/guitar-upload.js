/* 吉他谱上传：用 GitHub Git Database API（blob→tree→commit→ref）提交 PDF 与清单，
   支持超过 1MB 的文件（上限 100MB），随后触发博客 Pages 工作流。
   Token 仅保存在浏览器 localStorage。 */
(function () {
  'use strict';

  var script = document.currentScript;
  var cfg = {
    owner: script.dataset.owner,
    sheetRepo: script.dataset.sheetRepo,
    blogRepo: script.dataset.blogRepo,
    branch: script.dataset.branch || 'main',
    workflow: script.dataset.workflow || 'pages.yml'
  };
  var API = 'https://api.github.com';
  var TOKEN_KEY = 'gh_guitar_pat_' + cfg.owner;
  var token = null;
  var login = null;
  var selectedFile = null;

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 工具 ---------- */
  function utf8ToBase64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }
  function base64ToUtf8(b64) {
    var bin = atob(b64.replace(/\n/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result.split(',')[1]); };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
  function today() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function safeName(title) {
    return (title || 'sheet').trim()
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, ' ')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 120) || 'sheet';
  }
  function makeId(title, used) {
    var base = title.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fff-]+/g, '') || 'sheet';
    var id = base, i = 2;
    while (used.has(id)) { id = base + '-' + i; i++; }
    return id;
  }

  function api(path, method, body) {
    var opts = {
      method: method || 'GET',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(API + path, opts).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
        if (!res.ok) {
          var err = new Error((data && data.message) || ('HTTP ' + res.status));
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  /* ---------- PDF.js（用于识别页数，本地同源优先，CDN 兜底） ---------- */
  var SCRIPT_BASE = (function () {
    var s = document.currentScript;
    return s ? s.src.replace(/[^/]*$/, '') : '/js/';
  })();
  var PDF_SOURCES = [
    { lib: SCRIPT_BASE + 'vendor/pdf.min.js', worker: SCRIPT_BASE + 'vendor/pdf.worker.min.js' },
    { lib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js' },
    { lib: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js' }
  ];
  var pdfReady = null;
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement('script');
      el.src = src; el.async = true;
      el.onload = resolve; el.onerror = reject;
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
      PDF_SOURCES.forEach(function (s) {
        chain = chain.catch(function () {
          return loadScript(s.lib).then(function () {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = s.worker;
            return window.pdfjsLib;
          });
        });
      });
      return chain.catch(function () { return null; });
    })();
    return pdfReady;
  }
  function countPages(file) {
    return ensurePdf().then(function (pdfjsLib) {
      if (!pdfjsLib) return null;
      return file.arrayBuffer().then(function (ab) {
        return pdfjsLib.getDocument({ data: ab }).promise;
      }).then(function (pdf) { return pdf.numPages; }).catch(function () { return null; });
    });
  }

  /* ---------- Token 连接状态 ---------- */
  var connStatus = $('conn-status');
  function setConn(state, text) {
    connStatus.dataset.state = state;
    connStatus.querySelector('.text').textContent = text;
  }
  function showConnected() {
    $('gh-user').textContent = login || 'GitHub 用户';
    $('token-form').hidden = true;
    $('token-ok').hidden = false;
    setConn('ok', '已连接 · ' + login);
  }
  function showDisconnected() {
    $('token-form').hidden = false;
    $('token-ok').hidden = true;
    setConn('idle', '尚未连接');
  }
  function saveToken(t) {
    token = t;
    setConn('busy', '验证中…');
    return api('/user').then(function (u) {
      login = u.login;
      try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: token, login: login })); } catch (e) {}
      showConnected();
    }).catch(function (err) {
      token = null; login = null;
      try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
      showDisconnected();
      setConn('error', 'Token 无效或已失效');
      throw err;
    });
  }
  $('token-save').addEventListener('click', function () {
    var v = $('gh-token').value.trim();
    if (!v) { setConn('error', '请先粘贴 Token'); return; }
    $('token-save').disabled = true;
    saveToken(v).catch(function () {}).then(function () { $('token-save').disabled = false; });
  });
  $('token-replace').addEventListener('click', function () {
    token = null; login = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    $('gh-token').value = '';
    showDisconnected();
  });
  $('token-remove').addEventListener('click', function () {
    token = null; login = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    $('gh-token').value = '';
    showDisconnected();
  });
  // 启动时恢复并校验
  (function restore() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); } catch (e) {}
    if (saved && saved.token) {
      token = saved.token;
      setConn('busy', '检查连接…');
      api('/user').then(function (u) {
        login = u.login; showConnected();
      }).catch(function () {
        try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
        token = null; showDisconnected();
      });
    }
  })();

  /* ---------- 文件选择 / 拖拽 ---------- */
  var dropzone = $('dropzone');
  var fileInput = $('pdf-file');
  function setFile(file) {
    if (file && !/\.pdf$/i.test(file.name)) {
      setDropzone('请选择 PDF 文件', '', false);
      return;
    }
    if (file && file.size > 100 * 1024 * 1024) {
      setDropzone('文件超过 100MB 上限', '', false);
      return;
    }
    selectedFile = file;
    if (file) {
      var sizeKB = file.size / 1024;
      var sizeStr = sizeKB > 1024 ? (sizeKB / 1024).toFixed(2) + ' MB' : Math.round(sizeKB) + ' KB';
      setDropzone(file.name, sizeStr, true);
      $('f-pages').value = '';
      $('f-pages').placeholder = '识别中…';
      countPages(file).then(function (n) {
        if (n) $('f-pages').value = n;
        $('f-pages').placeholder = '选择 PDF 后自动识别';
      });
    }
  }
  function setDropzone(main, hint, ok) {
    $('dropzone-text').textContent = main;
    $('dropzone-hint').textContent = hint;
    dropzone.classList.toggle('has-file', !!ok);
  }
  fileInput.addEventListener('change', function () { setFile(fileInput.files[0]); });
  ['dragenter', 'dragover'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.remove('dragover'); });
  });
  dropzone.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  });

  /* ---------- 步骤 / 结果 ---------- */
  var stepsEl = $('steps');
  function setStep(name, state) {
    var li = stepsEl.querySelector('li[data-step="' + name + '"]');
    if (li) li.dataset.state = state;
  }
  function resetSteps() {
    stepsEl.hidden = false;
    stepsEl.querySelectorAll('li').forEach(function (li) { li.dataset.state = 'pending'; });
    $('result').hidden = true;
  }
  function showResult(ok, html) {
    var r = $('result');
    r.hidden = false;
    r.className = 'result ' + (ok ? 'ok' : 'error');
    r.innerHTML = html;
  }

  /* ---------- 提交 ---------- */
  function uniqueFileName(base, existing) {
    var m = base.match(/^(.*?)(\.pdf)$/i);
    var stem = m ? m[1] : base, ext = '.pdf';
    var name = stem + ext, i = 2;
    while (existing.has(name)) { name = stem + ' (' + i + ')' + ext; i++; }
    return name;
  }

  $('upload-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('submit-btn');

    if (!token) {
      showResult(false, '请先在上方填写并保存有效的 GitHub Token。');
      $('token-panel').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    var title = $('f-title').value.trim();
    if (!selectedFile) { showResult(false, '请先选择要上传的 PDF。'); return; }
    if (!title) { showResult(false, '请填写曲目标题。'); return; }

    var pages = parseInt($('f-pages').value, 10);
    if (!pages || pages < 1) pages = 1;

    var tags = $('f-tags').value.split(/[,，、]/).map(function (s) { return s.trim(); }).filter(Boolean);

    var repoPath = 'repos/' + cfg.owner + '/' + cfg.sheetRepo;

    btn.disabled = true;
    btn.textContent = '提交中…';
    resetSteps();

    Promise.resolve().then(function () {
      /* 1. 取 main 最新提交与基础树 */
      setStep('pdf', 'running');
      return api(repoPath + '/git/ref/heads/' + cfg.branch).then(function (ref) {
        var commitSha = ref.object.sha;
        return api(repoPath + '/git/commits/' + commitSha).then(function (commit) {
          return { commitSha: commitSha, baseTree: commit.tree.sha };
        });
      });
    }).then(function (ref) {
      /* 2. 读取现有清单 */
      setStep('manifest', 'running');
      return api(repoPath + '/contents/sheets.json?ref=' + cfg.branch).then(function (mf) {
        var manifest = JSON.parse(base64ToUtf8(mf.content));
        if (!Array.isArray(manifest.sheets)) manifest.sheets = [];

        var existingFiles = new Set(manifest.sheets.map(function (s) { return s.file; }));
        var existingIds = new Set(manifest.sheets.map(function (s) { return s.id; }));
        var fileName = uniqueFileName(safeName(title), existingFiles);

        var entry = {
          id: makeId(title, existingIds),
          title: title,
          work: $('f-work').value.trim(),
          tabber: $('f-tabber').value.trim(),
          type: $('f-type').value,
          tuning: $('f-tuning').value.trim(),
          capo: $('f-capo').value,
          tempo: $('f-tempo').value.trim(),
          pages: pages,
          tags: tags,
          file: fileName,
          note: $('f-note').value.trim(),
          createdAt: today()
        };
        manifest.sheets.push(entry);
        manifest.updated = today();
        return { ref: ref, manifest: manifest, entry: entry };
      });
    }).then(function (ctx) {
      /* 3. 建两个 blob：PDF + 清单 */
      return fileToBase64(selectedFile).then(function (pdfB64) {
        var pdfBlob = api(repoPath + '/git/blobs', 'POST', { content: pdfB64, encoding: 'base64' });
        var jsonBlob = api(repoPath + '/git/blobs', 'POST', { content: utf8ToBase64(JSON.stringify(ctx.manifest, null, 2)), encoding: 'base64' });
        return Promise.all([pdfBlob, jsonBlob]).then(function (shas) {
          ctx.pdfSha = shas[0].sha; ctx.jsonSha = shas[1].sha;
          return ctx;
        });
      });
    }).then(function (ctx) {
      /* 4. 建树、提交、更新 ref（一次原子提交） */
      var tree = {
        base_tree: ctx.ref.baseTree,
        tree: [
          { path: ctx.entry.file, mode: '100644', type: 'blob', sha: ctx.pdfSha },
          { path: 'sheets.json', mode: '100644', type: 'blob', sha: ctx.jsonSha }
        ]
      };
      return api(repoPath + '/git/trees', 'POST', tree).then(function (t) {
        return api(repoPath + '/git/commits', 'POST', {
          message: 'add sheet: ' + title,
          tree: t.sha,
          parents: [ctx.ref.commitSha]
        }).then(function (c) {
          return api(repoPath + '/git/refs/heads/' + cfg.branch, 'PATCH', { sha: c.sha, force: false });
        }).then(function () { return ctx; });
      });
    }).then(function (ctx) {
      setStep('pdf', 'done');
      setStep('manifest', 'done');

      /* 5. 触发博客发布 */
      var publish = $('f-publish').checked;
      if (!publish) {
        setStep('publish', 'skipped');
        return { ctx: ctx, published: false };
      }
      setStep('publish', 'running');
      var blogPath = 'repos/' + cfg.owner + '/' + cfg.blogRepo;
      return api(blogPath + '/actions/workflows/' + cfg.workflow + '/dispatches', 'POST', { ref: cfg.branch })
        .then(function () {
          setStep('publish', 'done');
          return { ctx: ctx, published: true };
        })
        .catch(function (err) {
          setStep('publish', 'error');
          return { ctx: ctx, published: false, dispatchError: err };
        });
    }).then(function (out) {
      var ctx = out.ctx;
      var fileUrl = 'https://github.com/' + cfg.owner + '/' + cfg.sheetRepo + '/blob/' + cfg.branch + '/' + encodeURIComponent(ctx.entry.file);
      var actionsUrl = 'https://github.com/' + cfg.owner + '/' + cfg.blogRepo + '/actions';
      var html = ''
        + '<h3>提交成功</h3>'
        + '<p>《<strong>' + ctx.entry.title + '</strong>》已提交到谱库仓库（<code>' + ctx.entry.file + '</code>，' + ctx.entry.pages + ' 页）。</p>';
      if (out.published) {
        html += '<p>已触发博客重新发布，约 1–2 分钟后会出现在 <a href="/guitar/">吉他谱专栏</a>。</p>';
      } else {
        html += '<p>未自动触发博客发布，可前往 <a href="' + actionsUrl + '" target="_blank" rel="noopener">博客 Actions</a> 手动运行一次工作流，或等下次推送时发布。</p>';
      }
      html += '<p class="result-links"><a href="' + fileUrl + '" target="_blank" rel="noopener">查看仓库中的 PDF ↗</a><a href="/guitar/">返回专栏 →</a></p>';
      showResult(true, html);
      btn.disabled = false;
      btn.textContent = '再次上传';
      $('upload-form').reset();
      selectedFile = null;
      setDropzone('点击选择，或把 PDF 拖到这里', '支持 PDF，单文件最大 100 MB', false);
    }).catch(function (err) {
      ['pdf', 'manifest'].forEach(function (s) {
        if (stepsEl.querySelector('li[data-step="' + s + '"]').dataset.state === 'running') setStep(s, 'error');
      });
      var detail = (err && err.status) ? ('（HTTP ' + err.status + '：' + (err.message || '') + '）') : '';
      var hint = err && err.status === 401
        ? 'Token 无效或已过期，请更换 Token。'
        : err && err.status === 403
          ? 'Token 权限不足：确认谱库 Contents 可写、博客 Actions 可写。'
          : '提交失败，请检查网络或 Token 权限后重试。';
      showResult(false, hint + ' ' + detail);
      btn.disabled = false;
      btn.textContent = '提交吉他谱';
    });
  });
})();

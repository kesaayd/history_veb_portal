/* Локальное хранилище заявок (IndexedDB в браузере). Подключается в <head> всех страниц. */
(function () {
  var DB = 'school-archive', STORE = 'submissions';
  function open() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE, { keyPath: 'id' }); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(STORE, mode), out = fn(t.objectStore(STORE));
        t.oncomplete = function () { res(out && out.result !== undefined ? out.result : undefined); db.close(); };
        t.onerror = t.onabort = function () { rej(t.error); db.close(); };
      });
    });
  }
  window.ArchiveStore = {
    add: function (rec) { return tx('readwrite', function (s) { return s.put(rec); }); },
    all: function () { return tx('readonly', function (s) { return s.getAll(); }); },
    remove: function (id) { return tx('readwrite', function (s) { return s.delete(id); }); },
    clear: function () { return tx('readwrite', function (s) { return s.clear(); }); }
  };

  function labelOf(form, c) {
    if (c.type === 'file') return 'Файлы';
    if (c.type === 'checkbox') return 'Согласие на публикацию';
    var lb = c.id && form.querySelector('label[for="' + c.id + '"]');
    if (!lb) { var p = c.previousElementSibling; if (p && p.tagName === 'LABEL') lb = p; }
    var n = lb ? lb.textContent : (c.getAttribute('placeholder') || c.name || 'Поле');
    return n.replace(/[*:]/g, '').replace(/\s+/g, ' ').trim();
  }
  function say(form, ok, html) {
    var st = form.querySelector('.archive-status');
    if (!st) { st = document.createElement('div'); st.className = 'archive-status'; st.setAttribute('role', 'status'); form.appendChild(st); }
    st.style.cssText = 'margin-top:14px;padding:12px 14px;border-radius:8px;font:500 15px/1.45 "Source Serif 4",serif;' +
      (ok ? 'background:#c9ead9;color:#022016' : 'background:#ffdad6;color:#410002');
    st.innerHTML = html;
    try { st.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // Перехватываем отправку до остальных обработчиков страницы.
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || form.id !== 'submission-form') return;
    e.preventDefault(); e.stopImmediatePropagation();
    var btn = form.querySelector('button[type=submit]');
    var fields = {}, used = {};
    Array.prototype.forEach.call(form.querySelectorAll('input,select,textarea'), function (c) {
      if (c.type === 'hidden' || c.type === 'submit' || c.type === 'button' || c.type === 'file') return;
      var n = labelOf(form, c); used[n] = (used[n] || 0) + 1; if (used[n] > 1) n += ' ' + used[n];
      fields[n] = c.type === 'checkbox' ? (c.checked ? 'Да' : 'Нет') : c.tagName === 'SELECT' ? (c.value ? c.options[c.selectedIndex].text : '') : c.value;
    });
    var files = [];
    Array.prototype.forEach.call(form.querySelectorAll('input[type=file]'), function (c) {
      Array.prototype.forEach.call(c.files || [], function (f) { files.push({ name: f.name, type: f.type, size: f.size, blob: f }); });
    });
    var rec = { id: uid(), date: new Date().toISOString(), page: location.pathname.split('/').pop() || 'index.html', fields: fields, files: files };
    if (btn) btn.disabled = true;
    window.ArchiveStore.add(rec).then(function () {
      form.reset();
      Array.prototype.forEach.call(form.querySelectorAll('#file-list-preview'), function (x) { x.classList.add('hidden'); });
      say(form, true, 'Спасибо! Материал сохранён в архив' + (files.length ? ' (файлов: ' + files.length + ')' : '') +
        '. <a href="submissions.html" style="color:#6c0c20;font-weight:700;text-decoration:underline">Открыть список сохранённых</a>');
      var modal = document.getElementById('add-material-modal');
      if (modal && !modal.classList.contains('hidden')) { /* оставляем окно открытым, чтобы было видно подтверждение */ }
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (x) {}
    }).catch(function (err) {
      say(form, false, 'Не удалось сохранить: ' + (err && err.message ? err.message : 'ошибка хранилища') + '. Возможно, в браузере отключено хранение данных (приватный режим) или нет места.');
    }).then(function () { if (btn) btn.disabled = false; });
  }, true);

  // Перетаскивание файлов: кладём их в input, чтобы они попали в заявку на всех страницах.
  document.addEventListener('drop', function (e) {
    var z = e.target.closest && e.target.closest('#drop-zone');
    if (!z) return;
    var inp = document.getElementById('file-input');
    if (inp && e.dataTransfer && e.dataTransfer.files.length) { try { inp.files = e.dataTransfer.files; } catch (x) {} }
  }, true);

  // Ссылка на просмотр сохранённых заявок в подвале
  document.addEventListener('DOMContentLoaded', function () {
    var f = document.querySelector('footer');
    if (!f || f.querySelector('.archive-link')) return;
    var a = document.createElement('a'); a.href = 'submissions.html'; a.className = 'archive-link';
    a.textContent = 'Сохранённые заявки'; a.style.cssText = 'display:inline-block;margin-top:12px;font-size:13px;opacity:.75;text-decoration:underline';
    (f.firstElementChild || f).appendChild(a);
  });
})();

/* Мобильная шапка: прячется при прокрутке вниз, возвращается при прокрутке вверх или по кнопке-язычку */
(function () {
  var css = document.createElement('style');
  css.textContent = '@media (max-width:767px){header.fixed{transition:transform .28s ease}header.hdr-hidden{transform:translateY(-100%);box-shadow:none}' +
    '.hdr-tab{display:none}.hdr-tab.show{display:flex}.hdr-tab{position:fixed;top:0;right:12px;z-index:49;width:44px;height:28px;align-items:center;justify-content:center;border:0;border-radius:0 0 12px 12px;background:rgba(108,12,32,.92);color:#fff;font:700 16px/1 Arial,sans-serif;cursor:pointer;padding:0;box-shadow:0 2px 8px rgba(0,0,0,.2)}}' +
    '@media (min-width:768px){.hdr-tab{display:none!important}}';
  document.head.appendChild(css);
  document.addEventListener('DOMContentLoaded', function () {
    var h = document.querySelector('header.fixed'); if (!h) return;
    var mq = window.matchMedia('(max-width:767px)');
    var tab = document.createElement('button'); tab.type = 'button'; tab.className = 'hdr-tab';
    tab.setAttribute('aria-label', 'Показать меню'); tab.textContent = '▾'; document.body.appendChild(tab);
    var last = window.pageYOffset, ticking = false;
    function menuOpen() { var m = document.getElementById('mobile-menu'); return m && !m.classList.contains('hidden'); }
    function hide() { h.classList.add('hdr-hidden'); tab.classList.add('show'); }
    function show() { h.classList.remove('hdr-hidden'); tab.classList.remove('show'); }
    function update() {
      ticking = false;
      var y = Math.max(0, window.pageYOffset), d = y - last;
      if (!mq.matches || menuOpen() || y < 80) { show(); }
      else if (d > 8) hide();
      else if (d < -8) show();
      if (Math.abs(d) > 8 || y < 80) last = y;
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    tab.addEventListener('click', function () { show(); last = window.pageYOffset; });
    h.addEventListener('focusin', show);
    mq.addEventListener && mq.addEventListener('change', show);
  });
})();

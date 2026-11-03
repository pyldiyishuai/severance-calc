/* ==========================================================================
 * app.js — 入口：串联各层（离职补偿金计算器）
 * ========================================================================== */

var APP = window.APP || {};
window.APP = APP;

(function () {
  'use strict';

  var F, Form, Result;
  var timer = null;
  var firstCalcDone = false;
  var LAST_KEY = ((APP.CONST && APP.CONST.STORAGE_PREFIX) || 'app_') + 'last_input';

  /* ======================================================================
   * 启动
   * ==================================================================== */

  function boot() {
    F = APP.UI.Format;
    Form = APP.UI.Form;
    Result = APP.UI.Result;

    Form.init();          // 渲染情形卡片、城市下拉、默认日期
    renderFaq();
    injectFaqSchema();
    setYear();

    bindForm();
    bindMisc();

    restoreInput();
    Form.updateHints();
    recalc(true);

    if (APP.Analytics) APP.Analytics.pageView();

    // 远程社平工资（预留，失败静默降级）
    if (APP.Api && APP.Api.isEnabled && APP.Api.isEnabled()) {
      try {
        APP.Api.request('cityWage').then(function (data) {
          if (data && data.list) {
            APP.DATA.cityAverageWage = data.list;
            Form.init();
            recalc(true);
          }
        }).catch(function () {});
      } catch (e) { /* 接口未启用 */ }
    }
  }

  /* ======================================================================
   * 计算调度
   * ==================================================================== */

  function recalc(immediate) {
    var run = function () {
      timer = null;
      try {
        var values = Form.getValues();
        var result = APP.Core.Compensation.buildResult(values);
        Result.renderAll(result);
        saveInput(values);

        if (APP.Analytics) APP.Analytics.trackCalc(result);

        if (!firstCalcDone) {
          firstCalcDone = true;
          setTimeout(function () {
            if (APP.Ads) APP.Ads.showAfterCalc();
          }, 600);
        }
      } catch (err) {
        console.error('[calc]', err);
      }
    };

    if (immediate || (APP.DEBUG && APP.DEBUG.noDebounce)) {
      if (timer) clearTimeout(timer);
      run();
      return;
    }
    // setTimeout 而非 rAF：后台标签页/headless 下 rAF 会被节流
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, 16);
  }

  /* ======================================================================
   * 事件
   * ==================================================================== */

  function bindForm() {
    Form.bind(function () {
      Form.updateHints();
      recalc(false);
    });

    var form = document.getElementById('form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        recalc(true);
        scrollToResult();
      });
    }

    var btnCalc = document.getElementById('btnCalc');
    if (btnCalc) {
      btnCalc.addEventListener('click', function () {
        btnCalc.classList.add('is-loading');
        setTimeout(function () {
          btnCalc.classList.remove('is-loading');
          scrollToResult();
        }, 420);
      });
    }

    var btnReset = document.getElementById('btnReset');
    if (btnReset) {
      btnReset.addEventListener('click', function () {
        Form.reset();
        recalc(true);
      });
    }
  }

  function bindMisc() {
    var backtop = document.getElementById('backtop');
    if (backtop) {
      backtop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    bindDockbar();
    bindScroll();

    var btnLogin = document.getElementById('btnLogin');
    if (btnLogin && APP.Auth && APP.Auth.isEnabled()) {
      btnLogin.classList.remove('is-hidden');
      btnLogin.addEventListener('click', function () {
        APP.Auth.login().catch(function () {});
      });
    }

    document.querySelectorAll('[data-action="feedback"]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        alert('有问题或算得不对？把情况发到 ' + (APP.SITE.contactEmail || '邮箱') +
              '，我们会对照法条核对。');
      });
    });

    if (APP.SITE && APP.SITE.icp) {
      var copy = document.querySelector('.footer__copy');
      if (copy) {
        copy.insertAdjacentHTML('beforeend',
          ' · <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener nofollow" ' +
          'style="color:inherit">' + APP.SITE.icp + '</a>');
      }
    }
  }

  /* ---------- 悬浮条 ---------- */
  var resultVisible = false;

  function bindDockbar() {
    var dock = document.getElementById('dockbar');
    var jump = document.getElementById('dockJump');
    var resultEl = document.getElementById('result');
    if (!dock) return;

    if (jump && resultEl) {
      jump.addEventListener('click', function () {
        resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (APP.Analytics) APP.Analytics.track('dock_jump', {});
      });
    }

    if ('IntersectionObserver' in window && resultEl) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          resultVisible = en.isIntersecting;
          updateDockbar();
        });
      }, { threshold: 0.12 }).observe(resultEl);
    }
  }

  function updateDockbar() {
    var dock = document.getElementById('dockbar');
    if (!dock) return;
    dock.hidden = !(window.scrollY > 420 && !resultVisible);
  }

  function bindScroll() {
    var backtop = document.getElementById('backtop');
    var onScroll = function () {
      if (backtop) backtop.hidden = window.scrollY < 480;
      updateDockbar();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();
  }

  function scrollToResult() {
    var el = document.getElementById('result');
    if (el && window.innerWidth < 1024) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /* ======================================================================
   * FAQ + 结构化数据
   * ==================================================================== */

  function renderFaq() {
    var list = document.getElementById('faqList');
    var data = (APP.DATA && APP.DATA.faq) || [];
    if (!list) return;
    list.innerHTML = data.map(function (item, i) {
      return '' +
        '<details class="faq__item"' + (i === 0 ? ' open' : '') + '>' +
          '<summary class="faq__q">' + item.q + '</summary>' +
          '<div class="faq__a">' + item.a + '</div>' +
        '</details>';
    }).join('');
  }

  function injectFaqSchema() {
    var data = (APP.DATA && APP.DATA.faq) || [];
    if (!data.length) return;
    var schema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: data.map(function (item) {
        return {
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a.replace(/<[^>]+>/g, '') }
        };
      })
    };
    var s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = JSON.stringify(schema);
    document.head.appendChild(s);
  }

  /* ======================================================================
   * 持久化
   * ==================================================================== */

  function saveInput(values) {
    try { localStorage.setItem(LAST_KEY, JSON.stringify(values)); } catch (e) {}
  }

  function restoreInput() {
    var fromUrl = readUrlParams();
    if (fromUrl) { applyValues(fromUrl); return; }
    try {
      var raw = localStorage.getItem(LAST_KEY);
      if (!raw) return;
      var v = JSON.parse(raw);
      if (v && typeof v === 'object') applyValues(v);
    } catch (e) {}
  }

  function applyValues(v) {
    if (v.startDate && document.getElementById('startDate')) {
      document.getElementById('startDate').value = v.startDate;
    }
    if (v.endDate && document.getElementById('endDate')) {
      document.getElementById('endDate').value = v.endDate;
    }
    if (v.avgWage !== undefined) Form.setValue('avgWage', v.avgWage);
    if (v.cityWage !== undefined) Form.setValue('cityWage', v.cityWage);
    if (v.unusedLeave !== undefined) Form.setValue('unusedLeave', v.unusedLeave);
    if (v.noticed30 !== undefined) {
      var cb = document.getElementById('noticed30');
      if (cb) cb.checked = !!v.noticed30;
    }
    if (v.scenarioId) {
      Form.state.scenarioId = v.scenarioId;
      Form.syncScenario();
    }
    Form.updateHints();
  }

  /**
   * 分享链接参数：
   * ?start=2021-03-01&end=2025-01-10&wage=10000&scenario=mutual-employer&notice=0&leave=0&citywage=11761
   */
  function readUrlParams() {
    var q = location.search.replace(/^\?/, '');
    if (!q) return null;
    var out = {}, has = false;

    q.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv.length !== 2) return;
      var k = decodeURIComponent(kv[0]);
      var val = decodeURIComponent(kv[1]);
      switch (k) {
        case 'start': out.startDate = val; has = true; break;
        case 'end': out.endDate = val; has = true; break;
        case 'wage': out.avgWage = parseFloat(val); has = true; break;
        case 'citywage': out.cityWage = parseFloat(val); has = true; break;
        case 'leave': out.unusedLeave = parseFloat(val); has = true; break;
        case 'notice': out.noticed30 = val === '1' || val === 'true'; has = true; break;
        case 'scenario': out.scenarioId = val; has = true; break;
      }
    });
    return has ? out : null;
  }

  function setYear() {
    var el = document.getElementById('year');
    if (el) el.textContent = String(new Date().getFullYear());
  }

  /* ---------- 启动 ---------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

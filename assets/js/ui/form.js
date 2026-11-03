/* ==========================================================================
 * ui/form.js — 表单读写 / 情形选择渲染 / 联动
 * --------------------------------------------------------------------------
 * 与房贷版的差异：
 *   1. 输入项从 6 个变成「日期 + 工资 + 情形 + 勾选」
 *   2. 情形卡片数量多（14 个），需要分组 + 折叠 + 角标（显示 N / N+1 / 2N）
 *   3. 工作年限是「派生值」，实时展示在输入区，让用户边填边有反馈
 * ========================================================================== */

var APP = window.APP || {};
window.APP = APP;

APP.UI = APP.UI || {};

(function (UI) {
  'use strict';

  var FIELDS = {
    avgWage:    { min: 1,   max: 10000000, slider: 'avgWageRange', money: true },
    cityWage:   { min: 0,   max: 1000000,  money: true },
    unusedLeave:{ min: 0,   max: 60 }
  };

  /* 主区展示的高频情形（其余折叠） */
  var PRIMARY_IDS = [
    'mutual-employer',
    'illegal-termination',
    'contract-end-no-renew',
    'incompetent',
    'resign'
  ];

  var state = {
    scenarioId: 'mutual-employer'
  };

  /* ======================================================================
   * 一、格式化工具
   * ==================================================================== */

  function stripMoney(s) { return String(s == null ? '' : s).replace(/[^\d]/g, ''); }

  function groupThousands(s) {
    if (s === '' || s == null) return '';
    return String(s).replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function readNum(id) {
    var el = document.getElementById(id);
    if (!el) return 0;
    var v = parseFloat(String(el.value == null ? '' : el.value).replace(/[,，\s]/g, ''));
    return isFinite(v) ? v : 0;
  }

  function clamp(v, cfg) {
    if (!isFinite(v)) return cfg.min;
    return Math.min(Math.max(v, cfg.min), cfg.max);
  }

  /** 今天（YYYY-MM-DD） */
  function todayStr() {
    var d = new Date();
    var p = function (x) { return String(x).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* ======================================================================
   * 二、情景卡片渲染
   * ==================================================================== */

  /** 倍数角标文案 */
  function multipleBadge(s) {
    if (!s) return { cls: 'zero', text: '无补偿' };
    if (s.multiple === 2) return { cls: 'n2', text: '2N' };
    if (s.multiple === 0) return { cls: 'zero', text: '无补偿' };
    if (s.plusOne) return { cls: 'np1', text: 'N+1' };
    return { cls: 'n', text: 'N' };
  }

  function renderScenarioCard(s) {
    var b = multipleBadge(s);
    return '' +
      '<button type="button" class="option-card' + (state.scenarioId === s.id ? ' is-active' : '') + '"' +
              ' data-name="scenario" data-value="' + s.id + '" role="radio"' +
              ' aria-checked="' + (state.scenarioId === s.id) + '">' +
        '<span class="option-card__title">' + s.label + '</span>' +
        '<span class="option-card__desc">' + s.desc + '</span>' +
        '<span class="option-card__multiple option-card__multiple--' + b.cls + '">' + b.text + '</span>' +
      '</button>';
  }

  function renderScenarios() {
    var list = (APP.DATA && APP.DATA.scenarios) || [];
    var groups = (APP.DATA && APP.DATA.scenarioGroups) || [];

    var primary = [], rest = [];
    list.forEach(function (s) {
      if (PRIMARY_IDS.indexOf(s.id) > -1) primary.push(s);
      else rest.push(s);
    });
    // 主区按 PRIMARY_IDS 顺序排
    primary.sort(function (a, b) {
      return PRIMARY_IDS.indexOf(a.id) - PRIMARY_IDS.indexOf(b.id);
    });

    var box = document.getElementById('scenarioList');
    if (box) box.innerHTML = primary.map(renderScenarioCard).join('');

    var boxMore = document.getElementById('scenarioListMore');
    if (boxMore) {
      // 折叠区按「分组」渲染，带分组标题
      var html = '';
      groups.forEach(function (g) {
        var items = rest.filter(function (s) { return s.group === g.id; });
        if (!items.length) return;
        html += '<div class="option-group">' +
          '<div class="option-group__title">' + g.label +
            (g.hint ? ' <em>' + g.hint + '</em>' : '') +
          '</div>' +
          items.map(renderScenarioCard).join('') +
        '</div>';
      });
      boxMore.innerHTML = html;
    }
  }

  /* ======================================================================
   * 三、读取
   * ==================================================================== */

  function getValues() {
    var endEl = document.getElementById('endDate');
    var endDate = endEl && endEl.value ? endEl.value : todayStr();

    return {
      startDate: (document.getElementById('startDate') || {}).value || '',
      endDate: endDate,
      avgWage: clamp(readNum('avgWage'), FIELDS.avgWage),
      scenarioId: state.scenarioId,
      noticed30: !!(document.getElementById('noticed30') || {}).checked,
      unusedLeave: clamp(Math.round(readNum('unusedLeave')), FIELDS.unusedLeave),
      cityWage: clamp(readNum('cityWage'), FIELDS.cityWage)
    };
  }

  /* ======================================================================
   * 四、写入
   * ==================================================================== */

  function setValue(id, value, silent) {
    var el = document.getElementById(id);
    if (!el) return;
    var cfg = FIELDS[id] || {};

    el.value = cfg.money
      ? groupThousands(String(Math.round(Number(value) || 0)))
      : value;

    if (cfg.slider) {
      var s = document.getElementById(cfg.slider);
      if (s) {
        s.value = Math.min(Math.max(Number(value) || 0, Number(s.min)), Number(s.max));
        paintSlider(s);
      }
    }
    if (!silent) syncQuickpicks(id, value);
  }

  function reset() {
    setValue('avgWage', 10000);
    setValue('cityWage', 11761);
    setValue('unusedLeave', 0);
    document.getElementById('startDate').value = '2021-03-01';
    document.getElementById('endDate').value = todayStr();
    document.getElementById('noticed30').checked = false;
    var pick = document.getElementById('cityPick');
    if (pick) pick.value = '北京';
    state.scenarioId = 'mutual-employer';
    renderScenarios();
    updateHints();
  }

  /* ======================================================================
   * 五、联动
   * ==================================================================== */

  function paintSlider(el) {
    if (!el) return;
    var min = Number(el.min) || 0, max = Number(el.max) || 100, val = Number(el.value) || 0;
    var p = max > min ? ((val - min) / (max - min)) * 100 : 0;
    el.style.setProperty('--fill', p + '%');
  }

  function syncQuickpicks(id, value) {
    var box = document.querySelector('[data-quickpick="' + id + '"]');
    if (!box) return;
    var nv = Number(value);
    box.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('is-active', Number(b.dataset.value) === nv);
    });
  }

  function syncScenario() {
    document.querySelectorAll('.option-card[data-name="scenario"]').forEach(function (b) {
      var on = b.dataset.value === state.scenarioId;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  function formatMoneyInput(el) {
    var caretFromEnd = el.value.length - (el.selectionStart || 0);
    var formatted = groupThousands(stripMoney(el.value));
    if (formatted === el.value) return;
    el.value = formatted;
    var pos = Math.max(formatted.length - caretFromEnd, 0);
    try { el.setSelectionRange(pos, pos); } catch (e) {}
  }

  /* ======================================================================
   * 六、提示与派生展示
   * ==================================================================== */

  function updateHints() {
    var v = getValues();
    var F = UI.Format;
    var S = APP.Core.Service;

    /* ---- 工作年限展示条（边填边看） ---- */
    var start = S.parseDate(v.startDate);
    var end = S.parseDate(v.endDate);
    var tenureText = document.getElementById('tenureText');
    var tenureN = document.getElementById('tenureN');

    if (start && end && end >= start) {
      var p = S.servicePeriod(start, end);
      var n = S.compensationMonths(start, end);
      if (tenureText) tenureText.textContent = S.formatPeriod(p);
      if (tenureN) tenureN.textContent = String(n);
    } else {
      if (tenureText) tenureText.textContent = '日期有误';
      if (tenureN) tenureN.textContent = '—';
    }

    /* ---- 离职日期提示 ---- */
    var hintEnd = document.querySelector('[data-hint="endDate"]');
    if (hintEnd) {
      var days = (start && end) ? S.diffDays(start, end) : 0;
      hintEnd.textContent = days > 0 ? '共 ' + days + ' 天' : '';
    }

    /* ---- 年假参考 ---- */
    var leaveHint = document.querySelector('[data-hint="leave"]');
    if (leaveHint && start && end && end >= start) {
      var p2 = S.servicePeriod(start, end);
      var ref = S.proratedLeave(start, end, p2.years);
      leaveHint.textContent = ref.full
        ? '按工龄全年 ' + ref.full + ' 天，今年在职折算约 ' + ref.prorated + ' 天'
        : '不满 1 年暂无年假';
    }

    /* ---- 社平工资三倍提示 ---- */
    var tip = document.getElementById('cityTip');
    if (tip) {
      var cap = v.cityWage * 3;
      if (v.cityWage <= 0) {
        tip.textContent = '填写 0 表示不考虑封顶（一般不建议）';
      } else if (v.avgWage > cap) {
        tip.innerHTML = '⚠️ 你的月薪已超过 3 倍社平（' + F.int(cap) + ' 元），补偿基数会按 ' +
                        F.int(cap) + ' 元封顶，且年限最多算 12 年。';
        tip.style.color = 'var(--danger)';
      } else {
        tip.textContent = '3 倍社平 = ' + F.int(cap) + ' 元，你的月薪未超过，不封顶。';
        tip.style.color = '';
      }
    }
  }

  /* ======================================================================
   * 七、事件绑定
   * ==================================================================== */

  function bind(onChange) {
    // ---- 金额输入 ----
    Object.keys(FIELDS).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var cfg = FIELDS[id];

      el.addEventListener('input', function () {
        if (cfg.money) formatMoneyInput(el);
        var s = cfg.slider ? document.getElementById(cfg.slider) : null;
        if (s) {
          var sv = Math.min(Math.max(readNum(id), Number(s.min)), Number(s.max));
          s.value = sv;
          paintSlider(s);
        }
        onChange();
      });

      el.addEventListener('blur', function () {
        var v = clamp(readNum(id), cfg);
        setValue(id, v);
        onChange();
      });
    });

    // ---- 滑块 ----
    Object.keys(FIELDS).forEach(function (id) {
      var cfg = FIELDS[id];
      if (!cfg.slider) return;
      var s = document.getElementById(cfg.slider);
      if (!s) return;
      paintSlider(s);
      s.addEventListener('input', function () {
        var el = document.getElementById(id);
        if (el) el.value = cfg.money ? groupThousands(s.value) : s.value;
        syncQuickpicks(id, s.value);
        paintSlider(s);
        onChange();
      });
    });

    // ---- 快捷按钮 ----
    document.querySelectorAll('[data-quickpick]').forEach(function (box) {
      var id = box.dataset.quickpick;
      box.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-value]');
        if (!btn) return;
        setValue(id, btn.dataset.value);
        onChange();
      });
    });

    // ---- 日期 ----
    ['startDate', 'endDate'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', onChange);
    });

    // ---- 情形卡片（事件委托，覆盖主区和折叠区） ----
    document.addEventListener('click', function (e) {
      var card = e.target.closest('.option-card[data-name="scenario"]');
      if (!card) return;
      state.scenarioId = card.dataset.value;
      syncScenario();
      if (APP.Analytics) {
        APP.Analytics.track('scenario_change', { scenario: state.scenarioId });
      }
      onChange();
    });

    // ---- 勾选 ----
    var noticed = document.getElementById('noticed30');
    if (noticed) noticed.addEventListener('change', onChange);

    // ---- 城市下拉 → 自动填社平工资 ----
    var pick = document.getElementById('cityPick');
    if (pick) {
      pick.addEventListener('change', function () {
        var list = (APP.DATA && APP.DATA.cityAverageWage) || [];
        var found = null;
        for (var i = 0; i < list.length; i++) {
          if (list[i].city === pick.value) { found = list[i]; break; }
        }
        if (found && found.wage > 0) setValue('cityWage', found.wage);
        onChange();
      });
    }
  }

  /** 渲染城市下拉 */
  function renderCityPicker() {
    var pick = document.getElementById('cityPick');
    var list = (APP.DATA && APP.DATA.cityAverageWage) || [];
    if (!pick || !list.length) return;
    pick.innerHTML = list.map(function (c) {
      return '<option value="' + c.city + '">' + c.city +
             (c.wage ? '（' + c.wage + ' 元）' : '') + '</option>';
    }).join('');
    pick.value = '北京';
  }

  /* ======================================================================
   * 八、初始化
   * ==================================================================== */

  function init() {
    renderScenarios();
    renderCityPicker();
    // 默认离职日期 = 今天
    var end = document.getElementById('endDate');
    if (end && !end.value) end.value = todayStr();
  }

  /* ---------- 对外 ---------- */
  UI.Form = {
    init: init,
    getValues: getValues,
    setValue: setValue,
    reset: reset,
    bind: bind,
    updateHints: updateHints,
    renderScenarios: renderScenarios,
    syncScenario: syncScenario,
    groupThousands: groupThousands,
    todayStr: todayStr,
    state: state
  };
})(APP.UI);

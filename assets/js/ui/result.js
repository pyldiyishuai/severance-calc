/* ==========================================================================
 * ui/result.js — 结果渲染（金额 / 结论徽章 / 拆解 / 法条 / 证据）
 * --------------------------------------------------------------------------
 * 只做「结果对象 → 屏幕」的映射，不含任何计算。
 * ========================================================================== */

var APP = window.APP || {};
window.APP = APP;

APP.UI = APP.UI || {};

(function (UI) {
  'use strict';

  var F = null;
  function fmt() { if (!F) F = UI.Format; return F; }

  /* ======================================================================
   * 法条原文（展示用，与 data/severance-rules.js 里的 legal 字段配合）
   * 说明：条文较长，这里摘录与本场景直接相关的部分。
   * ==================================================================== */
  var LAW_TEXT = {
    'mutual-employer':
      '《劳动合同法》第 36 条：用人单位与劳动者协商一致，可以解除劳动合同。\n' +
      '第 46 条第(二)项：用人单位依照本法第 36 条规定向劳动者提出解除劳动合同并与劳动者协商一致解除劳动合同的，应当支付经济补偿。',
    'mutual-employee':
      '《劳动合同法》第 46 条第(二)项仅规定「用人单位提出」协商解除才需补偿。\n' +
      '因此由劳动者本人提出并协商一致解除的，法律上不产生经济补偿义务。',
    'incompetent':
      '《劳动合同法》第 40 条第(二)项：劳动者不能胜任工作，经过培训或者调整工作岗位，仍不能胜任工作的，用人单位提前三十日以书面形式通知劳动者本人或者额外支付劳动者一个月工资后，可以解除劳动合同。',
    'medical':
      '《劳动合同法》第 40 条第(一)项：劳动者患病或者非因工负伤，在规定的医疗期满后不能从事原工作，也不能从事由用人单位另行安排的工作的，用人单位提前三十日以书面形式通知或者额外支付一个月工资后，可以解除。',
    'objective-change':
      '《劳动合同法》第 40 条第(三)项：劳动合同订立时所依据的客观情况发生重大变化，致使劳动合同无法履行，经用人单位与劳动者协商，未能就变更劳动合同内容达成协议的。',
    'layoff':
      '《劳动合同法》第 41 条：依照企业破产法规定进行重整的；生产经营发生严重困难的；企业转产、重大技术革新或者经营方式调整，经变更劳动合同后仍需裁减人员的等情形，可以裁减人员（20 人以上或不足 20 人但占职工总数 10% 以上），并应提前三十日向工会或全体职工说明情况。',
    'contract-end-no-renew':
      '《劳动合同法》第 44 条第(一)项：劳动合同期满的，劳动合同终止。\n' +
      '第 46 条第(五)项：除用人单位维持或者提高劳动合同约定条件续订劳动合同、劳动者不同意续订的情形外，依照第 44 条第(一)项规定终止固定期限劳动合同的，应当支付经济补偿。',
    'contract-end-employee-refuse':
      '《劳动合同法》第 46 条第(五)项明确排除：用人单位维持或者提高劳动合同约定条件续订劳动合同，劳动者不同意续订的，用人单位无需支付经济补偿。',
    'resign':
      '《劳动合同法》第 37 条：劳动者提前三十日以书面形式通知用人单位，可以解除劳动合同。\n' +
      '该情形下用人单位无需支付经济补偿。',
    'forced-resign':
      '《劳动合同法》第 38 条：用人单位未按照劳动合同约定提供劳动保护或者劳动条件、未及时足额支付劳动报酬、未依法为劳动者缴纳社会保险费、规章制度违反法律法规损害劳动者权益等情形，劳动者可以解除劳动合同。\n' +
      '第 46 条第(一)项：劳动者依照第 38 条规定解除劳动合同的，用人单位应当支付经济补偿。',
    'illegal-termination':
      '《劳动合同法》第 87 条：用人单位违反本法规定解除或者终止劳动合同的，应当依照本法第 47 条规定的经济补偿标准的二倍向劳动者支付赔偿金。\n' +
      '第 48 条：劳动者要求继续履行劳动合同的，用人单位应当继续履行；劳动者不要求继续履行或者劳动合同已经不能继续履行的，用人单位应当依照第 87 条规定支付赔偿金。',
    'probation-fail':
      '《劳动合同法》第 39 条第(一)项：在试用期间被证明不符合录用条件的，用人单位可以解除劳动合同，且无需支付经济补偿。',
    'misconduct':
      '《劳动合同法》第 39 条第(二)项：严重违反用人单位的规章制度的，用人单位可以解除劳动合同。\n' +
      '注意：规章制度须内容合法、经民主程序制定、并已向劳动者公示，否则不能作为解除依据。',
    'criminal':
      '《劳动合同法》第 39 条第(六)项：被依法追究刑事责任的，用人单位可以解除劳动合同。'
  };

  var ARTICLE_47 =
    '《劳动合同法》第 47 条：经济补偿按劳动者在本单位工作的年限，每满一年支付一个月工资的标准向劳动者支付。' +
    '六个月以上不满一年的，按一年计算；不满六个月的，向劳动者支付半个月工资的经济补偿。\n' +
    '劳动者月工资高于用人单位所在直辖市、设区的市级人民政府公布的本地区上年度职工月平均工资三倍的，' +
    '向其支付经济补偿的标准按职工月平均工资三倍的数额支付，向其支付经济补偿的年限最高不超过十二年。\n' +
    '本条所称月工资是指劳动者在劳动合同解除或者终止前十二个月的平均工资。';

  /* ---------- 数字滚动动画 ---------- */
  var animRaf = {};
  function animateValue(el, from, to, formatter, duration) {
    if (!el) return;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !isFinite(from) || !isFinite(to)) {
      el.textContent = formatter(to);
      return;
    }
    var id = el.id || (el.id = 'v' + Math.random().toString(36).slice(2));
    if (animRaf[id]) cancelAnimationFrame(animRaf[id]);
    var start = performance.now(), dur = duration || 620, delta = to - from;

    function step(now) {
      var t = Math.min((now - start) / dur, 1);
      var e = 1 - Math.pow(1 - t, 3);
      el.textContent = formatter(from + delta * e);
      if (t < 1) animRaf[id] = requestAnimationFrame(step);
      else animRaf[id] = null;
    }
    animRaf[id] = requestAnimationFrame(step);
  }

  var prev = { total: 0, comp: 0, notice: 0, leave: 0 };

  /* ======================================================================
   * 主渲染
   * ==================================================================== */

  function renderAll(r) {
    var f = fmt();

    /* ---------- 主金额 ---------- */
    animateValue(document.getElementById('totalAmount'), prev.total, r.amount.total, function (v) {
      return f.moneyYuan(v);
    }, 700);
    prev.total = r.amount.total;

    var sub = document.getElementById('totalSub');
    if (sub) {
      if (!r.valid) {
        sub.textContent = '请先填写正确的入职与离职日期';
      } else if (r.scenario.multiple === 0) {
        sub.textContent = '按当前情形，法律上公司无需支付经济补偿';
      } else {
        sub.textContent = '= ' + r.months.total + ' 个月 × ' +
          f.int(r.wage.base) + ' 元/月' +
          (r.amount.noticePay ? ' + 代通知金 ' + f.int(r.amount.noticePay) : '') +
          (r.amount.leavePay ? ' + 年假 ' + f.int(r.amount.leavePay) : '');
      }
    }

    /* ---------- 结论徽章 ---------- */
    renderVerdict(r);

    /* ---------- 拆解 ---------- */
    animateValue(document.getElementById('amountComp'), prev.comp, r.amount.compensation, function (v) {
      return f.moneyYuan(v);
    }, 560);
    prev.comp = r.amount.compensation;

    animateValue(document.getElementById('amountNotice'), prev.notice, r.amount.noticePay, function (v) {
      return f.moneyYuan(v);
    }, 560);
    prev.notice = r.amount.noticePay;

    animateValue(document.getElementById('amountLeave'), prev.leave, r.amount.leavePay, function (v) {
      return f.moneyYuan(v);
    }, 560);
    prev.leave = r.amount.leavePay;

    toggleRow('rowComp', r.amount.compensation <= 0);
    toggleRow('rowNotice', !r.amount.needsNoticePay);
    toggleRow('rowLeave', r.amount.leavePay <= 0);

    /* ---------- 指标 ---------- */
    setText('metricTenure', r.valid ? shortPeriod(r.period) : '—');
    setText('metricMonths', r.valid ? r.months.used + ' 个月' : '—');
    setText('metricBase', f.int(r.wage.base));
    setText('metricDaily', f.int(r.wage.daily));

    var mMonths = document.getElementById('metricMonths');
    if (mMonths) {
      mMonths.className = 'metric__value' + (r.months.total > 0 ? ' is-good' : '');
    }

    /* ---------- 图表：金额构成 ---------- */
    if (UI.Chart) {
      var bars = [
        { label: '经济补偿 / 赔偿金', value: r.amount.compensation, cls: 'new' },
        { label: '代通知金（+1）', value: r.amount.noticePay, cls: 'old' },
        { label: '未休年假折算', value: r.amount.leavePay, cls: 'save' }
      ];
      // 金额为 0 的项不占版面；只剩一项时整个图表也没信息量，直接收起
      var visible = bars.filter(function (b) { return b.value > 0; });
      var chartBox = document.querySelector('.chart');
      if (chartBox) chartBox.style.display = visible.length > 1 ? '' : 'none';
      UI.Chart.renderBars(document.getElementById('barChart'), visible.length ? visible : bars);
    }

    /* ---------- 建议 ---------- */
    renderAdvice(r.advice);

    /* ---------- 法条 ---------- */
    renderLaw(r);

    /* ---------- 证据 ---------- */
    renderEvidence(r.evidence);

    /* ---------- 时间戳 ---------- */
    var stamp = document.getElementById('resultStamp');
    if (stamp) {
      stamp.textContent = '已更新 ' + new Date().toLocaleTimeString('zh-CN', {
        hour: '2-digit', minute: '2-digit'
      });
      stamp.classList.add('is-fresh');
      setTimeout(function () { stamp.classList.remove('is-fresh'); }, 1400);
    }

    /* ---------- 悬浮条 ---------- */
    setText('dockSave', f.moneyYuan(r.amount.total));
  }

  /* ======================================================================
   * 结论徽章
   * ==================================================================== */

  function renderVerdict(r) {
    var badge = document.getElementById('verdictBadge');
    var text = document.getElementById('verdictText');
    if (!badge || !text) return;

    if (!r.valid) {
      badge.className = 'verdict__badge verdict__badge--zero';
      badge.textContent = '待填写';
      text.textContent = '填好入职和离职日期后自动判断。';
      return;
    }

    var s = r.scenario;
    var cls = 'zero', label = '无补偿', desc = '';

    if (s.multiple === 2) {
      cls = 'n2'; label = '2N';
      desc = '属于<b>违法解除</b>，可主张 <b>' + r.months.total + ' 个月</b>工资的赔偿金。' +
             '注意：2N 与 N 不能同时主张。';
    } else if (s.multiple === 1 && r.amount.needsNoticePay) {
      cls = 'np1'; label = 'N+1';
      desc = '属于第 40 条解除且未提前 30 天通知，补偿 <b>N</b> 之外还需额外支付 <b>1 个月代通知金</b>。';
    } else if (s.multiple === 1) {
      cls = 'n'; label = 'N';
      desc = '可主张 <b>' + r.months.total + ' 个月</b>工资的经济补偿。';
    } else {
      cls = 'zero'; label = '无补偿';
      desc = '按此情形，法律上公司无需支付经济补偿。若实际情况不同，请换一个情形重新测算。';
    }

    badge.className = 'verdict__badge verdict__badge--' + cls;
    badge.textContent = label;
    text.innerHTML = desc;
  }

  /* ======================================================================
   * 法条
   * ==================================================================== */

  function renderLaw(r) {
    var body = document.getElementById('lawBody');
    if (!body) return;

    if (!r.scenario) { body.innerHTML = ''; return; }

    var html = '<span class="law__title">适用情形：' + r.scenario.label + '</span>';
    html += '<div>' + (LAW_TEXT[r.scenario.id] || r.scenario.legal)
      .split('\n').join('</div><div>') + '</div>';

    if (r.scenario.multiple > 0) {
      html += '<div class="law__quote">' + ARTICLE_47.split('\n').join('<br/>') + '</div>';
    }

    html += '<div class="law__quote">' +
      '条文索引：<code>' + r.scenario.legal + '</code>' +
      (r.wage.isCapped ? '<code>第 47 条第 2 款（三倍封顶）</code>' : '') +
      '</div>';

    body.innerHTML = html;
  }

  /* ======================================================================
   * 建议 / 证据
   * ==================================================================== */

  function renderAdvice(list) {
    var textEl = document.getElementById('adviceText');
    var box = document.getElementById('advice');
    if (!textEl) return;

    if (!list || !list.length) {
      textEl.textContent = '填写信息后，这里会给出针对你情况的结论。';
      if (box) box.style.display = 'none';
      return;
    }
    if (box) box.style.display = '';

    textEl.innerHTML = list.map(function (item, i) {
      var cls = i === 0 ? 'advice__lead' : 'advice__item';
      return '<span class="' + cls + '">' + item.text + '</span>';
    }).join('');
  }

  function renderEvidence(list) {
    var ul = document.getElementById('evidenceList');
    if (!ul) return;
    ul.innerHTML = (list || []).map(function (t) {
      return '<li>' + t + '</li>';
    }).join('');
  }

  /* ---------- 小工具 ---------- */
  /** 指标格里用的紧凑时长：3 年 8 个月 → 3年8月 */
  function shortPeriod(p) {
    if (!p) return '—';
    var s = '';
    if (p.years) s += p.years + '年';
    if (p.months) s += p.months + '月';
    if (!s) s = p.days + '天';
    return s;
  }

  function toggleRow(id, off) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('is-zero', !!off);
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function renderEmpty() {
    ['totalAmount', 'amountComp', 'amountNotice', 'amountLeave',
     'metricTenure', 'metricMonths', 'metricBase', 'metricDaily'].forEach(function (id) {
      setText(id, '—');
    });
  }

  /* ---------- 对外 ---------- */
  UI.Result = {
    renderAll: renderAll,
    renderEmpty: renderEmpty,
    LAW_TEXT: LAW_TEXT
  };
})(APP.UI);

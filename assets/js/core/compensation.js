/* ==========================================================================
 * core/compensation.js — 补偿金额计算 + 法律依据 + 智能提示
 * --------------------------------------------------------------------------
 * 输入：入职/离职日期、月平均工资、离职情形、社平工资、未休年假
 * 输出：N、金额拆解、封顶判断、法条、维权清单
 *
 * 【扩展点】
 *   - 加班费 / 未签合同二倍工资 / 竞业限制补偿：各自新增一个计算函数，
 *     在 buildResult 里加一个字段即可，UI 层按字段渲染
 *   - 多情形对比（比如「协商解除 vs 仲裁 2N」收益对比）：调用两次 buildResult
 * ========================================================================== */

var APP = window.APP || {};
window.APP = APP;

APP.Core = APP.Core || {};

(function (Core) {
  'use strict';

  var S = null;
  function svc() { if (!S) S = Core.Service; return S; }

  /* ======================================================================
   * 一、找情形定义
   * ==================================================================== */

  function findScenario(id) {
    var list = (APP.DATA && APP.DATA.scenarios) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return list[0] || null;
  }

  /* ======================================================================
   * 二、核心计算
   * ==================================================================== */

  /**
   * @param {Object} f
   *   startDate   入职日期 'YYYY-MM-DD'
   *   endDate     离职日期 'YYYY-MM-DD'
   *   avgWage     离职前 12 个月平均工资（元/月）
   *   scenarioId  离职情形 id
   *   noticed30   是否提前 30 日书面通知（影响代通知金）
   *   unusedLeave 未休年假天数
   *   cityWage    当地上年度职工月平均工资（用于三倍封顶，0 表示不封顶）
   *   socialWorkYears 累计社会工龄（用于年假天数，可选）
   */
  function buildResult(f) {
    var s = svc();
    var scenario = findScenario(f.scenarioId);

    var start = s.parseDate(f.startDate);
    var end = s.parseDate(f.endDate);

    var valid = !!(start && end && end >= start);
    var period = valid ? s.servicePeriod(start, end) : { years: 0, months: 0, days: 0, totalDays: 0 };
    var rawMonths = valid ? s.compensationMonths(start, end) : 0;

    var avgWage = Math.max(Number(f.avgWage) || 0, 1);
    var cityWage = Number(f.cityWage) || 0;
    var cap = cityWage > 0 ? cityWage * 3 : 0;

    /* ---------- 三倍封顶 ---------- */
    var isCapped = cap > 0 && avgWage > cap;
    var base = isCapped ? cap : avgWage;

    /* ---------- 年限封顶（仅在被三倍封顶时，最多计 12 年） ---------- */
    var monthsCapped = false;
    var monthsUsed = rawMonths;
    if (isCapped && rawMonths > 12) {
      monthsUsed = 12;
      monthsCapped = true;
    }

    /* ---------- 各项金额 ---------- */
    var multiple = scenario ? scenario.multiple : 0;

    // 经济补偿 / 赔偿金
    var compensation = monthsUsed * base * multiple;

    // 代通知金：仅第 40 条三种情形，且公司未提前 30 天书面通知
    var needsNoticePay = !!(scenario && scenario.plusOne && !f.noticed30);
    var noticePay = needsNoticePay ? base : 0;

    // 未休年假折算（额外支付 200%）
    var leaveRule = (APP.DATA && APP.DATA.annualLeaveRule) || {};
    var dailyWage = base / (leaveRule.dailyWageDivisor || 21.75);
    var leaveDays = Math.max(Number(f.unusedLeave) || 0, 0);
    var leavePay = leaveDays * dailyWage * (leaveRule.extraRatio || 2);

    var total = compensation + noticePay + leavePay;

    /* ---------- 年假参考值（给用户填之前做参考） ---------- */
    var socialYears = Number(f.socialWorkYears);
    if (!isFinite(socialYears) || socialYears <= 0) socialYears = period.years;
    var leaveRef = valid ? s.proratedLeave(start, end, socialYears) : { full: 0, prorated: 0 };

    /* ---------- 组装 ---------- */
    var result = {
      valid: valid,
      input: {
        startDate: f.startDate,
        endDate: f.endDate,
        avgWage: avgWage,
        scenarioId: f.scenarioId,
        noticed30: !!f.noticed30,
        unusedLeave: leaveDays,
        cityWage: cityWage,
        socialWorkYears: socialYears
      },
      scenario: scenario,
      period: period,
      periodText: s.formatPeriod(period),

      // N 的月数（未封顶 / 封顶后）
      months: {
        raw: rawMonths,
        used: monthsUsed,
        capped: monthsCapped,
        multiple: multiple,
        total: monthsUsed * multiple
      },

      // 工资基数
      wage: {
        avg: avgWage,
        cap: cap,
        base: base,
        isCapped: isCapped,
        daily: dailyWage
      },

      amount: {
        compensation: compensation,
        noticePay: noticePay,
        needsNoticePay: needsNoticePay,
        leavePay: leavePay,
        leaveDays: leaveDays,
        total: total
      },

      leaveRef: leaveRef,
      limitation: (APP.DATA && APP.DATA.limitation) || {},

      // 证据清单（维权必备）
      evidence: buildEvidence(scenario),
      advice: []
    };

    result.advice = buildAdvice(result);
    return result;
  }

  /* ======================================================================
   * 三、证据清单
   * ==================================================================== */

  function buildEvidence(scenario) {
    var base = [
      '劳动合同（含续签记录、岗位与薪资约定）',
      '离职前 12 个月的工资流水或工资条（证明月平均工资）',
      '社保 / 公积金缴纳记录（证明劳动关系存续与年限）',
      '解除劳动合同通知书或离职证明（注意上面写的解除理由）'
    ];

    var extra = {
      'incompetent': ['绩效考核标准与考核结果', '培训记录或调岗通知', '你对此提出的异议记录'],
      'medical': ['医院诊断证明、病假条', '医疗期计算依据', '公司另行安排工作的通知'],
      'objective-change': ['公司变更/撤销业务的通知', '与你就变更合同的协商记录'],
      'layoff': ['公司裁员方案', '是否向劳动行政部门报告的证明', '留用人员名单'],
      'illegal-termination': ['解除通知原件（证明理由与日期）', '孕期/工伤/医疗期的证明（如适用）'],
      'forced-resign': ['欠薪记录或未缴社保的截图', '你发出的被迫解除通知（写明理由）'],
      'contract-end-no-renew': ['到期合同', '公司不续签的书面通知', '降条件续签的证据（如新合同草案）'],
      'misconduct': ['员工手册签收记录', '规章制度是否经民主程序的证据', '违纪事实的证据']
    };

    return base.concat(extra[scenario && scenario.id] || []);
  }

  /* ======================================================================
   * 四、智能提示
   * ==================================================================== */

  function money(v) {
    if (!isFinite(v)) return '—';
    return Math.round(v).toLocaleString('zh-CN') + ' 元';
  }

  function buildAdvice(r) {
    var out = [];
    if (!r.valid) {
      out.push({ type: 'warn', text: '请先填写正确的<b>入职日期</b>和<b>离职日期</b>，离职日期不能早于入职日期。' });
      return out;
    }

    /* --- 1. 核心结论 --- */
    if (r.scenario && r.scenario.multiple > 0) {
      out.push({
        type: 'good',
        text: '按你选择的「<b>' + r.scenario.label + '</b>」，' +
              '公司应支付 <b>' + (r.scenario.multiple === 2 ? '2N 赔偿金' : 'N 经济补偿') + '</b>。' +
              '工作年限 <b>' + r.periodText + '</b>，折算 <b>' + r.months.used + ' 个月</b>' +
              (r.months.multiple === 2 ? '，违法解除按 2 倍计算 = <b>' + r.months.total + ' 个月</b>' : '') +
              '，合计 <b>' + money(r.amount.compensation) + '</b>。'
      });
    } else {
      out.push({
        type: 'warn',
        text: '按「<b>' + (r.scenario ? r.scenario.label : '') + '</b>」，' +
              '<span class="hl">法律上公司不需要支付经济补偿</span>。' +
              '但如果实际情况与这个情形不符（比如公司逼你自己提离职），' +
              '务必换一个情形重新测算——很多人就是在这一步吃了亏。'
      });
    }

    /* --- 2. 代通知金 --- */
    if (r.amount.needsNoticePay) {
      out.push({
        type: 'info',
        text: '公司<b>没有提前 30 天书面通知</b>，需要额外支付 <b>1 个月代通知金</b>（' +
              money(r.amount.noticePay) + '）。如果公司给了 30 天通知期，这 1 个月就没有了。'
      });
    } else if (r.scenario && r.scenario.plusOne) {
      out.push({
        type: 'info',
        text: '这种情形<b>本来可以有代通知金</b>，但你勾选了「已提前 30 天通知」，' +
              '所以按 N 计算。如果实际没有收到书面通知，把那个勾去掉试试。'
      });
    }

    /* --- 3. 三倍封顶 --- */
    if (r.wage.isCapped) {
      out.push({
        type: 'warn',
        text: '你的月薪 <b>' + money(r.wage.avg) + '</b> 超过了当地社平工资的 3 倍（' +
              money(r.wage.cap) + '），按法律规定补偿基数<b>封顶</b>为 ' + money(r.wage.cap) + '，' +
              '且补偿年限最多 12 年。' +
              (r.months.capped ? '你的年限已按 12 年封顶计算。' : '')
      });
    } else if (r.wage.cap > 0) {
      out.push({
        type: 'info',
        text: '你的月薪未超过当地社平工资 3 倍（' + money(r.wage.cap) + '），' +
              '补偿基数按实际月平均工资 <b>' + money(r.wage.avg) + '</b> 计算，年限不封顶。'
      });
    }

    /* --- 4. 年假 --- */
    if (r.amount.leavePay > 0) {
      out.push({
        type: 'info',
        text: '未休年假 <b>' + r.amount.leaveDays + ' 天</b>，折算工资 <b>' + money(r.amount.leavePay) + '</b>' +
              '（日工资 = 月薪 ÷ 21.75，按 200% 额外支付）。' +
              '参考：按你的工龄，今年应享年假约 <b>' + r.leaveRef.full + ' 天</b>' +
              (r.leaveRef.prorated ? '，按在职天数折算约 ' + r.leaveRef.prorated + ' 天' : '') + '。'
      });
    }

    /* --- 5. 维权时效 --- */
    out.push({
      type: 'warn',
      text: '⏰ <b>劳动仲裁时效 1 年</b>，从劳动关系终止之日起算。' +
            '超过时效再主张，仲裁委通常不予受理——先去当地劳动人事争议仲裁委员会立案，' +
            '仲裁不收费，也不用请律师。'
    });

    /* --- 6. 谈判提示 --- */
    if (r.amount.total > 0) {
      out.push({
        type: 'info',
        text: '谈判时可以这样报：<b>经济补偿 ' + money(r.amount.compensation) + '</b>' +
              (r.amount.noticePay ? ' + <b>代通知金 ' + money(r.amount.noticePay) + '</b>' : '') +
              (r.amount.leavePay ? ' + <b>未休年假 ' + money(r.amount.leavePay) + '</b>' : '') +
              ' = <b>合计 ' + money(r.amount.total) + '</b>。' +
              '另外别忘了：当月工资、报销款、年终奖（按比例）也是要结清的。'
      });
    }

    return out;
  }

  /* ======================================================================
   * 五、情形对比（扩展位）
   * ==================================================================== */

  /**
   * 对比「协商解除 N」与「仲裁主张 2N」的收益差
   * 用于给用户一个「要不要硬刚」的量化参考
   */
  function compareStrategies(f) {
    var ids = ['mutual-employer', 'illegal-termination'];
    return ids.map(function (id) {
      var r = buildResult(Object.assign({}, f, { scenarioId: id }));
      return {
        id: id,
        label: r.scenario.label,
        months: r.months.total,
        amount: r.amount.total
      };
    });
  }

  /* ---------- 导出 ---------- */
  Core.Compensation = {
    buildResult: buildResult,
    findScenario: findScenario,
    compareStrategies: compareStrategies
  };
})(APP.Core);

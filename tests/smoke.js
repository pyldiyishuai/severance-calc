/* ==========================================================================
 * tests/smoke.js — 离职补偿金计算器冒烟测试
 * --------------------------------------------------------------------------
 * 跑法（在项目目录下）：
 *   node ../_tools/eval.mjs "file:///<绝对路径>/index.html" "tests/smoke.js"
 *
 * 断言口径全部来自法条原文手算，不复用被测函数本身，避免「自己验证自己」。
 * ========================================================================== */

(async function () {
  var out = { total: 0, passed: 0, failed: 0, failures: [] };

  function ok(name, cond, got) {
    out.total++;
    if (cond) { out.passed++; }
    else {
      out.failed++;
      out.failures.push(name + '  →  got: ' + JSON.stringify(got));
    }
  }
  function near(name, got, want, tol) {
    ok(name, Math.abs(Number(got) - Number(want)) <= (tol == null ? 0.01 : tol), got + ' (want ' + want + ')');
  }
  function eq(name, got, want) {
    ok(name, String(got) === String(want), got + ' (want ' + want + ')');
  }
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  var S = APP.Core.Service;
  var C = APP.Core.Compensation;

  /* ==================================================================
   * 一、工作年限 → N 的月数（第 47 条）
   * ================================================================== */

  eq('满 1 年 → N = 1', S.compensationMonths(S.parseDate('2024-01-01'), S.parseDate('2025-01-01')), 1);
  eq('3 年 8 个月 → N = 4（满 6 个月按 1 年）',
     S.compensationMonths(S.parseDate('2021-05-01'), S.parseDate('2025-01-10')), 4);
  eq('3 年 5 个月 → N = 3.5（不满 6 个月按半个月）',
     S.compensationMonths(S.parseDate('2021-08-01'), S.parseDate('2025-01-10')), 3.5);
  eq('1 年 6 个月整 → N = 2',
     S.compensationMonths(S.parseDate('2020-01-01'), S.parseDate('2021-07-01')), 2);
  eq('不满 6 个月 → N = 0.5',
     S.compensationMonths(S.parseDate('2024-10-01'), S.parseDate('2025-01-10')), 0.5);
  eq('入职当天离职 → N = 0.5（不是 0）',
     S.compensationMonths(S.parseDate('2025-01-10'), S.parseDate('2025-01-10')), 0.5);
  eq('正好 10 年 → N = 10',
     S.compensationMonths(S.parseDate('2015-01-01'), S.parseDate('2025-01-01')), 10);
  eq('离职日期早于入职 → N = 0',
     S.compensationMonths(S.parseDate('2025-01-01'), S.parseDate('2024-01-01')), 0);

  /* ---- servicePeriod 精度 ---- */
  var p1 = S.servicePeriod(S.parseDate('2021-03-01'), S.parseDate('2025-01-10'));
  eq('2021-03-01 → 2025-01-10 = 3 年 10 个月 9 天',
     p1.years + '/' + p1.months + '/' + p1.days, '3/10/9');

  // 2024 是闰年，2 月有 29 天；跨闰年不应出现 ±1 天误差
  var p2 = S.servicePeriod(S.parseDate('2024-02-29'), S.parseDate('2025-03-01'));
  eq('2024-02-29 → 2025-03-01 = 1 年 0 个月 1 天',
     p2.years + '/' + p2.months + '/' + p2.days, '1/0/1');

  /* ==================================================================
   * 二、基础补偿金额
   * ================================================================== */

  // 工作 3 年 10 个月 → N=4；月薪 10000；社平 11761（不封顶）
  var r1 = C.buildResult({
    startDate: '2021-03-01', endDate: '2025-01-10',
    avgWage: 10000, scenarioId: 'mutual-employer',
    cityWage: 11761, noticed30: false, unusedLeave: 0
  });
  eq('协商解除 N=4', r1.months.used, 4);
  near('补偿 = 4 × 10000', r1.amount.compensation, 40000);
  near('无代通知金', r1.amount.noticePay, 0);
  near('合计 = 40000', r1.amount.total, 40000);
  eq('未触发封顶', r1.wage.isCapped, false);

  /* ==================================================================
   * 三、2N 违法解除（第 87 条）
   * ================================================================== */

  var r2 = C.buildResult({
    startDate: '2021-03-01', endDate: '2025-01-10',
    avgWage: 10000, scenarioId: 'illegal-termination',
    cityWage: 11761, noticed30: true, unusedLeave: 0
  });
  eq('违法解除 2N = 8 个月', r2.months.total, 8);
  near('2N 金额 = 80000', r2.amount.compensation, 80000);
  near('2N 情形没有代通知金', r2.amount.noticePay, 0);

  /* ==================================================================
   * 四、代通知金（第 40 条，未提前 30 天）
   * ================================================================== */

  var r3 = C.buildResult({
    startDate: '2021-03-01', endDate: '2025-01-10',
    avgWage: 10000, scenarioId: 'incompetent',
    cityWage: 11761, noticed30: false, unusedLeave: 0
  });
  eq('不胜任 + 未通知 → 需要代通知金', r3.amount.needsNoticePay, true);
  near('代通知金 = 1 个月工资', r3.amount.noticePay, 10000);
  near('N+1 合计 = 50000', r3.amount.total, 50000);

  var r4 = C.buildResult({
    startDate: '2021-03-01', endDate: '2025-01-10',
    avgWage: 10000, scenarioId: 'incompetent',
    cityWage: 11761, noticed30: true, unusedLeave: 0
  });
  eq('不胜任 + 已通知 → 无代通知金', r4.amount.needsNoticePay, false);
  near('已通知合计 = 40000', r4.amount.total, 40000);

  /* ==================================================================
   * 五、三倍社平封顶 + 12 年年限封顶（第 47 条第 2 款）
   * ================================================================== */

  var r5 = C.buildResult({
    startDate: '2005-01-01', endDate: '2025-01-10',
    avgWage: 50000, scenarioId: 'mutual-employer',
    cityWage: 10000, noticed30: true, unusedLeave: 0
  });
  eq('月薪超 3 倍社平 → 触发封顶', r5.wage.isCapped, true);
  near('封顶基数 = 30000', r5.wage.base, 30000);
  eq('年限按 12 年封顶', r5.months.used, 12);
  near('封顶后补偿 = 12 × 30000 = 360000', r5.amount.compensation, 360000);

  // 未超封顶线时，年限不封顶
  // 2005-01-01 → 2025-01-10 = 20 年零 9 天，9 天不满 6 个月，按 20.5 个月
  var r6 = C.buildResult({
    startDate: '2005-01-01', endDate: '2025-01-10',
    avgWage: 8000, scenarioId: 'mutual-employer',
    cityWage: 10000, noticed30: true, unusedLeave: 0
  });
  eq('未封顶时年限不封顶（20 年 9 天 → 20.5 个月）', r6.months.used, 20.5);
  near('未封顶补偿 = 20.5 × 8000', r6.amount.compensation, 164000);

  /* ==================================================================
   * 六、未休年假折算（额外 200%）
   * ================================================================== */

  var r7 = C.buildResult({
    startDate: '2021-03-01', endDate: '2025-01-10',
    avgWage: 10000, scenarioId: 'mutual-employer',
    cityWage: 11761, noticed30: true, unusedLeave: 3
  });
  // 3 × (10000 / 21.75) × 2 = 2758.620...
  near('3 天未休年假折算', r7.amount.leavePay, 3 * (10000 / 21.75) * 2, 0.5);
  near('含年假合计', r7.amount.total, 40000 + 3 * (10000 / 21.75) * 2, 0.5);

  /* ==================================================================
   * 七、无补偿情形
   * ================================================================== */

  ['resign', 'probation-fail', 'misconduct', 'contract-end-employee-refuse'].forEach(function (id) {
    var r = C.buildResult({
      startDate: '2021-03-01', endDate: '2025-01-10',
      avgWage: 10000, scenarioId: id,
      cityWage: 11761, noticed30: false, unusedLeave: 0
    });
    near('情形 ' + id + ' → 补偿为 0', r.amount.total, 0);
  });

  /* ==================================================================
   * 八、法条与证据
   * ================================================================== */

  ok('协商解除挂到第 46 条', r1.scenario.legal.indexOf('第 46 条') > -1, r1.scenario.legal);
  ok('违法解除挂到第 87 条', r2.scenario.legal.indexOf('第 87 条') > -1, r2.scenario.legal);
  ok('证据清单不少于 4 条', r1.evidence.length >= 4, r1.evidence.length);
  ok('违法解除的证据清单包含解除通知',
     r2.evidence.join('|').indexOf('解除通知') > -1, r2.evidence);
  ok('建议至少 3 条', r1.advice.length >= 3, r1.advice.length);
  ok('超过时效的提示存在',
     r1.advice.map(function (a) { return a.text; }).join('').indexOf('仲裁时效') > -1, '');

  /* ==================================================================
   * 九、DOM 渲染
   * ================================================================== */

  var totalText = $('totalAmount').textContent;
  ok('主金额已渲染', totalText !== '—' && totalText.length > 0, totalText);

  var badge = $('verdictBadge').textContent;
  ok('结论徽章有值', /N|2N|无补偿|待填写/.test(badge), badge);

  ok('工作年限展示条有值', $('tenureText').textContent !== '—', $('tenureText').textContent);

  ok('情形卡片已渲染', document.querySelectorAll('.option-card[data-name="scenario"]').length >= 5,
     document.querySelectorAll('.option-card[data-name="scenario"]').length);

  ok('折叠区情形已渲染', document.querySelectorAll('#scenarioListMore .option-card').length >= 8,
     document.querySelectorAll('#scenarioListMore .option-card').length);

  ok('FAQ 条数 = 12', document.querySelectorAll('#faqList .faq__item').length === 12,
     document.querySelectorAll('#faqList .faq__item').length);

  var ld = Array.prototype.slice.call(document.querySelectorAll('script[type="application/ld+json"]'));
  ok('注入了 FAQPage 结构化数据',
     ld.some(function (s) { return s.textContent.indexOf('FAQPage') > -1; }), ld.length);
  ok('注入了 WebApplication 结构化数据',
     ld.some(function (s) { return s.textContent.indexOf('WebApplication') > -1; }), ld.length);

  ok('城市下拉已渲染', document.querySelectorAll('#cityPick option').length >= 5,
     document.querySelectorAll('#cityPick option').length);

  /* ==================================================================
   * 十、交互：切换情形后结果跟着变
   * ================================================================== */

  var before = $('totalAmount').textContent;

  var card2N = document.querySelector('.option-card[data-value="illegal-termination"]');
  ok('找得到 2N 卡片', !!card2N, !!card2N);
  if (card2N) {
    card2N.click();
    await sleep(400);
    var after = $('totalAmount').textContent;
    ok('切到 2N 后金额变化', before !== after, before + ' → ' + after);
    eq('切换后徽章显示 2N', $('verdictBadge').textContent, '2N');

    // 切回来
    var cardBack = document.querySelector('.option-card[data-value="mutual-employer"]');
    cardBack.click();
    await sleep(900);
    eq('切回协商解除恢复 N', $('verdictBadge').textContent, 'N');
  }

  /* ---- 勾选「已提前 30 天通知」应让 N+1 变 N ---- */
  var cardIncompetent = document.querySelector('.option-card[data-value="incompetent"]');
  if (cardIncompetent) {
    cardIncompetent.click();
    await sleep(400);
    eq('不胜任情形默认 N+1', $('verdictBadge').textContent, 'N+1');

    $('noticed30').click();
    await sleep(400);
    eq('勾选已通知后变 N', $('verdictBadge').textContent, 'N');
    $('noticed30').click();
    await sleep(300);
  }

  /* ==================================================================
   * 十一、日期非法时不崩
   * ================================================================== */

  var rBad = C.buildResult({
    startDate: '2025-01-10', endDate: '2024-01-01',
    avgWage: 10000, scenarioId: 'mutual-employer',
    cityWage: 11761, noticed30: false, unusedLeave: 0
  });
  eq('离职早于入职 → valid=false', rBad.valid, false);
  near('无效输入金额为 0', rBad.amount.total, 0);

  return out;
})()

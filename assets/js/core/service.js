/* ==========================================================================
 * core/service.js — 工作年限与「N」的计算（纯函数，不碰 DOM）
 * --------------------------------------------------------------------------
 * 依据《劳动合同法》第 47 条：
 *   每满 1 年 → 1 个月工资
 *   6 个月以上不满 1 年 → 按 1 年算（1 个月）
 *   不满 6 个月 → 半个月
 *
 * 这里最容易出错的地方是「按月进位」的边界判断，所以单独拆一层，
 * 用真实日期做加法而不是用天数除 365，避免闰年误差。
 * ========================================================================== */

var APP = window.APP || {};
window.APP = APP;

APP.Core = APP.Core || {};

(function (Core) {
  'use strict';

  /* ======================================================================
   * 一、日期工具
   * ==================================================================== */

  /** 'YYYY-MM-DD' → Date（本地时区，避免 UTC 偏移导致差一天） */
  function parseDate(str) {
    if (str instanceof Date) return str;
    if (!str) return null;
    var m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isNaN(d) || d.getMonth() !== Number(m[2]) - 1) return null; // 2024-02-31 这种
    return d;
  }

  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  /** 加 n 年（处理 2 月 29 日） */
  function addYears(date, n) {
    var d = new Date(date.getTime());
    var day = d.getDate();
    d.setFullYear(d.getFullYear() + n);
    if (d.getDate() !== day) d.setDate(0); // 2/29 → 2/28
    return d;
  }

  /** 加 n 个月（处理月末） */
  function addMonths(date, n) {
    var d = new Date(date.getTime());
    var day = d.getDate();
    d.setMonth(d.getMonth() + n);
    if (d.getDate() !== day) d.setDate(0);
    return d;
  }

  function diffDays(a, b) {
    return Math.round((b - a) / 86400000);
  }

  /* ======================================================================
   * 二、工作年限（年月日）
   * ==================================================================== */

  /**
   * 计算 start → end 的整年整月整日
   *
   * 一律用「周年日推进」而不是月差相减：2 月 29 日入职这类情况，
   * 月差法会算出 1 年 0 天，周年日法会算出 1 年 1 天，两者在补偿年限上
   * 会打架。这里统一成周年日法，保证 servicePeriod 与 compensationMonths
   * 用的是同一套口径。
   *
   * @returns {{years:number, months:number, days:number, totalDays:number}}
   */
  function servicePeriod(start, end) {
    if (!start || !end || end < start) {
      return { years: 0, months: 0, days: 0, totalDays: 0 };
    }

    var years = 0;
    // 上限 100 年，防止极端输入把循环拖死
    while (years < 100 && addYears(start, years + 1) <= end) years++;

    var anniversary = addYears(start, years);

    var months = 0;
    while (months < 12 && addMonths(anniversary, months + 1) <= end) months++;

    var anchor = addMonths(anniversary, months);
    var days = Math.max(diffDays(anchor, end), 0);

    return {
      years: years,
      months: months,
      days: days,
      totalDays: diffDays(start, end)
    };
  }

  /**
   * 折算成「N」的月数
   *
   * 判定顺序很重要：
   *   1. 满整年 → 取整年数
   *   2. 剩余部分 ≥ 6 个月 → 整年数 + 1
   *   3. 剩余部分 > 0 但 < 6 个月 → 整年数 + 0.5
   *   4. 正好整年 → 整年数
   */
  function compensationMonths(start, end) {
    if (!start || !end || end < start) return 0;

    var years = 0;
    // 逐年推进，直到再加一年就超过 end
    while (addYears(start, years + 1) <= end) years++;

    var anniversary = addYears(start, years);
    if (anniversary > end) anniversary = end;

    // 距离整年还差多少天
    var restDays = diffDays(anniversary, end);
    // 正好整年：不足 1 年也算半个月（同一天入职当天离职同样是 0.5，不是 0）
    if (restDays <= 0) return years > 0 ? years : 0.5;

    // 剩余部分是否达到 6 个月
    var sixMonthsLater = addMonths(anniversary, 6);
    if (sixMonthsLater <= end) return years + 1;
    return years + 0.5;
  }

  /** 中文时长：3 年 2 个月 5 天 */
  function formatPeriod(p) {
    if (!p) return '0 天';
    var parts = [];
    if (p.years) parts.push(p.years + ' 年');
    if (p.months) parts.push(p.months + ' 个月');
    if (p.days || !parts.length) parts.push(p.days + ' 天');
    return parts.join(' ');
  }

  /* ======================================================================
   * 三、年休假天数（按累计社会工龄）
   * ==================================================================== */

  /**
   * @param {number} totalWorkYears 累计工作年限（社会工龄，不是本单位工龄）
   * @returns {number} 全年应享年假天数
   */
  function annualLeaveDays(totalWorkYears) {
    var tiers = (APP.DATA.annualLeaveRule && APP.DATA.annualLeaveRule.tiers) || [];
    for (var i = 0; i < tiers.length; i++) {
      if (totalWorkYears >= tiers[i].minYears && totalWorkYears < tiers[i].maxYears) {
        return tiers[i].days;
      }
    }
    return totalWorkYears < 1 ? 0 : 15;
  }

  /**
   * 当年应休年假折算（离职当年按在职天数比例折算）
   * 依据：《企业职工带薪年休假实施办法》第 12 条
   * 折算后不足 1 整天的部分不享受
   */
  function proratedLeave(start, end, totalWorkYears) {
    var full = annualLeaveDays(totalWorkYears);
    if (!full) return { full: 0, prorated: 0, inCompanyDays: 0 };

    // 当年在公司已过的日历天数（按离职年度）
    var year = end.getFullYear();
    var yearStart = new Date(year, 0, 1);
    var begin = start > yearStart ? start : yearStart;
    var inCompanyDays = Math.max(diffDays(begin, end) + 1, 0);

    var prorated = Math.floor((inCompanyDays / 365) * full);
    return { full: full, prorated: prorated, inCompanyDays: inCompanyDays };
  }

  /* ---------- 导出 ---------- */
  Core.Service = {
    parseDate: parseDate,
    addMonths: addMonths,
    addYears: addYears,
    diffDays: diffDays,
    servicePeriod: servicePeriod,
    compensationMonths: compensationMonths,
    formatPeriod: formatPeriod,
    annualLeaveDays: annualLeaveDays,
    proratedLeave: proratedLeave
  };
})(APP.Core);

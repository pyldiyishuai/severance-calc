/* ==========================================================================
 * config.js — 全局配置中心（项目：离职补偿金计算器）
 * --------------------------------------------------------------------------
 * 上线前只需改这里。
 * ========================================================================== */

var APP = window.APP || {};
window.APP = APP;

/* ============================ 1. 站点信息 ============================ */
APP.SITE = {
  name: '离职补偿金计算器',
  // TODO(上线必改): 换成真实域名，index.html 里的 canonical / og:url 同步改
  domain: 'https://pyldiyishuai.github.io/severance-calc',
  locale: 'zh-CN',
  icp: '',
  contactEmail: 'hello@DOMAIN',
  version: '0.1.0'
};

/* ============================ 2. 广告配置 ============================ *
 * 这类页面的广告主画像：劳动法律咨询、律师平台、招聘平台、职业培训、社保代缴。
 * 其中「律师/法律咨询」的 CPC 最高（¥3–15），优先接。
 */
APP.ADS = {
  enabled: true,
  provider: 'placeholder',   // 'placeholder' | 'adsense' | 'baidu' | 'custom'
  adsense: {
    client: 'ca-pub-XXXXXXXXXXXXXXXX',  // TODO
    slots: {
      'result-inline': '0000000000',
      'content-banner': '0000000001',
      'faq-banner': '0000000002'
    }
  },
  baidu: { cproid: '0000000' },
  direct: {
    'result-inline': '',   // 例如某律所的咨询 banner
    'content-banner': '',
    'faq-banner': ''
  },
  showAfterFirstCalc: true,
  silentFail: true
};

/* ============================ 3. 埋点 ============================ */
APP.ANALYTICS = {
  enabled: true,
  ga4: '',
  baiduHmt: '',
  endpoint: '',
  events: {
    pageView: 'page_view',
    calcRun: 'calc_run',
    scenarioChange: 'scenario_change',
    adImpression: 'ad_impression',
    adClick: 'ad_click',
    outboundClick: 'outbound_click'
  }
};

/* ============================ 4. 后端接口（预留） ============================ */
APP.API = {
  enabled: false,
  baseUrl: 'https://api.DOMAIN',
  timeout: 8000,
  endpoints: {
    // 远程下发各地社平工资，避免用户看到过期数据
    cityWage: '/config/city-wage',
    // 法规条文更新
    rules: '/config/rules',
    savePlan: '/plan/save',
    getPlan: '/plan/get',
    feedback: '/feedback',
    // 律所线索（做 CPA 转化时用）
    leadSubmit: '/lead'
  },
  fallbackToLocal: true
};

/* ============================ 5. 会员（预留） ============================ */
APP.AUTH = {
  enabled: false,
  provider: 'none',
  loginUrl: '',
  gatedFeatures: ['save-plan', 'export-pdf', 'lawyer-consult']
};

/* ============================ 6. 功能开关 ============================ */
APP.FEATURES = {
  // —— 已实现 ——
  basicCalc: true,          // 基础补偿计算
  scenarioPicker: true,     // 14 种离职情形选择
  tripleCap: true,          // 三倍社平封顶判断
  leavePay: true,           // 未休年假折算
  evidenceList: true,       // 证据清单生成
  legalBasis: true,         // 法条依据展示

  // —— 未实现（已留桩） ——
  strategyCompare: false,   // 协商 N vs 仲裁 2N 收益对比
  taxCalc: false,           // 补偿金个税计算（3 倍社平免税额度）
  overtimePay: false,       // 加班费计算
  doubleWage: false,        // 未签书面合同二倍工资
  cityAuto: false,          // 选城市自动填社平工资（需 API）
  exportPdf: false,         // 导出 PDF 报告
  shareCard: false,         // 分享长图
  lawyerLead: false,        // 律师咨询线索（CPA 变现）
  savePlan: false,          // 云端保存
  i18n: false
};

/* ============================ 7. 计算口径常量 ============================ */
APP.CONST = {
  // 月计薪天数（用于日工资折算）
  MONTHLY_WORK_DAYS: 21.75,
  // 补偿年限上限（仅在三倍封顶时生效）
  MAX_CAPPED_YEARS: 12,
  // 代通知金 = 1 个月
  NOTICE_PAY_MONTHS: 1,
  // 未休年假额外支付倍数（100% 已在工资中支付，另付 200%）
  LEAVE_EXTRA_RATIO: 2,
  STORAGE_PREFIX: 'svc_'
};

APP.DEBUG = {
  verbose: false,
  noDebounce: false
};

/**
 * 海鲜自助项目 - 商业模型计算引擎（通用模板）
 * 定义所有输入变量和计算逻辑，确保数据一致性
 * 任何项目只需填写输入变量，所有衍生值自动计算
 * 前端使用：BusinessModel 对象
 * 后端使用：BusinessModelCalculator 类
 *
 * V2 核心变更（2026-08-22）：
 * - 投资人：回本前分可分配纯利40%，回本后分10%
 * - 房东：超额累进分成（30万以内10%/超出部分20%）
 * - 8%明确为流量获客刚性成本（服务商4%+运营部门4%），非老板个人收益
 * - 角色拆分：抖音服务商（前端获客）vs 门店老板（后端管理）
 */

(function() {
  'use strict';

  // ==================== 格式化工具 ====================
  function formatNum(n) {
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function formatWan(n) {
    var w = n / 10000;
    return w >= 10 ? Math.round(w) + '万' : w.toFixed(1) + '万';
  }

  // ==================== 核心计算引擎 ====================
  var BusinessModel = {
    // ----- 通用输入变量 -----
    inputs: {
      // 核心参数
      area: 2000,               // 总面积 ㎡
      price: 169,               // 人均定价 元
      // 周度营收 - 工作日低/周末高，周总营收保持 ~180万/月
      monThuRev: 34983,         // 周一至周四日均营收 元（207人×169元）
      friRev: 92891,            // 周五日均营收 元（550人×169元）
      satRev: 92891,            // 周六日均营收 元
      sunRev: 92891,            // 周日日均营收 元
      totalInvestment: 1000000, // 总投资 元
      equipmentInvestment: 700000, // 装修设备投资 元

      // 成本参数
      foodCostPct: 48,          // 食材成本率 %（固定48%）
      rent: 0,                  // 房租 元/月（房东无固定租金，改为利润分成）
      laborCost: 215600,        // 人工成本 元/月（38人，含社保餐宿，北京房山上调12%）
      marketingPct: 0,          // 营销费率%（已含在运营部门费4%中，不单独列支）
      miscCost: 60000,          // 杂费 元/月

      // 分账参数
      serviceFeePct: 4,         // 抖音服务商抽成（成交额%）% - 前端获客硬成本
      operationPct: 4,          // 运营部门分成（成交额%）% - 达人/拍摄/直播硬成本
      investorPctPrePayback: 40, // 投资人分红 - 回本前 %
      investorPct: 10,          // 投资人分红 - 回本后 %
      partnerTermMonths: 36,    // 投资人合伙期限（月）

      // 扩展参数
      tableCount: 120,          // 桌数
      seatsPerTable: 2.8,       // 每桌平均人数
      staffCount: 38,           // 团队编制
      utilityCost: 60000,       // 水电燃气耗材维保 元/月
      kitchenStaff: 22,         // 后厨人数
      kitchenCost: 105000,      // 后厨月度总成本 元
      frontStaff: 16,           // 前厅人数
      frontCost: 75000,        // 前厅月度总成本 元
      staffInitialCost: 200000, // 前期人工组建费用 元
      foodInitialCost: 100000,  // 首批食材备货费用 元
    },

    // ----- 计算结果缓存 -----
    values: {},

    // ==================== 计算所有衍生值 ====================
    calculate: function(inputs) {
      if (inputs) {
        Object.keys(inputs).forEach(function(k) {
          if (inputs[k] !== undefined && inputs[k] !== null) {
            BusinessModel.inputs[k] = Number(inputs[k]);
          }
        });
      }

      var i = BusinessModel.inputs;

      // ========== 日均营收 = 4个单日加权平均 ==========
      var dailyRevenue = (i.monThuRev * 4 + i.friRev + i.satRev + i.sunRev) / 7;

      // ========== 基础计算 ==========
      var monthlyRevenue = Math.round(dailyRevenue * 30);
      var foodCost = Math.round(monthlyRevenue * i.foodCostPct / 100);
      var marketingCost = Math.round(monthlyRevenue * i.marketingPct / 100);
      var cashTotalExpense = i.laborCost + foodCost + i.rent + marketingCost + i.miscCost + i.utilityCost;
      var cashNetProfit = monthlyRevenue - cashTotalExpense;
      var serviceFee = Math.round(monthlyRevenue * i.serviceFeePct / 100);
      var operationFee = Math.round(monthlyRevenue * i.operationPct / 100);
      var totalFee = serviceFee + operationFee;
      // 分红基数 = 现金净利润 - 两费
      var dividendBase = cashNetProfit - totalFee;

      // ========== 投资人分红计算（回本前40%/回本后10%） ==========
      var investorPrePayback = Math.round(dividendBase * i.investorPctPrePayback / 100); // 40%
      var investorPostPayback = Math.round(dividendBase * i.investorPct / 100);         // 10%

      // ========== 房东：超额累进分成（30万以内10%/超出部分20%） ==========
      var landlordThreshold = 300000;
      var landlordDividend;
      if (dividendBase <= landlordThreshold) {
        landlordDividend = Math.round(dividendBase * 10 / 100);
      } else {
        landlordDividend = Math.round(landlordThreshold * 10 / 100) + Math.round((dividendBase - landlordThreshold) * 20 / 100);
      }

      // ========== 回本前 vs 回本后 三方分账 ==========
      // 回本前（稳态）：投资人40%，房东超额累进，老板剩余
      var operatorIncomePre = dividendBase - investorPrePayback - landlordDividend;
      // 回本后（稳态）：投资人10%，房东超额累进，老板剩余
      var operatorIncomePost = dividendBase - investorPostPayback - landlordDividend;

      // ========== 投资人真实回本周期（含装修期+爬坡期） ==========
      // 月1-2: 装修期，0收入，0分红
      // 月3-5: 试营业（亏损），0分红
      // 月6+: 稳态运营，回本前分40%
      var monthsToPayback = Math.ceil(i.totalInvestment / Math.max(1, investorPrePayback));
      // 从开业算起（含5个月无分红期）
      var realisticPayback = 5 + monthsToPayback;
      // 从出资日算起（含2个月装修期）
      var realisticPaybackFromInvestment = realisticPayback + 2;

      // ========== 投资人3年真实总收益（月月推算） ==========
      // 月1-2: 装修，0
      // 月3-5: 试营业，0
      // 月6-? : 回本前，分40%
      // ?-36: 回本后，分10%
      var cumDividend = 0;
      var paybackMonth = 0; // 从开业算起第几个月回本
      for (var m = 1; m <= i.partnerTermMonths; m++) {
        var thisMonthDiv = 0;
        if (m >= 6) {
          if (cumDividend < i.totalInvestment) {
            // 回本前：分40%
            thisMonthDiv = investorPrePayback;
            // 如果超过本金，截断
            if (cumDividend + thisMonthDiv > i.totalInvestment) {
              thisMonthDiv = i.totalInvestment - cumDividend;
            }
          } else {
            // 回本后：分10%
            thisMonthDiv = investorPostPayback;
          }
        }
        cumDividend += thisMonthDiv;
        if (cumDividend >= i.totalInvestment && paybackMonth === 0) {
          paybackMonth = m;
        }
      }
      // 如果循环结束后仍未回本（理论上不会），用计算值
      if (paybackMonth === 0) paybackMonth = realisticPayback;
      // 覆盖回本值
      realisticPayback = paybackMonth;
      realisticPaybackFromInvestment = paybackMonth + 2;

      // 3年各年收益（投资人）
      var year1Total = 0;
      var year2Total = 0;
      var year3Total = 0;
      var mCum = 0;
      for (var mm = 1; mm <= 36; mm++) {
        var d = 0;
        if (mm >= 6) {
          if (mCum < i.totalInvestment) {
            d = investorPrePayback;
            if (mCum + d > i.totalInvestment) d = i.totalInvestment - mCum;
          } else {
            d = investorPostPayback;
          }
        }
        mCum += d;
        if (mm <= 12) year1Total += d;
        else if (mm <= 24) year2Total += d;
        else year3Total += d;
      }
      var investorTotalReturn3y = year1Total + year2Total + year3Total;
      var investorROI = (investorTotalReturn3y / i.totalInvestment * 100).toFixed(0);

      // ========== 老板（运营方）3年各年收益 ==========
      var opYear1 = 0, opYear2 = 0, opYear3 = 0;
      var opCumInvestor = 0;
      for (var om = 1; om <= 36; om++) {
        var opDiv = 0;
        if (om >= 6) {
          // 投资人先分
          var invThisMonth = 0;
          if (opCumInvestor < i.totalInvestment) {
            invThisMonth = investorPrePayback;
            if (opCumInvestor + invThisMonth > i.totalInvestment) invThisMonth = i.totalInvestment - opCumInvestor;
          } else {
            invThisMonth = investorPostPayback;
          }
          opCumInvestor += invThisMonth;
          // 老板分剩余（房东已固定扣除）
          var isPrePayback = opCumInvestor < i.totalInvestment;
          opDiv = dividendBase - landlordDividend - invThisMonth;
        }
        if (om <= 12) opYear1 += opDiv;
        else if (om <= 24) opYear2 += opDiv;
        else opYear3 += opDiv;
      }
      var operatorTotal3y = opYear1 + opYear2 + opYear3;

      // ========== 试营业推演 ==========
      var trial1MonthlyRev = Math.round(monthlyRevenue * 0.50);
      var trial1Expense = Math.round(monthlyRevenue * 0.75);
      var trial1Profit = trial1MonthlyRev - trial1Expense;
      var trial1Fee = Math.round(trial1MonthlyRev * (i.serviceFeePct + i.operationPct) / 100);
      trial1Profit = trial1Profit - trial1Fee;

      var trial2MonthlyRev = Math.round(monthlyRevenue * 0.67);
      var trial2Expense = Math.round(monthlyRevenue * 0.78);
      var trial2Profit = trial2MonthlyRev - trial2Expense;
      var trial2Fee = Math.round(trial2MonthlyRev * (i.serviceFeePct + i.operationPct) / 100);
      trial2Profit = trial2Profit - trial2Fee;

      var trial3MonthlyRev = Math.round(monthlyRevenue * 0.83);
      var trial3Expense = Math.round(monthlyRevenue * 0.82);
      var trial3Profit = trial3MonthlyRev - trial3Expense;
      var trial3Fee = Math.round(trial3MonthlyRev * (i.serviceFeePct + i.operationPct) / 100);
      trial3Profit = trial3Profit - trial3Fee;

      // ========== 周度营收分解 ==========
      var monThuDaily = i.monThuRev;
      var friDaily = i.friRev;
      var satDaily = i.satRev;
      var sunDaily = i.sunRev;
      var weeklyTotal = monThuDaily * 4 + friDaily + satDaily + sunDaily;

      var monThuCustomers = Math.round(monThuDaily / i.price);
      var friCustomers = Math.round(friDaily / i.price);
      var satCustomers = Math.round(satDaily / i.price);
      var sunCustomers = Math.round(sunDaily / i.price);
      var weeklyCustomers = monThuCustomers * 4 + friCustomers + satCustomers + sunCustomers;

      var tableCapacity = i.tableCount * i.seatsPerTable;
      var monThuTurnover = (monThuCustomers / tableCapacity);
      var friTurnover = (friCustomers / tableCapacity);
      var satTurnover = (satCustomers / tableCapacity);
      var sunTurnover = (sunCustomers / tableCapacity);

      // ========== 流动资金 ==========
      var workingCapital = i.totalInvestment - i.equipmentInvestment;

      // ========== 现金流水 ==========
      var equipmentMonthExpense = cashTotalExpense + i.equipmentInvestment;
      var equipmentMonthProfit = monthlyRevenue - equipmentMonthExpense;

      // ========== 人均薪酬 ==========
      var avgSalary = Math.round(i.laborCost / i.staffCount);

      // ========== 最大容量 ==========
      var maxCapacity = Math.round(i.tableCount * i.seatsPerTable);
      var diningArea = Math.round(i.area * 0.475);
      var tableAreaDetail = (Math.round(diningArea / i.tableCount * 10) / 10);

      // ========== 构建输出 ==========
      this.values = {
        // ===== 1. 面积 =====
        area: i.area + '㎡',
        area_plain: i.area,
        area_dining: diningArea + '㎡（47.5%）',
        area_serving: Math.round(i.area * 0.15) + '㎡（15%）',
        area_kitchen: Math.round(i.area * 0.2) + '㎡（20%）',
        area_storage: Math.round(i.area * 0.1) + '㎡（10%）',
        area_lobby: Math.round(i.area * 0.04) + '㎡（4%）',
        area_restroom: Math.round(i.area * 0.035) + '㎡（3.5%）',
        area_dining_plain: diningArea,
        table_count: i.tableCount + '张桌',
        table_count_plain: i.tableCount,
        table_area: tableAreaDetail + '㎡/桌',
        max_capacity: maxCapacity + '人',
        max_capacity_plain: maxCapacity,

        // ===== 2. 定价 =====
        price: i.price + '元/位',
        price_plain: i.price,

        // ===== 3. 营收 =====
        daily_revenue: formatWan(Math.round(dailyRevenue)),
        daily_revenue_plain: Math.round(dailyRevenue),
        monthly_revenue: formatWan(monthlyRevenue),
        monthly_revenue_num: formatNum(monthlyRevenue) + '元',
        monthly_revenue_raw: monthlyRevenue,
        weekly_revenue: formatWan(Math.round(monthlyRevenue / 4.3)),

        mon_thu_wan: (monThuDaily / 10000).toFixed(1) + '万',
        mon_thu_plain: monThuDaily,
        fri_wan: (friDaily / 10000).toFixed(1) + '万',
        fri_plain: friDaily,
        sat_wan: (satDaily / 10000).toFixed(1) + '万',
        sat_plain: satDaily,
        sun_wan: (sunDaily / 10000).toFixed(1) + '万',
        sun_plain: sunDaily,

        mon_thu_customers: formatNum(monThuCustomers) + '人',
        mon_thu_customers_plain: monThuCustomers,
        fri_customers: formatNum(friCustomers) + '人',
        fri_customers_plain: friCustomers,
        sat_customers: formatNum(satCustomers) + '人',
        sat_customers_plain: satCustomers,
        sun_customers: formatNum(sunCustomers) + '人',
        sun_customers_plain: sunCustomers,
        weekly_customers: formatNum(weeklyCustomers) + '人',
        weekly_customers_plain: weeklyCustomers,

        mon_thu_turnover: monThuTurnover.toFixed(2) + '次',
        fri_turnover: friTurnover.toFixed(2) + '次',
        sat_turnover: satTurnover.toFixed(2) + '次',
        sun_turnover: sunTurnover.toFixed(2) + '次',

        weekly_total_wan: formatWan(weeklyTotal),
        weekly_total_plain: weeklyTotal,

        monthly_summary: '月均4.3周 × ' + formatWan(weeklyTotal) + '/周 ≈ ' + formatWan(monthlyRevenue) + '/月（日均约' + formatWan(Math.round(dailyRevenue)) + '）',

        // ===== 4. 投资 =====
        total_investment: formatWan(i.totalInvestment),
        total_investment_wan: (i.totalInvestment / 10000) + '万',
        total_investment_raw: i.totalInvestment,
        equipment_investment: formatWan(i.equipmentInvestment),
        equipment_investment_plain: i.equipmentInvestment,
        equipment_investment_wan: (i.equipmentInvestment / 10000) + '万',
        working_capital_wan: formatWan(workingCapital),
        working_capital_plain: workingCapital,
        staff_initial_cost_wan: formatWan(i.staffInitialCost),
        food_initial_cost_wan: formatWan(i.foodInitialCost),

        // ===== 5. 成本 =====
        food_cost: formatNum(foodCost) + '元',
        food_cost_num: foodCost,
        food_cost_pct: i.foodCostPct + '%',
        rent: formatNum(i.rent) + '元',
        rent_plain: i.rent,
        labor_cost: formatNum(i.laborCost) + '元',
        labor_cost_plain: i.laborCost,
        marketing_cost: formatNum(marketingCost) + '元',
        marketing_cost_num: marketingCost,
        marketing_cost_pct: i.marketingPct + '%',
        misc_cost: formatNum(i.miscCost) + '元',
        misc_cost_plain: i.miscCost,
        utility_cost: formatNum(i.utilityCost) + '元',
        utility_cost_plain: i.utilityCost,

        // ===== 7. 利润 =====
        cash_net_profit: formatNum(cashNetProfit) + '元',
        cash_net_profit_num: cashNetProfit,
        cash_net_profit_display: formatNum(cashNetProfit),

        // ===== 8. 三方分账（核心修改） =====
        // 8% = 抖音服务商4% + 运营部门4%，属于流量获客刚性成本
        service_fee: formatNum(serviceFee) + '元',
        service_fee_num: serviceFee,
        service_fee_pct: i.serviceFeePct + '%',
        operation_fee: formatNum(operationFee) + '元',
        operation_fee_num: operationFee,
        operation_pct: i.operationPct + '%',
        total_fee: formatNum(totalFee) + '元',
        total_fee_num: totalFee,
        // 8%说明文案
        fee_8pct_desc: '8% = 抖音服务商4% + 运营部门4%，流量获客刚性成本，等同于食材水电，属于开店必须花的钱',

        dividend_base: formatNum(dividendBase) + '元',
        dividend_base_num: dividendBase,
        dividend_base_display: formatNum(dividendBase),

        // 投资人分红（回本前40%/回本后10%）
        investor_dividend: formatNum(investorPrePayback) + '元',
        investor_dividend_num: investorPrePayback,
        investor_dividend_pre: formatNum(investorPrePayback) + '元',
        investor_dividend_pre_num: investorPrePayback,
        investor_dividend_post: formatNum(investorPostPayback) + '元',
        investor_dividend_post_num: investorPostPayback,
        investor_pct: '回本前40% / 回本后10%',
        investor_pct_pre: '40%',
        investor_pct_post: '10%',

        // 房东：超额累进分成（30万以内10%/超出部分20%）
        landlord_dividend: formatNum(landlordDividend) + '元',
        landlord_dividend_num: landlordDividend,
        landlord_pct: '超额累进（30万以内10% / 超出部分20%）',
        landlord_threshold: formatNum(landlordThreshold) + '元',
        landlord_threshold_num: landlordThreshold,
        landlord_pct_low: '10%（30万以内部分）',
        landlord_pct_high: '20%（超出30万部分）',

        // 老板（运营方）
        operator_income: formatNum(operatorIncomePre) + '元',
        operator_income_num: operatorIncomePre,
        operator_income_wan: (operatorIncomePre / 10000).toFixed(1) + '万',
        operator_income_wan_display: (operatorIncomePre / 10000).toFixed(1) + '万',

        // ===== 11. 回本周期 =====
        payback_result: '老板不投钱，无需回本',
        payback_result_plain: 0,
        investor_payback: Math.ceil(i.totalInvestment / Math.max(1, investorPrePayback)) + '个月',
        investor_payback_plain: Math.ceil(i.totalInvestment / Math.max(1, investorPrePayback)),
        realistic_payback: realisticPayback + '个月（从开业算起）',
        realistic_payback_plain: realisticPayback,
        realistic_payback_from_investment: realisticPaybackFromInvestment + '个月（从出资日算起）',
        realistic_payback_desc: '含2个月装修期+3个月试营业期，从开业第6个月起满额分红（回本前40%），约' + realisticPayback + '个月从开业收回本金，约' + realisticPaybackFromInvestment + '个月从出资日算起',

        // ===== 投资人合伙期限 =====
        investor_term: i.partnerTermMonths + '个月',
        investor_term_plain: i.partnerTermMonths,
        investor_term_year: (i.partnerTermMonths / 12) + '年',
        investor_year1_dividend: formatWan(year1Total),
        investor_year1_dividend_wan: (year1Total / 10000).toFixed(0) + '万',
        investor_year2_dividend: formatWan(year2Total),
        investor_year2_dividend_wan: (year2Total / 10000).toFixed(0) + '万',
        investor_year3_dividend: formatWan(year3Total),
        investor_year3_dividend_wan: (year3Total / 10000).toFixed(0) + '万',
        investor_total_3y: formatWan(investorTotalReturn3y),
        investor_total_3y_wan: (investorTotalReturn3y / 10000).toFixed(0) + '万',
        investor_roi_3y: investorROI + '%',
        investor_monthly_avg: formatWan(investorPrePayback) + '（回本前）/ ' + formatWan(investorPostPayback) + '（回本后）',
        investor_monthly_avg_wan: '回本前' + formatWan(investorPrePayback) + '，回本后' + formatWan(investorPostPayback),

        // ===== 房东收益汇总 =====
        landlord_monthly_income: formatNum(landlordDividend) + '元',
        landlord_monthly_income_wan: (landlordDividend / 10000).toFixed(1) + '万',
        landlord_year1_total: formatWan(landlordDividend * 12),
        landlord_year1_total_wan: ((landlordDividend * 12) / 10000).toFixed(0) + '万',
        landlord_total_3y: formatWan(landlordDividend * 36),
        landlord_total_3y_wan: ((landlordDividend * 36) / 10000).toFixed(0) + '万',
        landlord_dividend_share_wan: ((landlordDividend * 36) / 10000).toFixed(0) + '万',

        // 运营方（老板）收益汇总
        operator_total_3y: formatWan(operatorTotal3y),
        operator_total_3y_wan: (operatorTotal3y / 10000).toFixed(0) + '万',
        operator_monthly_avg_wan: (operatorIncomePre / 10000).toFixed(1) + '万（回本前）/ ' + (operatorIncomePost / 10000).toFixed(1) + '万（回本后）',
        operator_steady_income_wan: (operatorIncomePost / 10000).toFixed(1) + '万',
        operator_year1: formatNum(opYear1) + '元',
        operator_year1_wan: '约' + (opYear1 / 10000).toFixed(0) + '万',
        operator_year2_wan: '约' + (opYear2 / 10000).toFixed(0) + '万',

        // 试营业推演
        trial1_revenue_wan: formatWan(trial1MonthlyRev),
        trial1_revenue_plain: trial1MonthlyRev,
        trial1_expense_wan: (trial1Expense / 10000).toFixed(1) + '万',
        trial1_expense_plain: trial1Expense,
        trial1_profit_wan: (trial1Profit / 10000).toFixed(1) + '万',
        trial1_profit_plain: trial1Profit,
        trial1_fee_wan: (trial1Fee / 10000).toFixed(1) + '万',
        trial1_fee_plain: trial1Fee,

        trial2_revenue_wan: formatWan(trial2MonthlyRev),
        trial2_revenue_plain: trial2MonthlyRev,
        trial2_expense_wan: (trial2Expense / 10000).toFixed(1) + '万',
        trial2_expense_plain: trial2Expense,
        trial2_profit_wan: (trial2Profit / 10000).toFixed(1) + '万',
        trial2_profit_plain: trial2Profit,
        trial2_fee_wan: (trial2Fee / 10000).toFixed(1) + '万',
        trial2_fee_plain: trial2Fee,

        trial3_revenue_wan: formatWan(trial3MonthlyRev),
        trial3_revenue_plain: trial3MonthlyRev,
        trial3_expense_wan: (trial3Expense / 10000).toFixed(1) + '万',
        trial3_expense_plain: trial3Expense,
        trial3_profit_wan: (trial3Profit / 10000).toFixed(1) + '万',
        trial3_profit_plain: trial3Profit,
        trial3_fee_wan: (trial3Fee / 10000).toFixed(1) + '万',
        trial3_fee_plain: trial3Fee,

        // ===== 12. 现金流水 =====
        cash_total_expense: formatNum(cashTotalExpense) + '元',
        cash_total_expense_num: cashTotalExpense,
        equipment_month_expense: formatNum(equipmentMonthExpense) + '元',
        equipment_month_expense_num: equipmentMonthExpense,
        equipment_month_profit: formatNum(equipmentMonthProfit) + '元',
        equipment_month_profit_num: equipmentMonthProfit,

        // ===== 13. 人员架构 =====
        staff_count: i.staffCount + '人',
        staff_count_plain: i.staffCount,
        avg_salary: '≈' + formatNum(avgSalary) + '元',
        avg_salary_plain: avgSalary,
        kitchen_staff: i.kitchenStaff + '人',
        kitchen_staff_plain: i.kitchenStaff,
        kitchen_cost: formatNum(i.kitchenCost) + '元',
        kitchen_cost_plain: i.kitchenCost,
        front_staff: i.frontStaff + '人',
        front_staff_plain: i.frontStaff,
        front_cost: formatNum(i.frontCost) + '元',
        front_cost_plain: i.frontCost,

        // ===== 15. 项目概述 =====
        total_investment_detail: '总硬件投资' + formatWan(i.equipmentInvestment) + '元（含装修/门脸/设备/海鲜池/消防/电力改造，极简工业风+二手设备全包）',
        equipment_investment_detail: '装修设备投入' + formatWan(i.equipmentInvestment),
        staff_initial_investment: '组建前厅后厨人工' + formatWan(i.staffInitialCost),
        food_initial_investment: '预留' + formatWan(i.foodInitialCost) + '采购食材',
        total_investment_summary: '共' + formatWan(i.totalInvestment),
      };

      return this.values;
    },

    // ==================== 渲染到页面 ====================
    _initialized: false,
    render: function() {
      if (!this._initialized) {
        this.loadFromHTML();
        this._initialized = true;
      }
      this.calculate();
      var els = document.querySelectorAll('[data-model]');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var key = el.dataset.model;
        if (key && this.values[key] !== undefined) {
          el.textContent = this.values[key];
        }
      }
    },

    // ==================== 从 HTML 加载持久化变量值 ====================
    loadFromHTML: function() {
      var el = document.getElementById('bp-saved-vars');
      if (!el) return false;
      try {
        var data = JSON.parse(el.textContent);
        if (data && data.inputs) {
          Object.keys(data.inputs).forEach(function(k) {
            if (data.inputs[k] !== undefined && data.inputs[k] !== null && BusinessModel.inputs[k] !== undefined) {
              BusinessModel.inputs[k] = Number(data.inputs[k]);
            }
          });
          return true;
        }
      } catch(e) {
        // 静默失败，使用默认值
      }
      return false;
    },

    // ==================== 显示键 -> 输入键映射 ====================
    // data-model 属性值（显示键）可能和 inputs 的键名不一致，需要映射
    displayKeyMap: {
      'area': 'area',
      'price': 'price',
      'mon_thu_plain': 'monThuRev',
      'fri_plain': 'friRev',
      'sat_plain': 'satRev',
      'sun_plain': 'sunRev',
      'total_investment': 'totalInvestment',
      'equipment_investment': 'equipmentInvestment',
      'food_cost_pct': 'foodCostPct',
      'rent_plain': 'rent',
      'labor_cost_plain': 'laborCost',
      'misc_cost_plain': 'miscCost',
      'utility_cost_plain': 'utilityCost',
      'kitchen_staff_plain': 'kitchenStaff',
      'kitchen_cost_plain': 'kitchenCost',
      'front_staff_plain': 'frontStaff',
      'front_cost_plain': 'frontCost',
      'staff_count_plain': 'staffCount',
      'table_count_plain': 'tableCount',
      'service_fee_pct': 'serviceFeePct',
      'operation_pct': 'operationPct',
      'marketing_cost_pct': 'marketingPct',
      // 注意：investor_dividend_pre_num / investor_dividend_post_num 是计算后的金额，不是输入百分比，不可编辑
      'staff_initial_cost_wan': 'staffInitialCost',
      'food_initial_cost_wan': 'foodInitialCost',
      'total_investment_raw': 'totalInvestment',
      'equipment_investment_plain': 'equipmentInvestment',
      'investor_term_plain': 'partnerTermMonths',
    },

    // ==================== 根据显示键获取输入键 ====================
    // 用于判断 data-model 元素是否可编辑（输入变量）
    getInputKey: function(displayKey) {
      // 先看是否直接是 inputs 的键
      if (this.inputs[displayKey] !== undefined) return displayKey;
      // 再看映射表
      var mapped = this.displayKeyMap[displayKey];
      if (mapped && this.inputs[mapped] !== undefined) return mapped;
      return null;
    },

    // ==================== 获取输入变量 ====================
    getInputs: function() {
      var out = {};
      var keys = Object.keys(this.inputs);
      for (var i = 0; i < keys.length; i++) {
        out[keys[i]] = this.inputs[keys[i]];
      }
      return out;
    },

    // ==================== 设置输入变量并重算 ====================
    setInputs: function(inputs) {
      this.calculate(inputs);
      this.render();
    },

    // ==================== 获取所有值 ====================
    getAllValues: function() {
      this.calculate();
      var out = {};
      var inputs = this.getInputs();
      Object.keys(inputs).forEach(function(k) { out[k] = inputs[k]; });
      Object.keys(this.values).forEach(function(k) { out[k] = BusinessModel.values[k]; });
      return out;
    }
  };

  if (typeof window !== 'undefined') {
    window.BusinessModel = BusinessModel;
  }
})();
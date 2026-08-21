/**
 * 海鲜自助项目 - 商业模型计算引擎（通用模板）
 * 定义所有输入变量和计算逻辑，确保数据一致性
 * 任何项目只需填写输入变量，所有衍生值自动计算
 * 前端使用：BusinessModel 对象
 * 后端使用：BusinessModelCalculator 类
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
    // ----- 通用输入变量（修改此处即可适配任何项目）-----
    inputs: {
      // 核心参数
      area: 2000,               // 总面积 ㎡
      price: 169,               // 人均定价 元
      dailyRevenue: 60000,      // 日均核销营业额 元
      totalInvestment: 1000000, // 总投资 元
      equipmentInvestment: 700000, // 装修设备投资 元

      // 成本参数
      foodCostPct: 48,          // 食材成本率 %（固定48%）
      rent: 0,                  // 房租 元/月（房东无固定租金，改为利润分成）
      laborCost: 192500,        // 人工成本 元/月（38人，含社保餐宿）
      marketingPct: 3,          // 营销费率 %
      miscCost: 60000,          // 杂费 元/月

      // 分账参数
      serviceFeePct: 4,         // 服务商抽成（成交额%）%
      operationPct: 4,          // 运营部门分成（成交额%）%
      investorPctYear1: 15,     // 投资人分红 - 第1-12月 %
      investorPct: 11,          // 投资人分红 - 第13-36月 %
      landlordProfitPct: 12,    // 房东利润分成（阈值触发：≥30万→12%，<30万→8%）%
      partnerTermMonths: 36,    // 投资人合伙期限（月）

      // 扩展参数（通用模板）
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

      // ========== 基础计算 ==========
      var monthlyRevenue = Math.round(i.dailyRevenue * 30);
      var foodCost = Math.round(monthlyRevenue * i.foodCostPct / 100);
      var marketingCost = Math.round(monthlyRevenue * i.marketingPct / 100);
      var cashTotalExpense = i.laborCost + foodCost + i.rent + marketingCost + i.miscCost + i.utilityCost;
      var cashNetProfit = monthlyRevenue - cashTotalExpense;
      var serviceFee = Math.round(monthlyRevenue * i.serviceFeePct / 100);
      var operationFee = Math.round(monthlyRevenue * i.operationPct / 100);
      var totalFee = serviceFee + operationFee;
      // 分红基数 = 现金净利润 - 两费（设备款已由投资人一次性支付，不重复扣减）
      var dividendBase = cashNetProfit - totalFee;
      // 投资人：第1-12月 15%，第13-36月 11%
      var investorDividendYear1 = Math.round(dividendBase * i.investorPctYear1 / 100);
      var investorDividend = Math.round(dividendBase * i.investorPct / 100);
      // 房东：利润阈值触发分成（≥30万→12%，<30万→8%）
      var profitThreshold = 300000;
      var landlordProfitPct = dividendBase >= profitThreshold ? 12 : 8;
      var landlordDividend = Math.round(dividendBase * landlordProfitPct / 100);
      var operatorIncome = dividendBase - investorDividend - landlordDividend;

      // 回本相关（老板不投钱，无需计算回本周期）

      // ========== 周度营收分解（日均6万，各天均衡） ==========
      var monThuDaily = i.dailyRevenue;
      var friDaily = i.dailyRevenue;
      var satDaily = i.dailyRevenue;
      var sunDaily = i.dailyRevenue;
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

      // ========== 试营业推演（3个月逐渐上升到6万） ==========
      var trial1MonthlyRev = Math.round(monthlyRevenue * 0.50); // 第1月 3万/天
      var trial1Expense = Math.round(monthlyRevenue * 0.75);
      var trial1Profit = trial1MonthlyRev - trial1Expense;
      var trial1Fee = Math.round(trial1MonthlyRev * (i.serviceFeePct + i.operationPct) / 100);
      trial1Profit = trial1Profit - trial1Fee;
      // 第1月亏损，无分红

      var trial2MonthlyRev = Math.round(monthlyRevenue * 0.67); // 第2月 4万/天
      var trial2Expense = Math.round(monthlyRevenue * 0.78);
      var trial2Profit = trial2MonthlyRev - trial2Expense;
      var trial2Fee = Math.round(trial2MonthlyRev * (i.serviceFeePct + i.operationPct) / 100);
      trial2Profit = trial2Profit - trial2Fee;

      var trial3MonthlyRev = Math.round(monthlyRevenue * 0.83); // 第3月 5万/天
      var trial3Expense = Math.round(monthlyRevenue * 0.82);
      var trial3Profit = trial3MonthlyRev - trial3Expense;
      var trial3Fee = Math.round(trial3MonthlyRev * (i.serviceFeePct + i.operationPct) / 100);
      trial3Profit = trial3Profit - trial3Fee;

      // ========== 现金流水 ==========
      var equipmentMonthExpense = cashTotalExpense + i.equipmentInvestment;
      var equipmentMonthProfit = monthlyRevenue - equipmentMonthExpense;

      // ========== 第2-3年稳态（投资人降为11%） ==========
      var steadyInvestorDividend = Math.round(dividendBase * i.investorPct / 100);
      var steadyLandlordProfitPct = dividendBase >= profitThreshold ? 12 : 8;
      var steadyLandlordDividend = Math.round(dividendBase * steadyLandlordProfitPct / 100);
      var steadyOperatorIncome = dividendBase - steadyInvestorDividend - steadyLandlordDividend;

      // ========== 投资人3年总收益 ==========
      var investorYear1 = investorDividendYear1 * 12;
      var investorYear2 = steadyInvestorDividend * 12;
      var investorYear3 = steadyInvestorDividend * 12;
      var investorTotalReturn3y = investorYear1 + investorYear2 + investorYear3;
      var investorROI = (investorTotalReturn3y / i.totalInvestment * 100).toFixed(0);

      // ========== 人均薪酬 ==========
      var avgSalary = Math.round(i.laborCost / i.staffCount);

      // ========== 最大容量 ==========
      var maxCapacity = Math.round(i.tableCount * 4);
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
        daily_revenue: formatWan(i.dailyRevenue),
        daily_revenue_plain: i.dailyRevenue,
        monthly_revenue: formatWan(monthlyRevenue),
        monthly_revenue_num: formatNum(monthlyRevenue) + '元',
        monthly_revenue_raw: monthlyRevenue,
        weekly_revenue: formatWan(Math.round(monthlyRevenue / 4.3)),

        // 周度分解
        mon_thu_wan: (monThuDaily / 10000).toFixed(1) + '万',
        mon_thu_plain: monThuDaily,
        fri_wan: (friDaily / 10000).toFixed(1) + '万',
        fri_plain: friDaily,
        sat_wan: (satDaily / 10000).toFixed(1) + '万',
        sat_plain: satDaily,
        sun_wan: (sunDaily / 10000).toFixed(1) + '万',
        sun_plain: sunDaily,

        // 客流
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

        // 翻台率
        mon_thu_turnover: monThuTurnover.toFixed(2) + '次',
        fri_turnover: friTurnover.toFixed(2) + '次',
        sat_turnover: satTurnover.toFixed(2) + '次',
        sun_turnover: sunTurnover.toFixed(2) + '次',

        // 周合计
        weekly_total_wan: formatWan(weeklyTotal),
        weekly_total_plain: weeklyTotal,

        // 月度汇总文字
        monthly_summary: '月均4.3周 × ' + formatWan(weeklyTotal) + '/周 ≈ ' + formatWan(monthlyRevenue) + '/月（日均约' + formatWan(i.dailyRevenue) + '）',

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

        // ===== 8. 三方分账 =====
        service_fee: formatNum(serviceFee) + '元',
        service_fee_num: serviceFee,
        service_fee_pct: i.serviceFeePct + '%',
        operation_fee: formatNum(operationFee) + '元',
        operation_fee_num: operationFee,
        operation_pct: i.operationPct + '%',
        total_fee: formatNum(totalFee) + '元',
        total_fee_num: totalFee,
        dividend_base: formatNum(dividendBase) + '元',
        dividend_base_num: dividendBase,
        // 投资人分红（第1年15%）
        investor_dividend: formatNum(investorDividendYear1) + '元',
        investor_dividend_num: investorDividendYear1,
        investor_pct: '15%（第1-12月）/ 11%（第13-36月）',
        // 房东：利润阈值触发分成（≥30万→12%，<30万→8%）
        landlord_dividend: formatNum(landlordDividend) + '元',
        landlord_dividend_num: landlordDividend,
        landlord_pct: '利润阈值触发（≥30万→12% / <30万→8%）',
        landlord_threshold: formatNum(profitThreshold) + '元',
        landlord_threshold_num: profitThreshold,
        landlord_pct_high: '12%（纯利润≥30万/月）',
        landlord_pct_low: '8%（纯利润<30万/月）',
        operator_income: formatNum(operatorIncome) + '元',
        operator_income_num: operatorIncome,
        operator_income_wan: (operatorIncome / 10000).toFixed(1) + '万',
        operator_income_wan_display: (operatorIncome / 10000).toFixed(1) + '万',
        operator_year1: formatNum(operatorIncome * 12) + '元',
        operator_year1_wan: '约' + ((operatorIncome * 12) / 10000).toFixed(0) + '万',
        operator_year2_wan: '约' + ((steadyOperatorIncome * 12) / 10000).toFixed(0) + '万',

        // ===== 10. （已删除悲观情景，食材成本固定48%） =====

        // ===== 11. 回本周期（老板不投钱，仅显示投资人数据） =====
        payback_result: '老板不投钱，无需回本',
        payback_result_plain: 0,
        investor_payback: Math.ceil(i.totalInvestment / Math.max(1, investorDividendYear1)) + '个月',
        investor_payback_plain: Math.ceil(i.totalInvestment / Math.max(1, investorDividendYear1)),

        // ===== 投资人合伙期限 =====
        investor_term: i.partnerTermMonths + '个月',
        investor_term_plain: i.partnerTermMonths,
        investor_term_year: (i.partnerTermMonths / 12) + '年',
        investor_year1_dividend: formatWan(investorYear1),
        investor_year1_dividend_wan: (investorYear1 / 10000).toFixed(0) + '万',
        investor_year2_dividend: formatWan(investorYear2),
        investor_year2_dividend_wan: (investorYear2 / 10000).toFixed(0) + '万',
        investor_year3_dividend: formatWan(investorYear3),
        investor_year3_dividend_wan: (investorYear3 / 10000).toFixed(0) + '万',
        investor_total_3y: formatWan(investorTotalReturn3y),
        investor_total_3y_wan: (investorTotalReturn3y / 10000).toFixed(0) + '万',
        investor_roi_3y: investorROI + '%',
        investor_monthly_avg: formatWan(investorDividendYear1) + '（第1年）/ ' + formatWan(steadyInvestorDividend) + '（第2-3年）',
        investor_monthly_avg_wan: '第1年' + formatWan(investorDividendYear1) + '，第2-3年' + formatWan(steadyInvestorDividend),

        // ===== 房东收益汇总（无固定租金，纯分成） =====
        landlord_monthly_income: formatNum(landlordDividend) + '元',
        landlord_monthly_income_wan: (landlordDividend / 10000).toFixed(1) + '万',
        landlord_year1_total: formatWan(landlordDividend * 12),
        landlord_year1_total_wan: ((landlordDividend * 12) / 10000).toFixed(0) + '万',
        landlord_total_3y: formatWan(landlordDividend * 12 + steadyLandlordDividend * 24),
        landlord_total_3y_wan: ((landlordDividend * 12 + steadyLandlordDividend * 24) / 10000).toFixed(0) + '万',
        landlord_dividend_share_wan: ((landlordDividend * 12 + steadyLandlordDividend * 24) / 10000).toFixed(0) + '万',

        // ===== 运营方（老板）收益汇总 =====
        operator_total_3y: formatWan(operatorIncome * 12 + steadyOperatorIncome * 24),
        operator_total_3y_wan: ((operatorIncome * 12 + steadyOperatorIncome * 24) / 10000).toFixed(0) + '万',
        operator_monthly_avg_wan: (operatorIncome / 10000).toFixed(1) + '万（第1年）/ ' + (steadyOperatorIncome / 10000).toFixed(1) + '万（第2-3年）',
        operator_steady_income_wan: (steadyOperatorIncome / 10000).toFixed(1) + '万',

        // 试营业推演（3个月逐渐上升）
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
    render: function() {
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

    // ==================== 获取所有值（含输入和计算） ====================
    getAllValues: function() {
      this.calculate();
      var out = {};
      var inputs = this.getInputs();
      Object.keys(inputs).forEach(function(k) { out[k] = inputs[k]; });
      Object.keys(this.values).forEach(function(k) { out[k] = BusinessModel.values[k]; });
      return out;
    }
  };

  // ==================== 服务端计算引擎（Node.js 版本） ====================
  if (typeof module !== 'undefined' && module.exports) {
    // 导出默认输入变量，供同步脚本使用
    var defaultInputs = {};
    var inputKeys = Object.keys(BusinessModel.inputs);
    for (var di = 0; di < inputKeys.length; di++) {
      defaultInputs[inputKeys[di]] = BusinessModel.inputs[inputKeys[di]];
    }

    module.exports = {
      defaultInputs: defaultInputs,
      calculate: function(inputs) {
        // 复制一份计算逻辑供服务端使用
        var i = Object.assign({
          area: 2000, price: 169, dailyRevenue: 60000,
          totalInvestment: 1000000, equipmentInvestment: 700000,
          foodCostPct: 48, rent: 0, laborCost: 192500,
          marketingPct: 3, miscCost: 60000, serviceFeePct: 4,
          operationPct: 4, investorPctYear1: 15, investorPct: 11,
          landlordProfitPct: 12,
          tableCount: 120, seatsPerTable: 2.8, staffCount: 38,
          utilityCost: 60000, kitchenStaff: 22, kitchenCost: 105000,
          frontStaff: 16, frontCost: 75000,
          staffInitialCost: 200000, foodInitialCost: 100000
        }, inputs || {});

        // 计算中间值
        var monthlyRevenue = Math.round(i.dailyRevenue * 30);
        var foodCost = Math.round(monthlyRevenue * i.foodCostPct / 100);
        var marketingCost = Math.round(monthlyRevenue * i.marketingPct / 100);
        var cashTotalExpense = i.laborCost + foodCost + i.rent + marketingCost + i.miscCost + i.utilityCost;
        var cashNetProfit = monthlyRevenue - cashTotalExpense;
        var serviceFee = Math.round(monthlyRevenue * i.serviceFeePct / 100);
        var operationFee = Math.round(monthlyRevenue * i.operationPct / 100);
        var totalFee = serviceFee + operationFee;
        var dividendBase = cashNetProfit - totalFee;
        var investorDividendYear1 = Math.round(dividendBase * i.investorPctYear1 / 100);
        var investorDividend = Math.round(dividendBase * i.investorPct / 100);
        // 房东：利润阈值触发分成（≥30万→12%，<30万→8%）
        var profitThreshold = 300000;
        var landlordProfitPct = dividendBase >= profitThreshold ? 12 : 8;
        var landlordDividend = Math.round(dividendBase * landlordProfitPct / 100);
        var operatorIncome = dividendBase - investorDividend - landlordDividend;

        // 周度营收（各天均衡6万）
        var monThuDaily = i.dailyRevenue;
        var friDaily = i.dailyRevenue;
        var satDaily = i.dailyRevenue;
        var sunDaily = i.dailyRevenue;
        var weeklyTotal = monThuDaily * 4 + friDaily + satDaily + sunDaily;
        var monThuCustomers = Math.round(monThuDaily / i.price);
        var friCustomers = Math.round(friDaily / i.price);
        var satCustomers = Math.round(satDaily / i.price);
        var sunCustomers = Math.round(sunDaily / i.price);
        var weeklyCustomers = monThuCustomers * 4 + friCustomers + satCustomers + sunCustomers;
        var tableCapacity = i.tableCount * i.seatsPerTable;

        // 试营业推演（3个月逐渐上升）
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

        // 现金流水
        var equipmentMonthExpense = cashTotalExpense + i.equipmentInvestment;
        var equipmentMonthProfit = monthlyRevenue - equipmentMonthExpense;

        // 第2-3年稳态（投资人降为11%）
        var steadyInvestorDividend = Math.round(dividendBase * i.investorPct / 100);
        var steadyLandlordProfitPct = dividendBase >= profitThreshold ? 12 : 8;
        var steadyLandlordDividend = Math.round(dividendBase * steadyLandlordProfitPct / 100);
        var steadyOperatorIncome = dividendBase - steadyInvestorDividend - steadyLandlordDividend;

        // 试营业推演（3个月逐渐上升）

        return {
          // 原始中间值
          monthlyRevenue: monthlyRevenue,
          foodCost: foodCost,
          marketingCost: marketingCost,
          cashTotalExpense: cashTotalExpense,
          cashNetProfit: cashNetProfit,
          serviceFee: serviceFee,
          service_fee: serviceFee,
          operation_fee: operationFee,
          operation_pct: i.operationPct,
          total_fee: totalFee,
          dividendBase: dividendBase,
          investorDividend: investorDividendYear1,
          investorDividendYear1: investorDividendYear1,
          investorDividendSteady: investorDividend,
          landlordDividend: landlordDividend,
          operatorIncome: operatorIncome,
          dailyRevenue: i.dailyRevenue,

          // 周度
          monThuDaily: monThuDaily, friDaily: friDaily, satDaily: satDaily, sunDaily: sunDaily,
          weeklyTotal: weeklyTotal,
          monThuCustomers: monThuCustomers, friCustomers: friCustomers,
          satCustomers: satCustomers, sunCustomers: sunCustomers,
          weeklyCustomers: weeklyCustomers,
          monThuTurnover: (monThuCustomers / tableCapacity),
          friTurnover: (friCustomers / tableCapacity),
          satTurnover: (satCustomers / tableCapacity),
          sunTurnover: (sunCustomers / tableCapacity),
          tableCapacity: tableCapacity,

          // 试营业
          trial1MonthlyRev: trial1MonthlyRev, trial1Expense: trial1Expense,
          trial1Profit: trial1Profit, trial1Fee: trial1Fee,
          trial2MonthlyRev: trial2MonthlyRev, trial2Expense: trial2Expense,
          trial2Profit: trial2Profit, trial2Fee: trial2Fee,
          trial3MonthlyRev: trial3MonthlyRev, trial3Expense: trial3Expense,
          trial3Profit: trial3Profit, trial3Fee: trial3Fee,

          // 现金流水
          cashTotalExpense: cashTotalExpense,
          equipmentMonthExpense: equipmentMonthExpense,
          equipmentMonthProfit: equipmentMonthProfit,

          // 第2-3年稳态
          steadyInvestorDividend: steadyInvestorDividend,
          steadyLandlordDividend: steadyLandlordDividend,
          steadyOperatorIncome: steadyOperatorIncome,

          // 回本
          // 回本 - 老板不投钱，无需计算

          // 流动资金
          workingCapital: i.totalInvestment - i.equipmentInvestment,

          // 人员
          avgSalary: Math.round(i.laborCost / i.staffCount),
          maxCapacity: Math.round(i.tableCount * 4),
          diningArea: Math.round(i.area * 0.475),
          tableAreaPerTable: Math.round(Math.round(i.area * 0.475) / i.tableCount * 10) / 10,
        };
      }
    };
  }

  // 导出到全局（兼容 Node.js 环境）
  if (typeof window !== 'undefined') {
    window.BusinessModel = BusinessModel;
  }
})();
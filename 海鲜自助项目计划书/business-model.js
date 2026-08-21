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
      totalInvestment: 800000,  // 总投资 元
      equipmentInvestment: 500000, // 装修设备投资 元

      // 成本参数
      foodCostPct: 45,          // 食材成本率 %
      rent: 0,                  // 房租 元/月（房东无固定租金，改为利润分成/流水保底）
      laborCost: 190000,        // 人工成本 元/月（38人编制，含社保、食宿、高峰兼职、加班工资）
      marketingPct: 3,          // 营销费率 %
      miscCost: 60000,          // 杂费 元/月

      // 分账参数（现⾦净利润为基数，不扣设备摊销）
      serviceFeePct: 4,         // 服务商抽成（成交额%）%
      operationPct: 4,          // 运营部门分成（成交额%）%
      investorPctYear1: 15,     // 投资人分红 % 第1-12个月（新店高风险，加速回本）
      investorPctYear2: 11,     // 投资人分红 % 第13-36个月（门店稳定，长期稳收益）
      landlordRevenuePct: 8,    // 房东流水保底 %（当月营业额×8%，淡季兜底）
      landlordProfitPct: 12,    // 房东利润分红 %（当月可分配纯利×12%，旺季增收）
      paybackMonths: 12,        // 硬件分摊月数（仅内部考核，不分红基数）
      partnerTermMonths: 36,    // 投资人合伙期限（月）

      // 扩展参数（通用模板）
      tableCount: 120,          // 桌数
      seatsPerTable: 2.8,       // 每桌平均人数
      staffCount: 38,           // 团队编制
      utilityCost: 60000,       // 水电燃气耗材维保 元/月
      kitchenStaff: 22,         // 后厨人数
      kitchenCost: 110000,      // 后厨月度总成本 元
      frontStaff: 16,           // 前厅人数
      frontCost: 80000,         // 前厅月度总成本 元
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
      var equipmentAmort = Math.round(i.equipmentInvestment / i.paybackMonths);
      var foodCost = Math.round(monthlyRevenue * i.foodCostPct / 100);
      var marketingCost = Math.round(monthlyRevenue * i.marketingPct / 100);
      // 经营考核口径总支出（含设备摊销，仅内部考核用）
      var totalExpense = i.laborCost + foodCost + i.rent + marketingCost + i.miscCost + equipmentAmort;
      var operatingProfit = monthlyRevenue - totalExpense;
      // 现金净利润 = 经营利润 + 设备摊销（不扣设备摊销，分红基数）
      var cashNetProfit = operatingProfit + equipmentAmort;
      var serviceFee = Math.round(monthlyRevenue * i.serviceFeePct / 100);
      var operationFee = Math.round(monthlyRevenue * i.operationPct / 100);
      var totalFee = serviceFee + operationFee;
      // 分账基数 = 现金净利润 − 服务费（不扣设备摊销）
      var cashProfitAfterFees = cashNetProfit - totalFee;
      // 投资人第1-12个月：15%
      var investorDividend = Math.round(cashProfitAfterFees * i.investorPctYear1 / 100);
      // 房东双向择优：流水保底(营业额×8%) vs 利润分红(纯利×12%)
      var landlordRevenueShare = Math.round(monthlyRevenue * i.landlordRevenuePct / 100);
      var landlordProfitShare = Math.round(cashProfitAfterFees * i.landlordProfitPct / 100);
      var landlordDividend = Math.max(landlordRevenueShare, landlordProfitShare);
      var operatorIncome = cashProfitAfterFees - investorDividend - landlordDividend;

      // 悲观情景：食材涨至48%
      var pessimisticFoodCost = Math.round(monthlyRevenue * 0.48);
      var pessimisticTotalExpense = i.laborCost + pessimisticFoodCost + i.rent + marketingCost + i.miscCost + equipmentAmort;
      var pessimisticOperatingProfit = monthlyRevenue - pessimisticTotalExpense;
      var pessimisticCashNetProfit = pessimisticOperatingProfit + equipmentAmort;
      var pessimisticFee = Math.round(monthlyRevenue * (i.serviceFeePct + i.operationPct) / 100);
      var pessimisticCashProfitAfterFees = pessimisticCashNetProfit - pessimisticFee;
      var pessimisticInvestorDividend = Math.round(pessimisticCashProfitAfterFees * i.investorPctYear1 / 100);
      var pessimisticLandlordRevenueShare = Math.round(monthlyRevenue * i.landlordRevenuePct / 100);
      var pessimisticLandlordProfitShare = Math.round(pessimisticCashProfitAfterFees * i.landlordProfitPct / 100);
      var pessimisticLandlordDividend = Math.max(pessimisticLandlordRevenueShare, pessimisticLandlordProfitShare);
      var pessimisticOperatorIncome = pessimisticCashProfitAfterFees - pessimisticInvestorDividend - pessimisticLandlordDividend;

      // 回本相关（老板不投钱，无需计算回本周期）

      // ========== 周度营收分解 ==========
      // 日均稳定6万，取消大幅波动
      var monThuDaily = i.dailyRevenue;
      var friDaily = i.dailyRevenue;
      var satDaily = i.dailyRevenue;
      var sunDaily = i.dailyRevenue;
      var weeklyTotal = monThuDaily * 7;

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

      // ========== 设备分摊明细 ==========
      var hardAssetPct = 0.646;
      var furnitureAssetPct = 0.24;
      var hardAsset = Math.round(i.equipmentInvestment * hardAssetPct);
      var furnitureAsset = Math.round(i.equipmentInvestment * furnitureAssetPct);
      var suppliesAsset = i.equipmentInvestment - hardAsset - furnitureAsset;
      var hardAmort = Math.round(hardAsset / i.paybackMonths);
      var furnitureAmort = Math.round(furnitureAsset / i.paybackMonths);
      var suppliesAmort = Math.round(suppliesAsset / i.paybackMonths);

      // ========== 试营业推演（3个月爬坡） ==========
      var trial1MonthlyRev = Math.round(monthlyRevenue * 0.33);
      var trial1Expense = Math.round(trial1MonthlyRev * 0.85);
      var trial1Fee = Math.round(trial1MonthlyRev * (i.serviceFeePct + i.operationPct) / 100);
      var trial1AfterFees = trial1MonthlyRev - trial1Expense - trial1Fee;

      var trial2MonthlyRev = Math.round(monthlyRevenue * 0.67);
      var trial2Expense = Math.round(trial2MonthlyRev * 0.80);
      var trial2Fee = Math.round(trial2MonthlyRev * (i.serviceFeePct + i.operationPct) / 100);
      var trial2AfterFees = trial2MonthlyRev - trial2Expense - trial2Fee;

      // ========== 现金流水 ==========
      var cashTotalExpense = i.laborCost + foodCost + i.rent + marketingCost + i.miscCost;
      var equipmentMonthExpense = cashTotalExpense + i.equipmentInvestment;
      var equipmentMonthProfit = monthlyRevenue - equipmentMonthExpense;

      // ========== 第13个月起（投资人分红降⾄11%） ==========
      var postAmortInvestorDividend = Math.round(cashProfitAfterFees * i.investorPctYear2 / 100);
      var postAmortLandlordDividend = Math.max(landlordRevenueShare, Math.round(cashProfitAfterFees * i.landlordProfitPct / 100));
      var postAmortOperatorIncome = cashProfitAfterFees - postAmortInvestorDividend - postAmortLandlordDividend;

      // ========== 投资人3年总收益 ==========
      var investorYear1 = investorDividend * 12;
      var investorYear2 = postAmortInvestorDividend * 12;
      var investorYear3 = postAmortInvestorDividend * 12;
      var investorTotalReturn3y = investorYear1 + investorYear2 + investorYear3;
      var investorROI = (investorTotalReturn3y / i.totalInvestment * 100).toFixed(0);

      // ========== 悲观 vs 理想对比 ==========
      var pessimisticVsIdealMonthly = operatorIncome - pessimisticOperatorIncome;
      var pessimisticVsIdealAnnual = pessimisticVsIdealMonthly * 12;
      var pessimisticPaybackPeriod = '约18个月（投资人）';

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

        // ===== 5. 硬件分摊 =====
        equipment_amortization: formatNum(equipmentAmort) + '元',
        equipment_amortization_num: equipmentAmort,
        equipment_amortization_short: formatNum(equipmentAmort),
        equipment_amortization_months: i.paybackMonths + '个月',
        equipment_amortization_months_plain: i.paybackMonths,

        // 设备明细
        hard_asset: formatNum(hardAsset) + '元',
        hard_asset_plain: hardAsset,
        hard_amort_amount: formatNum(hardAmort) + '元/月',
        hard_amort_plain: hardAmort,
        furniture_asset: formatNum(furnitureAsset) + '元',
        furniture_asset_plain: furnitureAsset,
        furniture_amort_amount: formatNum(furnitureAmort) + '元/月',
        furniture_amort_plain: furnitureAmort,
        supplies_asset: formatNum(suppliesAsset) + '元',
        supplies_asset_plain: suppliesAsset,
        supplies_amort_amount: formatNum(suppliesAmort) + '元/月',
        supplies_amort_plain: suppliesAmort,

        // ===== 6. 成本 =====
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

        // ===== 7. 经营口径总支出 =====
        total_operating_expense: formatNum(totalExpense) + '元',
        total_operating_expense_num: totalExpense,

        // ===== 8. 利润 =====
        operating_profit: formatNum(operatingProfit) + '元',
        operating_profit_num: operatingProfit,
        operating_profit_display: formatNum(operatingProfit),
        cash_net_profit: formatNum(cashNetProfit) + '元',
        cash_net_profit_num: cashNetProfit,
        cash_net_profit_display: formatNum(cashNetProfit),

        // ===== 9. 三方分账 =====
        service_fee: formatNum(serviceFee) + '元',
        service_fee_num: serviceFee,
        service_fee_pct: i.serviceFeePct + '%',
        operation_fee: formatNum(operationFee) + '元',
        operation_fee_num: operationFee,
        operation_pct: i.operationPct + '%',
        total_fee: formatNum(totalFee) + '元',
        total_fee_num: totalFee,
        profit_after_fees: formatNum(cashProfitAfterFees) + '元',
        profit_after_fees_num: cashProfitAfterFees,
        investor_dividend: formatNum(investorDividend) + '元',
        investor_dividend_num: investorDividend,
        investor_pct: i.investorPctYear1 + '%（第1年）/ ' + i.investorPctYear2 + '%（第2-3年）',
        landlord_dividend: formatNum(landlordDividend) + '元',
        landlord_dividend_num: landlordDividend,
        landlord_revenue_share: formatNum(landlordRevenueShare) + '元',
        landlord_profit_share: formatNum(landlordProfitShare) + '元',
        landlord_pct: '流水保底' + i.landlordRevenuePct + '% / 利润分红' + i.landlordProfitPct + '%（取高值）',
        operator_income: formatNum(operatorIncome) + '元',
        operator_income_num: operatorIncome,
        operator_income_wan: (operatorIncome / 10000).toFixed(1) + '万',
        operator_income_wan_display: (operatorIncome / 10000).toFixed(1) + '万',
        operator_year1: formatNum(operatorIncome * 12) + '元',
        operator_year1_wan: '约' + ((operatorIncome * 12) / 10000).toFixed(0) + '万',
        operator_year2_wan: '约' + ((postAmortOperatorIncome * 12) / 10000).toFixed(0) + '万',

        // ===== 10. 悲观情景（完整） =====
        pessimistic_food_cost: formatNum(pessimisticFoodCost) + '元',
        pessimistic_food_cost_num: pessimisticFoodCost,
        pessimistic_food_cost_pct: '48%',
        pessimistic_total_expense: formatNum(pessimisticTotalExpense) + '元',
        pessimistic_total_expense_num: pessimisticTotalExpense,
        pessimistic_operating_profit: formatNum(pessimisticOperatingProfit) + '元',
        pessimistic_operating_profit_num: pessimisticOperatingProfit,
        pessimistic_profit_after_fees: formatNum(pessimisticCashProfitAfterFees) + '元',
        pessimistic_operator_income: '约 ' + (pessimisticOperatorIncome / 10000).toFixed(1) + ' 万',
        pessimistic_operator_income_wan: (pessimisticOperatorIncome / 10000).toFixed(1) + '万',
        pessimistic_operator_income_plain: pessimisticOperatorIncome,
        pessimistic_vs_ideal_diff: (pessimisticVsIdealMonthly / 10000).toFixed(1) + '万',
        pessimistic_vs_ideal_diff_plain: pessimisticVsIdealMonthly,
        pessimistic_vs_ideal_annual: (pessimisticVsIdealAnnual / 10000).toFixed(0) + '万',
        pessimistic_payback: pessimisticPaybackPeriod,

        // ===== 11. 回本周期（老板不投钱，仅显示投资人数据） =====
        payback_months: i.paybackMonths,
        payback_result: '老板不投钱，无需回本',
        payback_result_plain: 0,
        investor_payback: Math.ceil(i.totalInvestment / Math.max(1, investorDividend)) + '个月',
        investor_payback_plain: Math.ceil(i.totalInvestment / Math.max(1, investorDividend)),

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
        investor_monthly_avg: formatWan(investorDividend) + '（第1年15%）/ ' + formatWan(postAmortInvestorDividend) + '（第2-3年11%）',
        investor_monthly_avg_wan: '第1年15%→' + formatWan(investorDividend) + '，第2-3年11%→' + formatWan(postAmortInvestorDividend),

        // ===== 房东收益汇总 =====
        landlord_monthly_income: formatNum(landlordDividend) + '元',
        landlord_monthly_income_wan: (landlordDividend / 10000).toFixed(1) + '万',
        landlord_revenue_share_wan: (landlordRevenueShare / 10000).toFixed(1) + '万',
        landlord_profit_share_wan: (landlordProfitShare / 10000).toFixed(1) + '万',
        landlord_choose_max: '取高值：' + formatWan(landlordDividend),
        landlord_monthly_post_amort_wan: (postAmortLandlordDividend / 10000).toFixed(1) + '万',
        landlord_year1_total: formatWan(landlordDividend * 12),
        landlord_year1_total_wan: ((landlordDividend * 12) / 10000).toFixed(0) + '万',
        landlord_total_3y: formatWan(landlordDividend * 12 + postAmortLandlordDividend * 24),
        landlord_total_3y_wan: ((landlordDividend * 12 + postAmortLandlordDividend * 24) / 10000).toFixed(0) + '万',

        // ===== 运营方（老板）收益汇总 =====
        operator_total_3y: formatWan(operatorIncome * 12 + postAmortOperatorIncome * 24),
        operator_total_3y_wan: ((operatorIncome * 12 + postAmortOperatorIncome * 24) / 10000).toFixed(0) + '万',
        operator_monthly_avg_wan: (operatorIncome / 10000).toFixed(1) + '万（第1年）/ ' + (postAmortOperatorIncome / 10000).toFixed(1) + '万（第2-3年）',

        // 试营业推演
        trial1_revenue_wan: formatWan(trial1MonthlyRev),
        trial1_revenue_plain: trial1MonthlyRev,
        trial1_expense_wan: (trial1Expense / 10000).toFixed(1) + '万',
        trial1_expense_plain: trial1Expense,
        trial1_fee_wan: (trial1Fee / 10000).toFixed(1) + '万',
        trial1_fee_plain: trial1Fee,
        trial1_after_fees_wan: (trial1AfterFees / 10000).toFixed(1) + '万',
        trial1_after_fees_plain: trial1AfterFees,

        trial2_revenue_wan: formatWan(trial2MonthlyRev),
        trial2_revenue_plain: trial2MonthlyRev,
        trial2_expense_wan: (trial2Expense / 10000).toFixed(1) + '万',
        trial2_expense_plain: trial2Expense,
        trial2_fee_wan: (trial2Fee / 10000).toFixed(1) + '万',
        trial2_fee_plain: trial2Fee,
        trial2_after_fees_wan: (trial2AfterFees / 10000).toFixed(1) + '万',
        trial2_after_fees_plain: trial2AfterFees,

        // 稳定期
        stable_profit_wan: (cashNetProfit / 10000).toFixed(1) + '万',
        stable_total_fee_wan: (totalFee / 10000).toFixed(1) + '万',
        stable_after_fees_wan: (cashProfitAfterFees / 10000).toFixed(1) + '万',
        stable_operator_income_wan: (operatorIncome / 10000).toFixed(1) + '万',

        // ===== 12. 现金流水 =====
        cash_total_expense: formatNum(cashTotalExpense) + '元',
        cash_total_expense_num: cashTotalExpense,
        equipment_month_expense: formatNum(equipmentMonthExpense) + '元',
        equipment_month_expense_num: equipmentMonthExpense,
        equipment_month_profit: formatNum(equipmentMonthProfit) + '元',
        equipment_month_profit_num: equipmentMonthProfit,

        // ===== 13. 第13个月起（投资人分红降⾄11%） =====
        post_amort_profit: formatNum(cashNetProfit) + '元',
        post_amort_profit_plain: cashNetProfit,
        post_amort_profit_wan: (cashNetProfit / 10000).toFixed(0) + '万',
        post_amort_profit_after_fees: formatNum(cashProfitAfterFees) + '元',
        post_amort_profit_after_fees_plain: cashProfitAfterFees,
        post_amort_operator_income: formatNum(postAmortOperatorIncome) + '元',
        post_amort_operator_income_plain: postAmortOperatorIncome,
        post_amort_operator_income_wan: (postAmortOperatorIncome / 10000).toFixed(1) + '万',

        // ===== 14. 人员架构 =====
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
        total_investment_detail: '总投资' + formatWan(i.equipmentInvestment) + '万元（装修/门脸/设备/餐具/办公/工具，商务风装修 · 二手设备 · 全部包含）',
        equipment_investment_detail: '装修投入' + formatWan(i.equipmentInvestment),
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
          totalInvestment: 800000, equipmentInvestment: 500000,
          foodCostPct: 45, rent: 0, laborCost: 190000,
          marketingPct: 3, miscCost: 60000, serviceFeePct: 4,
          operationPct: 4, investorPctYear1: 15, investorPctYear2: 11,
          landlordRevenuePct: 8, landlordProfitPct: 12,
          paybackMonths: 12,
          tableCount: 120, seatsPerTable: 2.8, staffCount: 38,
          utilityCost: 60000, kitchenStaff: 22, kitchenCost: 110000,
          frontStaff: 16, frontCost: 80000,
          staffInitialCost: 200000, foodInitialCost: 100000
        }, inputs || {});

        // 计算中间值
        var monthlyRevenue = Math.round(i.dailyRevenue * 30);
        var equipmentAmort = Math.round(i.equipmentInvestment / i.paybackMonths);
        var foodCost = Math.round(monthlyRevenue * i.foodCostPct / 100);
        var marketingCost = Math.round(monthlyRevenue * i.marketingPct / 100);
        var totalExpense = i.laborCost + foodCost + i.rent + marketingCost + i.miscCost + equipmentAmort;
        var operatingProfit = monthlyRevenue - totalExpense;
        var cashNetProfit = operatingProfit + equipmentAmort;
        var serviceFee = Math.round(monthlyRevenue * i.serviceFeePct / 100);
        var operationFee = Math.round(monthlyRevenue * i.operationPct / 100);
        var totalFee = serviceFee + operationFee;
        // 分账基数 = 现金净利润 - 服务费（不扣设备摊销）
        var cashProfitAfterFees = cashNetProfit - totalFee;
        var investorDividend = Math.round(cashProfitAfterFees * i.investorPctYear1 / 100);
        var landlordRevenueShare = Math.round(monthlyRevenue * i.landlordRevenuePct / 100);
        var landlordProfitShare = Math.round(cashProfitAfterFees * i.landlordProfitPct / 100);
        var landlordDividend = Math.max(landlordRevenueShare, landlordProfitShare);
        var operatorIncome = cashProfitAfterFees - investorDividend - landlordDividend;

        // 悲观情景
        var pessimisticFoodCost = Math.round(monthlyRevenue * 0.48);
        var pessimisticTotalExpense = i.laborCost + pessimisticFoodCost + i.rent + marketingCost + i.miscCost + equipmentAmort;
        var pessimisticOperatingProfit = monthlyRevenue - pessimisticTotalExpense;
        var pessimisticCashNetProfit = pessimisticOperatingProfit + equipmentAmort;
        var pessimisticFee = Math.round(monthlyRevenue * (i.serviceFeePct + i.operationPct) / 100);
        var pessimisticCashProfitAfterFees = pessimisticCashNetProfit - pessimisticFee;
        var pessimisticInvestorDividend = Math.round(pessimisticCashProfitAfterFees * i.investorPctYear1 / 100);
        var pessimisticLandlordRevenueShare = Math.round(monthlyRevenue * i.landlordRevenuePct / 100);
        var pessimisticLandlordProfitShare = Math.round(pessimisticCashProfitAfterFees * i.landlordProfitPct / 100);
        var pessimisticLandlordDividend = Math.max(pessimisticLandlordRevenueShare, pessimisticLandlordProfitShare);
        var pessimisticOperatorIncome = pessimisticCashProfitAfterFees - pessimisticInvestorDividend - pessimisticLandlordDividend;

        // 周度营收（日均稳定6万）
        var monThuDaily = i.dailyRevenue;
        var friDaily = i.dailyRevenue;
        var satDaily = i.dailyRevenue;
        var sunDaily = i.dailyRevenue;
        var weeklyTotal = monThuDaily * 7;
        var monThuCustomers = Math.round(monThuDaily / i.price);
        var friCustomers = Math.round(friDaily / i.price);
        var satCustomers = Math.round(satDaily / i.price);
        var sunCustomers = Math.round(sunDaily / i.price);
        var weeklyCustomers = monThuCustomers * 4 + friCustomers + satCustomers + sunCustomers;
        var tableCapacity = i.tableCount * i.seatsPerTable;

        // 试营业推演（3个月爬坡）
        var trial1MonthlyRev = Math.round(monthlyRevenue * 0.33);
        var trial1Cost = Math.round(monthlyRevenue * 0.85);
        var trial1AfterFees = trial1MonthlyRev - Math.round(trial1MonthlyRev * (i.serviceFeePct + i.operationPct) / 100) - (trial1Cost || 0);

        var trial2MonthlyRev = Math.round(monthlyRevenue * 0.67);
        var trial2Cost = Math.round(monthlyRevenue * 0.80);
        var trial2AfterFees = trial2MonthlyRev - Math.round(trial2MonthlyRev * (i.serviceFeePct + i.operationPct) / 100) - (trial2Cost || 0);

        // 现金流水
        var cashTotalExpense = i.laborCost + foodCost + i.rent + marketingCost + i.miscCost;
        var equipmentMonthExpense = cashTotalExpense + i.equipmentInvestment;
        var equipmentMonthProfit = monthlyRevenue - equipmentMonthExpense;

        // 第13个月起（投资人降至11%）
        var postAmortInvestorDividend = Math.round(cashProfitAfterFees * i.investorPctYear2 / 100);
        var postAmortLandlordDividend = Math.max(landlordRevenueShare, Math.round(cashProfitAfterFees * i.landlordProfitPct / 100));
        var postAmortOperatorIncome = cashProfitAfterFees - postAmortInvestorDividend - postAmortLandlordDividend;

        // 设备分摊明细
        var hardAsset = Math.round(i.equipmentInvestment * 0.646);
        var furnitureAsset = Math.round(i.equipmentInvestment * 0.24);
        var suppliesAsset = i.equipmentInvestment - hardAsset - furnitureAsset;

        // 悲观对比
        var pessimisticVsIdealMonthly = operatorIncome - pessimisticOperatorIncome;
        var pessimisticVsIdealAnnual = pessimisticVsIdealMonthly * 12;

        // 回本（老板不投钱，仅查看投资人数据）

        return {
          // 原始中间值
          monthlyRevenue: monthlyRevenue,
          equipmentAmort: equipmentAmort,
          foodCost: foodCost,
          marketingCost: marketingCost,
          totalExpense: totalExpense,
          operatingProfit: operatingProfit,
          cashNetProfit: cashNetProfit,
          serviceFee: serviceFee,
          service_fee: serviceFee,
          operation_fee: operationFee,
          operation_pct: i.operationPct,
          total_fee: totalFee,
          profit_after_fees: cashProfitAfterFees,
          investorDividend: investorDividend,
          investorPctYear1: i.investorPctYear1,
          investorPctYear2: i.investorPctYear2,
          landlordDividend: landlordDividend,
          landlordRevenueShare: landlordRevenueShare,
          landlordProfitShare: landlordProfitShare,
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

          // 悲观
          pessimisticFoodCost: pessimisticFoodCost,
          pessimisticTotalExpense: pessimisticTotalExpense,
          pessimisticOperatingProfit: pessimisticOperatingProfit,
          pessimisticCashNetProfit: pessimisticCashNetProfit,
          pessimisticFee: pessimisticFee,
          pessimisticCashProfitAfterFees: pessimisticCashProfitAfterFees,
          pessimisticOperatorIncome: pessimisticOperatorIncome,
          pessimisticVsIdealMonthly: pessimisticVsIdealMonthly,
          pessimisticVsIdealAnnual: pessimisticVsIdealAnnual,

          // 试营业（3个月爬坡）
          trial1MonthlyRev: trial1MonthlyRev,
          trial1AfterFees: trial1AfterFees > 0 ? trial1AfterFees : 0,
          trial2MonthlyRev: trial2MonthlyRev,
          trial2AfterFees: trial2AfterFees > 0 ? trial2AfterFees : 0,

          // 现金流水
          cashTotalExpense: cashTotalExpense,
          equipmentMonthExpense: equipmentMonthExpense,
          equipmentMonthProfit: equipmentMonthProfit,

          // 第13个月起（投资人降至11%）
          postAmortCashProfitAfterFees: cashProfitAfterFees,
          postAmortInvestorDividend: postAmortInvestorDividend,
          postAmortLandlordDividend: postAmortLandlordDividend,
          postAmortOperatorIncome: postAmortOperatorIncome,

          // 设备明细
          hardAsset: hardAsset, furnitureAsset: furnitureAsset, suppliesAsset: suppliesAsset,
          hardAmort: Math.round(hardAsset / i.paybackMonths),
          furnitureAmort: Math.round(furnitureAsset / i.paybackMonths),
          suppliesAmort: Math.round(suppliesAsset / i.paybackMonths),

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
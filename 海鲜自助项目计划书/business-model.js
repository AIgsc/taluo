/**
 * 海鲜自助项目 - 商业模型计算引擎
 * 定义所有输入变量和计算逻辑，确保数据一致性
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
    // ----- 输入变量（默认值）-----
    inputs: {
      area: 2000,               // 总面积 ㎡
      price: 169,               // 人均定价 元
      dailyRevenue: 60000,      // 日均核销营业额 元
      totalInvestment: 800000,  // 总投资 元
      equipmentInvestment: 500000, // 装修设备投资 元
      foodCostPct: 45,          // 食材成本率 %
      rent: 70000,              // 房租 元/月
      laborCost: 243000,        // 人工成本 元/月
      marketingPct: 3,          // 营销费率 %
      miscCost: 60000,          // 杂费 元/月
      serviceFeePct: 4,         // 服务商抽成 %
      investorPct: 10,          // 投资人分红 %
      landlordThreshold: 30000, // 房东超额分成门槛
      landlordPct: 10,          // 房东超额分成率 %
      paybackMonths: 12,        // 设备分摊月数
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
      var monthlyRevenue = Math.round(i.dailyRevenue * 30);
      var equipmentAmort = Math.round(i.equipmentInvestment / i.paybackMonths);
      var foodCost = Math.round(monthlyRevenue * i.foodCostPct / 100);
      var marketingCost = Math.round(monthlyRevenue * i.marketingPct / 100);
      var totalExpense = i.laborCost + foodCost + i.rent + marketingCost + i.miscCost + equipmentAmort;
      var operatingProfit = monthlyRevenue - totalExpense;
      var cashNetProfit = operatingProfit + equipmentAmort;
      var serviceFee = Math.round(monthlyRevenue * i.serviceFeePct / 100);
      var profitAfterService = operatingProfit - serviceFee;
      var investorDividend = Math.round(profitAfterService * i.investorPct / 100);
      var landlordDividend = Math.round(Math.max(0, profitAfterService - i.landlordThreshold) * i.landlordPct / 100);
      var operatorIncome = profitAfterService - investorDividend - landlordDividend;

      // 悲观情景：食材涨至48%
      var pessimisticFoodCost = Math.round(monthlyRevenue * 0.48);
      var pessimisticTotalExpense = i.laborCost + pessimisticFoodCost + i.rent + marketingCost + i.miscCost + equipmentAmort;
      var pessimisticOperatingProfit = monthlyRevenue - pessimisticTotalExpense;
      var pessimisticProfitAfterService = pessimisticOperatingProfit - serviceFee;
      var pessimisticOperatorIncome = pessimisticProfitAfterService - Math.round(pessimisticProfitAfterService * 0.1) - Math.round(Math.max(0, pessimisticProfitAfterService - 30000) * 0.1);

      // 回本相关
      var avgMonthlyIncome = Math.round(operatorIncome * 0.7 + (operatorIncome * 0.5) * 0.3); // 加权平均
      var paybackPeriod = Math.ceil(i.totalInvestment / Math.max(1, avgMonthlyIncome));

      this.values = {
        // ----- 面积 -----
        area: i.area + '㎡',
        area_plain: i.area,
        area_dining: Math.round(i.area * 0.475) + '㎡（' + (47.5) + '%）',
        area_serving: Math.round(i.area * 0.15) + '㎡（' + (15) + '%）',
        area_kitchen: Math.round(i.area * 0.2) + '㎡（' + (20) + '%）',
        area_storage: Math.round(i.area * 0.1) + '㎡（' + (10) + '%）',
        area_lobby: Math.round(i.area * 0.04) + '㎡（' + (4) + '%）',
        area_restroom: Math.round(i.area * 0.035) + '㎡（' + (3.5) + '%）',
        area_dining_plain: Math.round(i.area * 0.475),
        table_count: 120,
        table_area: (Math.round(i.area * 0.475 / 120 * 10) / 10) + '㎡/桌',

        // ----- 定价 -----
        price: i.price + '元/位',
        price_plain: i.price,

        // ----- 营收 -----
        daily_revenue: formatWan(i.dailyRevenue),
        daily_revenue_plain: i.dailyRevenue,
        monthly_revenue: formatWan(monthlyRevenue),
        monthly_revenue_num: formatNum(monthlyRevenue) + '元',
        monthly_revenue_raw: monthlyRevenue,
        weekly_revenue: formatWan(Math.round(monthlyRevenue / 4.3)),

        // ----- 投资 -----
        total_investment: formatWan(i.totalInvestment),
        total_investment_wan: i.totalInvestment / 10000,
        total_investment_raw: i.totalInvestment,
        equipment_investment: formatWan(i.equipmentInvestment),
        equipment_investment_plain: i.equipmentInvestment,

        // ----- 设备分摊 -----
        equipment_amortization: formatNum(equipmentAmort) + '元/月',
        equipment_amortization_num: equipmentAmort,
        equipment_amortization_short: formatNum(equipmentAmort),
        equipment_amortization_months: i.paybackMonths,

        // ----- 成本 -----
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

        // ----- 经营口径总支出 -----
        total_operating_expense: formatNum(totalExpense) + '元',
        total_operating_expense_num: totalExpense,

        // ----- 利润 -----
        operating_profit: formatNum(operatingProfit) + '元',
        operating_profit_num: operatingProfit,
        operating_profit_display: formatNum(operatingProfit),
        cash_net_profit: formatNum(cashNetProfit) + '元',
        cash_net_profit_num: cashNetProfit,
        cash_net_profit_display: formatNum(cashNetProfit),

        // ----- 三方分账 -----
        service_fee: formatNum(serviceFee) + '元',
        service_fee_num: serviceFee,
        service_fee_pct: i.serviceFeePct + '%',
        profit_after_service_fee: formatNum(profitAfterService) + '元',
        profit_after_service_fee_num: profitAfterService,
        investor_dividend: formatNum(investorDividend) + '元',
        investor_dividend_num: investorDividend,
        investor_pct: i.investorPct + '%',
        landlord_dividend: formatNum(landlordDividend) + '元',
        landlord_dividend_num: landlordDividend,
        landlord_threshold: formatNum(i.landlordThreshold),
        landlord_pct: i.landlordPct + '%',
        operator_income: formatNum(operatorIncome) + '元',
        operator_income_num: operatorIncome,
        operator_income_wan: (operatorIncome / 10000).toFixed(1) + '万',
        operator_income_wan_display: (operatorIncome / 10000).toFixed(1) + '万',

        // ----- 悲观情景 -----
        pessimistic_food_cost: formatNum(pessimisticFoodCost) + '元',
        pessimistic_food_cost_num: pessimisticFoodCost,
        pessimistic_food_cost_pct: '48%',
        pessimistic_total_expense: formatNum(pessimisticTotalExpense) + '元',
        pessimistic_total_expense_num: pessimisticTotalExpense,
        pessimistic_operating_profit: formatNum(pessimisticOperatingProfit) + '元',
        pessimistic_operating_profit_num: pessimisticOperatingProfit,
        pessimistic_profit_after_service: formatNum(pessimisticProfitAfterService) + '元',
        pessimistic_operator_income: '约 ' + (pessimisticOperatorIncome / 10000).toFixed(1) + ' 万',

        // ----- 回本周期 -----
        payback_months: i.paybackMonths,
        payback_result: i.paybackMonths + '个月',
        operator_income_post_amort: formatNum(Math.round(operatorIncome + equipmentAmort)) + '元',
        operator_income_post_amort_wan: ((operatorIncome + equipmentAmort) / 10000).toFixed(1) + '万',
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
    module.exports = {
      calculate: function(inputs) {
        // 复制一份计算逻辑供服务端使用
        var i = Object.assign({
          area: 2000, price: 169, dailyRevenue: 60000,
          totalInvestment: 800000, equipmentInvestment: 500000,
          foodCostPct: 45, rent: 70000, laborCost: 243000,
          marketingPct: 3, miscCost: 60000, serviceFeePct: 4,
          investorPct: 10, landlordThreshold: 30000, landlordPct: 10,
          paybackMonths: 12
        }, inputs || {});

        // 计算（与前端完全一致）
        var monthlyRevenue = Math.round(i.dailyRevenue * 30);
        var equipmentAmort = Math.round(i.equipmentInvestment / i.paybackMonths);
        var foodCost = Math.round(monthlyRevenue * i.foodCostPct / 100);
        var marketingCost = Math.round(monthlyRevenue * i.marketingPct / 100);
        var totalExpense = i.laborCost + foodCost + i.rent + marketingCost + i.miscCost + equipmentAmort;
        var operatingProfit = monthlyRevenue - totalExpense;
        var cashNetProfit = operatingProfit + equipmentAmort;
        var serviceFee = Math.round(monthlyRevenue * i.serviceFeePct / 100);
        var profitAfterService = operatingProfit - serviceFee;
        var investorDividend = Math.round(profitAfterService * i.investorPct / 100);
        var landlordDividend = Math.round(Math.max(0, profitAfterService - i.landlordThreshold) * i.landlordPct / 100);
        var operatorIncome = profitAfterService - investorDividend - landlordDividend;

        var pessimisticFoodCost = Math.round(monthlyRevenue * 0.48);
        var pessimisticTotalExpense = i.laborCost + pessimisticFoodCost + i.rent + marketingCost + i.miscCost + equipmentAmort;
        var pessimisticOperatingProfit = monthlyRevenue - pessimisticTotalExpense;
        var pessimisticProfitAfterService = pessimisticOperatingProfit - serviceFee;
        var pessimisticOperatorIncome = pessimisticProfitAfterService - Math.round(pessimisticProfitAfterService * 0.1) - Math.round(Math.max(0, pessimisticProfitAfterService - 30000) * 0.1);

        return {
          inputs: i,
          monthlyRevenue: monthlyRevenue,
          equipmentAmort: equipmentAmort,
          foodCost: foodCost,
          marketingCost: marketingCost,
          totalExpense: totalExpense,
          operatingProfit: operatingProfit,
          cashNetProfit: cashNetProfit,
          serviceFee: serviceFee,
          profitAfterService: profitAfterService,
          investorDividend: investorDividend,
          landlordDividend: landlordDividend,
          operatorIncome: operatorIncome,
          pessimisticFoodCost: pessimisticFoodCost,
          pessimisticTotalExpense: pessimisticTotalExpense,
          pessimisticOperatingProfit: pessimisticOperatingProfit,
          pessimisticProfitAfterService: pessimisticProfitAfterService,
          pessimisticOperatorIncome: pessimisticOperatorIncome,
        };
      }
    };
  }

  // 导出到全局
  window.BusinessModel = BusinessModel;
})();
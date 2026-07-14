const state = {
  data: null,
  skus: [],
  filtered: [],
  draft: [],
  savedQuotes: [],
  lastExportCsv: "",
  discountRate: 100,
  scopeExpanded: false,
};

const SAVED_QUOTES_KEY = "maycur_quote_workbench_saved_quotes_personal_v2";
const AUTH_KEY = "maycur_quote_workbench_auth_ok_v1";
const ACCESS_PASSWORD = "Maycur2026";
const DISCONTINUED_SKU_IDS = new Set(["SKU-N20240012", "SKU-N20240061", "SKU-N20240113"]);

const els = {
  skuCount: document.querySelector("#skuCount"),
  selectedCount: document.querySelector("#selectedCount"),
  draftTotal: document.querySelector("#draftTotal"),
  listTotal: document.querySelector("#listTotal"),
  discountedTotal: document.querySelector("#discountedTotal"),
  quoteName: document.querySelector("#quoteName"),
  quoteFeedback: document.querySelector("#quoteFeedback"),
  saveQuoteModal: document.querySelector("#saveQuoteModal"),
  saveQuoteName: document.querySelector("#saveQuoteName"),
  confirmSaveQuote: document.querySelector("#confirmSaveQuote"),
  cancelSaveQuote: document.querySelector("#cancelSaveQuote"),
  cancelSaveQuoteBottom: document.querySelector("#cancelSaveQuoteBottom"),
  discountRate: document.querySelector("#discountRate"),
  companyLineFilter: document.querySelector("#companyLineFilter"),
  deploymentFilter: document.querySelector("#deploymentFilter"),
  searchInput: document.querySelector("#searchInput"),
  clearFilters: document.querySelector("#clearFilters"),
  resultCount: document.querySelector("#resultCount"),
  skuList: document.querySelector("#skuList"),
  toggleScopeResults: document.querySelector("#toggleScopeResults"),
  draftList: document.querySelector("#draftList"),
  draftEmpty: document.querySelector("#draftEmpty"),
  clearDraft: document.querySelector("#clearDraft"),
  saveQuote: document.querySelector("#saveQuote"),
  exportQuote: document.querySelector("#exportQuote"),
  savedQuotes: document.querySelector("#savedQuotes"),
  riskList: document.querySelector("#riskList"),
  scenarioInput: document.querySelector("#scenarioInput"),
  recommendButton: document.querySelector("#recommendButton"),
  exampleButton: document.querySelector("#exampleButton"),
  assistantAnswer: document.querySelector("#assistantAnswer"),
  rulesList: document.querySelector("#rulesList"),
  authForm: document.querySelector("#authForm"),
  authPassword: document.querySelector("#authPassword"),
  authError: document.querySelector("#authError"),
};

function hasAccess() {
  return localStorage.getItem(AUTH_KEY) === "true";
}

function unlockApp() {
  document.body.classList.remove("auth-locked");
}

function bindAuthGate() {
  els.authPassword?.focus();
  els.authForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const password = String(els.authPassword.value || "").trim();
    if (password !== ACCESS_PASSWORD) {
      els.authError.textContent = "访问密码不正确，请重新输入。";
      els.authPassword.select();
      return;
    }
    localStorage.setItem(AUTH_KEY, "true");
    els.authError.textContent = "";
    unlockApp();
    boot().catch(showLoadError);
  });
}

function currency(value) {
  if (!Number.isFinite(value)) return "¥0";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0,
  }).format(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalize(value) {
  return String(value || "").toLowerCase().trim();
}

function tagClass(tag) {
  if (tag === "人工询价") return "inquiry";
  if (tag === "审批") return "approval";
  if (tag === "需求评审") return "review";
  if (tag === "赠送") return "gift";
  return "";
}

function isGiftSku(sku) {
  return String(sku.skuName || "").startsWith("赠送") || String(sku.listPrice || "").startsWith("0元");
}

function visibleTags(sku) {
  return sku.tags.filter((tag) => tag !== "赠送" || isGiftSku(sku));
}

function isDiscontinuedSkuId(id) {
  return DISCONTINUED_SKU_IDS.has(String(id || ""));
}

function isGlobalSku(sku) {
  return String(sku?.skuName || "") === "全球版";
}

function defaultQuantityForSku(sku) {
  return isGlobalSku(sku) ? 10 : 1;
}

function noteForDraftSku(sku) {
  const note = sku.internalNote || sku.externalNote || "-";
  if (!isGlobalSku(sku)) return note;
  const globalNote = "全球版 SKU 10 个账户起售，加入草稿时默认数量为 10 个账户。";
  return note && note !== "-" ? `${globalNote}\n${note}` : globalNote;
}

function resolvedDraftSku(id) {
  const sku = state.skus.find((item) => item.id === id);
  return preferredSkuVariant(sku);
}

function isInDraft(id) {
  const sku = resolvedDraftSku(id);
  return !!sku && state.draft.some((item) => item.id === sku.id);
}

function addButtonHtml(id) {
  const added = isInDraft(id);
  return `<button class="${added ? "is-added" : ""}" type="button" data-add="${escapeHtml(id)}" ${added ? "disabled" : ""}>${
    added ? "已加入" : "加入草稿"
  }</button>`;
}

function skuSearchText(sku) {
  return normalize(
    [
      sku.companyLine,
      sku.productLine,
      sku.spu,
      sku.skuName,
      sku.skuCode,
      sku.billingMode,
      sku.feeType,
      sku.internalNote,
      sku.externalNote,
      sku.listPrice,
      sku.tags.join(" "),
    ].join(" ")
  );
}

const queryAliasGroups = [
  {
    triggers: ["旗舰", "旗舰版", "费控旗舰", "集团版"],
    terms: ["旗舰版", "费控【旗舰版】", "每刻报销SAAS版", "每刻报销软件版"],
    productLine: "费控【旗舰版】",
    priorityNames: [
      "账号订阅（专业版）",
      "账号订阅（企业版）",
      "账号订阅（群智版）",
      "账号订阅（企业版不限账号）",
      "账号订阅（群智版不限账号）",
      "功能-费用预算",
      "功能-预算调整",
      "功能-集团化管控",
      "功能-智能签收",
    ],
  },
  {
    triggers: ["钉版", "钉钉", "钉钉版", "dingtalk", "ding talk"],
    terms: ["钉钉版", "费控【钉钉版】", "钉钉接口授权", "钉钉智能合同", "钉钉A1", "DingTalk"],
    productLine: "费控【钉钉版】",
    priorityNames: [
      "账号订阅（专业版）",
      "账号订阅（企业版）",
      "功能-费用预算",
      "功能-预算调整",
      "功能-集团化管控",
      "功能-智能签收",
      "钉钉智能合同对接插件",
      "钉钉A1智能纪要套件",
    ],
  },
  {
    triggers: ["国际版", "海外版"],
    terms: ["费控【国际版】", "国际版", "全球版", "海外公有云节点", "非中国区发票"],
    productLine: "费控【国际版】",
    priorityNames: ["账号订阅（企业版）", "全球版", "发票智能识别", "智能识票（非中国区发票）"],
  },
  {
    triggers: ["集成平台", "集成管理", "凭证平台", "凭证集成"],
    terms: ["费控【集成管理平台】", "凭证集成插件", "主数据集成插件", "消息待办集成插件", "支付平台集成插件"],
    productLine: "费控【集成管理平台】",
    priorityNames: ["业务实施", "集成开发", "凭证集成插件", "主数据集成插件", "消息待办集成插件"],
  },
];

function aliasGroupForText(rawText) {
  const normalized = normalize(rawText);
  return queryAliasGroups.find((group) =>
    group.triggers.some((trigger) => normalized.includes(normalize(trigger)))
  );
}

function productLineAlias(rawText) {
  const match = aliasGroupForText(rawText);
  return match?.productLine || "";
}

function productLinePriorityNames(rawText) {
  return aliasGroupForText(rawText)?.priorityNames || [];
}

function expandSearchTerms(rawQuery) {
  const normalized = normalize(rawQuery);
  if (!normalized) return [];
  const terms = new Set(
    normalized
      .split(/\s+|，|。|、|,|\./)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2)
  );
  terms.add(normalized);

  for (const group of queryAliasGroups) {
    if (group.triggers.some((trigger) => normalized.includes(normalize(trigger)))) {
      group.terms.forEach((term) => terms.add(normalize(term)));
    }
  }

  for (const semantic of matchedSemanticScenarios(normalized)) {
    semantic.keywords.forEach((term) => terms.add(normalize(term)));
    semantic.priorityNames.forEach((term) => terms.add(normalize(term)));
  }

  return [...terms];
}

function matchesAnyTerm(sku, terms) {
  if (!terms.length) return true;
  const text = skuSearchText(sku);
  return terms.some((term) => text.includes(term));
}

function initFilters() {
  els.companyLineFilter.innerHTML = `<option value="">全部</option>${state.data.meta.companyLines
    .map((line) => `<option value="${escapeHtml(line)}">${escapeHtml(line)}</option>`)
    .join("")}`;
}

function matchesDeployment(sku, deployment) {
  if (!deployment) return true;
  const text = `${sku.spu} ${sku.skuName} ${sku.billingMode} ${sku.feeType} ${sku.internalNote}`;
  if (deployment === "saas") {
    return /订阅|SaaS|SAAS|云/.test(text) && !/软件版|软件销售/.test(text);
  }
  if (deployment === "local") {
    return /软件版|软件销售|本地|专属云|初次部署|运维/.test(text);
  }
  return true;
}

function applyFilters() {
  const company = els.companyLineFilter.value;
  const deployment = els.deploymentFilter.value;
  const query = normalize(els.searchInput.value);
  const queryTerms = expandSearchTerms(query);
  const aliasProductLine = productLineAlias(query);

  let scoped = state.skus
    .filter((sku) => !company || sku.companyLine === company)
    .filter((sku) => matchesDeployment(sku, deployment))
    .filter((sku) => !aliasProductLine || sku.productLine === aliasProductLine);

  if (query) {
    const queryFilters = applyQueryContextToScenario(inferScenario(query), {
      companyLine: company,
      deployment,
      query: "",
    });
    scoped = scoped
      .map((sku) => ({
        sku,
        direct: matchesAnyTerm(sku, queryTerms),
        score: scoreSku(sku, queryFilters, query),
        priorityRank: semanticPriorityRank(sku, queryFilters),
      }))
      .filter((item) => item.direct || item.score > 0)
      .sort((a, b) => {
        if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
        if (isGiftSku(a.sku) !== isGiftSku(b.sku)) return Number(isGiftSku(a.sku)) - Number(isGiftSku(b.sku));
        return b.score - a.score || Number(b.direct) - Number(a.direct) || a.sku.skuName.localeCompare(b.sku.skuName, "zh-CN");
      })
      .map((item) => item.sku);
  }

  state.filtered = scoped.slice(0, 120);

  renderSkuList();
}

function renderSkuList() {
  els.resultCount.textContent = state.filtered.length;
  els.toggleScopeResults.textContent = state.scopeExpanded ? "折起 SKU" : "展开查看 SKU";
  els.skuList.classList.toggle("is-hidden", !state.scopeExpanded);
  if (!state.scopeExpanded) {
    els.skuList.innerHTML = "";
    return;
  }
  if (!state.filtered.length) {
    els.skuList.innerHTML = `<div class="empty-state">当前筛选范围没有匹配的 SKU，可以放宽产品线、部署模式或关键词。</div>`;
    return;
  }

  els.skuList.innerHTML = state.filtered
    .slice(0, 24)
    .map((sku) => {
      const note = sku.internalNote || sku.externalNote;
      return `
        <article class="sku-card compact-sku-card">
          <div class="sku-main">
            <div>
              <div class="sku-title">${escapeHtml(sku.skuName)}</div>
              <div class="sku-code">${escapeHtml(sku.skuCode)} · ${escapeHtml(sku.billingMode)} / ${escapeHtml(sku.feeType)}</div>
              <div class="sku-path">${escapeHtml(sku.companyLine)} › ${escapeHtml(sku.productLine)} › ${escapeHtml(sku.spu)}</div>
            </div>
            <div class="price">${escapeHtml(sku.listPrice || "-")}</div>
          </div>
          <div class="tags">${visibleTags(sku)
            .map((tag) => `<span class="tag ${tagClass(tag)}">${escapeHtml(tag)}</span>`)
            .join("")}</div>
          ${note ? `<div class="sku-note">${escapeHtml(note).slice(0, 120)}</div>` : ""}
          <div class="sku-actions">
            ${addButtonHtml(sku.id)}
          </div>
        </article>
      `;
    })
    .join("");
}

function addToDraft(id) {
  const sku = resolvedDraftSku(id);
  if (!sku) return;
  const existing = state.draft.find((item) => item.id === sku.id);
  if (existing) {
    existing.quantity += defaultQuantityForSku(sku);
  } else {
    state.draft.push({
      id: sku.id,
      quantity: defaultQuantityForSku(sku),
      months: 12,
      manualPrice: sku.price.kind === "inquiry" ? 0 : null,
    });
  }
  renderDraft();
}

function removeFromDraft(id) {
  state.draft = state.draft.filter((item) => item.id !== id);
  renderDraft();
}

function refreshAddButtonStates() {
  document.querySelectorAll("[data-add]").forEach((button) => {
    const added = isInDraft(button.dataset.add);
    button.disabled = added;
    button.classList.toggle("is-added", added);
    button.textContent = added ? "已加入" : "加入草稿";
  });
}

function draftSku(item) {
  return state.skus.find((sku) => sku.id === item.id);
}

function dominantDraftProductLine() {
  const counts = new Map();
  for (const item of state.draft) {
    const sku = draftSku(item);
    if (!sku?.productLine) continue;
    counts.set(sku.productLine, (counts.get(sku.productLine) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function preferredSkuVariant(sku) {
  const productLine = dominantDraftProductLine();
  if (!sku || !productLine || sku.productLine === productLine) return sku;
  const sameVersion = state.skus.find(
    (item) =>
      item.skuName === sku.skuName &&
      item.productLine === productLine &&
      item.companyLine === sku.companyLine &&
      item.spu === sku.spu
  );
  return sameVersion || sku;
}

function normalizeDraftVariants() {
  const productLine = dominantDraftProductLine();
  if (!productLine) return;
  const used = new Set();
  state.draft = state.draft
    .map((item) => {
      const sku = draftSku(item);
      const preferred = preferredSkuVariant(sku);
      return preferred ? { ...item, id: preferred.id } : item;
    })
    .filter((item) => {
      if (used.has(item.id)) return false;
      used.add(item.id);
      return true;
    });
}

function isAccountSubscriptionSku(sku) {
  return /^账号订阅（(专业版|企业版|群智版)）$/.test(String(sku?.skuName || ""));
}

function isAiStandardSuiteSku(sku) {
  return String(sku?.skuName || "") === "AI标准套件（不含AI增值模块）";
}

function syncLinkedQuantities() {
  const accountQuantity = state.draft.reduce((sum, item) => {
    const sku = draftSku(item);
    return isAccountSubscriptionSku(sku) ? sum + Number(item.quantity || 0) : sum;
  }, 0);
  if (!accountQuantity) return;
  for (const item of state.draft) {
    const sku = draftSku(item);
    if (isAiStandardSuiteSku(sku)) item.quantity = accountQuantity;
  }
}

function unitPrice(item, sku) {
  if (sku.price.kind === "inquiry") return Number(item.manualPrice || 0);
  return Number(item.manualPrice ?? sku.price.amount ?? 0);
}

function calcDraftItem(item) {
  const sku = draftSku(item);
  if (!sku) return 0;
  const base = unitPrice(item, sku) * Number(item.quantity || 0);
  if (sku.price.period === "年" && Number(item.months || 12) !== 12) {
    return (base / 12) * Number(item.months || 0);
  }
  return base;
}

function renderDraft() {
  state.draft = state.draft.filter((item) => !isDiscontinuedSkuId(item.id));
  normalizeDraftVariants();
  syncLinkedQuantities();
  const total = state.draft.reduce((sum, item) => sum + calcDraftItem(item), 0);
  const discounted = total * (Number(state.discountRate || 0) / 100);
  if (els.selectedCount) els.selectedCount.textContent = state.draft.length;
  if (els.draftTotal) els.draftTotal.textContent = currency(discounted);
  els.listTotal.textContent = currency(total);
  els.discountedTotal.textContent = currency(discounted);
  els.discountRate.value = state.discountRate;
  els.draftEmpty.style.display = state.draft.length ? "none" : "block";

  if (!state.draft.length) {
    els.draftList.innerHTML = "";
  } else {
    els.draftList.innerHTML = `
      <table class="draft-table">
        <thead>
          <tr>
            <th>SPU 分类</th>
            <th>SKU 名称</th>
            <th>数量</th>
            <th>购买月份</th>
            <th>单价</th>
            <th>重要说明</th>
            <th>小计</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${state.draft
            .map((item) => {
              const sku = draftSku(item);
              if (!sku) return "";
              const note = noteForDraftSku(sku);
              const editableUnit = sku.price.kind === "inquiry" || sku.price.amount === null;
              const linkedQuantity = isAiStandardSuiteSku(sku);
              return `
                <tr>
                  <td>
                    <span class="spu-pill">${escapeHtml(sku.spu || "-")}</span>
                    <div class="table-sku-path">${escapeHtml(sku.productLine || "-")}</div>
                  </td>
                  <td>
                    <div class="table-sku-name">${escapeHtml(sku.skuName)}</div>
                    <div class="table-sku-meta">${escapeHtml(sku.skuCode)} · ${escapeHtml(sku.listPrice || "-")}</div>
                    ${linkedQuantity ? `<div class="linked-hint">数量已联动账号订阅数量</div>` : ""}
                  </td>
                  <td>
                    <input class="table-input" type="number" min="0" step="1" ${linkedQuantity ? "disabled" : ""} value="${item.quantity}" data-field="quantity" data-id="${escapeHtml(item.id)}" />
                  </td>
                  <td>
                    <input class="table-input" type="number" min="1" max="120" step="1" value="${item.months}" data-field="months" data-id="${escapeHtml(item.id)}" />
                  </td>
                  <td>
                    <input class="table-input price-input" type="number" min="0" step="100" ${editableUnit ? "" : ""} value="${unitPrice(item, sku)}" data-field="manualPrice" data-id="${escapeHtml(item.id)}" />
                  </td>
                  <td><div class="table-note">${escapeHtml(note).slice(0, 180)}</div></td>
                  <td class="table-subtotal">${currency(calcDraftItem(item))}</td>
                  <td><button class="danger-link" type="button" data-remove="${escapeHtml(item.id)}">移除</button></td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;
  }

  renderRisks();
  renderRules();
  refreshAddButtonStates();
}

function renderRisks() {
  const risks = [];
  for (const item of state.draft) {
    const sku = draftSku(item);
    if (!sku) continue;
    if (sku.tags.includes("人工询价")) risks.push(["inquiry", `${sku.skuName} 需要按项目人工询价，请具体咨询销管人员。`]);
    if (sku.tags.includes("需求评审")) risks.push(["review", `${sku.skuName} 需要走需求评审流程确认人天或范围。`]);
    if (sku.tags.includes("审批")) risks.push(["approval", `${sku.skuName} 涉及折扣、比例或最低价判断，需要业务部门领导/审批确认。`]);
    if (sku.tags.includes("依赖提醒")) risks.push(["review", `${sku.skuName} 有依赖项，请另选择对应 SKU 或补充确认。`]);
    if (isGiftSku(sku)) risks.push(["approval", `${sku.skuName} 是赠送或 0 元特殊 SKU，原则上不允许赠送，需确认销售赠送口径。`]);
  }

  if (!risks.length) {
    els.riskList.innerHTML = `<div class="risk">当前草稿暂无明显风险标签。</div>`;
    return;
  }

  els.riskList.innerHTML = risks
    .slice(0, 12)
    .map(([type, text]) => `<div class="risk ${type}">${escapeHtml(text)}</div>`)
    .join("");
}

function renderRules() {
  const draftSkus = state.draft.map(draftSku).filter(Boolean);
  const items = new Map();
  const addRule = (key, text, type = "default") => items.set(key, { text, type });

  addRule("period", "周期口径：新购默认 12 个月；增购/扩购按剩余月份折算，并尽量和原合同到期日对齐。");

  if (!draftSkus.length) {
    addRule("empty", "选择 SKU 后，这里会只展示与当前报价草稿相关的部署、税号、审批、询价和服务规则。", "info");
  }

  for (const sku of draftSkus) {
    const text = skuSearchText(sku);
    if (/订阅|saas|云/.test(text)) {
      addRule("saas", "部署口径：客户 SaaS 云部署时选择订阅版 SKU；订阅费默认按年报价。", "info");
    }
    if (/软件版|软件销售|本地|专属云|运维/.test(text)) {
      addRule("local", "部署口径：客户本地部署时选择软件版 SKU；如涉及运维费，合同额包含实施、开发、集成服务费。", "info");
    }
    if (/税号|进项发票认证|销项发票管理|采购应付|发票管理|销售应收/.test(text)) {
      addRule("tax", "税号口径：模块报价下多个产品线合同级共赠送 10 个税号；10 个以上按对应产品线全量阶梯计算，单税号报价模式除外。", "tax");
    }
    if (/单个税号/.test(text)) {
      addRule("single-tax", "单税号模式：进项发票认证、销项发票管理如选择单个税号报价模式，不再适用模块报价默认赠送 10 个税号规则。", "tax");
    }
    if (sku.tags.includes("人工询价") || sku.price.kind === "inquiry") {
      addRule("inquiry", "特殊价格：目录价为 -、外购、硬件、托管等 SKU 需要具体咨询销管人员后人工录入。", "inquiry");
    }
    if (sku.tags.includes("需求评审") || /实施|开发|集成|人天/.test(text)) {
      addRule("review", "需求评审：实施、开发、集成、人天类 SKU 需要走需求评审流程确认范围和工作量。", "review");
    }
    if (sku.tags.includes("审批") || /折扣|最低价|比例|赠送/.test(text) || isGiftSku(sku)) {
      addRule("approval", "审批口径：折扣、最低价、运维费比例、赠送或 0 元 SKU 需要业务部门领导/审批确认。", "approval");
    }
    if (sku.tags.includes("依赖提醒")) {
      addRule("dependency", "依赖提醒：当前草稿含有关联依赖项，请同步补选对应 SKU 或向销管确认。", "review");
    }
    if (/AI标准套件|AI审核|Token|AI发票翻译|AI/.test(sku.skuName)) {
      addRule("ai", "AI 口径：AI 标准套件数量需与客户实际购买的账号订阅数量一致；Token、翻译流量和增值模块按对应 SKU 另计。", "info");
    }
  }

  els.rulesList.innerHTML = [...items.values()]
    .map((item) => `<div class="rule-item ${item.type}">${escapeHtml(item.text)}</div>`)
    .join("");
}

const semanticScenarios = [
  {
    id: "global",
    label: "出海/全球化",
    triggers: ["出海", "海外", "全球", "国际", "国际化", "多语言", "语种", "境外", "非中国", "海外部署", "全球化"],
    keywords: [
      "全球版",
      "大语种语言包",
      "小语种语言包",
      "海外公有云节点",
      "智能识票（非中国区发票）",
      "AI发票翻译",
      "AI发票翻译流量包",
      "费控【国际版】",
      "非中国区发票",
      "语言包",
      "海外节点",
    ],
    priorityNames: [
      "全球版",
      "大语种语言包（英文标配）",
      "小语种语言包（英文标配）",
      "海外公有云节点（非独享）",
      "智能识票（非中国区发票）",
      "AI发票翻译",
      "AI发票翻译流量包",
    ],
    hint: "已识别为出海/全球化场景，优先推荐全球版、大小语种语言包、海外公有云节点、非中国区发票识别、发票翻译等 SKU。",
  },
  {
    id: "ai",
    label: "AI 能力",
    triggers: ["ai", "人工智能", "智能审核", "智能识别", "智能体", "问数", "token", "大模型", "自动提单"],
    keywords: [
      "AI标准套件",
      "AI审核",
      "AI发票翻译",
      "AI发票翻译流量包",
      "Token流量预充值",
      "标准Token赠金",
      "额外Token赠金",
      "AI产品开发服务",
      "AI自定义识别",
      "AI识别模型",
      "BI 2.0+AI问数",
      "AI 问数",
      "每刻AI",
      "发票智能识别",
      "全文识别",
    ],
    priorityNames: [
      "AI标准套件（不含AI增值模块）",
      "AI审核",
      "Token流量预充值",
      "标准Token赠金",
      "额外Token赠金",
      "AI发票翻译",
      "AI发票翻译流量包",
      "AI自定义识别",
      "AI识别模型",
      "AI产品开发服务",
      "BI 2.0+AI问数",
      "AI 问数",
    ],
    hint: "已识别为 AI 能力场景，优先推荐 AI 标准套件、AI 审核、Token 流量/赠金、AI 翻译、AI 识别模型等 SKU。",
  },
];

function matchedSemanticScenarios(normalizedText) {
  return semanticScenarios.filter((scenario) =>
    scenario.triggers.some((trigger) => normalizedText.includes(normalize(trigger)))
  );
}

function inferScenario(text) {
  const normalized = normalize(text);
  const semantics = matchedSemanticScenarios(normalized);
  const filters = {
    companyLine: "",
    productLine: productLineAlias(normalized),
    priorityNames: productLinePriorityNames(normalized),
    deployment: "",
    tags: [],
    keywords: [],
    semantics,
  };

  const companyCandidates = state.data.meta.companyLines.sort((a, b) => b.length - a.length);
  filters.companyLine = companyCandidates.find((line) => normalized.includes(normalize(line))) || "";

  if (/saas|云部署|云/.test(normalized)) filters.deployment = "saas";
  if (/本地|私有化|软件版|本地部署/.test(normalized)) filters.deployment = "local";
  if (/税号/.test(normalized)) filters.tags.push("税号");
  if (/运维/.test(normalized)) filters.tags.push("运维");
  if (/实施|开发|人天|集成/.test(normalized)) filters.tags.push("需求评审");
  if (/赠送|送/.test(normalized)) filters.tags.push("赠送");
  if (/询价|托管|外购|硬件|市场/.test(normalized)) filters.tags.push("人工询价");

  const words = [
    "采购应付",
    "发票管理",
    "销售应收",
    "电子档案",
    "费控",
    "报销",
    "供应商对账",
    "发票协同",
    "进项发票认证",
    "销项发票管理",
    "税号主体数",
    "智能签收",
    "AI审核",
    "发票验真",
    "发票智能识别",
    "凭证",
    "银企",
    "BI",
  ];
  const explicitKeywords = words.filter((word) => normalized.includes(normalize(word)));
  const aliasKeywords = expandSearchTerms(normalized);
  const semanticKeywords = semantics.flatMap((scenario) => scenario.keywords);
  filters.keywords = [...new Set([...explicitKeywords, ...aliasKeywords, ...semanticKeywords])];
  return filters;
}

function currentQueryContext() {
  const query = normalize(els.searchInput.value);
  return {
    companyLine: els.companyLineFilter.value,
    deployment: els.deploymentFilter.value,
    query,
    productLine: productLineAlias(query),
  };
}

function applyQueryContextToScenario(filters, context) {
  const queryTerms = expandSearchTerms(context.query);
  const next = {
    ...filters,
    tags: [...filters.tags],
    keywords: [...filters.keywords],
    semantics: [...filters.semantics],
    priorityNames: [...(filters.priorityNames || [])],
    contextQuery: context.query,
    contextTerms: queryTerms,
  };
  if (!next.companyLine && context.companyLine) next.companyLine = context.companyLine;
  if (!next.productLine && context.productLine) next.productLine = context.productLine;
  if (context.query) {
    next.priorityNames = [...new Set([...next.priorityNames, ...productLinePriorityNames(context.query)])];
  }
  if (!next.deployment && context.deployment) next.deployment = context.deployment;
  if (context.query) {
    next.keywords = [...new Set([...next.keywords, ...queryTerms])];
  }
  return next;
}

function matchesQueryContext(sku, context) {
  if (context.companyLine && sku.companyLine !== context.companyLine) return false;
  if (context.productLine && sku.productLine !== context.productLine) return false;
  if (context.deployment && !matchesDeployment(sku, context.deployment)) return false;
  if (context.query && !matchesAnyTerm(sku, expandSearchTerms(context.query))) return false;
  return true;
}

function scoreSku(sku, filters, scenario) {
  let score = 0;
  const text = skuSearchText(sku);
  if (filters.companyLine) {
    if (sku.companyLine === filters.companyLine) score += 12;
    else score -= 8;
  }
  if (filters.productLine) {
    if (sku.productLine === filters.productLine) score += 30;
    else score -= 30;
  }
  if (filters.deployment) {
    if (matchesDeployment(sku, filters.deployment)) score += 8;
    else score -= 5;
  }
  if (filters.contextQuery) {
    if (filters.contextTerms?.some((term) => text.includes(term))) score += 12;
    else score -= 2;
  }
  for (const tag of filters.tags) {
    if (sku.tags.includes(tag)) score += 3;
  }
  for (const keyword of filters.keywords) {
    if (text.includes(normalize(keyword))) score += 5;
  }
  (filters.priorityNames || []).forEach((name, index) => {
    const skuName = normalize(sku.skuName);
    const priorityName = normalize(name);
    if (skuName === priorityName) score += 80 - index * 5;
    else if (skuName.includes(priorityName)) score += 8;
  });
  for (const semantic of filters.semantics) {
    semantic.priorityNames.forEach((name, index) => {
      const skuName = normalize(sku.skuName);
      const priorityName = normalize(name);
      if (skuName === priorityName) {
        score += 90 - index * 6;
      } else if (skuName.includes(priorityName)) {
        score += 8;
      }
    });
    for (const keyword of semantic.keywords) {
      if (text.includes(normalize(keyword))) score += 4;
    }
    if (semantic.id === "global" && /国际版|全球版|语种|海外|非中国区|翻译/.test(text)) score += 6;
    if (semantic.id === "ai" && /ai|token|智能|问数|识别模型|每刻ai/.test(text)) score += 6;
  }
  for (const raw of normalize(scenario).split(/\s+|，|。|、|,|\./).filter(Boolean)) {
    if (raw.length >= 2 && text.includes(raw)) score += 1;
  }
  return score;
}

function semanticPriorityRank(sku, filters) {
  const skuName = normalize(sku.skuName);
  let rank = Number.POSITIVE_INFINITY;
  const preferredProductLine = filters.preferredProductLine || dominantDraftProductLine();
  if (preferredProductLine && sku.productLine === preferredProductLine) rank = Math.min(rank, -1);
  (filters.priorityNames || []).forEach((name, index) => {
    if (skuName === normalize(name)) rank = Math.min(rank, index);
  });
  for (const semantic of filters.semantics) {
    semantic.priorityNames.forEach((name, index) => {
      if (skuName === normalize(name)) rank = Math.min(rank, index);
    });
  }
  return rank;
}

function taxHint(text) {
  const match = String(text).match(/(\d+)\s*个?税号/);
  if (!match) return "";
  const count = Number(match[1]);
  if (!count) return "";
  return `检测到客户约 ${count} 个税号。模块报价下合同级共赠送 10 个税号；税号阶梯按全量阶梯计算，但落档按总税号还是收费税号仍需最终确认。`;
}

function draftTotals() {
  const listTotal = state.draft.reduce((sum, item) => sum + calcDraftItem(item), 0);
  return {
    listTotal,
    discountedTotal: listTotal * (Number(state.discountRate || 0) / 100),
  };
}

function loadSavedQuotes() {
  try {
    state.savedQuotes = JSON.parse(localStorage.getItem(SAVED_QUOTES_KEY) || "[]").map((quote) => ({
      ...quote,
      items: (quote.items || []).filter((item) => !isDiscontinuedSkuId(item.id)),
    }));
  } catch {
    state.savedQuotes = [];
  }
}

function persistSavedQuotes() {
  localStorage.setItem(SAVED_QUOTES_KEY, JSON.stringify(state.savedQuotes.slice(0, 20)));
}

function renderSavedQuotes() {
  if (!els.savedQuotes) return;
  if (!state.savedQuotes.length) {
    els.savedQuotes.innerHTML = `<div class="saved-empty">暂无保存方案。</div>`;
    return;
  }
  els.savedQuotes.innerHTML = state.savedQuotes
    .map(
      (quote) => `
        <div class="saved-quote">
          <div>
            <strong>${escapeHtml(quote.name)}</strong>
            <span>${escapeHtml(new Date(quote.savedAt).toLocaleString("zh-CN", { hour12: false }))} · ${quote.items.length} 个 SKU · ${currency(quote.discountedTotal)}</span>
          </div>
          <div class="saved-actions">
            <button class="ghost-button" type="button" data-load-quote="${escapeHtml(quote.id)}">载入</button>
            <button class="ghost-button" type="button" data-export-quote="${escapeHtml(quote.id)}">导出报价单</button>
            <button class="danger-outline" type="button" data-delete-quote="${escapeHtml(quote.id)}">删除</button>
          </div>
        </div>
      `
    )
    .join("");
}

function saveCurrentQuote() {
  if (!state.draft.length) {
    setQuoteFeedback("请先加入 SKU 后再保存报价方案。", "warning");
    return;
  }
  const name = (els.saveQuoteName?.value || els.quoteName?.value || "").trim() || defaultQuoteName();
  if (els.quoteName) els.quoteName.value = name;
  if (els.saveQuoteName) els.saveQuoteName.value = name;
  const totals = draftTotals();
  const quote = {
    id: `quote-${Date.now()}`,
    name,
    savedAt: new Date().toISOString(),
    discountRate: state.discountRate,
    listTotal: totals.listTotal,
    discountedTotal: totals.discountedTotal,
    items: state.draft.map((item) => ({ ...item })),
  };
  state.savedQuotes = [quote, ...state.savedQuotes.filter((item) => item.name !== name)].slice(0, 20);
  persistSavedQuotes();
  renderSavedQuotes();
  closeSaveQuoteModal();
  setQuoteFeedback(`已保存方案：${escapeHtml(name)}。`, "success");
}

function loadQuote(id) {
  const quote = state.savedQuotes.find((item) => item.id === id);
  if (!quote) return;
  state.draft = quote.items.filter((item) => !isDiscontinuedSkuId(item.id)).map((item) => ({ ...item }));
  state.discountRate = quote.discountRate;
  if (els.quoteName) els.quoteName.value = quote.name;
  renderDraft();
  setQuoteFeedback(`已载入方案：${escapeHtml(quote.name)}。`, "success");
}

function deleteQuote(id) {
  const quote = state.savedQuotes.find((item) => item.id === id);
  if (!quote) return;
  if (!window.confirm(`确定删除方案「${quote.name}」吗？`)) return;
  state.savedQuotes = state.savedQuotes.filter((item) => item.id !== id);
  persistSavedQuotes();
  renderSavedQuotes();
  setQuoteFeedback(`已删除方案：${escapeHtml(quote.name)}。`, "success");
}

function fallbackCopyCsv() {
  setQuoteFeedback(
    `浏览器未允许直接复制。请手动复制下面内容：<textarea class="csv-copy-area" readonly>${escapeHtml(
      state.lastExportCsv
    )}</textarea>`,
    "warning"
  );
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function setQuoteFeedback(html, type = "info") {
  if (!els.quoteFeedback) return;
  els.quoteFeedback.className = `quote-feedback ${type}`;
  els.quoteFeedback.innerHTML = html;
}

function defaultQuoteName() {
  return `报价方案-${new Date().toLocaleString("zh-CN", { hour12: false }).replace(/[/:]/g, "-")}`;
}

function safeFileName(value) {
  return String(value || "报价方案")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "")
    .slice(0, 60);
}

function exportTimestamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(
    date.getMinutes()
  )}${pad(date.getSeconds())}`;
}

function openSaveQuoteModal() {
  if (!state.draft.length) {
    setQuoteFeedback("请先加入 SKU 后再保存报价方案。", "warning");
    return;
  }
  const name = (els.quoteName?.value || "").trim() || defaultQuoteName();
  if (els.saveQuoteName) els.saveQuoteName.value = name;
  els.saveQuoteModal?.classList.remove("is-hidden");
  window.setTimeout(() => els.saveQuoteName?.focus(), 0);
}

function closeSaveQuoteModal() {
  els.saveQuoteModal?.classList.add("is-hidden");
}

function buildQuoteCsv(items = state.draft, discountRate = state.discountRate) {
  const exportItems = items.filter((item) => !isDiscontinuedSkuId(item.id));
  if (!exportItems.length) {
    return null;
  }
  const listTotal = exportItems.reduce((sum, item) => sum + calcDraftItem(item), 0);
  const discountedTotal = listTotal * (Number(discountRate || 0) / 100);
  const rows = [
    ["SPU分类", "产品线", "SKU名称", "SKU编码", "数量", "购买月份", "单价", "小计", "重要说明"],
    ...exportItems.map((item) => {
      const sku = draftSku(item);
      return [
        sku?.spu || "",
        sku?.productLine || "",
        sku?.skuName || "",
        sku?.skuCode || "",
        item.quantity,
        item.months,
        sku ? unitPrice(item, sku) : 0,
        sku ? calcDraftItem(item) : 0,
        sku?.internalNote || sku?.externalNote || "",
      ];
    }),
    [],
    ["目录总价", "", "", "", "", "", "", listTotal, ""],
    ["折扣率", "", "", "", "", "", "", `${discountRate}%`, ""],
    ["折后总价", "", "", "", "", "", "", discountedTotal, ""],
  ];
  return `\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
}

function triggerCsvDownload(csv, fileName) {
  const encodedCsv = encodeURIComponent(csv);
  const url = `data:text/csv;charset=utf-8,${encodedCsv}`;
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  state.lastExportCsv = csv;
  setQuoteFeedback(
    `已生成报价单：<a href="${url}" download="${escapeHtml(fileName)}" target="_blank" rel="noreferrer">点击下载 ${escapeHtml(
      fileName
    )}</a><button class="copy-csv-button" type="button" data-copy-csv="1">复制CSV内容</button>`,
    "success"
  );
}

function exportCurrentQuote() {
  const csv = buildQuoteCsv();
  if (!csv) {
    setQuoteFeedback("请先加入 SKU 后再导出报价单。", "warning");
    return;
  }
  const quoteName = (els.quoteName?.value || "").trim() || "未命名报价方案";
  const fileName = `${safeFileName(quoteName)}-${exportTimestamp()}.csv`;
  triggerCsvDownload(csv, fileName);
}

function exportSavedQuote(id) {
  const quote = state.savedQuotes.find((item) => item.id === id);
  if (!quote) return;
  const csv = buildQuoteCsv(quote.items, quote.discountRate);
  if (!csv) {
    setQuoteFeedback("该保存方案没有可导出的 SKU。", "warning");
    return;
  }
  triggerCsvDownload(csv, `${safeFileName(quote.name)}-${exportTimestamp()}.csv`);
}

function recommendSkus() {
  const scenario = els.scenarioInput.value.trim();
  if (!scenario) {
    els.assistantAnswer.innerHTML = `<div class="risk inquiry">请先输入客户场景，例如产品线、部署方式、模块、税号数、是否需要实施或外购。</div>`;
    return;
  }

  const baseFilters = inferScenario(scenario);
  const queryContext = currentQueryContext();
  const filters = applyQueryContextToScenario(baseFilters, queryContext);
  filters.preferredProductLine = dominantDraftProductLine();
  const scoredRecommendations = state.skus
    .filter((sku) => matchesQueryContext(sku, queryContext))
    .filter((sku) => !filters.productLine || sku.productLine === filters.productLine)
    .map((sku) => ({ sku, score: scoreSku(sku, filters, scenario), priorityRank: semanticPriorityRank(sku, filters) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
      return b.score - a.score || a.sku.skuName.localeCompare(b.sku.skuName, "zh-CN");
    });
  const seenSkuNames = new Set();
  const recommendations = [];
  for (const item of scoredRecommendations) {
    if (seenSkuNames.has(item.sku.skuName)) continue;
    seenSkuNames.add(item.sku.skuName);
    recommendations.push(item);
    if (recommendations.length >= 12) break;
  }

  const missing = [];
  if (!filters.companyLine && !filters.semantics.length) missing.push("公司级产品线");
  if (!filters.deployment && !filters.semantics.length) missing.push("部署模式");
  if (!/(\d+)\s*个?税号/.test(scenario) && /税号|采购应付|发票管理|销售应收/.test(scenario)) missing.push("税号数量");

  const hints = [
    ...filters.semantics.map((semantic) => semantic.hint),
    filters.semantics.length ? "推荐结果已按 SKU 名称去重；如需区分旗舰版、钉钉版、国际版，可在上方 SKU 查询中按产品线和关键词继续筛选。" : "",
    queryContext.companyLine || queryContext.deployment || queryContext.query
      ? "本次推荐已结合上方 SKU 查询筛选条件。"
      : "",
    filters.deployment === "saas" ? "部署模式判断：SaaS 云部署，优先看订阅版 SKU。" : "",
    filters.deployment === "local" ? "部署模式判断：本地部署，优先看软件版 SKU。" : "",
    taxHint(scenario),
    /实施|开发|人天|集成/.test(scenario) ? "实施、开发、集成、人天类报价需要走需求评审流程。" : "",
    /外购|硬件|托管|询价/.test(scenario) ? "外购、硬件、托管或目录价为 - 的项目需具体咨询销管人员。" : "",
  ].filter(Boolean);

  els.assistantAnswer.innerHTML = `
    <div class="answer-block">
      <strong>场景识别</strong>
      <div class="muted">${escapeHtml(
        [
          filters.companyLine ? `产品线：${filters.companyLine}` : "",
          filters.productLine ? `版本/产品线：${filters.productLine}` : "",
          filters.deployment ? `部署：${filters.deployment === "saas" ? "SaaS 云部署" : "本地部署"}` : "",
          queryContext.query ? `当前查询关键词：${queryContext.query}` : "",
          filters.semantics.length ? `语义场景：${filters.semantics.map((semantic) => semantic.label).join("、")}` : "",
          filters.keywords.length ? `关键词：${filters.keywords.join("、")}` : "",
        ]
          .filter(Boolean)
          .join("；") || "暂未识别到明确产品线或部署模式"
      )}</div>
    </div>
    ${
      missing.length
        ? `<div class="risk inquiry">建议补充：${escapeHtml(missing.join("、"))}。</div>`
        : ""
    }
    ${
      hints.length
        ? `<div class="answer-block"><strong>规则提示</strong>${hints
            .map((hint) => `<div class="risk">${escapeHtml(hint)}</div>`)
            .join("")}</div>`
        : ""
    }
    <div class="answer-block">
      <strong>可能需要的 SKU</strong>
      <div class="recommend-list">
        ${
          recommendations.length
            ? recommendations
                .map(
                  ({ sku }) => {
                    const note = sku.internalNote || sku.externalNote || "";
                    return `
                    <div class="recommend-item">
                      <div class="sku-main">
                        <div>
                          <div class="sku-title">${escapeHtml(sku.skuName)}</div>
                          <div class="sku-code">${escapeHtml(sku.skuCode)} · ${escapeHtml(sku.companyLine)} › ${escapeHtml(sku.spu)}</div>
                        </div>
                        <div class="price">${escapeHtml(sku.listPrice || "-")}</div>
                      </div>
                      <div class="tags">${visibleTags(sku)
                        .map((tag) => `<span class="tag ${tagClass(tag)}">${escapeHtml(tag)}</span>`)
                        .join("")}</div>
                      ${note ? `<div class="recommend-note"><strong>备注说明</strong>${escapeHtml(note).slice(0, 220)}</div>` : ""}
                      <div class="sku-actions">${addButtonHtml(sku.id)}</div>
                    </div>
                  `;
                  }
                )
                .join("")
            : `<div class="empty-state">没有匹配到明显 SKU，请补充产品线或模块名称。</div>`
        }
      </div>
    </div>
  `;
}

function bindEvents() {
  for (const el of [els.companyLineFilter, els.deploymentFilter]) {
    el.addEventListener("change", applyFilters);
  }
  els.searchInput.addEventListener("input", applyFilters);
  els.toggleScopeResults.addEventListener("click", () => {
    state.scopeExpanded = !state.scopeExpanded;
    renderSkuList();
  });
  els.clearFilters.addEventListener("click", () => {
    els.companyLineFilter.value = "";
    els.deploymentFilter.value = "";
    els.searchInput.value = "";
    state.scopeExpanded = false;
    applyFilters();
  });

  document.body.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-add]");
    if (addButton) addToDraft(addButton.dataset.add);
    const removeButton = event.target.closest("[data-remove]");
    if (removeButton) removeFromDraft(removeButton.dataset.remove);
    const loadQuoteButton = event.target.closest("[data-load-quote]");
    if (loadQuoteButton) loadQuote(loadQuoteButton.dataset.loadQuote);
    const deleteQuoteButton = event.target.closest("[data-delete-quote]");
    if (deleteQuoteButton) deleteQuote(deleteQuoteButton.dataset.deleteQuote);
    const exportQuoteButton = event.target.closest("[data-export-quote]");
    if (exportQuoteButton) exportSavedQuote(exportQuoteButton.dataset.exportQuote);
    const copyCsvButton = event.target.closest("[data-copy-csv]");
    if (copyCsvButton) {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard
          .writeText(state.lastExportCsv)
          .then(() => setQuoteFeedback("CSV 内容已复制，可以粘贴到本地文本文件并保存为 .csv。", "success"))
          .catch(fallbackCopyCsv);
      } else {
        fallbackCopyCsv();
      }
    }
  });

  els.draftList.addEventListener("input", (event) => {
    const input = event.target.closest("[data-field]");
    if (!input) return;
    const item = state.draft.find((draftItem) => draftItem.id === input.dataset.id);
    if (!item) return;
    item[input.dataset.field] = Number(input.value || 0);
    renderDraft();
  });

  els.discountRate.addEventListener("input", () => {
    const value = Number(els.discountRate.value || 0);
    state.discountRate = Math.max(0, Math.min(100, value));
    renderDraft();
  });

  els.clearDraft.addEventListener("click", () => {
    state.draft = [];
    renderDraft();
  });

  els.saveQuote.addEventListener("click", openSaveQuoteModal);
  els.confirmSaveQuote.addEventListener("click", saveCurrentQuote);
  els.cancelSaveQuote.addEventListener("click", closeSaveQuoteModal);
  els.cancelSaveQuoteBottom.addEventListener("click", closeSaveQuoteModal);
  els.saveQuoteModal.addEventListener("click", (event) => {
    if (event.target === els.saveQuoteModal) closeSaveQuoteModal();
  });
  els.saveQuoteName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") saveCurrentQuote();
    if (event.key === "Escape") closeSaveQuoteModal();
  });
  els.exportQuote.addEventListener("click", exportCurrentQuote);

  els.recommendButton.addEventListener("click", recommendSkus);
  els.exampleButton.addEventListener("click", () => {
    els.scenarioInput.value = "客户要做出海相关能力，涉及海外员工报销、多语言、海外部署节点、非中国区发票识别和发票翻译";
    recommendSkus();
  });
}

async function boot() {
  try {
    const response = await fetch("./data/sku-data.json");
    state.data = await response.json();
  } catch (error) {
    if (!window.SKU_DATA) throw error;
    state.data = window.SKU_DATA;
  }
  state.skus = state.data.skus.filter((sku) => !isDiscontinuedSkuId(sku.id));
  state.filtered = state.skus.slice(0, 120);

  if (els.skuCount) {
    els.skuCount.textContent = state.skus.length;
  }
  initFilters();
  loadSavedQuotes();
  renderSkuList();
  renderDraft();
  renderSavedQuotes();
  bindEvents();
}

function showLoadError(error) {
  console.error(error);
  document.body.innerHTML = `<div class="empty-state">应用加载失败：${escapeHtml(error.message)}</div>`;
}

function start() {
  if (hasAccess()) {
    unlockApp();
    boot().catch(showLoadError);
    return;
  }
  bindAuthGate();
}

start();

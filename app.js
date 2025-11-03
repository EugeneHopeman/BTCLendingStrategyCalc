// Konstanten
const FEE_RATE = 1.5;
const COLLATERAL_RATIO = 2;

// Power Law Parameter
const GENESIS_DATE = new Date('2009-01-03');
const POWER_LAW_ALPHA = 5.8;
let POWER_LAW_A = 1e-20;

// Language
let currentLanguage = 'de';
let currentCurrency = 'EUR';

// Firefish Fee
function calculateFirefishFeeBTC(loanAmount, duration, btcPrice) {
  const durationInDays = (duration / 12) * 365;
  const feeBTC = (0.015 * loanAmount * (durationInDays / 365)) / btcPrice;
  return parseFloat(feeBTC.toFixed(6));
}

// Chart: GESTAPELTE BALKEN + TILGUNG
let priceChart = null;

function initializeChart() {
  const canvas = document.getElementById('btc-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  priceChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: currentLanguage === 'de' ? 'Initialer BTC-Bestand' : 'Initial BTC Holdings',
        data: [],
        backgroundColor: '#f7931a',
        borderColor: '#e67e22',
        borderWidth: 1,
      }, {
        label: currentLanguage === 'de' ? 'Hinzugewonnener BTC' : 'Gained BTC',
        data: [],
        backgroundColor: '#f9a66c',
        borderColor: '#f39c5a',
        borderWidth: 1,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { color: '#e2e8f0', font: { size: 12 } } },
        tooltip: {
          backgroundColor: 'rgba(26, 29, 33, 0.9)',
          titleColor: '#e2e8f0',
          bodyColor: '#e2e8f0',
          borderColor: '#f7931a',
          borderWidth: 1,
          callbacks: {
            title: ctx => `${ctx[0].label}`,
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(6)} BTC`,
            afterBody: function() { return ''; }
          }
        }
      },
      scales: {
        x: { stacked: true, grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: '#a0aec0', font: { size: 11 } } },
        y: {
  stacked: true,
  grid: { color: 'rgba(255, 255, 255, 0.1)' },
  ticks: {
    color: '#a0aec0',
    font: { size: 11 },
    callback: function(value) {
      if (Number.isInteger(value)) {
        return value + ' BTC';
      }
      return parseFloat(value.toFixed(2)) + ' BTC';
    }
  }
}
      },
      animation: { duration: 2000, easing: 'easeOutQuart' },
      interaction: { mode: 'index' }
    }
  });
}

function updateChart(btcHistory, initialBtc) {
  if (!priceChart) return;

  const labels = btcHistory.map(e => {
  const yearDisplay = Number.isInteger(e.year) ? e.year : e.year.toFixed(2);
  const yearLabel = currentLanguage === 'de'
    ? (e.isRepayment ? `Tilgung (Jahr ${yearDisplay})` : `Jahr ${yearDisplay}`)
    : (e.isRepayment ? `Repayment (Year ${yearDisplay})` : `Year ${yearDisplay}`);
  return yearLabel;
});

  // Initialer Bestand: immer gleich
  const initialData = btcHistory.map(() => initialBtc);

  // Hinzugewonnene BTC: aktuell - initial → ab Jahr 0 positiv!
  const gainedData = btcHistory.map(entry => parseFloat((entry.btc - initialBtc).toFixed(6)));

  // Farben: ALLE Balken ab Jahr 0 grün/rot (kein Sonderfall!)
  const gainedColors = gainedData.map(g => g >= 0 ? '#48bb78' : '#e53e3e');

  priceChart.data.labels = labels;
  priceChart.data.datasets[0].data = initialData;
  priceChart.data.datasets[1].data = gainedData;
  priceChart.data.datasets[1].backgroundColor = gainedColors;
  priceChart.data.datasets[0].priceData = btcHistory.map(e => e.btcPrice);

  // Tooltip
  priceChart.options.plugins.tooltip.callbacks.afterBody = function(ctx) {
    const total = ctx.reduce((s, i) => s + i.parsed.y, 0);
    const idx = ctx[0].dataIndex;
    const price = ctx[0].chart.data.datasets[0].priceData?.[idx];
    const isRepayment = ctx[0].chart.data.labels[idx].includes('Tilgung') || ctx[0].chart.data.labels[idx].includes('Repayment');
    let extra = '';
    if (isRepayment) extra = `\n${currentLanguage === 'de' ? 'Nach Tilgung' : 'After repayment'}`;
    return price ? `Total BTC: ${total.toFixed(6)}\n` +
      (currentLanguage === 'de'
        ? `Preis: ${price.toLocaleString('de-DE', {maximumFractionDigits: 0})} €`
        : `Price: ${price.toLocaleString('en-US', {maximumFractionDigits: 0})} $`) + extra
      : '';
  };

  priceChart.update();
}

// BTC Preis + Power Law Kalibrierung
async function fetchBitcoinPrice() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur');
    const data = await res.json();
    if (data.bitcoin) {
      const usd = data.bitcoin.usd;
      const eur = data.bitcoin.eur;
      const el = document.getElementById('current-btc-price');
      if (el) {
        el.innerHTML = currentLanguage === 'de'
          ? `BTC Preis: <b>${usd.toLocaleString('de-DE')} $</b> | <b>${eur.toLocaleString('de-DE')} €</b>`
          : `BTC Price: <b>${usd.toLocaleString('en-US')} $</b> | <b>${eur.toLocaleString('en-US')} €</b>`;
      }
      const input = document.getElementById('btc-price');
      if (input && !input.value) input.value = currentLanguage === 'de' ? eur : usd;

      const days = (new Date() - GENESIS_DATE) / (1000 * 60 * 60 * 24);
      POWER_LAW_A = eur / Math.pow(days, POWER_LAW_ALPHA);
    }
  } catch (e) {
    document.getElementById('current-btc-price').innerHTML = currentLanguage === 'de' ? 'BTC Preis: <b>–</b>' : 'BTC Price: <b>–</b>';
  }
}

function getPowerLawPrice(yearsFromNow) {
  const future = new Date();
  future.setFullYear(future.getFullYear() + yearsFromNow);
  const days = (future - GENESIS_DATE) / (1000 * 60 * 60 * 24);
  return POWER_LAW_A * Math.pow(days, POWER_LAW_ALPHA);
}

// Loan Berechnung MIT FINALER TILGUNG
function calculateLoan(params) {
  const { btcAmount, loanAmount, duration, interestRate, btcPrice, priceGrowth, cycleCount, btcBuyPercent } = params;

  if (btcAmount <= 0) return { error: currentLanguage === 'de' ? 'BTC-Bestand muss positiv sein.' : 'BTC Holdings must be positive.' };
  if (loanAmount <= 0) return { error: currentLanguage === 'de' ? 'Kreditsumme muss positiv sein.' : 'Loan amount must be positive.' };
  if (btcPrice <= 0) return { error: currentLanguage === 'de' ? 'BTC-Preis muss positiv sein.' : 'BTC price must be positive.' };
  if (duration <= 0) return { error: currentLanguage === 'de' ? 'Laufzeit muss positiv sein.' : 'Duration must be positive.' };
  if (cycleCount < 1 || cycleCount > 30) return { error: currentLanguage === 'de' ? 'Anzahl Zyklen muss zwischen 1 und 30 liegen.' : 'Number of cycles must be between 1 and 30.' };
  if (btcBuyPercent < 0 || btcBuyPercent > 50) return { error: currentLanguage === 'de' ? 'BTC-Kauf-Anteil muss 0–50% sein.' : 'BTC purchase share must be 0–50%.' };

  let currentBtc = parseFloat(btcAmount.toFixed(6));
  let currentBtcPrice = btcPrice;
  let totalCost = 0;
  let btcHistory = [];
  let cycleDetails = [];
  let yearsElapsed = 0;
  let currentLoan = loanAmount;
  let previousDebt = 0;

  for (let cycle = 0; cycle < cycleCount; cycle++) {
    let btcBought = 0;
    let buyAmount = 0;
    let firefishFee = currentLoan * (FEE_RATE / 100);
    let firefishFeeBTC = calculateFirefishFeeBTC(currentLoan, duration, currentBtcPrice);
    let totalLoan = currentLoan;
    let collateralBtc = parseFloat(((totalLoan * COLLATERAL_RATIO) / currentBtcPrice).toFixed(6));
    let kaufpreisProBTC = null;
    let maxLoan = 0;
    let desiredLoan = 0;
    let collateralNeeded = 0;

    if (cycle === 0) {
      buyAmount = currentLoan;
      btcBought = parseFloat((buyAmount / currentBtcPrice).toFixed(6));
    } else {
      totalCost += previousDebt;
      const collateralValue = currentBtc * currentBtcPrice;
      maxLoan = collateralValue / COLLATERAL_RATIO;
      desiredLoan = btcBuyPercent === 0 ? previousDebt : previousDebt / (1 - btcBuyPercent / 100);
      let newLoan = Math.min(maxLoan, desiredLoan);
      buyAmount = newLoan - previousDebt;
      firefishFee = newLoan * (FEE_RATE / 100);
      firefishFeeBTC = calculateFirefishFeeBTC(newLoan, duration, currentBtcPrice);
      totalLoan = newLoan;
      collateralBtc = parseFloat(((totalLoan * COLLATERAL_RATIO) / currentBtcPrice).toFixed(6));
      if (buyAmount < 0) return { error: currentLanguage === 'de' ? `Zyklus ${cycle}: Nicht genug Kredit für Tilgung.` : `Cycle ${cycle}: Not enough loan for repayment.` };
      btcBought = parseFloat((buyAmount / currentBtcPrice).toFixed(6));
      currentLoan = newLoan;
      if (maxLoan < desiredLoan) {
        collateralNeeded = parseFloat((desiredLoan * COLLATERAL_RATIO / currentBtcPrice).toFixed(6));
      }
    }

    if (collateralBtc > currentBtc) return { error: currentLanguage === 'de' ? `Zyklus ${cycle}: Nicht genug BTC als Sicherheit.` : `Cycle ${cycle}: Not enough BTC as collateral.` };
    if (btcBought > 0) kaufpreisProBTC = currentBtcPrice;

    currentBtc = parseFloat((currentBtc - collateralBtc + btcBought - firefishFeeBTC + collateralBtc).toFixed(6));
    if (currentBtc < 0) return { error: "Gebühr zu hoch." };

    btcHistory.push({ year: yearsElapsed, btc: currentBtc, btcPrice: currentBtcPrice });
    cycleDetails.push({
      cycle, year: yearsElapsed, btcBought, buyAmount, firefishFee, firefishFeeBTC,
      previousDebt: cycle === 0 ? 0 : previousDebt, totalLoan, collateralBtc,
      kaufpreisProBTC, maxLoan: cycle === 0 ? currentLoan : maxLoan,
      desiredLoan: cycle === 0 ? currentLoan : desiredLoan, collateralNeeded
    });

    if (cycle < cycleCount - 1) {
      const interest = currentLoan * (interestRate / 100) * (duration / 12);
      const cycleCost = currentLoan + interest;
      yearsElapsed += duration / 12;

      if (priceGrowth === 'power_law') {
        currentBtcPrice = getPowerLawPrice(yearsElapsed);
      } else {
        currentBtcPrice *= Math.pow(1 + priceGrowth / 100, duration / 12);
      }
      previousDebt = cycleCost;
    }
  }

  // === FINALER TILGUNGS-ZYKLUS ===
  const finalInterest = currentLoan * (interestRate / 100) * (duration / 12);
  const finalDebt = currentLoan + finalInterest;
  let finalBtcPrice = currentBtcPrice;
  if (priceGrowth === 'power_law') {
    finalBtcPrice = getPowerLawPrice(yearsElapsed + duration / 12);
  } else {
    finalBtcPrice *= Math.pow(1 + priceGrowth / 100, duration / 12);
  }

  const btcForRepayment = parseFloat((finalDebt / finalBtcPrice).toFixed(6));
  const finalBtcAfterRepayment = parseFloat((currentBtc - btcForRepayment).toFixed(6));
  const finalBtcValueAfter = finalBtcAfterRepayment * finalBtcPrice;

  const repaymentYear = yearsElapsed + (duration / 12);
  btcHistory.push({
    year: repaymentYear,
    btc: finalBtcAfterRepayment,
    btcPrice: finalBtcPrice,
    isRepayment: true
  });

  totalCost += finalDebt;
  const gainedBtc = parseFloat((finalBtcAfterRepayment - btcAmount).toFixed(6));

  return {
    finalBtc: currentBtc,
    finalBtcAfterRepayment,
    btcForRepayment,
    gainedBtc,
    totalCost,
    finalBtcValue: currentBtc * currentBtcPrice,
    finalBtcValueAfter,
    finalBtcPrice,
    btcHistory,
    yearsElapsed: repaymentYear,
    cycleDetails
  };
}

// DOM & Init
let resultsDiv, cycleDetailsDiv;

window.onload = () => {
  resultsDiv = document.getElementById('results');
  cycleDetailsDiv = document.getElementById('cycle-details');

  fetchBitcoinPrice();
  setInterval(fetchBitcoinPrice, 300000);

  const defaults = { 'btc-amount': 0.2, 'amount': 5000, 'btc-price': 100000, 'duration': 12, 'interest-rate': 10, 'price-growth': 30, 'cycle-count': 5, 'btc-buy-percent': 50 };
  Object.entries(defaults).forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.value = val; });

  initializeChart();
  initializeDonateModal();

  document.getElementById('toggle-lang-btn')?.addEventListener('click', () => {
    currentLanguage = document.getElementById('toggle-lang-btn').dataset.lang;
    updateLanguage();
  });

  document.getElementById('calculate-btn').addEventListener('click', performCalculation);
  document.getElementById('use-power-law')?.addEventListener('change', performCalculation);

  updateLanguage();
};

function updateLanguage() {
  document.querySelectorAll('[data-de][data-en]').forEach(el => el.textContent = el.dataset[currentLanguage]);
  document.querySelectorAll('.input-unit[data-de][data-en]').forEach(el => el.textContent = el.dataset[currentLanguage]);
  const btn = document.getElementById('toggle-lang-btn');
  if (btn) { btn.textContent = currentLanguage === 'de' ? 'English' : 'Deutsch'; btn.dataset.lang = currentLanguage === 'de' ? 'en' : 'de'; }
  currentCurrency = currentLanguage === 'de' ? 'EUR' : 'USD';
  fetchBitcoinPrice();
  performCalculation();
}

function performCalculation() {
  const usePowerLaw = document.getElementById('use-power-law').checked;
  const manualGrowth = parseFloat(document.getElementById('price-growth').value) || 30;

  const params = {
    btcAmount: parseFloat(document.getElementById('btc-amount').value) || 0.1,
    loanAmount: parseFloat(document.getElementById('amount').value) || 5000,
    duration: parseFloat(document.getElementById('duration').value) || 12,
    interestRate: parseFloat(document.getElementById('interest-rate').value) || 10,
    btcPrice: parseFloat(document.getElementById('btc-price').value) || 100000,
    priceGrowth: usePowerLaw ? 'power_law' : manualGrowth,
    cycleCount: parseInt(document.getElementById('cycle-count').value) || 5,
    btcBuyPercent: parseFloat(document.getElementById('btc-buy-percent').value) || 50
  };

  document.getElementById('price-growth').disabled = usePowerLaw;
  document.getElementById('price-growth').style.opacity = usePowerLaw ? '0.5' : '1';

  const result = calculateLoan(params);
  if (result.error) {
    resultsDiv.innerHTML = `<p style="color:#e53e3e;">${result.error}</p>`;
    cycleDetailsDiv.innerHTML = '';
    return;
  }

  const locale = currentLanguage === 'de' ? 'de-DE' : 'en-US';
  const sym = currentCurrency === 'EUR' ? '€' : '$';

  resultsDiv.innerHTML = `
    <h3 style="color:#f7931a;">${currentLanguage === 'de' ? 'Ergebnisse:' : 'Results:'}</h3>
    <div style="margin:10px 0; background:#232936; border-left:3px solid #f7931a; border-radius:6px; padding:10px 15px;">
      ${currentLanguage === 'de' ? 'BTC vor Tilgung: ' : 'BTC before repayment: '}<b>${result.finalBtc.toFixed(6)}</b>
    </div>
    <div style="margin:10px 0; background:#232936; border-left:3px solid #f7931a; border-radius:6px; padding:10px 15px;">
      ${currentLanguage === 'de' ? 'BTC nach Tilgung: ' : 'BTC after repayment: '}<b>${result.finalBtcAfterRepayment.toFixed(6)}</b>
    </div>
    <div style="margin:10px 0; background:#232936; border-left:3px solid #f7931a; border-radius:6px; padding:10px 15px;">
      ${currentLanguage === 'de' ? 'Finaler BTC-Wert (nach Tilgung): ' : 'Final BTC value (after repayment): '}<b>${result.finalBtcValueAfter.toLocaleString(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${sym}</b>
    </div>
	<div style="margin:10px 0; background:#232936; border-left:3px solid #48bb78; border-radius:6px; padding:10px 15px;">
      ${currentLanguage === 'de' ? 'Tilgung in BTC: ' : 'Repayment in BTC: '}<b>${result.btcForRepayment.toFixed(6)}</b>
    </div>
    <div style="margin:10px 0; background:#232936; border-left:3px solid ${result.gainedBtc >= 0 ? '#48bb78' : '#e53e3e'}; border-radius:6px; padding:10px 15px;">
      ${currentLanguage === 'de' ? 'Hinzugewonnene BTC (netto): ' : 'Net gained BTC: '}<b>${result.gainedBtc >= 0 ? '+' : ''}${result.gainedBtc.toFixed(6)}</b>
    </div>
  `;

  cycleDetailsDiv.innerHTML = `
    <h3 style="color:#f7931a;">${currentLanguage === 'de' ? 'Ihre Zyklus-Details:' : 'Your Cycle Details:'}</h3>
    ${result.cycleDetails.map((d, i) => `
      <div style="margin-bottom:15px; background:#232936; border-left:3px solid #f7931a; border-radius:6px; padding:12px;">
        <b>${currentLanguage === 'de' ? `Zyklus ${d.cycle} (Jahr ${d.year.toFixed(2)})` : `Cycle ${d.cycle} (Year ${d.year.toFixed(2)})`}</b><br>
        ${currentLanguage === 'de' ? 'Gekauft: ' : 'Purchased: '}${d.btcBought.toFixed(6)} BTC (${d.buyAmount.toLocaleString(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${sym})<br>
        ${d.cycle > 0 ? `${currentLanguage === 'de' ? 'Zu tilgender Betrag: ' : 'Amount to be repaid: '}${d.previousDebt.toLocaleString(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${sym}<br>` : ''}
        ${d.kaufpreisProBTC ? `${currentLanguage === 'de' ? 'Kaufpreis pro BTC: ' : 'Purchase price per BTC: '}${d.kaufpreisProBTC.toLocaleString(locale, {maximumFractionDigits: 2})} ${sym}<br>` : ''}
        ${currentLanguage === 'de' ? 'Lending-Gebühr (1,5%): ' : 'Lending Fee (1.5%): '}${d.firefishFee.toLocaleString(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${sym} (${d.firefishFeeBTC.toFixed(6)} BTC)<br>
        <strong>${currentLanguage === 'de' ? 'Kredit: ' : 'Loan: '}</strong>${d.totalLoan.toLocaleString(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${sym}<br>
        <strong>${currentLanguage === 'de' ? 'min. zu beleihende BTC: ' : 'Min. BTC to be lent: '}</strong>${d.collateralBtc.toFixed(6)} BTC
        ${d.cycle > 0 && d.maxLoan < d.desiredLoan ? `<br><span style="color:#e53e3e; font-size:0.9em;">(${currentLanguage === 'de' ? 'reduziert – nötig wären' : 'reduced – required'} ${d.collateralNeeded.toFixed(6)} BTC)</span>` : ''}
        ${i === result.cycleDetails.length - 1 ? `
          <br><br><strong style="color:#48bb78;">
            ${currentLanguage === 'de' ? 'Tilgung im nächsten Jahr: ' : 'Repayment next year: '}
            ${result.btcForRepayment.toFixed(6)} BTC
            (${(result.btcForRepayment * result.finalBtcPrice).toLocaleString(locale, {minimumFractionDigits: 2})} ${sym})
          </strong>
        ` : ''}
      </div>
    `).join('<hr style="border-top:1px solid #2d3748; margin:10px 0;">')}
  `;

  updateChart(result.btcHistory, params.btcAmount);
}

// Donate Modal
const LIGHTNING_ADDRESS = "lno1zrxq8pjw7qjlm68mtp7e3yvxee4y5xrgjhhyf2fxhlphpckrvevh50u0qf94jc4eqawau0glf6dekp7krm6qtndxr09fmtxlj6ggc3h0cdcz6qsz044kq6us48apmjsrusa8cr5tal2twwv0uwtjlddjzmxdz6jattvsqvux2ltp8mjg3mdad974lgr2vm5x5qk67kg07cjqzcfcm68kpcc7hexy644tnv9t3nm6d2v2sa45cq2ddhqmqdxw80qxvmjzm3m2mj99dm07pf8tuw6hp6z0f29wdg6xvpda0066qqqs8xkg5q3f23x7pfl84zduet890c";
const BITCOIN_ADDRESS = "bc1pdep7wk379yjswhvwhk0m478q8r6shkv5uhjtxq7tdu85slvy7wswqsjmsyu6920";

function initializeDonateModal() {
  const modal = document.getElementById('donate-modal');
  const btn = document.getElementById('donate-btn');
  const close = document.getElementById('close-modal');
  const tabs = document.querySelectorAll('.tab-btn');

  btn?.addEventListener('click', () => { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; });
  close?.addEventListener('click', () => { modal.style.display = 'none'; document.body.style.overflow = 'auto'; });
  modal?.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; document.body.style.overflow = 'auto'; });

  tabs.forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    t.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
    document.getElementById(t.dataset.tab + '-tab').style.display = 'block';
  }));
}

function copyToClipboard(id) {
  const input = document.getElementById(id);
  input.select();
  navigator.clipboard.writeText(input.value).then(() => {
    const btn = input.nextElementSibling;
    const old = btn.textContent;
    btn.textContent = currentLanguage === 'de' ? 'Kopiert!' : 'Copied!';
    btn.style.background = '#48bb78';
    setTimeout(() => { btn.textContent = old; btn.style.background = '#f7931a'; }, 2000);
  });
}
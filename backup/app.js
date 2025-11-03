// Konstanten
const FEE_RATE = 1.5;
const BLOCKCHAIN_FEE = 0;
const COLLATERAL_RATIO = 2;

// Language state
let currentLanguage = 'de';
let currentCurrency = 'EUR';

// Berechnet die Firefish-Gebühr in BTC basierend auf der offiziellen Formel
function calculateFirefishFeeBTC(loanAmount, duration, btcPrice) {
  const durationInDays = (duration / 12) * 365;
  const feeBTC = (0.015 * loanAmount * (durationInDays / 365)) / btcPrice;
  return parseFloat(feeBTC.toFixed(4));
}

// Chart.js-Initialisierung
let priceChart = null;

function initializeChart() {
  const canvas = document.getElementById('btc-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  priceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: currentLanguage === 'de' ? 'BTC-Bestand' : 'BTC Holdings',
        data: [],
        borderColor: '#f7931a',
        backgroundColor: 'rgba(247, 147, 26, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#f7931a',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: '#e2e8f0',
            font: { size: 12 }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(26, 29, 33, 0.9)',
          titleColor: '#e2e8f0',
          bodyColor: '#e2e8f0',
          borderColor: '#f7931a',
          borderWidth: 1,
          callbacks: {
            title: function(context) {
              return `${context[0].label}`;
            },
            label: function(context) {
              const btc = context.parsed.y;
              return `BTC: ${btc.toFixed(4)}`;
            },
            afterLabel: function(context) {
              const dataIndex = context.dataIndex;
              const dataset = context.chart.data.datasets[0];
              if (dataset.priceData && dataset.priceData[dataIndex]) {
                return currentLanguage === 'de'
                  ? `Preis: ${dataset.priceData[dataIndex].toLocaleString('de-DE', {maximumFractionDigits: 0})} €`
                  : `Price: ${dataset.priceData[dataIndex].toLocaleString('en-US', {maximumFractionDigits: 0})} $`;
              }
              return '';
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          ticks: { color: '#a0aec0', size: 11 }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          ticks: {
            color: '#a0aec0',
            size: 11,
            callback: function(value) { return value.toFixed(4) + ' BTC'; }
          }
        }
      },
      animation: {
        duration: 2000,
        easing: 'easeOutQuart'
      },
      interaction: { intersect: false, mode: 'index' }
    }
  });
}

function updateChart(btcHistory) {
  if (!priceChart) return;
  const labels = btcHistory.map(entry => currentLanguage === 'de' ? `Jahr ${entry.year.toFixed(2)}` : `Year ${entry.year.toFixed(2)}`);
  const data = btcHistory.map(entry => entry.btc);
  const priceData = btcHistory.map(entry => entry.btcPrice);
  priceChart.data.labels = labels;
  priceChart.data.datasets[0].data = data;
  priceChart.data.datasets[0].priceData = priceData;
  priceChart.data.datasets[0].label = currentLanguage === 'de' ? 'BTC-Bestand' : 'BTC Holdings';
  priceChart.update();
}

// Holt aktuellen BTC-Preis in USD und EUR und setzt ihn im Header und Eingabefeld
async function fetchBitcoinPrice() {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur');
    const data = await response.json();
    if (data.bitcoin) {
      const priceUSD = data.bitcoin.usd;
      const priceEUR = data.bitcoin.eur;
      const priceElement = document.getElementById('current-btc-price');
      if (priceElement) {
        priceElement.innerHTML = currentLanguage === 'de'
          ? `BTC Preis: <b>${priceUSD.toLocaleString('de-DE')} $</b> | <b>${priceEUR.toLocaleString('de-DE')} €</b>`
          : `BTC Price: <b>${priceUSD.toLocaleString('en-US')} $</b> | <b>${priceEUR.toLocaleString('en-US')} €</b>`;
      }
      const btcPriceInput = document.getElementById('btc-price');
      if (btcPriceInput && !btcPriceInput.value) {
        btcPriceInput.value = currentLanguage === 'de' ? priceEUR : priceUSD;
      }
    }
  } catch (error) {
    const priceElement = document.getElementById('current-btc-price');
    if (priceElement) {
      priceElement.innerHTML = currentLanguage === 'de' ? 'BTC Preis: <b>–</b>' : 'BTC Price: <b>–</b>';
    }
  }
}

// Loan-Berechnung mit korrigierter Firefish-Gebührenlogik
function calculateLoan(params) {
  const { btcAmount, loanAmount, duration, interestRate, btcPrice, priceGrowth, cycleCount, btcBuyPercent } = params;
  if (isNaN(btcAmount) || btcAmount <= 0) return { error: currentLanguage === 'de' ? 'BTC-Bestand muss positiv sein.' : 'BTC Holdings must be positive.' };
  if (isNaN(loanAmount) || loanAmount <= 0) return { error: currentLanguage === 'de' ? 'Kreditsumme muss positiv sein.' : 'Loan amount must be positive.' };
  if (isNaN(btcPrice) || btcPrice <= 0) return { error: currentLanguage === 'de' ? 'BTC-Preis muss positiv sein.' : 'BTC price must be positive.' };
  if (isNaN(duration) || duration <= 0) return { error: currentLanguage === 'de' ? 'Laufzeit muss positiv sein.' : 'Duration must be positive.' };
  if (isNaN(interestRate) || interestRate < 0) return { error: currentLanguage === 'de' ? 'Zinssatz darf nicht negativ sein.' : 'Interest rate cannot be negative.' };
  if (isNaN(cycleCount) || cycleCount < 1 || cycleCount > 30) return { error: currentLanguage === 'de' ? 'Anzahl darauffolgender Kredite muss zwischen 1 und 30 liegen.' : 'Number of subsequent loans must be between 1 and 10.' };
  if (isNaN(btcBuyPercent) || btcBuyPercent < 0 || btcBuyPercent > 50) return { error: currentLanguage === 'de' ? 'Prozentsatz für BTC-Kauf muss zwischen 0 und 50 liegen.' : 'Percentage for BTC purchase must be between 0 and 50.' };

  let currentBtc = parseFloat(btcAmount.toFixed(4));
  let currentBtcPrice = btcPrice;
  let totalCost = 0;
  let btcHistory = [];
  let cycleDetails = [];
  let yearsElapsed = 0;
  let currentLoan = loanAmount;
  let previousDebt = 0;
  const cycles = cycleCount;

  for (let cycle = 0; cycle < cycles; cycle++) {
    let btcBought = 0;
    let buyAmount = 0;
    let firefishFee = currentLoan * (FEE_RATE / 100);
    let firefishFeeBTC = calculateFirefishFeeBTC(currentLoan, duration, currentBtcPrice);
    let totalLoan = currentLoan;
    let collateralBtc = parseFloat(((totalLoan * COLLATERAL_RATIO) / currentBtcPrice).toFixed(4));
    let kaufpreisProBTC = null;
    let maxLoan = 0;
    let desiredLoan = 0;
    let collateralNeeded = 0;

    if (cycle === 0) {
      buyAmount = currentLoan;
      btcBought = parseFloat((buyAmount / currentBtcPrice).toFixed(4));
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
      collateralBtc = parseFloat(((totalLoan * COLLATERAL_RATIO) / currentBtcPrice).toFixed(4));
      if (buyAmount < 0) {
        return { error: currentLanguage === 'de'
          ? `Nicht genug Kredit im Zyklus ${cycle} für Tilgung. Benötigt: ${previousDebt.toFixed(2)} ${currentCurrency}, verfügbar: ${newLoan.toFixed(2)} ${currentCurrency}`
          : `Not enough loan in cycle ${cycle} for repayment. Required: ${previousDebt.toFixed(2)} ${currentCurrency}, available: ${newLoan.toFixed(2)} ${currentCurrency}` };
      }
      btcBought = parseFloat((buyAmount / currentBtcPrice).toFixed(4));
      currentLoan = newLoan;
      if (maxLoan < desiredLoan) {
        collateralNeeded = parseFloat((desiredLoan * COLLATERAL_RATIO / currentBtcPrice).toFixed(4));
      }
    }

    if (collateralBtc > currentBtc || isNaN(collateralBtc)) {
      return { error: currentLanguage === 'de'
        ? `Nicht genug BTC im Zyklus ${cycle}. Benötigt: ${collateralBtc.toFixed(4)} BTC, verfügbar: ${currentBtc.toFixed(4)} BTC`
        : `Not enough BTC in cycle ${cycle}. Required: ${collateralBtc.toFixed(4)} BTC, available: ${currentBtc.toFixed(4)} BTC` };
    }

    if (btcBought > 0 && buyAmount > 0) {
      kaufpreisProBTC = currentBtcPrice;
    }

    currentBtc = parseFloat((currentBtc - collateralBtc + btcBought).toFixed(4));
    if (isNaN(currentBtc)) {
      return { error: currentLanguage === 'de' ? `Ungültiger BTC-Bestand im Zyklus ${cycle} nach Kauf` : `Invalid BTC holdings in cycle ${cycle} after purchase` };
    }
    
    currentBtc = parseFloat((currentBtc - firefishFeeBTC).toFixed(4));
    if (isNaN(currentBtc) || currentBtc < 0) {
      return { error: currentLanguage === 'de'
        ? `Nicht genug BTC für Firefish-Gebühr im Zyklus ${cycle}. Benötigt: ${firefishFeeBTC.toFixed(4)} BTC`
        : `Not enough BTC for Firefish fee in cycle ${cycle}. Required: ${firefishFeeBTC.toFixed(4)} BTC` };
    }
    
    currentBtc = parseFloat((currentBtc + collateralBtc).toFixed(4));
    if (isNaN(currentBtc)) {
      return { error: currentLanguage === 'de' ? `Ungültiger BTC-Bestand im Zyklus ${cycle} nach Rückgabe` : `Invalid BTC holdings in cycle ${cycle} after return` };
    }

    btcHistory.push({ year: yearsElapsed, btc: currentBtc, btcPrice: currentBtcPrice, btcBought });
    cycleDetails.push({
      cycle,
      year: yearsElapsed,
      btcBought,
      buyAmount,
      firefishFee,
      firefishFeeBTC,
      previousDebt: cycle === 0 ? 0 : previousDebt,
      totalLoan,
      collateralBtc,
      currentBtc,
      kaufpreisProBTC,
      maxLoan: cycle === 0 ? currentLoan : maxLoan,
      desiredLoan: cycle === 0 ? currentLoan : desiredLoan,
      collateralNeeded: cycle === 0 ? 0 : collateralNeeded
    });

    if (cycle < cycles - 1) {
      const interest = currentLoan * (interestRate / 100) * (duration / 12);
      const cycleCost = currentLoan + interest;
      yearsElapsed += duration / 12;
      currentBtcPrice *= (1 + priceGrowth / 100 * (duration / 12));
      previousDebt = cycleCost;
    }
  }

  const finalInterest = currentLoan * (interestRate / 100) * (duration / 12);
  const finalCycleCost = currentLoan + finalInterest;
  totalCost += finalCycleCost;

  const finalBtcValue = currentBtc * currentBtcPrice;
  const liquidationPrice = totalCost / (currentBtc * COLLATERAL_RATIO);
  const gainedBtc = parseFloat((currentBtc - btcAmount).toFixed(4));

  if (isNaN(finalBtcValue) || isNaN(gainedBtc)) {
    return { error: currentLanguage === 'de' ? 'Ungültige Endergebnisse bei der Berechnung' : 'Invalid final results during calculation' };
  }

  return {
    finalBtc: currentBtc,
    gainedBtc,
    totalCost,
    finalBtcValue,
    liquidationPrice,
    btcHistory,
    yearsElapsed,
    finalBtcPrice: currentBtcPrice,
    cycleDetails
  };
}

// DOM Elemente
let form, calculateBtn, resultsDiv, cycleDetailsDiv;

function updateLanguage() {
  document.querySelectorAll('[data-de][data-en]').forEach(element => {
    element.textContent = element.dataset[currentLanguage];
  });
  document.querySelectorAll('.input-unit[data-de][data-en]').forEach(element => {
    element.textContent = element.dataset[currentLanguage];
  });
  const toggleBtn = document.getElementById('toggle-lang-btn');
  if (toggleBtn) {
    toggleBtn.textContent = currentLanguage === 'de' ? '🇺🇸 English' : '🇩🇪 Deutsch';
    toggleBtn.dataset.lang = currentLanguage === 'de' ? 'en' : 'de';
  }
  currentCurrency = currentLanguage === 'de' ? 'EUR' : 'USD';
  fetchBitcoinPrice();
  performCalculation();
}

function initializeToggleButton() {
  const toggleBtn = document.getElementById('toggle-lang-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      currentLanguage = toggleBtn.dataset.lang;
      updateLanguage();
    });
  }
}

window.onload = () => {
  try {
    form = document.getElementById('loanForm');
    calculateBtn = document.getElementById('calculate-btn');
    resultsDiv = document.getElementById('results');
    cycleDetailsDiv = document.getElementById('cycle-details');

    fetchBitcoinPrice();
    setInterval(fetchBitcoinPrice, 5 * 60 * 1000);

    const DEFAULT_VALUES = {
      'btc-amount': 0.2,
      'amount': 5000,
      'btc-price': 100000,
      'duration': 12,
      'interest-rate': 10,
      'price-growth': 30,
      'cycle-count': 5,
      'btc-buy-percent': 50
    };
    Object.entries(DEFAULT_VALUES).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.value = value;
    });

    initializeChart();
    initializeDonateModal();
    initializeToggleButton();

    calculateBtn.addEventListener('click', performCalculation);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
    });

    updateLanguage();

  } catch (e) {
    console.error('Initialisierungsfehler:', e);
    resultsDiv.innerHTML = `<p style="color: #e53e3e;">${currentLanguage === 'de' ? 'Fehler: ' : 'Error: '}${e.message}</p>`;
  }
};

function performCalculation() {
  try {
    const inputs = {
      btcAmount: document.getElementById('btc-amount'),
      loanAmount: document.getElementById('amount'),
      duration: document.getElementById('duration'),
      interestRate: document.getElementById('interest-rate'),
      btcPrice: document.getElementById('btc-price'),
      priceGrowth: document.getElementById('price-growth'),
      cycleCount: document.getElementById('cycle-count'),
      btcBuyPercent: document.getElementById('btc-buy-percent')
    };

    const params = {
      btcAmount: parseFloat(inputs.btcAmount.value) || 0.1,
      loanAmount: parseFloat(inputs.loanAmount.value) || 5000,
      duration: parseFloat(inputs.duration.value) || 12,
      interestRate: parseFloat(inputs.interestRate.value) || 10,
      btcPrice: parseFloat(inputs.btcPrice.value) || 100000,
      priceGrowth: parseFloat(inputs.priceGrowth.value) || 50,
      cycleCount: parseInt(inputs.cycleCount.value) || 5,
      btcBuyPercent: parseFloat(inputs.btcBuyPercent.value) || 50
    };

    if (params.btcAmount <= 0 || params.loanAmount <= 0 ||
        params.btcPrice <= 0 || params.duration <= 0) {
      resultsDiv.innerHTML = `<p style="color: #e53e3e;">${currentLanguage === 'de' ? 'Bitte positive Werte eingeben' : 'Please enter positive values'}</p>`;
      cycleDetailsDiv.innerHTML = '';
      return;
    }

    const result = calculateLoan(params);

    if (result.error) {
      resultsDiv.innerHTML = `<p style="color: #e53e3e;">${result.error}</p>`;
      cycleDetailsDiv.innerHTML = '';
      return;
    }

    const locale = currentLanguage === 'de' ? 'de-DE' : 'en-US';
    const currencySymbol = currentCurrency === 'EUR' ? '€' : '$';

    resultsDiv.innerHTML = `
      <h3 style="color:#f7931a;">${currentLanguage === 'de' ? 'Ergebnisse:' : 'Results:'}</h3>
      <div style="margin-bottom:10px; background:#232936; border-left:3px solid #f7931a; border-radius:6px; padding:10px 15px;">
        ${currentLanguage === 'de' ? 'Finaler BTC-Bestand: ' : 'Final BTC Holdings: '}<b>${result.finalBtc.toFixed(4)}</b>
      </div>
      <div style="margin-bottom:10px; background:#232936; border-left:3px solid #f7931a; border-radius:6px; padding:10px 15px;">
        ${currentLanguage === 'de' ? 'Hinzugewonnene BTC: ' : 'Gained BTC: '}<b>${result.gainedBtc.toFixed(4)}</b>
      </div>
      <div style="margin-bottom:10px; background:#232936; border-left:3px solid #f7931a; border-radius:6px; padding:10px 15px;">
        ${currentLanguage === 'de' ? 'Finaler BTC-Wert: ' : 'Final BTC Value: '}<b>${result.finalBtcValue.toLocaleString(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${currencySymbol}</b>
      </div>
      <div style="margin-bottom:10px; background:#232936; border-left:3px solid #f7931a; border-radius:6px; padding:10px 15px;">
        ${currentLanguage === 'de' ? 'Finaler BTC-Preis: ' : 'Final BTC Price: '}<b>${result.finalBtcPrice.toLocaleString(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${currencySymbol}</b>
      </div>
    `;

    cycleDetailsDiv.innerHTML = `
      <h3 style="color:#f7931a;">${currentLanguage === 'de' ? 'Ihre Zyklus-Details:' : 'Your Cycle Details:'}</h3>
      ${result.cycleDetails.map(detail => `
        <div>
          <b>${currentLanguage === 'de' ? `Zyklus ${detail.cycle} (Jahr ${detail.year.toFixed(2)})` : `Cycle ${detail.cycle} (Year ${detail.year.toFixed(2)})`}</b><br>
          ${currentLanguage === 'de' ? 'Gekauft: ' : 'Purchased: '}${detail.btcBought.toFixed(4)} BTC (${detail.buyAmount.toLocaleString(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${currencySymbol})<br>
          ${
            detail.cycle > 0
              ? `${currentLanguage === 'de' ? 'Zu tilgender Betrag: ' : 'Amount to be repaid: '}${detail.previousDebt.toLocaleString(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${currencySymbol}<br>`
              : ''
          }
          ${
            detail.kaufpreisProBTC
              ? `<span>${currentLanguage === 'de' ? 'Kaufpreis pro BTC: ' : 'Purchase price per BTC: '}${detail.kaufpreisProBTC.toLocaleString(locale, {maximumFractionDigits: 2})} ${currencySymbol}</span><br>`
              : ''
          }
          ${currentLanguage === 'de' ? 'Lending-Gebühr (1,5%): ' : 'Lending Fee (1,5%): '}${detail.firefishFee.toLocaleString(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${currencySymbol} (${detail.firefishFeeBTC.toFixed(4)} BTC)<br>
          ${currentLanguage === 'de' ? 'Kredit: ' : 'Loan: '}${detail.totalLoan.toLocaleString(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${currencySymbol}<br>
          ${currentLanguage === 'de' ? 'min. zu beleihende BTC: ' : 'Min. BTC to be lent: '}${detail.collateralBtc.toFixed(4)} ${
            detail.cycle > 0 && detail.maxLoan < detail.desiredLoan
              ? currentLanguage === 'de'
                ? ` (reduziert auf verfügbare Menge für Parameter ${params.btcBuyPercent} % - es wären ${detail.collateralNeeded.toFixed(4)} BTC nötig)`
                : ` (reduced to available amount for parameter ${params.btcBuyPercent} % - ${detail.collateralNeeded.toFixed(4)} BTC would be required)`
              : ''
          }
        </div>
      `).join('<hr>')}
    `;

    updateChart(result.btcHistory);

  } catch (e) {
    resultsDiv.innerHTML = `<p style="color: #e53e3e;">${currentLanguage === 'de' ? 'Berechnungsfehler: ' : 'Calculation Error: '}${e.message}</p>`;
    cycleDetailsDiv.innerHTML = '';
  }
}

// Donate Modal Functions
const LIGHTNING_ADDRESS = "lno1zrxq8pjw7qjlm68mtp7e3yvxee4y5xrgjhhyf2fxhlphpckrvevh50u0qf94jc4eqawau0glf6dekp7krm6qtndxr09fmtxlj6ggc3h0cdcz6qsz044kq6us48apmjsrusa8cr5tal2twwv0uwtjlddjzmxdz6jattvsqvux2ltp8mjg3mdad974lgr2vm5x5qk67kg07cjqzcfcm68kpcc7hexy644tnv9t3nm6d2v2sa45cq2ddhqmqdxw80qxvmjzm3m2mj99dm07pf8tuw6hp6z0f29wdg6xvpda0066qqqs8xkg5q3f23x7pfl84zduet890c";
const BITCOIN_ADDRESS = "bc1pdep7wk379yjswhvwhk0m478q8r6shkv5uhjtxq7tdu85slvy7wswqsjmsyu6920";

function initializeDonateModal() {
    const donateBtn = document.getElementById('donate-btn');
    const modal = document.getElementById('donate-modal');
    const closeBtn = document.getElementById('close-modal');
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    if (donateBtn) {
        donateBtn.addEventListener('click', showDonateModal);
        // Prevent accidental focus or click on load
        donateBtn.blur();
    }
    if (closeBtn) closeBtn.addEventListener('click', hideDonateModal);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) hideDonateModal();
        });
        // Ensure modal is hidden on initialization
        modal.style.display = 'none';
        modal.classList.add('hidden');
    }
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    
    generateQRCodes();
}

function showDonateModal() {
    const modal = document.getElementById('donate-modal');
    if (modal) {
        console.log('showDonateModal called'); // Debugging
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

function hideDonateModal() {
    const modal = document.getElementById('donate-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
        document.body.style.overflow = 'auto';
    }
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
    });
    const activeContent = document.getElementById(`${tabName}-tab`);
    if (activeContent) activeContent.style.display = 'block';
}

function generateQRCodes() {
    const lightningCanvas = document.getElementById('lightning-qr');
    const bitcoinCanvas = document.getElementById('bitcoin-qr');
    const lightningAddressInput = document.getElementById('lightning-address');
    const bitcoinAddressInput = document.getElementById('bitcoin-address');
    
    if (lightningCanvas && window.QRCode) {
        QRCode.toCanvas(lightningCanvas, `lightning:${LIGHTNING_ADDRESS}`, {
            width: 200,
            margin: 1,
            color: { dark: '#000000', light: '#ffffff' }
        });
    }
    
    if (bitcoinCanvas && window.QRCode) {
        QRCode.toCanvas(bitcoinCanvas, `bitcoin:${BITCOIN_ADDRESS}`, {
            width: 200,
            margin: 1,
            color: { dark: '#000000', light: '#ffffff' }
        });
    }
    
    if (lightningAddressInput) lightningAddressInput.value = LIGHTNING_ADDRESS;
    if (bitcoinAddressInput) bitcoinAddressInput.value = BITCOIN_ADDRESS;
}

function copyToClipboard(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
        input.select();
        navigator.clipboard.writeText(input.value).then(() => {
            const copyBtn = input.nextElementSibling;
            if (copyBtn) {
                const originalText = copyBtn.textContent;
                copyBtn.textContent = currentLanguage === 'de' ? 'Kopiert!' : 'Copied!';
                copyBtn.style.background = '#48bb78';
                
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                    copyBtn.style.background = '#f7931a';
                }, 2000);
            }
        });
    }
}
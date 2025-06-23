// Konstanten
const FEE_RATE = 1.5;
const BLOCKCHAIN_FEE = 0;
const COLLATERAL_RATIO = 2;

// Berechnet die Firefish-Gebühr in BTC basierend auf der offiziellen Formel
function calculateFirefishFeeBTC(loanAmount, duration, btcPrice) {
  const durationInDays = (duration / 12) * 365; // Umrechnung von Monaten in Tage
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
        label: 'BTC-Bestand',
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
              return `Jahr ${context[0].label}`;
            },
            label: function(context) {
              const btc = context.parsed.y;
              return `BTC: ${btc.toFixed(4)}`;
            },
            afterLabel: function(context) {
              const dataIndex = context.dataIndex;
              const dataset = context.chart.data.datasets[0];
              if (dataset.priceData && dataset.priceData[dataIndex]) {
                return `Preis: ${dataset.priceData[dataIndex].toLocaleString('de-DE', {maximumFractionDigits: 0})} €`;
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
  const labels = btcHistory.map(entry => `Jahr ${entry.year.toFixed(2)}`);
  const data = btcHistory.map(entry => entry.btc);
  const priceData = btcHistory.map(entry => entry.btcPrice);
  priceChart.data.labels = labels;
  priceChart.data.datasets[0].data = data;
  priceChart.data.datasets[0].priceData = priceData;
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
        priceElement.innerHTML = `BTC Preis: <b>${priceUSD.toLocaleString('de-DE')} $</b> | <b>${priceEUR.toLocaleString('de-DE')} €</b>`;
      }
      // Optional: Das Eingabefeld für BTC-Preis automatisch befüllen (EUR)
      const btcPriceInput = document.getElementById('btc-price');
      if (btcPriceInput && !btcPriceInput.value) {
        btcPriceInput.value = priceEUR;
      }
    }
  } catch (error) {
    const priceElement = document.getElementById('current-btc-price');
    if (priceElement) {
      priceElement.innerHTML = 'BTC Preis: <b>–</b>';
    }
  }
}

// Loan-Berechnung mit korrigierter Firefish-Gebührenlogik
function calculateLoan(params) {
  const { btcAmount, loanAmount, duration, interestRate, btcPrice, priceGrowth, cycleCount, btcBuyPercent } = params;
  if (isNaN(btcAmount) || btcAmount <= 0) return { error: 'BTC-Bestand muss positiv sein.' };
  if (isNaN(loanAmount) || loanAmount <= 0) return { error: 'Kreditsumme muss positiv sein.' };
  if (isNaN(btcPrice) || btcPrice <= 0) return { error: 'BTC-Preis muss positiv sein.' };
  if (isNaN(duration) || duration <= 0) return { error: 'Laufzeit muss positiv sein.' };
  if (isNaN(interestRate) || interestRate < 0) return { error: 'Zinssatz darf nicht negativ sein.' };
  if (isNaN(cycleCount) || cycleCount < 1 || cycleCount > 10) return { error: 'Anzahl darauffolgender Kredite muss zwischen 1 und 10 liegen.' };
  if (isNaN(btcBuyPercent) || btcBuyPercent < 0 || btcBuyPercent > 50) return { error: 'Prozentsatz für BTC-Kauf muss zwischen 0 und 50 liegen.' };

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

    if (cycle === 0) {
      buyAmount = currentLoan;
      btcBought = parseFloat((buyAmount / currentBtcPrice).toFixed(4));
    } else {
      totalCost += previousDebt;
      const collateralValue = currentBtc * currentBtcPrice;
      const maxLoan = collateralValue / COLLATERAL_RATIO;
      let desiredLoan = btcBuyPercent === 0 ? previousDebt : previousDebt / (1 - btcBuyPercent / 100);
      let newLoan = Math.min(maxLoan, desiredLoan);
      buyAmount = newLoan - previousDebt;
      firefishFee = newLoan * (FEE_RATE / 100);
      firefishFeeBTC = calculateFirefishFeeBTC(newLoan, duration, currentBtcPrice);
      totalLoan = newLoan;
      collateralBtc = parseFloat(((totalLoan * COLLATERAL_RATIO) / currentBtcPrice).toFixed(4));
      if (buyAmount < 0) {
        return { error: `Nicht genug Kredit im Zyklus ${cycle} für Tilgung. Benötigt: ${previousDebt.toFixed(2)} EUR, verfügbar: ${newLoan.toFixed(2)} EUR` };
      }
      btcBought = parseFloat((buyAmount / currentBtcPrice).toFixed(4));
      currentLoan = newLoan;
    }

    if (collateralBtc > currentBtc || isNaN(collateralBtc)) {
      return { error: `Nicht genug BTC im Zyklus ${cycle}. Benötigt: ${collateralBtc.toFixed(4)} BTC, verfügbar: ${currentBtc.toFixed(4)} BTC` };
    }

    if (btcBought > 0 && buyAmount > 0) {
      kaufpreisProBTC = currentBtcPrice;
    }

    // KORRIGIERT: Firefish-Gebühr wird separat vom BTC-Bestand abgezogen
    // Die Tilgung bleibt unberührt
    currentBtc = parseFloat((currentBtc - collateralBtc + btcBought).toFixed(4));
    if (isNaN(currentBtc)) {
      return { error: `Ungültiger BTC-Bestand im Zyklus ${cycle} nach Kauf` };
    }
    
    // Firefish-Gebühr direkt vom BTC-Bestand abziehen (unabhängig von Tilgung)
    currentBtc = parseFloat((currentBtc - firefishFeeBTC).toFixed(4));
    if (isNaN(currentBtc) || currentBtc < 0) {
      return { error: `Nicht genug BTC für Firefish-Gebühr im Zyklus ${cycle}. Benötigt: ${firefishFeeBTC.toFixed(4)} BTC` };
    }
    
    currentBtc = parseFloat((currentBtc + collateralBtc).toFixed(4));
    if (isNaN(currentBtc)) {
      return { error: `Ungültiger BTC-Bestand im Zyklus ${cycle} nach Rückgabe` };
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
      kaufpreisProBTC
    });

    if (cycle < cycles - 1) {
      // WICHTIG: Die Firefish-Gebühr wird NICHT zur zu tilgenden Summe hinzugefügt
      const interest = currentLoan * (interestRate / 100) * (duration / 12);
      const cycleCost = currentLoan + interest; // Ohne Firefish-Gebühr!
      yearsElapsed += duration / 12;
      currentBtcPrice *= (1 + priceGrowth / 100 * (duration / 12));
      previousDebt = cycleCost;
    }
  }

  const finalInterest = currentLoan * (interestRate / 100) * (duration / 12);
  const finalCycleCost = currentLoan + finalInterest; // Ohne Firefish-Gebühr!
  totalCost += finalCycleCost;

  // Finaler BTC-Wert = Bestand × Preis
  const finalBtcValue = currentBtc * currentBtcPrice;
  const liquidationPrice = totalCost / (currentBtc * COLLATERAL_RATIO);
  const gainedBtc = parseFloat((currentBtc - btcAmount).toFixed(4));

  if (isNaN(finalBtcValue) || isNaN(gainedBtc)) {
    return { error: 'Ungültige Endergebnisse bei der Berechnung' };
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

window.onload = () => {
  try {
    form = document.getElementById('loanForm');
    calculateBtn = document.getElementById('calculate-btn');
    resultsDiv = document.getElementById('results');
    cycleDetailsDiv = document.getElementById('cycle-details');

    // BTC-Preis beim Laden holen und regelmäßig aktualisieren
    fetchBitcoinPrice();
    setInterval(fetchBitcoinPrice, 5 * 60 * 1000);

    // Default-Werte beim Laden setzen
    const DEFAULT_VALUES = {
      'btc-amount': 0.1,
      'amount': 5000,
      'btc-price': 100000,
      'duration': 12,
      'interest-rate': 10,
      'price-growth': 50,
      'cycle-count': 5,
      'btc-buy-percent': 50
    };
    Object.entries(DEFAULT_VALUES).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.value = value;
    });

    // Chart initialisieren
    initializeChart();

    // Event-Listener
    calculateBtn.addEventListener('click', performCalculation);
    form.addEventListener('submit', (e) => e.preventDefault());

  } catch (e) {
    console.error('Initialisierungsfehler:', e);
    resultsDiv.innerHTML = `<p>Fehler: ${e.message}</p>`;
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
      resultsDiv.innerHTML = `<p>Bitte positive Werte eingeben</p>`;
      return;
    }

    const result = calculateLoan(params);

    if (result.error) {
      resultsDiv.innerHTML = `<p>${result.error}</p>`;
      cycleDetailsDiv.innerHTML = '';
      return;
    }

    // Ergebnisse anzeigen
    resultsDiv.innerHTML = `
      <h3 style="color:#f7931a;">Ergebnisse:</h3>
      <div style="margin-bottom:10px; background:#232936; border-left:3px solid #f7931a; border-radius:6px; padding:10px 15px;">
        Finaler BTC-Bestand: <b>${result.finalBtc.toFixed(4)}</b>
      </div>
      <div style="margin-bottom:10px; background:#232936; border-left:3px solid #f7931a; border-radius:6px; padding:10px 15px;">
        Hinzugewonnene BTC: <b>${result.gainedBtc.toFixed(4)}</b>
      </div>
      <div style="margin-bottom:10px; background:#232936; border-left:3px solid #f7931a; border-radius:6px; padding:10px 15px;">
        Finaler BTC-Wert: <b>${result.finalBtcValue.toFixed(2)} EUR</b>
      </div>
      <div style="margin-bottom:10px; background:#232936; border-left:3px solid #f7931a; border-radius:6px; padding:10px 15px;">
        Finaler BTC-Preis: <b>${result.finalBtcPrice.toFixed(2)}</b>
      </div>
    `;

    // Zyklus-Details mit korrigierter Gebührenlogik
    cycleDetailsDiv.innerHTML = `
      <h3 style="color:#f7931a;">Zyklus-Details:</h3>
      ${result.cycleDetails.map(detail => `
        <div>
          <b>Zyklus ${detail.cycle} (Jahr ${detail.year.toFixed(2)})</b><br>
          Gekauft: ${detail.btcBought.toFixed(4)} BTC (${detail.buyAmount.toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})} €)<br>
          ${
            detail.cycle > 0
              ? `Zu tilgender Betrag: ${detail.previousDebt.toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})} €<br>`
              : ''
          }
          ${
            detail.kaufpreisProBTC
              ? `<span>Kaufpreis pro BTC: ${detail.kaufpreisProBTC.toLocaleString('de-DE', {maximumFractionDigits: 2})} €</span><br>`
              : ''
          }
          Lending-Gebühr: ${detail.firefishFee.toFixed(2)} EUR (${detail.firefishFeeBTC.toFixed(4)} BTC)<br>
          Kredit: ${detail.totalLoan.toFixed(2)} EUR<br>
          min. zu beleihende BTC: ${detail.collateralBtc.toFixed(4)} BTC
        </div>
      `).join('<hr>')}
    `;

    updateChart(result.btcHistory);

  } catch (e) {
    resultsDiv.innerHTML = `<p>Berechnungsfehler: ${e.message}</p>`;
  }
}

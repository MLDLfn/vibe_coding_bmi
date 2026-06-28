let currentGender = 'male';
let bmiChart = null;
let lastCalculatedBMI = null;

function selectGender(gender) {
  currentGender = gender;
  document.querySelectorAll('.gender-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.gender === gender);
  });
}

function onHeightChange(val) {
  document.getElementById('heightDisplay').textContent = val;
  document.getElementById('heightInput').value = val;
}

function onHeightInputChange(val) {
  val = Math.max(120, Math.min(220, parseInt(val) || 120));
  document.getElementById('heightDisplay').textContent = val;
  document.getElementById('heightSlider').value = val;
  document.getElementById('heightInput').value = val;
}

function onWeightChange(val) {
  document.getElementById('weightDisplay').textContent = val;
  document.getElementById('weightInput').value = val;
}

function onWeightInputChange(val) {
  val = Math.max(25, Math.min(200, parseInt(val) || 25));
  document.getElementById('weightDisplay').textContent = val;
  document.getElementById('weightSlider').value = val;
  document.getElementById('weightInput').value = val;
}

function onAgeChange(val) {
  document.getElementById('ageDisplay').textContent = val;
  document.getElementById('ageInput').value = val;
}

function onAgeInputChange(val) {
  val = Math.max(5, Math.min(120, parseInt(val) || 5));
  document.getElementById('ageDisplay').textContent = val;
  document.getElementById('ageSlider').value = val;
  document.getElementById('ageInput').value = val;
}

function getBmiInfo(bmi) {
  if (bmi < 18.5) {
    return { label: '體重過輕', color: '#f59e0b', comment: '建議增加營養攝取，保持均衡飲食' };
  } else if (bmi < 24) {
    return { label: '正常範圍', color: '#10b981', comment: '很棒！繼續保持健康的生活習慣' };
  } else if (bmi < 27) {
    return { label: '過重', color: '#f59e0b', comment: '建議適度控制飲食，增加運動量' };
  } else {
    return { label: '肥胖', color: '#ef4444', comment: '建議諮詢專業醫師，規劃健康減重' };
  }
}

function calculateBMI() {
  const height = parseFloat(document.getElementById('heightInput').value);
  const weight = parseFloat(document.getElementById('weightInput').value);
  const heightM = height / 100;
  const bmi = (weight / (heightM * heightM)).toFixed(1);
  const bmiFloat = parseFloat(bmi);
  const info = getBmiInfo(bmiFloat);
  lastCalculatedBMI = { bmi: bmiFloat, label: info.label, color: info.color };

  const resultDiv = document.getElementById('result');
  const resultBox = document.getElementById('resultBox');

  resultBox.innerHTML = `
    <div class="bmi-value" style="color: ${info.color}">${bmi}</div>
    <div class="bmi-label" style="color: ${info.color}">${info.label}</div>
    <div class="bmi-comment">${info.comment}</div>
  `;
  resultBox.style.background = `linear-gradient(135deg, ${info.color}20, ${info.color}10)`;
  resultBox.style.border = `2px solid ${info.color}40`;

  resultDiv.style.display = 'none';
  void resultDiv.offsetWidth;
  resultDiv.style.display = 'block';

  const marker = document.getElementById('gaugeMarker');
  const pos = Math.min(100, Math.max(0, ((bmiFloat - 10) / 45) * 100));
  setTimeout(() => { marker.style.left = pos + '%'; }, 300);
  marker.style.background = info.color;
  marker.style.borderColor = info.color;

  return lastCalculatedBMI;
}

async function saveRecord() {
    if (!window.currentUser) {
      alert('請先登入');
      return;
    }
  const height = parseFloat(document.getElementById('heightInput').value);
  const weight = parseFloat(document.getElementById('weightInput').value);
  const age = document.getElementById('ageInput').value;
  const note = document.getElementById('noteInput').value.trim();
  if (!lastCalculatedBMI) {
    alert('請先點擊「開始計算 BMI」');
    return;
  }

  try {
    await api('/api/records', {
      method: 'POST',
      body: {
        gender: currentGender,
        height,
        weight,
        age,
        bmi: lastCalculatedBMI.bmi,
        label: lastCalculatedBMI.label,
        color: lastCalculatedBMI.color,
        note: note || '無備註'
      }
    });
    document.getElementById('noteInput').value = '';
    await renderHistory();
  } catch (e) {
    alert('儲存失敗：' + e.message);
  }
}

async function deleteRecord(id) {
  if (!confirm('確定要刪除此筆紀錄嗎？')) return;
  try {
    await api(`/api/records/${id}`, { method: 'DELETE' });
    await renderHistory();
  } catch (e) {
    alert('刪除失敗：' + e.message);
  }
}

async function clearAllRecords() {
  if (!confirm('確定要清除所有歷史紀錄嗎？此操作無法還原。')) return;
  try {
    await api('/api/records', { method: 'DELETE' });
    await renderHistory();
  } catch (e) {
    alert('清除失敗：' + e.message);
  }
}

async function renderHistory() {
  if (!window.currentUser) return;
  try {
    const records = await api('/api/records');
    const historySection = document.getElementById('historySection');
    const historyList = document.getElementById('historyList');

    if (records.length === 0) {
      historySection.style.display = 'none';
      return;
    }

    historySection.style.display = 'block';
    historyList.innerHTML = records.map(r => `
      <div class="history-item">
        <div class="bmi-badge" style="background: ${r.color};">
          BMI<br>${r.bmi}
        </div>
        <div class="details">
          <div class="main">${r.label}</div>
          <div class="sub">${r.date} · ${r.gender === 'male' ? '男性' : '女性'} ${r.age}歲 · ${r.height}cm / ${r.weight}kg</div>
        </div>
        <div class="notes-text">${r.note}</div>
        <button class="delete-btn" onclick="deleteRecord(${r.id})" title="刪除此筆">✕</button>
      </div>
    `).join('');

    renderChart(records);
  } catch (e) {
    console.error('載入歷史紀錄失敗', e);
  }
}

function renderChart(records) {
  const ctx = document.getElementById('bmiChart').getContext('2d');
  const labels = records.slice().reverse().map((r, i) => '#' + (i + 1));
  const data = records.slice().reverse().map(r => r.bmi);
  const colors = records.slice().reverse().map(r => r.color);

  if (bmiChart) {
    bmiChart.data.labels = labels;
    bmiChart.data.datasets[0].data = data;
    bmiChart.data.datasets[0].backgroundColor = colors.map(c => c + '40');
    bmiChart.data.datasets[0].borderColor = colors;
    bmiChart.data.datasets[0].pointBackgroundColor = colors;
    bmiChart.data.datasets[1].data = Array(labels.length).fill(18.5);
    bmiChart.data.datasets[2].data = Array(labels.length).fill(24);
    bmiChart.update('active');
    return;
  }

  bmiChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'BMI 數值',
        data,
        borderWidth: 3,
        pointBackgroundColor: colors,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8,
        tension: 0.35,
        fill: true,
        backgroundColor: colors.map(c => c + '20')
      }, {
        label: '正常下限',
        data: Array(labels.length).fill(18.5),
        borderColor: '#64748b',
        borderWidth: 1,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false
      }, {
        label: '正常上限',
        data: Array(labels.length).fill(24),
        borderColor: '#64748b',
        borderWidth: 1,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(30, 41, 59, 0.95)',
          titleColor: '#f1f5f9',
          bodyColor: '#f1f5f9',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 10,
          callbacks: {
            label: function(ctx) {
              if (ctx.dataset.label !== 'BMI 數值') return null;
              const info = getBmiInfo(ctx.raw);
              return ' BMI: ' + ctx.raw + ' (' + info.label + ')';
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#94a3b8' }
        },
        y: {
          min: 15,
          max: 40,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#94a3b8' },
          title: { display: true, text: 'BMI', color: '#94a3b8' }
        }
      },
      interaction: { intersect: false, mode: 'index' }
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('gaugeMarker').style.left = '37%';
  if (window.currentUser) {
    await renderHistory();
  }
});

window.calculateBMI = calculateBMI;
window.saveRecord = saveRecord;
window.deleteRecord = deleteRecord;
window.clearAllRecords = clearAllRecords;
window.exportCSV = window.exportCSV;
window.importCSV = window.importCSV;
window.selectGender = selectGender;
window.renderHistory = renderHistory;
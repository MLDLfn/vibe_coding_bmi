(function() {
  const API_BASE = 'https://vibe-coding-bmi.onrender.com/';
  let authTab = 'login';
  let currentUser = null;

  async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function api(path, options = {}) {
    const sessionId = sessionStorage.getItem('bmi_session');
    const headers = { 'Content-Type': 'application/json', 'X-Session-Id': sessionId || '' };
    if (options.body) headers['Content-Type'] = 'application/json';
    const res = await fetch(API_BASE + path, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
      body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined
    });
    if (res.status === 401) {
      logout();
      throw new Error('未登入');
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '請求失敗');
    return data;
  }

  async function handleAuthAction() {
    const username = document.getElementById('usernameInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    document.getElementById('authError').style.display = 'none';
    document.getElementById('authSuccess').style.display = 'none';

    if (!username || !password) {
      showAuthError('請填寫使用者名稱與密碼');
      return;
    }
    if (username.length < 3) {
      showAuthError('使用者名稱至少需要 3 個字元');
      return;
    }
    if (password.length < 4) {
      showAuthError('密碼至少需要 4 個字元');
      return;
    }

    try {
      const hashedPassword = await sha256('BMI_SECRET_2026' + password);
      if (authTab === 'register') {
        const confirmUsername = document.getElementById('confirmUsernameInput').value.trim();
        const confirmPassword = document.getElementById('confirmPasswordInput').value;
        if (username !== confirmUsername) {
          showAuthError('使用者名稱不一致');
          return;
        }
        if (password !== confirmPassword) {
          showAuthError('密碼不一致');
          return;
        }
        const res = await api('/api/register', {
          method: 'POST',
          body: { username, password: hashedPassword }
        });
        console.log('Register response:', res);
        currentUser = res.user;
        sessionStorage.setItem('bmi_session', res.sessionId);
        showAuthSuccess('註冊成功！正在為您登入...');
        setTimeout(onLoginSuccess, 600);
      } else {
        const res = await api('/api/login', {
          method: 'POST',
          body: { username, password: hashedPassword }
        });
        currentUser = res.user;
        sessionStorage.setItem('bmi_session', res.sessionId);
        showAuthSuccess('登入成功！');
        setTimeout(onLoginSuccess, 300);
      }
    } catch (e) {
      showAuthError(e.message);
    }
  }

  function showAuthError(msg) {
    const el = document.getElementById('authError');
    el.textContent = '⚠️ ' + msg;
    el.style.display = 'block';
  }

  function showAuthSuccess(msg) {
    const el = document.getElementById('authSuccess');
    el.textContent = '✓ ' + msg;
    el.style.display = 'block';
  }

  function logout() {
    sessionStorage.removeItem('bmi_session');
    currentUser = null;
    document.getElementById('calculatorSection').style.display = 'none';
    document.getElementById('calcBtn').style.display = 'none';
    document.getElementById('result').style.display = 'none';
    document.getElementById('notesSection').style.display = 'none';
    document.getElementById('btnRow').style.display = 'none';
    document.getElementById('historySection').style.display = 'none';
    document.getElementById('userInfoBar').style.display = 'none';
    document.getElementById('authHeader').style.display = 'block';
    document.getElementById('authForm').style.display = 'block';
    switchAuthTab('login');
  }

  function toggleDropdown() {
    document.getElementById('dropdownMenu').classList.toggle('show');
  }

  document.addEventListener('click', function(e) {
    const dd = document.getElementById('dropdownMenu');
    const bar = document.getElementById('userInfoBar');
    if (!bar || !dd) return;
    if (!bar.contains(e.target)) dd.classList.remove('show');
  });

  function onLoginSuccess() {
    window.currentUser = currentUser;
    document.getElementById('authHeader').style.display = 'none';
    document.getElementById('authForm').style.display = 'none';
    document.getElementById('userInfoBar').style.display = 'flex';
    document.getElementById('welcomeUser').textContent = currentUser.username;

    document.getElementById('calculatorSection').style.display = 'block';
    document.getElementById('calcBtn').style.display = 'block';
    document.getElementById('notesSection').style.display = 'block';
    document.getElementById('btnRow').style.display = 'flex';
    if (typeof renderHistory === 'function') {
      renderHistory();
    }
  }

  window.switchAuthTab = function(tab) {
    authTab = tab;
    document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
    document.getElementById('tabRegister').classList.toggle('active', tab === 'register');
    document.getElementById('confirmUsernameGroup').style.display = tab === 'register' ? 'block' : 'none';
    document.getElementById('confirmPasswordGroup').style.display = tab === 'register' ? 'block' : 'none';
    document.getElementById('authBtn').textContent = tab === 'login' ? '登入' : '註冊';
    document.getElementById('authTitle').textContent = tab === 'login' ? 'BMI 健康計算機' : '建立新帳號';
    document.getElementById('authSubtitle').textContent = tab === 'login' ? '請登入以開始追蹤你的健康' : '註冊以便儲存專屬的健康紀錄';
    document.getElementById('authFooter').textContent = tab === 'login' ? '還沒有帳號？' : '已有帳號？';
    document.getElementById('authToggleLink').textContent = tab === 'login' ? '立即註冊' : '立即登入';
    document.getElementById('authToggleLink').setAttribute('onclick', `switchAuthTab('${tab === 'login' ? 'register' : 'login'}')`);
    document.getElementById('authError').style.display = 'none';
    document.getElementById('authSuccess').style.display = 'none';
    document.getElementById('usernameInput').value = '';
    document.getElementById('confirmUsernameInput').value = '';
    document.getElementById('passwordInput').value = '';
    document.getElementById('confirmPasswordInput').value = '';
  };

  window.toggleDropdown = toggleDropdown;
  window.logout = async function() {
    try { await api('/api/logout', { method: 'POST' }); } catch (e) {}
    logout();
  };

  window.deleteAccount = async function() {
    const confirmInput = window.prompt('⚠️ 刪除帳號將清除所有資料。\n請輸入你的使用者名稱以確認：' + currentUser.username);
    if (confirmInput !== currentUser.username) {
      alert('輸入的使用者名稱不正確。');
      return;
    }
    if (!confirm('確定要永久刪除此帳號與所有資料嗎？此操作不可還原。')) return;
    try {
      await api('/api/user', { method: 'DELETE' });
      logout();
    } catch (e) {
      alert('刪除失敗：' + e.message);
    }
  };

  window.exportCSV = async function() {
    try {
      const res = await fetch(API_BASE + '/api/csv/export', {
        headers: { 'X-Session-Id': sessionStorage.getItem('bmi_session') || '' }
      });
      if (res.status === 400) {
        alert('目前沒有紀錄可以匯出');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BMI_${currentUser.username}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('匯出失敗：' + e.message);
    }
  };

  window.importCSV = async function(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileName').classList.add('show');
    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        await api('/api/csv/import', {
          method: 'POST',
          body: { csvText: e.target.result }
        });
        alert('成功匯入');
        await renderHistory();
      } catch (err) {
        alert('匯入失敗：' + err.message);
      }
      input.value = '';
      document.getElementById('fileName').classList.remove('show');
    };
    reader.readAsText(file);
  };

  window.api = api;
  window.handleAuthAction = handleAuthAction;
  window.switchAuthTab = switchAuthTab;
  window.toggleDropdown = toggleDropdown;

  document.addEventListener('DOMContentLoaded', async () => {
    const sessionId = sessionStorage.getItem('bmi_session');
    if (!sessionId) return;
    try {
      const me = await api('/api/me');
      currentUser = me;
      document.getElementById('usernameInput').value = currentUser.username;
      onLoginSuccess();
    } catch (e) {
      sessionStorage.removeItem('bmi_session');
    }
    document.getElementById('gaugeMarker').style.left = '37%';
  });
})();

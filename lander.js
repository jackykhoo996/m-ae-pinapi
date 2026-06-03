// 初始化 Supabase 秘钥串
const SUPABASE_URL = "https://krcbbiitqkmlcoryedes.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtyY2JiaWl0qWttbGNvcnllZGVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NzUxMDgsImV4cCI6MjA5NTQ1MTEwOH0.il63duhVsujomyvWWcsOK_Jjbn9k5lkbBH0Ev4Dm5s4";

let supabaseClient;
if (typeof supabase === 'object') {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

let currentTxid = '';
const urlParams = new URLSearchParams(window.location.search);
const clickId = urlParams.get('cid') || 'AE_JS_' + Math.floor(Math.random() * 100000);

// ── 智能清洗核心引擎 ──
function cleanAeMsisdn(rawInput) {
  // 1. 去除所有空格、横杠、括号以及可能被误复制的特殊字符
  let cleaned = rawInput.replace(/[\s\-\(\)\+\+]/g, '');

  // 2. 依次剥离用户重复输入的各种国家前缀组合
  if (cleaned.startsWith('00971')) {
    cleaned = cleaned.slice(5); // 剥离 00971
  } else if (cleaned.startsWith('971')) {
    cleaned = cleaned.slice(3); // 剥离 971
  }

  // 3. 剥离阿联酋本地拨号习惯的前导 0 (例如用户输入 0504608976 -> 变 504608976)
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.slice(1);
  }

  // 4. 此时留下的应当是纯粹的 5XXXXXXXX 基础号码（阿联酋手机号去掉前缀后一般为 9 位数）
  // 最终强行在前端组装成给 CP 接口和数据库最规范的 9715XXXXXXXX 格式
  return '971' + cleaned;
}

// ── 按钮点击：发送手机号请求 OTP ──
async function sendOtp() {
  const msisdnInput = document.getElementById('inp-msisdn');
  if (!msisdnInput) return;
  
  const rawValue = msisdnInput.value.trim();
  if (!rawValue) {
    alert('يرجى إدخال رقم هاتف متحرك صحيح لشركة اتصالات');
    return;
  }

  // 💥 触发智能清洗引擎
  const fullMsisdn = cleanAeMsisdn(rawValue);

  // 阿联酋标准规范号码段格式应为 9715XXXXXXXX (总共 12 位数)
  if (fullMsisdn.length < 12 || !fullMsisdn.startsWith('9715')) {
    alert('يرجى إدخال رقم هاتف متحرك صحيح لشركة اتصالات (مثال: 50XXXXXXX)');
    return;
  }

  try {
    const res = await fetch(`/api/request?msisdn=${fullMsisdn}&click_id=${clickId}`);
    const data = await res.json();

    if (data.stateCode === 0) {
      currentTxid = data.txid;
      document.getElementById('step-1').style.display = 'none';
      document.getElementById('step-2').style.display = 'block';
    } else {
      alert('فشل إرسال الرمز، يرجى المحاولة مرة أخرى');
    }
  } catch (err) {
    alert('خطأ في الشبكة، يرجى إعادة المحاولة');
  }
}

// ── 按钮点击：提交 PIN 码验证 ──
async function submitPin() {
  const pinInput = document.getElementById('inp-pin');
  if (!pinInput) return;

  const pin = pinInput.value.trim();
  if (!pin) {
    alert('يرجى إدخال رمز PIN المكون من 4 أرقام');
    return;
  }

  try {
    const res = await fetch(`/api/verify?txid=${currentTxid}&pin=${pin}`);
    const data = await res.json();

    if (data.stateCode === 0) {
      alert('تم تأكيد اشتراكك بنجاح!');
      window.location.href = "https://www.etisalat.ae/";
    } else {
      alert('رمز PIN غير صحيح، يرجى المحاولة مرة أخرى');
    }
  } catch (err) {
    alert('خطأ في الشبكة، يرجى إعادة المحاولة');
  }
}

// 看板管理路由
function router() {
  if (window.location.hash === '#dashboard') {
    const landingView = document.getElementById('landing-view');
    const dbView = document.getElementById('dashboard-view');
    if (landingView) landingView.style.display = 'none';
    if (dbView) dbView.style.display = 'block';
    
    fetchLogs();
  }
}

async function fetchLogs() {
  if (!supabaseClient) return;
  const { data } = await supabaseClient.from('conversions').select('*').order('created_at', { ascending: false });
  if (data) renderDashboard(data);
}

function renderDashboard(logs) {
  const tbody = document.getElementById('tbody-logs');
  if (!tbody) return;
  
  document.getElementById('s-pin-requests').textContent = logs.length;
  document.getElementById('s-unique-msisdn').textContent = new Set(logs.map(r => r.msisdn)).size;
  document.getElementById('s-otp-sent').textContent = logs.filter(r => r.txid).length;
  document.getElementById('s-pin-attempts').textContent = logs.filter(r => r.status !== 'pending').length;
  document.getElementById('s-pin-verified').textContent = logs.filter(r => r.status === 'verified').length;

  tbody.innerHTML = logs.map(r => `
    <tr>
      <td>${new Date(r.created_at).toLocaleString()}</td>
      <td>Etisalat</td>
      <td>${r.msisdn}</td>
      <td>${r.click_id || '-'}</td>
      <td>${r.txid || '-'}</td>
      <td>${r.status}</td>
      <td>${r.cp_response || '-'}</td>
    </tr>
  `).join('');
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', () => {
  router();
  const btn1 = document.querySelector('#step-1 button');
  if (btn1) btn1.addEventListener('click', sendOtp);
  const btn2 = document.querySelector('#step-2 button');
  if (btn2) btn2.addEventListener('click', submitPin);
});
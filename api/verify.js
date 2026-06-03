import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. 抓取前端传过来的验证参数
  const { txid, pin, token } = req.query;

  // 💥 打印到 Vercel Messages：记录前端提交的验证码
  console.log(`[PIN VERIFY] 🔐 收到验码请求 -> txid: ${txid} | 用户填写的 PIN: ${pin}`);

  if (!txid || !pin) {
    console.error(`[PIN VERIFY] ❌ 失败: 缺少 txid 或 pin 参数`);
    return res.status(200).json({ stateCode: 1, msg: "missing params" });
  }

  try {
    // 2. 严格按照 PDF 第二页的规范拼装 CP 验证的 GET 请求
    // URL: https://m.vasvas.click/c/pin/verify
    const cpTargetUrl = `https://m.vasvas.click/c/pin/verify?txid=${txid}&pin=${pin}&token=${token || ''}`;

    console.log(`[PIN VERIFY] 📡 正在向 CP 验证接口发送 GET 请求...`);

    const cpResponse = await fetch(cpTargetUrl, { method: 'GET' });
    const cpResult = await cpResponse.json();

    // 💥 打印到 Vercel Messages：把 CP 返回的真实错误或成功原原本本揪出来！
    console.log(`[PIN VERIFY] 📥 CP 验证接口原始回包 -> ${JSON.stringify(cpResult)}`);

    // 3. 根据 PDF 规范的三种状态码进行完美对齐
    if (cpResult && cpResult.stateCode === 0) {
      // 🟢 状态 0：完全扣费订阅成功！
      console.log(`[PIN VERIFY] 💰 [SUCCESS] 扣费转化大成功！`);

      // 更新 Supabase 数据库状态为 verified
      await supabase.from('conversions').update({ 
        status: 'verified', 
        cp_response: JSON.stringify(cpResult) 
      }).eq('txid', txid);

      return res.status(200).json({ stateCode: 0, msg: null });

    } else if (cpResult && cpResult.stateCode === 2) {
      // 🟡 状态 2：PDF 第3页写明：Subscription is in progress (处理中，需等待回调)
      console.log(`[PIN VERIFY] ⏳ [PROCESSING] 运营商正在处理中，等待上游 Callback 或异步轮询...`);

      await supabase.from('conversions').update({ 
        status: 'processing', 
        cp_response: JSON.stringify(cpResult) 
      }).eq('txid', txid);

      return res.status(200).json({ stateCode: 2, msg: null });

    } else {
      // 🔴 状态 1：PIN 码错误或者超时失败
      console.error(`[PIN VERIFY] ❌ [FAILED] CP 验证拒绝，PIN 码不正确！`);

      await supabase.from('conversions').update({ 
        status: 'failed', 
        cp_response: JSON.stringify(cpResult) 
      }).eq('txid', txid);

      return res.status(200).json({ stateCode: 1, msg: cpResult.msg || "error" });
    }

  } catch (err) {
    console.error(`[PIN VERIFY] 💥 Serverless 验码核心函数发生非预期崩溃: ${err.message}`);
    return res.status(200).json({ stateCode: 1, msg: err.message });
  }
}
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { txid, pin, token } = req.query;

  console.log(`[PIN VERIFY] 🔐 收到验码请求 -> txid: ${txid} | 用户填写的 PIN: ${pin}`);

  if (!txid || !pin) {
    return res.status(200).json({ stateCode: 1, msg: "missing params" });
  }

  try {
    const safeToken = token || '51bd5411badf480c8c1e3a5b8d3d653b';

    // 🔥 彻底替换为真实的验证接口域名：m.bolo2vas102.click
    const cpTargetUrl = `https://m.bolo2vas102.click/c/pin/verify?txid=${txid}&pin=${pin}&token=${safeToken}`;

    console.log(`[PIN VERIFY] 📡 正在向 CP 真实验证接口发送 GET 请求...`);

    const cpResponse = await fetch(cpTargetUrl, { method: 'GET' });
    const cpResult = await cpResponse.json();

    console.log(`[PIN VERIFY] 📥 CP 验证接口原始回包 -> ${JSON.stringify(cpResult)}`);

    if (cpResult && cpResult.stateCode === 0) {
      console.log(`[PIN VERIFY] 💰 [SUCCESS] 扣费转化大成功！`);
      await supabase.from('conversions').update({ status: 'verified', cp_response: JSON.stringify(cpResult) }).eq('txid', txid);
      return res.status(200).json({ stateCode: 0, msg: null });
    } else if (cpResult && cpResult.stateCode === 2) {
      console.log(`[PIN VERIFY] ⏳ [PROCESSING] 异步处理中...`);
      await supabase.from('conversions').update({ status: 'processing', cp_response: JSON.stringify(cpResult) }).eq('txid', txid);
      return res.status(200).json({ stateCode: 2, msg: null });
    } else {
      console.error(`[PIN VERIFY] ❌ [FAILED] CP 验证拒绝，PIN 码错误！`);
      await supabase.from('conversions').update({ status: 'failed', cp_response: JSON.stringify(cpResult) }).eq('txid', txid);
      return res.status(200).json({ stateCode: 1, msg: cpResult.msg || "error" });
    }

  } catch (err) {
    console.error(`[PIN VERIFY] 💥 Serverless 验码核心崩溃: ${err.message}`);
    return res.status(200).json({ stateCode: 1, msg: err.message });
  }
}
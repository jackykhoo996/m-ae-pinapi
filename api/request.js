import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { msisdn, click_id, offer_id, aff_id, token } = req.query;

  console.log(`[PIN REQUEST] 🚀 收到发码请求 -> 手机号: ${msisdn} | ClickID: ${click_id || '无'}`);

  if (!msisdn) {
    return res.status(200).json({ stateCode: 1, msg: "missing msisdn" });
  }

  try {
    // 严格过滤非数字，并用你给的真 Offer ID (297170) 和 Aff ID (4033) 稳固兜底
    const safeOfferId = (offer_id || '').replace(/\D/g, '') || '297170'; 
    const safeAffId = (aff_id || '').replace(/\D/g, '') || '4033';
    
    // 💥 锁死真 Token：优先用传参的，没传就用你的真 Token 51bd5411badf480c8c1e3a5b8d3d653b
    const safeToken = token || '51bd5411badf480c8c1e3a5b8d3d653b';

    // 🔥 彻底替换为真实的接口域名：m.bolo2vas102.click
    const cpTargetUrl = `https://m.bolo2vas102.click/c/pin/${safeOfferId}/${safeAffId}?msisdn=${msisdn}&cid=${click_id || ''}&token=${safeToken}`;
    
    console.log(`[PIN REQUEST] 📡 正在向 CP 真实接口发起 GET 请求 -> ${cpTargetUrl}`);

    const cpResponse = await fetch(cpTargetUrl, { method: 'GET' });
    const cpResult = await cpResponse.json();

    console.log(`[PIN REQUEST] 📥 CP 真实回包内容 -> ${JSON.stringify(cpResult)}`);

    if (cpResult && cpResult.stateCode === 0) {
      const txid = cpResult.txid;
      console.log(`[PIN REQUEST] ✅ 发码成功！txid: ${txid}`);

      await supabase.from('conversions').insert([{
        msisdn: msisdn,
        click_id: click_id || null,
        txid: txid,
        status: 'pending',
        cp_response: JSON.stringify(cpResult)
      }]);

      return res.status(200).json({ stateCode: 0, txid: txid, msg: null });
    } else {
      console.error(`[PIN REQUEST] ❌ CP 发码明确拒绝！原因: ${cpResult.msg || '未知错误'}`);
      return res.status(200).json({ stateCode: 1, msg: cpResult.msg || "error" });
    }

  } catch (err) {
    console.error(`[PIN REQUEST] 💥 Serverless 核心崩溃: ${err.message}`);
    return res.status(200).json({ stateCode: 1, msg: err.message });
  }
}
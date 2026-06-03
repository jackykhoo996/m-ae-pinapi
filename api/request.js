import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. 抓取参数
  const { msisdn, click_id, offer_id, aff_id, token } = req.query;

  console.log(`[PIN REQUEST] 🚀 收到发码请求 -> 手机号: ${msisdn} | ClickID: ${click_id || '无'}`);

  if (!msisdn) {
    return res.status(200).json({ stateCode: 1, msg: "missing msisdn" });
  }

  try {
    // 💥 黄金锁死修复：
    // 优先读取前端传过来的数字（并过滤掉非数字杂质）。
    // 如果前端完全没有传参，雷打不动地使用你的真数字资产：Offer ID = 297170，Aff ID = 4033 做兜底！
    const safeOfferId = (offer_id || '').replace(/\D/g, '') || '297170'; 
    const safeAffId = (aff_id || '').replace(/\D/g, '') || '4033';

    // 严格按照纯数字路径拼装 URL
    const cpTargetUrl = `https://m.vasvas.click/c/pin/${safeOfferId}/${safeAffId}?msisdn=${msisdn}&cid=${click_id || ''}&token=${token || ''}`;
    
    console.log(`[PIN REQUEST] 📡 正在向 CP 发起 GET 请求 -> ${cpTargetUrl}`);

    const cpResponse = await fetch(cpTargetUrl, { method: 'GET' });
    const cpResult = await cpResponse.json();

    console.log(`[PIN REQUEST] 📥 CP 原始回包内容 -> ${JSON.stringify(cpResult)}`);

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
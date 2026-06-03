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
    const safeOfferId = (offer_id || '').replace(/\D/g, '') || '297170'; 
    const safeAffId = (aff_id || '').replace(/\D/g, '') || '4033';
    const safeToken = token || '51bd5411badf480c8c1e3a5b8d3d653b';

    const cpTargetUrl = `https://m.bolo2vas102.click/c/pin/${safeOfferId}/${safeAffId}?msisdn=${msisdn}&cid=${click_id || ''}&token=${safeToken}`;
    
    console.log(`[PIN REQUEST] 📡 正在向 CP 发起 GET 请求 -> ${cpTargetUrl}`);

    const cpResponse = await fetch(cpTargetUrl, { method: 'GET' });
    const cpResult = await cpResponse.json();

    console.log(`[PIN REQUEST] 📥 CP 真实回包内容 -> ${JSON.stringify(cpResult)}`);

    if (cpResult && cpResult.stateCode === 0) {
      const txid = cpResult.txid;
      console.log(`[PIN REQUEST] ✅ CP发码大成功！准备开始插入 Supabase...`);

      // 💥 重点：我们在这里用 data, error 极其精准地捕获这次写入的所有动静
      const { data: dbData, error: dbError } = await supabase.from('conversions').insert([{
        msisdn: msisdn,
        click_id: click_id || null,
        txid: txid,
        status: 'pending',
        cp_response: JSON.stringify(cpResult)
      }]).select(); // 加 .select() 可以强行让数据库返回插入成功的快照数据

      // 💥 终极显性检测打印：
      if (dbError) {
        // 如果数据库拒收，它必须在 Vercel 打印出具体的死因！
        console.error(`[🚨 DATABASE ERROR] ❌ Supabase 明确拒绝写入！死因详情 ->`, JSON.stringify(dbError));
      } else {
        // 如果写入成功，打印成功回执
        console.log(`[🎉 DATABASE SUCCESS]  数据已成功写入 Supabase，回执快照 ->`, JSON.stringify(dbData));
      }

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
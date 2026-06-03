import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase 客户端（自动从 Vercel 环境变量中读取）
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  // 💥 允许跨域请求
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. 抓取前端传过来的参数
  const { msisdn, click_id, offer_id, aff_id, token } = req.query;

  // 💥 打印到 Vercel Messages：记录前端进来的请求
  console.log(`[PIN REQUEST] 🚀 收到发码请求 -> 手机号: ${msisdn} | ClickID: ${click_id || '无'}`);

  if (!msisdn) {
    console.error(`[PIN REQUEST] ❌ 失败: 前端未传入 msisdn`);
    return res.status(200).json({ stateCode: 1, msg: "missing msisdn" });
  }

  try {
    // 2. 严格按照 PDF 第一页的规范拼装 CP 的 GET 请求
    // URL: https://m.vasvas.click/c/pin/offer_id/aff_id
    const cpTargetUrl = `https://m.vasvas.click/c/pin/${offer_id || 'default_offer'}/${aff_id || 'default_aff'}?msisdn=${msisdn}&cid=${click_id || ''}&token=${token || ''}`;
    
    console.log(`[PIN REQUEST] 📡 正在向 CP 发起 GET 请求 -> ${cpTargetUrl}`);

    const cpResponse = await fetch(cpTargetUrl, { method: 'GET' });
    const cpResult = await cpResponse.json();

    // 💥 打印到 Vercel Messages：原原本本展现 CP 接口返回给我们的所有内容！
    console.log(`[PIN REQUEST] 📥 CP 原始回包内容 -> ${JSON.stringify(cpResult)}`);

    // 3. 解析 PDF 规范中的 stateCode
    if (cpResult && cpResult.stateCode === 0) {
      const txid = cpResult.txid;
      console.log(`[PIN REQUEST] ✅ 发码成功！CP 返回 txid: ${txid}`);

      // 4. 将成功数据永久写入你的 Supabase 数据库入账
      const { error: dbError } = await supabase.from('conversions').insert([{
        msisdn: msisdn,
        click_id: click_id || null,
        txid: txid,
        status: 'pending',
        cp_response: JSON.stringify(cpResult)
      }]);

      if (dbError) {
        console.error(`[PIN REQUEST] ⚠️ Supabase 写入失败: ${dbError.message}`);
      } else {
        console.log(`[PIN REQUEST] 💾 数据已成功同步存入 Supabase`);
      }

      // 回传前端
      return res.status(200).json({ stateCode: 0, txid: txid, msg: null });

    } else {
      // stateCode === 1 代表报错
      console.error(`[PIN REQUEST] ❌ CP 发码明确拒绝！错误原因 (msg): ${cpResult.msg || '未知错误'}`);
      return res.status(200).json({ stateCode: 1, msg: cpResult.msg || "error" });
    }

  } catch (err) {
    // 兜底系统崩溃
    console.error(`[PIN REQUEST] 💥 Serverless 核心函数发生非预期崩溃: ${err.message}`);
    return res.status(200).json({ stateCode: 1, msg: err.message });
  }
}
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const TOKEN = "51bd5411badf480c8c1e3a5b8d3d653b";

export default async function handler(req, res) {
  // 允许跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { msisdn, click_id } = req.query;
  if (!msisdn) return res.status(400).json({ error: 'Missing msisdn' });

  try {
    // 1. 请求 CP 的 PIN REQUEST [cite: 3, 5]
    const cpUrl = `https://m.bolo2vas102.click/c/pin/297170/4033?msisdn=${msisdn}&token=${TOKEN}`;
    const cpRes = await fetch(cpUrl);
    const cpData = await cpRes.json();

    let status = 'failed';
    let txid = cpData.txid || null;

    if (cpData.stateCode === 0) {
      status = 'pending'; // 短信发送成功，等待验证 [cite: 15]
    }

    // 2. 写入 Supabase 数据库
    await supabase.from('conversions').insert([{
      msisdn,
      click_id,
      txid,
      carrier: 'Etisalat',
      status,
      cp_response: JSON.stringify(cpData)
    }]);

    return res.status(200).json(cpData);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
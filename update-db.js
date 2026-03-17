import axios from 'axios';
import csv from 'csvtojson';
import dotenv from 'dotenv';

dotenv.config();

const ADMIN_KEY = process.env.ADMIN_SECRET_KEY || "";
const API_URL = "https://ai-smart-reply.netlify.app/api/import-vocab";

async function sync() {
  try {
    console.log("Reading 'Vocabulary Library.csv'...");
    const jsonArray = await csv().fromFile('Vocabulary Library.csv');
    
    console.log(`Found ${jsonArray.length} items. Sending to backend...`);
    
    const res = await axios.post(API_URL, { data: jsonArray }, {
      headers: { 'x-admin-key': ADMIN_KEY }
    });
    
    console.log("✅ Sync successful:", res.data.message);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error("❌ Fail: 'Vocabulary Library.csv' not found in current directory.");
    } else {
      console.error("❌ Fail:", err.response?.data || err.message);
    }
  }
}

sync();

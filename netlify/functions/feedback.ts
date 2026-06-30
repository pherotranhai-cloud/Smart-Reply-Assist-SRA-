import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  
  try {
    const { content, lang } = JSON.parse(event.body || '{}');
    console.log('Received feedback:', { content, lang });

    if (supabaseUrl && supabaseServiceRoleKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
      
      const { error } = await supabase
        .from('user_feedbacks')
        .insert([{ content, interface_lang: lang, created_at: new Date().toISOString() }]);
        
      if (error) {
        console.error('Supabase error:', error);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to save feedback to database' })
        };
      }
    } else {
      console.warn('Supabase credentials not configured. Logging feedback only.');
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Feedback received successfully!' })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process feedback' })
    };
  }
};

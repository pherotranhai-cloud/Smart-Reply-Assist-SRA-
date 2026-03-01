// background.js for Chrome Extension
let windowId = null;

chrome.runtime.onInstalled.addListener(() => {
  console.log('Smart Reply Assist installed.');
});

// Handle extension icon click
// Removed duplicate listener

// Reset windowId if the window is closed manually
chrome.windows.onRemoved.addListener((id) => {
  if (id === windowId) {
    windowId = null;
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'LIST_MODELS') {
    handleListModels(request.settings).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (request.type === 'GENERATE') {
    handleGenerate(request.settings, request.params).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (request.type === 'RESET_SESSION') {
    // Clear any in-memory caches if they existed
    // For now, we just acknowledge the reset
    sendResponse({ ok: true });
    return true;
  }
  if (request.type === 'OPEN_WINDOW') {
    openAppWindow().then(() => sendResponse({ ok: true }));
    return true;
  }
  return true;
});

async function openAppWindow() {
  const width = 1100;
  const height = 800;

  if (windowId !== null) {
    try {
      await chrome.windows.update(windowId, { focused: true });
      return;
    } catch (e) {
      windowId = null;
    }
  }

  const displays = await chrome.system.display.getInfo();
  const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];
  
  const left = Math.round(primaryDisplay.workArea.left + (primaryDisplay.workArea.width - width) / 2);
  const top = Math.round(primaryDisplay.workArea.top + (primaryDisplay.workArea.height - height) / 2);

  const window = await chrome.windows.create({
    url: "index.html",
    type: "popup",
    width: width,
    height: height,
    left: left,
    top: top
  });

  windowId = window.id;
}

// Handle extension icon click
chrome.action.onClicked.addListener(openAppWindow);

function normalizeGeminiModelName(input) {
  if (!input) return '';
  const trimmed = input.trim();
  if (trimmed.startsWith('models/')) {
    return trimmed;
  }
  if (trimmed.toLowerCase().startsWith('gemini-')) {
    return `models/${trimmed}`;
  }
  return '';
}

async function handleListModels(settings) {
  if (settings.activeProvider === 'openai') {
    const s = settings.openai;
    const url = s.baseUrl.endsWith('/') ? `${s.baseUrl}models` : `${s.baseUrl}/models`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${s.apiKey}` }
    });
    if (!response.ok) throw new Error('Failed to list OpenAI models');
    const data = await response.json();
    return { models: data.data.map(m => ({ id: m.id, name: m.id })) };
  } else {
    const s = settings.gemini;
    const url = `${s.baseUrl}/v1beta/models`;
    const response = await fetch(url, {
      headers: { 'x-goog-api-key': s.apiKey }
    });
    if (!response.ok) throw new Error('Failed to list Gemini models');
    const data = await response.json();
    return { 
      models: (data.models || [])
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => {
          return { id: m.name, name: m.displayName || m.name };
        })
    };
  }
}

async function handleGenerate(settings, params) {
  if (settings.activeProvider === 'openai') {
    const s = settings.openai;
    const url = s.baseUrl.endsWith('/') ? `${s.baseUrl}chat/completions` : `${s.baseUrl}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${s.apiKey}`,
      },
      body: JSON.stringify({
        model: s.model,
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens,
        response_format: params.responseMimeType === 'application/json' ? { type: 'json_object' } : undefined,
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.error?.message || error.message || `HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return { text: data.choices[0].message.content.trim() };
  } else {
    const s = settings.gemini;
    let modelName = s.model;

    // Lazy load if missing
    if (!modelName) {
      const listRes = await handleListModels(settings);
      if (listRes.models && listRes.models.length > 0) {
        modelName = listRes.models[0].id;
      }
    }

    const normalized = normalizeGeminiModelName(modelName);
    if (!normalized) {
      throw new Error("Gemini model not set. Click Refresh Models and select one, or enter a raw model id.");
    }

    const url = `${s.baseUrl}/v1beta/${normalized}:generateContent`;
    
    const contents = params.messages
      .filter(m => m.role !== 'system')
      .map(m => {
        const parts = Array.isArray(m.content) 
          ? m.content.map(p => {
              if (p.type === 'text') return { text: p.text };
              if (p.type === 'image_url') {
                const base64Data = p.image_url.url.split(',')[1];
                return { inlineData: { mimeType: 'image/png', data: base64Data } };
              }
              return { text: '' };
            })
          : [{ text: m.content }];
        return { role: m.role === 'user' ? 'user' : 'model', parts };
      });

    const systemPrompt = params.messages.find(m => m.role === 'system')?.content;
    const body = {
      contents,
      generationConfig: {
        temperature: params.temperature ?? 0.7,
        maxOutputTokens: params.maxTokens,
        responseMimeType: params.responseMimeType,
      }
    };
    if (systemPrompt) {
      body.system_instruction = { parts: [{ text: systemPrompt }] };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': s.apiKey,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      const msg = error.error?.message || error.message || `HTTP error! status: ${response.status}`;
      throw new Error(msg);
    }
    const data = await response.json();
    if (!data.candidates || data.candidates.length === 0) throw new Error('No candidates returned');
    return { text: data.candidates[0].content.parts[0].text };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, model, max_tokens } = req.body;

    const requestBody = {
      model,
      max_tokens: max_tokens || 1500,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    };

    let currentMessages = [...messages];
    let finalResponse = null;

    const callAPI = async (msgs) => {
      // Retry up to 2 times on 429
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'web-search-2025-03-05',
          },
          body: JSON.stringify({ ...requestBody, messages: msgs }),
        });
        const data = await response.json();
        if (response.status === 429 && attempt < 2) {
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        return { status: response.status, data };
      }
    };

    // Agentic loop
    for (let i = 0; i < 5; i++) {
      const { status, data } = await callAPI(currentMessages);

      if (status !== 200) {
        return res.status(status).json(data);
      }

      if (data.stop_reason === 'end_turn') {
        finalResponse = data;
        break;
      }

      if (data.stop_reason === 'tool_use') {
        currentMessages.push({ role: 'assistant', content: data.content });
        const toolResults = data.content
          .filter(b => b.type === 'tool_use')
          .map(b => ({ type: 'tool_result', tool_use_id: b.id, content: 'Search completed.' }));
        currentMessages.push({ role: 'user', content: toolResults });
      } else {
        finalResponse = data;
        break;
      }
    }

    return res.status(200).json(finalResponse);
  } catch (error) {
    return res.status(500).json({ error: 'API request failed', details: error.message });
  }
}

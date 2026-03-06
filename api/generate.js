export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, model, max_tokens } = req.body;

    const callAnthropic = async (useWebSearch) => {
      const body = {
        model,
        max_tokens: max_tokens || 1500,
        messages,
        ...(useWebSearch && {
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        }),
      };

      const headers = {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        ...(useWebSearch && { 'anthropic-beta': 'web-search-2025-03-05' }),
      };

      let currentMessages = [...messages];

      // Agentic loop for tool use
      for (let i = 0; i < 5; i++) {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...body, messages: currentMessages }),
        });

        const data = await response.json();

        if (response.status === 429) return { status: 429, data };
        if (!response.ok) return { status: response.status, data };

        if (data.stop_reason === 'end_turn') return { status: 200, data };

        if (data.stop_reason === 'tool_use') {
          currentMessages.push({ role: 'assistant', content: data.content });
          const toolResults = data.content
            .filter(b => b.type === 'tool_use')
            .map(b => ({ type: 'tool_result', tool_use_id: b.id, content: 'Search completed.' }));
          currentMessages.push({ role: 'user', content: toolResults });
        } else {
          return { status: 200, data };
        }
      }
    };

    // Try with web search first
    let result = await callAnthropic(true);

    // If rate limited, wait 1s and fall back to no web search
    if (result.status === 429) {
      await new Promise(r => setTimeout(r, 1000));
      result = await callAnthropic(false);
    }

    return res.status(result.status).json(result.data);

  } catch (error) {
    return res.status(500).json({ error: 'API request failed', details: error.message });
  }
}

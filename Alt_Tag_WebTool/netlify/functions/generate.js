// netlify/functions/generate.js

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const body = JSON.parse(event.body || "{}");
    const imageDataUrl = body.image; // expect data URL: data:image/png;base64,AAAA...
    const optionalKeyword = body.keyword || "";

    if (!imageDataUrl) {
      return { statusCode: 400, body: JSON.stringify({ error: "No image provided" }) };
    }

    const systemPrompt = `
You are an Image SEO Expert. Given the image attached, return EXACTLY ONE JSON object (no extra commentary)
with these keys: "alt", "caption", "filename".

Rules:
- "alt": concise, descriptive, accessible alt text (max 125 characters). Mention important visible details only.
- "caption": short caption usable on blog/social (max 75 characters).
- "filename": lowercase, words separated by hyphens, no special chars; meant to describe the image in short keywords. end with .jpg or .png.
- Use American English. Don't include quotes around values.
Return only JSON. Example:
{"alt":"golden retriever running on a beach at sunrise","caption":"Golden retriever enjoying an early-morning run","filename":"golden-retriever-running-beach.jpg"}
`;

    // Prepare OpenAI API payload (using Responses API)
    const payload = {
      model: "gpt-4o-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: systemPrompt },
            // Provide image as a data URL — many vision endpoints accept data URLs
            { type: "input_image", image_url: imageDataUrl },
            { type: "input_text", text: optionalKeyword ? `keyword:${optionalKeyword}` : "" }
          ]
        }
      ],
      // Make the model more deterministic for JSON outputs:
      temperature: 0.0,
    };

    const openai_key = process.env.OPENAI_API_KEY;
    if (!openai_key) {
      return { statusCode: 500, body: JSON.stringify({ error: "Server misconfigured: OPENAI_API_KEY missing" }) };
    }

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openai_key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      timeout: 60000
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return { statusCode: resp.status, body: JSON.stringify({ error: "OpenAI error", detail: txt }) };
    }

    const data = await resp.json();

    // Try to extract text output — structure may vary; we attempt several fallbacks.
    let rawText = "";
    try {
      // Responses API may contain output[0].content[].text or output_text
      if (data.output && Array.isArray(data.output)) {
        // concat any text blocks
        rawText = data.output.map(o => {
          if (typeof o === "string") return o;
          if (o?.content) {
            if (typeof o.content === "string") return o.content;
            // content might be array
            return (Array.isArray(o.content) ? o.content.map(c => c.text || c?.text || "").join(" ") : "");
          }
          return "";
        }).join("\n");
      }
      if (!rawText && data.output_text) rawText = data.output_text;
      if (!rawText && data.choices && data.choices[0] && data.choices[0].message) {
        rawText = data.choices[0].message.content?.[0]?.text || data.choices[0].message.content || "";
      }
    } catch (e) {
      rawText = "";
    }

    // As fallback, stringify the whole response
    if (!rawText) rawText = JSON.stringify(data);

    // find first JSON object in the text
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    let parsed = null;
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (e) {
        // try sanitizing single quotes -> double
        try {
          const sanitized = jsonMatch[0].replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":').replace(/'/g, '"');
          parsed = JSON.parse(sanitized);
        } catch (e2) {
          parsed = null;
        }
      }
    }

    if (!parsed) {
      // last resort: return rawText as error so frontend shows something
      return {
        statusCode: 200,
        body: JSON.stringify({ error: "could-not-parse-json", raw: rawText })
      };
    }

    // Ensure filename ends with jpg/png
    if (parsed.filename && !/\.(jpg|jpeg|png)$/i.test(parsed.filename)) {
      parsed.filename = parsed.filename.replace(/\s+/g, "-").toLowerCase() + ".jpg";
    }

    return {
      statusCode: 200,
      body: JSON.stringify(parsed)
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || String(err) })
    };
  }
};

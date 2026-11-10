
const http = require("http");

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3.8-flash";
const ALLOWED_ORIGIN = "https://estuarlidul.freepage.cc";

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      status: "online",
      message: "Servidor del chatbot funcionando"
    }));
  }

  if (req.method !== "POST" || req.url !== "/api/chat") {
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Ruta no encontrada" }));
  }

  if (!API_KEY) {
    res.writeHead(500, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Falta configurar la API Key" }));
  }

  try {
    let body = "";

    for await (const chunk of req) {
      body += chunk;
      if (body.length > 100000) {
        throw new Error("Solicitud demasiado grande");
      }
    }

    const data = JSON.parse(body);
    const message = String(data.message || "").trim();

    if (!message) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Escribe un mensaje" }));
    }

    const history = Array.isArray(data.history)
      ? data.history.slice(-12)
      : [];

    const contents = history
      .filter(item =>
        ["user", "model"].includes(item.role) &&
        typeof item.text === "string" &&
        item.text.trim()
      )
      .map(item => ({
        role: item.role,
        parts: [{ text: item.text.slice(0, 4000) }]
      }));

    contents.push({
      role: "user",
      parts: [{ text: message.slice(0, 4000) }]
    });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": API_KEY
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: "Eres un asistente virtual útil, claro y amable. Responde en español cuando el usuario escriba en español."
            }]
          },
          contents
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("Error de Gemini:", result);
      res.writeHead(response.status, {
        "Content-Type": "application/json"
      });
      return res.end(JSON.stringify({
        error: result.error?.message || "Error al consultar Gemini"
      }));
    }

    const reply =
      result.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("") || "No pude generar una respuesta.";

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ reply }));

  } catch (error) {
    console.error(error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Error interno del servidor" }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor activo en el puerto ${PORT}`);
});

import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors({
    origin: [
        "https://estuarlidul.freepage.cc",
        "http://localhost:5500",      // pruebas locales (Live Server)
        "http://127.0.0.1:5500"
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
    res.json({
        status: "online",
        message: "Servidor del chatbot Gemini funcionando"
    });
});

const MODELS = [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash"
];

// ========================================
// INSTRUCCIÓN DEL SISTEMA: solo noticias de educación (Ecuador), resumidas
// ========================================
const SYSTEM_PROMPT = `Eres "Edu", asistente de noticias del Ministerio de Educación del Ecuador.

ALCANCE
- Solo respondes sobre noticias, comunicados, anuncios y trámites de educación en Ecuador.
- Busca primero en educacion.gob.ec. Si falta información, usa otras fuentes oficiales (gob.ec, Senescyt, Presidencia) y, como último recurso, medios reconocidos (Primicias, El Comercio, El Universo, Expreso, Ecuavisa).
- Si la pregunta no tiene relación con educación en Ecuador, responde en una frase que solo puedes ayudar con noticias educativas y sugiere un tema.

ESTILO (tus respuestas las lee en voz alta un avatar)
- Máximo 3 oraciones cortas (unas 60 palabras). Todo resumido.
- Texto plano en español: sin markdown, sin viñetas, sin emojis, sin enlaces ni URLs.
- Menciona la fecha de la noticia si la conoces y la fuente (por ejemplo: "según el Ministerio de Educación").

HONESTIDAD
- No inventes datos, fechas ni cifras. Si no encuentras la noticia, dilo y sugiere revisar educacion.gob.ec.`;

const wait = (ms) =>
    new Promise(resolve => setTimeout(resolve, ms));

const isUnavailable = (error) =>
    Number(error?.status) === 503 ||
    error?.message?.includes("UNAVAILABLE");

const isQuota = (error) =>
    Number(error?.status) === 429 ||
    error?.message?.includes("RESOURCE_EXHAUSTED");

// Pon USE_SEARCH=false en Render para desactivar la búsqueda sin cambiar código
const USE_SEARCH = process.env.USE_SEARCH !== "false";

const NO_SEARCH_NOTE = `

IMPORTANTE: ahora mismo NO tienes acceso a búsqueda en vivo. No cites noticias, fechas ni cifras concretas. Di brevemente que no puedes verificar las últimas noticias en este momento y sugiere revisar educacion.gob.ec.`;

// Extrae las fuentes que usó la búsqueda de Google
function getSources(response) {
    const chunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    const seen = new Set();

    return chunks
        .filter(c => c.web?.uri)
        .map(c => ({
            title: c.web.title || c.web.uri,
            url: c.web.uri
        }))
        .filter(s => !seen.has(s.url) && seen.add(s.url))
        .slice(0, 4);
}

app.post("/api/chat", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({
            error: "Falta configurar la API Key."
        });
    }

    const { message, history = [] } = req.body;

    if (typeof message !== "string" || !message.trim()) {
        return res.status(400).json({
            error: "Mensaje inválido."
        });
    }

    if (!Array.isArray(history)) {
        return res.status(400).json({
            error: "Historial inválido."
        });
    }

    const contents = history
        .filter(item =>
            item &&
            ["user", "model"].includes(item.role) &&
            typeof item.text === "string"
        )
        .slice(-12)
        .map(item => ({
            role: item.role,
            parts: [{ text: item.text }]
        }));

    contents.push({
        role: "user",
        parts: [{ text: message.trim().slice(0, 2000) }]
    });

    const ai = new GoogleGenAI({ apiKey });

    let lastError;

    // Primero con búsqueda en vivo; si todo falla por cuota, sin búsqueda
    const modes = USE_SEARCH ? [true, false] : [false];

    for (const useSearch of modes) {
        for (const model of MODELS) {
            // Reintento solo si el modelo está saturado (503)
            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    console.log(
                        `Probando ${model} (búsqueda: ${useSearch}). Intento ${attempt}`
                    );

                    const config = {
                        systemInstruction: useSearch
                            ? SYSTEM_PROMPT
                            : SYSTEM_PROMPT + NO_SEARCH_NOTE,
                        temperature: 0.3,
                        maxOutputTokens: 1024
                    };

                    if (useSearch) {
                        config.tools = [{ googleSearch: {} }];
                    }

                    const response = await ai.models.generateContent({
                        model,
                        contents,
                        config
                    });

                    console.log(`Respuesta generada con ${model}`);

                    return res.json({
                        reply: response.text ||
                            "No se obtuvo una respuesta.",
                        sources: useSearch ? getSources(response) : []
                    });

                } catch (error) {
                    lastError = error;

                    console.error(
                        `Error con ${model} (búsqueda: ${useSearch}):`,
                        error.message
                    );

                    // 429, 400 u otros: pasar al siguiente modelo
                    if (!isUnavailable(error)) {
                        break;
                    }

                    if (attempt < 2) {
                        await wait(1500 * attempt);
                    }
                }
            }
        }
    }

    console.error("Todos los modelos fallaron:", lastError);

    if (isQuota(lastError)) {
        return res.status(429).json({
            error: "Se alcanzó el límite de consultas de Gemini. Espera un momento e intenta de nuevo."
        });
    }

    if (isUnavailable(lastError)) {
        return res.status(503).json({
            error: "Gemini está temporalmente saturado. Intenta nuevamente en unos momentos."
        });
    }

    return res.status(500).json({
        error: "No se pudo generar la respuesta. Revisa los registros del servidor."
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor iniciado en el puerto ${PORT}`);
});

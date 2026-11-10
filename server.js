
import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors({
    origin: "https://estuarlidul.freepage.cc",
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

const wait = (ms) =>
    new Promise(resolve => setTimeout(resolve, ms));

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
        parts: [{ text: message.trim() }]
    });

    const ai = new GoogleGenAI({ apiKey });

    let lastError;

    for (const model of MODELS) {
        // Dos intentos por modelo
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                console.log(
                    `Probando ${model}. Intento ${attempt}`
                );

                const response = await ai.models.generateContent({
                    model,
                    contents
                });

                console.log(`Respuesta generada con ${model}`);

                return res.json({
                    reply: response.text ||
                        "No se obtuvo una respuesta."
                });

            } catch (error) {
                lastError = error;

                const status = Number(error.status);
                const unavailable =
                    status === 503 ||
                    error.message?.includes("UNAVAILABLE");

                console.error(
                    `Error con ${model}:`,
                    error.message
                );

                // Solo probar otro modelo ante saturación
                if (!unavailable) {
                    break;
                }

                if (attempt < 2) {
                    await wait(1500 * attempt);
                }
            }
        }

        // Si el error no es de saturación, no continuar
        const status = Number(lastError?.status);
        const unavailable =
            status === 503 ||
            lastError?.message?.includes("UNAVAILABLE");

        if (!unavailable) {
            break;
        }
    }

    console.error("Todos los modelos fallaron:", lastError);

    const finalStatus = Number(lastError?.status) || 500;

    return res.status(
        finalStatus === 503 ? 503 : 500
    ).json({
        error: finalStatus === 503
            ? "Gemini está temporalmente saturado. Intenta nuevamente en unos momentos."
            : "No se pudo generar la respuesta. Revisa los registros del servidor."
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor iniciado en el puerto ${PORT}`);
});

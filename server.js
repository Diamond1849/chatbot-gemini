
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

app.post("/api/chat", async (req, res) => {
    try {
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

        const response = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: contents
        });

        res.json({
            reply: response.text || "No se obtuvo una respuesta."
        });

    } catch (error) {
        console.error("Error Gemini:", error);

        res.status(500).json({
            error: "No se pudo generar la respuesta. Revisa los registros del servidor."
        });
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor iniciado en el puerto ${PORT}`);
});

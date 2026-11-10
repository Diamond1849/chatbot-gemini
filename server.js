
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
        error: "Falta configurar la clave de Gemini en Render."
      });
    }

    const message = req.body.message;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "Debes enviar un mensaje."
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: message.trim()
    });

    res.json({
      reply: response.text || "No se obtuvo una respuesta."
    });

  } catch (error) {
    console.error("Error de Gemini:", error);

    res.status(500).json({
      error: "No se pudo generar una respuesta. Inténtalo nuevamente."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor iniciado en el puerto ${PORT}`);
});

import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const PORT = 3000;

async function startServer() {
  const app = express();
  const isProduction = process.env.NODE_ENV === "production";

  // Allow base64 photo uploads up to 25MB without memory overhead
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));

  // Multimodal Gemini OCR endpoint (Ultra-fast, zero Python/PyTorch/Railway, zero OOM)
  app.post("/api/ocr", async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "Nessuna immagine fornita." });
      }

      const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
      const apiKey = process.env.GEMINI_API_KEY;
      const ai = new GoogleGenAI(apiKey ? { apiKey } : {});

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: mimeType || "image/jpeg",
                  data: cleanBase64,
                },
              },
              {
                text: `Sei un perito contabile esperto in fatture idriche condominiali italiane (ARERA).
Analizza questa immagine (bolletta o tabella dei corrispettivi idrici) ed estrai con assoluta precisione i seguenti campi in formato JSON:

Campi numerici da estrarre (numeri decimali con punto, es. 441.32):
- bill_quotaFissa (es. 59.2100 -> 59.21)
- bill_canoniIdrici (es. 441.3200 -> 441.32; corrisponde a Canoni Idrici / Quota Variabile Acquedotto / Consumo Acqua)
- bill_canoneFognatura (es. 38.8800 -> 38.88)
- bill_canoneDepurazione (es. 117.7300 -> 117.73)
- bill_oneriPerequazioneAcqua (es. 12.4800 -> 12.48, UI1 / UI2)
- bill_oneriPerequazioneFognatura (es. 12.4800 -> 12.48, UI3)
- bill_oneriPerequazioneDepurazione (es. 12.4800 -> 12.48, UI4)
- bill_speseSpedizione (es. 0.5500 -> 0.55, spese di postalizzazione o recapito)
- bill_costoPagamento (spese incasso o bollettino)
- bill_totaleImponibile (es. 694.58)
- nomeCondominio (nome del condominio o intestatario se presente)
- numeroFattura (numero fattura o documento)
- periodoFatturazione (periodo o bimestre di fatturazione)

ATTENZIONE MASSIMA:
1. "Canoni Idrici" deve avere il suo importo esatto (es. 441.3200 -> 441.32), NON confonderlo con Canone Fognatura (38.88)!
2. Restituisci ESCLUSIVAMENTE un JSON valido, senza testo o markdown prima o dopo.`
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
        },
      });

      const parsedJson = JSON.parse(response.text || "{}");
      return res.json({ success: true, data: parsedJson });
    } catch (err: any) {
      console.error("[HydroSplit /api/ocr Error]:", err);
      return res.status(500).json({ error: err.message || "Errore elaborazione OCR" });
    }
  });

  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: "0.0.0.0",
        port: PORT,
        hmr: process.env.DISABLE_HMR !== "true",
        watch: process.env.DISABLE_HMR === "true" ? null : {},
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[HydroSplit Pro] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

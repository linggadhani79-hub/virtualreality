import express from "express";
import path from "path";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import { NodeIO } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, draco, prune, weld } from "@gltf-transform/functions";
import draco3d from "draco3d";

async function startServer() {
  const app = express();
  const PORT = 3000;

  const upload = multer({ storage: multer.memoryStorage() });

  // Middleware
  app.use(express.json());

      

  // Proxy endpoint to bypass CORS for Firebase Storage
  app.get("/api/proxy-asset", async (req, res) => {
    console.log("PROXY ASSET HIT!", req.query.url);
    try {
      const url = req.query.url;
      if (!url || typeof url !== "string") {
        return res.status(400).send("Missing url parameter");
      }

      // Fetch the asset from Firebase Storage
      const response = await fetch(url);
      
      console.log("Proxy fetch status:", response.status);
      
      if (!response.ok) {
        return res.status(response.status).send(response.statusText);
      }

      // Forward the Content-Type
      const contentType = response.headers.get("content-type");
      console.log("Proxy fetch content-type:", contentType);
      
      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }
      
      // Add CORS headers for the frontend (though they are on the same domain anyway)
      res.setHeader("Access-Control-Allow-Origin", "*");

      if (response.body) {
        // Stream the response directly to the client
        const { Readable } = await import("stream");
        const nodeStream = Readable.fromWeb(response.body as any);
        nodeStream.pipe(res);
        nodeStream.on("error", (err) => {
          console.error("Stream error:", err);
          if (!res.headersSent) {
            res.status(500).send("Stream error");
          } else {
            res.end();
          }
        });
      } else {
        res.end();
      }
    } catch (e) {
      console.error("Proxy error:", e);
      res.status(500).send("Proxy error");
    }
  });

  // Optimize endpoint
  app.post("/api/optimize-model", upload.single("model"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).send("No file uploaded");
      }

      const io = new NodeIO()
        .registerExtensions(KHRONOS_EXTENSIONS)
        .registerDependencies({
          'draco3d.decoder': await draco3d.createDecoderModule(),
          'draco3d.encoder': await draco3d.createEncoderModule(),
        });

      const document = await io.readBinary(req.file.buffer);

      await document.transform(
        weld(),
        dedup(),
        prune(),
        draco()
      );

      const optimizedBuffer = await io.writeBinary(document);

      res.setHeader("Content-Type", "model/gltf-binary");
      res.send(Buffer.from(optimizedBuffer));
    } catch (e) {
      console.error("Optimization error:", e);
      res.status(500).send("Failed to optimize model");
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

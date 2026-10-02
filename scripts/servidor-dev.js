const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};
const RELOAD_SNIPPET = '<script>new EventSource("/__recargar").onmessage=()=>location.reload()</script>';
const clients = new Set();

function readPort() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--port=")) return Number(args[i].slice(7));
    if (args[i] === "--port" && args[i + 1]) return Number(args[i + 1]);
  }
  return Number(process.env.PORT) || 5173;
}

const PORT = readPort();

function send(res, status, body, type) {
  res.writeHead(status, { "Content-Type": type || "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, "Solicitud inválida");
  }

  if (pathname === "/__recargar") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    res.write("retry: 1000\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (pathname === "/") {
    res.writeHead(302, { Location: "/tienda/" });
    return res.end();
  }

  const target = path.normalize(path.join(ROOT, pathname));
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return send(res, 403, "Acceso denegado");
  if (target.split(path.sep).includes("node_modules")) return send(res, 403, "Acceso denegado");

  fs.stat(target, (err, stat) => {
    if (err) return send(res, 404, "No encontrado: " + pathname);
    if (stat.isDirectory()) {
      if (!pathname.endsWith("/")) {
        res.writeHead(302, { Location: pathname + "/" });
        return res.end();
      }
      return serveFile(path.join(target, "index.html"), res);
    }
    serveFile(target, res);
  });
}

function serveFile(file, res) {
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, "No encontrado");
    const ext = path.extname(file).toLowerCase();
    const type = TYPES[ext] || "application/octet-stream";
    if (ext === ".html") {
      const html = data.toString("utf-8");
      const injected = html.includes("</body>") ? html.replace("</body>", RELOAD_SNIPPET + "</body>") : html + RELOAD_SNIPPET;
      return send(res, 200, injected, type);
    }
    send(res, 200, data, type);
  });
}

function watchChanges() {
  let timer = null;
  try {
    fs.watch(ROOT, { recursive: true }, (event, filename) => {
      if (!filename || filename.split(path.sep).some(part => part === "node_modules" || part.startsWith("."))) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const client of clients) client.write("data: recargar\n\n");
      }, 120);
    });
  } catch (err) {
    console.warn("Recarga automática no disponible en este sistema:", err.message);
  }
}

const server = http.createServer(handle);

server.on("error", err => {
  if (err.code === "EADDRINUSE") {
    console.error("El puerto " + PORT + " ya está en uso. Prueba con: npm run dev -- --port 3000");
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log("");
  console.log("  Servicom Group — servidor de desarrollo");
  console.log("");
  console.log("  Tienda:         http://localhost:" + PORT + "/tienda/");
  console.log("  Administración: http://localhost:" + PORT + "/admin/");
  console.log("");
  console.log("  Ctrl + C para detener.");
  console.log("");
  watchChanges();
});

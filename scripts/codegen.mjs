import { createServer } from "vite";
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
});
try {
  await server.ssrLoadModule("/scripts/codegen.ts");
} finally {
  await server.close();
}

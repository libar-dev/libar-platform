import { withBackend } from "../harness/backend.js";
await withBackend(async (backend) => {
  await backend.command(["codegen", "--typecheck", "disable"]);
});

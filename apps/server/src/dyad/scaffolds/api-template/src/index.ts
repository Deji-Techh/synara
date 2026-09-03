import { app } from "./app";
import { env } from "./lib/env";

console.log(`Server starting on port ${env.PORT} (${env.NODE_ENV})`);

export default {
  port: env.PORT,
  fetch: app.fetch,
};

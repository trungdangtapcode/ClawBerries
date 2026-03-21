import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "@/shared/config/env.js";
import * as schema from "./schema.js";

const client = postgres(config.DATABASE_URL);

export const db = drizzle(client, { schema });

export { schema };

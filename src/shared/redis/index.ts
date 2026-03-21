import Redis from "ioredis";
import { config } from "@/shared/config/env.js";

export const redis = new Redis(config.REDIS_URL, {
	maxRetriesPerRequest: 3,
	retryStrategy(times) {
		return Math.min(times * 200, 2000);
	},
});

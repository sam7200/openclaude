import { Bot } from "grammy";
import { apiThrottler } from "@grammyjs/transformer-throttler";
import type { Logger } from "pino";

export function createBot(token: string, log: Logger): Bot {
  const bot = new Bot(token);
  bot.api.config.use(apiThrottler());
  bot.catch((err) => {
    log.error({ error: err.message }, "Bot error");
  });
  return bot;
}

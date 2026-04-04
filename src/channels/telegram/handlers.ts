import type { Bot, Context } from "grammy";
import type { InboundMessage, MessageHandler, CommandHandler } from "../types.js";
import type { Logger } from "pino";

export function registerHandlers(
  bot: Bot,
  messageHandler: MessageHandler | undefined,
  commandHandlers: Map<string, CommandHandler>,
  _log: Logger,
): void {
  for (const [cmd, handler] of commandHandlers) {
    bot.command(cmd, async (ctx) => {
      const msg = contextToInbound(ctx);
      if (!msg) return;
      const text = ctx.message?.text ?? "";
      const spaceIdx = text.indexOf(" ");
      msg.text = spaceIdx > 0 ? text.slice(spaceIdx + 1).trim() : "";
      await handler(msg);
    });
  }

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    if (!messageHandler) return;
    const msg = contextToInbound(ctx);
    if (!msg) return;
    await messageHandler(msg);
  });

  bot.on("message:photo", async (ctx) => {
    if (!messageHandler) return;
    const msg = contextToInbound(ctx);
    if (!msg) return;
    msg.text = ctx.message.caption ?? "";
    const photo = ctx.message.photo;
    const largest = photo[photo.length - 1];
    msg.attachments = [{ type: "photo", fileId: largest.file_id }];
    await messageHandler(msg);
  });

  bot.on("message:document", async (ctx) => {
    if (!messageHandler) return;
    const msg = contextToInbound(ctx);
    if (!msg) return;
    msg.text = ctx.message.caption ?? "";
    const doc = ctx.message.document;
    msg.attachments = [{ type: "document", fileId: doc.file_id, fileName: doc.file_name, mimeType: doc.mime_type }];
    await messageHandler(msg);
  });
}

function contextToInbound(ctx: Context): InboundMessage | null {
  const msg = ctx.message;
  if (!msg) return null;

  const chatId = String(msg.chat.id);
  const senderId = String(msg.from?.id ?? "unknown");
  const senderName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || "Unknown";

  return {
    channelType: "telegram",
    chatId,
    senderId,
    senderName,
    messageId: String(msg.message_id),
    text: msg.text ?? "",
    isGroup: msg.chat.type === "group" || msg.chat.type === "supergroup",
    threadId: msg.message_thread_id ? String(msg.message_thread_id) : undefined,
    replyToMessageId: msg.reply_to_message?.message_id ? String(msg.reply_to_message.message_id) : undefined,
    raw: msg,
  };
}

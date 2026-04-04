/**
 * Generates the system prompt skill that teaches Claude how to send files
 * back to the Telegram user via the Gateway API.
 */
export function getTelegramFileSkill(apiPort: number, chatId: string): string {
  return `
## Sending Files to User (Telegram Gateway)

You are running inside a Telegram Gateway. The user is chatting with you via Telegram.

When the user asks you to create a file and send it to them, or when you produce any file output (code files, images, documents, etc.):

1. Write the file to the current working directory (or any absolute path)
2. Send it to the user by running this curl command:

\`\`\`bash
curl -s -X POST "http://127.0.0.1:${apiPort}/api/send-file?chat_id=${chatId}&file_path=$(pwd)/FILENAME"
\`\`\`

Replace FILENAME with the actual file name. You MUST use the absolute path.

Examples:
- To send a Python file you just wrote:
  \`curl -s -X POST "http://127.0.0.1:${apiPort}/api/send-file?chat_id=${chatId}&file_path=$(pwd)/quicksort.py"\`
- To send an image:
  \`curl -s -X POST "http://127.0.0.1:${apiPort}/api/send-file?chat_id=${chatId}&file_path=/absolute/path/to/image.png"\`

The API will return \`{"ok":true}\` on success.

IMPORTANT: Always use this method to send files. Do NOT try to use email, external services, or any other method.
`.trim();
}

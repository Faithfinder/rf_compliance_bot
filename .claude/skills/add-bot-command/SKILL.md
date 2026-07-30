---
name: add-bot-command
description: Add a new command to the rf_compliance_bot Telegram bot. Use when adding, registering, or wiring up a new bot command (e.g. /mycommand) so it appears in the Telegram menu and /help automatically.
---

# Adding a new bot command

All command metadata lives in [src/commands/definitions.ts](../../../src/commands/definitions.ts), which is the single source of truth. Registering a command anywhere else will silently leave it out of the Telegram menu, `/help`, and startup registration.

1. **Create the command handler file** in [src/commands/](../../../src/commands/) (e.g. `mycommand.ts`) with a `register*Command()` function.

2. **Add a command definition** to [src/commands/definitions.ts](../../../src/commands/definitions.ts):

   ```typescript
   {
       command: "mycommand",
       description: "Short description for bot menu",
       helpText: "/mycommand <args> - Detailed help text with usage examples",
       register: registerMyCommand,
   }
   ```

3. **Import the registration function** in [src/commands/definitions.ts](../../../src/commands/definitions.ts).

That's it. The command is then automatically:

- Added to the Telegram bot menu (via `setBotCommands()` in [src/config/bot.ts](../../../src/config/bot.ts))
- Included in the `/help` message ([src/commands/help.ts](../../../src/commands/help.ts))
- Registered when the bot starts ([src/index.ts](../../../src/index.ts) iterates the definitions, deduplicating shared registration functions)

Remember: all user-facing strings must be in Russian.

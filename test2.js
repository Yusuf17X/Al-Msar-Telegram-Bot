const { Telegraf, Markup } = require("telegraf");
const dotenv = require("dotenv");

dotenv.config({ path: "./config.env" });

// Replace with your actual bot token from BotFather
const BOT_TOKEN = process.env.BOT_TOKEN;

const bot = new Telegraf(BOT_TOKEN);

// Class names
const classNames = ["Class A", "Class B", "Class C", "Class D"];

// Handler for the /start command
bot.start((ctx) => {
  return ctx.reply(
    "Select a class:",
    Markup.inlineKeyboard(
      classNames.map((className) => [
        Markup.button.callback(className, `class_${className}`),
      ]),
    ),
  );
});

// Handler for class selection
classNames.forEach((className) => {
  bot.action(`class_${className}`, async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.editMessageText(
      `Select a lecture for ${className}:`,
      Markup.inlineKeyboard(
        [1, 2, 3, 4]
          .map((num) => [
            Markup.button.callback(
              `Lecture ${num}`,
              `lecture_${className}_${num}`,
            ),
          ])
          .concat([[Markup.button.callback("⬅️ Back", "back_to_classes")]]),
      ),
    );
  });
});

// Handler for going back to class selection
bot.action("back_to_classes", async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.editMessageText(
    "Select a class:",
    Markup.inlineKeyboard(
      classNames.map((className) => [
        Markup.button.callback(className, `class_${className}`),
      ]),
    ),
  );
});

// Handler for lecture selection
classNames.forEach((className) => {
  [1, 2, 3, 4].forEach((num) => {
    bot.action(`lecture_${className}_${num}`, async (ctx) => {
      await ctx.answerCbQuery();
      return ctx.editMessageText(
        `Class: ${className}\nLecture: ${num}\n\nLecture link: [placeholder]`,
        Markup.inlineKeyboard([
          [Markup.button.callback("⬅️ Back to Lectures", `class_${className}`)],
          [Markup.button.callback("🏠 Back to Classes", "back_to_classes")],
        ]),
        { parse_mode: "Markdown" },
      );
    });
  });
});

// Start polling
bot.launch();

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

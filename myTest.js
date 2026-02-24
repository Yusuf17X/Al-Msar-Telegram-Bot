const { Telegraf, Markup, session } = require("telegraf");
const dotenv = require("dotenv");

dotenv.config({ path: "./config.env" });

const BOT_TOKEN = process.env.BOT_TOKEN;

const bot = new Telegraf(BOT_TOKEN);

bot.use(session({ defaultSession: () => ({ count: 0 }) }));

const classes = ["Class 1", "Class 2", "Class 3"];
const lectures = ["Lecture 1", "Lecture 2", "Lecture 3"];

const buttonsHandler = function (ctx, message, btns) {
  const replyMarkup = Markup.keyboard(btns).resize();
  ctx.reply(message, replyMarkup);
};

bot.start((ctx) => {
  session.count = 0;
  return buttonsHandler(
    ctx,
    "Welcome to the bot, please select a class:",
    classes,
  );
});

classes.forEach((className) => {
  bot.hears(className, (ctx) => {
    return buttonsHandler(ctx, `You selected ${className}`, lectures);
  });
});

bot.on("text", (ctx) => {
  session.count = session.count ? session.count + 1 : 1;
  ctx.reply(`You have sent ${session.count} messages.`);
});

// document (any file)
bot.on("document", (ctx) => {
  const doc = ctx.message.document;
  // ctx.reply(`Received document: ${doc.file_name} (${doc.mime_type})`);
  ctx.replyWithDocument(doc.file_id);
});

// Start polling
bot.launch();

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

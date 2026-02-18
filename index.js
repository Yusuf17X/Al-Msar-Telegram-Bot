const { Markup, Telegraf } = require("telegraf");
const dotenv = require("dotenv");

dotenv.config({ path: "./config.env" });

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
  ctx.reply(
    "Select option:",
    Markup.keyboard([["🎓 Stage 2"], ["📢 Homework"]]).resize(),
    //   .oneTime(),
  );
});

bot.hears("🎓 Stage 2", (ctx) => {
  ctx.reply("Stage 2 selected");
});

bot.hears("📢 Homework", (ctx) => {
  ctx.reply("Homework info here");
});

bot.launch();

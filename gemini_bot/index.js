require("dotenv").config({ path: "./config.env" });
const { Telegraf, Scenes, session } = require("telegraf");
const mongoose = require("mongoose");
const { User } = require("./models");
const { mainMenuKeyboard, adminPanelKeyboard } = require("./utils");

// Import Scenes
const {
  addStageWizard,
  addClassWizard,
  addLectureWizard,
  delStageWizard,
  delClassWizard,
  delLectureWizard,
  broadcastWizard,
} = require("./adminScenes");
const { chooseStageWizard, browseClassesWizard } = require("./userScenes");

mongoose
  .connect(process.env.DB.replace("<DB_PASSWORD>", process.env.DB_PASSWORD))
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB error:", err));

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(session());

// Ensure User is tracked
bot.use(async (ctx, next) => {
  if (ctx.from && ctx.chat?.type === "private") {
    await User.updateOne(
      { chatId: ctx.chat.id.toString() },
      { $setOnInsert: { chatId: ctx.chat.id.toString() } },
      { upsert: true },
    ).catch(() => {});
  }
  return next();
});

const stage = new Scenes.Stage([
  addStageWizard,
  addClassWizard,
  addLectureWizard,
  delStageWizard,
  delClassWizard,
  delLectureWizard,
  broadcastWizard,
  chooseStageWizard,
  browseClassesWizard,
]);
bot.use(stage.middleware());

// --- ROUTERS ---
bot.start((ctx) =>
  ctx.reply("Welcome to the Lecture Bot!", mainMenuKeyboard(ctx)),
);
bot.hears("🔙 Main Menu", (ctx) =>
  ctx.reply("Main Menu", mainMenuKeyboard(ctx)),
);

bot.hears("📚 Browse Classes", async (ctx) => {
  const user = await User.findOne({ chatId: ctx.chat.id.toString() });
  if (!user || !user.stageId) ctx.scene.enter("CHOOSE_STAGE_SCENE");
  else ctx.scene.enter("BROWSE_CLASSES_SCENE");
});
bot.hears("🔄 Switch Stage", (ctx) => ctx.scene.enter("CHOOSE_STAGE_SCENE"));

// --- ADMIN ROUTES ---
bot.hears("⚙️ Admin Panel", (ctx) => {
  if (ctx.from.id.toString() === process.env.ADMIN_ID)
    ctx.reply("⚙️ Admin Dashboard", adminPanelKeyboard);
});

bot.hears("➕ Add Stage", (ctx) => {
  if (ctx.from.id.toString() === process.env.ADMIN_ID)
    ctx.scene.enter("ADD_STAGE_SCENE");
});
bot.hears("➕ Add Class", (ctx) => {
  if (ctx.from.id.toString() === process.env.ADMIN_ID)
    ctx.scene.enter("ADD_CLASS_SCENE");
});
bot.hears("➕ Add Lecture", (ctx) => {
  if (ctx.from.id.toString() === process.env.ADMIN_ID)
    ctx.scene.enter("ADD_LECTURE_SCENE");
});
bot.hears("❌ Delete Stage", (ctx) => {
  if (ctx.from.id.toString() === process.env.ADMIN_ID)
    ctx.scene.enter("DEL_STAGE_SCENE");
});
bot.hears("❌ Delete Class", (ctx) => {
  if (ctx.from.id.toString() === process.env.ADMIN_ID)
    ctx.scene.enter("DEL_CLASS_SCENE");
});
bot.hears("❌ Delete Lecture", (ctx) => {
  if (ctx.from.id.toString() === process.env.ADMIN_ID)
    ctx.scene.enter("DEL_LECTURE_SCENE");
});
bot.hears("📢 Broadcast Message", (ctx) => {
  if (ctx.from.id.toString() === process.env.ADMIN_ID)
    ctx.scene.enter("BROADCAST_SCENE");
});

bot.launch().then(() => console.log("Bot is running nicely refactored!"));
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

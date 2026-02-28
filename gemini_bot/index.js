require("dotenv").config({ path: "./config.env" });
const { Telegraf, Scenes, session } = require("telegraf");
const mongoose = require("mongoose");
const { User, BotSettings } = require("./models");
const { mainMenuKeyboard, adminPanelKeyboard, timeIt } = require("./utils");

// Import Scenes
const {
  addStageWizard,
  addClassWizard,
  addLectureWizard,
  delStageWizard,
  delClassWizard,
  delLectureWizard,
  broadcastWizard,
  addArchiveWizard,
  delArchiveWizard,
  addCreativeWizard,
  delCreativeWizard,
  promoteAdminWizard,
  broadcastGroupWizard,
  editWelcomeMsgWizard,
} = require("./adminScenes");
const {
  chooseStageWizard,
  browseClassesWizard,
  viewArchiveWizard,
  viewCreativeWizard,
  suggestWizard,
} = require("./userScenes");

mongoose
  .connect(process.env.DB.replace("<DB_PASSWORD>", process.env.DB_PASSWORD))
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB error:", err));

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(session());

// Ensure User is tracked
// Inside index.js
bot.use(async (ctx, next) => {
  // We only care about saving users who interact directly with the bot
  if (!ctx.from) return next();

  let user = await User.findOne({ chatId: ctx.from.id });

  if (!user) {
    // Automatically make you the 'owner' based on your .env file
    const userRole =
      ctx.from.id.toString() === process.env.ADMIN_ID ? "owner" : "user";

    user = await User.create({
      chatId: ctx.from.id,
      username: ctx.from.username,
      role: userRole,
    });
  }

  // Attach the user object directly to 'ctx' so we can use it anywhere!
  ctx.state.dbUser = user;

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
  viewArchiveWizard,
  viewCreativeWizard,
  addArchiveWizard,
  delArchiveWizard,
  addCreativeWizard,
  delCreativeWizard,
  promoteAdminWizard,
  broadcastGroupWizard,
  suggestWizard,
  editWelcomeMsgWizard,
]);
bot.use(stage.middleware());

// --- ROUTERS ---
bot.start(async (ctx) => {
  // Find the settings, or create the default one if it doesn't exist yet
  let settings = await timeIt(
    "Fetch Bot Settings: Welcome Message",
    BotSettings.findOne({ singletonId: "default" }),
  );

  if (!settings) {
    settings = await BotSettings.create({});
  }

  // Send the dynamic welcome message
  ctx.reply(settings.welcomeMessage, mainMenuKeyboard(ctx));
});

bot.command("link", async (ctx) => {
  // 1. Ensure this is inside a group chat
  if (ctx.chat.type === "private") {
    return ctx.reply(
      "⚠️ Please use this command inside your Stage's group chat.",
    );
  }

  // 2. Grab the user we attached in the middleware
  const user = ctx.state.dbUser;

  // 3. Check their role
  if (user.role !== "admin" && user.role !== "owner") {
    return; // Silently ignore normal users so the bot doesn't spam the group
  }

  // 4. Ensure they actually have a stage assigned to them
  if (user.role === "admin" && !user.managedStageId) {
    return ctx.reply(
      "❌ You are an admin, but you haven't been assigned a Stage yet. Contact the Owner.",
    );
  }

  // 5. Find the stage and link the group ID
  try {
    const stageId =
      user.role === "admin"
        ? user.managedStageId
        : ctx.message.text.split(" ")[1]; // Owner might pass stage ID as an argument later

    const stage = await Stage.findById(stageId);
    if (!stage) return ctx.reply("❌ Stage not found in database.");

    stage.telegramGroupId = ctx.chat.id.toString();
    await stage.save();

    return ctx.reply(
      `✅ Success! This group is now officially linked to **${stage.name}**.`,
    );
  } catch (error) {
    console.error(error);
    return ctx.reply("❌ An error occurred while linking the group.");
  }
});

bot.command("suggest", (ctx) => ctx.scene.enter("SUGGEST_SCENE"));

bot.hears("🔙 Main Menu", (ctx) =>
  ctx.reply("Main Menu", mainMenuKeyboard(ctx)),
);

bot.hears("📚 Browse Classes", async (ctx) => {
  const user = await User.findOne({ chatId: ctx.chat.id.toString() });
  if (!user || !user.stageId) ctx.scene.enter("CHOOSE_STAGE_SCENE");
  else ctx.scene.enter("BROWSE_CLASSES_SCENE");
});

bot.hears("🔄 Switch Stage", (ctx) => ctx.scene.enter("CHOOSE_STAGE_SCENE"));

bot.hears("⚙️ Admin Panel", (ctx) => {
  // Check if the user exists in state, and grab their role
  const role = ctx.state.dbUser?.role;

  // If they are a stage admin or the super owner, let them in
  if (role === "admin" || role === "owner") {
    ctx.reply("⚙️ Admin Panel", adminPanelKeyboard(ctx));
  }
});

bot.hears("➕ Add Stage", (ctx) => {
  if (ctx.state.dbUser?.role === "owner") ctx.scene.enter("ADD_STAGE_SCENE");
});
bot.hears("➕ Add Class", (ctx) => {
  const role = ctx.state.dbUser?.role;
  if (role === "owner" || role === "admin") ctx.scene.enter("ADD_CLASS_SCENE");
});
bot.hears("➕ Add Lecture", (ctx) => {
  const role = ctx.state.dbUser?.role;
  if (role === "owner" || role === "admin")
    ctx.scene.enter("ADD_LECTURE_SCENE");
});
bot.hears("❌ Delete Stage", (ctx) => {
  if (ctx.state.dbUser?.role === "owner") ctx.scene.enter("DEL_STAGE_SCENE");
});
bot.hears("❌ Delete Class", (ctx) => {
  if (ctx.state.dbUser?.role === "admin") ctx.scene.enter("DEL_CLASS_SCENE");
});
bot.hears("❌ Delete Lecture", (ctx) => {
  if (ctx.state.dbUser?.role === "admin") ctx.scene.enter("DEL_LECTURE_SCENE");
});

bot.hears("📢 Broadcast Message", (ctx) => {
  if (ctx.state.dbUser?.role === "owner") ctx.scene.enter("BROADCAST_SCENE");
});
bot.hears("📢 Send Announcement", (ctx) => {
  if (ctx.state.dbUser?.role === "owner" || ctx.state.dbUser?.role === "admin")
    ctx.scene.enter("BROADCAST_GROUP_SCENE");
});

bot.hears("📦 Archive", (ctx) => ctx.scene.enter("VIEW_ARCHIVE_SCENE"));
bot.hears("🎨 Creative Stuff", (ctx) => ctx.scene.enter("VIEW_CREATIVE_SCENE"));

bot.hears("➕ Add Archive", (ctx) => {
  if (ctx.state.dbUser?.role === "owner") ctx.scene.enter("ADD_ARCHIVE_SCENE");
});
bot.hears("➕ Add Creative", (ctx) => {
  if (ctx.state.dbUser?.role === "owner") ctx.scene.enter("ADD_CREATIVE_SCENE");
});

bot.hears("❌ Delete Archive", (ctx) => {
  if (ctx.state.dbUser?.role === "owner") ctx.scene.enter("DEL_ARCHIVE_SCENE");
});
bot.hears("❌ Delete Creative", (ctx) => {
  if (ctx.state.dbUser?.role === "owner") ctx.scene.enter("DEL_CREATIVE_SCENE");
});

bot.hears("👑 Promote Admin", (ctx) => {
  if (ctx.state.dbUser?.role === "owner")
    ctx.scene.enter("PROMOTE_ADMIN_SCENE");
});

bot.hears("✏️ Edit Welcome Message", (ctx) => {
  if (ctx.state.dbUser?.role === "owner") ctx.scene.enter("EDIT_WELCOME_SCENE");
});

bot.launch();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

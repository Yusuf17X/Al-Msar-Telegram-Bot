require("dotenv").config({ path: "./config.env" });
const { Telegraf, Scenes, session } = require("telegraf");
const mongoose = require("mongoose");
// FIX: Added Stage to the imports!
const { User, BotSettings, Stage } = require("./models");
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
  editHomeworkWizard,
  editScheduleWizard,
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

// Global User Middleware
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
      name: ctx.from.first_name,
      username: ctx.from.username,
      role: userRole,
    });

    const owners = await User.find({ role: "owner" });
    const usersCount = await User.countDocuments();

    owners.forEach((owner) => {
      if (owner.chatId !== user.chatId) {
        bot.telegram.sendMessage(
          owner.chatId,
          `👤 مستخدم جديد: ${user.name} (@${user.username})\n👥 عدد المستخدمين الكلي: ${usersCount}`,
        );
      }
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
  editHomeworkWizard,
  editScheduleWizard,
]);
bot.use(stage.middleware());

// --- ROUTERS ---
bot.start(async (ctx) => {
  let settings = await timeIt(
    "Fetch Bot Settings: Welcome Message",
    BotSettings.findOne({ singletonId: "default" }),
  );

  if (!settings) {
    // Ensure default values are populated if missing
    settings = await BotSettings.create({ singletonId: "default" });
  }

  // FIX: Added a fallback string in case welcomeMessage is undefined
  const welcomeText =
    settings.welcomeMessage.replace(
      "#الاسم",
      ctx.state.dbUser?.name || ctx.state.dbUser?.username,
    ) || "Welcome to the bot!";
  ctx.reply(welcomeText, mainMenuKeyboard(ctx));
});

bot.command("link", async (ctx) => {
  if (ctx.chat.type === "private") {
    return ctx.reply(
      "⚠️ Please use this command inside your Stage's group chat.",
    );
  }

  const user = ctx.state.dbUser;

  if (user.role !== "admin" && user.role !== "owner") {
    return; // Silently ignore normal users
  }

  if (user.role === "admin" && !user.managedStageId) {
    return ctx.reply(
      "❌ You are an admin, but you haven't been assigned a Stage yet. Contact the Owner.",
    );
  }

  try {
    let stageId = user.managedStageId;

    // FIX: Safely handle the Owner providing a stage ID
    if (user.role === "owner") {
      stageId = ctx.message.text.split(" ")[1];
      if (!stageId) {
        return ctx.reply(
          "⚠️ Owner: Please provide a Stage ID. Usage: `/link <stageId>`",
        );
      }
    }

    const stage = await Stage.findById(stageId);
    if (!stage) return ctx.reply("❌ Stage not found in database.");

    stage.telegramGroupId = ctx.chat.id.toString();
    await stage.save();

    return ctx.reply(
      `✅ Success! This group is now officially linked to **${stage.name}**.`,
    );
  } catch (error) {
    console.error(error);
    return ctx.reply(
      "❌ An error occurred while linking the group. Make sure the Stage ID is valid.",
    );
  }
});

bot.command("suggest", (ctx) => ctx.scene.enter("SUGGEST_SCENE"));

bot.hears("🔝 القائمة الرئيسية", (ctx) =>
  ctx.reply("🔝 القائمة الرئيسية", mainMenuKeyboard(ctx)),
);

bot.hears("📚 المحاضرات", async (ctx) => {
  // FIX: Use the user from middleware instead of doing another DB query
  const user = ctx.state.dbUser;
  if (!user || !user.stageId) ctx.scene.enter("CHOOSE_STAGE_SCENE");
  else ctx.scene.enter("BROWSE_CLASSES_SCENE");
});

bot.hears("🔄 تغيير المرحلة", (ctx) => ctx.scene.enter("CHOOSE_STAGE_SCENE"));

bot.hears("⚙️ Admin", (ctx) => {
  const role = ctx.state.dbUser?.role;
  if (role === "admin" || role === "owner") {
    ctx.reply("⚙️ Admin", adminPanelKeyboard(ctx));
  }
});

bot.hears("➕ اضافة مرحلة", (ctx) => {
  if (ctx.state.dbUser?.role === "owner") ctx.scene.enter("ADD_STAGE_SCENE");
});
bot.hears("➕ اضافة مادة", (ctx) => {
  const role = ctx.state.dbUser?.role;
  if (role === "owner" || role === "admin") ctx.scene.enter("ADD_CLASS_SCENE");
});
bot.hears("➕ اضافة محاضرة", (ctx) => {
  const role = ctx.state.dbUser?.role;
  if (role === "owner" || role === "admin")
    ctx.scene.enter("ADD_LECTURE_SCENE");
});
bot.hears("❌ حذف مرحلة", (ctx) => {
  if (ctx.state.dbUser?.role === "owner") ctx.scene.enter("DEL_STAGE_SCENE");
});
bot.hears("❌ حذف مادة", (ctx) => {
  if (ctx.state.dbUser?.role === "admin" || ctx.state.dbUser?.role === "owner")
    ctx.scene.enter("DEL_CLASS_SCENE");
});
bot.hears("❌ حذف محاضرة", (ctx) => {
  if (ctx.state.dbUser?.role === "admin" || ctx.state.dbUser?.role === "owner")
    ctx.scene.enter("DEL_LECTURE_SCENE");
});

bot.hears("📢 رسالة جماعية", (ctx) => {
  if (ctx.state.dbUser?.role === "owner") ctx.scene.enter("BROADCAST_SCENE");
});
bot.hears("📢 ارسال اعلان للكروب", (ctx) => {
  if (ctx.state.dbUser?.role === "owner" || ctx.state.dbUser?.role === "admin")
    ctx.scene.enter("BROADCAST_GROUP_SCENE");
});

bot.hears("📦 الارشيف", (ctx) => ctx.scene.enter("VIEW_ARCHIVE_SCENE"));
bot.hears("🎨 الادوات المساعدة", (ctx) =>
  ctx.scene.enter("VIEW_CREATIVE_SCENE"),
);

bot.hears("➕ اضافة ارشيف", (ctx) => {
  if (ctx.state.dbUser?.role === "owner") ctx.scene.enter("ADD_ARCHIVE_SCENE");
});
bot.hears("➕ اضافة الادوات المساعدة", (ctx) => {
  if (ctx.state.dbUser?.role === "owner") ctx.scene.enter("ADD_CREATIVE_SCENE");
});

bot.hears("❌ حذف الارشيف", (ctx) => {
  if (ctx.state.dbUser?.role === "owner") ctx.scene.enter("DEL_ARCHIVE_SCENE");
});
bot.hears("❌ حذف الادوات المساعدة", (ctx) => {
  if (ctx.state.dbUser?.role === "owner") ctx.scene.enter("DEL_CREATIVE_SCENE");
});

bot.hears("👑 اضافة ادمن", (ctx) => {
  if (ctx.state.dbUser?.role === "owner")
    ctx.scene.enter("PROMOTE_ADMIN_SCENE");
});

bot.hears("✏️ تعديل الرسالة الترحيبية", (ctx) => {
  if (ctx.state.dbUser?.role === "owner") ctx.scene.enter("EDIT_WELCOME_SCENE");
});

bot.hears("📝 تعديل الواجبات", (ctx) => {
  const role = ctx.state.dbUser?.role;
  if (role === "owner" || role === "admin")
    ctx.scene.enter("EDIT_HOMEWORK_SCENE");
});

bot.hears("📅 تعديل الجدول", (ctx) => {
  const role = ctx.state.dbUser?.role;
  if (role === "owner" || role === "admin")
    ctx.scene.enter("EDIT_SCHEDULE_SCENE");
});

bot.launch();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

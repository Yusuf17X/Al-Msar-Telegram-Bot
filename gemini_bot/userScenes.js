const { Scenes, Markup } = require("telegraf");
const {
  Stage,
  Class,
  Lecture,
  User,
  Archive,
  ArchiveFile,
  Creative,
  CreativeFile,
} = require("./models");
const { timeIt, isCancel, mainMenuKeyboard } = require("./utils");

const chooseStageWizard = new Scenes.WizardScene(
  "CHOOSE_STAGE_SCENE",
  async (ctx) => {
    const stages = await timeIt("DB: Fetch Stages (User)", Stage.find());
    ctx.reply(
      "🎓 Select your Stage/Year:",
      Markup.keyboard([
        ...stages.map((s) => [s.name]),
        ["🔙 Main Menu"],
      ]).resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Main Menu", mainMenuKeyboard(ctx)));
    const stage = await Stage.findOne({ name: ctx.message.text });
    if (!stage) return ctx.reply("Select a valid stage.");

    await timeIt(
      "DB: Update User Stage",
      User.updateOne(
        { chatId: ctx.chat.id.toString() },
        { stageId: stage._id },
      ),
    );
    ctx.reply(`✅ Stage set to ${stage.name}.`);
    return ctx.scene.enter("BROWSE_CLASSES_SCENE");
  },
);

const browseClassesWizard = new Scenes.WizardScene(
  "BROWSE_CLASSES_SCENE",
  async (ctx) => {
    const user = await User.findOne({ chatId: ctx.chat.id.toString() });
    const classes = await timeIt(
      "DB: Fetch Classes (User)",
      Class.find({ stageId: user.stageId }),
    );
    ctx.reply(
      "📚 Choose a class:",
      Markup.keyboard([
        ...classes.map((c) => [c.name]),
        ["🔙 Main Menu"],
      ]).resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Main Menu", mainMenuKeyboard(ctx)));
    const selectedClass = await Class.findOne({ name: ctx.message.text });
    if (!selectedClass) return;

    ctx.wizard.state.classId = selectedClass._id;
    const lectures = await timeIt(
      "DB: Fetch Lectures (User)",
      Lecture.find({ classId: selectedClass._id }),
    );
    ctx.reply(
      "📄 Select a lecture to download:",
      Markup.keyboard([
        ...lectures.map((l) => [l.title]),
        ["🔙 Back to Classes", "🔙 Main Menu"],
      ]).resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    const text = ctx.message?.text;
    if (isCancel(text))
      return ctx.scene.leave(ctx.reply("Main Menu", mainMenuKeyboard(ctx)));
    if (text === "🔙 Back to Classes")
      return ctx.scene.enter("BROWSE_CLASSES_SCENE");

    const lecture = await Lecture.findOne({
      classId: ctx.wizard.state.classId,
      title: text,
    });
    if (!lecture) return;

    // 1. Capture the loading message
    const statusMsg = await ctx.reply(`⏳ Sending ${lecture.title}...`);

    await timeIt(
      `TG: Send file ${lecture.title}`,
      ctx.telegram.sendDocument(ctx.chat.id, lecture.fileId, {
        caption: lecture.title,
      }),
    );

    // 2. Delete the loading message once finished
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
    } catch (e) {}
  },
);

// --- VIEW ARCHIVE SCENE ---
const viewArchiveWizard = new Scenes.WizardScene(
  "VIEW_ARCHIVE_SCENE",
  async (ctx) => {
    const archives = await timeIt("DB: Fetch Archives", Archive.find());
    if (archives.length === 0)
      return ctx.scene.leave(
        ctx.reply("No archives available.", mainMenuKeyboard(ctx)),
      );

    ctx.reply(
      "📦 Select an Archive:",
      Markup.keyboard([
        ...archives.map((a) => [a.name]),
        ["🔙 Main Menu"],
      ]).resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Main Menu", mainMenuKeyboard(ctx)));

    const archive = await Archive.findOne({ name: ctx.message.text });
    if (!archive) return;

    const files = await ArchiveFile.find({ archiveId: archive._id });
    if (files.length === 0) return ctx.reply("This archive is empty.");

    ctx.reply(`⏳ Sending ${files.length} files from ${archive.name}...`);
    for (const file of files) {
      try {
        await ctx.telegram.sendDocument(ctx.chat.id, file.fileId);
      } catch (e) {
        await ctx.telegram.sendPhoto(ctx.chat.id, file.fileId).catch(() => {});
      } // Fallback if it's an image
    }
  },
);

// --- VIEW CREATIVE SCENE ---
const viewCreativeWizard = new Scenes.WizardScene(
  "VIEW_CREATIVE_SCENE",
  async (ctx) => {
    const creatives = await timeIt("DB: Fetch Creatives", Creative.find());
    if (creatives.length === 0)
      return ctx.scene.leave(
        ctx.reply("No creative topics available.", mainMenuKeyboard(ctx)),
      );

    ctx.reply(
      "🎨 Select a Creative topic:",
      Markup.keyboard([
        ...creatives.map((c) => [c.name]),
        ["🔙 Main Menu"],
      ]).resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Main Menu", mainMenuKeyboard(ctx)));

    const creative = await Creative.findOne({ name: ctx.message.text });
    if (!creative) return;

    // Send the text message first (we keep this one permanently)
    await ctx.reply(`🎨 **${creative.name}**\n\n${creative.text}`);

    const files = await CreativeFile.find({ creativeId: creative._id });
    if (files.length > 0) {
      // 1. Capture the loading message
      const statusMsg = await ctx.reply(`⏳ Sending attached files...`);

      for (const file of files) {
        try {
          await ctx.telegram.sendDocument(ctx.chat.id, file.fileId);
        } catch (e) {
          await ctx.telegram
            .sendPhoto(ctx.chat.id, file.fileId)
            .catch(() => {});
        }
      }

      // 2. Delete the loading message once finished
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
      } catch (e) {}
    }
  },
);

module.exports = {
  chooseStageWizard,
  browseClassesWizard,
  viewArchiveWizard,
  viewCreativeWizard,
};

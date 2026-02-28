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
    if (isCancel(ctx.message?.text)) {
      await ctx.reply("Main Menu", mainMenuKeyboard(ctx));
      return ctx.scene.leave();
    }
    const stage = await Stage.findOne({ name: ctx.message.text });
    if (!stage)
      return ctx.reply("⚠️ Please select a valid stage from the keyboard.");

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

  // STEP 1: Show Classes + Optional Homework/Schedule Buttons
  async (ctx) => {
    const user = await User.findOne({ chatId: ctx.chat.id.toString() });
    if (!user || !user.stageId) {
      await ctx.reply(
        "⚠️ You haven't selected a stage yet.",
        mainMenuKeyboard(ctx),
      );
      return ctx.scene.leave();
    }

    // Fetch the Stage to check for Homework/Schedule
    const stage = await Stage.findById(user.stageId);

    if (!stage) {
      await ctx.reply(
        "⚠️ Your selected stage was not found. Please choose again.",
        mainMenuKeyboard(ctx),
      );
      return ctx.scene.leave();
    }

    ctx.wizard.state.stage = stage; // Save for the next step

    const classes = await timeIt(
      "DB: Fetch Classes (User)",
      Class.find({ stageId: user.stageId }),
    );

    const buttons = classes.map((c) => [c.name]);

    // --- Inject Homework/Schedule if they exist ---
    const updatesRow = [];
    if (stage.homeworkText) updatesRow.push("📝 Homework");
    if (stage.scheduleImageId) updatesRow.push("📅 Schedule");

    if (updatesRow.length > 0) {
      buttons.unshift(updatesRow); // Put them at the very top
    }

    buttons.push(["🔙 Main Menu"]);

    ctx.reply(
      "📚 Choose a class or view updates:",
      Markup.keyboard(buttons).resize(),
    );
    return ctx.wizard.next();
  },

  // STEP 2: Handle Class Click OR Homework/Schedule Clicks
  async (ctx) => {
    const text = ctx.message?.text;
    if (isCancel(text)) {
      await ctx.reply("Main Menu", mainMenuKeyboard(ctx));
      return ctx.scene.leave();
    }

    const stage = ctx.wizard.state.stage;

    // --- Intercept Homework/Schedule Clicks (Stay in Step 2) ---
    if (text === "📝 Homework" && stage.homeworkText) {
      await ctx.reply(`📝 **Homework Updates:**\n\n${stage.homeworkText}`);
      return;
    }
    if (text === "📅 Schedule" && stage.scheduleImageId) {
      await ctx.telegram.sendPhoto(ctx.chat.id, stage.scheduleImageId, {
        caption: "📅 Current Schedule",
      });
      return;
    }

    // --- Process Class Selection ---
    const selectedClass = await Class.findOne({
      name: text,
      stageId: stage._id,
    });
    if (!selectedClass)
      return ctx.reply("⚠️ Please select a valid option from the keyboard.");

    ctx.wizard.state.classId = selectedClass._id;

    const lectures = await timeIt(
      "DB: Fetch Lectures (User)",
      Lecture.find({ classId: selectedClass._id }),
    );

    // Split lectures by category
    const theoryLectures = lectures.filter((l) => l.category !== "lab");
    const labLectures = lectures.filter((l) => l.category === "lab");

    // Save them to state so Step 3 can use them to build the folders
    ctx.wizard.state.theoryLectures = theoryLectures;
    ctx.wizard.state.labLectures = labLectures;

    const lectureButtons = theoryLectures.map((l) => [l.title]);

    // Add the Lab Folder button if labs exist
    if (labLectures.length > 0) {
      lectureButtons.unshift(["🔬 Lab Lectures"]);
    }

    lectureButtons.push(["🔙 Back to Classes", "🔙 Main Menu"]);

    ctx.reply(
      `📖 **${selectedClass.name}**\n\nSelect a lecture:`,
      Markup.keyboard(lectureButtons).resize(),
    );
    return ctx.wizard.next();
  },

  // STEP 3: Handle Lecture Download OR Lab Folder Navigation
  async (ctx) => {
    const text = ctx.message?.text;
    if (isCancel(text)) {
      await ctx.reply("Main Menu", mainMenuKeyboard(ctx));
      return ctx.scene.leave();
    }

    if (text === "🔙 Back to Classes")
      return ctx.scene.enter("BROWSE_CLASSES_SCENE");

    // --- Intercept "Back to Lectures" (Navigating out of the Lab folder) ---
    if (text === "🔙 Back to Lectures") {
      const theoryButtons = ctx.wizard.state.theoryLectures.map((l) => [
        l.title,
      ]);
      if (ctx.wizard.state.labLectures.length > 0)
        theoryButtons.unshift(["🔬 Lab Lectures"]);
      theoryButtons.push(["🔙 Back to Classes", "🔙 Main Menu"]);

      await ctx.reply(
        "📖 Main Lectures:",
        Markup.keyboard(theoryButtons).resize(),
      );
      return; // Stay in Step 3
    }

    // --- Intercept Lab Folder Click (Navigating into the Lab folder) ---
    if (
      text === "🔬 Lab Lectures" &&
      ctx.wizard.state.labLectures?.length > 0
    ) {
      const labButtons = ctx.wizard.state.labLectures.map((l) => [l.title]);
      labButtons.push(["🔙 Back to Lectures", "🔙 Main Menu"]);

      await ctx.reply(
        "🔬 **Lab Lectures:**\n\nSelect a lab:",
        Markup.keyboard(labButtons).resize(),
      );
      return; // Stay in Step 3
    }

    // --- Process Lecture Download ---
    const lecture = await Lecture.findOne({
      classId: ctx.wizard.state.classId,
      title: text,
    });

    if (!lecture) return ctx.reply("⚠️ Please select a valid lecture.");

    const statusMsg = await ctx.reply(`⏳ Sending ${lecture.title}...`);

    try {
      await timeIt(
        `TG: Send file ${lecture.title}`,
        ctx.telegram.sendDocument(ctx.chat.id, lecture.fileId, {
          caption: lecture.title,
        }),
      );
    } catch (err) {
      console.error(err);
      await ctx.reply("❌ Failed to send file.");
    }

    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
    } catch (e) {}

    // No exit here so they can click and download multiple lectures in a row!
  },
);

// --- VIEW ARCHIVE SCENE ---
const viewArchiveWizard = new Scenes.WizardScene(
  "VIEW_ARCHIVE_SCENE",
  async (ctx) => {
    const archives = await timeIt("DB: Fetch Archives", Archive.find());
    if (archives.length === 0) {
      await ctx.reply("No archives available.", mainMenuKeyboard(ctx));
      return ctx.scene.leave();
    }

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
    if (isCancel(ctx.message?.text)) {
      await ctx.reply("Main Menu", mainMenuKeyboard(ctx));
      return ctx.scene.leave();
    }

    const archive = await Archive.findOne({ name: ctx.message.text });
    if (!archive) return ctx.reply("⚠️ Please select a valid archive."); // FIX: Added reply

    const files = await ArchiveFile.find({ archiveId: archive._id });
    if (files.length === 0) {
      await ctx.reply("⚠️ This archive is empty.", mainMenuKeyboard(ctx));
      return ctx.scene.leave(); // FIX: Exit scene if empty
    }

    ctx.reply(`⏳ Sending ${files.length} files from ${archive.name}...`);
    for (const file of files) {
      try {
        await ctx.telegram.sendDocument(ctx.chat.id, file.fileId);
      } catch (e) {
        await ctx.telegram.sendPhoto(ctx.chat.id, file.fileId).catch(() => {});
      }
    }

    await ctx.reply("✅ All files sent.", mainMenuKeyboard(ctx));
    return ctx.scene.leave(); // FIX: Exit scene so user doesn't get trapped
  },
);

// --- VIEW CREATIVE SCENE ---
const viewCreativeWizard = new Scenes.WizardScene(
  "VIEW_CREATIVE_SCENE",
  async (ctx) => {
    const creatives = await timeIt("DB: Fetch Creatives", Creative.find());
    if (creatives.length === 0) {
      await ctx.reply("No creative topics available.", mainMenuKeyboard(ctx));
      return ctx.scene.leave();
    }

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
    if (isCancel(ctx.message?.text)) {
      await ctx.reply("Main Menu", mainMenuKeyboard(ctx));
      return ctx.scene.leave();
    }

    const creative = await Creative.findOne({ name: ctx.message.text });
    if (!creative) return ctx.reply("⚠️ Please select a valid creative topic."); // FIX: Added reply

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

    await ctx.reply("✅ Finished.", mainMenuKeyboard(ctx));
    return ctx.scene.leave(); // FIX: Exit scene so user doesn't get trapped
  },
);

const suggestWizard = new Scenes.WizardScene(
  "SUGGEST_SCENE",
  async (ctx) => {
    ctx.reply(
      "💡 Have a suggestion to improve the bot or want to contribute? Please share your ideas here!",
      Markup.keyboard([["🔙 Main Menu"]]).resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (isCancel(ctx.message?.text)) {
      await ctx.reply("Main Menu", mainMenuKeyboard(ctx));
      return ctx.scene.leave();
    }

    const suggestion = ctx.message.text;

    const adminId = process.env.ADMIN_ID;

    await ctx.telegram.sendMessage(
      adminId,
      `💡 New suggestion from ${ctx.from.first_name || ctx.from.username || ctx.from.id} (@${ctx.from.username}):\n\n${suggestion}`,
    );

    ctx.reply("✅ Thanks for your suggestion!", mainMenuKeyboard(ctx));
    return ctx.scene.leave();
  },
);

module.exports = {
  chooseStageWizard,
  browseClassesWizard,
  viewArchiveWizard,
  viewCreativeWizard,
  suggestWizard,
};

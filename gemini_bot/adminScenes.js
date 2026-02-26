const { Scenes, Markup } = require("telegraf");
const { Stage, Class, Lecture, User } = require("./models");
const {
  timeIt,
  isCancel,
  mainMenuKeyboard,
  adminPanelKeyboard,
} = require("./utils");

const addStageWizard = new Scenes.WizardScene(
  "ADD_STAGE_SCENE",
  (ctx) => {
    ctx.reply(
      "✍️ Type the name of the new Stage:",
      Markup.keyboard([["❌ Cancel"]]).resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));
    await timeIt("DB: Create Stage", Stage.create({ name: ctx.message.text }));
    ctx.reply(`✅ Stage "${ctx.message.text}" created!`, adminPanelKeyboard);
    return ctx.scene.leave();
  },
);

const addClassWizard = new Scenes.WizardScene(
  "ADD_CLASS_SCENE",
  async (ctx) => {
    const stages = await timeIt("DB: Fetch Stages", Stage.find());
    const buttons = stages.map((s) => [s.name]);
    buttons.push(["❌ Cancel"]);
    ctx.reply(
      "Select the Stage for this class:",
      Markup.keyboard(buttons).resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));
    const stage = await Stage.findOne({ name: ctx.message.text });
    if (!stage) return ctx.reply("Select a valid stage from the keyboard.");

    ctx.wizard.state.stageId = stage._id;
    ctx.reply(
      "✍️ Type the name of the new Class:",
      Markup.keyboard([["❌ Cancel"]]).resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));
    await timeIt(
      "DB: Create Class",
      Class.create({
        name: ctx.message.text,
        stageId: ctx.wizard.state.stageId,
      }),
    );
    ctx.reply(`✅ Class created!`, adminPanelKeyboard);
    return ctx.scene.leave();
  },
);
const addLectureWizard = new Scenes.WizardScene(
  "ADD_LECTURE_SCENE",
  // Step 1: Select Stage
  async (ctx) => {
    const stages = await timeIt("DB: Fetch Stages", Stage.find());
    if (stages.length === 0)
      return ctx.scene.leave(ctx.reply("No stages exist.", adminPanelKeyboard));

    ctx.reply(
      "Select the Stage:",
      Markup.keyboard([...stages.map((s) => [s.name]), ["❌ Cancel"]]).resize(),
    );
    return ctx.wizard.next();
  },
  // Step 2: Select Class
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));

    const stage = await Stage.findOne({ name: ctx.message.text });
    if (!stage)
      return ctx.reply("⚠️ Please select a valid stage from the keyboard.");

    const classes = await timeIt(
      "DB: Fetch Classes",
      Class.find({ stageId: stage._id }),
    );
    if (classes.length === 0)
      return ctx.scene.leave(
        ctx.reply("No classes in this stage.", adminPanelKeyboard),
      );

    ctx.reply(
      "Select the Class:",
      Markup.keyboard([
        ...classes.map((c) => [c.name]),
        ["❌ Cancel"],
      ]).resize(),
    );
    return ctx.wizard.next();
  },
  // Step 3: Initialize File Queue
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));

    const selectedClass = await Class.findOne({ name: ctx.message.text });
    if (!selectedClass)
      return ctx.reply("⚠️ Please select a valid class from the keyboard.");

    ctx.wizard.state.classId = selectedClass._id;
    ctx.wizard.state.files = []; // Initialize the queue

    ctx.reply(
      "📎 Send your lecture files (PDF/PPTX). You can send multiple!\n\nClick '✅ Done' when you are finished.",
      Markup.keyboard([["✅ Done"], ["❌ Cancel"]]).resize(),
    );
    return ctx.wizard.next();
  },
  // Step 4: Process File Queue
  async (ctx) => {
    const text = ctx.message?.text;
    if (isCancel(text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));

    // 1. If the user sends a document, add to queue and confirm
    if (ctx.message?.document) {
      ctx.wizard.state.files.push(ctx.message);
      const fileName = ctx.message.document.file_name || "Unknown File";
      // Brief reply so you know it didn't freeze
      ctx.reply(`📥 Added to queue: ${fileName}`);
      return;
    }

    // 2. If the user clicks "Done", process the queue
    if (text === "✅ Done") {
      if (ctx.wizard.state.files.length === 0) {
        return ctx.reply(
          "⚠️ You haven't sent any files yet! Send a file or click Cancel.",
        );
      }

      // Correctly remove keyboard without crashing
      ctx.reply(
        `⏳ Processing ${ctx.wizard.state.files.length} files... Please wait.`,
        Markup.removeKeyboard(),
      );

      // Sort by message_id to guarantee the exact chronological order
      const sortedFiles = ctx.wizard.state.files.sort(
        (a, b) => a.message_id - b.message_id,
      );

      for (const msg of sortedFiles) {
        const doc = msg.document;
        const fileName = doc.file_name || "Unknown";
        const title =
          fileName.lastIndexOf(".") !== -1
            ? fileName.substring(0, fileName.lastIndexOf("."))
            : fileName;

        try {
          const channelMsg = await timeIt(
            `TG: Send ${title} to Channel`,
            ctx.telegram.sendDocument(process.env.CHANNEL_ID, doc.file_id, {
              caption: `Lecture: ${title}`,
            }),
          );

          await timeIt(
            `DB: Save ${title}`,
            Lecture.create({
              title: title,
              classId: ctx.wizard.state.classId,
              fileId: channelMsg.document.file_id,
              fileType: fileName.toLowerCase().endsWith(".pdf")
                ? "pdf"
                : "pptx",
              channelMsgId: channelMsg.message_id,
            }),
          );
          ctx.reply(`✅ Saved: ${title}`);
        } catch (error) {
          console.error(error);
          ctx.reply(`❌ Error saving: ${fileName}`);
        }
      }
      ctx.reply("✅ All uploads finished.", adminPanelKeyboard);
      return ctx.scene.leave();
    }

    // 3. Catch-all for invalid inputs (like sending a photo or sticker by accident)
    ctx.reply("⚠️ Please send a PDF/PPTX document, or click '✅ Done'.");
  },
);

// --- DELETE WIZARDS ---

const delStageWizard = new Scenes.WizardScene(
  "DEL_STAGE_SCENE",
  async (ctx) => {
    const stages = await timeIt("DB: Fetch Stages", Stage.find());
    if (stages.length === 0)
      return ctx.scene.leave(
        ctx.reply("No stages to delete.", adminPanelKeyboard),
      );

    ctx.reply(
      "⚠️ Select a Stage to PERMANENTLY delete (this deletes ALL classes and lectures inside it):",
      Markup.keyboard([...stages.map((s) => [s.name]), ["❌ Cancel"]]).resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));
    const stage = await Stage.findOne({ name: ctx.message.text });
    if (!stage) return ctx.reply("Select a valid stage.");

    ctx.reply("⏳ Deleting stage and cleaning up files...");

    // Cascade delete: find all classes in this stage
    const classes = await Class.find({ stageId: stage._id });
    for (const c of classes) {
      const lectures = await Lecture.find({ classId: c._id });
      for (const l of lectures) {
        try {
          await ctx.telegram.deleteMessage(
            process.env.CHANNEL_ID,
            l.channelMsgId,
          );
        } catch (e) {} // Delete from channel
      }
      await Lecture.deleteMany({ classId: c._id }); // Delete lectures from DB
    }
    await Class.deleteMany({ stageId: stage._id }); // Delete classes from DB
    await Stage.findByIdAndDelete(stage._id); // Delete stage from DB

    ctx.reply(
      `✅ Stage "${stage.name}" and all its contents completely deleted.`,
      adminPanelKeyboard,
    );
    return ctx.scene.leave();
  },
);

const delClassWizard = new Scenes.WizardScene(
  "DEL_CLASS_SCENE",
  async (ctx) => {
    const stages = await timeIt("DB: Fetch Stages", Stage.find());
    ctx.reply(
      "Select the Stage containing the Class to delete:",
      Markup.keyboard([...stages.map((s) => [s.name]), ["❌ Cancel"]]).resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));
    const stage = await Stage.findOne({ name: ctx.message.text });
    if (!stage) return;

    const classes = await timeIt(
      "DB: Fetch Classes",
      Class.find({ stageId: stage._id }),
    );
    if (classes.length === 0)
      return ctx.scene.leave(ctx.reply("No classes here.", adminPanelKeyboard));

    ctx.reply(
      "⚠️ Select the Class to PERMANENTLY delete (removes all its lectures):",
      Markup.keyboard([
        ...classes.map((c) => [c.name]),
        ["❌ Cancel"],
      ]).resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));
    const selectedClass = await Class.findOne({ name: ctx.message.text });
    if (!selectedClass) return;

    ctx.reply("⏳ Deleting class and cleaning up files...");

    const lectures = await Lecture.find({ classId: selectedClass._id });
    for (const l of lectures) {
      try {
        await ctx.telegram.deleteMessage(
          process.env.CHANNEL_ID,
          l.channelMsgId,
        );
      } catch (e) {}
    }
    await Lecture.deleteMany({ classId: selectedClass._id });
    await Class.findByIdAndDelete(selectedClass._id);

    ctx.reply(
      `✅ Class "${selectedClass.name}" and all its files deleted.`,
      adminPanelKeyboard,
    );
    return ctx.scene.leave();
  },
);

const delLectureWizard = new Scenes.WizardScene(
  "DEL_LECTURE_SCENE",
  async (ctx) => {
    const stages = await timeIt("DB: Fetch Stages", Stage.find());
    ctx.reply(
      "Select the Stage:",
      Markup.keyboard([...stages.map((s) => [s.name]), ["❌ Cancel"]]).resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));
    const stage = await Stage.findOne({ name: ctx.message.text });
    if (!stage) return;

    const classes = await timeIt(
      "DB: Fetch Classes",
      Class.find({ stageId: stage._id }),
    );
    ctx.reply(
      "Select the Class:",
      Markup.keyboard([
        ...classes.map((c) => [c.name]),
        ["❌ Cancel"],
      ]).resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));
    const selectedClass = await Class.findOne({ name: ctx.message.text });
    if (!selectedClass) return;

    const lectures = await timeIt(
      "DB: Fetch Lectures",
      Lecture.find({ classId: selectedClass._id }),
    );
    if (lectures.length === 0)
      return ctx.scene.leave(
        ctx.reply("No lectures here.", adminPanelKeyboard),
      );

    ctx.reply(
      "❌ Select the Lecture to delete:",
      Markup.keyboard([
        ...lectures.map((l) => [l.title]),
        ["❌ Cancel"],
      ]).resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));
    const lecture = await Lecture.findOne({ title: ctx.message.text });
    if (!lecture) return;

    try {
      await ctx.telegram.deleteMessage(
        process.env.CHANNEL_ID,
        lecture.channelMsgId,
      );
    } catch (e) {}
    await Lecture.findByIdAndDelete(lecture._id);

    ctx.reply(`✅ Lecture deleted.`, adminPanelKeyboard);
    return ctx.scene.leave();
  },
);

// --- BROADCAST WIZARD ---

const broadcastWizard = new Scenes.WizardScene(
  "BROADCAST_SCENE",
  (ctx) => {
    ctx.reply(
      "📢 Type the message you want to broadcast to ALL users:",
      Markup.keyboard([["❌ Cancel"]]).resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(
        ctx.reply("Broadcast cancelled.", adminPanelKeyboard),
      );

    const users = await User.find();
    let sent = 0;
    ctx.reply(`⏳ Broadcasting to ${users.length} users...`);

    for (const user of users) {
      try {
        await ctx.telegram.sendMessage(
          user.chatId,
          `📢 **Admin Announcement**\n\n${ctx.message.text}`,
        );
        sent++;
      } catch (err) {
        // User might have blocked the bot
      }
    }
    ctx.reply(
      `✅ Broadcast finished. Reached ${sent}/${users.length} users.`,
      adminPanelKeyboard,
    );
    return ctx.scene.leave();
  },
);

// UPDATE YOUR EXPORTS AT THE BOTTOM:
module.exports = {
  addStageWizard,
  addClassWizard,
  addLectureWizard,
  delStageWizard,
  delClassWizard,
  delLectureWizard,
  broadcastWizard,
};

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
  // Step 0: The Routing Step
  async (ctx) => {
    const user = ctx.state.dbUser;

    if (user.role === "admin") {
      // ADMIN FLOW: Skip stage selection
      const stage = await Stage.findById(user.managedStageId);
      if (!stage)
        return ctx.scene.leave(
          ctx.reply("❌ Error: No stage assigned to you.", adminPanelKeyboard),
        );

      ctx.wizard.state.stageId = stage._id;
      const classes = await Class.find({ stageId: stage._id });

      ctx.reply(
        `✅ Adding to **${stage.name}**.\n\nSelect the Class:`,
        Markup.keyboard([
          ...classes.map((c) => [c.name]),
          ["❌ Cancel"],
        ]).resize(),
      );

      // Jump directly to Step 2 (skipping Step 1)
      ctx.wizard.selectStep(2);
      return;
    } else {
      // OWNER FLOW: Ask for the Stage
      const stages = await Stage.find();
      ctx.reply(
        "Select the Stage:",
        Markup.keyboard([
          ...stages.map((s) => [s.name]),
          ["❌ Cancel"],
        ]).resize(),
      );
      return ctx.wizard.next(); // Go to Step 1 normally
    }
  },
  // Step 1: Owner Only - Process Stage Selection
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));

    const stage = await Stage.findOne({ name: ctx.message.text });
    if (!stage) return ctx.reply("⚠️ Please select a valid stage.");

    ctx.wizard.state.stageId = stage._id;
    const classes = await Class.find({ stageId: stage._id });

    ctx.reply(
      "Select the Class:",
      Markup.keyboard([
        ...classes.map((c) => [c.name]),
        ["❌ Cancel"],
      ]).resize(),
    );
    return ctx.wizard.next(); // Go to Step 2
  },
  // Step 2: Both Admin and Owner end up here to select the Class
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));

    // Notice we check by stageId to ensure they don't type a class from another stage
    const selectedClass = await Class.findOne({
      name: ctx.message.text,
      stageId: ctx.wizard.state.stageId,
    });
    if (!selectedClass)
      return ctx.reply("⚠️ Please select a valid class from the keyboard.");

    ctx.wizard.state.classId = selectedClass._id;
    ctx.wizard.state.files = [];

    ctx.reply(
      "📎 Send your lecture files (PDF/PPTX). Click '✅ Done' when finished.",
      Markup.keyboard([["✅ Done"], ["❌ Cancel"]]).resize(),
    );
    return ctx.wizard.next(); // Go to Step 3 (The file queue loop you already wrote)
  },
  // Step 3: Initialize File Queue
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));

    const selectedClass = await Class.findOne({ name: ctx.message.text });
    if (!selectedClass)
      return ctx.reply("⚠️ Please select a valid class from the keyboard.");

    ctx.wizard.state.classId = selectedClass._id;
    ctx.wizard.state.files = [];

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

      try {
        const stage = await Stage.findById(ctx.wizard.state.stageId);
        const classObj = await Class.findById(ctx.wizard.state.classId);

        // Check if this stage actually has a linked Telegram group
        if (stage && stage.telegramGroupId) {
          const message = `📢 **New Study Material Added!**\n\n📚 **Class:** ${classObj.name}\n📎 **Files Uploaded:** ${ctx.wizard.state.files.length}\n\n👉 Open the bot to download!`;

          await ctx.telegram.sendMessage(stage.telegramGroupId, message);
        }
      } catch (error) {
        console.log(
          "Group notification failed (Bot might have been kicked):",
          error,
        );
        // We catch the error silently so it doesn't crash the bot if the group is deleted
      }

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

// --- ADD ARCHIVE WIZARD ---
const addArchiveWizard = new Scenes.WizardScene(
  "ADD_ARCHIVE_SCENE",
  (ctx) => {
    ctx.reply(
      "📦 Type the name of the new Archive category:",
      Markup.keyboard([["❌ Cancel"]]).resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));

    try {
      const archive = await timeIt(
        "DB: Create Archive",
        Archive.create({ name: ctx.message.text }),
      );
      ctx.wizard.state.archiveId = archive._id;
      ctx.wizard.state.files = [];

      ctx.reply(
        `✅ Archive "${archive.name}" created.\n\n📎 Send all files for this archive, then click '✅ Done'.`,
        Markup.keyboard([["✅ Done"], ["❌ Cancel"]]).resize(),
      );
      return ctx.wizard.next();
    } catch (e) {
      return ctx.reply(
        "❌ Error: Archive name might already exist. Try another name or click Cancel.",
      );
    }
  },
  async (ctx) => {
    const text = ctx.message?.text;
    if (isCancel(text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));

    if (ctx.message?.document || ctx.message?.photo || ctx.message?.video) {
      ctx.wizard.state.files.push(ctx.message);
      ctx.reply(`📥 Added to archive queue.`);
      return;
    }

    if (text === "✅ Done") {
      if (ctx.wizard.state.files.length === 0)
        return ctx.reply("⚠️ Send files first!");

      // 1. Capture the loading message
      const statusMsg = await ctx.reply(
        `⏳ Saving ${ctx.wizard.state.files.length} archive files...`,
        Markup.removeKeyboard(),
      );

      const sortedFiles = ctx.wizard.state.files.sort(
        (a, b) => a.message_id - b.message_id,
      );

      for (const msg of sortedFiles) {
        // ... your existing upload and database save logic ...
      }

      // 2. Delete the loading message and send the final confirmation
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
      } catch (e) {}
      ctx.reply("✅ Archive upload finished.", adminPanelKeyboard);

      return ctx.scene.leave();
    }
    ctx.reply("⚠️ Please send a file or click '✅ Done'.");
  },
);

// --- ADD CREATIVE WIZARD ---
const addCreativeWizard = new Scenes.WizardScene(
  "ADD_CREATIVE_SCENE",
  (ctx) => {
    ctx.reply(
      "🎨 Type the title of the Creative topic (e.g., 'Good Presentation'):",
      Markup.keyboard([["❌ Cancel"]]).resize(),
    );
    return ctx.wizard.next();
  },
  (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));
    ctx.wizard.state.creativeName = ctx.message.text;

    ctx.reply("✍️ Now, send the text message/description for this topic:");
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));

    try {
      // 1. Send text to channel
      const channelMsg = await ctx.telegram.sendMessage(
        process.env.CHANNEL_ID,
        `🎨 **${ctx.wizard.state.creativeName}**\n\n${ctx.message.text}`,
      );
      // 2. Save to DB
      const creative = await timeIt(
        "DB: Create Creative",
        Creative.create({
          name: ctx.wizard.state.creativeName,
          text: ctx.message.text,
          channelMsgId: channelMsg.message_id,
        }),
      );

      ctx.wizard.state.creativeId = creative._id;
      ctx.wizard.state.files = [];

      ctx.reply(
        "✅ Text saved.\n\n📎 Now send any attached files/images for this topic, then click '✅ Done'.",
        Markup.keyboard([["✅ Done"], ["❌ Cancel"]]).resize(),
      );
      return ctx.wizard.next();
    } catch (e) {
      return ctx.reply("❌ Error saving text. Try again or Cancel.");
    }
  },
  async (ctx) => {
    const text = ctx.message?.text;
    if (isCancel(text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));

    if (ctx.message?.document || ctx.message?.photo || ctx.message?.video) {
      ctx.wizard.state.files.push(ctx.message);
      ctx.reply(`📥 Added to creative queue.`);
      return;
    }

    if (text === "✅ Done") {
      ctx.reply(
        `⏳ Saving ${ctx.wizard.state.files.length} creative files...`,
        Markup.removeKeyboard(),
      );
      const sortedFiles = ctx.wizard.state.files.sort(
        (a, b) => a.message_id - b.message_id,
      );

      for (const msg of sortedFiles) {
        let fileId, title;
        if (msg.document) {
          fileId = msg.document.file_id;
          title = msg.document.file_name || "Document";
        } else if (msg.photo) {
          fileId = msg.photo[msg.photo.length - 1].file_id;
          title = "Photo";
        } else if (msg.video) {
          fileId = msg.video.file_id;
          title = "Video";
        }

        try {
          const channelMsg = await ctx.telegram.sendCopy(
            process.env.CHANNEL_ID,
            msg,
          );
          await CreativeFile.create({
            creativeId: ctx.wizard.state.creativeId,
            fileId: fileId,
            title: title,
            channelMsgId: channelMsg.message_id,
          });
        } catch (error) {}
      }
      ctx.reply("✅ Creative topic fully saved.", adminPanelKeyboard);
      return ctx.scene.leave();
    }
    ctx.reply("⚠️ Please send a file or click '✅ Done'.");
  },
);

// --- DELETE ARCHIVE WIZARD ---
const delArchiveWizard = new Scenes.WizardScene(
  "DEL_ARCHIVE_SCENE",
  async (ctx) => {
    const archives = await timeIt("DB: Fetch Archives", Archive.find());
    if (archives.length === 0)
      return ctx.scene.leave(
        ctx.reply("No archives to delete.", adminPanelKeyboard),
      );

    ctx.reply(
      "⚠️ Select an Archive to PERMANENTLY delete (this deletes all its files):",
      Markup.keyboard([
        ...archives.map((a) => [a.name]),
        ["❌ Cancel"],
      ]).resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));
    const archive = await Archive.findOne({ name: ctx.message.text });
    if (!archive) return ctx.reply("Select a valid archive.");

    // 1. Capture the loading message
    const statusMsg = await ctx.reply(
      "⏳ Deleting archive and cleaning up files...",
    );

    const files = await ArchiveFile.find({ archiveId: archive._id });
    for (const f of files) {
      try {
        await ctx.telegram.deleteMessage(
          process.env.CHANNEL_ID,
          f.channelMsgId,
        );
      } catch (e) {}
    }
    await ArchiveFile.deleteMany({ archiveId: archive._id });
    await Archive.findByIdAndDelete(archive._id);

    // 2. Delete the loading message and send the final confirmation
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
    } catch (e) {}
    ctx.reply(
      `✅ Archive "${archive.name}" and all its files deleted.`,
      adminPanelKeyboard,
    );

    return ctx.scene.leave();
  },
);

// --- DELETE CREATIVE WIZARD ---
const delCreativeWizard = new Scenes.WizardScene(
  "DEL_CREATIVE_SCENE",
  async (ctx) => {
    const creatives = await timeIt("DB: Fetch Creatives", Creative.find());
    if (creatives.length === 0)
      return ctx.scene.leave(
        ctx.reply("No creative topics to delete.", adminPanelKeyboard),
      );

    ctx.reply(
      "⚠️ Select a Creative topic to PERMANENTLY delete (this deletes text and files):",
      Markup.keyboard([
        ...creatives.map((c) => [c.name]),
        ["❌ Cancel"],
      ]).resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));
    const creative = await Creative.findOne({ name: ctx.message.text });
    if (!creative) return ctx.reply("Select a valid creative topic.");

    ctx.reply("⏳ Deleting creative topic and cleaning up files...");

    // 1. Delete the main text message from the channel
    try {
      await ctx.telegram.deleteMessage(
        process.env.CHANNEL_ID,
        creative.channelMsgId,
      );
    } catch (e) {}

    // 2. Cascade delete all attached files from channel and DB
    const files = await CreativeFile.find({ creativeId: creative._id });
    for (const f of files) {
      try {
        await ctx.telegram.deleteMessage(
          process.env.CHANNEL_ID,
          f.channelMsgId,
        );
      } catch (e) {}
    }
    await CreativeFile.deleteMany({ creativeId: creative._id });
    await Creative.findByIdAndDelete(creative._id);

    ctx.reply(
      `✅ Creative topic "${creative.name}" and all its files deleted.`,
      adminPanelKeyboard,
    );
    return ctx.scene.leave();
  },
);

const promoteAdminWizard = new Scenes.WizardScene(
  "PROMOTE_ADMIN_SCENE",
  // Step 0: Ask for User ID
  (ctx) => {
    ctx.reply(
      "👑 **Promote Stage Admin**\n\nPlease send the Telegram Chat ID of the user you want to promote.\n*(They can get their ID by messaging @userinfobot)*",
      Markup.keyboard([["❌ Cancel"]]).resize(),
    );
    return ctx.wizard.next();
  },
  // Step 1: Verify User & Ask for Stage
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));

    const targetUserId = parseInt(ctx.message.text);
    if (isNaN(targetUserId))
      return ctx.reply("⚠️ Please send a valid numeric ID.");

    const targetUser = await User.findOne({ chatId: targetUserId });
    if (!targetUser)
      return ctx.reply(
        "❌ User not found in database. They must start the bot first.",
      );

    ctx.wizard.state.targetUserId = targetUser._id;

    const stages = await Stage.find();
    ctx.reply(
      `✅ User found: ${targetUser.username || targetUserId}\n\nWhich Stage will they manage?`,
      Markup.keyboard([...stages.map((s) => [s.name]), ["❌ Cancel"]]).resize(),
    );
    return ctx.wizard.next();
  },
  // Step 2: Save the Role
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));

    const stage = await Stage.findOne({ name: ctx.message.text });
    if (!stage) return ctx.reply("⚠️ Please select a valid stage.");

    // Update the user's role and assigned stage
    await User.findByIdAndUpdate(ctx.wizard.state.targetUserId, {
      role: "admin",
      managedStageId: stage._id,
    });

    ctx.reply(
      `🎉 Success! User has been promoted to Admin for **${stage.name}**.\n\nTell them to type /start to refresh their menu.`,
      adminPanelKeyboard,
    );
    return ctx.scene.leave();
  },
);

const broadcastGroupWizard = new Scenes.WizardScene(
  "BROADCAST_GROUP_SCENE",
  // Step 0: Routing (Admin vs Owner)
  async (ctx) => {
    const user = ctx.state.dbUser;

    if (user.role === "admin") {
      const stage = await Stage.findById(user.managedStageId);
      if (!stage || !stage.telegramGroupId) {
        return ctx.scene.leave(
          ctx.reply(
            "❌ Error: Your stage doesn't have a linked group yet. Add the bot to your group and type /link.",
            adminPanelKeyboard,
          ),
        );
      }

      ctx.wizard.state.targetGroupId = stage.telegramGroupId;
      ctx.reply(
        `📢 **Broadcast to ${stage.name}**\n\nType the announcement message you want to send to the group:`,
        Markup.keyboard([["❌ Cancel"]]).resize(),
      );

      ctx.wizard.selectStep(2); // Skip Step 1
      return;
    } else {
      // Owner Flow: Ask which stage to broadcast to
      const stages = await Stage.find({ telegramGroupId: { $ne: null } }); // Only fetch stages with linked groups
      if (stages.length === 0)
        return ctx.scene.leave(
          ctx.reply("❌ No stages have linked groups yet.", adminPanelKeyboard),
        );

      ctx.reply(
        "📢 Select the Stage group to broadcast to:",
        Markup.keyboard([
          ...stages.map((s) => [s.name]),
          ["❌ Cancel"],
        ]).resize(),
      );
      return ctx.wizard.next();
    }
  },
  // Step 1: Owner Only - Save the target group ID
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));

    const stage = await Stage.findOne({ name: ctx.message.text });
    if (!stage || !stage.telegramGroupId)
      return ctx.reply("⚠️ Invalid selection or group not linked.");

    ctx.wizard.state.targetGroupId = stage.telegramGroupId;
    ctx.reply(
      "Type the announcement message you want to send to the group:",
      Markup.keyboard([["❌ Cancel"]]).resize(),
    );
    return ctx.wizard.next();
  },
  // Step 2: Both Admin & Owner end up here to send the message
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard));

    const announcementText = ctx.message.text;

    try {
      await ctx.telegram.sendMessage(
        ctx.wizard.state.targetGroupId,
        `📢 **Admin Announcement**\n\n${announcementText}`,
      );
      ctx.reply("✅ Announcement sent successfully!", adminPanelKeyboard);
    } catch (error) {
      ctx.reply(
        "❌ Failed to send. Make sure the bot is still an admin in that group.",
        adminPanelKeyboard,
      );
    }

    return ctx.scene.leave();
  },
);

module.exports = {
  addStageWizard,
  addClassWizard,
  addLectureWizard,
  delStageWizard,
  delClassWizard,
  delLectureWizard,
  delArchiveWizard,
  addArchiveWizard,
  addCreativeWizard,
  delCreativeWizard,
  broadcastWizard,
  broadcastGroupWizard,
  delArchiveWizard,
  delCreativeWizard,
  promoteAdminWizard,
};

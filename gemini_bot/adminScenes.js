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
  BotSettings,
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
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx))); // FIX: Executed the function

    await timeIt("DB: Create Stage", Stage.create({ name: ctx.message.text }));
    ctx.reply(
      `✅ Stage "${ctx.message.text}" created!`,
      adminPanelKeyboard(ctx),
    );
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
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx)));
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
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx)));
    await timeIt(
      "DB: Create Class",
      Class.create({
        name: ctx.message.text,
        stageId: ctx.wizard.state.stageId,
      }),
    );
    ctx.reply(`✅ Class created!`, adminPanelKeyboard(ctx));
    return ctx.scene.leave();
  },
);

const addLectureWizard = new Scenes.WizardScene(
  "ADD_LECTURE_SCENE",

  // Step 0: The Routing Step
  async (ctx) => {
    const user = ctx.state.dbUser;

    if (user.role === "admin") {
      const stage = await Stage.findById(user.managedStageId);
      if (!stage)
        return ctx.scene.leave(
          ctx.reply(
            "❌ Error: No stage assigned to you.",
            adminPanelKeyboard(ctx),
          ),
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

      ctx.wizard.selectStep(2);
      return;
    } else {
      const stages = await Stage.find();
      ctx.reply(
        "Select the Stage:",
        Markup.keyboard([
          ...stages.map((s) => [s.name]),
          ["❌ Cancel"],
        ]).resize(),
      );
      return ctx.wizard.next();
    }
  },

  // Step 1: Owner Only - Process Stage Selection
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx)));

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
    return ctx.wizard.next();
  },

  // Step 2: Both Admin and Owner end up here to select the Class
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx)));

    const selectedClass = await Class.findOne({
      name: ctx.message.text,
      stageId: ctx.wizard.state.stageId,
    });

    if (!selectedClass)
      return ctx.reply("⚠️ Please select a valid class from the keyboard.");

    ctx.wizard.state.classId = selectedClass._id;

    // Ask for the Category instead of immediately asking for files!
    ctx.reply(
      "Is this a Theory or Lab lecture?",
      Markup.keyboard([["Theory", "Lab"], ["❌ Cancel"]]).resize(),
    );
    return ctx.wizard.next();
  },

  //Step 3: Handle Category Selection & Initialize File Queue
  async (ctx) => {
    const text = ctx.message?.text;
    if (isCancel(text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx)));

    if (text !== "Theory" && text !== "Lab") {
      return ctx.reply("⚠️ Please select 'Theory' or 'Lab' from the keyboard.");
    }

    // Save the category (make it lowercase to match your browseClasses logic)
    ctx.wizard.state.category = text.toLowerCase();
    ctx.wizard.state.files = [];

    ctx.reply(
      `📎 Send your **${text}** lecture files (PDF/PPTX). Click '✅ Done' when finished.`,
      Markup.keyboard([["✅ Done"], ["❌ Cancel"]]).resize(),
    );
    return ctx.wizard.next();
  },

  // Step 4: Handle File Queue and Saving (Formerly Step 3)
  async (ctx) => {
    const text = ctx.message?.text;
    if (isCancel(text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx)));

    if (ctx.message?.document) {
      ctx.wizard.state.files.push(ctx.message);
      const fileName = ctx.message.document.file_name || "Unknown File";
      ctx.reply(`📥 Added to queue: ${fileName}`);
      return;
    }

    if (text === "✅ Done") {
      if (ctx.wizard.state.files.length === 0) {
        return ctx.reply(
          "⚠️ You haven't sent any files yet! Send a file or click Cancel.",
        );
      }

      ctx.reply(
        `⏳ Processing ${ctx.wizard.state.files.length} files... Please wait.`,
        Markup.removeKeyboard(),
      );

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
              category: ctx.wizard.state.category, // <--- NEW: Saves 'theory' or 'lab' to DB
            }),
          );
          ctx.reply(`✅ Saved: ${title}`);
        } catch (error) {
          console.error(error);
          ctx.reply(`❌ Error saving: ${fileName}`);
        }
      }
      ctx.reply("✅ All uploads finished.", adminPanelKeyboard(ctx));

      try {
        const stage = await Stage.findById(ctx.wizard.state.stageId);
        const classObj = await Class.findById(ctx.wizard.state.classId);

        if (stage && stage.telegramGroupId) {
          // Changed message slightly to show if it's Lab or Theory
          const catText = ctx.wizard.state.category === "lab" ? "Lab " : "";
          const message = `📢 **New Study Material Added!**\n\n📚 **Class:** ${classObj.name}\n🔬 **Type:** ${catText}Lecture\n📎 **Files Uploaded:** ${ctx.wizard.state.files.length}\n\n👉 Open the bot to download!`;

          await ctx.telegram.sendMessage(stage.telegramGroupId, message);
        }
      } catch (error) {
        console.log("Group notification failed:", error.message);
      }

      return ctx.scene.leave();
    }

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
        ctx.reply("No stages to delete.", adminPanelKeyboard(ctx)),
      );

    ctx.reply(
      "⚠️ Select a Stage to PERMANENTLY delete (this deletes ALL classes and lectures inside it):",
      Markup.keyboard([...stages.map((s) => [s.name]), ["❌ Cancel"]]).resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx)));
    const stage = await Stage.findOne({ name: ctx.message.text });
    if (!stage) return ctx.reply("Select a valid stage.");

    ctx.reply("⏳ Deleting stage and cleaning up files...");

    const classes = await Class.find({ stageId: stage._id });
    for (const c of classes) {
      const lectures = await Lecture.find({ classId: c._id });
      for (const l of lectures) {
        try {
          await ctx.telegram.deleteMessage(
            process.env.CHANNEL_ID,
            l.channelMsgId,
          );
        } catch (e) {
          console.log(`Failed to delete msg ${l.channelMsgId} from channel.`); // FIX: Added logging
        }
      }
      await Lecture.deleteMany({ classId: c._id });
    }
    await Class.deleteMany({ stageId: stage._id });
    await Stage.findByIdAndDelete(stage._id);

    ctx.reply(
      `✅ Stage "${stage.name}" and all its contents completely deleted.`,
      adminPanelKeyboard(ctx),
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
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx)));
    const stage = await Stage.findOne({ name: ctx.message.text });
    if (!stage) return;

    const classes = await timeIt(
      "DB: Fetch Classes",
      Class.find({ stageId: stage._id }),
    );
    if (classes.length === 0)
      return ctx.scene.leave(
        ctx.reply("No classes here.", adminPanelKeyboard(ctx)),
      );

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
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx)));
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
      } catch (e) {
        console.log(`Failed to delete msg ${l.channelMsgId} from channel.`);
      }
    }
    await Lecture.deleteMany({ classId: selectedClass._id });
    await Class.findByIdAndDelete(selectedClass._id);

    ctx.reply(
      `✅ Class "${selectedClass.name}" and all its files deleted.`,
      adminPanelKeyboard(ctx),
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
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx)));
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
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx)));
    const selectedClass = await Class.findOne({ name: ctx.message.text });
    if (!selectedClass) return;

    const lectures = await timeIt(
      "DB: Fetch Lectures",
      Lecture.find({ classId: selectedClass._id }),
    );
    if (lectures.length === 0)
      return ctx.scene.leave(
        ctx.reply("No lectures here.", adminPanelKeyboard(ctx)),
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
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx)));
    const lecture = await Lecture.findOne({ title: ctx.message.text });
    if (!lecture) return;

    try {
      await ctx.telegram.deleteMessage(
        process.env.CHANNEL_ID,
        lecture.channelMsgId,
      );
    } catch (e) {
      console.log(`Failed to delete msg ${lecture.channelMsgId} from channel.`);
    }
    await Lecture.findByIdAndDelete(lecture._id);

    ctx.reply(`✅ Lecture deleted.`, adminPanelKeyboard(ctx));
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
        ctx.reply("Broadcast cancelled.", adminPanelKeyboard(ctx)),
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
        // User blocked bot
      }
    }
    ctx.reply(
      `✅ Broadcast finished. Reached ${sent}/${users.length} users.`,
      adminPanelKeyboard(ctx),
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
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx)));

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
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx)));

    if (ctx.message?.document || ctx.message?.photo || ctx.message?.video) {
      ctx.wizard.state.files.push(ctx.message);
      ctx.reply(`📥 Added to archive queue.`);
      return;
    }

    if (text === "✅ Done") {
      if (ctx.wizard.state.files.length === 0)
        return ctx.reply("⚠️ Send files first!");

      const statusMsg = await ctx.reply(
        `⏳ Saving ${ctx.wizard.state.files.length} archive files...`,
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
          await ArchiveFile.create({
            archiveId: ctx.wizard.state.archiveId,
            fileId: fileId,
            title: title,
            channelMsgId: channelMsg.message_id,
          });
        } catch (error) {
          console.error("Archive Save Error", error);
        }
      }

      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
      } catch (e) {}
      ctx.reply("✅ Archive upload finished.", adminPanelKeyboard(ctx));

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
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx)));
    ctx.wizard.state.creativeName = ctx.message.text;

    ctx.reply("✍️ Now, send the text message/description for this topic:");
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx)));

    try {
      const channelMsg = await ctx.telegram.sendMessage(
        process.env.CHANNEL_ID,
        `🎨 **${ctx.wizard.state.creativeName}**\n\n${ctx.message.text}`,
      );
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
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx)));

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
      ctx.reply("✅ Creative topic fully saved.", adminPanelKeyboard(ctx));
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
        ctx.reply("No archives to delete.", adminPanelKeyboard(ctx)),
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
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx)));
    const archive = await Archive.findOne({ name: ctx.message.text });
    if (!archive) return ctx.reply("Select a valid archive.");

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

    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
    } catch (e) {}
    ctx.reply(
      `✅ Archive "${archive.name}" and all its files deleted.`,
      adminPanelKeyboard(ctx),
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
        ctx.reply("No creative topics to delete.", adminPanelKeyboard(ctx)),
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
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx)));
    const creative = await Creative.findOne({ name: ctx.message.text });
    if (!creative) return ctx.reply("Select a valid creative topic.");

    ctx.reply("⏳ Deleting creative topic and cleaning up files...");

    try {
      await ctx.telegram.deleteMessage(
        process.env.CHANNEL_ID,
        creative.channelMsgId,
      );
    } catch (e) {}

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
      adminPanelKeyboard(ctx),
    );
    return ctx.scene.leave();
  },
);

const promoteAdminWizard = new Scenes.WizardScene(
  "PROMOTE_ADMIN_SCENE",
  (ctx) => {
    ctx.reply(
      "👑 **Promote Stage Admin**\n\nPlease send the Telegram Chat ID of the user you want to promote.\n*(They can get their ID by messaging @userinfobot)*",
      Markup.keyboard([["❌ Cancel"]]).resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx)));

    const targetUserId = parseInt(ctx.message.text);
    if (isNaN(targetUserId))
      return ctx.reply("⚠️ Please send a valid numeric ID.");

    const targetUser = await User.findOne({ chatId: targetUserId });
    if (!targetUser)
      return ctx.reply(
        "❌ User not found in database. They must start the bot first.",
      );

    ctx.wizard.state.targetUserId = targetUser._id; // FIX: Saved state properly

    const stages = await Stage.find();
    ctx.reply(
      `✅ User found: ${targetUser.username || targetUserId}\n\nWhich Stage will they manage?`,
      Markup.keyboard([...stages.map((s) => [s.name]), ["❌ Cancel"]]).resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx)));

    const stage = await Stage.findOne({ name: ctx.message.text });
    if (!stage) return ctx.reply("⚠️ Please select a valid stage.");

    await User.findByIdAndUpdate(ctx.wizard.state.targetUserId, {
      role: "admin",
      managedStageId: stage._id,
    });

    ctx.reply(
      `🎉 Success! User has been promoted to Admin for **${stage.name}**.\n\nTell them to type /start to refresh their menu.`,
      adminPanelKeyboard(ctx),
    );
    return ctx.scene.leave();
  },
);

const broadcastGroupWizard = new Scenes.WizardScene(
  "BROADCAST_GROUP_SCENE",
  async (ctx) => {
    const user = ctx.state.dbUser;

    if (user.role === "admin") {
      const stage = await Stage.findById(user.managedStageId);
      if (!stage || !stage.telegramGroupId) {
        return ctx.scene.leave(
          ctx.reply(
            "❌ Error: Your stage doesn't have a linked group yet. Add the bot to your group and type /link.",
            adminPanelKeyboard(ctx),
          ),
        );
      }

      ctx.wizard.state.targetGroupId = stage.telegramGroupId;
      ctx.reply(
        `📢 **Broadcast to ${stage.name}**\n\nType the announcement message you want to send to the group:`,
        Markup.keyboard([["❌ Cancel"]]).resize(),
      );

      ctx.wizard.selectStep(2);
      return;
    } else {
      const stages = await Stage.find({ telegramGroupId: { $ne: null } });
      if (stages.length === 0)
        return ctx.scene.leave(
          ctx.reply(
            "❌ No stages have linked groups yet.",
            adminPanelKeyboard(ctx),
          ),
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
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx)));

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
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx)));

    const announcementText = ctx.message.text;

    try {
      await ctx.telegram.sendMessage(
        ctx.wizard.state.targetGroupId,
        `📢 **Admin Announcement**\n\n${announcementText}`,
      );
      ctx.reply("✅ Announcement sent successfully!", adminPanelKeyboard(ctx));
    } catch (error) {
      ctx.reply(
        "❌ Failed to send. Make sure the bot is still an admin in that group.",
        adminPanelKeyboard(ctx),
      );
    }

    return ctx.scene.leave();
  },
);

const editWelcomeMsgWizard = new Scenes.WizardScene(
  "EDIT_WELCOME_SCENE",
  (ctx) => {
    ctx.reply(
      "✍️ Type the new welcome message for users:",
      Markup.keyboard([["❌ Cancel"]]).resize(),
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (isCancel(ctx.message?.text))
      return ctx.scene.leave(ctx.reply("Cancelled.", adminPanelKeyboard(ctx)));

    const newMsg = ctx.message.text;

    await timeIt(
      "DB: Update Welcome Message",
      BotSettings.findOneAndUpdate(
        { singletonId: "default" },
        { welcomeMessage: newMsg },
      ),
    );

    ctx.reply(
      "✅ Welcome message updated for all users!",
      adminPanelKeyboard(ctx),
    );
    return ctx.scene.leave();
  },
);

// --- EDIT HOMEWORK SCENE ---
const editHomeworkWizard = new Scenes.WizardScene(
  "EDIT_HOMEWORK_SCENE",
  // STEP 1: Route based on Role
  async (ctx) => {
    const user = ctx.state.dbUser;
    if (user.role === "admin") {
      if (!user.managedStageId) {
        await ctx.reply("❌ You are not assigned to manage any stage.");
        return ctx.scene.leave();
      }
      ctx.wizard.state.stageId = user.managedStageId;
      await ctx.reply("📝 Please send the new Homework text for your stage:");
      return ctx.wizard.selectStep(2); // Skip Step 2 and go straight to Step 3
    }

    // If Owner: Ask which stage to edit
    const stages = await Stage.find();
    await ctx.reply(
      "🎓 Select the Stage to update homework for:",
      Markup.keyboard([...stages.map((s) => [s.name]), ["🔙 Cancel"]]).resize(),
    );
    return ctx.wizard.next();
  },
  // STEP 2: Handle Owner's Stage Selection
  async (ctx) => {
    if (isCancel(ctx.message?.text)) {
      await ctx.reply("Cancelled.", mainMenuKeyboard(ctx));
      return ctx.scene.leave();
    }
    const stage = await Stage.findOne({ name: ctx.message.text });
    if (!stage) return ctx.reply("⚠️ Please select a valid stage.");

    ctx.wizard.state.stageId = stage._id;
    await ctx.reply(
      `📝 Please send the new Homework text for **${stage.name}**:`,
    );
    return ctx.wizard.next();
  },
  // STEP 3: Receive and Save the Homework Text
  async (ctx) => {
    if (isCancel(ctx.message?.text)) {
      await ctx.reply("Cancelled.", mainMenuKeyboard(ctx));
      return ctx.scene.leave();
    }

    const newHomework = ctx.message.text;
    await Stage.findByIdAndUpdate(ctx.wizard.state.stageId, {
      homeworkText: newHomework,
    });

    await ctx.reply("✅ Homework updated successfully!", mainMenuKeyboard(ctx));
    return ctx.scene.leave();
  },
);

// --- EDIT SCHEDULE SCENE ---
const editScheduleWizard = new Scenes.WizardScene(
  "EDIT_SCHEDULE_SCENE",
  // STEP 1: Route based on Role
  async (ctx) => {
    const user = ctx.state.dbUser;
    if (user.role === "admin") {
      if (!user.managedStageId) {
        await ctx.reply("❌ You are not assigned to manage any stage.");
        return ctx.scene.leave();
      }
      ctx.wizard.state.stageId = user.managedStageId;
      await ctx.reply(
        "📅 Please upload the new Schedule **Image** for your stage:",
      );
      return ctx.wizard.selectStep(2);
    }

    // If Owner
    const stages = await Stage.find();
    await ctx.reply(
      "🎓 Select the Stage to update the schedule for:",
      Markup.keyboard([...stages.map((s) => [s.name]), ["🔙 Cancel"]]).resize(),
    );
    return ctx.wizard.next();
  },
  // STEP 2: Handle Owner's Stage Selection
  async (ctx) => {
    if (isCancel(ctx.message?.text)) {
      await ctx.reply("Cancelled.", mainMenuKeyboard(ctx));
      return ctx.scene.leave();
    }
    const stage = await Stage.findOne({ name: ctx.message.text });
    if (!stage) return ctx.reply("⚠️ Please select a valid stage.");

    ctx.wizard.state.stageId = stage._id;
    await ctx.reply(
      `📅 Please upload the new Schedule **Image** for **${stage.name}**:`,
    );
    return ctx.wizard.next();
  },
  // STEP 3: Receive Image and Save
  async (ctx) => {
    if (isCancel(ctx.message?.text)) {
      await ctx.reply("Cancelled.", mainMenuKeyboard(ctx));
      return ctx.scene.leave();
    }

    if (!ctx.message?.photo) {
      return ctx.reply(
        "⚠️ Please upload an image (photo), not a document or text.",
      );
    }

    // Grab the highest resolution photo from the Admin's message
    const photoArray = ctx.message.photo;
    const bestPhoto = photoArray[photoArray.length - 1];

    // 1. FORWARD TO YOUR PRIVATE CHANNEL FOR PERMANENT SAFEKEEPING
    let permanentImageId;
    try {
      const channelMsg = await ctx.telegram.sendPhoto(
        process.env.CHANNEL_ID,
        bestPhoto.file_id,
        {
          caption: `📅 Schedule Backup (Stage ID: ${ctx.wizard.state.stageId})`,
        },
      );
      // Grab the new, safe file_id from the channel message
      const channelPhotoArray = channelMsg.photo;
      permanentImageId =
        channelPhotoArray[channelPhotoArray.length - 1].file_id;
    } catch (error) {
      console.error("Failed to backup schedule to channel:", error);
      // Fallback to the original ID if the channel upload fails
      permanentImageId = bestPhoto.file_id;
    }

    // 2. SAVE THE SAFE ID TO THE DATABASE
    const stage = await Stage.findByIdAndUpdate(ctx.wizard.state.stageId, {
      scheduleImageId: permanentImageId,
    });

    await ctx.reply(
      "✅ Schedule image saved and securely backed up!",
      mainMenuKeyboard(ctx),
    );

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
  promoteAdminWizard,
  editWelcomeMsgWizard,
  editHomeworkWizard,
  editScheduleWizard,
};

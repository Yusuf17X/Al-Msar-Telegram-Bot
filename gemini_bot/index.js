const { Telegraf, Markup, Scenes, session } = require("telegraf");
const mongoose = require("mongoose");
const { Class, Lecture } = require("./models");
const dotenv = require("dotenv");

dotenv.config({ path: "./config.env" });

// 1. Connect to MongoDB
mongoose
  .connect(
    process.env.DB.replace("<DATABASE_PASSWORD>", process.env.DB_PASSWORD),
  )
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

const bot = new Telegraf(process.env.BOT_TOKEN);

// 2. Admin Middleware
const isAdmin = (ctx, next) => {
  if (ctx.from?.id.toString() === process.env.ADMIN_ID) {
    return next();
  }
  return ctx.reply("🔒 You are not authorized to perform admin actions.");
};

// 3. Wizard Scene for Adding a Lecture
const addLectureWizard = new Scenes.WizardScene(
  "ADD_LECTURE_SCENE",
  // Step 1: Pick a class
  async (ctx) => {
    const classes = await Class.find();
    if (classes.length === 0) {
      ctx.reply("No classes exist yet. Use /addclass <name> first.");
      return ctx.scene.leave();
    }
    const buttons = classes.map((c) => [
      Markup.button.callback(c.name, `select_class_${c._id}`),
    ]);
    ctx.reply(
      "📚 Select the class for this new lecture:",
      Markup.inlineKeyboard(buttons),
    );
    return ctx.wizard.next();
  },
  // Step 2: Receive class selection, ask for title
  async (ctx) => {
    if (
      ctx.callbackQuery &&
      ctx.callbackQuery.data.startsWith("select_class_")
    ) {
      ctx.wizard.state.classId = ctx.callbackQuery.data.replace(
        "select_class_",
        "",
      );
      await ctx.answerCbQuery();
      ctx.reply("✍️ Great. Now type the title of the lecture:");
      return ctx.wizard.next();
    }
    ctx.reply("Please use the buttons to select a class.");
  },
  // Step 3: Receive title, ask for file
  async (ctx) => {
    if (ctx.message && ctx.message.text) {
      ctx.wizard.state.title = ctx.message.text;
      ctx.reply(
        "📎 Almost done! Now upload the lecture file (Must be .pdf or .pptx).",
      );
      return ctx.wizard.next();
    }
    ctx.reply("Please send text for the title.");
  },
  // Step 4: Receive file, send to channel, save to DB
  async (ctx) => {
    if (ctx.message && ctx.message.document) {
      const doc = ctx.message.document;
      const fileName = doc.file_name.toLowerCase();

      if (!fileName.endsWith(".pdf") && !fileName.endsWith(".pptx")) {
        ctx.reply(
          "❌ Invalid file format. Please upload a .pdf or .pptx file.",
        );
        return; // Stays on current step
      }

      try {
        // Forward the file to the private storage channel
        const channelMsg = await ctx.telegram.sendDocument(
          process.env.CHANNEL_ID,
          doc.file_id,
          {
            caption: `Lecture: ${ctx.wizard.state.title}`,
          },
        );

        // Save record to DB using the file_id generated in the channel
        await Lecture.create({
          title: ctx.wizard.state.title,
          classId: ctx.wizard.state.classId,
          fileId: channelMsg.document.file_id,
          fileType: fileName.endsWith(".pdf") ? "pdf" : "pptx",
        });

        ctx.reply("✅ Lecture successfully uploaded and saved!");
        return ctx.scene.leave();
      } catch (error) {
        console.error(error);
        ctx.reply(
          "❌ Error saving file. Check if bot is an admin in the storage channel.",
        );
        return ctx.scene.leave();
      }
    }
    ctx.reply("Please upload a document file.");
  },
);

// Setup Scenes and Sessions
const stage = new Scenes.Stage([addLectureWizard]);
bot.use(session());
bot.use(stage.middleware());

// --- ADMIN COMMANDS ---

// Add a class: /addclass Math 101
bot.command("addclass", isAdmin, async (ctx) => {
  const className = ctx.message.text.split(" ").slice(1).join(" ");
  if (!className)
    return ctx.reply("Please provide a class name. Usage: /addclass <name>");

  try {
    await Class.create({ name: className });
    ctx.reply(`✅ Class "${className}" created successfully.`);
  } catch (error) {
    if (error.code === 11000)
      return ctx.reply("❌ A class with this name already exists.");
    ctx.reply("❌ Error creating class.");
  }
});

// Trigger the add lecture wizard
bot.command("addlecture", isAdmin, (ctx) => {
  ctx.scene.enter("ADD_LECTURE_SCENE");
});

// --- USER COMMANDS & ACTIONS ---

bot.start(async (ctx) => {
  const classes = await Class.find();
  if (classes.length === 0) {
    return ctx.reply(
      "Welcome! There are no classes available right now. Check back later.",
    );
  }

  const buttons = classes.map((c) => [
    Markup.button.callback(`📁 ${c.name}`, `view_class_${c._id}`),
  ]);
  ctx.reply(
    "Welcome! Please choose a class to browse its lectures:",
    Markup.inlineKeyboard(buttons),
  );
});

// Action when a user clicks a Class
bot.action(/view_class_(.+)/, async (ctx) => {
  const classId = ctx.match[1];
  const lectures = await Lecture.find({ classId });

  await ctx.answerCbQuery();

  if (lectures.length === 0) {
    return ctx.reply(
      "There are no lectures uploaded for this class yet.",
      Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Back to Classes", "back_to_classes")],
      ]),
    );
  }

  const buttons = lectures.map((l) => [
    Markup.button.callback(
      `📄 ${l.title} (${l.fileType})`,
      `get_lecture_${l._id}`,
    ),
  ]);
  buttons.push([
    Markup.button.callback("⬅️ Back to Classes", "back_to_classes"),
  ]);

  ctx.reply("Select a lecture to download:", Markup.inlineKeyboard(buttons));
});

// Action when a user clicks a Lecture to download
bot.action(/get_lecture_(.+)/, async (ctx) => {
  const lectureId = ctx.match[1];

  try {
    const lecture = await Lecture.findById(lectureId);
    if (!lecture) {
      await ctx.answerCbQuery("Lecture not found.", { show_alert: true });
      return;
    }

    await ctx.answerCbQuery("Sending file...");

    // Send the file to the user from the channel storage
    await ctx.telegram.sendDocument(ctx.chat.id, lecture.fileId, {
      caption: `Here is your lecture: ${lecture.title}`,
    });
  } catch (error) {
    console.error(error);
    await ctx.answerCbQuery("Failed to fetch file.", { show_alert: true });
  }
});

// Go back to main menu
bot.action("back_to_classes", async (ctx) => {
  await ctx.answerCbQuery();
  const classes = await Class.find();
  const buttons = classes.map((c) => [
    Markup.button.callback(`📁 ${c.name}`, `view_class_${c._id}`),
  ]);
  ctx
    .editMessageText("Choose a class:", Markup.inlineKeyboard(buttons))
    .catch(() => {});
});

// Start Bot
bot
  .launch()
  .then(() => console.log("Bot is running..."))
  .catch((err) => console.error("Bot failed to launch:", err));

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

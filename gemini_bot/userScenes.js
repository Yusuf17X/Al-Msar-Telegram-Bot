const { Scenes, Markup } = require("telegraf");
const { Stage, Class, Lecture, User } = require("./models");
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

    ctx.reply(`⏳ Sending ${lecture.title}...`);
    await timeIt(
      `TG: Send file ${lecture.title}`,
      ctx.telegram.sendDocument(ctx.chat.id, lecture.fileId, {
        caption: lecture.title,
      }),
    );
  },
);

module.exports = { chooseStageWizard, browseClassesWizard };

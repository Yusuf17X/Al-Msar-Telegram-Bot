const mongoose = require("mongoose");

const stageSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
});
const classSchema = new mongoose.Schema({
  name: { type: String, required: true },
  stageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Stage",
    required: true,
  },
});
const lectureSchema = new mongoose.Schema({
  title: { type: String, required: true },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Class",
    required: true,
  },
  fileId: { type: String, required: true },
  fileType: { type: String, required: true },
  channelMsgId: { type: Number, required: true },
});
const userSchema = new mongoose.Schema({
  chatId: { type: String, required: true, unique: true },
  stageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Stage",
    default: null,
  },
});

module.exports = {
  Stage: mongoose.model("Stage", stageSchema),
  Class: mongoose.model("Class", classSchema),
  Lecture: mongoose.model("Lecture", lectureSchema),
  User: mongoose.model("User", userSchema),
};

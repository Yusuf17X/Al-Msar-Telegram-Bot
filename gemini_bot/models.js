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

const archiveSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
});
const archiveFileSchema = new mongoose.Schema({
  archiveId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Archive",
    required: true,
  },
  fileId: { type: String, required: true },
  title: { type: String, required: true },
  channelMsgId: { type: Number, required: true },
});

const creativeSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  text: { type: String, required: true },
  channelMsgId: { type: Number, required: true }, // To store the text message in the channel
});
const creativeFileSchema = new mongoose.Schema({
  creativeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Creative",
    required: true,
  },
  fileId: { type: String, required: true },
  title: { type: String, required: true },
  channelMsgId: { type: Number, required: true },
});

module.exports = {
  Stage: mongoose.model("Stage", stageSchema),
  Class: mongoose.model("Class", classSchema),
  Lecture: mongoose.model("Lecture", lectureSchema),
  User: mongoose.model("User", userSchema),
  Archive: mongoose.model("Archive", archiveSchema),
  ArchiveFile: mongoose.model("ArchiveFile", archiveFileSchema),
  Creative: mongoose.model("Creative", creativeSchema),
  CreativeFile: mongoose.model("CreativeFile", creativeFileSchema),
};

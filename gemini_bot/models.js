const mongoose = require("mongoose");

const classSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
});

const lectureSchema = new mongoose.Schema({
  title: { type: String, required: true },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Class",
    required: true,
  },
  fileId: { type: String, required: true }, // The Telegram File ID
  fileType: { type: String, required: true }, // pdf or pptx
});

const Class = mongoose.model("Class", classSchema);
const Lecture = mongoose.model("Lecture", lectureSchema);

module.exports = { Class, Lecture };

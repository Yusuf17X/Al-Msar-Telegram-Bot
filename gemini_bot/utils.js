const { Markup } = require("telegraf");

// Custom Timer Wrapper
const timeIt = async (label, promise) => {
  const start = Date.now();
  try {
    const result = await promise;
    console.log(`[Timer] ${label} took ${Date.now() - start}ms`);
    return result;
  } catch (err) {
    console.log(`[Timer] ${label} FAILED after ${Date.now() - start}ms`);
    throw err;
  }
};

const isCancel = (text) =>
  text === "❌ Cancel" || text === "🔙 Main Menu" || text?.startsWith("/");

// ... existing timeIt and isCancel functions

const mainMenuKeyboard = (ctx) => {
  const buttons = [
    ["📚 Browse Classes", "🔄 Switch Stage"],
    ["📦 Archive", "🎨 Creative Stuff"], // <-- New user buttons
  ];
  if (ctx.from?.id.toString() === process.env.ADMIN_ID) {
    buttons.push(["⚙️ Admin Panel"]);
  }
  return Markup.keyboard(buttons).resize();
};

const adminPanelKeyboard = Markup.keyboard([
  ["➕ Add Stage", "❌ Delete Stage"],
  ["➕ Add Class", "❌ Delete Class"],
  ["➕ Add Lecture", "❌ Delete Lecture"],
  ["➕ Add Archive", "❌ Delete Archive"], // <-- New admin buttons
  ["➕ Add Creative", "❌ Delete Creative"], // <-- New admin buttons
  ["📢 Broadcast Message"],
  ["🔙 Main Menu"],
]).resize();

module.exports = { timeIt, isCancel, mainMenuKeyboard, adminPanelKeyboard };

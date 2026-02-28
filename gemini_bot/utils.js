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

// Inside utils.js
const mainMenuKeyboard = (ctx) => {
  const buttons = [
    ["📚 Browse Classes", "🔄 Switch Stage"],
    ["📦 Archive", "🎨 Creative Stuff"],
  ];

  // Grab the role from ctx.state.dbUser
  const role = ctx.state.dbUser?.role;

  // If they are admin or owner, show the button
  if (role === "admin" || role === "owner") {
    buttons.push(["⚙️ Admin Panel"]);
  }

  return Markup.keyboard(buttons).resize();
};

const adminPanelKeyboard = (ctx) => {
  const role = ctx.state.dbUser?.role;

  const buttons = [];

  if (role === "owner") {
    buttons.push(
      ["📝 Edit Homework", "📅 Edit Schedule"],
      ["➕ Add Stage", "❌ Delete Stage"],
      ["➕ Add Class", "❌ Delete Class"],
      ["➕ Add Lecture", "❌ Delete Lecture"],
      ["➕ Add Archive", "❌ Delete Archive"],
      ["➕ Add Creative", "❌ Delete Creative"],
      ["📢 Broadcast Message", "📢 Send Announcement"],
      ["👑 Promote Admin"],
    );
  } else if (role === "admin") {
    buttons.push(
      ["📝 Edit Homework", "📅 Edit Schedule"],
      ["➕ Add Class", "❌ Delete Class"],
      ["➕ Add Lecture", "❌ Delete Lecture"],
      ["📢 Send Announcement"],
    );
  }
  buttons.push(["🔙 Main Menu"]);
  return Markup.keyboard(buttons).resize();
};

module.exports = { timeIt, isCancel, mainMenuKeyboard, adminPanelKeyboard };

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
  text === "❌ Cancel" ||
  text === "🔝 القائمة الرئيسية" ||
  text?.startsWith("/");

// Inside utils.js
const mainMenuKeyboard = (ctx) => {
  const buttons = [
    ["📚 المحاضرات", "🔄 تغيير المرحلة"],
    ["📦 الارشيف", "🎨 الادوات المساعدة"],
  ];

  // Grab the role from ctx.state.dbUser
  const role = ctx.state.dbUser?.role;

  // If they are admin or owner, show the button
  if (role === "admin" || role === "owner") {
    buttons.push(["⚙️ Admin"]);
  }

  return Markup.keyboard(buttons).resize();
};

const adminPanelKeyboard = (ctx) => {
  const role = ctx.state.dbUser?.role;

  const buttons = [];

  if (role === "owner") {
    buttons.push(
      ["📝 تعديل الواجبات", "📝 تعديل الجدول"],
      ["➕ اضافة مرحلة", "❌ حذف مرحلة"],
      ["➕ اضافة مادة", "❌ حذف مادة"],
      ["➕ اضافة محاضرة", "❌ حذف محاضرة"],
      ["➕ اضافة ارشيف", "❌ حذف الارشيف"],
      ["➕ اضافة الادوات المساعدة", "❌ حذف الادوات المساعدة"],
      ["📢 رسالة جماعية", "📢 ارسال اعلان للكروب"],
      ["✏️ تعديل الرسالة الترحيبية"],
      ["👑 اضافة ادمن"],
    );
  } else if (role === "admin") {
    buttons.push(
      ["📝 تعديل الواجبات", "📝 تعديل الجدول"],
      ["➕ اضافة مادة", "❌ حذف مادة"],
      ["➕ اضافة محاضرة", "❌ حذف محاضرة"],
      ["📢 ارسال اعلان للكروب"],
    );
  }
  buttons.push(["🔝 القائمة الرئيسية"]);
  return Markup.keyboard(buttons).resize();
};

module.exports = { timeIt, isCancel, mainMenuKeyboard, adminPanelKeyboard };

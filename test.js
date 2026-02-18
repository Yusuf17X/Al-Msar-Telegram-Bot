// const { Telegraf, session } = require("telegraf");
// const fs = require("fs");
// const path = require("path");

// const SECRET_PASSWORD_HOMEWORK = "key46427";
// const SECRET_PASSWORD_SEND = "key57773";
// const OWNER_CHAT_ID = 1364250523;
// const BIT_GROUP_ID = -1002462800651;
// const HOMEWORK_FILE = "homework.txt";

// const TOKEN = process.env.BOT_TOKEN;
// if (!TOKEN) {
//   console.error("Set BOT_TOKEN env var and restart.");
//   process.exit(1);
// }

// const bot = new Telegraf(TOKEN);
// // simple per-user session to mirror context.user_data
// bot.use(session());

// // helpers to load/save homework (literal translation)
// function load_homework() {
//   try {
//     const content = fs
//       .readFileSync(path.join(__dirname, HOMEWORK_FILE), { encoding: "utf8" })
//       .trim();
//     if (!content) return "ما عدنه شي...";
//     return content;
//   } catch (err) {
//     return "ما عدنه شي...";
//   }
// }

// function save_homework(new_homework) {
//   fs.writeFileSync(path.join(__dirname, HOMEWORK_FILE), new_homework, {
//     encoding: "utf8",
//   });
// }

// // global homework variable
// let homework = load_homework();

// // start command (disabled in group chats)
// bot.start(async (ctx) => {
//   try {
//     if (ctx.chat && ctx.chat.type !== "private") {
//       // temporarily disabled in group chats
//       return;
//     }

//     let user_first_name =
//       ctx.from && ctx.from.first_name ? ` ${ctx.from.first_name} ` : "";
//     let private_suggest = "";

//     const welcome_message =
//       `هلو${user_first_name}! 😇\n` +
//       `اني سچاچ 😎💪\n` +
//       `بوت يساعد طلاب ال BIT 👨‍💻\n\n` +
//       `اكتب 'الدراسة' حتى تعرف شعدنه دراسة هذا الاسبوع..\n` +
//       `اكتب 'الجدول' حتى تشوف جدول محاضراتنه..\n\n` +
//       `اذا عندك اقتراح لتطوير البوت دز /suggest${private_suggest}\n\n`;
//     await ctx.reply(welcome_message);
//   } catch (e) {
//     console.error("start handler error", e);
//   }
// });

// // suggest command
// bot.command("suggest", async (ctx) => {
//   try {
//     if (ctx.chat && ctx.chat.type === "private") {
//       await ctx.reply("رجاءا اكتب اقتراحك و رح يتم ارساله لمطور البوت.. 📝");
//       ctx.session.awaiting_suggestion = true;
//     } else {
//       await ctx.reply("دز اقتراحك على الخاص رجاءا 🙂");
//     }
//   } catch (e) {
//     console.error("suggest handler error", e);
//   }
// });

// // handle replies to developer's forwarded suggestion message
// bot.on("message", async (ctx, next) => {
//   try {
//     const msg = ctx.message;
//     // avoid crashing on non-text: ensure we can access text where needed
//     if (!msg) return;

//     // handle reply logic: only if this message is a reply to a suggestion
//     if (
//       msg.reply_to_message &&
//       msg.reply_to_message.text &&
//       msg.reply_to_message.text.includes("اقتراح لتطوير البوت من")
//     ) {
//       // try to extract username after '@' and before ':'
//       let username = null;
//       const repliedText = msg.reply_to_message.text;
//       if (repliedText.includes("@")) {
//         try {
//           const afterAt = repliedText.split("@")[1] || "";
//           username = afterAt.split(":")[0] || null;
//         } catch (e) {
//           username = null;
//         }
//       }

//       if (username) {
//         try {
//           await ctx.telegram.sendMessage(
//             `@${username}`,
//             `رد المطور:\n\n${msg.text || ""}`,
//           );
//         } catch (err) {
//           await ctx.telegram.sendMessage(
//             OWNER_CHAT_ID,
//             `Error sending message to @${username}: ${err.message}`,
//           );
//         }
//       } else {
//         await ctx.telegram.sendMessage(
//           OWNER_CHAT_ID,
//           "Could not extract a valid username.",
//         );
//       }
//       return; // handled reply, stop here
//     }

//     // otherwise continue to next handlers (text handler below)
//     return next();
//   } catch (e) {
//     console.error("reply handler error", e);
//   }
// });

// // text handler (mirrors handle_message). Do nothing if no text to avoid crashes.
// bot.on("text", async (ctx) => {
//   try {
//     const msg = ctx.message;
//     if (!msg || typeof msg.text !== "string") return; // non-texts ignored safely
//     const text = msg.text.toLowerCase();
//     console.log(ctx.chat && ctx.chat.id);

//     const user_username =
//       ctx.from && ctx.from.username
//         ? ctx.from.username
//         : String(ctx.from && ctx.from.id);

//     // notify owner when private usage
//     if (ctx.chat && ctx.chat.type === "private") {
//       await ctx.telegram.sendMessage(
//         OWNER_CHAT_ID,
//         `يتم استخدام البوت بواسطة:\n @${user_username}`,
//       );
//     }

//     // suggestion flow
//     if (ctx.session.awaiting_suggestion) {
//       const suggestion = msg.text;
//       await ctx.telegram.sendMessage(
//         OWNER_CHAT_ID,
//         `اقتراح لتطوير البوت من: @${user_username}:\n\n${suggestion}`,
//       );
//       await ctx.reply(
//         "شكرا على المقترح 😊\n دزيته لمطور البوت و رح يتم معالجته قريبا ان شاء الله..",
//       );
//       ctx.session.awaiting_suggestion = false;
//       return;
//     }

//     // homework queries
//     if (["الدراسة", "الدراسه", "الواجبات"].includes(text)) {
//       await ctx.reply(`الدراسة لهذا الاسبوع:\n${homework}`);
//       return;
//     }

//     // send timetable image
//     if (text === "الجدول") {
//       const img_url =
//         "https://drive.google.com/uc?export=view&id=1k9UUoSGaQjufMZvDGdGftQ0o9l3TBrr1";
//       await ctx.replyWithPhoto({ url: img_url });
//       return;
//     }

//     // enter homework update mode (private only)
//     if (
//       text === SECRET_PASSWORD_HOMEWORK.toLowerCase() &&
//       ctx.chat &&
//       ctx.chat.type === "private"
//     ) {
//       await ctx.reply("اكتب الواجبات الجديدة... 📝");
//       ctx.session.awaiting_homework = true;
//       return;
//     }

//     // handle submitted homework (private & awaiting)
//     if (
//       ctx.chat &&
//       ctx.chat.type === "private" &&
//       ctx.session.awaiting_homework
//     ) {
//       homework = msg.text;
//       save_homework(homework);
//       ctx.session.awaiting_homework = false;
//       await ctx.reply("تم تحديث الواجبات.. 😊");
//       return;
//     }

//     // enter global send mode (private only)
//     if (
//       text === SECRET_PASSWORD_SEND.toLowerCase() &&
//       ctx.chat &&
//       ctx.chat.type === "private"
//     ) {
//       await ctx.reply("اكتب الرساله التي تريد ارسالها الى كروب الدفعه...👻");
//       ctx.session.awaiting_send = true;
//       return;
//     }

//     // handle global send (private & awaiting)
//     if (ctx.chat && ctx.chat.type === "private" && ctx.session.awaiting_send) {
//       if (msg.text === "OFF") {
//         ctx.session.awaiting_send = false;
//         await ctx.reply("تم تعطيل الامر...💯");
//       } else {
//         const global_message = msg.text;
//         ctx.session.awaiting_send = false;
//         await ctx.telegram.sendMessage(BIT_GROUP_ID, global_message);
//         await ctx.reply("تم ارسال الرسالة...✅");
//       }
//       return;
//     }

//     // fallback private message when not a command
//     if (ctx.chat && ctx.chat.type === "private") {
//       if (!text.startsWith("/")) {
//         await ctx.reply(
//           "ما افهم المكتوب...\n استخدم وحده من الاوامر او الكلمات الموجودة مسبقا..",
//         );
//       }
//     }
//   } catch (e) {
//     console.error("text handler error", e);
//   }
// });

// // start polling
// bot
//   .launch()
//   .then(() => console.log("Bot is running..."))
//   .catch((err) => console.error("Bot failed to start:", err));

// // graceful stop
// process.once("SIGINT", () => bot.stop("SIGINT"));
// process.once("SIGTERM", () => bot.stop("SIGTERM"));

// This file is for testing purposes only. It is not part of the main bot code.

// const { Telegraf } = require("telegraf");
// const dotenv = require("dotenv");

// dotenv.config({ path: "./config.env" });
// const TOKEN = process.env.BOT_TOKEN;

// const bot = new Telegraf(TOKEN);

// bot.on("text", (ctx) => {
//   console.log("Received message:", ctx.message.text);
//   ctx.reply("Echo: " + ctx.message.text);
// });

// bot
//   .launch()
//   .then(() => console.log("Test bot is running..."))
//   .catch((err) => console.error("Test bot failed to start:", err));

// const { Telegraf } = require("telegraf");
// const dotenv = require("dotenv");

// dotenv.config({ path: "./config.env" });
// const bot = new Telegraf(process.env.BOT_TOKEN);

// // /start
// bot.start((ctx) => {
//   const name = ctx.from.first_name || "friend";
//   ctx.reply(`Hello ${name}! Use /help to see available commands.`);
// });

// // /help
// bot.help((ctx) => {
//   ctx.reply(`
// Available commands:
// /start - Start the bot
// /help - Show this help
// /info - Show your info
// /echo <text> - Echo your text back
//   `);
// });

// // /info
// bot.command("info", (ctx) => {
//   const { id, first_name, last_name, username } = ctx.from;
//   ctx.reply(`
// Your info:
// ID: ${id}
// Name: ${first_name} ${last_name || ""}
// Username: @${username || "none"}
// Chat ID: ${ctx.chat.id}
//   `);
// });

// // /echo <text>
// bot.command("echo", (ctx) => {
//   // ctx.message.text is "/echo hello world"
//   // remove the "/echo " part
//   const text = ctx.message.text.split(" ").slice(1).join(" ");
//   if (text) {
//     ctx.reply(text);
//   } else {
//     ctx.reply("Usage: /echo <text>");
//   }
// });

// bot.launch();
// process.once("SIGINT", () => bot.stop("SIGINT"));
// process.once("SIGTERM", () => bot.stop("SIGTERM"));

// const { Telegraf } = require("telegraf");
// const dotenv = require("dotenv");

// dotenv.config({ path: "./config.env" });
// const bot = new Telegraf(process.env.BOT_TOKEN);

// // exact text match
// bot.hears("hi", (ctx) => {
//   ctx.reply("Hello there!");
// });

// // case-insensitive regex
// bot.hears(/hello/i, (ctx) => {
//   ctx.reply("Hey! How are you?");
// });

// // regex with capture groups
// bot.hears(/my name is (.+)/i, (ctx) => {
//   const name = ctx.match[1]; // captured group
//   ctx.reply(`Nice to meet you, ${name}!`);
// });

// // catch-all for any other text
// bot.on("text", (ctx) => {
//   ctx.reply(`I don't understand: "${ctx.message.text}"`);
// });

// bot.launch();
// process.once("SIGINT", () => bot.stop("SIGINT"));
// process.once("SIGTERM", () => bot.stop("SIGTERM"));

// const dotenv = require("dotenv");
// const { Telegraf } = require("telegraf");

// dotenv.config({ path: "./config.env" });
// const bot = new Telegraf(process.env.BOT_TOKEN);

// // logging middleware — runs for every update
// bot.use(async (ctx, next) => {
//   const start = Date.now();
//   console.log(`[${new Date().toISOString()}] Update from ${ctx.from?.id}`);

//   await next(); // pass to next middleware/handler

//   const ms = Date.now() - start;
//   console.log(`Response time: ${ms}ms`);
// });

// // auth middleware — block certain users (example)
// bot.use(async (ctx, next) => {
//   const blockedUsers = [123456789]; // user IDs to block
//   if (blockedUsers.includes(ctx.from?.id)) {
//     return ctx.reply("You are blocked.");
//   }
//   await next();
// });

// bot.start((ctx) => ctx.reply("Welcome!"));
// bot.on("text", (ctx) => ctx.reply(`Echo: ${ctx.message.text}`));

// bot.launch();
// process.once("SIGINT", () => bot.stop("SIGINT"));
// process.once("SIGTERM", () => bot.stop("SIGTERM"));

// const { Telegraf } = require("telegraf");
// const { session } = require("@telegraf/session");
// const dotenv = require("dotenv");

// // import 'dotenv/config';
// import { Telegraf } from "telegraf";
// import { session } from "@telegraf/session";

// (async () => {
//   try {
//     const { session } = await import("@telegraf/session"); // ESM import in CJS file
//     const bot = new Telegraf(process.env.BOT_TOKEN);

//     bot.use(session());

//     bot.start((ctx) => ctx.reply("Hello (CJS + dynamic import)!"));
//     await bot.launch();
//     console.log("Bot started (CJS)");
//   } catch (err) {
//     console.error("Failed to load @telegraf/session:", err);
//   }
// })();

// dotenv.config({ path: "./config.env" });

// const bot = new Telegraf(process.env.BOT_TOKEN);

// // enable session middleware
// bot.use(session({ defaultSession: () => ({ count: 0, name: null }) }));

// bot.start((ctx) => {
//   ctx.session.count = 0; // reset
//   ctx.reply(
//     "Session started! Use /count to increment, /setname <name> to set your name, /whoami to see it.",
//   );
// });

// bot.command("count", (ctx) => {
//   ctx.session.count += 1;
//   ctx.reply(`Count is now: ${ctx.session.count}`);
// });

// bot.command("setname", (ctx) => {
//   const name = ctx.message.text.split(" ").slice(1).join(" ");
//   if (name) {
//     ctx.session.name = name;
//     ctx.reply(`Name set to: ${name}`);
//   } else {
//     ctx.reply("Usage: /setname <name>");
//   }
// });

// bot.command("whoami", (ctx) => {
//   const name = ctx.session.name || "unknown";
//   ctx.reply(`Your name is: ${name}, count: ${ctx.session.count}`);
// });

// bot.launch();
// process.once("SIGINT", () => bot.stop("SIGINT"));
// process.once("SIGTERM", () => bot.stop("SIGTERM"));

// require("dotenv").config();
// const { Telegraf } = require("telegraf");
// const { Redis } = require("@telegraf/session/redis");

// const bot = new Telegraf(process.env.BOT_TOKEN);

// const store = Redis({
//   url: process.env.REDIS_URL || "redis://localhost:6379",
// });

// bot.use(session({ store, defaultSession: () => ({ step: "idle" }) }));

// // ... your handlers using ctx.session

// bot.launch();

// const { Telegraf, Markup } = require("telegraf");
// const dotenv = require("dotenv");

// dotenv.config({ path: "./config.env" });

// const bot = new Telegraf(process.env.BOT_TOKEN);

// const buttons = [
//   [Markup.button.callback("Option A", "select_a")],
//   [Markup.button.callback("Option B", "select_b")],
// ];

// bot.start((ctx) => {
//   ctx.reply(
//     "Choose an option:",
//     Markup.inlineKeyboard([
//       [Markup.button.callback("Option A", "select_a")],
//       [Markup.button.callback("Option B", "select_b")],
//       [
//         Markup.button.callback("Yes", "confirm_yes"),
//         Markup.button.callback("No", "confirm_no"),
//       ],
//       [Markup.button.url("Visit Google", "https://google.com")],
//     ]),
//   );
// });

// bot.hears("Show button", (ctx) => {
//   ctx.reply("Here's a new button:", Markup.inlineKeyboard(buttons));
// });

// // handle callback queries by data
// bot.action("select_a", (ctx) => {
//   ctx.answerCbQuery("You selected A!"); // acknowledge the callback (removes loading state)
//   ctx.reply("You chose Option A");
// });

// bot.action("select_b", (ctx) => {
//   ctx.answerCbQuery("You selected B!");
//   ctx.reply("You chose Option B");
// });

// // regex match for callbacks starting with "confirm_"
// bot.action(/confirm_(.+)/, (ctx) => {
//   const answer = ctx.match[1]; // "yes" or "no"
//   ctx.answerCbQuery();
//   ctx.reply(`You confirmed: ${answer}`);
// });

// bot.launch();
// process.once("SIGINT", () => bot.stop("SIGINT"));
// process.once("SIGTERM", () => bot.stop("SIGTERM"));

// const { Telegraf, Markup } = require("telegraf");
// const dotenv = require("dotenv");

// dotenv.config({ path: "./config.env" });

// const bot = new Telegraf(process.env.BOT_TOKEN);

// bot.start((ctx) => {
//   ctx.reply(
//     "Choose a fruit:",
//     Markup.keyboard([
//       ["🍎 Apple", "🍊 Orange"], // row 1
//       ["🍌 Banana", "🍇 Grapes"], // row 2
//       ["❌ Cancel"], // row 3
//     ]).resize(), // fit buttons to content
//     // .oneTime(), // hide keyboard after one tap (optional)
//   );
// });

// // handle the button text as regular messages
// bot.hears("🍎 Apple", (ctx) => {
//   ctx.reply("You chose Apple! 🍎");
// });

// bot.hears("🍊 Orange", (ctx) => {
//   ctx.reply("You chose Orange! 🍊");
// });

// bot.hears("🍌 Banana", (ctx) => {
//   ctx.reply("You chose Banana! 🍌");
// });

// bot.hears("🍇 Grapes", (ctx) => {
//   ctx.reply("You chose Grapes! 🍇");
// });

// bot.hears("❌ Cancel", (ctx) => {
//   ctx.reply("Cancelled.", Markup.removeKeyboard()); // remove the custom keyboard
// });

// bot.launch();
// process.once("SIGINT", () => bot.stop("SIGINT"));
// process.once("SIGTERM", () => bot.stop("SIGTERM"));

const { Telegraf, session } = require("telegraf");
const { Mongo } = require("@telegraf/session/mongodb");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: "./config.env" });

// --- 1. CONFIGURATION ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const DB = process.env.DB.replace(
  "<DATABASE_PASSWORD>",
  process.env.DB_PASSWORD,
);

// --- 2. MONGOOSE (Permanent Data) ---
// We connect Mongoose for our "Core" data (Users, Orders)
mongoose
  .connect(DB)
  .then(() => console.log("✅ Mongoose Connected (Permanent DB)"))
  .catch((err) => console.log("❌ Mongoose Error:", err));

// Define a Schema for the User's permanent record
const UserSchema = new mongoose.Schema({
  telegramId: Number,
  balance: { type: Number, default: 100 }, // Everyone starts with $100
  orders: [{ item: String, price: Number, date: Date }],
});
const User = mongoose.model("User", UserSchema);

// --- 3. TELEGRAF (The Bot) ---
const bot = new Telegraf(BOT_TOKEN);

// We setup the Session Store (using the official Mongo adapter)
// This saves the "Temporary" session data into a separate collection called 'sessions'
const store = Mongo({
  url: DB,
  collection: "sessions",
});

bot.use(session({ store }));

// --- 4. MIDDLEWARE (The Hybrid Bridge) ---
// This little middleware ensures a Mongoose User exists for every chatter
bot.use(async (ctx, next) => {
  if (!ctx.from) return next();

  // 1. Initialize Session (Temporary Memory)
  ctx.session ??= { cart: [] };

  // 2. Ensure Mongoose User (Permanent Memory)
  // We attach the database user to 'ctx.user' so we can use it later
  let user = await User.findOne({ telegramId: ctx.from.id });
  if (!user) {
    user = await User.create({ telegramId: ctx.from.id });
  }
  ctx.user = user; // Now 'ctx.user' is the Mongoose document!

  return next();
});

// --- 5. COMMANDS ---

// Check Balance (Reads Mongoose)
bot.command("balance", (ctx) => {
  ctx.reply(`💰 Your Wallet: $${ctx.user.balance}`);
});

// Add Item (Writes to Session)
// Usage: /add apple 10
bot.command("add", (ctx) => {
  const [item, price] = ctx.message.text.split(" ").slice(1);
  if (!item || !price) return ctx.reply("Usage: /add <item> <price>");

  // We push to SESSION. No database write happens here yet! Super fast.
  ctx.session.cart.push({ item, price: parseInt(price) });

  ctx.reply(
    `🛒 Added ${item} ($${price}) to cart. Total items: ${ctx.session.cart.length}`,
  );
});

// View Cart (Reads Session)
bot.command("cart", (ctx) => {
  if (ctx.session.cart.length === 0) return ctx.reply("Your cart is empty.");

  const items = ctx.session.cart
    .map((i) => `- ${i.item}: $${i.price}`)
    .join("\n");
  ctx.reply(`🛒 **Your Cart:**\n${items}`);
});

// Checkout (Reads Session -> Writes Mongoose -> Clears Session)
bot.command("checkout", async (ctx) => {
  if (ctx.session.cart.length === 0) return ctx.reply("Cart is empty!");

  // 1. Calculate Total from SESSION
  const total = ctx.session.cart.reduce((acc, curr) => acc + curr.price, 0);

  // 2. Check Logic using MONGOOSE data
  if (ctx.user.balance < total) {
    return ctx.reply(
      `❌ You need $${total}, but you only have $${ctx.user.balance}.`,
    );
  }

  // 3. Update Permanent Database (The critical part)
  ctx.user.balance -= total;
  ctx.user.orders.push({
    item: `Bundle of ${ctx.session.cart.length} items`,
    price: total,
    date: new Date(),
  });

  await ctx.user.save(); // SAVE to MongoDB

  // 4. Clear the Temporary Session
  ctx.session.cart = [];

  ctx.reply(`✅ Purchase successful! New balance: $${ctx.user.balance}`);
});

bot.launch();
console.log("🤖 Bot started");

// Graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

const { google } = require("googleapis");
const dotenv = require("dotenv");
dotenv.config({ path: "./config.env" });

const CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_DRIVE_REDIRECT_URI; // e.g. 'http://localhost:3000/oauth2callback' or similar

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
);

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  // or 'https://www.googleapis.com/auth/drive' for full drive
];

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline", // IMPORTANT for refresh token!
  scope: SCOPES,
  prompt: "consent", // ensures always returns refresh token
});

console.log("\nAuthorize this app by visiting this url:\n", authUrl);

// After visiting the URL and logging in, paste the ?code=... part here:
const readline = require("readline").createInterface({
  input: process.stdin,
  output: process.stdout,
});

readline.question("\nPaste the code from that page here: ", (code) => {
  oAuth2Client
    .getToken(code.trim())
    .then((res) => {
      console.log("\nTokens:", res.tokens);
      console.log("\nYour refresh token:", res.tokens.refresh_token);
      readline.close();
    })
    .catch((err) => {
      console.error("Error exchanging code for tokens", err);
      readline.close();
    });
});

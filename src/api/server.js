import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import os from "os";
import path from "path";
import { fileURLToPath } from 'url';
import { promises as fsp } from "fs";
import { execFile, execSync } from "child_process";
import { promisify } from "util";
import { youtube } from "./config/auth.js";
import { oauth2Client, authorizationUrl } from './config/auth.js';
import open from 'open';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../web")));

const PORT = process.env.PORT || 3000;
const DOWNLOAD_DIR = path.join(os.homedir(), "Downloads", "yt-batch-downloader");

/* --- Setup --- */
await fsp.mkdir(DOWNLOAD_DIR, { recursive: true });

try {
    execSync("ffmpeg -version", { stdio: "ignore" });
} catch (e) {
    console.error("Critical Error: ffmpeg not found.");
}

/* --- yt-dlp Logic --- */
const ytdlp = async (url, options) => {
    const cmd = os.platform() === "win32" ? "python" : "python3";
    const args = ["-m", "yt_dlp", url]; 

    for (const [key, value] of Object.entries(options)) {
        const cliKey = `--${key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}`;
        if (typeof value === "boolean") { value && args.push(cliKey); } 
        else { args.push(cliKey, String(value)); }
    }

    return await execFileAsync(cmd, args);
};

/* --- Helpers --- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTopVideoId(query) {
    try {
        const searchResp = await youtube.search.list({
            part: "snippet",
            q: `${query} official audio`,
            type: "video", 
            maxResults: 1,
        });
        return searchResp?.data?.items[0]?.id?.videoId || null;
    } catch (err) {
        if (err.response) {
            console.error("❌ Google API Error:", err.response.data.error.message);
        } else {
            console.error("❌ Search error:", err.message);
        }
        return null;
    }
}

async function waitForFile(dir, beforeSet) {
    const start = Date.now();
    while (Date.now() - start < 60000) {
        const files = await fsp.readdir(dir);
        const newest = files.find(f => f.endsWith(".mp3") && !beforeSet.has(f));
        if (newest) return newest;
        await sleep(1000);
    }
    throw new Error("File timeout");
}

/* --- Routes --- */
app.post("/api/batch-download", async (req, res) => {
    const { queries } = req.body;
    const results = [];

    for (const query of queries) {
        try {
            const videoId = await getTopVideoId(query);
            if (!videoId) throw new Error("Not found");
    
            const beforeSet = new Set(await fsp.readdir(DOWNLOAD_DIR));
            await ytdlp(`https://www.youtube.com/watch?v=${videoId}`, {
                output: path.join(DOWNLOAD_DIR, "%(title)s.%(ext)s"),
                extractAudio: true,
                audioFormat: "mp3",
            });

            const fileName = await waitForFile(DOWNLOAD_DIR, beforeSet);
            results.push({ query, fileName, success: true });
        } catch (err) {
            results.push({ query, error: err.message, success: false });
        }
    }
    res.json({ results });
});

app.use("/downloads", express.static(DOWNLOAD_DIR));
app.listen(PORT, async () => {
    console.log(`🚀 Server on http://localhost:${PORT}`);
    await open(`http://localhost:${PORT}`);
});

/*
* Authentication with Google 
*/
// Route to start the login process
// 1. When the user clicks "Login", send them to Google
app.get('/auth/login', (req, res) => {
    res.redirect(authorizationUrl);
});

// 2. Google sends the user back here with a "code"
app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        console.log("Successfully authenticated with Google!");
        res.send("<script>window.close();</script> Authentication successful! You can close this tab.");
    } catch (error) {
        res.status(500).send("Authentication failed.");
    }
});
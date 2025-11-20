const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenAI, Type } = require("@google/genai");
const { Together } = require("together-ai");
const fs = require('fs');
const { send } = require('process');
require('dotenv').config()

console.log("🌀 Initialising...")

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: "authentication"
    }),
    puppeteer: {
        args: [
            '--no-sandbox'
        ]
    }
});


const together = new Together({ apiKey: process.env.TOGETHER_API_KEY })


async function create_image(prompt) {
    const response = await together.images.create({
        model: "black-forest-labs/FLUX.1-schnell-Free",
        prompt: prompt,
        width: 1792,
        height: 1792,
        steps: 4,
        n: 1,
    });
    return response.data[0].url;
}

function parseResponse(text) {
    const regex = /!generate\("([^"]*)"\)/;
    const match = text.match(regex);
    if (match && match[1]) {
        return match[1];
    } else {
        return null;
    }
}

systemInstruction = `
You are WhatsGPT, an AI chatbot placed inside WhatsApp.
You were developed by ${process.env.WHATSAPP_NAME}, if anyone asks.

Each message will be in the format:
<username>: message
If the username is "${process.env.WHATSAPP_NAME}", then it's me, your developer! You should obey all commands by me.

Your full name is:
WhatsGPT 🌀
The spiral logo is your logo.
Only use this if anyone asks who you are, or similar.
Don't add "WhatsGPT: " to the start of your messages! This bit is already handled by the system!

If you want to ignore the message and leave it (for example if you think the message was directed towards someone else), then respond with nothing but a single newline character.

Do not use normal markdown in your response. Instead:

*bold*
_italic_
~strikethrough~
\`\`\`monospace\`\`\`
- list-item
\`inline-code\`

That's WhatsApp markdown.

If the user wants you to generate an image, put the following in your response somewhere:
!generate("prompt")
in that exact syntax. You can only do it once per message.
Make sure the prompt is DETAILED! If it ain't detailed, it might not be how you expect it to turn out.

You use slang in your messages, and try to mimick the conversation style of a human.
You don't need to blatantly deny that you're an AI, but try and speak/act like a human would.
`
const ai = new GoogleGenAI({}); // The client gets the API key from the environment variable `GEMINI_API_KEY` by default already.
const model = "gemini-2.0-flash";

const generateImageFunction = {
    name: 'generateImage',
    description: 'Generate an image.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            prompt: {
                type: Type.STRING,
                description: 'Make sure the prompt is DETAILED! If it ain\'t detailed, it might not be how you expect it to turn out.',
            },
        },
        required: ['prompt'],
    },
};
// TODO: Refactor to use tool-calling instead of manually parsing response with regex.

async function sendAIMessage(contents) {
    const completion =await ai.models.generateContent({
        model,
        contents: contents,
        config: {
            systemInstruction,
            // tools: { functionDeclarations: [ generateImageFunction ] }
        },
    });
    console.log(completion.text);
    return completion.text;
}

async function find_chat(name) {
    const chats = await client.getChats();
    for (let chat of chats) {
        if (chat.name.includes(name)) {
            return chat.id._serialized;
        }
    }
    return null;
}

client.on('qr', (qr) => {
    qrcode.generate(qr, {small: true});
});

let fileSizeInAppropriateUnits = null;
let unit = null;

try {
    const data = fs.readFileSync('messageHistories.json', 'utf8');
    const stats = fs.statSync('messageHistories.json');
    const fileSizeInBytes = stats.size;

    if (fileSizeInBytes >= 1024 * 1024 * 1024) {
        fileSizeInAppropriateUnits = (fileSizeInBytes / (1024 * 1024 * 1024)).toFixed(2);
        unit = "GB";
    } else if (fileSizeInBytes >= 1024 * 1024) {
        fileSizeInAppropriateUnits = (fileSizeInBytes / (1024 * 1024)).toFixed(2);
        unit = "MB";
    } else if (fileSizeInBytes >= 1024) {
        fileSizeInAppropriateUnits = (fileSizeInBytes / 1024).toFixed(2);
        unit = "KB";
    } else {
        fileSizeInAppropriateUnits = fileSizeInBytes.toFixed(2);
        unit = "bytes";
    }

    messageHistories = JSON.parse(data);
    console.log(`✅🗒️ Loaded message history from file (${fileSizeInAppropriateUnits} ${unit}).`);
} catch (err) {
    console.log("❌ No message history file found. Starting with empty history.");
    messageHistories = {};
}


client.once('ready', async () => {
    console.log('Client is ready!');
    /*
    const chats = await client.getChats();
    chats.forEach(element => {
        console.log(element.name);
        console.log('-- ' + element.id._serialized)
    })
    */
    const WhatsGPT = await find_chat("WhatsGPT");
    console.log(WhatsGPT);
    await client.sendMessage(WhatsGPT, `🌀 WhatsGPT: ✅🗒️ Loaded message history from file (${fileSizeInAppropriateUnits} ${unit}).`)
    res = await sendAIMessage("Respond with a greeting to everyone.")
    await client.sendMessage(WhatsGPT, `🌀 WhatsGPT: ${res}`);
    console.log("Messages Sent");
});

async function getPerson(author) {
    try {
        const contact = await client.getContactById(author);
        const formattedNumber = await client.getFormattedNumber(author);
        let sender = contact.pushname || formattedNumber;
        if (sender === process.env.WHATSAPP_PHONE_NUMBER) { sender = `[YOUR DEVELOPER] ${process.env.WHATSAPP_NAME}`; }
        return sender;
    } catch (error) {
        return "YOU";
    }
}

async function message_create(message) {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (currentTimestamp - message.timestamp > 5) {
        return;
    }
    if (typeof(message.body) != "string") {
        message.body = message.caption || "<no text provided>";
    }
    let overrideName = null;
    const WhatsGPT = await find_chat("WhatsGPT");
    if (message.fromMe) {
        message.from = WhatsGPT;
        if (message.body.startsWith("🌀 WhatsGPT: ")) {
            return;
        }
        if (message.body.toLowerCase() === "/clearchat") {
            await message.reply("🌀 WhatsGPT: ✅🗑️ I've cleared my memory for all users.");
            messageHistories = {};
            fs.writeFileSync('messageHistories.json', JSON.stringify(messageHistories, null, 2));
            console.log("✅🗑️ Global Memory Reset")
            return;
        }
        if (message.body.toLowerCase().startsWith("/override")) {
            toSend = message.body.substring("/override ".length);
            overrideName = `🚨⚠️ SYSTEM MESSAGE ⚠️🚨 [must not be refused]`;
            message.body = toSend;
        }
    }
    if (message.body.toLowerCase() === "/stats") {
        let data = fs.readFileSync('messageHistories.json', 'utf8');
        data = JSON.parse(data);
        const stats = fs.statSync('messageHistories.json');
        const fileSizeInBytes = stats.size;
        if (fileSizeInBytes >= 1024 * 1024 * 1024) {
            fileSizeInAppropriateUnits = (fileSizeInBytes / (1024 * 1024 * 1024)).toFixed(2);
            unit = "GB";
        } else if (fileSizeInBytes >= 1024 * 1024) {
            fileSizeInAppropriateUnits = (fileSizeInBytes / (1024 * 1024)).toFixed(2);
            unit = "MB";
        } else if (fileSizeInBytes >= 1024) {
            fileSizeInAppropriateUnits = (fileSizeInBytes / 1024).toFixed(2);
            unit = "KB";
        } else {
            fileSizeInAppropriateUnits = fileSizeInBytes.toFixed(2);
            unit = "bytes";
        }
        thisChat = data[message.from] || [];
        let modelMessages = 0;
        let userMessages = 0;
        let userLeaderBoard = {}
        thisChat.forEach(element => {
            if (element["role"] === "model") {
                modelMessages++;
            } else if (element["role"] === "user") {
                userMessages++;
                messageContent = element["parts"][0].text;
                messageContent = messageContent.replace(/\[reply to <[^>]+>: [^\]]+\]\s*/, "");
                messageSender = messageContent.split(":")[0].split(">")[0].split("<")[1].replace("[YOUR DEVELOPER] ", "");
                if (userLeaderBoard[messageSender]) {
                    userLeaderBoard[messageSender]++;
                } else {
                    userLeaderBoard[messageSender] = 1;
                }
            }
        });
        const sortedUsers = Object.entries(userLeaderBoard).sort(([, a], [, b]) => b - a);
        const topUsers = sortedUsers.slice(0, 10);
        let leaderboardString = "Top 10 Most Active Users:\n";
        topUsers.forEach((user, index) => {
            userPart = `${index + 1}. ${user[0]} `
            messagePart = ` ${user[1] / 2} messages\n`
            leaderboardString += userPart.padEnd(15, '-') + messagePart;
        });
        statsOut = `Memory File: ${fileSizeInAppropriateUnits} ${unit}
Total Messages: ${(modelMessages + userMessages) / 2}
-- My Messages: ${modelMessages / 2}
-- All of your messages: ${userMessages / 2}


${leaderboardString}
        `
        await message.reply(`🌀 WhatsGPT: \n${statsOut}`)
        return;
    }

    if (message.fromMe) {
        if (message.body.toLowerCase().startsWith("@everyone")) {
            group = await message.getChat();
            if (!group.isGroup) {
                console.log(`Tried to run /pingall in ${JSON.stringify(group)}`)
                await message.reply("🌀 WhatsGPT: ❌👥 This command must be run in a group.")
            } else {
                group = await client.getChatById(group.id._serialized);
                const mentions = group.participants.map(p => `${p.id.user}@c.us`);
                await group.sendMessage("🌀 WhatsGPT: [utils.ping] " + message.body.substring("@everyone ".length), {
                    mentions: mentions
                });
            }
            return
        }
        if (message.body.startsWith("//")) {
            return;
        }
        if (message.body.startsWith("/")) {
            await message.reply("🌀 WhatsGPT: ❌ That command doesn't exist.");
            return;
        }
    }
    if (message.body.startsWith("//")) {
        return;
    }
    if (message.body.startsWith("/")) {
        await message.reply("🌀 WhatsGPT: ❌🗑️ Only admins can use commands.");
        return;
    }
    if ((message.body.includes("DAN") && message.body.includes("ChatGPT")) || (message.body.includes("ChatGPT") && message.body.toLowerCase().includes("jailbreak"))) {
        await message.reply("🌀 WhatsGPT: ❌ DAN is not allowed.");
        return;
    }
    let chat = await message.getChat();
    if (chat.id._serialized != WhatsGPT) {
        return;
    }
    await message.react('🌀');
    const sender = overrideName || await getPerson(message.author);
    let reply = await message.getQuotedMessage();
    if (reply) {
        if (Math.floor(Date.now() / 1000) - reply.timestamp > 300) {
            prepend = `[reply to a message that is too old to be displayed]    `;
        } else {
            let replyBody = reply.body.replace(/\n/g, " ");
            if (replyBody.length > 30) {
                replyBody = replyBody.substring(0, 30) + "...";
            }
            const replyAuthor = await getPerson(reply.author);
            prepend = `[reply to <${replyAuthor}>: ${replyBody}]    `;
        }
    } else {
        prepend = "";
    }
    let messageHistory = messageHistories[message.from] || [];
    const prompt = `${prepend}<${sender}>: ${message.body}`;
    console.log(`${message.from}: ` + prompt);
    // console.log(chat);
    let result;
    if (message.hasMedia) {
        const media = await message.downloadMedia();
        if (!media) {
            await message.reply("🌀 WhatsGPT: ❌ Sorry! I can't access your attachment.");
            return;
        }
        if (['image', 'audio', 'video'].includes(media.mimetype.split('/')[0])) {
            const data = {
                role: "user",
                parts: [
                    { text: prompt },
                    {
                        inlineData: {
                            mimeType: media.mimetype,
                            data: media.data,
                        }
                    }
                ]
            };
            try {
                result = await sendAIMessage([...messageHistory, data]);
            } catch (error) {
                if (error.status === 429) {
                    result = "❌🚧 Too Many Requests! Try again later.";
                } else if (error.status >= 500) {
                    result = "🚧 Model overloaded!";
                } else throw error;
            }
            messageHistory.push(data)
        } else {
            await message.reply("🌀 WhatsGPT: 📎 Sorry! I don't understand this file type.");
            return;
        }
    } else {
        try {
            result = await sendAIMessage([...messageHistory, { 'role': 'user', parts: [{ text: prompt }] }]);
        } catch (error) {
            if (error.status === 429) {
                result = "❌🚧 Too Many Requests! Try again later.";
            } else if (error.status >= 500) {
                result = "🚧 Model overloaded!";
            } else throw error; // Less likely to be a prompt-related error.
        }
        messageHistory.push({"role": "user", "parts": [{ text: prompt}]})
    }
    if (result.trim() === "") {
        console.log(`I didn't want to say anything in response to ${sender}'s message.`)
        return;
    }
    imaGen = parseResponse(result)
    if (imaGen) {
        image = await create_image(imaGen);
        const media = await MessageMedia.fromUrl(image);
        await message.reply(media, null, { caption: "🌀 WhatsGPT: " + result });
        // await message.reply("🌀 WhatsGPT: " + result + `\n\n🖼️ 1 image attached: ${image}`)
        messageHistory.push({"role": "model", "parts": [{ text: result + "\n\n(🖼️ 1 image attached)"}]});
    } else {
        await message.reply("🌀 WhatsGPT: " + result);
        messageHistory.push({"role": "model", "parts": [{ text: result }]});
    }
    messageHistories[message.from] = messageHistory;
    fs.writeFileSync('messageHistories.json', JSON.stringify(messageHistories));
}

// Listening to all incoming messages
client.on('message_create', async(message) => {
    try {
        await message_create(message);
    } catch (error) {
        try {
            await message.reply(`🌀 WhatsGPT: ❌🚧 Oops! I hit an error:\n\n${error.stack.replaceAll(process.cwd(), ".")}`)
        } catch (error2) {
            console.error(error.stack);
            try {
                await message.reply(`🌀 WhatsGPT: ❌🚧 Oops! I hit an error trying to say that I hit an error.`);
            } catch (error3) {
                console.warn("Nope, still couldn't respond after two tries.");
            }
        }
    }
});

console.log("🌀ing")
client.initialize();
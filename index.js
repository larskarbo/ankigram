const Telegraf = require("telegraf");
const { Router, Markup } = Telegraf;
const { invoke } = require("./anki");
const fs = require("fs-extra");
const path = require("path");
const shuffle = require("shuffle-array");
const { exec } = require("child_process");
const Composer = require("telegraf/composer");
var ffmpeg = require("fluent-ffmpeg");
const db = {
  lars: 912275377,
  cyri: 501141030,
};

const state = {
  done: 0,
};

const { FRENCH_DECK, MISSING_VOICE_DECK, getNotes } = require("./lib");

const bot = new Telegraf("1196576929:AAFCVPBTMcSUlrHAIFBO_Ni7e9em0Nje10U");

invoke("version")
  .then((a) => {
    console.log("Success", a);
  })
  .catch((a) => {
    console.log("error", a);
  });

const refreshState = async (ctx) => {
  try {
    state.notes = await getNotes();
    ctx.reply("ANKI DB:: " + state.notes.length + " words to be recorded");
    return;
  } catch (error) {
    console.error(error);
    // expected output: ReferenceError: nonExistentFunction is not defined
    // Note - error messages will vary depending on browser
    return ctx.reply("Error when fetching notes from anki :(");
  }
};

bot.start((ctx) => ctx.reply("Welcome try /frenchrecord"));
bot.help((ctx) => ctx.reply("Try /frenchrecord"));

bot.command("frenchrecord", async (ctx) => {
  ctx.reply("Starting french sesssion...");
  await refreshState(ctx);
  ctx.reply("Ready! Please record your voice for the words we send.");
  next(ctx);
});

bot.command("sync", async (ctx) => {
  const res = await invoke("sync");
  console.log("res: ", res);
  ctx.reply("good");
});

const next = async (ctx) => {
  const notes = state.notes;

  console.log("notes: ", notes.length);
  if (notes.length == 0) {
    state.word = false;
    ctx.reply("No more words to record! Thanks for the help ♥️");
    return;
  }
  if (state.done % 10 == 0 && state.done > 0) {
    ctx.reply("You have done " + state.done + " words. Good job <3");
  }

  const note = notes[Math.floor(Math.random() * notes.length)];
  state.note = note;
  state.word = note.fields.Word.value;
  state.done++;
  ctx.reply("🎤 (article) + " + state.word);
  console.log("🎤 (article) +  " + state.word);
};

bot.on(["voice"], async (ctx) => {
  if (!state.word) {
    ctx.reply("Sorry, please run /frenchrecord again");
    return;
  }
  state.voicemsg = ctx.message;

  ctx.reply(
    "Good?",
    Markup.inlineKeyboard([
      Markup.callbackButton("Voice is good", "savevoice"),
    ]).extra()
  );
});

bot.action("savevoice", async (ctx) => {
  if (!state.voicemsg) {
    ctx.reply("Sorry, please run /frenchrecord again");
    return;
  }

  if (state.done == 1 || state.done % 10 == 1) {
    ctx.reply("Checking that the recordings are being saved...");
    await saveVoice(
      ctx,
      state.word,
      state.voicemsg.voice.file_id,
      state.note.noteId
    );
    const oldlength = state.notes.length;
    await refreshState(ctx);
    if (state.notes.length == oldlength - 1) {
      ctx.reply("✅ Anki DB operational");
    } else {
      ctx.reply(
        "‼️ Something wrong with Anki db. Write /frenchrecord to try again"
      );
      return;
    }
  } else {
    saveVoice(ctx, state.word, state.voicemsg.voice.file_id, state.note.noteId);
  }

  state.notes = state.notes.filter((n) => n.fields.Word.value != state.word);
  next(ctx);
});

const urlToB64 = (url) => {
  return new Promise((resolve) => {
    ffmpeg(url)
      .output("temp.mp3")
      .on("end", function () {
        console.log("Finished processing");
        const b64 = fs.readFileSync("temp.mp3").toString("base64");
        resolve(b64);
      })
      .run();
  });
};

const saveVoice = async (ctx, word, file_id, noteId) => {
  console.log("Saving voice for word: ", word, file_id, noteId);
  console.log("getting file link");
  const url = await ctx.telegram.getFileLink(file_id);
  console.log("getting file link done");
  const filename = "larsthebot-" + word.replace(/\s/g, "-") + ".mp3";

  b64 = await urlToB64(url);

  await invoke("storeMediaFile", {
    filename: filename,
    data: b64,
  });

  const info = (
    await invoke("notesInfo", {
      notes: [noteId],
    })
  )[0];
  console.log("info: ", info);
  const currentPron = info.fields["Pronunciation (Recording and/or IPA)"].value;
  await invoke("updateNoteFields", {
    note: {
      id: noteId,
      fields: {
        "Pronunciation (Recording and/or IPA)":
          currentPron + "[sound:" + filename + "]",
      },
    },
  });

  await invoke("addTags", {
    notes: [noteId],
    tags: "horses",
  });
};

bot.launch();

bot.command("movecards", async (ctx) => {});

bot.command("ready", async (ctx) => {
  const notes = await getNotes();
  let msg =
    "🌈 Bot is online ready for some recording! " +
    notes.length +
    " sounds needed :)";
  bot.telegram.sendMessage(db["cyri"], msg);
  bot.telegram.sendMessage(db["lars"], msg);

  msg = "try /frenchrecord";
  bot.telegram.sendMessage(db["cyri"], msg);
  bot.telegram.sendMessage(db["lars"], msg);
});

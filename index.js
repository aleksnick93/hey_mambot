require('dotenv').config()
const fs = require('fs')
const path = require('path')
const { Bot, GrammyError, HttpError, InlineKeyboard, session } = require('grammy')
const {
    conversations,
    createConversation,
} = require("@grammyjs/conversations");
const sqlite3 = require('sqlite3').verbose()
const { open } = require('sqlite')
const { createTables, getProjects, recordProjectRequest, addProject} = require("./db")
const { logger } = require('./utils/logger')
const { insertUser, updateUser, recordUserInteraction, isAdmin,
        createKeyboard, getUsageStats, getMessages, erasePrevMessages
} = require('./utils/helpers')

const bot = new Bot(process.env.BOT_API_KEY),
      debugMode = process.env.DEBUG_MODE

bot.use(session({
    initial: () => ({})
}))
bot.use(conversations());

bot.api.setMyCommands([
    {command: 'start', description: 'Добро пожаловать!'},
    {command: 'cancel', description: 'Отменить процесс'}
]);

const startKeyboard = new InlineKeyboard()
    .text('📲 Приложения', 'projects')
    .row()
    .text('🙋‍♂️ Идеи', 'comments')
    .row()
    // .text('Очистить чат [DEBUG]', 'clear_chat')
    // .row()

let db,initMessageId
(async () => {
    const dbPath = './data/hey_mambot.db'

    const dbExists = fs.existsSync(dbPath)

    db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    })

    if (!dbExists) {
        await createTables(db)
    }

    logger.info('Database initialized and connection established')
})()

bot.command('start', async (ctx) => {
    console.log(ctx.from)
    // logger.info(`User ${ctx.from.id} started the bot`)
    await insertUser(db, ctx.from.id, ctx.from.username, ctx.from.first_name, ctx.from.language_code, ctx.from.is_bot, ctx.from.is_premium)
    // await updateUserData(db, ctx.from.id)
    // await bot.sendSticker(ctx.chatId, 'https://data.chpic.su/stickers/c/cockroach_vk/cockroach_vk_047.webp?v=1693991402')
    await ctx.reply('Buenos dias, amigo!\n' +
        'Я - авторский бот для упрощения жизни будущих криптомиллионеров\n\n' +
        '[📲 Приложения] Всё в одном, коллекция криптоигр в телеграмм с листингом или эйрдропом\n' +
        '[🙋‍♂️ Идеи] Предложения по улучшению бота, обратная связь и комментарии автору\n' +
        '🟢 Поддерживает отправку сообщений, фото, видео, аудио/видеосообщений, файлов')
    // await bot.sendSticker(ctx.chatId, 'https://data.chpic.su/stickers/c/cockroach_vk/cockroach_vk_018.webp?v=1693991402')
    let initMsg = await ctx.reply('👇', {
        reply_markup: startKeyboard,
    })

    initMessageId = initMsg.message_id
    await updateUser(db, ctx.from.id, ctx.from.username, initMessageId)
})

bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id, process.env.ADMIN_ID)) return

    const stats = await getUsageStats(db)
    let response = `Статистика: \nВсего запусков: ${stats.totalStarts}\nЗа сегодня: ${stats.todayStarts}\nВзаимодействий всего: ${stats.totalInteractions}\nЗа сегодня: ${stats.todayInteractions}\n\n`

    response += 'Запросы по проектам:\n'
    for (const { title, total } of stats.totalProjectsRequests) {
        const today = stats.todayProjectsRequests.find(n => n.title === title)?.today || 0
        response += `${title} [${today}/${total}]\n`
    }

    await ctx.reply(response)
})


async function setNewProject(conversation, ctx) {
    await ctx.reply(`Добавим новый проект`)
    await ctx.reply(`Как называется?`)
    const projectTitleContext = await conversation.waitFor('message:text')
    await erasePrevMessages(ctx)

    await ctx.reply(`Реферальная ссылка`)
    const projectRefLinkContext = await conversation.waitFor('message:entities:url')
    await erasePrevMessages(ctx)

    await addProject(db, projectTitleContext.message?.text, projectRefLinkContext.message?.text, '')
    await ctx.reply(`Проект добавлен`)
    await erasePrevMessages(ctx, 2)

    await getProjectsKeyboard(ctx)
}

bot.use(createConversation(setNewProject));

// Always exit any conversation upon /cancel
bot.command("cancel", async (ctx) => {
    await ctx.conversation.exit();
    await ctx.reply("Выход из диалога");
    await erasePrevMessages(ctx, initMessageId)
});

bot.use(async (ctx, next) => {
    if (!isAdmin(ctx.from.id, process.env.ADMIN_ID) || process.env.DEBUG_MODE) {
        await recordUserInteraction(db, ctx.from.id)
    }

    return next()
})

// function handleButtonClicks(items, recordRequest, type) {
//     items.forEach(item => {
//         bot.hears(item.title, async (ctx) => {
//             if (!isAdmin(ctx.from.id, process.env.ADMIN_ID) || debugMode) {
//                 await recordUserInteraction(db, ctx.from.id)
//                 await recordRequest(db, ctx.from.id, item.id)
//             }
//
//             const projKeyboard = new Keyboard()
//                 .text('📲 Тапалки')
//                 .row()
//                 .text('🙋‍♂️ Предложка')
//                 .row()
//             await ctx.reply('Выберите действие:', {
//                 reply_markup: startKeyboard,
//             })
//             let message = ''
//             if (item.type === 'projects') {
//                 message = ``
//             }
//
//
//             // if (item.type === 'social') {
//             //     message = `Вот ссылка на ${item.name}: ${item.url}`
//             // } else if (item.type === 'promo') {
//             //     message = `Вот ссылка на ${item.name}: ${item.url}\n\nПромокод: ${item.code}\n\nОписание: ${item.description}`
//             // }
//             await ctx.reply(message)
//         })
//     })
// }
//
// handleButtonClicks(projects, recordProjectRequest, 'projects')

async function getProjectsKeyboard(ctx) {
    const
        projects = await getProjects(db),
        hasAdminRights = isAdmin(ctx.from.id, process.env.ADMIN_ID),
        projectKeyboard = createKeyboard(projects, 'projects', hasAdminRights)
    await ctx.reply('Доступные приложения', {
        reply_markup: projectKeyboard,
    })
}

// Wait for click events with specific callback data.
bot.callbackQuery("projects", async (ctx) => {
    await erasePrevMessages(ctx, initMessageId)
    await getProjectsKeyboard(ctx)
    await ctx.answerCallbackQuery()
});

bot.callbackQuery("add_project", async (ctx) => {
    await erasePrevMessages(ctx, initMessageId)
    await ctx.conversation.enter("setNewProject")
    await ctx.answerCallbackQuery()
});

bot.callbackQuery("menu", async (ctx) => {
    await erasePrevMessages(ctx, initMessageId)
});

bot.callbackQuery('clear_chat', async (ctx) => {
    await erasePrevMessages(ctx, initMessageId)
});

bot.callbackQuery("comments", async (ctx) => {
    if (isAdmin(ctx.from.id, process.env.ADMIN_ID)) {
        console.log('Admin accessed suggestions')
        const adminKeyboard = new InlineKeyboard()
            .text('Все сообщения', 'all_messages')
            .text('❗ Неотвеченные', 'not_response')
            .row()
            .text('Назад ↩️', 'menu')
            .row()
        await ctx.reply('Выберите', {
            reply_markup: adminKeyboard,
        })
        suggestionClicked[ctx.from.id] = true
    } else {
        suggestionClicked[ctx.from.id] = true
        await ctx.reply('Слушаю вас и оправлю комментарий автору')
    }
    await ctx.answerCallbackQuery()
})

// bot.hears('📲 Тапалки', async (ctx) => {
//     const
//         hasAdminRights = isAdmin(ctx.from.id, process.env.ADMIN_ID),
//         projectKeyboard = createKeyboard(projects, 'projects', hasAdminRights)
//     await ctx.reply('По кнопке откроется ссылка на приложение', {
//         reply_markup: projectKeyboard,
//     })
// })

let suggestionClicked = {}
let unreadMessagesCount = 0

// bot.hears('🙋‍♂️ Предложка', async (ctx) => {
//     if (isAdmin(ctx.from.id, process.env.ADMIN_ID)) {
//         console.log('Admin accessed suggestions')
//         const adminKeyboard = new Keyboard()
//             .text('Все сообщения')
//             .text('❗ Неотвеченные')
//             .row()
//             .text('Назад ↩️')
//             .row()
//         await ctx.reply('Выберите', {
//             reply_markup: adminKeyboard,
//         })
//         suggestionClicked[ctx.from.id] = true
//     } else {
//         suggestionClicked[ctx.from.id] = true
//         await ctx.reply('Слушаю вас и оправлю комментарий автору')
//     }
// })

// bot.hears('Все сообщения', async (ctx) => {
bot.callbackQuery("all_messages", async (ctx) => {
    if (!isAdmin(ctx.from.id, process.env.ADMIN_ID)) return
    const messages = await getMessages(db)
    if (messages.length === 0) {
        await ctx.reply('[ Пусто ]')
    } else {
        for (const message of messages) {
            const inlineKeyboard = new InlineKeyboard().text('Ответить', `reply-${message.id}`)
            const userInfo = `Сообщение от ${message.first_name} (@${message.username}, ID: ${message.user_id})`

            if (message.message) {
                await ctx.reply(`${userInfo}: ${message.message}`, { reply_markup: inlineKeyboard })
            } else {
                const mediaType = message.media_type
                if (mediaType === 'photo') {
                    await ctx.api.sendPhoto(ctx.chat.id, message.media_id, {
                        caption: userInfo,
                        reply_markup: inlineKeyboard
                    })
                } else if (mediaType === 'video') {
                    await ctx.api.sendVideo(ctx.chat.id, message.media_id, {
                        caption: userInfo,
                        reply_markup: inlineKeyboard
                    })
                } else if (mediaType === 'document') {
                    await ctx.api.sendDocument(ctx.chat.id, message.media_id, {
                        caption: userInfo,
                        reply_markup: inlineKeyboard
                    })
                } else if (mediaType === 'audio') {
                    await ctx.api.sendAudio(ctx.chat.id, message.media_id, {
                        caption: userInfo,
                        reply_markup: inlineKeyboard
                    })
                } else if (mediaType === 'voice') {
                    await ctx.api.sendVoice(ctx.chat.id, message.media_id, {
                        caption: userInfo,
                        reply_markup: inlineKeyboard
                    })
                } else if (mediaType === 'video_note') {
                    await ctx.api.sendVideoNote(ctx.chat.id, message.media_id, {
                        caption: userInfo,
                        reply_markup: inlineKeyboard
                    })
                }
            }
        }
    }

    await ctx.answerCallbackQuery()
})

// bot.hears('❗ Неотвеченные', async (ctx) => {
bot.callbackQuery("not_response", async (ctx) => {
    if (!isAdmin(ctx.from.id, process.env.ADMIN_ID)) return

    const messages = await getMessages(db, 0)

    if (messages.length === 0) {
        await ctx.reply('[ Пусто ]')
    } else {
        for (const message of messages) {
            const inlineKeyboard = new InlineKeyboard().text('Ответить', `reply-${message.id}`)
            const userInfo = `Сообщение от ${message.first_name} (@${message.username}, ID: ${message.user_id})`

            if (message.message) {
                await ctx.reply(`${userInfo}: ${message.message}`, { reply_markup: inlineKeyboard })
            } else {
                const mediaType = message.media_type
                if (mediaType === 'photo') {
                    await ctx.api.sendPhoto(ctx.chat.id, message.media_id, {
                        caption: userInfo,
                        reply_markup: inlineKeyboard
                    })
                } else if (mediaType === 'video') {
                    await ctx.api.sendVideo(ctx.chat.id, message.media_id, {
                        caption: userInfo,
                        reply_markup: inlineKeyboard
                    })
                } else if (mediaType === 'document') {
                    await ctx.api.sendDocument(ctx.chat.id, message.media_id, {
                        caption: userInfo,
                        reply_markup: inlineKeyboard
                    })
                } else if (mediaType === 'audio') {
                    await ctx.api.sendAudio(ctx.chat.id, message.media_id, {
                        caption: userInfo,
                        reply_markup: inlineKeyboard
                    })
                } else if (mediaType === 'voice') {
                    await ctx.api.sendVoice(ctx.chat.id, message.media_id, {
                        caption: userInfo,
                        reply_markup: inlineKeyboard
                    })
                } else if (mediaType === 'video_note') {
                    await ctx.api.sendVideoNote(ctx.chat.id, message.media_id, {
                        caption: userInfo,
                        reply_markup: inlineKeyboard
                    })
                }
            }
        }
    }

    await ctx.answerCallbackQuery()
})

bot.on('message', async (ctx) => {
    const authorId = process.env.ADMIN_ID
    const fromId = ctx.from.id.toString()

    console.log(`unreadMessagesCount: ${unreadMessagesCount}`)
    console.log(`fromId: ${fromId}, authorId: ${authorId}`)

    if (fromId === authorId && ctx.session.replyToUser) {
        const targetMessageId = ctx.session.replyToMessageId

        await db.run(`UPDATE messages SET replied = 1 WHERE id = ?`, [targetMessageId])
        await ctx.api.sendMessage(ctx.session.replyToUser, 'Автор бота ответил на ваш комментарий')

        if (ctx.message.text) {
            await ctx.api.sendMessage(ctx.session.replyToUser, ctx.message.text)
        } else if (ctx.message.voice) {
            await ctx.api.sendVoice(ctx.session.replyToUser, ctx.message.voice.file_id)
        } else if (ctx.message.video) {
            await ctx.api.sendVideo(ctx.session.replyToUser, ctx.message.video.file_id)
        } else if (ctx.message.photo) {
            const photo = ctx.message.photo.pop()
            await ctx.api.sendPhoto(ctx.session.replyToUser, photo.file_id)
        } else if (ctx.message.audio) {
            await ctx.api.sendAudio(ctx.session.replyToUser, ctx.message.audio.file_id)
        } else if (ctx.message.document) {
            await ctx.api.sendDocument(ctx.session.replyToUser, ctx.message.document.file_id)
        } else if (ctx.message.video_note) {
            await ctx.api.sendVideoNote(ctx.session.replyToUser, ctx.message.video_note.file_id)
        }

        await ctx.reply('Автор рассмотрит ваш комментарий')
        ctx.session.replyToUser = undefined
        ctx.session.replyToMessageId = undefined

        if (unreadMessagesCount > 0) {
            unreadMessagesCount--
        }
        return
    }

    if (suggestionClicked[fromId]) {
        console.log('User sent a suggestion')
        let mediaType = ''
        let mediaId = ''

        if (ctx.message.text) {
            await db.run(`INSERT INTO messages (user_id, message, first_name, username) VALUES (?, ?, ?, ?)`,
                [ctx.from.id, ctx.message.text, ctx.from.first_name, ctx.from.username])
        } else {
            if (ctx.message.photo) {
                const photo = ctx.message.photo.pop()
                mediaType = 'photo'
                mediaId = photo.file_id
            } else if (ctx.message.video) {
                mediaType = 'video'
                mediaId = ctx.message.video.file_id
            } else if (ctx.message.document) {
                mediaType = 'document'
                mediaId = ctx.message.document.file_id
            } else if (ctx.message.audio) {
                mediaType = 'audio'
                mediaId = ctx.message.audio.file_id
            } else if (ctx.message.voice) {
                mediaType = 'voice'
                mediaId = ctx.message.voice.file_id
            } else if (ctx.message.video_note) {
                mediaType = 'video_note'
                mediaId = ctx.message.video_note.file_id
            }

            await db.run(`INSERT INTO messages (user_id, media_type, media_id, first_name, username) VALUES (?, ?, ?, ?, ?)`,
                [ctx.from.id, mediaType, mediaId, ctx.from.first_name, ctx.from.username])
        }

        await ctx.reply('Ваше сообщение успешно отправлено автору бота')
        suggestionClicked[fromId] = false

        unreadMessagesCount++
        console.log(`Admin notified, new unreadMessagesCount: ${unreadMessagesCount}`)
        await ctx.api.sendMessage(authorId, `Вам пришло сообщение. Неотвеченных сообщений: ${unreadMessagesCount}`)
    } else {
        if (fromId !== authorId) {
            console.log('User is not admin and did not click suggestion.')
            await ctx.reply('Пожалуйста, сначала нажмите кнопку "Предложка" для отправки сообщения автору канала!')
        } else {
            console.log('Admin received a new message.')
            unreadMessagesCount++
            console.log(`Admin notified, new unreadMessagesCount: ${unreadMessagesCount}`)
            await ctx.api.sendMessage(authorId, `Вам пришло сообщение. Неотвеченных сообщений: ${unreadMessagesCount}`)
        }
    }
})

bot.callbackQuery(/^reply-(\d+)$/, async (ctx) => {
    const targetMessageId = ctx.match[1]
    const targetMessage = await db.get('SELECT user_id FROM messages WHERE id = ?', [targetMessageId])

    if (targetMessage) {
        ctx.session.replyToUser = targetMessage.user_id
        ctx.session.replyToMessageId = targetMessageId
        await ctx.answerCallbackQuery('Вы можете ответить текстом, аудио, видео или фото')
    } else {
        await ctx.answerCallbackQuery('Сообщение не найдено', { show_alert: true })
    }
})

bot.catch((err) => {
    const ctx = err.ctx
    logger.error(`Error while handling update ${ctx.update.update_id}:`, err)
})

bot.start()
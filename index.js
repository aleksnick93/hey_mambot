require('dotenv').config()
const fs = require('fs')
const path = require('path')
const { Bot, GrammyError, HttpError, Keyboard, InlineKeyboard, session } = require('grammy')
const sqlite3 = require('sqlite3').verbose()
const { open } = require('sqlite')
const { createTables, getProjects, recordProjectRequest } = require("./db")
const { logger } = require('./utils/logger')
const { updateUserData, recordUserInteraction, isAdmin, createKeyboard, getUsageStats, getMessages } = require('./utils/helpers')

const bot = new Bot(process.env.BOT_API_KEY),
      debugMode = process.env.DEBUG_MODE

bot.use(session({
    initial: () => ({})
}))

let db, projects
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

    projects = getProjects(db)

    logger.info('Database initialized and connection established')
})()

bot.command('start', async (ctx) => {
    logger.info(`User ${ctx.from.id} started the bot`)
    await updateUserData(db, ctx.from.id)
    const startKeyboard = new Keyboard()
        .text('📲 Тапалки')
        .row()
        .text('🙋‍♂️ Предложка')
        .row()
    await ctx.sendSticker(undefined, ctx.chatId, undefined, 'https://data.chpic.su/stickers/c/cockroach_vk/cockroach_vk_047.webp?v=1693991402')
    await ctx.reply('Buenos dias, amigo! Я - авторский бот для упрощения жизни будущих криптомиллионеров')
    await ctx.sendSticker(undefined, ctx.chatId, undefined, 'https://data.chpic.su/stickers/c/cockroach_vk/cockroach_vk_018.webp?v=1693991402')
    await ctx.reply('📲 Тапалки - коллекция криптоигр с листингом или эйрдропом')
    await ctx.reply('🙋‍♂️ Предложка - тут ты можешь направить мне сообщение с вопросом или предложить идеи по улучшению сервиса')
    await ctx.reply('🟢 Поддерживает отправку сообщений, фото, видео, аудио/видеосообщений, файлов')
    await ctx.reply('👇', {
        reply_markup: startKeyboard,
    })
})

bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id, process.env.ADMIN_ID)) return

    const stats = await getUsageStats(db)
    let response = `Статистика: \nВсего запусков: ${stats.totalStarts}\nЗа сегодня: ${stats.todayStarts}\nВзаимодействий всего: ${stats.totalInteractions}\nЗа сегодня: ${stats.todayInteractions}\n\n`

    response += 'Запросы по тапалкам:\n'
    for (const { title, total } of stats.totalProjectsRequests) {
        const today = stats.todayProjectsRequests.find(n => n.title === title)?.today || 0
        response += `${title} [${today}/${total}]\n`
    }

    await ctx.reply(response)
})

bot.use(async (ctx, next) => {
    await recordUserInteraction(db, ctx.from.id)
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

bot.hears('📲 Тапалки', async (ctx) => {
    const projectKeyboard = createKeyboard(projects, 'projects')
    await ctx.reply('По кнопке откроется ссылка на приложение', {
        reply_markup: projectKeyboard,
    })
})

bot.hears('Назад ↩️', async (ctx) => {
    const startKeyboard = new Keyboard()
        .text('📲 Тапалки')
        .row()
        .text('🙋‍♂️ Предложка')
        .row()
    await ctx.reply('Выберите действие:', {
        reply_markup: startKeyboard,
    })
})

let suggestionClicked = {}
let unreadMessagesCount = 0

bot.hears('🙋‍♂️ Предложка', async (ctx) => {
    if (isAdmin(ctx.from.id, process.env.ADMIN_ID)) {
        console.log('Admin accessed suggestions')
        const adminKeyboard = new Keyboard()
            .text('Все сообщения')
            .text('❗ Неотвеченные')
            .row()
            .text('Назад ↩️')
            .row()
        await ctx.reply('Выберите', {
            reply_markup: adminKeyboard,
        })
        suggestionClicked[ctx.from.id] = true
    } else {
        suggestionClicked[ctx.from.id] = true
        await ctx.reply('Слушаю вас и оправлю комментарий автору')
    }
})

bot.hears('Все сообщения', async (ctx) => {
    if (!isAdmin(ctx.from.id, process.env.ADMIN_ID)) return
    const messages = await getMessages(db)
    if (messages.length === 0) {
        await ctx.reply('[Пусто]')
    } else {
        for (const message of messages) {
            const inlineKeyboard = new InlineKeyboard().text('Ответить', `reply-${message.id}`)
            const userInfo = `Сообщение от ${message.first_name} (@${message.username}, ID: ${message.userId})`

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
})

bot.hears('❗ Неотвеченные', async (ctx) => {
    if (!isAdmin(ctx.from.id, process.env.ADMIN_ID)) return

    const messages = await getMessages(db, 0)

    if (messages.length === 0) {
        await ctx.reply('Новые сообщения отсутствуют')
    } else {
        for (const message of messages) {
            const inlineKeyboard = new InlineKeyboard().text('Ответить', `reply-${message.id}`)
            const userInfo = `Сообщение от ${message.first_name} (@${message.username}, ID: ${message.userId})`

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
})

bot.on('message', async (ctx) => {
    const authorId = process.env.ADMIN_ID
    const fromId = ctx.from.id.toString()

    console.log(`unreadMessagesCount: ${unreadMessagesCount}`)
    console.log(`fromId: ${fromId}, authorId: ${authorId}`)

    if (fromId === authorId && ctx.session.replyToUser) {
        const targetMessageId = ctx.session.replyToMessageId

        await db.run(`UPDATE messages SET replied = 1 WHERE id = ?`, [targetMessageId])
        await ctx.api.sendMessage(ctx.session.replyToUser, 'На ваше сообщение получен ответ от админа канала.')

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
        console.log('User sent a suggestion.')
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
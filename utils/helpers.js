const { InlineKeyboard} = require('grammy')

async function insertUser(db, userId, username, firstName, language, isBot, isPremium) {
  await db.run(`INSERT OR IGNORE INTO users (id, username, first_name, language_code, is_bot, is_premium) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, username, firstName, language, isBot, isPremium])
}

async function updateUser(db, userId, username, initMessageId) {
  await db.run(`UPDATE users SET run_count = run_count + 1, username = ?, init_message_id = ? WHERE id = ?`, [username, initMessageId, userId])
}

async function getInitMessageId(db, userId) {
  return await db.get(`SELECT init_message_id FROM users WHERE id=?`, [userId])
}

// Функция для записи взаимодействия пользователя
async function recordUserInteraction(db, userId) {
  await db.run(`INSERT INTO interactions (user_id, created_at) VALUES (?, CURRENT_TIMESTAMP)`, [userId])
}

// Функция для проверки, является ли пользователь администратором
function isAdmin(userId, adminId) {
  return userId.toString() === adminId
}

// Функция для создания клавиатуры с кнопками и кнопкой "Назад"
function createKeyboard(items, type, isAdmin) {
  const keyboard = new InlineKeyboard()
  const buttonCount = items.length

  console.log(items, buttonCount)
  for (let idx = 0; idx < buttonCount; idx++) {
    if (type === 'projects') {
      let project_state = items[idx].is_active ? `✅` : `🛑`
      keyboard.url(project_state + ` ` + items[idx].title, items[idx].full_link)
    } else {
      keyboard.text(items[idx].title, items[idx].sys_name)
    }

    if (idx % 2 === 0) keyboard.row()
  }
  keyboard.row()
  if (isAdmin) {
    if (type === 'projects') {
      keyboard.text('Добавить проект', 'add_project').row()
    }
  }
  keyboard.text('Назад ↩️', 'menu')
  return keyboard;
}

async function erasePrevMessages(ctx, messageStartId = 1) {
  // console.log(ctx)
  let lastCtx = await ctx.reply('deleting');
  for(let idx = lastCtx.message_id; idx > messageStartId; idx--) {
    console.log(`chat_id: ${ctx.chat.id}, message_id: ${idx}`);
    try {
      await ctx.api.deleteMessage(ctx.chat.id, idx);
    } catch (e) {
      console.error(e)
      break
    }
  }
}

// Функция для получения статистики использования бота
async function getUsageStats(db) {
  const totalStarts = await db.get(`SELECT SUM(run_count) as total FROM users`)
  const todayStarts = await db.get(`SELECT COUNT(*) as today FROM users WHERE date(lastSeen) = date('now')`)
  const totalInteractions = await db.get(`SELECT COUNT(*) as total FROM interactions`)
  const todayInteractions = await db.get(`SELECT COUNT(*) as today FROM interactions WHERE date(created_at) = date('now')`)

  const totalProjectsRequests = await db.all(`SELECT p.title, COUNT(rp.*) as total FROM request_projects rp 
                                                    INNER JOIN projects p ON rp.project_id = p.id GROUP BY rp.project_id`)
  const todayProjectsRequests = await db.all(`SELECT p.title, COUNT(rp.*) as today FROM request_projects rp 
                                                    INNER JOIN projects p ON rp.project_id = p.id  WHERE date(created_at) = date('now') GROUP BY rp.project_id`)

  return {
    totalStarts: totalStarts.total,
    todayStarts: todayStarts.today,
    totalInteractions: totalInteractions.total,
    todayInteractions: todayInteractions.today,

    totalProjectsRequests,
    todayProjectsRequests
  }
}

// Функция для получения сообщений
async function getMessages(db, replied = null) {
  let query = `SELECT * FROM messages`
  if (replied !== null) {
    query += ` WHERE replied = ?`
  }
  return await db.all(query, replied !== null ? [replied] : [])
}

module.exports = { insertUser, updateUser, getInitMessageId, recordUserInteraction, isAdmin, createKeyboard, erasePrevMessages, getUsageStats, getMessages}

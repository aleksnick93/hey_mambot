const { Keyboard } = require('grammy')

// Функция для обновления данных о пользователе
async function updateUserData(db, userId) {
  await db.run(`INSERT INTO users (id, run_count) VALUES (?, 1)
    ON CONFLICT(id) DO UPDATE SET run_count = run_count + 1`, [userId])
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
function createKeyboard(items, type) {
  const keyboard = new Keyboard()
  const buttonCount = items.length

  for (let idx = 0; idx < buttonCount; idx++) {
    if (type === 'projects') {
      keyboard.webApp(items[idx].title_short + ` 🗗`, items[idx].full_link)
    } else {
      keyboard.text(items[idx].title)
    }

    if (buttonCount % 3 === 0) keyboard.row()
  }

  keyboard.text('Назад ↩️')
  return keyboard
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

module.exports = { updateUserData, recordUserInteraction, isAdmin, createKeyboard, getUsageStats, getMessages}

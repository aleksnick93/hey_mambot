async function createTables(db) {
    await db.exec(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username VARCHAR(100) NOT NULL,
      first_name VARCHAR(100) DEFAULT '' NOT NULL,
      language_code VARCHAR(5) DEFAULT 'ru' NOT NULL,
      run_count INTEGER DEFAULT 0 NOT NULL,
      init_message_id INTEGER DEFAULT 1 NOT NULL,
      is_bot BOOLEAN DEFAULT FALSE NOT NULL,
      is_premium BOOLEAN DEFAULT FALSE NOT NULL,
      last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`)

    await db.exec(`CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title   VARCHAR(100) NOT NULL,
        title_short VARCHAR(25),
        img     VARCHAR(255),
        link    VARCHAR(100) NOT NULL,
        ref_key VARCHAR(50)  NOT NULL,
        ref_id  VARCHAR(30),
        sort INTEGER DEFAULT 1 NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`)

    await db.exec(`create table project_stock_markets (
                   project_id      integer not null
                     constraint FK_project
                       references projects (id),
                   stock_market_id integer not null
                     constraint FK_stock_markets
                       references stock_markets (id),
                   coin VARCHAR(10),
                   listing_at      DATETIME,
                   constraint PK
                     primary key (project_id, stock_market_id)
    )`)

    await db.exec(`CREATE TABLE IF NOT EXISTS stock_markets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title      VARCHAR(255) NOT NULL,
      link       VARCHAR(255) NOT NULL,
      ref_key    VARCHAR(50),
      ref_id     VARCHAR(30),
      sort       INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL 
    )`)

    await db.exec(`CREATE TABLE IF NOT EXISTS interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`)

  await db.exec(`create table request_projects (
                      user_id integer not null
                        constraint FK_users
                          references users (id),
                      project_id      integer not null
                        constraint FK_project
                          references projects (id),
                      created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
                      constraint PK
                        primary key (user_id, project_id)
  )`)

    await db.exec(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      message TEXT,
      media_type TEXT,
      media_id TEXT,
      replied INTEGER DEFAULT 0,
      first_name TEXT,
      username TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`)
}

async function addProject(db, title, refLink, img) {
  let
      titleShort = title.split(' ')[0],
      link = refLink.split('?')[0],
      refKeyFull = refLink.split('?')[1],
      refKey = refKeyFull.split('=')[0],
      refId = refKeyFull.split('=')[1]
  img = img ?? ''
  await db.run(`INSERT INTO projects (title, title_short, link, ref_key, ref_id, img) VALUES (?, ?, ?, ?, ?, ?) 
    ON CONFLICT(id) DO UPDATE SET sort = sort + 1`, [title, titleShort, link, refKey, refId, img])
}

async function getProjects(db) {
  return await db.all(`SELECT p.id, p.title, p.title_short, p.link, (p.link || '?' || p.ref_key || '=' || p.ref_id) AS full_link 
                FROM projects p 
                ORDER BY p.sort, p.id`)
}

// Функция для записи запроса на промокод
async function recordProjectRequest(db, userId, projectId) {
  await db.run(`INSERT INTO request_projects (user_id, project_id) VALUES (?, ?)`, [userId, projectId])
}

module.exports = { createTables, addProject, getProjects, recordProjectRequest }
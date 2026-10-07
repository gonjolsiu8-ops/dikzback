const TelegramBot = require(`node-telegram-bot-api`)
const { Octokit } = require("@octokit/rest")
const fs = require(`fs`)
const path = require('path')
const config = require(`./settings/config`)

// ================== SETTING (EDIT DI SINI) ==================
// Tempat CATBOX thumbnail menu (.jpg / .png / .mp4)
const CATBOX_MP4 = `https://files.catbox.moe/lvh8j9.jpg`

// Tempat GITHUB RAW token.json
const GITHUB_RAW = `https://raw.githubusercontent.com/gonjolsiu8-ops/dikzback/refs/heads/main/token.json`
// ============================================================
const bot = new TelegramBot(config.BOT_TOKEN, { polling: true })

bot.on('polling_error', (err) => {
  console.error('POLLING ERROR:', err.code, err.message)
})


function getMenuMedia() {
  const m = (CATBOX_MP4 || '').trim()
  if (m && /^https?:\/\//i.test(m) && !m.includes('ISI_LINK_CATBOX')) return m
  return `./database/image.png`
}
function sendMenuMedia(chatId, opts) {
  const media = getMenuMedia()
  const isVideo = /\.mp4(\?|$)/i.test(media) || media.includes('.mp4')
  if (isVideo) return bot.sendVideo(chatId, media, opts)
  return bot.sendPhoto(chatId, media, opts)
}


const octokit = new Octokit({ auth: config.GITHUB_TOKEN })

const roleHierarchy = [
  'reseller',
  'partner',
  'moderator',
  'tangankanan',
  'ceo',
  'owner'
]

const AUDIT_CHAT_ID = config.TELEGRAM_ID.toString()

function sendAuditLog(text) {
  bot.sendMessage(AUDIT_CHAT_ID, text, { parse_mode: 'HTML' }).catch(err => {
    console.error('AUDIT ERROR:', err.message)
  })
}

function loadRoles() {
  const defaults = {
    owner: [config.TELEGRAM_ID],
    ceo: [],
    tangankanan: [],
    moderator: [],
    partner: [],
    reseller: []
  }
  if (!fs.existsSync(config.ROLES_FILE)) {
    fs.writeFileSync(config.ROLES_FILE, JSON.stringify(defaults, null, 2))
    return defaults
  }
  const data = JSON.parse(fs.readFileSync(config.ROLES_FILE))
  // migrate key lama (owners -> owner, dll)
  const migrated = { ...defaults }
  for (const key of roleHierarchy) {
    if (Array.isArray(data[key])) migrated[key] = data[key].map(String)
    else if (Array.isArray(data[key + 's'])) migrated[key] = data[key + 's'].map(String)
  }
  return migrated
}

function saveRoles(roles) {
  fs.writeFileSync(config.ROLES_FILE, JSON.stringify(roles, null, 2))
}

let roles = loadRoles()

fs.watch(config.ROLES_FILE, () => {
  try {
    roles = loadRoles()
    console.log('🔄 Roles reloaded')
  } catch (e) {
    console.error('❌ Failed reload roles', e)
  }
})

function getUserRole(userId) {
  userId = String(userId)
  for (let i = roleHierarchy.length - 1; i >= 0; i--) {
    const r = roleHierarchy[i]
    if (roles[r] && roles[r].includes(userId)) return r
  }
  return null
}

function hasAccess(userId, minimumRole) {
  userId = String(userId)
  if (userId === String(config.TELEGRAM_ID)) return true
  const userRole = getUserRole(userId)
  if (!userRole) return false
  return roleHierarchy.indexOf(userRole) >= roleHierarchy.indexOf(minimumRole)
}

function canAddRole(senderId, targetRole) {
  senderId = String(senderId)
  if (senderId === String(config.TELEGRAM_ID)) return true
  const senderRole = getUserRole(senderId)
  if (!senderRole) return false
  return roleHierarchy.indexOf(senderRole) > roleHierarchy.indexOf(targetRole)
}

function removeAllRoles(userId) {
  userId = String(userId)
  for (const key in roles) {
    roles[key] = roles[key].filter(id => id !== userId)
  }
}

function formatRole(role) {
  return role ? role.toUpperCase().replace('_', ' ') : 'TIDAK ADA'
}

function formatUserList(arr) {
  return arr && arr.length ? arr.join('\n') : '-'
}

function mentionUser(user) {
  return `<a href="tg://user?id=${user.id}">${user.first_name}</a>`
}

function formatAuditMessage(action, sender, targetId, role) {
  return `
<blockquote>🔔 <b>ROLE ${action}</b>

👤 By      : ${mentionUser(sender)}
🎯 Target  : <code>${targetId}</code>
🎖️ Role   : <b>${role.toUpperCase()}</b>
⏰ Time    : ${new Date().toLocaleString()}</blockquote>
`.trim()
}

// ====== HELPER: Ambil target ID dari reply atau argumen ======
function resolveTargetId(msg, argId) {
  if (msg.reply_to_message && msg.reply_to_message.from) {
    return String(msg.reply_to_message.from.id)
  }
  if (argId && /^\d+$/.test(argId)) {
    return argId
  }
  return null
}

// ======================= /start =======================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id.toString()
  const firstName = msg.from.first_name || 'User'
  const role = getUserRole(userId)
  const isRoot = userId === String(config.TELEGRAM_ID)

  const menuMessage = `
<blockquote><pre>⬡═―—⊱ ⎧ DATABASE The Luffy ⎭ ⊰―—═⬡</pre></blockquote>
⌑ Developer: @dikznotdev
⌑ Username : ${firstName}
⌑ Role     : ${isRoot ? 'OWNER (ROOT)' : (role ? formatRole(role) : 'TIDAK ADA')}
⌑ Version  : 2.0
⌑ Prefix   : / ( slash )
╘═——————————————═⬡`

  // Button menu sesuai role
  const inlineKeyboard = buildMainMenu(userId)

  sendMenuMedia(chatId, {
    caption: menuMessage,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: inlineKeyboard }
  })
})

function buildMainMenu(userId) {
  const role = getUserRole(userId)
  const isRoot = String(userId) === String(config.TELEGRAM_ID)
  const effectiveRole = isRoot ? 'owner' : role
  const rank = effectiveRole ? roleHierarchy.indexOf(effectiveRole) : -1

  const buttons = []

  if (rank >= roleHierarchy.indexOf('owner'))
    buttons.push([{ text: '👑 OWNER MENU', callback_data: 'menu|owner', style: "success" }])
  if (rank >= roleHierarchy.indexOf('ceo'))
    buttons.push([{ text: '🧠 CEO MENU', callback_data: 'menu|ceo', style: "primary" }])
  if (rank >= roleHierarchy.indexOf('tangankanan'))
    buttons.push([{ text: '🛡️ TANGAN KANAN MENU', callback_data: 'menu|tangankanan', style: "danger" }])
  if (rank >= roleHierarchy.indexOf('moderator'))
    buttons.push([{ text: '🧩 MODERATOR MENU', callback_data: 'menu|moderator', style: "success" }])
  if (rank >= roleHierarchy.indexOf('partner'))
    buttons.push([{ text: '🤝 PARTNER MENU', callback_data: 'menu|partner', style: "primary" }])
  if (rank >= roleHierarchy.indexOf('reseller'))
    buttons.push([{ text: '💼 RESELLER MENU', callback_data: 'menu|reseller', style: "danger" }])

  buttons.push([{ text: '🛠️ BACKUP FILE', callback_data: 'menu|backup', style: "success" }])
  buttons.push([{ text: '𝐃𝐞𝐯𝐞𝐥𝐨𝐩𝐞𝐫', url: 'https://t.me/dikznotdev' }])
  return buttons
}

// Daftar command per role (semua role di bawah atau sama dengan role tsb bisa akses)
const ROLE_COMMANDS = {
  owner: [
    { cmd: '/addowner', desc: 'Add Owner' },
    { cmd: '/delowner', desc: 'Del Owner' },
    { cmd: '/addceo', desc: 'Add CEO' },
    { cmd: '/delceo', desc: 'Del CEO' },
    { cmd: '/addtangankanan', desc: 'Add Tangan Kanan' },
    { cmd: '/deltangankanan', desc: 'Del Tangan Kanan' },
    { cmd: '/addmod', desc: 'Add Moderator' },
    { cmd: '/delmod', desc: 'Del Moderator' },
    { cmd: '/addpartner', desc: 'Add Partner' },
    { cmd: '/delpartner', desc: 'Del Partner' },
    { cmd: '/addreseller', desc: 'Add Reseller' },
    { cmd: '/delreseller', desc: 'Del Reseller' },
    { cmd: '/listrole', desc: 'List Semua Role' },
    { cmd: '/myrole', desc: 'Cek Role' },
    { cmd: '/backup', desc: 'Backup File' },
  ],
  ceo: [
    { cmd: '/addtangankanan', desc: 'Add Tangan Kanan' },
    { cmd: '/deltangankanan', desc: 'Del Tangan Kanan' },
    { cmd: '/addmod', desc: 'Add Moderator' },
    { cmd: '/delmod', desc: 'Del Moderator' },
    { cmd: '/addpartner', desc: 'Add Partner' },
    { cmd: '/delpartner', desc: 'Del Partner' },
    { cmd: '/addreseller', desc: 'Add Reseller' },
    { cmd: '/delreseller', desc: 'Del Reseller' },
    { cmd: '/listrole', desc: 'List Semua Role' },
    { cmd: '/myrole', desc: 'Cek Role' },
    { cmd: '/backup', desc: 'Backup File' },
  ],
  tangankanan: [
    { cmd: '/addmod', desc: 'Add Moderator' },
    { cmd: '/delmod', desc: 'Del Moderator' },
    { cmd: '/addpartner', desc: 'Add Partner' },
    { cmd: '/delpartner', desc: 'Del Partner' },
    { cmd: '/addreseller', desc: 'Add Reseller' },
    { cmd: '/delreseller', desc: 'Del Reseller' },
    { cmd: '/listrole', desc: 'List Semua Role' },
    { cmd: '/myrole', desc: 'Cek Role' },
  ],
  moderator: [
    { cmd: '/addpartner', desc: 'Add Partner' },
    { cmd: '/delpartner', desc: 'Del Partner' },
    { cmd: '/addreseller', desc: 'Add Reseller' },
    { cmd: '/delreseller', desc: 'Del Reseller' },
    { cmd: '/listrole', desc: 'List Semua Role' },
    { cmd: '/myrole', desc: 'Cek Role' },
  ],
  partner: [
    { cmd: '/addreseller', desc: 'Add Reseller' },
    { cmd: '/delreseller', desc: 'Del Reseller' },
    { cmd: '/addtoken', desc: 'Add Token' },
    { cmd: '/deltoken', desc: 'Del Token' },
    { cmd: '/listtoken', desc: 'List Token' },
    { cmd: '/listrole', desc: 'List Semua Role' },
    { cmd: '/myrole', desc: 'Cek Role' },
  ],
  reseller: [
    { cmd: '/addtoken', desc: 'Add Token' },
    { cmd: '/deltoken', desc: 'Del Token' },
    { cmd: '/listtoken', desc: 'List Token' },
    { cmd: '/myrole', desc: 'Cek Role' },
  ]
}

const ROLE_LABEL = {
  owner: '👑 OWNER',
  ceo: '🧠 CEO',
  tangankanan: '🛡️ TANGAN KANAN',
  moderator: '🧩 MODERATOR',
  partner: '🤝 PARTNER',
  reseller: '💼 RESELLER'
}

// ======================= CALLBACK QUERY =======================
bot.on('callback_query', async (query) => {
  const data = query.data
  const chatId = query.message.chat.id
  const msgId = query.message.message_id
  const userId = query.from.id.toString()

  // ===== MENU BUTTON =====
  if (data.startsWith('menu|')) {
    const [, menuRole] = data.split('|')

    if (menuRole === 'backup') {
      // Cek akses (minimal owner atau ceo)
      if (!hasAccess(userId, 'ceo')) {
        return bot.answerCallbackQuery(query.id, { text: '❌ Tidak punya akses', show_alert: true })
      }
      bot.answerCallbackQuery(query.id)
      return handleBackup(chatId, query.from)
    }

    const cmds = ROLE_COMMANDS[menuRole]
    if (!cmds) return bot.answerCallbackQuery(query.id)

    // Cek akses
    if (!hasAccess(userId, menuRole)) {
      return bot.answerCallbackQuery(query.id, { text: '❌ Tidak punya akses', show_alert: true })
    }

    const cmdList = cmds.map(c => `⌑ <code>${c.cmd}</code> - ${c.desc}`).join('\n')
    const text = `
<blockquote><pre>⬡═―—⊱ ⎧ ${ROLE_LABEL[menuRole]} MENU ⎭ ⊰―—═⬡</pre></blockquote>
${cmdList}
╘═——————————————═⬡

<i>💡 Tip: Ketik command atau <b>reply pesan user</b> lalu ketik command (tanpa ID)</i>`

    // Build inline keyboard dari daftar command
    const keyboard = []
    for (let i = 0; i < cmds.length; i += 2) {
      const row = [{ text: cmds[i].cmd, callback_data: `cmdinfo|${cmds[i].cmd}`, style: "primary" }]
      if (cmds[i + 1]) row.push({ text: cmds[i + 1].cmd, callback_data: `cmdinfo|${cmds[i + 1].cmd}`, style: "danger" })
      keyboard.push(row)
    }
    keyboard.push([{ text: '🔙 Kembali', callback_data: 'menu|back', style: "success" }])

    bot.answerCallbackQuery(query.id)
    return bot.sendMessage(chatId, text.trim(), {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard }
    })
  }

  if (data === 'menu|back') {
    bot.answerCallbackQuery(query.id)
    return bot.sendMessage(chatId, '🏠 Kembali ke menu utama, ketik /start')
  }

  // ===== CMDINFO (info format command) =====
  if (data.startsWith('cmdinfo|')) {
    const [, cmd] = data.split('|')
    bot.answerCallbackQuery(query.id)
    return sendCommandFormat(chatId, cmd)
  }

  // ===== ADDROLE CALLBACK =====
  if (data.startsWith('addrole|')) {
    const [, targetRole, targetId] = data.split('|')
    const senderRole = userId === String(config.TELEGRAM_ID) ? 'owner' : getUserRole(userId)

    if (!senderRole) {
      return bot.answerCallbackQuery(query.id, { text: '❌ Tidak punya akses', show_alert: true })
    }

    const senderRank = roleHierarchy.indexOf(senderRole)
    const targetRank = roleHierarchy.indexOf(targetRole)

    if (targetRank === -1) {
      return bot.answerCallbackQuery(query.id, { text: '❌ Role tidak valid', show_alert: true })
    }

    if (senderRank <= targetRank) {
      return bot.answerCallbackQuery(query.id, { text: '❌ Tidak boleh menambahkan role ini', show_alert: true })
    }

    const currentRole = getUserRole(targetId)
    if (currentRole === targetRole) {
      return bot.answerCallbackQuery(query.id, { text: '❌ User sudah memiliki role ini', show_alert: true })
    }
    if (currentRole && roleHierarchy.indexOf(currentRole) > targetRank) {
      return bot.answerCallbackQuery(query.id, { text: '❌ Tidak bisa menurunkan role user', show_alert: true })
    }

    removeAllRoles(targetId)
    roles[targetRole].push(String(targetId))
    saveRoles(roles)

    bot.editMessageText(
      `✅ Role berhasil diubah\n\n👤 ID: <code>${targetId}</code>\n🎖️ Role: ${formatRole(targetRole)}`,
      { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }
    )
    sendAuditLog(formatAuditMessage('ADDED', query.from, targetId, targetRole))
    return bot.answerCallbackQuery(query.id)
  }

  // ===== DELROLE CALLBACK =====
  if (data.startsWith('delrole|')) {
    const [, targetRole, targetId] = data.split('|')
    const senderRole = userId === String(config.TELEGRAM_ID) ? 'owner' : getUserRole(userId)

    if (!senderRole) {
      return bot.answerCallbackQuery(query.id, { text: '❌ Tidak punya akses', show_alert: true })
    }

    const senderRank = roleHierarchy.indexOf(senderRole)
    const targetRank = roleHierarchy.indexOf(targetRole)

    if (targetRank === -1 || senderRank <= targetRank) {
      return bot.answerCallbackQuery(query.id, { text: '❌ Tidak boleh menghapus role ini', show_alert: true })
    }

    const currentRole = getUserRole(targetId)
    if (currentRole !== targetRole) {
      return bot.answerCallbackQuery(query.id, { text: '❌ User tidak memiliki role ini', show_alert: true })
    }

    roles[targetRole] = roles[targetRole].filter(id => id !== String(targetId))
    saveRoles(roles)

    bot.editMessageText(
      `✅ Role berhasil dihapus\n\n👤 ID: <code>${targetId}</code>\n🗑️ Role: ${formatRole(targetRole)}`,
      { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }
    )
    sendAuditLog(formatAuditMessage('REMOVED', query.from, targetId, targetRole))
    return bot.answerCallbackQuery(query.id)
  }

  // ===== TOKEN CALLBACK =====
  if (data.startsWith('token|')) {
    const [, action, token] = data.split('|')
    if (!hasAccess(userId, 'reseller')) {
      return bot.answerCallbackQuery(query.id, { text: '❌ Tidak punya akses', show_alert: true })
    }

    const maskToken = (t) => t.length <= 8 ? '*'.repeat(t.length) : t.slice(0, 4) + '*'.repeat(t.length - 8) + t.slice(-4)

    try {
      const { data: file } = await octokit.rest.repos.getContent({
        owner: config.GITHUB_OWNER, repo: config.GITHUB_REPO, path: config.GITHUB_PATH
      })
      const content = Buffer.from(file.content, 'base64').toString()
      const json = JSON.parse(content)
      json.tokens ||= []

      if (action === 'add' && json.tokens.includes(token)) {
        return bot.answerCallbackQuery(query.id, { text: '⚠️ Token sudah terdaftar' })
      }
      if (action === 'del' && !json.tokens.includes(token)) {
        return bot.answerCallbackQuery(query.id, { text: '⚠️ Token tidak ditemukan' })
      }

      if (action === 'add') json.tokens.push(token)
      if (action === 'del') json.tokens = json.tokens.filter(t => t !== token)

      await octokit.rest.repos.createOrUpdateFileContents({
        owner: config.GITHUB_OWNER, repo: config.GITHUB_REPO, path: config.GITHUB_PATH,
        message: `${action} token`,
        content: Buffer.from(JSON.stringify(json, null, 2)).toString('base64'),
        sha: file.sha
      })

      bot.editMessageText(
        `<blockquote>✅ <b>Token berhasil ${action === 'add' ? 'ditambahkan' : 'dihapus'}</b></blockquote>\n🔑 <code>${maskToken(token)}</code>`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }
      )
      sendAuditLog(`<blockquote>🔐 <b>TOKEN ${action === 'add' ? 'DITAMBAHKAN' : 'DIHAPUS'}</b>\n👤 ${query.from.first_name}\n🆔 <code>${userId}</code>\n🔑 <code>${token}</code></blockquote>`)
      return bot.answerCallbackQuery(query.id)
    } catch (e) {
      return bot.answerCallbackQuery(query.id, { text: '❌ Error: ' + e.message, show_alert: true })
    }
  }
})

// ======= HELPER: Kirim format command =======
function sendCommandFormat(chatId, cmd) {
  const formats = {
    '/addowner':      { usage: '/addowner [ID atau reply user]',      desc: 'Tambah Owner baru' },
    '/delowner':      { usage: '/delowner [ID atau reply user]',      desc: 'Hapus Owner' },
    '/addceo':        { usage: '/addceo [ID atau reply user]',        desc: 'Tambah CEO baru' },
    '/delceo':        { usage: '/delceo [ID atau reply user]',        desc: 'Hapus CEO' },
    '/addtangankanan':{ usage: '/addtangankanan [ID atau reply user]',desc: 'Tambah Tangan Kanan' },
    '/deltangankanan':{ usage: '/deltangankanan [ID atau reply user]',desc: 'Hapus Tangan Kanan' },
    '/addmod':        { usage: '/addmod [ID atau reply user]',        desc: 'Tambah Moderator' },
    '/delmod':        { usage: '/delmod [ID atau reply user]',        desc: 'Hapus Moderator' },
    '/addpartner':    { usage: '/addpartner [ID atau reply user]',    desc: 'Tambah Partner' },
    '/delpartner':    { usage: '/delpartner [ID atau reply user]',    desc: 'Hapus Partner' },
    '/addreseller':   { usage: '/addreseller [ID atau reply user]',   desc: 'Tambah Reseller' },
    '/delreseller':   { usage: '/delreseller [ID atau reply user]',   desc: 'Hapus Reseller' },
    '/addtoken':      { usage: '/addtoken [token]',                   desc: 'Tambah Bot Token' },
    '/deltoken':      { usage: '/deltoken [token]',                   desc: 'Hapus Bot Token' },
    '/listtoken':     { usage: '/listtoken',                          desc: 'Lihat semua token' },
    '/listrole':      { usage: '/listrole',                           desc: 'Lihat semua role' },
    '/myrole':        { usage: '/myrole',                             desc: 'Cek role kamu' },
    '/backup':        { usage: '/backup',                             desc: 'Backup semua file ke GitHub' },
  }

  const info = formats[cmd]
  if (!info) return

  const text = `
<blockquote>📌 <b>Format Command</b>

⌑ Command : <code>${cmd}</code>
⌑ Fungsi  : ${info.desc}

<b>Cara pakai:</b>
1️⃣ Dengan ID langsung:
<code>${info.usage}</code>

2️⃣ Dengan reply pesan user:
Reply pesan user, lalu ketik:
<code>${cmd}</code>

⚠️ ID bisa dilihat dari /listrole atau /myrole</blockquote>`

  bot.sendMessage(chatId, text.trim(), { parse_mode: 'HTML' })
}

// ======= GENERIC ADD ROLE HANDLER =======
function makeAddRoleHandler(targetRole, minimumSenderRole) {
  return (msg, match) => {
    const chatId = msg.chat.id
    const senderId = msg.from.id.toString()
    const argId = match ? match[1] : null
    const targetId = resolveTargetId(msg, argId)

    if (!hasAccess(senderId, minimumSenderRole)) {
      return bot.sendMessage(chatId, `❌ ☇ Tidak punya akses`)
    }

    if (!targetId) {
      return bot.sendMessage(chatId,
        `<blockquote>📌 <b>Format Command</b>\n\nGunakan:\n<code>/add${targetRole} 123456789</code>\n\natau <b>reply pesan user</b> lalu ketik:\n<code>/add${targetRole}</code></blockquote>`,
        { parse_mode: 'HTML' })
    }

    if (!canAddRole(senderId, targetRole)) {
      return bot.sendMessage(chatId, `❌ ☇ Tidak bisa menambahkan role ${formatRole(targetRole)}`)
    }

    const currentRole = getUserRole(targetId)
    if (currentRole === targetRole) {
      return bot.sendMessage(chatId, `❌ ☇ User sudah punya role <b>${formatRole(targetRole)}</b>`, { parse_mode: 'HTML' })
    }
    if (currentRole && roleHierarchy.indexOf(currentRole) > roleHierarchy.indexOf(targetRole)) {
      return bot.sendMessage(chatId, `❌ ☇ Tidak bisa menurunkan role user`)
    }

    removeAllRoles(targetId)
    if (!Array.isArray(roles[targetRole])) roles[targetRole] = []
    roles[targetRole].push(String(targetId))
    saveRoles(roles)

    bot.sendMessage(chatId,
      `<blockquote>✅ <b>Berhasil!</b>\n\n👤 ID : <code>${targetId}</code>\n🎖️ Role : <b>${formatRole(targetRole)}</b>\n⏰ Time : ${new Date().toLocaleString()}</blockquote>`,
      { parse_mode: 'HTML' })
    sendAuditLog(formatAuditMessage('ADDED', msg.from, targetId, targetRole))
  }
}

// ======= GENERIC DEL ROLE HANDLER =======
function makeDelRoleHandler(targetRole, minimumSenderRole) {
  return (msg, match) => {
    const chatId = msg.chat.id
    const senderId = msg.from.id.toString()
    const argId = match ? match[1] : null
    const targetId = resolveTargetId(msg, argId)

    if (!hasAccess(senderId, minimumSenderRole)) {
      return bot.sendMessage(chatId, `❌ ☇ Tidak punya akses`)
    }

    if (!targetId) {
      return bot.sendMessage(chatId,
        `<blockquote>📌 <b>Format Command</b>\n\nGunakan:\n<code>/del${targetRole} 123456789</code>\n\natau <b>reply pesan user</b> lalu ketik:\n<code>/del${targetRole}</code></blockquote>`,
        { parse_mode: 'HTML' })
    }

    // Tidak boleh hapus root owner
    if (targetRole === 'owner' && String(targetId) === String(config.TELEGRAM_ID)) {
      return bot.sendMessage(chatId, `❌ ☇ Owner utama tidak bisa dihapus`)
    }

    // Tidak boleh hapus diri sendiri
    if (String(targetId) === senderId) {
      return bot.sendMessage(chatId, `❌ ☇ Tidak bisa hapus akses sendiri`)
    }

    const currentRole = getUserRole(targetId)
    if (currentRole !== targetRole) {
      return bot.sendMessage(chatId, `❌ ☇ User tidak punya role <b>${formatRole(targetRole)}</b>`, { parse_mode: 'HTML' })
    }

    if (!canAddRole(senderId, targetRole)) {
      return bot.sendMessage(chatId, `❌ ☇ Tidak bisa menghapus role ${formatRole(targetRole)}`)
    }

    roles[targetRole] = roles[targetRole].filter(id => id !== String(targetId))
    saveRoles(roles)

    bot.sendMessage(chatId,
      `<blockquote>✅ <b>Role Dihapus!</b>\n\n👤 ID : <code>${targetId}</code>\n🗑️ Role : <b>${formatRole(targetRole)}</b>\n⏰ Time : ${new Date().toLocaleString()}</blockquote>`,
      { parse_mode: 'HTML' })
    sendAuditLog(formatAuditMessage('REMOVED', msg.from, targetId, targetRole))
  }
}

// ======= DAFTARKAN SEMUA COMMAND ADD/DEL ROLE =======
bot.onText(/\/addowner(?:\s+(\d+))?/, makeAddRoleHandler('owner', 'owner'))
bot.onText(/\/delowner(?:\s+(\d+))?/, makeDelRoleHandler('owner', 'owner'))
bot.onText(/\/addceo(?:\s+(\d+))?/, makeAddRoleHandler('ceo', 'owner'))
bot.onText(/\/delceo(?:\s+(\d+))?/, makeDelRoleHandler('ceo', 'owner'))
bot.onText(/\/addtangankanan(?:\s+(\d+))?/, makeAddRoleHandler('tangankanan', 'ceo'))
bot.onText(/\/deltangankanan(?:\s+(\d+))?/, makeDelRoleHandler('tangankanan', 'ceo'))
bot.onText(/\/addmod(?:\s+(\d+))?/, makeAddRoleHandler('moderator', 'tangankanan'))
bot.onText(/\/delmod(?:\s+(\d+))?/, makeDelRoleHandler('moderator', 'tangankanan'))
bot.onText(/\/addpartner(?:\s+(\d+))?/, makeAddRoleHandler('partner', 'moderator'))
bot.onText(/\/delpartner(?:\s+(\d+))?/, makeDelRoleHandler('partner', 'moderator'))
bot.onText(/\/addreseller(?:\s+(\d+))?/, makeAddRoleHandler('reseller', 'partner'))
bot.onText(/\/delreseller(?:\s+(\d+))?/, makeDelRoleHandler('reseller', 'partner'))

// ======= /addrole & /delrole (pilih role via button) =======
bot.onText(/\/addrole(?:\s+(\d+))?/, (msg, match) => {
  const chatId = msg.chat.id
  const senderId = msg.from.id.toString()
  const argId = match[1]
  const targetId = resolveTargetId(msg, argId)

  if (!targetId) {
    return bot.sendMessage(chatId,
      `<blockquote>📌 <b>Format:</b>\n<code>/addrole 123456789</code>\natau <b>reply pesan user</b> lalu ketik <code>/addrole</code></blockquote>`,
      { parse_mode: 'HTML' })
  }

  const senderRole = senderId === String(config.TELEGRAM_ID) ? 'owner' : getUserRole(senderId)
  if (!senderRole) return bot.sendMessage(chatId, '❌ Tidak punya akses')

  const senderRank = roleHierarchy.indexOf(senderRole)
  const availableRoles = roleHierarchy.filter((_, i) => i < senderRank)
  if (!availableRoles.length) return bot.sendMessage(chatId, '❌ Tidak ada role yang bisa ditambahkan')

  const keyboard = availableRoles.map(role => ([{
    text: formatRole(role),
    callback_data: `addrole|${role}|${targetId}`,
    style: "success"
  }]))

  bot.sendMessage(chatId,
    `<blockquote>⚙️ <b>Pilih Role</b>\n\n🆔 <b>Target ID:</b> <code>${targetId}</code>\n\nPilih role yang ingin diberikan:</blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } })
})

bot.onText(/\/delrole(?:\s+(\d+))?/, (msg, match) => {
  const chatId = msg.chat.id
  const senderId = msg.from.id.toString()
  const argId = match[1]
  const targetId = resolveTargetId(msg, argId)

  if (!targetId) {
    return bot.sendMessage(chatId,
      `<blockquote>📌 <b>Format:</b>\n<code>/delrole 123456789</code>\natau <b>reply pesan user</b> lalu ketik <code>/delrole</code></blockquote>`,
      { parse_mode: 'HTML' })
  }

  const senderRole = senderId === String(config.TELEGRAM_ID) ? 'owner' : getUserRole(senderId)
  if (!senderRole) return bot.sendMessage(chatId, '❌ Tidak punya akses')

  const senderRank = roleHierarchy.indexOf(senderRole)
  const removableRoles = roleHierarchy.filter((_, i) => i < senderRank)
  if (!removableRoles.length) return bot.sendMessage(chatId, '❌ Tidak ada role yang bisa dihapus')

  const keyboard = removableRoles.map(role => ([{
    text: formatRole(role),
    callback_data: `delrole|${role}|${targetId}`,
    style: "primary"
  }]))

  bot.sendMessage(chatId,
    `<blockquote>🗑️ <b>Hapus Role</b>\n\n🆔 <b>Target ID:</b> <code>${targetId}</code>\n\nPilih role yang ingin dihapus:</blockquote>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } })
})

// ======= /listrole =======
bot.onText(/\/listrole/, (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id.toString()
  if (!hasAccess(userId, 'partner')) return bot.sendMessage(chatId, '❌ Tidak punya akses')

  const text = `
<blockquote>📋 <b>Daftar Role Sistem</b>

👑 <b>OWNER</b>
${formatUserList(roles.owner)}

🧠 <b>CEO</b>
${formatUserList(roles.ceo)}

🛡️ <b>TANGAN KANAN</b>
${formatUserList(roles.tangankanan)}

🧩 <b>MODERATOR</b>
${formatUserList(roles.moderator)}

🤝 <b>PARTNER</b>
${formatUserList(roles.partner)}

💼 <b>RESELLER</b>
${formatUserList(roles.reseller)}</blockquote>`

  bot.sendMessage(chatId, text.trim(), { parse_mode: 'HTML' })
})

// ======= /myrole =======
bot.onText(/\/myrole/, (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id.toString()
  const isRoot = userId === String(config.TELEGRAM_ID)
  const role = isRoot ? 'owner' : getUserRole(userId)

  if (!role) {
    return bot.sendMessage(chatId, '❌ Kamu belum memiliki role.', { parse_mode: 'HTML' })
  }

  bot.sendMessage(chatId,
    `<blockquote>👤 <b>Info Akun</b>\n\n🆔 <b>ID:</b> <code>${userId}</code>\n🎖️ <b>Role:</b> ${formatRole(role)}${isRoot ? ' (ROOT)' : ''}</blockquote>`,
    { parse_mode: 'HTML' })
})

// ======= TOKEN COMMANDS =======
const maskToken = (t) => t.length <= 8 ? '*'.repeat(t.length) : t.slice(0, 4) + '*'.repeat(t.length - 8) + t.slice(-4)

bot.onText(/\/addtoken(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id.toString()
  const token = match?.[1]?.trim()

  if (!hasAccess(userId, 'reseller')) return bot.sendMessage(chatId, '❌ ☇ Tidak punya akses')

  if (!token) {
    return bot.sendMessage(chatId,
      `<blockquote>📌 <b>Format:</b></blockquote>\n<code>/addtoken 836581XXXX:AAEHDHXXXXXXXXX</code>\n<blockquote>⚠️ Kirim di <b>private chat</b></blockquote>`,
      { parse_mode: 'HTML' })
  }

  if (msg.chat.type !== 'private') {
    try { await bot.deleteMessage(chatId, msg.message_id) } catch {}
  }

  try {
    const { data: file } = await octokit.rest.repos.getContent({
      owner: config.GITHUB_OWNER, repo: config.GITHUB_REPO, path: config.GITHUB_PATH
    })
    const content = Buffer.from(file.content, 'base64').toString()
    const json = JSON.parse(content)
    json.tokens ||= []

    if (json.tokens.includes(token)) {
      return bot.sendMessage(chatId, `<blockquote>⚠️ Token sudah terdaftar</blockquote>\n🔑 <code>${maskToken(token)}</code>`, { parse_mode: 'HTML' })
    }

    json.tokens.push(token)
    await octokit.rest.repos.createOrUpdateFileContents({
      owner: config.GITHUB_OWNER, repo: config.GITHUB_REPO, path: config.GITHUB_PATH,
      message: 'add token',
      content: Buffer.from(JSON.stringify(json, null, 2)).toString('base64'),
      sha: file.sha
    })

    bot.sendMessage(chatId, `<blockquote>✅ Token berhasil ditambahkan</blockquote>\n🔑 <code>${maskToken(token)}</code>`, { parse_mode: 'HTML' })
    sendAuditLog(`<blockquote>🔐 <b>TOKEN DITAMBAHKAN</b>\n👤 ${msg.from.first_name}\n🆔 <code>${userId}</code>\n🔑 <code>${token}</code></blockquote>`)
  } catch (e) {
    if (e.status === 404) {
      const json = { tokens: [token] }
      await octokit.rest.repos.createOrUpdateFileContents({
        owner: config.GITHUB_OWNER, repo: config.GITHUB_REPO, path: config.GITHUB_PATH,
        message: 'init tokens',
        content: Buffer.from(JSON.stringify(json, null, 2)).toString('base64')
      })
      bot.sendMessage(chatId, `<blockquote>✅ Token berhasil ditambahkan</blockquote>\n🔑 <code>${maskToken(token)}</code>`, { parse_mode: 'HTML' })
      sendAuditLog(`<blockquote>🔐 <b>TOKEN DITAMBAHKAN</b>\n👤 ${msg.from.first_name}\n🆔 <code>${userId}</code>\n🔑 <code>${token}</code></blockquote>`)
    } else {
      bot.sendMessage(chatId, `❌ Error: ${e.message}`)
    }
  }
})

bot.onText(/\/deltoken(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id.toString()
  const token = match?.[1]?.trim()

  if (!hasAccess(userId, 'reseller')) return bot.sendMessage(chatId, '❌ ☇ Tidak punya akses')

  if (!token) {
    return bot.sendMessage(chatId,
      `<blockquote>📌 <b>Format:</b></blockquote>\n<code>/deltoken 836581XXXX:AAEHDHXXXXXXXXX</code>`,
      { parse_mode: 'HTML' })
  }

  if (msg.chat.type !== 'private') {
    try { await bot.deleteMessage(chatId, msg.message_id) } catch {}
  }

  try {
    const { data: file } = await octokit.rest.repos.getContent({
      owner: config.GITHUB_OWNER, repo: config.GITHUB_REPO, path: config.GITHUB_PATH
    })
    const json = JSON.parse(Buffer.from(file.content, 'base64').toString())
    json.tokens ||= []

    if (!json.tokens.includes(token)) {
      return bot.sendMessage(chatId, `⚠️ Token tidak ditemukan: <code>${maskToken(token)}</code>`, { parse_mode: 'HTML' })
    }

    json.tokens = json.tokens.filter(t => t !== token)
    await octokit.rest.repos.createOrUpdateFileContents({
      owner: config.GITHUB_OWNER, repo: config.GITHUB_REPO, path: config.GITHUB_PATH,
      message: 'delete token',
      content: Buffer.from(JSON.stringify(json, null, 2)).toString('base64'),
      sha: file.sha
    })

    bot.sendMessage(chatId, `<blockquote>✅ Token berhasil dihapus</blockquote>\n🔑 <code>${maskToken(token)}</code>`, { parse_mode: 'HTML' })
    sendAuditLog(`<blockquote>🗑️ <b>TOKEN DIHAPUS</b>\n👤 ${msg.from.first_name}\n🆔 <code>${userId}</code>\n🔑 <code>${token}</code></blockquote>`)
  } catch (e) {
    if (e.status === 404) return bot.sendMessage(chatId, '⚠️ Data token belum tersedia', { parse_mode: 'HTML' })
    bot.sendMessage(chatId, `❌ Error: ${e.message}`)
  }
})

bot.onText(/\/listtoken$/, async (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id.toString()

  if (!hasAccess(userId, 'reseller')) return bot.sendMessage(chatId, '❌ ☇ Tidak punya akses')

  try {
    const { data: file } = await octokit.rest.repos.getContent({
      owner: config.GITHUB_OWNER, repo: config.GITHUB_REPO, path: config.GITHUB_PATH
    })
    const json = JSON.parse(Buffer.from(file.content, 'base64').toString())

    if (!json.tokens || json.tokens.length === 0) {
      return bot.sendMessage(chatId, 'ℹ️ Tidak ada token tersimpan')
    }

    const list = json.tokens.map((t, i) => `${i + 1}. <code>${maskToken(t)}</code>`).join('\n')
    bot.sendMessage(chatId, `<blockquote>📄 <b>DAFTAR TOKEN</b>\n\n${list}</blockquote>`, { parse_mode: 'HTML' })
  } catch (e) {
    bot.sendMessage(chatId, '❌ Gagal mengambil token')
  }
})

bot.onText(/\/settoken(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id.toString()
  const token = match?.[1]?.trim()

  if (!hasAccess(userId, 'reseller')) return bot.sendMessage(chatId, '❌ ☇ Tidak punya akses')
  if (!token) {
    return bot.sendMessage(chatId,
      `<blockquote>📌 <b>Format:</b></blockquote>\n<code>/settoken 836581XXXX:AAEHDHXXXXXXXXX</code>`,
      { parse_mode: 'HTML' })
  }

  if (msg.chat.type !== 'private') {
    try { await bot.deleteMessage(chatId, msg.message_id) } catch {}
  }

  bot.sendMessage(chatId,
    `<blockquote>🔐 <b>Manajemen Token</b></blockquote>\n🔑 <b>Token:</b>\n<code>${maskToken(token)}</code>\n<blockquote>Pilih aksi:</blockquote>`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '➕ ADD TOKEN', callback_data: `token|add|${token}`, style: "primary" },
          { text: '🗑️ DEL TOKEN', callback_data: `token|del|${token}`, style: "danger" }
        ]]
      }
    })
})

// ======= BACKUP FILE =======
async function handleBackup(chatId, from) {
  bot.sendMessage(chatId, `<blockquote>⏳ <b>Memproses backup...</b>\nMohon tunggu sebentar.</blockquote>`, { parse_mode: 'HTML' })

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupFolder = `backup/${timestamp}`

    // File-file yang akan dibackup
    const filesToBackup = [
      { localPath: './database/roles.json', remotePath: `${backupFolder}/roles.json` },
      { localPath: './settings/config.js', remotePath: `${backupFolder}/config.js` },
      { localPath: './dikz.js', remotePath: `${backupFolder}/dikz.js` },
      { localPath: './package.json', remotePath: `${backupFolder}/package.json` },
    ]

    let successCount = 0
    let failedFiles = []

    for (const file of filesToBackup) {
      try {
        if (!fs.existsSync(file.localPath)) {
          failedFiles.push(`${file.localPath} (tidak ditemukan)`)
          continue
        }

        const content = fs.readFileSync(file.localPath)
        const encoded = content.toString('base64')

        // Cek apakah file sudah ada di repo (untuk update)
        let sha
        try {
          const existing = await octokit.rest.repos.getContent({
            owner: config.GITHUB_OWNER,
            repo: config.GITHUB_REPO,
            path: file.remotePath
          })
          sha = existing.data.sha
        } catch {}

        await octokit.rest.repos.createOrUpdateFileContents({
          owner: config.GITHUB_OWNER,
          repo: config.GITHUB_REPO,
          path: file.remotePath,
          message: `backup: ${path.basename(file.localPath)} - ${timestamp}`,
          content: encoded,
          ...(sha ? { sha } : {})
        })

        successCount++
      } catch (e) {
        failedFiles.push(`${file.localPath} (${e.message})`)
      }
    }

    // Backup juga token.json dari GitHub jika ada
    try {
      const tokenFile = await octokit.rest.repos.getContent({
        owner: config.GITHUB_OWNER,
        repo: config.GITHUB_REPO,
        path: config.GITHUB_PATH
      })
      const tokenContent = Buffer.from(tokenFile.data.content, 'base64').toString()

      await octokit.rest.repos.createOrUpdateFileContents({
        owner: config.GITHUB_OWNER,
        repo: config.GITHUB_REPO,
        path: `${backupFolder}/token.json`,
        message: `backup: token.json - ${timestamp}`,
        content: Buffer.from(tokenContent).toString('base64')
      })
      successCount++
    } catch (e) {
      failedFiles.push(`token.json (${e.message})`)
    }

    // Buat file info backup
    const backupInfo = {
      timestamp: new Date().toISOString(),
      backed_up_by: from.id,
      backed_up_by_name: from.first_name,
      roles_snapshot: roles,
      files_backed_up: successCount,
      failed: failedFiles
    }

    await octokit.rest.repos.createOrUpdateFileContents({
      owner: config.GITHUB_OWNER,
      repo: config.GITHUB_REPO,
      path: `${backupFolder}/backup_info.json`,
      message: `backup info - ${timestamp}`,
      content: Buffer.from(JSON.stringify(backupInfo, null, 2)).toString('base64')
    })

    const failText = failedFiles.length > 0
      ? `\n⚠️ <b>Gagal:</b>\n${failedFiles.map(f => `• ${f}`).join('\n')}`
      : ''

    bot.sendMessage(chatId,
      `<blockquote>✅ <b>BACKUP BERHASIL!</b>

📁 Folder : <code>${backupFolder}</code>
✔️ File berhasil : <b>${successCount}</b>
👤 Oleh : ${from.first_name} (<code>${from.id}</code>)
⏰ Waktu : ${new Date().toLocaleString()}${failText}

📦 Isi backup:
• roles.json (data akses user)
• config.js
• dikz.js (source bot)
• package.json
• token.json (dari GitHub)
• backup_info.json</blockquote>`,
      { parse_mode: 'HTML' })

    sendAuditLog(`<blockquote>📦 <b>BACKUP DILAKUKAN</b>\n👤 ${from.first_name}\n🆔 <code>${from.id}</code>\n📁 <code>${backupFolder}</code>\n✔️ ${successCount} file berhasil\n⏰ ${new Date().toLocaleString()}</blockquote>`)

  } catch (e) {
    bot.sendMessage(chatId, `❌ Backup gagal: ${e.message}`)
  }
}

bot.onText(/\/backup/, async (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id.toString()

  if (!hasAccess(userId, 'ceo')) {
    return bot.sendMessage(chatId, '❌ ☇ Tidak punya akses (minimal CEO)')
  }

  await handleBackup(chatId, msg.from)
})

// ======= /testaudit =======
bot.onText(/\/testaudit/, (msg) => {
  const userId = msg.from.id.toString()
  if (userId !== String(config.TELEGRAM_ID)) return
  sendAuditLog('✅ AUDIT DM OWNER BERHASIL')
})

console.log('🚀 DATABASE The Luffy v2.0 - BOT STARTED')

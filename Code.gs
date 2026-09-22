/**
 * 興嘉課堂搶答器｜Google Apps Script 後端
 * 1. 建立 Google 試算表後，開啟「擴充功能 → Apps Script」
 * 2. 貼上本檔內容並儲存
 * 3. 執行 setupSheets() 一次並授權
 * 4. 部署為網頁應用程式：執行身分＝我；存取權＝任何人
 */

const SHEETS = {
  ROOMS: 'Rooms',
  PARTICIPANTS: 'Participants',
  BUZZES: 'Buzzes',
  QUESTIONS: 'Questions'
};

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEETS.ROOMS, [
    'roomId', 'code', 'title', 'teacherToken', 'status', 'round', 'createdAt', 'updatedAt'
  ]);
  ensureSheet_(ss, SHEETS.PARTICIPANTS, [
    'participantId', 'roomId', 'name', 'className', 'token', 'score', 'joinedAt', 'active'
  ]);
  ensureSheet_(ss, SHEETS.BUZZES, [
    'buzzId', 'roomId', 'participantId', 'round', 'buzzedAt'
  ]);
  ensureSheet_(ss, SHEETS.QUESTIONS, [
    'questionId', 'type', 'category', 'grade', 'question',
    'optionA', 'optionB', 'optionC', 'optionD', 'answer',
    'explanation', 'score', 'enabled', 'createdAt', 'updatedAt'
  ]);
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  return '設定完成';
}

function doGet() {
  return json_({ ok: true, service: '興嘉課堂搶答器 API' });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = clean_(body.action, 30);
    if (!action) throw new Error('缺少 action');

    if (action === 'teacherLogin') return json_(teacherLogin_(body));
    if (action === 'listQuestions') return json_(listQuestions_(body));
    if (action === 'saveQuestion') return json_(saveQuestion_(body));
    if (action === 'deleteQuestion') return json_(deleteQuestion_(body));
    if (action === 'create') return json_(createRoom_(body));
    if (action === 'join') return json_(joinRoom_(body));
    if (action === 'status') return json_(getState_(body));
    if (action === 'buzz') return json_(buzz_(body));
    if (['open', 'lock', 'waiting', 'end', 'score', 'remove'].includes(action)) {
      return json_(teacherAction_(action, body));
    }
    throw new Error('不支援的操作');
  } catch (err) {
    return json_({ ok: false, error: err.message || '系統發生錯誤' });
  }
}

function createRoom_(body) {
  requireTeacherSession_(body.sessionToken);
  return withLock_(function () {
    const rooms = sheet_(SHEETS.ROOMS);
    let code = '';
    for (let i = 0; i < 20; i++) {
      const candidate = String(Math.floor(100000 + Math.random() * 900000));
      if (!findRoomByCode_(candidate)) { code = candidate; break; }
    }
    if (!code) throw new Error('無法建立房間，請稍後再試');

    const now = new Date().toISOString();
    const roomId = Utilities.getUuid();
    const teacherToken = Utilities.getUuid().replace(/-/g, '');
    rooms.appendRow([
      roomId, code, clean_(body.title, 50) || '興嘉課堂挑戰',
      teacherToken, 'waiting', 0, now, now
    ]);
    return { ok: true, code: code, teacherToken: teacherToken };
  });
}

function teacherLogin_(body) {
  const saved = PropertiesService.getScriptProperties().getProperty('TEACHER_PASSWORD');
  if (!saved) throw new Error('尚未設定教師密碼，請先在 Apps Script 的 Script Properties 新增 TEACHER_PASSWORD');
  if (String(body.password || '') !== saved) throw new Error('教師密碼錯誤');
  const sessionToken = Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('teacherSession:' + sessionToken, '1', 21600);
  return { ok: true, sessionToken: sessionToken, expiresIn: 21600 };
}

function requireTeacherSession_(sessionToken) {
  const token = clean_(sessionToken, 80);
  if (!token || CacheService.getScriptCache().get('teacherSession:' + token) !== '1') {
    throw new Error('教師登入已失效，請重新登入');
  }
}

function listQuestions_(body) {
  requireTeacherSession_(body.sessionToken);
  const keyword = clean_(body.keyword, 50).toLowerCase();
  const type = clean_(body.type, 20);
  const rows = objects_(sheet_(SHEETS.QUESTIONS))
    .filter(q => !type || q.type === type)
    .filter(q => !keyword || [q.category, q.grade, q.question].join(' ').toLowerCase().includes(keyword))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map(q => ({
      id: q.questionId, type: q.type, category: q.category, grade: q.grade,
      question: q.question, optionA: q.optionA, optionB: q.optionB,
      optionC: q.optionC, optionD: q.optionD, answer: q.answer,
      explanation: q.explanation, score: Number(q.score) || 1,
      enabled: q.enabled === true || String(q.enabled).toLowerCase() === 'true',
      updatedAt: q.updatedAt
    }));
  return { ok: true, questions: rows };
}

function saveQuestion_(body) {
  requireTeacherSession_(body.sessionToken);
  return withLock_(function () {
    const q = body.questionData || {};
    const type = clean_(q.type, 20);
    if (!['single', 'truefalse', 'short'].includes(type)) throw new Error('題型不正確');
    const question = clean_(q.question, 500);
    const answer = clean_(q.answer, 500);
    if (!question || !answer) throw new Error('題目與答案為必填');
    if (type === 'single' && (!clean_(q.optionA, 200) || !clean_(q.optionB, 200))) {
      throw new Error('單選題至少需要 A、B 兩個選項');
    }
    const s = sheet_(SHEETS.QUESTIONS), now = new Date().toISOString();
    const id = clean_(q.id, 80) || Utilities.getUuid();
    const values = [
      id, type, clean_(q.category, 50), clean_(q.grade, 30), question,
      clean_(q.optionA, 200), clean_(q.optionB, 200), clean_(q.optionC, 200), clean_(q.optionD, 200),
      answer, clean_(q.explanation, 500), Math.max(1, Math.min(100, Number(q.score) || 1)),
      q.enabled !== false, now, now
    ];
    const old = objects_(s).find(x => x.questionId === id);
    if (old) {
      values[13] = old.createdAt || now;
      s.getRange(old._row, 1, 1, values.length).setValues([values]);
    } else {
      s.appendRow(values);
    }
    return { ok: true, questionId: id };
  });
}

function deleteQuestion_(body) {
  requireTeacherSession_(body.sessionToken);
  return withLock_(function () {
    const s = sheet_(SHEETS.QUESTIONS);
    const found = objects_(s).find(x => x.questionId === clean_(body.questionId, 80));
    if (!found) throw new Error('找不到題目');
    s.deleteRow(found._row);
    return { ok: true };
  });
}

function joinRoom_(body) {
  return withLock_(function () {
    const room = requireRoom_(body.code);
    if (room.status === 'ended') throw new Error('本場活動已結束');
    const name = clean_(body.name, 20);
    if (!name) throw new Error('請輸入姓名');

    const participantId = Utilities.getUuid();
    const participantToken = Utilities.getUuid().replace(/-/g, '');
    sheet_(SHEETS.PARTICIPANTS).appendRow([
      participantId, room.roomId, name, clean_(body.className, 20),
      participantToken, 0, new Date().toISOString(), true
    ]);
    return { ok: true, code: room.code, participantId: participantId, participantToken: participantToken };
  });
}

function buzz_(body) {
  return withLock_(function () {
    const room = requireRoom_(body.code);
    if (room.status !== 'open') {
      throw new Error(room.status === 'locked' ? '本回合已有人搶答' : '老師尚未開放搶答');
    }
    const participant = findParticipantByToken_(room.roomId, clean_(body.participantToken, 80));
    if (!participant || !participant.active) throw new Error('參與者身分已失效，請重新加入');

    const existing = getBuzzes_().find(b => b.roomId === room.roomId && Number(b.round) === Number(room.round));
    if (existing) throw new Error('本回合已有人搶答');

    sheet_(SHEETS.BUZZES).appendRow([
      Utilities.getUuid(), room.roomId, participant.participantId,
      room.round, new Date().toISOString()
    ]);
    updateRoom_(room._row, { status: 'locked' });
    return { ok: true };
  });
}

function teacherAction_(action, body) {
  return withLock_(function () {
    const room = requireRoom_(body.code);
    if (clean_(body.teacherToken, 80) !== room.teacherToken) throw new Error('教師控制權驗證失敗');

    if (action === 'open') updateRoom_(room._row, { round: Number(room.round) + 1, status: 'open' });
    if (action === 'lock') updateRoom_(room._row, { status: 'locked' });
    if (action === 'waiting') updateRoom_(room._row, { status: 'waiting' });
    if (action === 'end') updateRoom_(room._row, { status: 'ended' });
    if (action === 'score') updateParticipantScore_(room.roomId, body.participantId, Number(body.delta) || 0);
    if (action === 'remove') deactivateParticipant_(room.roomId, body.participantId);
    return Object.assign({ ok: true }, getState_({ code: room.code, teacherToken: room.teacherToken }));
  });
}

function getState_(body) {
  const room = requireRoom_(body.code);
  const participants = getParticipants_()
    .filter(p => p.roomId === room.roomId && p.active)
    .sort((a, b) => Number(b.score) - Number(a.score) || String(a.joinedAt).localeCompare(String(b.joinedAt)))
    .map(p => ({
      id: p.participantId, name: p.name, className: p.className,
      score: Number(p.score), joinedAt: p.joinedAt
    }));
  const allBuzzes = getBuzzes_().filter(b => b.roomId === room.roomId);
  const latest = allBuzzes.find(b => Number(b.round) === Number(room.round));
  let winner = null;
  if (latest) {
    const p = getParticipants_().find(x => x.participantId === latest.participantId);
    if (p) winner = {
      id: p.participantId, name: p.name, className: p.className,
      round: Number(latest.round), buzzedAt: latest.buzzedAt
    };
  }
  let history = [];
  if (clean_(body.teacherToken, 80) === room.teacherToken) {
    history = allBuzzes.map(b => {
      const p = getParticipants_().find(x => x.participantId === b.participantId) || {};
      return { round: Number(b.round), name: p.name || '', className: p.className || '', buzzedAt: b.buzzedAt };
    }).sort((a, b) => b.round - a.round);
  }
  return {
    ok: true,
    room: { code: room.code, title: room.title, status: room.status, round: Number(room.round) },
    participants: participants, winner: winner, history: history
  };
}

function updateRoom_(row, changes) {
  const s = sheet_(SHEETS.ROOMS);
  const headers = headerMap_(s);
  Object.keys(changes).forEach(key => s.getRange(row, headers[key]).setValue(changes[key]));
  s.getRange(row, headers.updatedAt).setValue(new Date().toISOString());
}

function updateParticipantScore_(roomId, participantId, delta) {
  delta = Math.max(-100, Math.min(100, delta));
  const s = sheet_(SHEETS.PARTICIPANTS);
  const rows = objects_(s), headers = headerMap_(s);
  const p = rows.find(x => x.roomId === roomId && x.participantId === participantId && x.active);
  if (!p) throw new Error('找不到學生');
  s.getRange(p._row, headers.score).setValue(Number(p.score) + delta);
}

function deactivateParticipant_(roomId, participantId) {
  const s = sheet_(SHEETS.PARTICIPANTS);
  const rows = objects_(s), headers = headerMap_(s);
  const p = rows.find(x => x.roomId === roomId && x.participantId === participantId);
  if (p) s.getRange(p._row, headers.active).setValue(false);
}

function findRoomByCode_(code) {
  return objects_(sheet_(SHEETS.ROOMS)).find(r => String(r.code) === String(code));
}
function requireRoom_(code) {
  const room = findRoomByCode_(clean_(code, 6));
  if (!room) throw new Error('找不到這個房間');
  return room;
}
function findParticipantByToken_(roomId, token) {
  return getParticipants_().find(p => p.roomId === roomId && p.token === token);
}
function getParticipants_() {
  return objects_(sheet_(SHEETS.PARTICIPANTS)).map(p => Object.assign(p, { active: p.active === true || String(p.active).toLowerCase() === 'true' }));
}
function getBuzzes_() { return objects_(sheet_(SHEETS.BUZZES)); }

function ss_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('請先在 Apps Script 執行 setupSheets()');
  return SpreadsheetApp.openById(id);
}
function sheet_(name) {
  const s = ss_().getSheetByName(name);
  if (!s) throw new Error('缺少工作表：' + name + '，請重新執行 setupSheets()');
  return s;
}
function ensureSheet_(ss, name, headers) {
  let s = ss.getSheetByName(name);
  if (!s) s = ss.insertSheet(name);
  if (s.getLastRow() === 0) {
    s.getRange(1, 1, 1, headers.length).setValues([headers]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#123e52').setFontColor('#ffffff');
    s.autoResizeColumns(1, headers.length);
  }
}
function objects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).map((row, i) => {
    const obj = { _row: i + 2 };
    headers.forEach((h, j) => obj[h] = row[j]);
    return obj;
  });
}
function headerMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((h, i) => map[h] = i + 1);
  return map;
}
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function clean_(value, max) { return String(value == null ? '' : value).trim().substring(0, max || 100); }
function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

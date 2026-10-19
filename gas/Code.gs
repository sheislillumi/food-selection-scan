/**
 * ==========================================================================
 * 地方銀行フードセレクション2026 打刻 - GAS バックエンド (gas/Code.gs)
 * ==========================================================================
 *
 * QRコードから読み取った6桁の数字と打刻日時を ScanLog シートに記録する。
 * このファイルはソース管理用のコピーで、実際に動かすにはスプレッドシート側の
 * Apps Script エディタに内容を貼り付ける(手順は README.md を参照)。
 *
 * ■ シート「ScanLog」(6桁番号の打刻記録) の列見出し(A列〜D列)
 *   ID | 打刻日時 | 6桁番号 | 備考
 *   打刻日時はGASサーバー時刻。6桁番号・打刻日時列はプレインテキスト形式に固定し、
 *   6桁番号は先頭0が消えないよう文字列として保存する。
 *
 * ■ スクリプトプロパティ
 *   ADMIN_API_KEY : logScan / getScanLog 呼び出し時に必須のAPIキー。
 *                   推測されにくいランダム文字列を設定すること。
 *   SPREADSHEET_ID: スタンドアロンのScriptプロジェクトの場合のみ必要
 *                   (スプレッドシートに紐づけて作成した場合は不要)。
 *
 * ■ API
 *   POST {"action":"logScan","apiKey":"...","code":"012345","note":"任意"}
 *        (オフライン再送時は "clientTimestamp":"yyyy-MM-dd HH:mm:ss" も受け取り、備考に残す)
 *   GET  ?action=getScanLog&apiKey=...
 *   レスポンスはすべて { success: true/false, ... } 形式のJSON。
 *   POSTは Content-Type: text/plain でJSON文字列を送る(CORSプリフライト回避)。
 * ==========================================================================
 */

// ==========================================================================
// 設定・定数
// ==========================================================================

var SHEET_NAMES = {
  SCAN_LOG: 'ScanLog'
};

var SCAN_LOG_HEADERS = ['ID', '打刻日時', '6桁番号', '備考'];


// ==========================================================================
// エントリーポイント (doGet / doPost)
// ==========================================================================

/** GET: getScanLog(要APIキー) */
function doGet(e) {
  return handleRequest_(e, ['getScanLog']);
}

/** POST: logScan(要APIキー) */
function doPost(e) {
  return handleRequest_(e, ['logScan']);
}

function handleRequest_(e, allowedActions) {
  var params = parseParams_(e);
  var action = params.action;

  try {
    if (!action) {
      return jsonResponse_(errorResult_('missing_action', 'action パラメータが指定されていません。'));
    }
    if (allowedActions.indexOf(action) === -1) {
      return jsonResponse_(errorResult_('unknown_action', '不明な action、またはこのHTTPメソッドでは使用できない action です: ' + action));
    }

    switch (action) {
      case 'logScan':
        return jsonResponse_(withAdminAuth_(params, logScan_));
      case 'getScanLog':
        return jsonResponse_(withAdminAuth_(params, getScanLog_));
      default:
        return jsonResponse_(errorResult_('unknown_action', '不明な action です: ' + action));
    }
  } catch (err) {
    return jsonResponse_(errorResult_('internal_error', err && err.message ? err.message : String(err)));
  }
}


// ==========================================================================
// action ハンドラ: 6桁番号の打刻
// ==========================================================================

/**
 * 6桁の数字と打刻日時(GASサーバー時刻)を ScanLog シートに記録する。
 * apiKey の照合は handleRequest_ 側の withAdminAuth_ で行う。
 *
 * 必須パラメータ: code(6桁の数字。/^\d{6}$/ に一致しなければ validation_error)
 * 任意パラメータ: note(端末名・場所のメモ)、
 *   clientTimestamp(オフライン時の再送で、読み取り時点の端末時刻。受け取った場合は備考に残す。
 *   打刻日時列は常にサーバー時刻)
 *
 * 同じ code が既に記録済みでも記録は行い、duplicate:true と直近の打刻日時
 * (previousScannedAt)を返す。6桁番号は forcePlainTextValue_ で文字列固定して書き込む。
 */
function logScan_(params) {
  var code = params.code === undefined || params.code === null ? '' : String(params.code);
  if (!/^\d{6}$/.test(code)) {
    return errorResult_('validation_error', 'code は6桁の数字で指定してください。');
  }

  var note = params.note ? String(params.note) : '';
  if (params.clientTimestamp) {
    var clientNote = '端末時刻: ' + String(params.clientTimestamp);
    note = note ? note + ' / ' + clientNote : clientNote;
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getSheet_(SHEET_NAMES.SCAN_LOG);
    var colIndex = buildColumnIndexMap_(SCAN_LOG_HEADERS);

    // 直近の同一番号の打刻日時(シート下方ほど新しい)
    var previousScannedAt = '';
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var values = sheet.getRange(2, 1, lastRow - 1, SCAN_LOG_HEADERS.length).getValues();
      for (var i = values.length - 1; i >= 0; i--) {
        if (normalizeScanCode_(values[i][colIndex['6桁番号']]) === code) {
          previousScannedAt = formatDateTime_(values[i][colIndex['打刻日時']]);
          break;
        }
      }
    }

    var scannedAt = nowString_();
    var newRow = lastRow + 1;
    sheet.getRange(newRow, colIndex['打刻日時'] + 1).setNumberFormat('@');
    sheet.getRange(newRow, colIndex['6桁番号'] + 1).setNumberFormat('@');
    sheet.getRange(newRow, 1, 1, SCAN_LOG_HEADERS.length).setValues([[
      Utilities.getUuid(),
      scannedAt,
      forcePlainTextValue_(code),
      note
    ]]);

    var result = { code: code, scannedAt: scannedAt, duplicate: previousScannedAt !== '' };
    if (previousScannedAt !== '') result.previousScannedAt = previousScannedAt;
    return successResult_(result);
  } finally {
    lock.releaseLock();
  }
}

/** 打刻記録を全件返す(要APIキー)。 */
function getScanLog_() {
  var sheet = getSheet_(SHEET_NAMES.SCAN_LOG);
  var lastRow = sheet.getLastRow();
  var scans = [];
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, SCAN_LOG_HEADERS.length).getValues().forEach(function (row) {
      if (row[0] === '' || row[0] === null) return; // ID空行はスキップ
      var obj = {};
      SCAN_LOG_HEADERS.forEach(function (header, index) {
        obj[header] = row[index];
      });
      obj['打刻日時'] = formatDateTime_(obj['打刻日時']);
      obj['6桁番号'] = normalizeScanCode_(obj['6桁番号']);
      scans.push(obj);
    });
  }
  return successResult_({ scans: scans });
}

/**
 * シートから読み出した6桁番号を文字列に揃える。セルが数値化されて先頭0を失っていた場合
 * (例: 12345)も、6桁に0埋めして "012345" として扱う。
 */
function normalizeScanCode_(value) {
  var text = String(value === undefined || value === null ? '' : value);
  return /^\d{1,6}$/.test(text) ? ('000000' + text).slice(-6) : text;
}


// ==========================================================================
// 管理系APIの認証
// ==========================================================================

/** apiKey が ADMIN_API_KEY と一致しない場合は unauthorized を返す。 */
function withAdminAuth_(params, handlerFn) {
  if (!isValidAdminApiKey_(params.apiKey)) {
    return errorResult_('unauthorized', 'APIキーが不正です。');
  }
  return handlerFn(params);
}

function isValidAdminApiKey_(apiKey) {
  var expected = PropertiesService.getScriptProperties().getProperty('ADMIN_API_KEY');
  return !!expected && apiKey === expected;
}


// ==========================================================================
// スプレッドシート セットアップ(初回に手動実行する)
// ==========================================================================

/**
 * ScanLog シートと見出し行を作成する。Apps Scriptエディタから手動実行すること。
 * 既にシートが存在する場合は見出し行・書式のみ確認・補正する(データは消さない)。
 */
function setupSheets() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET_NAMES.SCAN_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.SCAN_LOG);
  }
  sheet.getRange(1, 1, 1, SCAN_LOG_HEADERS.length).setValues([SCAN_LOG_HEADERS]);
  sheet.setFrozenRows(1);

  // 6桁番号・打刻日時列はプレインテキスト形式に固定する
  // (先頭0の消失、日時文字列のDate型自動変換を防ぐ)。
  ['6桁番号', '打刻日時'].forEach(function (name) {
    sheet.getRange(1, SCAN_LOG_HEADERS.indexOf(name) + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
  });
  Logger.log('セットアップ完了: ScanLog シートを作成・確認しました。');
}


// ==========================================================================
// 共通ユーティリティ
// ==========================================================================

/** 実行中のスプレッドシートを取得する(コンテナバインド優先、なければIDから取得)。 */
function getSpreadsheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;

  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error('スプレッドシートに紐付いていないスクリプトです。スクリプトプロパティ SPREADSHEET_ID を設定してください。');
  }
  return SpreadsheetApp.openById(id);
}

function getSheet_(sheetName) {
  var sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('シート「' + sheetName + '」が見つかりません。先に setupSheets() を実行してください。');
  }
  return sheet;
}

/**
 * 数字のみの文字列("012345"など)を、数値化されずに確実に文字列として保存されるように
 * 先頭にアポストロフィを付けて返す。Google スプレッドシートは先頭のアポストロフィを
 * 「常に文字列として扱う」指示として解釈し、保存後は値にもセル表示にも残らない。
 * (setNumberFormat('@') だけでは setValues 時に数値と判定されることがあるための対策)
 * 数字以外を含む文字列はそのまま返す。
 */
function forcePlainTextValue_(value) {
  var text = String(value === undefined || value === null ? '' : value);
  return /^\d+$/.test(text) ? "'" + text : text;
}

function buildColumnIndexMap_(headers) {
  var map = {};
  headers.forEach(function (header, index) {
    map[header] = index;
  });
  return map;
}

function nowString_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

/** 日時の値を nowString_() と同じ書式の文字列に揃える(Date型に自動変換されていた場合の保険)。 */
function formatDateTime_(value) {
  if (value === '' || value === null || value === undefined) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  }
  return String(value);
}

function successResult_(data) {
  var result = { success: true };
  for (var key in data) {
    if (data.hasOwnProperty(key)) result[key] = data[key];
  }
  return result;
}

function errorResult_(code, message) {
  return { success: false, error: code, message: message };
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * doGet/doPost の e オブジェクトから、GET/POST両対応でパラメータを取り出す。
 * e.parameter(クエリ文字列)と e.postData.contents(JSON)をマージし、両方にある場合はJSON側を優先する。
 */
function parseParams_(e) {
  var params = {};
  if (e && e.parameter) {
    for (var key in e.parameter) {
      params[key] = e.parameter[key];
    }
  }
  if (e && e.postData && e.postData.contents) {
    try {
      var body = JSON.parse(e.postData.contents);
      for (var bKey in body) {
        params[bKey] = body[bKey];
      }
    } catch (err) {
      // JSONでなければ e.parameter のみを使う。
    }
  }
  return params;
}


// ==========================================================================
// テスト用関数(Apps Scriptエディタから直接実行して動作確認する)
// ==========================================================================

/**
 * logScan_ のテスト。先頭0の番号 "012345" で記録し、シートに先頭0付きの文字列として
 * 保存されたこと、2回目で duplicate:true になること、5桁が拒否されることをログで確認する。
 * ※ 実行するたびに ScanLog シートへテスト行が追加される(確認後に削除してよい)。
 */
function test_logScan() {
  var result = logScan_({ code: '012345', note: 'test_logScan' });
  Logger.log('1回目の記録結果: ' + JSON.stringify(result));

  var sheet = getSheet_(SHEET_NAMES.SCAN_LOG);
  var colIndex = buildColumnIndexMap_(SCAN_LOG_HEADERS)['6桁番号'];
  var savedValue = sheet.getRange(sheet.getLastRow(), colIndex + 1).getValue();
  Logger.log('シートに保存された6桁番号: typeof=' + (typeof savedValue) + ', value=' + savedValue);
  if (String(savedValue) === '012345') {
    Logger.log('[OK] 6桁番号は先頭の0を含めて正しく保存されました。');
  } else {
    Logger.log('[NG] 6桁番号が破損しています。期待値="012345" 実際="' + savedValue + '"');
  }

  var second = logScan_({ code: '012345', note: 'test_logScan(2回目)' });
  Logger.log('2回目の記録結果(duplicate:true になるべき): ' + JSON.stringify(second));
  Logger.log(second.duplicate === true ? '[OK] 重複を検知しました。' : '[NG] 重複を検知できていません。');

  var invalid = logScan_({ code: '12345' });
  Logger.log('不正な値(5桁)の結果(validation_errorになるべき): ' + JSON.stringify(invalid));
  Logger.log(invalid.error === 'validation_error' ? '[OK] 不正な値を拒否しました。' : '[NG] 不正な値が拒否されていません。');
}

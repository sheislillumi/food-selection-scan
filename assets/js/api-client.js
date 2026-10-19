/**
 * 地方銀行フードセレクション2026 打刻 - GAS API クライアント
 *
 * gas/Code.gs をデプロイしたWeb AppのURLは、このファイル内の1箇所
 * (GAS_API_CONFIG.BASE_URL)にまとめている。デプロイをやり直してURLが
 * 変わった場合は、ここだけを差し替えれば全画面に反映される。
 */

const GAS_API_CONFIG = {
  // 【要差し替え】GAS Web AppをデプロイしたURL(.../exec)に置き換えること(README参照)
  BASE_URL: 'YOUR_NEW_GAS_URL'
};

/**
 * GAS Web AppへPOSTする共通関数。
 * gas/Code.gs 側はブラウザのCORSプリフライト(OPTIONSリクエスト)に対応していないため、
 * Content-Type: text/plain でJSON文字列をそのままbodyに入れて送信し、プリフライトを回避する。
 * (gas/Code.gs の parseParams_ が e.postData.contents をJSONとしてパースする)
 *
 * @param {string} action gas/Code.gs の doPost が受け付ける action 名
 *   (logScan)
 * @param {Object} payload action ごとのパラメータ
 * @returns {Promise<{success:boolean, [key:string]:*}>}
 */
async function callGasApi(action, payload) {
  const response = await fetch(GAS_API_CONFIG.BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action: action }, payload))
  });

  if (!response.ok) {
    throw new Error('サーバーとの通信に失敗しました (HTTP ' + response.status + ')');
  }
  return response.json();
}

/**
 * GAS Web AppへGETする共通関数(打刻記録の取得など)。
 *
 * @param {string} action gas/Code.gs の doGet が受け付ける action 名
 *   (getScanLog、apiKey が必要)
 * @param {Object} [params] クエリパラメータ
 * @returns {Promise<{success:boolean, [key:string]:*}>}
 */
async function callGasApiGet(action, params) {
  const query = new URLSearchParams(Object.assign({ action: action }, params || {}));
  const response = await fetch(GAS_API_CONFIG.BASE_URL + '?' + query.toString(), {
    method: 'GET'
  });

  if (!response.ok) {
    throw new Error('サーバーとの通信に失敗しました (HTTP ' + response.status + ')');
  }
  return response.json();
}

/**
 * 地方銀行フードセレクション2026 打刻 - QRコード読み取り
 * html5-qrcode(CDN読み込み)を使ったカメラ起動・停止・読み取りのラッパー。
 * scan/index.html から呼び出される。
 */
const QrScanner = (function () {
  let html5QrCode = null;
  let scanning = false;

  return {
    /** html5-qrcode ライブラリとカメラAPIの両方が利用可能かどうか。 */
    isSupported() {
      return (
        typeof Html5Qrcode !== 'undefined' &&
        !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
      );
    },

    isScanning() {
      return scanning;
    },

    /**
     * 指定したid要素にカメラ映像を表示し、QRコードの読み取りを開始する。
     * @param {string} elementId カメラ映像を描画するDOM要素のid
     * @param {(decodedText: string) => void} onDecoded 読み取り成功時のコールバック
     */
    async start(elementId, onDecoded) {
      if (scanning) return;
      if (!this.isSupported()) {
        throw new Error('このブラウザ・端末ではカメラによるQRコード読み取りに対応していません。');
      }

      html5QrCode = new Html5Qrcode(elementId);
      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        function (decodedText) {
          onDecoded(decodedText);
        },
        function () {
          // 読み取り失敗(フレーム内にQRコードが無い等)は毎フレーム発生しうるため無視する。
        }
      );
      scanning = true;
    },

    /** カメラを停止し、リソースを解放する。 */
    async stop() {
      if (!scanning || !html5QrCode) return;
      try {
        await html5QrCode.stop();
        await html5QrCode.clear();
      } finally {
        scanning = false;
        html5QrCode = null;
      }
    }
  };
})();

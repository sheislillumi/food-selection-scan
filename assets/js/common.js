/**
 * 地方銀行フードセレクション2026 打刻 - 共通JS
 */
const CommonUtils = {
  /** 送信ボタンの活性・文言を切り替える(二重送信防止)。 */
  setLoading(button, isLoading, loadingText, defaultText) {
    if (!button) return;
    button.disabled = isLoading;
    button.textContent = isLoading ? loadingText : defaultText;
  }
};

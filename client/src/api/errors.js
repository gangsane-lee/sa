export class ApiError extends Error {
  /**
   * @param {number} status HTTP 상태 코드 (0 = 네트워크 오류)
   * @param {string} message 사용자에게 그대로 보여줄 문구
   * @param {string} [code] 서버 오류 코드 (예: ADMIN_LOCKED)
   */
  constructor(status, message, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

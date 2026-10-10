// テスト用: Web Storage と同じ契約を持つ差し替え可能なメモ保存先と、失敗の注入手段（How）。
export class MemoryStorage implements Storage {
  readonly data = new Map<string, string>();
  /** setItem で例外を投げる（保存失敗の注入）。 */
  failSet = false;
  /** setItem を黙って無視する（書込み確認ができない状況の注入）。 */
  dropSet = false;
  /** getItem で例外を投げる（取得処理の失敗の注入）。 */
  failGet = false;
  /** 合計文字数の上限（技術上限の模擬）。 */
  quota = Infinity;

  get length(): number {
    return this.data.size;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    if (this.failGet) throw new Error("injected get failure");
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failSet) throw new Error("injected set failure");
    if (this.dropSet) return;
    let size = key.length + value.length;
    for (const [k, v] of this.data) if (k !== key) size += k.length + v.length;
    if (size > this.quota) throw new DOMException("quota", "QuotaExceededError");
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  clear(): void {
    this.data.clear();
  }
  snapshot(): [string, string][] {
    return [...this.data.entries()].sort();
  }
}

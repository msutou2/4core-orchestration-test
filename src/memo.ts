// 物語「メモを登録する」（ST-MEMO-CREATE）と「メモ一覧を取得する」（ST-MEMO-LIST）。
// 正本: 00_メモアプリ_統合正本候補_Rev01.md（2.1〜2.5、3章）。
// メモ保存先（DD-STORE）はWeb Storage（ブラウザではlocalStorage）で実現する（How）。

/** 保存単位「メモ」（正本2.5）。 */
export interface Memo {
  /** 識別子。メモ保存先内で一意。物理形式はHow（ランダムな16進文字列）。 */
  readonly id: string;
  /** 本文。入力されたとおりの文字列。 */
  readonly body: string;
  /** 作成日時。一つの時点を表すUNIXエポックからのミリ秒。 */
  readonly createdAt: number;
}

/** ST-MEMO-CREATE の返す事実・返す値（閉じた集合）。 */
export type CreateResult =
  | { readonly fact: "メモを登録した"; readonly memo: Memo }
  | { readonly fact: "メモを登録できなかった"; readonly reason: "本文が空" | "保存できなかった" };

/** ST-MEMO-LIST の返す事実・返す値（閉じた集合）。 */
export type ListResult =
  | { readonly fact: "メモ一覧を取得した"; readonly memos: readonly Memo[] }
  | { readonly fact: "メモ一覧を取得できなかった"; readonly reason: "取得できなかった" };

/** メモ保存先を返す。ブラウザでは () => window.localStorage。取得自体が例外になり得るため関数で受ける。 */
export type StorageSource = () => Storage;

/** 本アプリが使うキーの接頭辞。1件のメモ = 1つのキー（How）。 */
export const KEY_PREFIX = "4core-memo:v1:";

/** 保存データ（物理形式。How）。seq は登録順を再現するための連番。 */
interface StoredMemo {
  id: string;
  body: string;
  createdAt: number;
  seq: number;
}

// 「空」（正本2.2: 利用者から見て、表示上なにも文字が見えない本文）の判定（How）。
// 空白類（\s、Unicode区切り文字 Z*）、制御文字（Cc）、書式文字（Cf: ゼロ幅スペース・ゼロ幅接合子・BOM等）、
// 異体字セレクタ、およびそれ自体は描画されないハングルフィラー・点字空白を「目に見えない文字」とする。
// これは基準を満たすための実装上の範囲であり、正本の網羅的な列挙ではない。
const INVISIBLE =
  /[\s\p{Z}\p{Cc}\p{Cf}ᅟᅠㅤﾠ⠀︀-️\u{E0100}-\u{E01EF}]/gu;

/** 本文が「空」（表示上なにも文字が見えない）かどうか。 */
export function isBlank(body: string): boolean {
  return body.replace(INVISIBLE, "") === "";
}

/** 保存データを読み取り、保存データ契約どおりなら StoredMemo を返す。そうでなければ null。 */
function parseStored(key: string, raw: string | null): StoredMemo | null {
  if (raw === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (
    typeof o.id !== "string" ||
    key !== KEY_PREFIX + o.id ||
    typeof o.body !== "string" ||
    isBlank(o.body) ||
    typeof o.createdAt !== "number" ||
    !Number.isFinite(o.createdAt) ||
    typeof o.seq !== "number" ||
    !Number.isSafeInteger(o.seq) ||
    o.seq < 1
  ) {
    return null;
  }
  return { id: o.id, body: o.body, createdAt: o.createdAt, seq: o.seq };
}

/** 本アプリのメモをすべて読む。一部でも契約どおりに読めなければ null（保存先は変更しない）。 */
function readAll(storage: Storage): StoredMemo[] | null {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k !== null && k.startsWith(KEY_PREFIX)) keys.push(k);
  }
  const memos: StoredMemo[] = [];
  for (const k of keys) {
    const m = parseStored(k, storage.getItem(k));
    if (m === null) return null;
    memos.push(m);
  }
  return memos;
}

function newId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function toMemo(s: StoredMemo): Memo {
  return { id: s.id, body: s.body, createdAt: s.createdAt };
}

/** 新しい順（登録順の逆）。同じseqは異なるタブから同時に登録された場合だけ起こり得るため、作成日時・識別子で決定的に並べる。 */
function newestFirst(a: StoredMemo, b: StoredMemo): number {
  return b.seq - a.seq || b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

const CANNOT_SAVE: CreateResult = { fact: "メモを登録できなかった", reason: "保存できなかった" };

/**
 * 物語「メモを登録する」（ST-MEMO-CREATE）。
 * @param now 作成日時を与える時計（既定は現在時刻）。
 */
export function createMemo(
  source: StorageSource,
  body: string,
  now: () => number = Date.now,
): CreateResult {
  // Koto2: 本文が空なら保存先を変更しない。
  if (isBlank(body)) return { fact: "メモを登録できなかった", reason: "本文が空" };

  let storage: Storage;
  try {
    storage = source();
  } catch {
    return CANNOT_SAVE;
  }

  // 登録順（seq）を決めるために既存メモを読む。既存データを契約どおりに読めない場合は書かない（既存メモの不変）。
  let existing: StoredMemo[] | null;
  try {
    existing = readAll(storage);
  } catch {
    return CANNOT_SAVE;
  }
  if (existing === null) return CANNOT_SAVE;

  // Koto3: 識別子と作成日時を付与する。
  const record: StoredMemo = {
    id: newId(),
    body,
    createdAt: now(),
    seq: existing.reduce((max, m) => Math.max(max, m.seq), 0) + 1,
  };
  const key = KEY_PREFIX + record.id;
  const raw = JSON.stringify(record);

  // Koto4: 1件 = 1キーへ1回で書く。既存キーは上書きしない。
  try {
    if (storage.getItem(key) !== null) return CANNOT_SAVE;
    storage.setItem(key, raw);
  } catch {
    // setItemは失敗時に何も書かない。念のため自分のキーだけを取り除く。
    removeQuietly(storage, key);
    return CANNOT_SAVE;
  }

  // Koto6: 書込みの確認。保存先から読み直し、契約どおりに同じメモとして読めることを確かめる。
  let confirmed: StoredMemo | null = null;
  try {
    confirmed = parseStored(key, storage.getItem(key));
  } catch {
    confirmed = null;
  }
  if (
    confirmed === null ||
    confirmed.body !== record.body ||
    confirmed.createdAt !== record.createdAt ||
    confirmed.seq !== record.seq
  ) {
    // Koto5: 登録されたものとして扱わず、一部だけの状態を残さない。
    removeQuietly(storage, key);
    return CANNOT_SAVE;
  }

  // Koto7
  return { fact: "メモを登録した", memo: toMemo(confirmed) };
}

function removeQuietly(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // 取り除けなくても結果は「保存できなかった」のまま。
  }
}

/** 物語「メモ一覧を取得する」（ST-MEMO-LIST）。保存先を変更しない。 */
export function listMemos(source: StorageSource): ListResult {
  let all: StoredMemo[] | null;
  try {
    all = readAll(source());
  } catch {
    all = null;
  }
  if (all === null) return { fact: "メモ一覧を取得できなかった", reason: "取得できなかった" };
  return { fact: "メモ一覧を取得した", memos: all.sort(newestFirst).map(toMemo) };
}

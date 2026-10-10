// 派生テスト仕様 Rev01 のうち、確認方式Aの項目（ST-MEMO-CREATE / ST-MEMO-LIST / 保存データ契約 / 意味境界）。
// テスト名の先頭に TID を付ける。
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMemo,
  KEY_PREFIX,
  listMemos,
  type CreateResult,
  type ListResult,
  type Memo,
} from "../src/memo";
import { MemoryStorage } from "./memoryStorage";

let store: MemoryStorage;
const src = () => store;

/** 「新しく初期化したアプリ」: モジュールを読み直し、永続化されたデータだけを持つ新しい保存先オブジェクトから読む。 */
async function reopenAndList(): Promise<ListResult> {
  vi.resetModules();
  const fresh = await import("../src/memo");
  const reopened = new MemoryStorage();
  for (const [k, v] of store.data) reopened.data.set(k, v);
  return fresh.listMemos(() => reopened);
}

function registered(r: CreateResult): Memo {
  if (r.fact !== "メモを登録した") throw new Error(`登録できなかった: ${r.reason}`);
  return r.memo;
}

function listed(r: ListResult): readonly Memo[] {
  if (r.fact !== "メモ一覧を取得した") throw new Error("一覧を取得できなかった");
  return r.memos;
}

// 集合外の値が出ないことの確認用（T-CR-07, T-LS-07）
const createResults: CreateResult[] = [];
const listResults: ListResult[] = [];
function create(body: string, now?: () => number): CreateResult {
  const r = createMemo(src, body, now);
  createResults.push(r);
  return r;
}
function list(): ListResult {
  const r = listMemos(src);
  listResults.push(r);
  return r;
}

const INVISIBLE_ONLY: Record<string, string> = {
  半角スペースだけ: "   ",
  全角スペースだけ: "　　",
  改行だけ: "\n\r\n\n",
  タブだけ: "\t\t",
  ゼロ幅スペースだけ: "​​",
  混在だけ: " 　\n\t​‍﻿ ",
};

beforeEach(() => {
  store = new MemoryStorage();
});

describe("ST-MEMO-CREATE", () => {
  it("T-CR-01 目に見える文字を含む本文で登録すると「メモを登録した」と、入力どおりの本文・識別子・作成日時が返る", () => {
    const r = create("買い物: 牛乳");
    expect(r.fact).toBe("メモを登録した");
    const m = registered(r);
    expect(m.body).toBe("買い物: 牛乳");
    expect(typeof m.id).toBe("string");
    expect(m.id.length).toBeGreaterThan(0);
    expect(Number.isFinite(m.createdAt)).toBe(true);
  });

  it("T-CR-02 「メモを登録した」の後、新しく初期化したアプリの一覧で同じ識別子・本文・作成日時が取得される", async () => {
    const m = registered(create("閉じた後も残る"));
    const memos = listed(await reopenAndList());
    expect(memos).toEqual([m]);
  });

  it("T-CR-03 0文字の本文は「本文が空」で登録できず、保存先は変更されない", () => {
    registered(create("既存"));
    const before = store.snapshot();
    expect(create("")).toEqual({ fact: "メモを登録できなかった", reason: "本文が空" });
    expect(store.snapshot()).toEqual(before);
  });

  for (const [name, body] of Object.entries(INVISIBLE_ONLY)) {
    it(`T-CR-04 表示上なにも見えない本文（${name}）は「本文が空」で登録できず、保存先は変更されない`, () => {
      registered(create("既存"));
      const before = store.snapshot();
      expect(create(body)).toEqual({ fact: "メモを登録できなかった", reason: "本文が空" });
      expect(store.snapshot()).toEqual(before);
    });
  }

  it("T-CR-05 保存失敗を注入すると「保存できなかった」が返り、一部・新規のメモが残らず既存メモが変化しない", () => {
    registered(create("既存1"));
    registered(create("既存2"));
    const before = store.snapshot();
    store.failSet = true;
    expect(create("新しいメモ")).toEqual({ fact: "メモを登録できなかった", reason: "保存できなかった" });
    expect(store.snapshot()).toEqual(before);
  });

  it("T-CR-06 書込み確認ができない状況を注入すると「メモを登録した」を返さず「保存できなかった」を返す", () => {
    registered(create("既存"));
    const before = store.snapshot();
    store.dropSet = true;
    expect(create("確認できない")).toEqual({ fact: "メモを登録できなかった", reason: "保存できなかった" });
    expect(store.snapshot()).toEqual(before);
  });

  it("T-CR-06 書込み後の読み直しが失敗する場合も「保存できなかった」を返し、書いたメモを残さない", () => {
    registered(create("既存"));
    const before = store.snapshot();
    const original = store.getItem.bind(store);
    let calls = 0;
    store.getItem = (key: string) => {
      calls++;
      // 既存の読込み(1)・キー重複確認(2)の後、書込み確認の読み直しを失敗させる
      if (calls >= 3) throw new Error("injected confirm failure");
      return original(key);
    };
    expect(create("読み直せない")).toEqual({ fact: "メモを登録できなかった", reason: "保存できなかった" });
    store.getItem = original;
    expect(store.snapshot()).toEqual(before);
  });

  it("T-CR-08 同じ本文のメモがあっても登録でき、別の識別子の別メモとして一覧に2件現れる", () => {
    const a = registered(create("同じ本文"));
    const b = registered(create("同じ本文"));
    expect(a.id).not.toBe(b.id);
    const memos = listed(list());
    expect(memos.filter((m) => m.body === "同じ本文").map((m) => m.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("T-CR-09 改行・記号・多言語文字・絵文字・数万文字の本文が再読込で入力と完全一致する", async () => {
    const bodies = [
      "1行目\n2行目\r\n\n  インデント\t付き  \n",
      "記号 !\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~ ＜＞「」",
      "English 日本語 한국어 العربية Ελληνικά עברית",
      "絵文字 😀👨‍👩‍👧‍👦🇯🇵 ✌️",
      "長".repeat(50_000) + "\n末尾",
    ];
    const ids = bodies.map((b) => registered(create(b)).id);
    const memos = listed(await reopenAndList());
    for (let i = 0; i < bodies.length; i++) {
      expect(memos.find((m) => m.id === ids[i])?.body).toBe(bodies[i]);
    }
  });

  it("T-CR-09 技術上限を超えて保存できない場合は「保存できなかった」となり、切り詰めて登録しない", () => {
    store.quota = 10_000;
    const before = store.snapshot();
    expect(create("x".repeat(20_000))).toEqual({ fact: "メモを登録できなかった", reason: "保存できなかった" });
    expect(store.snapshot()).toEqual(before);
    expect(listed(list())).toEqual([]);
  });

  it("T-CR-10 作成日時は利用者入力ではなく登録時に付与され、登録の前後の時刻の範囲内にある", () => {
    const t0 = Date.now();
    const m = registered(create("いつ"));
    const t1 = Date.now();
    expect(m.createdAt).toBeGreaterThanOrEqual(t0);
    expect(m.createdAt).toBeLessThanOrEqual(t1);
  });

  it("T-CR-11 既存メモが複数ある状態で登録しても、既存メモの識別子・本文・作成日時が変化しない", () => {
    for (let i = 0; i < 5; i++) registered(create(`既存${i}`));
    const before = listed(list());
    const rawBefore = store.snapshot();
    const added = registered(create("新しいメモ"));
    const after = listed(list());
    expect(after.filter((m) => m.id !== added.id)).toEqual(before);
    // 既存メモの保存データそのものも変化していない
    const rawAfter = store.snapshot().filter(([k]) => k !== KEY_PREFIX + added.id);
    expect(rawAfter).toEqual(rawBefore);
  });

  it("T-CR-12 既存データが契約どおりに読めない状態では、既存データを上書き・消去して登録したことにしない", () => {
    registered(create("正常な既存"));
    store.data.set(KEY_PREFIX + "broken", "{壊れたデータ");
    const before = store.snapshot();
    const r = create("新しいメモ");
    // 正本適合の結果は「保存できなかった」または既存を変えずに保存のいずれか。本実装は前者。
    expect(r).toEqual({ fact: "メモを登録できなかった", reason: "保存できなかった" });
    expect(store.snapshot()).toEqual(before);
  });

  const VISIBLE_WITH_INVISIBLE = [
    " a ",
    "　あ　",
    "\n\nx\n",
    "\tメ\tモ\t",
    "​.​",
    " 　\n\t​!​\t\n　 ",
  ];
  for (const body of VISIBLE_WITH_INVISIBLE) {
    it(`T-CR-13 目に見える文字を含む本文 ${JSON.stringify(body)} は登録でき、目に見えない文字を含めて入力と完全一致する`, async () => {
      const m = registered(create(body));
      expect(m.body).toBe(body);
      const memos = listed(await reopenAndList());
      expect(memos.find((x) => x.id === m.id)?.body).toBe(body);
    });
  }

  it("T-CR-07 返す事実は2種、理由は2種だけである（このファイルで得た全結果）", () => {
    // 他のテストで集めた結果に加え、このテスト内でも各経路を一通り通す
    create("a");
    create("");
    store.failSet = true;
    create("b");
    for (const r of createResults) {
      expect(["メモを登録した", "メモを登録できなかった"]).toContain(r.fact);
      if (r.fact === "メモを登録できなかった") expect(["本文が空", "保存できなかった"]).toContain(r.reason);
      expect(Object.keys(r).sort()).toEqual(r.fact === "メモを登録した" ? ["fact", "memo"] : ["fact", "reason"]);
    }
    expect(new Set(createResults.map((r) => r.fact)).size).toBe(2);
  });
});

describe("ST-MEMO-LIST", () => {
  it("T-LS-01 登録済みメモがすべて含まれ「メモ一覧を取得した」が返る", () => {
    const ids = ["一", "二", "三"].map((b) => registered(create(b)).id);
    const r = list();
    expect(r.fact).toBe("メモ一覧を取得した");
    expect(listed(r).map((m) => m.id).sort()).toEqual([...ids].sort());
  });

  it("T-LS-02 0件のとき「メモ一覧を取得した」と空の並びが返る", () => {
    expect(list()).toEqual({ fact: "メモ一覧を取得した", memos: [] });
  });

  it("T-LS-03 取得処理の失敗を注入すると「メモ一覧を取得できなかった」と理由が返り、保存先は変更されない", () => {
    registered(create("既存"));
    const before = store.snapshot();
    store.failGet = true;
    expect(list()).toEqual({ fact: "メモ一覧を取得できなかった", reason: "取得できなかった" });
    store.failGet = false;
    expect(store.snapshot()).toEqual(before);
  });

  it("T-LS-03 保存先そのものを取得できない場合も「メモ一覧を取得できなかった」を返す", () => {
    const r = listMemos(() => {
      throw new DOMException("denied", "SecurityError");
    });
    listResults.push(r);
    expect(r).toEqual({ fact: "メモ一覧を取得できなかった", reason: "取得できなかった" });
  });

  const BROKEN: Record<string, (id: string) => string> = {
    JSONでない: () => "{壊れ",
    本文がない: (id) => JSON.stringify({ id, createdAt: 1, seq: 9 }),
    作成日時がない: (id) => JSON.stringify({ id, body: "x", seq: 9 }),
    識別子がキーと合わない: () => JSON.stringify({ id: "other", body: "x", createdAt: 1, seq: 9 }),
    本文が空: (id) => JSON.stringify({ id, body: " ", createdAt: 1, seq: 9 }),
  };
  for (const [name, make] of Object.entries(BROKEN)) {
    it(`T-LS-04 一部のメモだけが読めない状態（${name}）では一部を返さず「メモ一覧を取得できなかった」を返し、保存先を変更しない`, () => {
      registered(create("読める1"));
      registered(create("読める2"));
      store.data.set(KEY_PREFIX + "bad", make("bad"));
      const before = store.snapshot();
      expect(list()).toEqual({ fact: "メモ一覧を取得できなかった", reason: "取得できなかった" });
      expect(store.snapshot()).toEqual(before);
    });
  }

  it("T-LS-04 本アプリ以外のキーは一覧の対象にせず、影響を受けない", () => {
    store.data.set("other-app", "unrelated");
    const m = registered(create("自分のメモ"));
    expect(listed(list())).toEqual([m]);
    expect(store.data.get("other-app")).toBe("unrelated");
  });

  it("T-LS-05 並びが登録の新しい順である", () => {
    const ids = ["1番目", "2番目", "3番目", "4番目"].map((b) => registered(create(b)).id);
    expect(listed(list()).map((m) => m.id)).toEqual([...ids].reverse());
  });

  it("T-LS-06 作成日時が同じ複数のメモでも後に登録したものが先になり、再読込後も同じ順になる", async () => {
    const fixed = () => 1_700_000_000_000;
    const ids = ["A", "B", "C", "D", "E"].map((b) => registered(create(b, fixed)).id);
    const expected = [...ids].reverse();
    expect(listed(list()).map((m) => m.id)).toEqual(expected);
    expect(listed(await reopenAndList()).map((m) => m.id)).toEqual(expected);
  });

  it("T-LS-06 時計が戻った場合（後の登録の作成日時が前より古い）も登録順で並ぶ", () => {
    const a = registered(create("先", () => 2_000)).id;
    const b = registered(create("後", () => 1_000)).id;
    expect(listed(list()).map((m) => m.id)).toEqual([b, a]);
  });

  it("T-LS-08 一覧を取得しても、メモの内容・件数・順序が変化しない", () => {
    ["x", "y", "z"].forEach((b) => registered(create(b)));
    const before = store.snapshot();
    const first = listed(list());
    const second = listed(list());
    expect(second).toEqual(first);
    expect(store.snapshot()).toEqual(before);
  });

  it("T-LS-07 返す事実は2種だけである（このファイルで得た全結果）", () => {
    list();
    store.failGet = true;
    list();
    for (const r of listResults) {
      expect(["メモ一覧を取得した", "メモ一覧を取得できなかった"]).toContain(r.fact);
      if (r.fact === "メモ一覧を取得できなかった") expect(r.reason).toBe("取得できなかった");
    }
    expect(new Set(listResults.map((r) => r.fact)).size).toBe(2);
  });
});

describe("保存データ契約（2.5）", () => {
  it("T-DB-01 保存されたすべてのメモが識別子・本文・作成日時を欠落なく持つ", async () => {
    for (let i = 0; i < 10; i++) registered(create(`メモ${i}`));
    for (const m of listed(await reopenAndList())) {
      expect(typeof m.id).toBe("string");
      expect(m.id).not.toBe("");
      expect(typeof m.body).toBe("string");
      expect(Number.isFinite(m.createdAt)).toBe(true);
    }
  });

  it("T-DB-02 同じ本文を含む多数登録後も識別子が重複しない", () => {
    for (let i = 0; i < 300; i++) registered(create(i % 2 ? "同じ" : `別${i}`));
    const ids = listed(list()).map((m) => m.id);
    expect(ids).toHaveLength(300);
    expect(new Set(ids).size).toBe(300);
  });

  it("T-DB-03 作成日時が再読込後も同じ時点を表す", async () => {
    const m = registered(create("時点"));
    const again = listed(await reopenAndList()).find((x) => x.id === m.id);
    expect(again?.createdAt).toBe(m.createdAt);
    expect(new Date(again!.createdAt).toISOString()).toBe(new Date(m.createdAt).toISOString());
  });

  it("T-DB-04 本文が空のメモが保存先に存在しない", async () => {
    registered(create("見える"));
    for (const body of ["", ...Object.values(INVISIBLE_ONLY)]) create(body);
    const memos = listed(await reopenAndList());
    expect(memos.map((m) => m.body)).toEqual(["見える"]);
    expect(store.data.size).toBe(1);
  });
});

describe("意味境界", () => {
  it("T-MB-01 再び開いたアプリは保存先だけから識別子・本文・作成日時・登録順を完全に再構成できる", async () => {
    const now = { t: 5_000 };
    const created = ["一", "二", "三"].map((b) => registered(create(b, () => now.t)));
    now.t = 4_000; // 作成日時の逆転があっても登録順で並ぶ
    created.push(registered(create("四", () => now.t)));
    const memos = listed(await reopenAndList());
    expect(memos).toEqual([...created].reverse());
  });

  it("T-MB-02 同じ保存先を共有する別の画面からの登録が、既に登録されたメモを変更・消失させない", () => {
    // 2つの画面 = 同じ保存先に対する2つの独立した呼出し元
    const tabA = () => store;
    const tabB = () => store;
    const a1 = registered(createMemo(tabA, "Aで登録"));
    const b1 = registered(createMemo(tabB, "Bで登録"));
    const a2 = registered(createMemo(tabA, "Aで再登録"));
    const memos = listed(listMemos(tabB));
    expect(memos).toEqual([a2, b1, a1]);
  });
});

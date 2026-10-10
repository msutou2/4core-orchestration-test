// 派生テスト仕様 Rev01 のうち、ST-OUT-MEMO / ST-APP / 意味境界の確認方式A（実Chromiumでの画面の自動操作）。
// テスト名の先頭に TID を付ける。保存失敗等の注入は Storage.prototype の差し替えで行う（How）。
import { chromium, expect, test, type Page } from "@playwright/test";

interface Fault {
  failRead: boolean;
  failSet: boolean;
  /** setItem が呼ばれた時点（保存の途中）の完了表示欄の内容 */
  statusAtSet: (string | null)[];
}

/** 失敗注入の仕組みをページに入れる。initial はページ読込み時点のフラグ。 */
async function installFaults(page: Page, initial: Partial<Fault> = {}): Promise<void> {
  await page.addInitScript((init) => {
    const f = { failRead: false, failSet: false, statusAtSet: [] as (string | null)[], ...init };
    (window as unknown as { __fault: typeof f }).__fault = f;
    const proto = Storage.prototype;
    const getItem = proto.getItem;
    const setItem = proto.setItem;
    const key = proto.key;
    const lengthDesc = Object.getOwnPropertyDescriptor(proto, "length")!;
    proto.getItem = function (k: string) {
      if (f.failRead) throw new Error("injected");
      return getItem.call(this, k);
    };
    proto.key = function (i: number) {
      if (f.failRead) throw new Error("injected");
      return key.call(this, i);
    };
    Object.defineProperty(proto, "length", {
      configurable: true,
      get() {
        if (f.failRead) throw new Error("injected");
        return lengthDesc.get!.call(this);
      },
    });
    proto.setItem = function (k: string, v: string) {
      f.statusAtSet.push(document.querySelector("#create-status")?.textContent ?? null);
      if (f.failSet) throw new DOMException("injected", "QuotaExceededError");
      return setItem.call(this, k, v);
    };
  }, initial);
}

async function setFault(page: Page, patch: Partial<Fault>): Promise<void> {
  await page.evaluate((p) => Object.assign((window as unknown as { __fault: Fault }).__fault, p), patch);
}

const input = (page: Page) => page.locator("#memo-body");
const submit = (page: Page) => page.getByRole("button", { name: "登録" });
const createStatus = (page: Page) => page.locator("#create-status");
const listStatus = (page: Page) => page.locator("#list-status");
const items = (page: Page) => page.locator("#memo-list > li");
const bodies = (page: Page) => page.locator("#memo-list > li .memo-body");

async function register(page: Page, body: string): Promise<void> {
  await input(page).fill(body);
  await submit(page).click();
}

const DONE = "登録しました。";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
});

test("T-OUT-01 画面を開くと本文の入力欄がすぐ入力できる状態で表示される", async ({ page }) => {
  await page.goto("/");
  await expect(input(page)).toBeVisible();
  await expect(input(page)).toBeEditable();
  await expect(input(page)).toBeFocused();
  await page.keyboard.type("すぐ書ける");
  await expect(input(page)).toHaveValue("すぐ書ける");
});

test("T-OUT-02 / T-OUT-09 一覧を取得できなかった状態でも入力・登録でき、登録成功後も取得できなかった表示とやり直す操作が残る", async ({ page }) => {
  await page.goto("/");
  await register(page, "既存メモ");
  await installFaults(page, { failRead: true });
  await page.reload();
  await expect(listStatus(page)).toContainText("メモを表示できませんでした");
  await expect(input(page)).toBeEditable();
  await setFault(page, { failRead: false });
  await register(page, "取得できない状態で登録");
  await expect(createStatus(page)).toHaveText(DONE);
  // 取得できなかった表示とやり直す操作が残る
  await expect(listStatus(page)).toContainText("メモを表示できませんでした");
  await expect(page.locator("#list-retry")).toBeVisible();
  // 登録したメモだけを一覧全体のように示さない
  await expect(listStatus(page)).toContainText("今回登録したメモだけを表示しています");
  await expect(bodies(page)).toHaveText(["取得できない状態で登録"]);
  // やり直すと全体が表示される
  await page.locator("#list-retry").click();
  await expect(bodies(page)).toHaveText(["取得できない状態で登録", "既存メモ"]);
  await expect(listStatus(page)).toBeEmpty();
});

test("T-OUT-02 保存先のデータが読めない状態でも入力欄は使え、登録操作の結果が表示される", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("4core-memo:v1:broken", "{壊れ"));
  await page.goto("/");
  await expect(listStatus(page)).toContainText("メモを表示できませんでした");
  await register(page, "書く");
  await expect(createStatus(page)).not.toHaveText(DONE);
  await expect(createStatus(page)).toContainText("保存できませんでした");
  await expect(input(page)).toHaveValue("書く");
  // 既存データは上書き・消去されない（T-CR-12）
  expect(await page.evaluate(() => localStorage.getItem("4core-memo:v1:broken"))).toBe("{壊れ");
});

test("T-OUT-03 「メモ一覧を取得した」のとき、新しい順で各メモの本文と作成日時が表示される", async ({ page }) => {
  await page.goto("/");
  for (const b of ["一つ目", "二つ目\n二行目", "三つ目"]) await register(page, b);
  await page.reload();
  await expect(bodies(page)).toHaveText(["三つ目", "二つ目\n二行目", "一つ目"]);
  const times = items(page).locator("time");
  await expect(times).toHaveCount(3);
  for (const t of await times.all()) {
    await expect(t).toHaveText(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/);
    expect(Number.isNaN(Date.parse((await t.getAttribute("datetime"))!))).toBe(false);
  }
});

test("T-OUT-04 0件のとき、メモがまだないことが分かる表示になる", async ({ page }) => {
  await page.goto("/");
  await expect(listStatus(page)).toHaveText("メモはまだありません。");
  await expect(items(page)).toHaveCount(0);
});

test("T-OUT-05 一覧を取得できなかったとき表示できなかったことが示され、やり直す操作がある（再失敗時は同じ表示に戻り、成功すれば一覧が表示される）", async ({ page }) => {
  await page.goto("/");
  await register(page, "読み返すメモ");
  await installFaults(page, { failRead: true });
  await page.reload();
  await expect(listStatus(page)).toContainText("メモを表示できませんでした");
  await expect(items(page)).toHaveCount(0);
  // 再失敗
  await page.locator("#list-retry").click();
  await expect(listStatus(page)).toContainText("メモを表示できませんでした");
  await expect(page.locator("#list-retry")).toBeVisible();
  // 成功
  await setFault(page, { failRead: false });
  await page.locator("#list-retry").click();
  await expect(bodies(page)).toHaveText(["読み返すメモ"]);
  await expect(page.locator("#list-retry")).toHaveCount(0);
});

test("T-OUT-06 登録操作で確認ダイアログ等を挟まずに登録が行われる", async ({ page }) => {
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.type());
    void d.dismiss();
  });
  await page.goto("/");
  await register(page, "確認なし");
  await expect(createStatus(page)).toHaveText(DONE);
  expect(dialogs).toEqual([]);
  const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("4core-memo:")).length);
  expect(stored).toBe(1);
});

test("T-OUT-07 「メモを登録した」が返る前（保存の途中）に完了表示が出ず、返った後に出る", async ({ page }) => {
  await installFaults(page);
  await page.goto("/");
  await register(page, "1件目");
  await expect(createStatus(page)).toHaveText(DONE);
  await register(page, "2件目");
  await expect(createStatus(page)).toHaveText(DONE);
  const statusAtSet = await page.evaluate(() => (window as unknown as { __fault: Fault }).__fault.statusAtSet);
  expect(statusAtSet).toHaveLength(2);
  for (const s of statusAtSet) expect(s).not.toBe(DONE);
});

test("T-OUT-08 「メモを登録した」のとき完了が示され、登録したメモが一覧の先頭に表示される", async ({ page }) => {
  await page.goto("/");
  await register(page, "古い");
  await register(page, "新しい");
  await expect(createStatus(page)).toHaveText(DONE);
  await expect(bodies(page)).toHaveText(["新しい", "古い"]);
  await expect(listStatus(page)).toBeEmpty();
});

for (const [name, body] of [
  ["0文字", ""],
  ["目に見えない文字だけ", " 　\n\t​"],
] as const) {
  test(`T-OUT-10 理由「本文が空」（${name}）のとき完了表示を出さず、本文を入力すれば登録できることが分かる表示になり、入力は残る`, async ({ page }) => {
    await page.goto("/");
    await register(page, body);
    await expect(createStatus(page)).toHaveText("本文を入力すると登録できます。");
    await expect(input(page)).toHaveValue(body);
    await expect(items(page)).toHaveCount(0);
  });
}

test("T-OUT-11 理由「保存できなかった」のとき完了表示を出さず入力が残り、そのまま再操作で保存が成功すれば登録される", async ({ page }) => {
  await installFaults(page);
  await page.goto("/");
  await setFault(page, { failSet: true });
  await register(page, "失いたくない内容");
  await expect(createStatus(page)).toContainText("保存できませんでした");
  await expect(createStatus(page)).toContainText("入力した内容は残っています");
  await expect(input(page)).toHaveValue("失いたくない内容");
  await expect(items(page)).toHaveCount(0);
  await setFault(page, { failSet: false });
  await submit(page).click();
  await expect(createStatus(page)).toHaveText(DONE);
  await expect(bodies(page)).toHaveText(["失いたくない内容"]);
});

test("T-OUT-12（補助。B項目の代替ではない）失敗表示に例外名・保存方式の名称が含まれない", async ({ page }) => {
  await installFaults(page, { failRead: true });
  await page.goto("/");
  await expect(listStatus(page)).toContainText("メモを表示できませんでした");
  await setFault(page, { failSet: true });
  await register(page, "x");
  await expect(createStatus(page)).toContainText("保存できませんでした");
  await register(page, "");
  const text = await page.locator("main").innerText();
  await register(page, "x");
  const text2 = await page.locator("main").innerText();
  for (const w of ["Error", "Exception", "localStorage", "Storage", "Quota", "JSON", "injected"]) {
    expect(text).not.toContain(w);
    expect(text2).not.toContain(w);
  }
});

test("T-APP-01 画面上の操作は「書いて残す（登録）」「読み返す（一覧）」だけで、変更・削除・検索の操作がない", async ({ page }) => {
  await page.goto("/");
  await register(page, "メモ1");
  await register(page, "メモ2");
  await page.reload();
  const controls = page.locator("button, input, textarea, select, a[href], [contenteditable=''], [contenteditable='true']");
  await expect(controls).toHaveCount(2); // 本文入力欄と「登録」ボタン
  await expect(items(page).locator("button, input, textarea, select, a, [contenteditable]")).toHaveCount(0);
  await expect(page.getByText(/編集|削除|検索/)).toHaveCount(0);
});

test("T-APP-02 ログイン・利用者の識別を求めずに利用できる", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("input[type=password]")).toHaveCount(0);
  await register(page, "ログインなし");
  await expect(createStatus(page)).toHaveText(DONE);
});

test("T-CR-09（画面）数万文字・改行・絵文字の本文が再読込後も完全一致し、技術上限を超える本文は「保存できなかった」で入力が残る", async ({ page }) => {
  await page.goto("/");
  const long = "長い本文🙂\n".repeat(6000);
  await page.evaluate((v) => {
    (document.querySelector("#memo-body") as HTMLTextAreaElement).value = v;
  }, long);
  await submit(page).click();
  await expect(createStatus(page)).toHaveText(DONE);
  await page.reload();
  expect(await bodies(page).first().textContent()).toBe(long);
  const huge = "x".repeat(6_000_000);
  await page.evaluate((v) => {
    (document.querySelector("#memo-body") as HTMLTextAreaElement).value = v;
  }, huge);
  await submit(page).click();
  await expect(createStatus(page)).toContainText("保存できませんでした");
  expect(await input(page).evaluate((el) => (el as HTMLTextAreaElement).value.length)).toBe(huge.length);
  await page.reload();
  await expect(items(page)).toHaveCount(1);
});

test("T-MB-02 同じ環境で同時に開いた2つの画面で、一方の登録が他方で登録済みのメモを変更・消失させない", async ({ context }) => {
  const a = await context.newPage();
  const b = await context.newPage();
  await a.goto("/");
  await b.goto("/");
  await register(a, "Aで登録");
  await register(b, "Bで登録");
  await register(a, "Aで再登録");
  await b.reload();
  await expect(bodies(b)).toHaveText(["Aで再登録", "Bで登録", "Aで登録"]);
});

test("T-CR-02 / T-MB-01（ブラウザを閉じて再び開く。実ブラウザでの人間確認 T-OUT-14 の代替ではない）登録したメモが新しい順で残る", async ({ baseURL }) => {
  // プロファイル（保存先）はテスト出力ディレクトリ（test-results/）内に置く。
  // テスト名を含む出力パスは非ASCII文字を含み、Chromiumのプロファイル保存が成立しないため、ASCIIのパスにする。
  const dir = `${test.info().project.outputDir}/memo-profile-${Date.now()}`;
  {
    let ctx = await chromium.launchPersistentContext(dir);
    let page = await ctx.newPage();
    await page.goto(baseURL!);
    await register(page, "閉じる前1");
    await register(page, "閉じる前2");
    await expect(createStatus(page)).toHaveText(DONE);
    await ctx.close();

    ctx = await chromium.launchPersistentContext(dir);
    page = await ctx.newPage();
    await page.goto(baseURL!);
    await expect(bodies(page)).toHaveText(["閉じる前2", "閉じる前1"]);
    await ctx.close();
  }
});

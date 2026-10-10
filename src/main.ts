// 出力物語「メモ画面を表示する」（ST-OUT-MEMO）。出力先: パソコンのブラウザ画面。
import { createMemo, listMemos, type Memo, type StorageSource } from "./memo";

const storage: StorageSource = () => window.localStorage;

const form = document.querySelector<HTMLFormElement>("#memo-form")!;
const input = document.querySelector<HTMLTextAreaElement>("#memo-body")!;
const createStatus = document.querySelector<HTMLElement>("#create-status")!;
const listStatus = document.querySelector<HTMLElement>("#list-status")!;
const list = document.querySelector<HTMLOListElement>("#memo-list")!;

/** 一覧を取得できているか（Koto3）／できていないか（Koto4）。 */
let listLoaded = false;

function formatDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function memoItem(memo: Memo): HTMLLIElement {
  const li = document.createElement("li");
  li.dataset.memoId = memo.id;
  const body = document.createElement("p");
  body.className = "memo-body";
  body.textContent = memo.body;
  const time = document.createElement("time");
  time.dateTime = new Date(memo.createdAt).toISOString();
  time.textContent = formatDate(memo.createdAt);
  li.append(body, time);
  return li;
}

function showEmptyNotice(): void {
  listStatus.className = "";
  listStatus.textContent = "メモはまだありません。";
}

// Koto2〜4: 一覧を取得して表示する。
function loadList(): void {
  const result = listMemos(storage);
  if (result.fact === "メモ一覧を取得した") {
    listLoaded = true;
    list.replaceChildren(...result.memos.map(memoItem));
    if (result.memos.length === 0) showEmptyNotice();
    else listStatus.replaceChildren();
    return;
  }
  // Koto4: 表示できなかったことと、やり直す操作。
  listLoaded = false;
  list.replaceChildren();
  const message = document.createElement("p");
  message.className = "problem";
  message.textContent = "メモを表示できませんでした。";
  const retry = document.createElement("button");
  retry.type = "button";
  retry.id = "list-retry";
  retry.textContent = "もう一度読み込む";
  retry.addEventListener("click", loadList);
  listStatus.replaceChildren(message, retry);
}

// Koto5〜7: 確認を挟まずに登録する。
form.addEventListener("submit", (event) => {
  event.preventDefault();
  createStatus.className = "";
  createStatus.textContent = "";

  const result = createMemo(storage, input.value);

  if (result.fact === "メモを登録した") {
    // Koto6: 返された後だけ完了を示し、一覧の最も新しい位置に表示する。
    createStatus.textContent = "登録しました。";
    list.prepend(memoItem(result.memo));
    if (listLoaded) {
      listStatus.replaceChildren();
    } else {
      // 一覧を取得できていない: 取得できなかった表示とやり直す操作を残し、
      // 今回登録したメモだけであることを示す。
      const note = document.createElement("p");
      note.id = "list-partial-note";
      note.textContent = "一覧には、表示できなかったメモは含まれていません（今回登録したメモだけを表示しています）。";
      if (!listStatus.querySelector("#list-partial-note")) listStatus.append(note);
    }
    input.value = "";
    input.focus();
    return;
  }

  // Koto7: 完了として表示せず、理由を示し、入力中の本文を保持する。
  createStatus.className = "problem";
  createStatus.textContent =
    result.reason === "本文が空"
      ? "本文を入力すると登録できます。"
      : "保存できませんでした。入力した内容は残っています。もう一度「登録」を押してください。";
  input.focus();
});

loadList();
input.focus();

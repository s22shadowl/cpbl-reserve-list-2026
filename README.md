# 中職契約保留名簿 2026（六隊版）

球迷模擬工具：排出中職六隊的 2027 年度 60 人契約保留名單（《中華職棒大聯盟規章》第 8 章第 10 條），並查看所有球迷的保留率統計。

> 本專案改編自 [brienjohn/cpbl-reserve-list](https://github.com/brienjohn/cpbl-reserve-list)（富邦悍將版，原作者開放自由調整），擴充為中信兄弟、統一7-ELEVEn獅、樂天桃猿、富邦悍將、味全龍、台鋼雄鷹六隊。與原站為獨立服務，資料與統計不互通。

開發規劃與優先順序見 [`roadmap.md`](roadmap.md)。

## 功能

- 選隊後勾選 60 人，送出、修改或清空撤回；一鍵全選／全部取消各守位目前顯示的球員。
- 球員卡：照片四角顯示新人／旅外FA／選秀年份、勾選、背號、年齡；成績行只顯示一項主要數據（`一軍 ERA 4.83`／`一軍 OPS .771`），依出賽量分主力（較濃）與樣本少（較淡）。
- 篩選全部／已保留／未列入／新人，搜尋姓名或背號。
- 「大家的統計」：保留率排行與共識 60 人保留線；送出後列出「你和多數球迷不同」的決定（其他球迷保留率 ≤30% 卻被你保留、≥70% 卻被你放生）。
- 各隊頁面使用該隊官方主色，可切換淺色、深色或跟隨系統。
- 複製文字、存成圖片分享。
- 對答案（官方名單公布後開放，目前只在本機開啟）：你**已送出**的名單和球團的重疊人數、球迷平均、共識差異與爆冷。
- 官方名單公布後鎖定送出（Worker `LOCKED`）：仍可排自己的版本、複製文字與存圖，草稿存在本機。
- 不滿 60 人送出要按兩次確認；清空已送出的名單後按鈕變成「撤回名單」。

## 規則重點

- 各球團須於每年 11 月 30 日前提出下年度契約保留球員，上限 60 人；未列入者可與其他球團洽談。
- **不需列入 60 人**：洋將、行使自由球員、擴編選秀被選走、自主及自行培訓球員。這些球員不會出現在可選名單中，只在頁首標示為「不需列入」。

## 目錄結構

```
docs/                 GitHub Pages 靜態網站（純 HTML/CSS/JS，無建置步驟）
  index.html, app.js, style.css
  limit.js            60 人上限常數 LIMIT（最先載入，其他檔案共用）
  flags.js            功能開關與本機判斷（FLAGS、IS_LOCAL）
  theme.js            六隊與共通頁面的配色推導（TEAMS、deriveTheme）
  stats.js            卡片成績行與樣本量層級
  card.js             卡片角標（新人／FA／選秀年份）、年齡與說明文字
  bulk.js             一鍵全選／全部取消的判斷
  status.js           送出按鈕狀態、統計資料是否有變（沒變就不重繪）
  official.js         對答案計算（重疊、球迷平均、共識差異、爆冷）
  mine.js             你和多數球迷不同的決定
  focus.js            重新繪製後的鍵盤焦點落點
  prefs.js            配色模式（自動／淺色／深色）
  data/teams.json     各隊可選球員、排除名單、本季成績、新人標記（由 scraper 產生）
  data/official.sample.json  開發用假官方名單（正式名單公布後另產生 official.json）
  photos/             球員照片（由 scraper 下載，裁成偏上方的 240×240 WebP）
worker/               Cloudflare Worker API + D1
  src/index.js
  src/roster.json     各隊允許送出的球員 ID（由 scraper 產生，必須與 teams.json 一致）
  schema.sql
  test/               vitest + workerd 測試
  scripts/seed-dev.mjs  本機假球迷名單（seed-dev.test.mjs 以 node --test 測試）
scraper/              Python 爬蟲，從中職官網產生上述資料
  overrides.json      手動排除（引退、國內 FA）、強制納入、標籤（旅外FA）、新人（rookie）、選秀補正（draft）
  official.py         官方名單轉檔與開發用假名單
tests/frontend/       前端純函式測試（node --test）
e2e/                  Playwright 煙霧測試（選人、送出、撤回、草稿、對答案），使用獨立的本機 D1
roadmap.md            開發規劃（P0–P3）
.impeccable.md        設計脈絡（使用者、風格、原則）
```

## 更新球員資料

需要 Python 3.12 與 Poetry。爬蟲每次請求間隔 1.5 秒；個人頁有快取（`scraper/.cache/`），第一次約 25 分鐘，之後只需幾分鐘。

```bash
poetry install
poetry run python -m scraper.build            # 六隊；可加 --team AEO 只更新單隊，--refresh 忽略快取
poetry run python -m scraper.check            # 驗證資料，失敗時不要 commit
poetry run pytest                             # scraper 測試
node --test tests/frontend/*.test.mjs         # 前端測試
cd worker && npm test                         # Worker 測試
cd e2e && npm test                            # E2E 煙霧測試（需先停掉 npm run dev）
```

自動排除規則：國籍非中華民國且沒有選秀順位的判為洋將，名字有 `◎` 前綴的判為自主／自行培訓。引退、國內 FA 等無法自動判斷的情況，在 `scraper/overrides.json` 手動維護，每筆註明依據；旅外 FA 不排除，只加標籤。新人為 2026 年選秀，加上 `rookie` 中今年自培轉正的球員。更新 `roster.json` 後需要重新部署 Worker（`cd worker && npm run deploy`）。

## API（Cloudflare Worker）

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/stats?team=AEO` | 該隊送出份數 `n` 與每位球員被保留次數 `counts`（邊緣快取 60 秒，`&fresh=1` 略過快取） |
| GET | `/mine?team=AEO&voter=<uuid>` | 此裝置送出的名單 `{ids, at, locked}`（沒送出時 `ids: null`）；`locked` 為是否已鎖定送出 |
| POST | `/picks` | `{team, voter, ids}` 送出或覆蓋名單；空陣列為撤回。錯誤碼：`rate_limited`（429）、`bad_ids`（400）、`locked`（403，`LOCKED = "true"` 時） |

統計實作：每台裝置以 `localStorage` 中的 UUID 作為投票者，每隊一份。送出時計算新舊名單差異，於同一個 D1 batch 中寫入 `picks` 並以 `json_set` 增減 `tally` 表的每隊累計值；讀取統計只讀 `tally` 一列。新投票者每 IP（雜湊）每隊每日上限 50 份。

`worker/wrangler.toml` 的 `[vars] LOCKED`：`"true"` 時鎖定所有送出、修改與撤回（官方名單公布後使用），讀取照常。

隊伍代碼：`ACN` 中信兄弟、`ADD` 統一獅、`AJL` 樂天桃猿、`AEO` 富邦悍將、`AAA` 味全龍、`AKP` 台鋼雄鷹。

## 本機開發

前端在 `localhost` 或 `127.0.0.1` 開啟時，會自動改連本機 Worker（`http://localhost:8787`），不會寫入正式統計，並開啟對答案功能（讀 `official.sample.json`）。

```bash
# 1. 本機 Worker + 本機 D1（資料存在 worker/.wrangler/，不需登入 Cloudflare）
cd worker
npm install
npm run db:init     # 第一次執行時建立資料表
npm run dev         # http://localhost:8787
npm run db:reset    # 清空本機統計
npm run db:seed     # 寫入假球迷名單（看對答案、共識與爆冷）

# 2. 前端（另開一個終端機，在 repo 根目錄）
python3 -m http.server -d docs 8080 --bind 127.0.0.1    # http://localhost:8080/
```

### E2E 煙霧測試

改動前端流程（`docs/app.js` 的按鈕、分頁、送出、統計讀取）或 Worker 後，以及開啟對答案上線前，都要跑一次：

```bash
cd e2e
npm install
npm run install-browser   # 第一次：下載 Chromium
npm test                  # 每次重建 e2e/.state 的本機 D1 並寫入假名單，自動啟動 Worker（8787）與前端（8081）
```

前端固定連 `localhost:8787`，所以執行前要先停掉 `npm run dev`；8080 的預覽伺服器可以繼續開著。

## 部署

- 前端：GitHub Pages，從 `main` 分支的 `docs/` 發布。
- 後端：Cloudflare Worker `cpbl-reserve-2026-api` 與 D1 `cpbl-reserve-2026`，以 `cd worker && npm run deploy` 部署。
- 可選球員減少時，先推前端、等 Pages 更新後再部署 Worker。
- 對答案上線：見 roadmap P1-3 的上線步驟（先部署 `LOCKED = "true"` 的 Worker，再推前端開關）。

若要 fork 成自己的服務：建立自己的 D1（`wrangler d1 create`）、更新 `worker/wrangler.toml` 的 `name` 與 `database_id`、執行 `wrangler d1 execute DB --remote --file=schema.sql`、以 `wrangler secret put IP_SALT` 設定隨機鹽值，最後把 `docs/app.js` 的 `API` 改成自己的 Worker 網址。

## 資料來源與聲明

球員名單與照片取自[中華職棒官網](https://www.cpbl.com.tw/)。本網站為球迷模擬，與中華職棒及各球團無關。

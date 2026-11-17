# 中職契約保留名簿 2026（六隊版）

球迷模擬工具：排出中職六隊的 2027 年度 60 人契約保留名單（《中華職棒大聯盟規章》第 8 章第 10 條），並查看所有球迷的保留率統計。

**網站：<https://s22shadowl.github.io/cpbl-reserve-list-2026/>**

> 本專案改編自 [brienjohn/cpbl-reserve-list](https://github.com/brienjohn/cpbl-reserve-list)（富邦悍將版，原作者開放自由調整），擴充為中信兄弟、統一7-ELEVEn獅、樂天桃猿、富邦悍將、味全龍、台鋼雄鷹六隊。與原站為獨立服務，資料與統計不互通。

## 功能

- **排名單**：選隊後勾選 60 人，送出、修改，或清空後撤回；各守位可一鍵全選／全部取消目前顯示的球員。篩選全部／已保留／未列入／新人，搜尋姓名或背號。
- **球員卡**：照片、背號、年齡，角標標示新人／旅外FA／選秀年份；成績行只顯示一項主要數據（如 `一軍 ERA 4.83`、`一軍 OPS .771`），依出賽量分主力與樣本少。
- **大家的統計**：保留率排行（預設前 20 名，可展開第 21～60 名）與共識 60 人保留線；送出後列出「你和多數球迷不同」的決定。
- **分享**：複製文字、存成圖片。
- **外觀**：各隊頁面使用該隊官方主色，可切換淺色、深色或跟隨系統。
- **對答案**（官方名單公布後開放）：你已送出的名單和球團的重疊人數、球迷平均、共識差異與爆冷。公布後鎖定送出，仍可排自己的版本、複製與存圖。

## 規則重點

- 各球團須於每年 11 月 30 日前提出下年度契約保留球員，上限 60 人；未列入者可與其他球團洽談。
- **不需列入 60 人**：洋將、行使國內自由球員、擴編選秀被選走、自主及自行培訓球員。這些球員不會出現在可選名單中，只在頁首標示為「不需列入」。旅外 FA 仍須列入，可選並加上標籤。

---

以下為開發說明。開發規劃與決策紀錄見 [`roadmap.md`](roadmap.md)，設計脈絡見 [`.impeccable.md`](.impeccable.md)。

## 架構

- **前端**：`docs/` 的純 HTML／CSS／JS，沒有建置步驟，由 GitHub Pages 發布。
- **後端**：Cloudflare Worker ＋ D1，只負責收名單與回傳統計。
- **資料**：Python 爬蟲從中職官網產生球員資料與照片，手動執行後 commit。
- 全部使用免費方案。

## 目錄結構

```
docs/                     GitHub Pages 靜態網站
  index.html, app.js, style.css   頁面與串接層（DOM、事件、API 呼叫）
  limit.js                60 人上限常數 LIMIT（最先載入，其他檔案共用）
  flags.js                功能開關與本機判斷（FLAGS、IS_LOCAL）
  theme.js                六隊與共通頁面的配色推導（TEAMS、deriveTheme）
  card.js                 卡片角標（新人／FA／選秀年份）、年齡與說明文字
  stats.js                卡片成績行與樣本量層級
  filter.js               篩選、搜尋與守位人數
  bulk.js                 一鍵全選／全部取消的判斷
  rank.js                 統計排行的分段（前 20、展開 21～60、保留線、61 以後）
  status.js               送出按鈕狀態、統計資料是否有變（沒變就不重繪）
  official.js             對答案計算（重疊、球迷平均、共識差異、爆冷）
  mine.js                 你和多數球迷不同的決定
  focus.js                重新繪製後的鍵盤焦點落點
  prefs.js                配色模式（自動／淺色／深色）
  og.png                  分享預覽圖
  data/teams.json         各隊可選球員、排除名單、本季成績、新人標記（scraper 產生）
  data/official.sample.json  開發用假官方名單（正式名單公布後另產生 official.json）
  photos/                 球員照片（scraper 下載，240×240 WebP）
worker/                   Cloudflare Worker API + D1
  src/index.js            API
  src/roster.json         各隊允許送出的球員 ID（scraper 產生，必須與 teams.json 一致）
  schema.sql              D1 資料表
  wrangler.toml           Worker 設定（含 LOCKED 鎖定開關）
  test/                   Worker 測試（vitest + workerd）
  scripts/seed-dev.mjs    本機假球迷名單（seed-dev.test.mjs 以 node --test 測試）
scraper/                  Python 爬蟲，從中職官網產生上述資料
  build.py                主程式：抓名單、個人頁、成績與照片，寫出 teams.json 與 roster.json
  check.py                資料檢查（commit 前必跑）
  official.py             官方名單轉檔與開發用假名單
  overrides.json          手動排除（引退、國內 FA）、標籤（旅外FA）、新人、選秀補正
  fetcher.py, parse_*.py, classify.py, photos.py, output.py, models.py
  tests/                  pytest 測試與官網頁面樣本
tests/frontend/           前端純函式測試（node --test）
e2e/                      Playwright E2E 測試，使用獨立的本機 D1（e2e/.state）
```

## 本機開發

需要 Node.js 與 Python 3.12（Poetry）。前端在 `localhost` 或 `127.0.0.1` 開啟時，會自動改連本機 Worker（`http://localhost:8787`），不會寫入正式統計，並開啟對答案（讀 `official.sample.json`）。

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

`http.server` 會讓瀏覽器快取舊的 JS／CSS，修改後要強制重新整理（Ctrl+Shift+R）。

## 測試

| 範圍 | 指令 |
|---|---|
| 爬蟲 | `poetry run pytest` |
| 前端純函式 | `node --test tests/frontend/*.test.mjs` |
| 前端覆蓋率 | `node --test --experimental-test-coverage tests/frontend/*.test.mjs` |
| Worker | `cd worker && npm test`（vitest，接著以 node --test 跑 `scripts/` 的測試） |
| E2E | `cd e2e && npm test` |

單元測試只涵蓋純函式；`app.js` 的串接層（送出、撤回、統計讀取、換隊、全選等）由 E2E 涵蓋。改動前端流程或 Worker 後、以及開啟對答案上線前，都要跑一次 E2E：

```bash
cd e2e
npm install
npm run install-browser   # 第一次：下載 Chromium
npm test                  # 每次重建 e2e/.state 的本機 D1 並寫入假名單，自動啟動 Worker（8787）與前端（8081）
```

E2E 的前端固定連 `localhost:8787`，執行前要先停掉 `npm run dev`；8080 的預覽伺服器可以繼續開著。

## 更新球員資料

爬蟲每次請求間隔 1.5 秒；個人頁有快取（`scraper/.cache/`），第一次約 25 分鐘，之後只需幾分鐘。

```bash
poetry install
poetry run python -m scraper.build     # 六隊；可加 --team AEO 只更新單隊，--refresh 忽略快取
poetry run python -m scraper.check     # 驗證資料，失敗時不要 commit
```

- **自動排除**：國籍非中華民國且沒有選秀順位的判為洋將（選秀入團的外籍球員算本土）；名字有 `◎` 前綴的判為自主／自行培訓。
- **手動維護**（`scraper/overrides.json`，每筆註明新聞來源）：引退、國內 FA 排除；旅外 FA 不排除，只加標籤；今年自培轉正的新人；官網缺漏的選秀紀錄。
- **新人**：2026 年選秀入團，加上 `rookie` 中今年自培轉正的球員。
- `roster.json` 有變動時要重新部署 Worker；可選球員減少時，先推前端、等 Pages 更新後再部署 Worker，否則舊頁面送出的名單會被拒絕。

## API（Cloudflare Worker）

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/stats?team=AEO` | 該隊送出份數 `n` 與每位球員被保留次數 `counts`（邊緣快取 60 秒，`&fresh=1` 略過快取） |
| GET | `/mine?team=AEO&voter=<uuid>` | 此裝置送出的名單 `{ids, at, locked}`（沒送出時 `ids: null`）；`locked` 為是否已鎖定送出 |
| POST | `/picks` | `{team, voter, ids}` 送出或覆蓋名單；空陣列為撤回。錯誤碼：`rate_limited`（429）、`bad_ids`（400）、`locked`（403） |

- 每台裝置以 `localStorage` 中的 UUID 作為投票者，每隊一份。
- 送出時計算新舊名單差異，在同一個 D1 batch 中寫入 `picks`，並以 `json_set` 增減 `tally` 表的每隊累計值；讀取統計只讀 `tally` 一列。
- 新投票者每 IP（雜湊）每隊每日上限 50 份。
- `worker/wrangler.toml` 的 `[vars] LOCKED` 設為 `"true"` 時，鎖定所有送出、修改與撤回（官方名單公布後使用），讀取照常。

隊伍代碼：`ACN` 中信兄弟、`ADD` 統一獅、`AJL` 樂天桃猿、`AEO` 富邦悍將、`AAA` 味全龍、`AKP` 台鋼雄鷹。

## 部署

- 前端：GitHub Pages，從 `main` 分支的 `docs/` 發布，推上 main 即更新。
- 後端：Cloudflare Worker `cpbl-reserve-2026-api` 與 D1 `cpbl-reserve-2026`，以 `cd worker && npm run deploy` 部署。
- 對答案上線：見 roadmap P1-3 的上線步驟（先部署 `LOCKED = "true"` 的 Worker，再推開啟對答案的前端）。

### Fork 成自己的服務

1. 建立自己的 D1：`wrangler d1 create <名稱>`。
2. 更新 `worker/wrangler.toml` 的 `name` 與 `database_id`。
3. 建立資料表：`wrangler d1 execute DB --remote --file=schema.sql`。
4. 設定隨機鹽值：`wrangler secret put IP_SALT`（本機開發可放在 `worker/.dev.vars`，已列入 `.gitignore`）。
5. 把 `docs/app.js` 的 `API` 改成自己的 Worker 網址。

## 資料來源與聲明

球員名單與照片取自[中華職棒官網](https://www.cpbl.com.tw/)。本網站為球迷模擬，與中華職棒及各球團無關。

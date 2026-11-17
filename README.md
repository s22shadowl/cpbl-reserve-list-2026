# 中職契約保留名簿 2026（六隊版）

排出中職六隊的 2027 年度 60 人契約保留名單（《中華職棒大聯盟規章》第 8 章第 10 條），並查看所有球迷的保留率統計。

**網站：<https://s22shadowl.github.io/cpbl-reserve-list-2026/>**

> 改編自 [brienjohn/cpbl-reserve-list](https://github.com/brienjohn/cpbl-reserve-list)（富邦悍將版，原作者開放自由調整），擴充為六隊。與原站為獨立服務，統計不互通。

## 功能

- **排名單**：勾選 60 人後送出、修改或撤回；可篩選、搜尋姓名或背號，各守位可一鍵全選。
- **球員卡**：照片、背號、年齡、新人／旅外FA／選秀年份標記，以及一項本季主要成績。
- **大家的統計**：保留率排行、共識 60 人保留線，以及「你和多數球迷不同」的決定。
- **分享**：複製文字、存成圖片。
- **外觀**：各隊官方主色，淺色／深色／跟隨系統。
- **對答案**（官方名單公布後開放）：你的名單和球團的重疊人數、球迷平均、共識差異與爆冷。公布後停止送出。

## 規則重點

- 各球團須於每年 11 月 30 日前提出下年度契約保留球員，上限 60 人；未列入者可與其他球團洽談。
- **不需列入**：洋將、行使國內自由球員、擴編選秀被選走、自主及自行培訓球員，不會出現在可選名單中。旅外 FA 仍須列入。

---

以下為開發說明。規劃與決策紀錄見 [`roadmap.md`](roadmap.md)，設計脈絡見 [`.impeccable.md`](.impeccable.md)。

## 架構

`docs/` 是純靜態前端（無建置步驟），由 GitHub Pages 發布；Cloudflare Worker ＋ D1 收名單、回傳統計；Python 爬蟲從中職官網產生球員資料，手動執行後 commit。全部使用免費方案。

```
docs/                 前端
  app.js              串接層（DOM、事件、API）
  limit.js, flags.js, theme.js, card.js, stats.js, filter.js, bulk.js,
  rank.js, status.js, official.js, mine.js, focus.js, prefs.js   純函式模組
  data/teams.json     各隊球員資料（scraper 產生）
  data/official.sample.json  開發用假官方名單
  photos/             球員照片（scraper 產生）
worker/               Cloudflare Worker
  src/index.js        API
  src/roster.json     允許送出的球員 ID（scraper 產生，須與 teams.json 一致）
  scripts/seed-dev.mjs  本機假球迷名單
scraper/              爬蟲
  build.py            產生 teams.json、roster.json 與照片
  check.py            資料檢查
  official.py         官方名單轉檔
  overrides.json      手動排除、標籤、新人與選秀補正
tests/frontend/       前端單元測試
e2e/                  Playwright E2E 測試
```

## 本機開發

需要 Node.js 與 Python 3.12（Poetry）。前端在 localhost 開啟時會改連本機 Worker（`localhost:8787`），並開啟對答案（讀 `official.sample.json`）。

```bash
cd worker
npm install
npm run db:init     # 第一次：建立資料表
npm run dev         # Worker：http://localhost:8787
npm run db:seed     # 寫入假球迷名單（可選）
npm run db:reset    # 清空本機統計

# 另開終端機，在 repo 根目錄
python3 -m http.server -d docs 8080 --bind 127.0.0.1    # 前端：http://localhost:8080/
```

修改後要強制重新整理（Ctrl+Shift+R），`http.server` 會讓瀏覽器快取舊檔。

## 測試

| 範圍 | 指令 |
|---|---|
| 爬蟲 | `poetry run pytest` |
| 前端 | `node --test tests/frontend/*.test.mjs`（覆蓋率加 `--experimental-test-coverage`） |
| Worker | `cd worker && npm test` |
| E2E | `cd e2e && npm test` |

E2E 涵蓋單元測試測不到的 `app.js` 串接層；改動前端流程或 Worker 後都要跑。第一次先在 `e2e/` 執行 `npm install` 與 `npm run install-browser`。E2E 會自行啟動 Worker（8787）與前端（8081），執行前要停掉 `npm run dev`。

## 更新球員資料

```bash
poetry install
poetry run python -m scraper.build     # 可加 --team AEO 只更新單隊、--refresh 忽略快取
poetry run python -m scraper.check     # 失敗時不要 commit
```

第一次約 25 分鐘，之後有快取只需幾分鐘。

- 自動排除洋將（國籍非中華民國且沒有選秀順位）與自主／自行培訓（名字有 `◎`）。
- 引退、國內 FA、旅外 FA 標籤、自培轉正新人等，在 `scraper/overrides.json` 手動維護並註明來源。
- `roster.json` 有變動時要重新部署 Worker。可選球員減少時，先推前端、等 Pages 更新後再部署 Worker。

## API

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/stats?team=AEO` | 送出份數 `n` 與每位球員被保留次數 `counts`（快取 60 秒，`&fresh=1` 略過） |
| GET | `/mine?team=AEO&voter=<uuid>` | 此裝置的名單 `{ids, at, locked}`，沒送出時 `ids: null` |
| POST | `/picks` | `{team, voter, ids}` 送出或覆蓋，空陣列為撤回。錯誤：`rate_limited`（429）、`bad_ids`（400）、`locked`（403） |

- 投票者是 `localStorage` 中的 UUID，每隊一份；新投票者每 IP 每隊每日上限 50 份。
- 統計累計在 `tally` 表，送出時只增減新舊名單的差異。
- `wrangler.toml` 的 `LOCKED = "true"` 時停止送出，讀取照常。

隊伍代碼：`ACN` 中信兄弟、`ADD` 統一獅、`AJL` 樂天桃猿、`AEO` 富邦悍將、`AAA` 味全龍、`AKP` 台鋼雄鷹。

## 部署

- 前端：推上 `main` 後由 GitHub Pages 發布 `docs/`。
- Worker：`cd worker && npm run deploy`。
- 對答案上線步驟見 roadmap P1-3。

Fork 成自己的服務：

1. `wrangler d1 create <名稱>`，把 `name` 與 `database_id` 填入 `worker/wrangler.toml`。
2. `wrangler d1 execute DB --remote --file=schema.sql`。
3. `wrangler secret put IP_SALT`（本機可放在 `worker/.dev.vars`）。
4. 把 `docs/app.js` 的 `API` 改成自己的 Worker 網址。

## 資料來源與聲明

球員名單與照片取自[中華職棒官網](https://www.cpbl.com.tw/)。本網站為球迷模擬，與中華職棒及各球團無關。

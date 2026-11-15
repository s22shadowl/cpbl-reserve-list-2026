# 中職契約保留名簿 2026（六隊版）

球迷模擬工具：排出中職六隊的 2027 年度 60 人契約保留名單（《中華職棒大聯盟規章》第 8 章第 10 條），並查看所有球迷的保留率統計。

> 本專案改編自 [brienjohn/cpbl-reserve-list](https://github.com/brienjohn/cpbl-reserve-list)（富邦悍將版，原作者開放自由調整），擴充為中信兄弟、統一7-ELEVEn獅、樂天桃猿、富邦悍將、味全龍、台鋼雄鷹六隊。與原站為獨立服務，資料與統計不互通。

開發規劃與優先順序見 [`roadmap.md`](roadmap.md)。

## 規則重點

- 各球團須於每年 11 月 30 日前提出下年度契約保留球員，上限 60 人；未列入者可與其他球團洽談。
- **不需列入 60 人**：洋將、行使自由球員、擴編選秀被選走、自主及自行培訓球員。這些球員不會出現在可選名單中，只在頁首標示為「不需列入」。

## 目錄結構

```
docs/                 GitHub Pages 靜態網站（純 HTML/CSS/JS，無建置步驟）
  index.html, app.js, style.css
  data/teams.json     各隊可選球員與排除名單（由 scraper 產生）
  photos/             球員照片（由 scraper 下載）
worker/               Cloudflare Worker API + D1
  src/index.js
  src/roster.json     各隊允許送出的球員 ID（由 scraper 產生，必須與 teams.json 一致）
  schema.sql
scraper/              （規劃中）Python 爬蟲，從中職官網產生上述資料
roadmap.md            開發規劃（P0–P3）
```

目前 `docs/data/` 與 `worker/src/roster.json` 仍是原版的悍將資料（2026-10-07），`wrangler.toml` 與 `app.js` 的 API 設定也仍指向原站，將於 roadmap P0 替換。

## API（Cloudflare Worker）

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/stats?team=AEO` | 該隊送出份數 `n` 與每位球員被保留次數 `counts`（邊緣快取 60 秒，`&fresh=1` 略過快取） |
| GET | `/mine?team=AEO&voter=<uuid>` | 此裝置送出的名單 |
| POST | `/picks` | `{team, voter, ids}` 送出或覆蓋名單；空陣列為撤回 |

統計實作：每台裝置以 `localStorage` 中的 UUID 作為投票者，每隊一份。送出時計算新舊名單差異，於同一個 D1 batch 中寫入 `picks` 並以 `json_set` 增減 `tally` 表的每隊累計值；讀取統計只讀 `tally` 一列。新投票者每 IP（雜湊）每隊每日上限 20 份。

隊伍代碼：`ACN` 中信兄弟、`ADD` 統一獅、`AJL` 樂天桃猿、`AEO` 富邦悍將、`AAA` 味全龍、`AKP` 台鋼雄鷹。

## 本機開發

前端在 `localhost` 或 `127.0.0.1` 開啟時，會自動改連本機 Worker（`http://localhost:8787`），不會寫入正式統計。

```bash
# 1. 本機 Worker + 本機 D1（資料存在 worker/.wrangler/，不需登入 Cloudflare）
cd worker
npm install
npm run db:init     # 第一次執行時建立資料表
npm run dev         # http://localhost:8787
npm run db:reset    # 清空本機統計

# 2. 前端（另開一個終端機，在 repo 根目錄）
python3 -m http.server -d docs 8080 --bind 127.0.0.1    # http://localhost:8080/
```

部署需自行建立 Cloudflare Worker 與 D1，並更新 `worker/wrangler.toml` 的 `database_id` 與 `docs/app.js` 的 `API` 網址（見 roadmap P0-6）。

## 資料來源與聲明

球員名單與照片取自[中華職棒官網](https://www.cpbl.com.tw/)。本網站為球迷模擬，與中華職棒及各球團無關。

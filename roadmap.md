# Roadmap

把富邦悍將版的 60 人契約保留名單模擬器，擴充為中職六隊、獨立部署的新服務。

優先級定義：

- **P0**：上線必要，沒有就不能公開。
- **P1**：上線後最先做，回應主要使用者回饋。
- **P2**：加分功能。
- **P3**：觀察後視需要再做。

## 已確認的決策

| 項目 | 決策 |
|---|---|
| 與原站關係 | 完全獨立的新服務：新 Worker、新 D1、新 GitHub Pages，統計從零開始 |
| repo | `~/dev/cpbl-reserve-list-2026`，從乾淨的初始 commit 開始，GitHub public（Pages 免費方案需要） |
| 功能範圍 | 沿用原版功能（選人、送出、統計、複製文字、存圖），擴到六隊並加上選隊首頁 |
| 爬蟲 | 新 repo 內的獨立 Python 腳本（`scraper/`），移植 `cpbl_takao_today_BE` 的 fetcher（requests 優先、Playwright 備援，錯誤分為可重試與致命）與 BeautifulSoup 解析寫法；手動執行後 commit 產出 |
| 不需列入的球員 | 洋將、行使 FA、擴編選秀被選走、自主／自行培訓、已非球員。由手動維護的 `scraper/overrides.json` 標記，從可選名單與 Worker 允許清單中排除，頁首顯示「不需列入」 |
| 後端 | Worker API 與 D1 schema 沿用，不需修改即可支援六隊 |
| 費用 | 全部使用免費方案（Cloudflare Workers/D1、GitHub Pages）。瓶頸是 Workers 每日 10 萬次請求，約可承受每日 7 千到 2 萬名活躍使用者；超過時當日 API 失敗，前端已有錯誤提示 |
| 不做 | 排除新人時跳提醒、簽約金顯示（無官方來源）、「認賠」模擬器 |

## 主要風險

- **中職官網可能擋爬蟲**：原作者表示「中職官網不讓我爬資料」，所以只做了一隊。P0-1 必須先驗證。
- **排除名單只能手動整理**：官網看不出自主培訓、行使 FA、擴編選秀被選走。整理時要參考新聞與球團公告。
- **爆量**：被 PTT 或 Threads 大量轉貼時可能用完 Workers 免費額度。P0-8 先降低請求數。

---

## P0：上線必要

### P0-1 爬蟲可行性驗證
- 用 requests 抓官網的球隊球員列表頁與個人頁；若被擋，改用 Playwright（沿用 BE 的 `get_dynamic_page_content`）。
- 確認可以取得的欄位：球員 ID、姓名、背號、守位、一軍或二軍、照片網址、生日、選秀年份與輪次、國籍或洋將標記。
- 驗收：寫一份筆記記錄六隊列表頁都能穩定取得的方法、每個欄位的 selector，以及友善抓取間隔。若完全無法取得，回頭討論替代資料來源。

### P0-2 scraper 專案骨架
- `scraper/` 加上 `pyproject.toml`（或 `requirements.txt`），相依套件為 requests、beautifulsoup4、lxml，視 P0-1 結果加 playwright。
- 移植 BE 的 fetcher：可重試／致命錯誤分類、User-Agent、逾時、抓取間隔。
- 執行入口：`python -m scraper.build`，參數可以指定單隊或全部。

### P0-3 名單解析與產出
- 先用存成 fixture 的 HTML 寫 pytest 測試，再實作 parser（TDD）。
- 套用 `overrides.json`：`exclude` 列出要排除的球員和原因（foreign／training／fa／expansion／removed），`include` 讓官網沒列出、但應該可選的球員可以手動補上。
- 產出 `docs/data/teams.json`，格式與現有版本相容：`players[]` 的 `id/n/no/g/l/p/ph`，以及 `exempt.{foreign,training,removed}`。先保留 P1 需要的欄位：`b` 為生日，`dy` 為選秀年份，`dr` 為選秀輪次。
- 產出 `worker/src/roster.json`，內容**必須等於** teams.json 的可選球員。原版悍將的 roster.json 有 93 人，teams.json 只有 86 人，兩邊不一致，這次要修正。
- 下載照片到 `docs/photos/<id>.jpg`；沒有照片的球員設 `ph: 0`。

### P0-4 資料檢查腳本
- `python -m scraper.check`：檢查六隊都有資料、ID 都是 10 位數字、沒有重複、teams.json 與 roster.json 一致、可選人數合理（大於 60），並對照片缺漏發出警告。
- 每次重新產生資料後都要執行，失敗就不 commit。

### P0-5 前端改為六隊共用
- `index.html` 的 `<title>`、description、og 標籤與 `theme-color` 改成不綁特定球隊。
- 選隊首頁使用中性配色（目前借用悍將的配色），並逐一檢查六隊配色的對比。
- 頁尾的資料來源說明與日期改為由 `teams.json.updated` 動態帶入。
- 存圖與複製文字的連結改成新站網址。

### P0-6 Cloudflare 部署
- 在自己的帳號建立 Worker（例如 `cpbl-reserve-2026-api`）與 D1，執行 `schema.sql`。
- 更新 `wrangler.toml` 的 `name` 與 `database_id`，以 `wrangler secret put IP_SALT` 設定新的鹽值。
- 更新 `docs/app.js` 的 `API` 網址。

### P0-7 GitHub Pages 上線與煙霧測試
- 從 `docs/` 啟用 Pages。
- 手動跑一遍：六隊各選人、送出、看統計、撤回、複製文字、存圖；也要在手機寬度確認畫面。

### P0-8 免費額度防護
- 統計分頁輪詢只在分頁可見時執行，間隔從 60 秒改為 120 秒。
- 評估把 `/stats` 的邊緣快取從 20 秒拉長到 60 秒。自己剛送出時仍以 `fresh=1` 跳過快取。

---

## P1：回應使用者回饋

### P1-1 新人與選秀年份標記
- PTT 反映最多的問題：很多球迷不認識新秀，就把剛選進來的人丟到名單外。
- 球員卡片顯示選秀年份；當年度（2026）選秀新人加上醒目的「新人」標籤。
- 篩選列加上「只看新人」。

### P1-2 年齡顯示
- 依生日計算年齡（以資料日期為準），顯示在卡片的副標。

### P1-3 官方名單公布後對答案
- 聯盟公告實際保留名單後，手動整理成 `scraper/official/2027.json`，再併入 teams.json 的 `official` 欄位。
- 統計頁顯示球迷共識和球團實際名單的差異，例如「球迷保留、球團沒保留」和「球迷放生、球團保留」。也列出爆冷名單，也就是共識度高卻和球團決定相反的球員。
- 個人命中率：前端用自己的名單和官方名單比對，不需要後端。
- 公布後鎖定送出：Worker 讀環境變數 `LOCKED=1`，`POST /picks` 回 423，統計仍可讀。

### P1-4 Worker 自動化測試
- 使用 vitest 與 `@cloudflare/vitest-pool-workers`，涵蓋輸入驗證、tally 增減（新增、覆蓋、撤回）、IP 限流與 LOCKED 狀態。

---

## P2：加分功能

### P2-1 選秀輪次
- 卡片上顯示「2026 第 3 輪」。輪次越後面，簽約成本越低，PTT 有球迷用這點討論要不要保留。

### P2-2 我 vs 共識差異
- 送出後在統計頁列出「你和多數球迷意見不同的決定」：你保留但保留率低於 30%，以及你放生但保留率高於 70% 的球員。
- 該隊至少要有 10 份名單才顯示。只用現有的 stats 資料，不需要新的 API。

### P2-3 球員本季成績
- 爬取本季一二軍成績，可以參考 BE 的 `parsers/season_stats.py`。打者顯示打擊率與 OPS，投手顯示 ERA 與投球局數。
- 以精簡欄位存進 teams.json，例如 `s`，並注意檔案大小。

### P2-4 跨隊「釋出市場」頁
- 新增 `#market` 頁：列出六隊中最常被球迷放在 60 人外的球員，可以依守位篩選。對應推文「爪會簽嗎？」這類討論。
- Worker 新增 `GET /stats/all`，一次讀六列 tally，同樣有邊緣快取，避免前端打六次 API。
- 每隊至少要有 10 份名單才列入。

### P2-5 E2E 測試
- 用 Playwright 測關鍵流程：選隊、選人、送出、看統計。Worker 改用本機 `wrangler dev`。

---

## P3：觀察後視需要

### P3-1 灌票觀察
- 定期查 D1，看每日新增份數和單一 IP 雜湊的分布。如果異常，再考慮加 Cloudflare Turnstile。

### P3-2 CORS 限定網域
- `Access-Control-Allow-Origin` 從 `*` 改成只允許 Pages 網域。

### P3-3 資料更新自動化
- 用 GitHub Actions 手動觸發 scraper，自動跑 check 再開 PR。只在名單需要頻繁更新時才做。

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

### P0-1 爬蟲可行性驗證（已完成，2026-11-15）
- 結論：**只用 requests 就夠，不需要 Playwright**。HiNet CDN 第一次會回 308 並發 cookie，用 Session 保存 cookie 即可；二軍名單用 POST `/team` 加 `KindCode=D` 取得。
- 個人頁有生日、國籍、選秀順位，名字前綴 `◎` 代表自主／自行培訓。
- 詳細的 selector 與六隊實測人數見 `plans/2026-11-15-p0-six-teams.md`。

### P0-2 scraper 專案骨架（已完成）
- `scraper/` 加上 `pyproject.toml`（或 `requirements.txt`），相依套件為 requests、beautifulsoup4、lxml，視 P0-1 結果加 playwright。
- 移植 BE 的 fetcher：可重試／致命錯誤分類、User-Agent、逾時、抓取間隔。
- 執行入口：`python -m scraper.build`，參數可以指定單隊或全部。

### P0-3 名單解析與產出（已完成）
- 先用存成 fixture 的 HTML 寫 pytest 測試，再實作 parser（TDD）。
- 自動排除：國籍非中華民國且無選秀順位的判為 foreign（經選秀入團的外籍球員視同本土球員，列入可選），名字有 `◎` 前綴的判為 training。
- 套用 `overrides.json`：`exclude` 手動排除球員並註明原因（foreign／training／fa／expansion／removed），`include` 讓被自動規則誤判排除的球員強制變成可選。
- `overrides.json` 的 `tags`（選填）：`{"<id>": {"label", "name", "note"}}` 為球員加上標籤，不影響可選與否，例如已宣告 FA 但仍需列入名單的球員。`label` 最多 6 字，輸出為 teams.json 的 `tag`，卡片名字旁顯示小標籤，title 與 aria-label 也帶上；被 `exclude` 的球員不能加標籤。
- 產出 `docs/data/teams.json`，格式與現有版本相容：`players[]` 的 `id/n/no/g/l/p/ph`，以及 `exempt.{foreign,training,removed}`。先保留 P1 需要的欄位：`b` 為生日，`dy` 為選秀年份，`dr` 為選秀輪次。
- 產出 `worker/src/roster.json`，內容**必須等於** teams.json 的可選球員。原版悍將的 roster.json 有 93 人，teams.json 只有 86 人，兩邊不一致，這次要修正。
- 下載照片到 `docs/photos/<id>.jpg`；沒有照片的球員設 `ph: 0`。

### P0-4 資料檢查腳本（已完成）
- `python -m scraper.check`：檢查六隊都有資料、ID 都是 10 位數字、沒有重複、teams.json 與 roster.json 一致、可選人數合理（大於 60），並對照片缺漏發出警告。
- 每次重新產生資料後都要執行，失敗就不 commit。

### P0-5 前端改為六隊共用（已完成）
- `index.html` 的 `<title>`、description、og 標籤與 `theme-color` 改成不綁特定球隊。
- 選隊首頁使用中性配色（目前借用悍將的配色），並逐一檢查六隊配色的對比。
- 頁尾的資料來源說明與日期改為由 `teams.json.updated` 動態帶入。
- 存圖與複製文字的連結改成新站網址。

### P0-6 Cloudflare 部署（已完成）
- 在自己的帳號建立 Worker（例如 `cpbl-reserve-2026-api`）與 D1，執行 `schema.sql`。
- 更新 `wrangler.toml` 的 `name` 與 `database_id`，以 `wrangler secret put IP_SALT` 設定新的鹽值。
- 更新 `docs/app.js` 的 `API` 網址。

### P0-7 GitHub Pages 上線與煙霧測試
- 從 `docs/` 啟用 Pages。
- 手動跑一遍：六隊各選人、送出、看統計、撤回、複製文字、存圖；也要在手機寬度確認畫面。

### P0-8 免費額度防護（已完成）
- 統計分頁輪詢只在分頁可見時執行，間隔從 60 秒改為 120 秒。
- 評估把 `/stats` 的邊緣快取從 20 秒拉長到 60 秒。自己剛送出時仍以 `fresh=1` 跳過快取。

### P0-9 球隊主題配色（已完成）
- 現況：`applyTheme()` 只覆蓋 `--band/--acc/--on-acc/--acc-ink/--hi` 這 5 個變數；其餘顏色（標題字、頁首副標、淡底、卡片底、深色模式底色等）都寫死成悍將海軍藍，所以其他隊的頁面會帶著藍色調。
- 整頁依球隊配色：所有顏色變數改在 `docs/theme.js` 以 JS 純函式 `deriveTheme()` 從各隊的 `band` 與 `acc` 推導。淺色模式與白混合，深色模式與黑混合，每隊的深色模式也帶自己的色調。`applyTheme()` 輸出推導後的完整變數；`style.css` 的 `:root` 預設值等於 `deriveTheme(NEUTRAL)`。
- 顏色來源：沿用現有 `TEAMS` 的主色；對照官方主色與輔色的修正列為 P2-6。
- 共通頁面（選隊首頁、跨隊頁）：`NEUTRAL` 改為近黑 `#111214`，強調色用灰階，呈現純黑白單色，顏色只出現在球隊卡上。
- 可讀性：新增對比檢查腳本，計算六隊加共通頁面、淺色與深色模式下主要文字與背景的 WCAG 對比，都要達到 4.5:1，不達標就調整該隊的 `ink` 或 `hi`。
- 修正 `style.css` 中自我參照的無效宣告 `--hi:var(--hi)`。

### P0-10 球員本季成績（由 P2-3 提前）（已完成）
- 資料來源：`POST /team/teamscoreaction`，表單欄位為 `__RequestVerificationToken`（取自 `GET /team/teamscore?ClubNo=X` 的 MainForm）、`ClubNo`、`KindCode`（A 一軍例行賽、D 二軍例行賽）、`Year`、`Position`（01 打擊、02 投球）、`DefendStation`、`Sortby`、`IndexOfPages=1`、`ExecAction`。
  - 回傳 HTML 表格，球員欄是 `<td class="sticky player"><a href="/team/person?acnt=<ID>">`（小寫 acnt）。
  - 每隊 4 次請求。fixture：`scraper/tests/fixtures/teamscore_AEO*.html`。
- 新增 `scraper/parse_stats.py`，build 依球員 ID 對應，季度常數 `SEASON = 2026`。
- `teams.json` 每位球員加上選填欄位 `s`，只放有出賽的層級：
  - 打者：`{"A":{"g","pa","avg","ops","hr"},"D":{...}}`
  - 投手：`{"A":{"g","ip","era","whip","so"},"D":{...}}`
  - 守位為投手的取投球成績，其餘取打擊成績。
- 前端卡片多一行，顯示出賽較多的層級：打者 `一軍 .282 · OPS .771`，投手 `一軍 ERA 1.71 · 36.1 局`，沒出賽顯示 `本季未出賽`。`title` 顯示一二軍完整數據。統計頁排行不顯示成績。
- 抓取或解析成績失敗時不中斷名單產出：該隊 `stats` 為 `false`、球員沒有 `s`，前端整隊不顯示成績行與成績提示；成功時 `stats` 為 `true`。
- 已知限制：季中轉隊的球員只會顯示在現隊累積的成績（團隊成績頁只列該隊出賽紀錄）。

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

### P2-3 球員本季成績（已提前為 P0-10，以下為當初的探測紀錄）
- 爬取本季一二軍成績，可以參考 BE 的 `parsers/season_stats.py`。打者顯示打擊率與 OPS，投手顯示 ERA 與投球局數。
- 以精簡欄位存進 teams.json，例如 `s`，並注意檔案大小。
- 資料來源（2026-11-15 探測）：個人頁的成績表是由 AJAX 載入的。
  - 打者 `POST /team/getbattingscore`、投手 `POST /team/getpitchscore`，參數 `acnt` 加上 `kindCode`（A 一軍、D 二軍），header 帶個人頁內的 `RequestVerificationToken`，回傳 JSON（`BattingScore` 或 `PitchScore` 字串）。
  - 逐人抓約多 700～900 次請求，爬一次多約 20 分鐘。
- 先探測較省的路徑：`/team/teamscore?ClubNo=X` 能否一次取得整隊球員的成績（BE 已用 Playwright 抓這頁）。要確認是否含二軍、是否需要 JS。

### P2-4 跨隊「釋出市場」頁
- 新增 `#market` 頁：列出六隊中最常被球迷放在 60 人外的球員，可以依守位篩選。對應推文「爪會簽嗎？」這類討論。
- Worker 新增 `GET /stats/all`，一次讀六列 tally，同樣有邊緣快取，避免前端打六次 API。
- 每隊至少要有 10 份名單才列入。

### P2-5 E2E 測試
- 用 Playwright 測關鍵流程：選隊、選人、送出、看統計。Worker 改用本機 `wrangler dev`。

### P2-6 球隊官方用色
- 對照各隊官網與球衣，為每隊整理官方主色與輔色，修正 `TEAMS` 的基準色。先做成預覽頁給使用者確認，再定案。

---

## P3：觀察後視需要

### P3-1 灌票觀察
- 定期查 D1，看每日新增份數和單一 IP 雜湊的分布。如果異常，再考慮加 Cloudflare Turnstile。

### P3-2 CORS 限定網域
- `Access-Control-Allow-Origin` 從 `*` 改成只允許 Pages 網域。

### P3-3 資料更新自動化
- 用 GitHub Actions 手動觸發 scraper，自動跑 check 再開 PR。只在名單需要頻繁更新時才做。

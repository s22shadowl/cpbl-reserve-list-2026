# CLAUDE.md

中職六隊 60 人契約保留名單模擬器。專案說明見 `README.md`，開發規劃與待辦（含已知 bug）見 `roadmap.md`。

## 部署

- 前端：GitHub Pages，`main` 分支的 `docs/` → https://s22shadowl.github.io/cpbl-reserve-list-2026/
- 後端：Cloudflare Worker `cpbl-reserve-2026-api` → https://cpbl-reserve-2026-api.cpbl-status.workers.dev ，D1 `cpbl-reserve-2026`，secret `IP_SALT` 已設定。
- 前端在 localhost / 127.0.0.1 開啟時自動改連本機 Worker（`http://localhost:8787`）。

## 更新球員資料

1. `poetry run python -m scraper.build`（可加 `--team XXX`、`--refresh`）
2. `poetry run python -m scraper.check`，有錯誤就不 commit
3. `roster.json` 有變動時重新部署 Worker：`cd worker && npm run deploy`

### 可選與排除規則

- 洋將 = 國籍非「中華民國」**且沒有選秀順位**。選秀入團的外籍球員（如永田颯太郎）算本土，必須可選。
- 名字前綴 `◎` = 自主／自行培訓，排除。`#` 註銷註冊、`*` 合約所屬仍是合約球員，可選。
- 引退、任意引退：在 `scraper/overrides.json` 的 `exclude` 手動排除（reason `removed`）。
- 國內 FA：在 `exclude` 排除（reason `fa`），頁首列為不需列入；近年國內 FA 都不在 60 人名單內。
- 旅外 FA：**不排除**，在 `tags` 加 `旅外FA` 標籤。聯盟表示旅外 FA 應列入名單，否則他隊可接觸（2023 年曾峻岳旅外失利即被列入）。
- 每筆 override 都要經使用者確認，並在 `note` 附上新聞來源。2026 年沒有擴編選秀。

## 環境注意事項

- 這台機器的 rtk hook 會改寫 `npx wrangler ...`（曾被改成 `npm run dev` 而失敗）：一律用 `worker/` 的 npm scripts（`dev`、`db:init`、`db:reset`、`deploy`）或 `./node_modules/.bin/wrangler`。
- 本機假球迷名單：`cd worker && npm run db:seed`（需先 `db:init`），每隊寫入 50 份刻意偏向的名單到**本機** D1 並清空 tally，用來看對答案、共識與爆冷（P1-3）；可重複執行。官方名單開發檔由 `poetry run python -m scraper.official --sample` 產生。
- 換了 D1 後本機資料庫是空的，`npm run dev` 前先 `npm run db:init`。
- Cloudflare 會對 Python 預設 User-Agent 回 403；用 curl 加瀏覽器 UA 驗證 API。
- 測試：`poetry run pytest`（scraper）、`node --test scripts/*.test.mjs`（前端；Node 24 不接受只給目錄）、`cd worker && npm test`（Worker，vitest + workerd）。

## 中職官網爬取（www.cpbl.com.tw）

- 只用 `requests.Session` 即可：HiNet CDN 首次回 308 並發 `__chtcdn` cookie，Session 保存 cookie 後正常。不需要 Playwright。
- 一軍名單 `GET /team?ClubNo=X`；二軍名單 `POST /team`，表單帶頁面上的 `__RequestVerificationToken`、`ClubNo`、`KindCode=D`。
- 個人頁 `GET /team/person?Acnt=<10 碼>`：生日、國籍、選秀順位（格式有「2019年第一輪」與「2026第十輪」兩種）。
- 團隊成績 `POST /team/teamscoreaction`（token 取自 `/team/teamscore?ClubNo=X`），`KindCode` A/D × `Position` 01 打擊/02 投球，每隊 4 次請求；成績表連結用小寫 `acnt=`。

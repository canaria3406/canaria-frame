# かなりあのピクセル

楽しいも大切も大好きも  
そこにある一瞬を永遠にしよう  

## 本機開發

使用 Node.js 22 以上版本與 npm。  
在專案根目錄執行以下指令。首次在新裝置設定時，若 `pic/` 尚無原圖，請先按下文設定 Cloudflare 並執行 `npm run photos:sync`。

```powershell
npm ci
npm test
npm run build
```

`npm ci` 在首次安裝或依賴更新時執行。`npm run build` 使用本機 `pic/` 並輸出至 `dist/`，可離線執行。若有已列入 `annotations.json` 的原圖缺少或版本不同，建置會報錯並保留註記。新增照片可在本機預覽，透過同步指令將它寫入註記和 R2。

## 本機預覽

```powershell
npm run dev
```

`npm run dev` 會先建置，再從 `dist/` 提供本機預覽。「下載原圖」會讀取本機 `pic/`。修改照片或程式後，可另開終端機執行 `npm run build`，再重新載入網頁。[本機預覽](http://127.0.0.1:3406/)

圖庫在 680px 以下顯示一欄，大於 680px 且低於 980px 顯示兩欄，980px 以上最多三欄。

## 同步原圖與補地點

在新增照片的裝置，先更新 Git，再把原圖放進 `pic/`。支援 JPEG、PNG、WebP、AVIF 與 TIFF。執行 `npm run photos:sync` 後補上照片地點，再把 `annotations.json` 提交到 Git。其他裝置先 `git pull`，再執行 `npm run photos:sync` 和 `npm run build`。

| `annotations.json` | 本機 `pic/` | 同步結果 |
| --- | --- | --- |
| 有註記與 SHA-256 | 檔案相符 | 跳過上傳和下載 |
| 有註記 | 缺檔 | 從 R2 下載。失敗就報錯，保留註記 |
| 尚無註記 | 有檔案 | 上傳原圖，驗證成功後新增註記並填入未知地點 |
| 有註記但尚無 SHA-256 | 有檔案 | 首次遷移時上傳一次，將 SHA-256 寫入同一筆註記 |
| 有註記與 SHA-256 | 檔案版本不同 | 停止同步並保留本機檔案。若是要另外收錄的新照片，請改名。若是舊版本或已刪除的照片，請刪除或移出 `pic/`。重跑同步會還原註記中的有效照片 |

照片路徑只差大小寫或 Unicode 正規化形式時，請先統一名稱。使用相對於 `pic/` 的路徑，子資料夾以 `/` 分隔。`originalSha256` 由同步指令寫入，對應 R2 的 `originals/<SHA-256>`，相同內容可共用物件。第一次遷移若本機缺少原圖，腳本會嘗試 R2 中以相對路徑命名的舊物件，成功後再登錄 SHA-256。舊物件保留給尚未取得新版註記的裝置，待所有裝置更新且確認雜湊物件可還原後，可手動清理。日後要替換同名原圖，先保留備份，再換掉本機檔案並移除該筆 `originalSha256`，然後重新同步。

`prefectureID` 是都道府縣分組鍵，`prefecture`、`city` 和 `location` 可使用三語物件或共用文字。同一都道府縣請沿用相同的 `prefectureID`。若有英文都道府縣名稱，同步會用它補上分組鍵，例如 `ishikawa`。地點未確認時填入 `unknown`，空白地名補成繁中「未知」、日文「不明」和英文「Unknown」。

以下以 `DSCF0506.jpg` 示範可手動編輯的地點欄位。`originalSha256` 由同步指令填寫。

```json
{
  "DSCF0506.jpg": {
    "prefectureID": "ishikawa",
    "prefecture": { "zh-Hant": "石川縣", "ja": "石川県", "en": "Ishikawa" },
    "city": { "zh-Hant": "白山市", "ja": "白山市", "en": "Hakusan" },
    "location": { "zh-Hant": "德光海岸", "ja": "徳光海岸", "en": "Tokumitsu Beach" }
  }
}
```

拍攝日期由 EXIF 讀取，依日本當地時間分組。沒有可用日期的照片會放在「日期未知」。燈箱的「照片資訊」會顯示原圖 EXIF 中的拍攝時間、相機、鏡頭、快門、光圈、ISO 與焦距，缺少的欄位值以 `-` 顯示。

社群分享圖固定使用 `assets/share.jpg`。更換時請更新此檔案，再執行 `npm run build`。若圖片尺寸改變，請同步更新 `src/index.template.html`。

## 刪除照片

```powershell
git pull
npm run photos:remove -- "trip/照片.jpg"
```

用 `pic/` 下的相對路徑指定要刪除的照片。指令會先在 `annotations.json` 將該筆設為 `deleted: true`，再刪除本機原圖和 R2 物件，並重建 `dist/` 移除展示用 WebP 和下載連結。其他原圖的上傳和下載由 `npm run photos:sync` 處理。若其他有效照片共用同一個 SHA-256，記錄 `r2Deletion: "shared"`，等最後一個有效引用移除時才刪除 R2 物件。完成雲端清理會記錄 `r2Deletion: "complete"`。失敗的刪除可重跑同一條刪除指令，或在下次 `npm run photos:sync` 重試。

將更新後的 `annotations.json` 提交並推送到 Git。其他裝置 `git pull` 後執行 `npm run photos:sync`，會核對 SHA-256 後刪除同路徑的本機原圖；缺少雜湊或內容不符時會保留檔案並報錯。若是當初要刪除的照片，請刪除或移出 `pic/` 後再同步。若是要收錄的同名新照片，請改名後再同步。同步成功後會更新仍含該照片的 `dist/`。保留刪除標記，避免舊裝置重新上傳。若同一檔名要重新使用，請先準備新的本機檔案，再清除該筆的 `deleted`、`r2Deletion` 與 `originalSha256`，執行同步重新上傳。

執行 `npm run deploy` 更新正式站，該次部署的舊下載路徑會回傳 404。先前的 Pages 部署可能仍提供其靜態展示圖。Git 歷史和先前已下載的副本需另外處理。

## 設定 Cloudflare

1. 在 Cloudflare 開通 R2，建立名為 `canaria-frame-originals` 的私有 **Standard** bucket，維持公開 URL 關閉。Workers 使用 Free 方案。[R2 設定](https://developers.cloudflare.com/r2/get-started/)
2. 在每台開發裝置執行 `npm ci`。推薦使用下列的自訂 API Token，將授權範圍限制在這個 Cloudflare 帳戶與專案所需的功能。
3. 首次建立 Pages 專案時，使用 `npx wrangler pages project create canaria-frame --production-branch main --env-file .env`。在 Pages 的 **Settings → Bindings** 將 `ORIGINALS` 設為該 R2 bucket，Production 與 Preview 各設一次。**Settings → Runtime → Fail open / closed** 選 **Fail open**，以便每日 Functions 額度用完時仍可瀏覽靜態圖庫。[Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) · [R2 binding](https://developers.cloudflare.com/pages/functions/bindings/#r2-buckets) · [Functions 路由](https://developers.cloudflare.com/pages/functions/routing/)

### Wrangler 權限

在 Cloudflare 的 **Account API Tokens → Create Token → Custom Token** 建立專用 Token，帳戶資源只選 `canaria-frame` 所在的帳戶，加入以下三項帳戶權限。[建立 API Token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)

| 權限 | 用途 |
| --- | --- |
| Cloudflare Pages → Edit（Pages Write） | 用 Wrangler 發布及管理 Pages 專案 |
| Workers R2 Storage → Edit（Workers R2 Storage Write） | 上傳、下載和刪除 R2 原圖 |
| Account Analytics → Read | 讓 `wrangler r2 bucket info` 取得用量，供上傳前的容量檢查使用 |

將 `.env.example` 複製為 `.env`，填入 `CLOUDFLARE_ACCOUNT_ID` 和 `CLOUDFLARE_API_TOKEN`。專案的 npm 指令會載入 `.env`，此檔已被 Git 忽略。用 `npx wrangler r2 bucket info canaria-frame-originals --env-file .env` 和 `npx wrangler pages project list --env-file .env` 檢查帳戶及資源可讀取。DNS 在後台手動管理，Token 不需要 DNS 寫入權限。[Pages Token 權限](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/#generate-an-api-token) · [R2 REST 權限](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/objects/methods/delete/) · [Analytics 權限](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/)

如果已使用預設的 `npx wrangler login` 授權，想移除舊的 OAuth 登入，可在未載入 API Token 的環境執行 `npx wrangler logout`。這會影響同台裝置使用同一個預設 OAuth 登入的其他專案。[Wrangler 登入與登出指令](https://developers.cloudflare.com/workers/wrangler/commands/general/)

以上 Token 限定一個帳戶。若要把 R2 再限縮到單一 bucket，需要改用該 bucket 的 **Object Read & Write** S3 憑證，並將 Pages 發布憑證獨立。現有同步腳本使用 Wrangler 的 R2 REST 指令。[R2 憑證與資源範圍](https://developers.cloudflare.com/r2/api/tokens/)

## 發布到 Cloudflare Pages

```powershell
npm test
npm run deploy -- migration-preview
npm run deploy
```

前一個部署命令發布到 `migration-preview` 測試環境，後一個發布到 `main` 正式環境。兩者都會先同步原圖，再建置和部署，並在同步或建置出錯時停止。完成後提交 `annotations.json`，其他裝置才能取得同一版本的原圖。展示用 WebP 最長邊為 2400 像素且移除原始 EXIF。「下載原圖」透過 `/originals/*` 從私有 R2 讀取完整檔案，保留檔名與 EXIF。

切換網域前，先在 Pages 的 **Custom domains** 加入 `frame.canaria.cc`，依指示將 `frame` 的 CNAME 改到專案的 `pages.dev` 網址。確認正式站 HTTPS、展示圖與原圖下載後，再停用 GitHub Pages。本機原圖放在 Git 忽略的 `pic/`；新裝置可用 `npm run photos:sync` 從 R2 還原。Cloudflare Pages 的部署目錄為 `dist/`。[Pages 自訂網域](https://developers.cloudflare.com/pages/configuration/custom-domains/)

原圖上傳前會以 Cloudflare 的 bucket 用量加上本次新增檔案的大小做檢查，預設門檻是 8 GB。若同一帳戶有其他 R2 bucket，可在 `.env` 降低 `FRAME_R2_MAX_BYTES`。Cloudflare 回報的容量是估計值，帳戶的所有用量仍需一起核對。只有原圖下載走 Pages Function，燈箱會先以 HEAD 確認原圖可用，再由瀏覽器下載檔案，每個請求至多讀取 R2 一次。展示用檔案由 Pages 免費提供。[R2 計價](https://developers.cloudflare.com/r2/pricing/) · [Pages Functions 計價](https://developers.cloudflare.com/pages/functions/pricing/)

## 專案結構

| 路徑 | 用途 |
| --- | --- |
| `src/index.template.html` | 用於產生靜態首頁的模板 |
| `src/main.css`、`src/main.js` | 網站樣式、圖庫互動與三語文字 |
| `annotations.json` | 相片路徑、原圖 SHA-256、都道府縣 ID、都道府縣、城市與地點 |
| `assets/` | 頭像、favicon、Apple Touch Icon 和社群分享圖 |
| `pic/` | 建置用原圖 |
| `scripts/build-photos.js` | 讀取照片註記、擷取 EXIF 並輸出 WebP |
| `scripts/sync-photos.js`、`scripts/cloudflare.js` | 原圖同步、R2 與 Pages 發布 |
| `functions/originals/[[photo]].js` | Pages 的原圖下載路由 |
| `scripts/original-files.js`、`src/originals.js` | 本機原圖讀取與雜湊、共用原圖路徑與格式規則 |
| `scripts/build-photos.test.js` | 照片轉檔、EXIF 和地點顯示測試 |
| `scripts/sync-photos.test.js` | 原圖同步、刪除與下載路由測試 |
| `scripts/build.js`、`scripts/dev.js` | 正式建置與本機預覽 |
| `dist/` | 本機生成的 Cloudflare Pages 發布檔案 |


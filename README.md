# 興嘉課堂搶答器｜GitHub Pages＋Google Apps Script 版

## 1. 建立 Google 試算表

1. 建立新的 Google 試算表，建議命名為「興嘉課堂搶答器資料庫」。
2. 開啟「擴充功能 → Apps Script」。
3. 將 Code.gs 的內容完整貼入並儲存。
4. 選取並執行 setupSheets 函式一次，依畫面完成授權。
5. 系統會建立 Rooms、Participants、Buzzes、Questions 四個工作表。

## 設定全校共用教師密碼

1. 在 Apps Script 左側選擇「專案設定」。
2. 向下找到「指令碼屬性（Script Properties）」。
3. 點選「新增指令碼屬性」。
4. 屬性名稱輸入：TEACHER_PASSWORD
5. 值輸入學校要使用的共用教師密碼。
6. 按下「儲存指令碼屬性」。

教師密碼只會保存在 Apps Script，不會寫入 index.html 或 GitHub。

## 2. 部署 Apps Script

1. 點選「部署 → 新增部署作業」。
2. 類型選擇「網頁應用程式」。
3. 執行身分選擇「我」。
4. 存取權選擇「任何人」。
5. 按下部署，複製最後以 /exec 結尾的網址。

每次修改 Code.gs 後，請到「管理部署作業」編輯部署，並建立新版本。

## 3. 設定 index.html

用文字編輯器開啟 index.html，找到：

    const DEFAULT_GAS_URL='PASTE_GAS_WEB_APP_URL_HERE';

本程式包已設定以下 Apps Script 正式部署網址：

    https://script.google.com/macros/s/AKfycbw9mp8qRLQKxl19LC-a8pmoE9aUEjjm7OLulqQm1-LO6zlf5KJlgZbaQa1V-Sb-mNMn/exec

若尚未修改，網站第一次開啟也會顯示設定視窗；正式給學生使用前，建議直接寫入 index.html。

## 4. 發布 GitHub Pages

1. 在 GitHub 建立公開儲存庫，例如 xingjia-quiz-buzz。
2. 將 index.html 與 admin.js 一起上傳至儲存庫根目錄。
3. 開啟 Settings → Pages。
4. Source 選擇 Deploy from a branch。
5. Branch 選擇 main，資料夾選擇 /(root)，按 Save。
6. 等待約 1–3 分鐘取得公開網址。

## 功能

- 教師建立六位數房間
- 教師以全校共用密碼登入
- 題庫新增、編輯、刪除、搜尋及啟用／停用
- 支援單選題、是非題、簡答題
- 學生輸入班級、姓名加入
- QR Code 加入
- 每回合首位搶答鎖定
- 教師加減分、移除學生及結束活動
- 即時排行榜
- 匯出 CSV 成績
- 房間、學生、分數及搶答紀錄寫入 Google 試算表

## 注意事項

- 教師應使用建立房間時的原裝置與瀏覽器，以保留教師控制權。
- Apps Script 免費服務有執行配額，適合一般班級教學。
- 請勿在 index.html 放入帳號密碼或 API 金鑰。

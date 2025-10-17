LearningQuest: 可模組化英語學習平台
LearningQuest 是一個可模組化的英語學習網站原型，採用 React + TypeScript + Vite + Tailwind CSS 打造。專案以「資料驅動」為核心，教材內容可輕易擴充。

最新版本整合了 Supabase 作為後端，實現了使用者身份驗證與雲端進度儲存，讓學習紀錄不再僅限於單一裝置。

核心技術
前端: React, TypeScript, Vite, Tailwind CSS v4

後端與資料庫: Supabase (PostgreSQL)

核心功能: 互動式單字、文法、課文練習，搭配小遊戲（貪吃蛇、俄羅斯方塊）、徽章系統與雲端進度同步。
系統架構
執行流程
使用者登入:

新使用者透過 AuthGate 元件輸入 Email 進行無密碼（魔法連結）登入。

首次登入成功後，使用者會被導向 ProfileSetup 頁面，必須設定「名字」、「學校」和「年級」。

已設定過資料的使用者登入後會直接進入主應用程式。

資料載入:

AuthProvider (AuthContext.tsx) 負責管理使用者登入狀態，並在登入後從 Supabase 的 profiles 資料表中讀取該使用者的個人資料與學習進度 (progress)。

主應用:

App.tsx 渲染主介面，包含「學習區」、「挑戰區」、「獎章區」等頁籤。

所有學習活動（如完成測驗、玩遊戲）的進度更新，都會透過 useProgress Hook 將資料即時同步回 Supabase。
檔案結構 (重點)
src/
├─ components/
│  ├─ AuthGate.tsx             # (已移至 App.tsx) 登入畫面
│  ├─ ProfileSetup.tsx         # 首次登入的個人資料設定頁面
│  ├─ SnakeChallenge.tsx       # 貪吃蛇遊戲 (成績會同步至後端)
│  ├─ ReorderSentenceGame.tsx  # 俄羅斯方塊文法遊戲
│  └─ ... (其他遊戲與 UI 元件)
│
├─ data/
│  └─ units.ts                 # 核心教材資料 (單字、文法、課文)
│
├─ lib/
│  └─ questionGen.ts           # 題目自動生成器
│
├─ state/
│  ├─ AuthContext.tsx          # 管理使用者登入狀態與個人資料
│  └─ progress.ts              # 核心狀態管理 Hook (useProgress)，與 Supabase 同步
│
├─ supabaseClient.ts           # Supabase 連線設定
├─ types.ts                    # 全域 TypeScript 型別定義
├─ App.tsx                     # 主應用程式：路由、頁面切換與狀態整合
└─ main.tsx                    # 應用程式入口，掛載 AuthProvider
後端設定 (Supabase)
本專案使用 Supabase 處理使用者認證與資料儲存。若要自行架設，請完成以下步驟：

1. 建立 Supabase 專案
前往 Supabase 建立一個新專案。

2. 設定環境變數
在專案根目錄建立一個 .env.local 檔案，並填入您 Supabase 專案的 URL 和 anon 金鑰：

VITE_SUPABASE_URL="您的 Supabase Project URL"
VITE_SUPABASE_ANON_KEY="您的 Supabase anon public 金鑰"
3. 執行 SQL 建立資料表
登入您的 Supabase 專案，前往 "SQL Editor"，並執行以下指令碼以建立 profiles 資料表、設定安全策略及使用者註冊觸發器。

SQL

-- 1. Profiles Table: 儲存使用者個人資料與學習進度
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY,
  updated_at TIMESTAMPTZ,
  full_name TEXT,
  school TEXT,
  grade TEXT,
  progress JSONB, -- 使用 JSONB 格式儲存整個進度物件

  CONSTRAINT profiles_id_fkey FOREIGN KEY (id)
    REFERENCES auth.users (id) ON DELETE CASCADE
);

-- 2. 設定資料列級安全性 (RLS)，確保使用者只能存取自己的資料
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile."
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can create their own profile."
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile."
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 3. 建立觸發器，在新使用者註冊時自動建立 profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
核心功能
1. 使用者系統
無密碼登入: 透過 Email 魔法連結進行安全驗證。

個人資料設定: 新使用者首次登入需設定姓名、學校、年級。

雲端進度同步: 所有學習進度（XP、星等、徽章、遊戲分數）都會自動儲存到使用者的雲端帳戶。

2. 學習區
單字: 包含單字卡瀏覽、發音、語音跟讀練習 (VocabSet) 及貪吃蛇遊戲 (SnakeChallenge)。

文法: 提供文法重點說明 (GrammarExplain) 與結合遊戲機制的「俄羅斯方塊」句子重組練習 (ReorderSentenceGame)。

課文: 支援中英雙語對照閱讀 (StoryViewer) 與句子排列遊戲 (ArrangeSentencesGame)。

3. 挑戰區
可設定多個關卡，每個關卡包含 10 道題目。

關卡解鎖機制: 需在前一關卡獲得至少 2 星才能解鎖下一關。

成績與星等: 根據答對題數計算星等（例如 10/7/4 題對應 3/2/1 星）。

4. 遊戲機制更新 (2025/10/16)
貪吃蛇 (SnakeChallenge)

移除倒數計時，改為記錄總遊玩秒數。

結束條件：撞牆、撞到自己、或完成所有題目。

每輪最多 78 題，正解不重複。

遊戲結束時會上報詳細數據，並觸發全域事件 learning-quest:snake-report。

俄羅斯方塊 (ReorderSentenceGame)

題庫範圍擴大至所有文法例句。

回合結束時觸發全域事件 learning-quest:grammar-tetris-report。

完成超過 80 回合可解鎖 SUPER_GRAMMAR_EXPERT 徽章。

安裝與開發
環境需求
Node.js 20.19+

開發命令
Bash

# 安裝依賴
npm install

# 啟動開發伺服器 (http://localhost:5173/)
npm run dev

# 建置專案
npm run build

# 預覽建置後的專案
npm run preview
未來方向
建立排行榜: 實作排行榜頁面，顯示各遊戲（貪吃蛇、俄羅斯方塊）的最高分排名。

新增登出功能: 在介面中提供一個登出按鈕。

學習分析: 記錄錯題類型、作答時間，生成個人化的複習建議。

更多小遊戲: 擴充更多樣的遊戲化練習模式。
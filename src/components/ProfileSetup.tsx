// src/components/ProfileSetup.tsx
import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../state/AuthContext';

export default function ProfileSetup() {
  const { user } = useAuth(); // 從 Context 取得當前使用者
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState('');
  const [school, setSchool] = useState('');
  const [grade, setGrade] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          school: school,
          grade: grade,
        })
        .eq('id', user.id);

      if (error) throw error;

      // 更新成功後，重新載入頁面，AuthProvider 會抓到最新的 profile
      window.location.reload(); 

    } catch (error: any) {
      alert(error.error_description || error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-2xl shadow-lg border">
        <div>
          <h1 className="text-2xl font-bold">建立您的個人資料</h1>
          <p className="text-sm text-neutral-500 mt-1">
            請完成設定，這些資訊將會顯示在排行榜上。
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-neutral-700">名字</label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="例如：王小明"
              className="mt-1 w-full px-4 py-2 border rounded-xl"
            />
          </div>
          <div>
            <label htmlFor="school" className="block text-sm font-medium text-neutral-700">學校</label>
            <input
              id="school"
              type="text"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              required
              placeholder="例如：學習國中"
              className="mt-1 w-full px-4 py-2 border rounded-xl"
            />
          </div>
          <div>
            <label htmlFor="grade" className="block text-sm font-medium text-neutral-700">年級</label>
            <input
              id="grade"
              type="text"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              required
              placeholder="例如：七年級"
              className="mt-1 w-full px-4 py-2 border rounded-xl"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 text-white bg-neutral-900 rounded-xl disabled:opacity-50"
          >
            {loading ? '儲存中...' : '完成並開始學習'}
          </button>
        </form>
      </div>
    </div>
  );
}
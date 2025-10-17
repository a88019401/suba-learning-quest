// src/components/Leaderboard.tsx
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Card, SectionTitle } from './ui';

type LeaderboardEntry = {
  id: number;
  full_name: string;
  score: number;
};

export default function Leaderboard() {
  const [snakeScores, setSnakeScores] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchScores = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('leaderboard')
          .select('id, full_name, score')
          .eq('game', 'snake') // 只選取貪吃蛇遊戲
          .order('score', { ascending: false }) // 分數由高到低排序
          .limit(10); // 只顯示前 10 名

        if (error) throw error;
        setSnakeScores(data || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchScores();
  }, []);

  const getRankIcon = (index: number) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return index + 1;
  };

  return (
    <Card>
      <SectionTitle title="🏆 貪吃蛇排行榜 (Top 10)" desc="挑戰最高分，成為單字之王！" />
      {loading && <p>讀取中...</p>}
      {error && <p className="text-red-500">無法載入排行榜：{error}</p>}
      {!loading && !error && (
        <ol className="space-y-2">
          {snakeScores.map((entry, index) => (
            <li key={entry.id} className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 border">
              <div className="flex items-center gap-4">
                <span className="text-lg font-bold w-8 text-center">
                  {getRankIcon(index)}
                </span>
                <span className="font-medium">{entry.full_name}</span>
              </div>
              <span className="font-bold text-lg">{entry.score} 分</span>
            </li>
          ))}
          {snakeScores.length === 0 && <p className="text-neutral-500">目前還沒有人上榜，快來搶頭香！</p>}
        </ol>
      )}
    </Card>
  );
}
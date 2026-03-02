import { db } from "@/lib/db";

interface StreakResult {
  current: number;
  longest: number;
  todayComplete: boolean;
  last7Days: boolean[]; // [today, yesterday, ..., 6 days ago]
}

/**
 * Calculate a student's practice streak from their ProblemResponse dates.
 * No new DB table needed — derived from existing responses.
 */
export async function getStreak(studentId: string): Promise<StreakResult> {
  // Get distinct dates when the student answered problems
  const responses = await db.problemResponse.findMany({
    where: { studentId },
    select: { createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  if (responses.length === 0) {
    return {
      current: 0,
      longest: 0,
      todayComplete: false,
      last7Days: [false, false, false, false, false, false, false],
    };
  }

  // Extract unique dates (in local timezone, normalized to date strings)
  const uniqueDates = [
    ...new Set(
      responses.map((r) => {
        const d = new Date(r.createdAt);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      })
    ),
  ].sort((a, b) => b.localeCompare(a)); // Most recent first

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const todayComplete = uniqueDates[0] === todayStr;

  // Walk backward from today (or yesterday if no activity today) to count streak
  let current = 0;
  const startDate = new Date(today);
  // If no activity today, start checking from yesterday
  if (!todayComplete) {
    startDate.setDate(startDate.getDate() - 1);
  }

  const dateSet = new Set(uniqueDates);
  const checkDate = new Date(startDate);

  for (let i = 0; i < 365; i++) {
    const checkStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, "0")}-${String(checkDate.getDate()).padStart(2, "0")}`;
    if (dateSet.has(checkStr)) {
      current++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  // If today is complete, include it in the streak
  if (todayComplete) {
    // current already includes today from the loop above
  }

  // Calculate longest streak from all dates
  let longest = 0;
  let streak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = new Date(uniqueDates[i - 1]);
    const curr = new Date(uniqueDates[i]);
    const diffDays = Math.round(
      (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays === 1) {
      streak++;
    } else {
      longest = Math.max(longest, streak);
      streak = 1;
    }
  }
  longest = Math.max(longest, streak, current);

  // Last 7 days activity
  const last7Days: boolean[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    last7Days.push(dateSet.has(dStr));
  }

  return { current, longest, todayComplete, last7Days };
}

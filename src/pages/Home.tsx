import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import { userProgramsApi } from '../lib/api';
import type { UserProgram } from '../types';

interface UserProgramWithDetails extends UserProgram {
  program_name?: string;
  frequency_per_week?: number;
}

export function Home() {
  const { userName, user } = useAuthContext();
  const location = useLocation();
  const [activeProgram, setActiveProgram] = useState<UserProgramWithDetails | null>(null);
  const [loadingProgram, setLoadingProgram] = useState(true);

  const fetchActiveProgram = useCallback(async () => {
    setLoadingProgram(true);
    const response = await userProgramsApi.list();
    console.log('Home: userProgramsApi.list() response:', response);
    if (response.data) {
      const active = response.data.find((p: UserProgramWithDetails) => p.is_active);
      console.log('Home: active program:', active);
      setActiveProgram(active || null);
    }
    setLoadingProgram(false);
  }, []);

  // Fetch every time the component renders (location.key changes on navigation)
  useEffect(() => {
    console.log('Home: useEffect triggered, location.key:', location.key);
    fetchActiveProgram();
  }, [fetchActiveProgram, location.key]);

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          Welcome{userName ? `, ${userName}` : ''}!
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">
          Ready to crush your workout?
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <Link
          to="/workout"
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg p-6 text-center shadow-sm transition-colors"
        >
          <svg
            className="w-8 h-8 mx-auto mb-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          <span className="font-semibold">Start Workout</span>
        </Link>

        <Link
          to="/progress"
          className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-lg p-6 text-center shadow-sm border border-slate-200 dark:border-slate-700 transition-colors"
        >
          <svg
            className="w-8 h-8 mx-auto mb-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <span className="font-semibold">View Progress</span>
        </Link>
      </div>

      {/* Current Program Card */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
          Current Program
        </h2>
        {loadingProgram ? (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            <p>Loading...</p>
          </div>
        ) : activeProgram ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                  {activeProgram.program_name || 'Program'}
                </h3>
                {activeProgram.frequency_per_week && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {activeProgram.frequency_per_week}x per week
                  </p>
                )}
              </div>
              <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                Active
              </span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Started {new Date(activeProgram.started_at).toLocaleDateString()}
            </p>
            <Link
              to={`/programs/${activeProgram.program_id}`}
              className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
            >
              View program details
            </Link>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            <p>No active program</p>
            <Link
              to="/programs"
              className="text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block"
            >
              Browse programs
            </Link>
          </div>
        )}
      </div>

      {/* Recent Workouts */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Recent Workouts
          </h2>
          <Link
            to="/history"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            View all
          </Link>
        </div>
        <div className="text-center py-8 text-slate-500 dark:text-slate-400">
          <p>No workouts yet</p>
          <p className="text-sm mt-1">Start tracking to see your history</p>
        </div>
      </div>

      {/* Body Weight Quick Log */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
          Body Weight
        </h2>
        <div className="flex items-center gap-4">
          <input
            type="number"
            placeholder="Enter weight"
            className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <span className="text-slate-600 dark:text-slate-400">
            {user?.preferred_unit === 'metric' ? 'kg' : 'lbs'}
          </span>
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
            Log
          </button>
        </div>
      </div>
    </div>
  );
}

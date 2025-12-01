import { useState } from 'react';
import { Link } from 'react-router-dom';

export function Workout() {
  const [hasActiveWorkout] = useState(false);

  if (!hasActiveWorkout) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          Start Workout
        </h1>

        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
            From Program
          </h2>
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            <p>No active program</p>
            <Link
              to="/programs"
              className="text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block"
            >
              Start a program first
            </Link>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
            Quick Workout
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Start an empty workout and add exercises as you go
          </p>
          <button className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
            Start Empty Workout
          </button>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
            Repeat Previous
          </h2>
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            <p>No previous workouts</p>
          </div>
        </div>
      </div>
    );
  }

  // Active workout view will be implemented later
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
        Active Workout
      </h1>
      {/* Active workout content will go here */}
    </div>
  );
}

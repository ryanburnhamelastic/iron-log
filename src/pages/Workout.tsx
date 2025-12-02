import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { userProgramsApi, programsApi } from '../lib/api';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import type { UserProgram, ProgramWithBlocks, WorkoutTemplateWithExercises } from '../types';

interface UserProgramWithDetails extends UserProgram {
  program_name?: string;
  frequency_per_week?: number;
}

export function Workout() {
  const [loading, setLoading] = useState(true);
  const [activeProgram, setActiveProgram] = useState<UserProgramWithDetails | null>(null);
  const [programDetails, setProgramDetails] = useState<ProgramWithBlocks | null>(null);
  const [currentWeekWorkouts, setCurrentWeekWorkouts] = useState<WorkoutTemplateWithExercises[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // Get active program
      const programsResponse = await userProgramsApi.list();
      if (programsResponse.data) {
        const active = programsResponse.data.find((p: UserProgramWithDetails) => p.is_active);
        setActiveProgram(active || null);

        // If active program, get full program details
        if (active) {
          const detailsResponse = await programsApi.get(active.program_id);
          if (detailsResponse.data) {
            setProgramDetails(detailsResponse.data);

            // Find current week's workouts
            if (active.current_week_id && detailsResponse.data.blocks) {
              for (const block of detailsResponse.data.blocks) {
                if (block.weeks) {
                  const currentWeek = block.weeks.find(w => w.id === active.current_week_id);
                  if (currentWeek && currentWeek.workouts) {
                    setCurrentWeekWorkouts(currentWeek.workouts);
                    break;
                  }
                }
              }
            }
          }
        }
      }

      setLoading(false);
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
        Start Workout
      </h1>

      {/* From Program Section */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
          From Program
        </h2>

        {activeProgram && programDetails ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {activeProgram.program_name || programDetails.name}
              </span>
              <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                Active
              </span>
            </div>

            {currentWeekWorkouts.length > 0 ? (
              <div className="space-y-3">
                {currentWeekWorkouts.map((workout) => (
                  <button
                    key={workout.id}
                    className="w-full text-left p-4 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-slate-800 dark:text-slate-100">
                          {workout.name}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {workout.exercises?.length || 0} exercises
                        </p>
                      </div>
                      <svg
                        className="w-5 h-5 text-slate-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 dark:text-slate-400 text-center py-4">
                No workouts found for current week
              </p>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            <p>No active program</p>
            <Link
              to="/programs"
              className="text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block"
            >
              Start a program first
            </Link>
          </div>
        )}
      </div>

      {/* Quick Workout Section */}
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

      {/* Repeat Previous Section */}
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

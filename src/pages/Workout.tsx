import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { userProgramsApi, programsApi, workoutLogsApi } from '../lib/api';
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
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutTemplateWithExercises | null>(null);
  const [startingWorkout, setStartingWorkout] = useState(false);

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

  const handleStartWorkout = async (workout: WorkoutTemplateWithExercises) => {
    if (!activeProgram) return;
    setStartingWorkout(true);

    // Create a workout log
    const response = await workoutLogsApi.create({
      user_program_id: activeProgram.id,
      workout_template_id: workout.id,
      workout_date: new Date().toISOString().split('T')[0],
    });

    if (response.data) {
      setSelectedWorkout(workout);
    }
    setStartingWorkout(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Active workout view
  if (selectedWorkout) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            {selectedWorkout.name}
          </h1>
          <button
            onClick={() => setSelectedWorkout(null)}
            className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          >
            End Workout
          </button>
        </div>

        {/* Exercise List */}
        <div className="space-y-4">
          {selectedWorkout.exercises?.map((templateExercise, index) => (
            <div
              key={templateExercise.id}
              className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                    {index + 1}. {templateExercise.exercise?.name || 'Exercise'}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {templateExercise.working_sets} sets × {templateExercise.rep_range_min}-{templateExercise.rep_range_max} reps
                    {templateExercise.rir !== null && ` @ ${templateExercise.rir} RIR`}
                  </p>
                </div>
              </div>

              {/* Set inputs */}
              <div className="space-y-2">
                {Array.from({ length: templateExercise.working_sets }).map((_, setIndex) => (
                  <div
                    key={setIndex}
                    className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
                  >
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400 w-16">
                      Set {setIndex + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        placeholder="lbs"
                        className="w-20 px-3 py-2 text-center border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                      />
                      <span className="text-slate-400">×</span>
                      <input
                        type="number"
                        placeholder="reps"
                        className="w-20 px-3 py-2 text-center border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <button className="ml-auto px-3 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg">
                      Log
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Finish Workout Button */}
        <button
          onClick={() => setSelectedWorkout(null)}
          className="w-full px-4 py-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors"
        >
          Finish Workout
        </button>
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
                    onClick={() => handleStartWorkout(workout)}
                    disabled={startingWorkout}
                    className="w-full text-left p-4 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
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
                      {startingWorkout ? (
                        <LoadingSpinner size="sm" />
                      ) : (
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
                      )}
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

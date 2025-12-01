import type { ApiResponse } from '../types';

const API_BASE = '/api';

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || 'An error occurred' };
    }

    return { data };
  } catch (error) {
    console.error('API request failed:', error);
    return { error: 'Network error. Please try again.' };
  }
}

// Users API
export const usersApi = {
  get: () => apiRequest<import('../types').User>('/users'),
  create: (userData: { email: string; first_name?: string; last_name?: string }) =>
    apiRequest<import('../types').User>('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    }),
  update: (userData: Partial<import('../types').User>) =>
    apiRequest<import('../types').User>('/users', {
      method: 'PUT',
      body: JSON.stringify(userData),
    }),
};

// Programs API
export const programsApi = {
  list: () => apiRequest<import('../types').Program[]>('/programs'),
  get: (id: string) => apiRequest<import('../types').ProgramWithBlocks>(`/programs/${id}`),
  create: (programData: { name: string; description?: string; frequency_per_week?: number }) =>
    apiRequest<import('../types').Program>('/programs', {
      method: 'POST',
      body: JSON.stringify(programData),
    }),
  import: (formData: FormData) =>
    fetch(`${API_BASE}/programs/import`, {
      method: 'POST',
      body: formData,
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) return { error: data.error };
      return { data };
    }),
};

// Exercises API
export const exercisesApi = {
  list: (category?: string) =>
    apiRequest<import('../types').Exercise[]>(
      `/exercises${category ? `?category=${encodeURIComponent(category)}` : ''}`
    ),
  get: (id: string) => apiRequest<import('../types').Exercise>(`/exercises/${id}`),
  getSubstitutions: (id: string) =>
    apiRequest<import('../types').Exercise[]>(`/exercises/${id}/substitutions`),
};

// User Programs API
export const userProgramsApi = {
  list: () => apiRequest<import('../types').UserProgram[]>('/user-programs'),
  get: (id: string) => apiRequest<import('../types').UserProgram>(`/user-programs/${id}`),
  start: (programId: string) =>
    apiRequest<import('../types').UserProgram>('/user-programs', {
      method: 'POST',
      body: JSON.stringify({ program_id: programId }),
    }),
  update: (id: string, data: Partial<import('../types').UserProgram>) =>
    apiRequest<import('../types').UserProgram>(`/user-programs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// User Schedules API
export const schedulesApi = {
  get: () => apiRequest<import('../types').UserSchedule[]>('/user-schedules'),
  update: (schedules: { day_of_week: number; is_workout_day: boolean }[]) =>
    apiRequest<import('../types').UserSchedule[]>('/user-schedules', {
      method: 'PUT',
      body: JSON.stringify({ schedules }),
    }),
};

// Workout Logs API
export const workoutLogsApi = {
  list: (params?: { limit?: number; offset?: number }) => {
    const query = params
      ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`
      : '';
    return apiRequest<import('../types').WorkoutLogWithExercises[]>(`/workout-logs${query}`);
  },
  get: (id: string) => apiRequest<import('../types').WorkoutLogWithExercises>(`/workout-logs/${id}`),
  create: (data: import('../types').CreateWorkoutLogInput) =>
    apiRequest<import('../types').WorkoutLog>('/workout-logs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<import('../types').WorkoutLog>) =>
    apiRequest<import('../types').WorkoutLog>(`/workout-logs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiRequest<void>(`/workout-logs/${id}`, { method: 'DELETE' }),
};

// Exercise Logs API
export const exerciseLogsApi = {
  create: (data: { workout_log_id: string; exercise_id: string; template_exercise_id?: string; exercise_order: number }) =>
    apiRequest<import('../types').ExerciseLog>('/exercise-logs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Set Logs API
export const setLogsApi = {
  create: (data: import('../types').CreateSetLogInput) =>
    apiRequest<import('../types').SetLog>('/set-logs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<import('../types').SetLog>) =>
    apiRequest<import('../types').SetLog>(`/set-logs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiRequest<void>(`/set-logs/${id}`, { method: 'DELETE' }),
};

// Body Weight API
export const bodyWeightApi = {
  list: (params?: { limit?: number }) => {
    const query = params ? `?limit=${params.limit}` : '';
    return apiRequest<import('../types').BodyWeightLog[]>(`/body-weight${query}`);
  },
  create: (data: import('../types').CreateBodyWeightLogInput) =>
    apiRequest<import('../types').BodyWeightLog>('/body-weight', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<import('../types').BodyWeightLog>) =>
    apiRequest<import('../types').BodyWeightLog>(`/body-weight/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiRequest<void>(`/body-weight/${id}`, { method: 'DELETE' }),
};

// Progress API
export const progressApi = {
  getExerciseProgress: (exerciseId: string, params?: { days?: number }) => {
    const query = params?.days ? `?days=${params.days}` : '';
    return apiRequest<import('../types').ExerciseProgress[]>(`/progress/exercise/${exerciseId}${query}`);
  },
};

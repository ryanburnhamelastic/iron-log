import type { Handler, HandlerEvent } from '@netlify/functions';
import { getDb, initDb, headers } from './db';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    await initDb();
    const sql = getDb();

    const authHeader = event.headers.authorization;
    const clerkUserId = authHeader?.replace('Bearer ', '') || event.headers['x-clerk-user-id'];

    // GET - List programs or get by ID
    if (event.httpMethod === 'GET') {
      const pathParts = event.path.split('/').filter(Boolean);
      const programId = pathParts[pathParts.length - 1];

      // Get single program with full structure
      if (programId && programId !== 'programs') {
        const program = await sql`
          SELECT * FROM programs WHERE id = ${programId}
        `;

        if (program.length === 0) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: 'Program not found' }),
          };
        }

        // Get blocks
        const blocks = await sql`
          SELECT * FROM program_blocks
          WHERE program_id = ${programId}
          ORDER BY sort_order
        `;

        // Get weeks for each block
        const blocksWithWeeks = await Promise.all(
          blocks.map(async (block) => {
            const weeks = await sql`
              SELECT * FROM block_weeks
              WHERE block_id = ${block.id}
              ORDER BY sort_order
            `;

            // Get workout templates for each week
            const weeksWithWorkouts = await Promise.all(
              weeks.map(async (week) => {
                const workouts = await sql`
                  SELECT * FROM workout_templates
                  WHERE week_id = ${week.id}
                  ORDER BY sort_order
                `;

                // Get exercises for each workout
                const workoutsWithExercises = await Promise.all(
                  workouts.map(async (workout) => {
                    const exercises = await sql`
                      SELECT te.*, e.name, e.category, e.equipment, e.description
                      FROM template_exercises te
                      JOIN exercises e ON te.exercise_id = e.id
                      WHERE te.workout_template_id = ${workout.id}
                      ORDER BY te.exercise_order
                    `;

                    return {
                      ...workout,
                      exercises: exercises.map((ex) => ({
                        ...ex,
                        exercise: {
                          id: ex.exercise_id,
                          name: ex.name,
                          category: ex.category,
                          equipment: ex.equipment,
                          description: ex.description,
                        },
                      })),
                    };
                  })
                );

                return { ...week, workouts: workoutsWithExercises };
              })
            );

            return { ...block, weeks: weeksWithWorkouts };
          })
        );

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            ...program[0],
            blocks: blocksWithWeeks,
          }),
        };
      }

      // List all programs
      const result = await sql`
        SELECT * FROM programs ORDER BY created_at DESC
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result),
      };
    }

    // POST - Create program
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { name, description, frequency_per_week, source } = body;

      if (!name) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Name is required' }),
        };
      }

      // Get user ID
      let userId = null;
      if (clerkUserId) {
        const user = await sql`
          SELECT id FROM users WHERE clerk_user_id = ${clerkUserId}
        `;
        if (user.length > 0) {
          userId = user[0].id;
        }
      }

      const result = await sql`
        INSERT INTO programs (name, description, frequency_per_week, source, created_by)
        VALUES (${name}, ${description || null}, ${frequency_per_week || 4}, ${source || null}, ${userId})
        RETURNING *
      `;

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(result[0]),
      };
    }

    // DELETE - Delete program
    if (event.httpMethod === 'DELETE') {
      const pathParts = event.path.split('/').filter(Boolean);
      const programId = pathParts[pathParts.length - 1];

      await sql`DELETE FROM programs WHERE id = ${programId}`;

      return {
        statusCode: 204,
        headers,
        body: '',
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error) {
    console.error('Programs API error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

export { handler };

import type { Handler, HandlerEvent } from '@netlify/functions';
import { getDb, initDb, headers } from './db';
import { authenticateRequest } from './auth';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    await initDb();
    const sql = getDb();

    // Verify Clerk JWT and get user ID
    const authResult = await authenticateRequest(event);

    if (!authResult.authenticated || !authResult.clerkUserId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: authResult.error || 'Unauthorized' }),
      };
    }

    const clerkUserId = authResult.clerkUserId;

    // Get user
    const users = await sql`SELECT id FROM users WHERE clerk_user_id = ${clerkUserId}`;
    if (users.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }
    const userId = users[0].id;

    const pathParts = event.path.split('/').filter(Boolean);
    const workoutLogId = pathParts.length > 1 ? pathParts[pathParts.length - 1] : null;

    // GET - List or get single workout log
    if (event.httpMethod === 'GET') {
      if (workoutLogId && workoutLogId !== 'workout-logs') {
        // Get single workout with exercises and sets
        const workoutLogs = await sql`
          SELECT wl.*, wt.name as workout_name
          FROM workout_logs wl
          LEFT JOIN workout_templates wt ON wl.workout_template_id = wt.id
          WHERE wl.id = ${workoutLogId} AND wl.user_id = ${userId}
        `;

        if (workoutLogs.length === 0) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: 'Workout log not found' }),
          };
        }

        const workoutLog = workoutLogs[0];

        // Get exercise logs with sets
        const exerciseLogs = await sql`
          SELECT el.*, e.name, e.category, e.equipment
          FROM exercise_logs el
          JOIN exercises e ON el.exercise_id = e.id
          WHERE el.workout_log_id = ${workoutLogId}
          ORDER BY el.exercise_order
        `;

        const exercisesWithSets = await Promise.all(
          exerciseLogs.map(async (el) => {
            const sets = await sql`
              SELECT * FROM set_logs
              WHERE exercise_log_id = ${el.id}
              ORDER BY set_number
            `;
            return {
              ...el,
              exercise: {
                id: el.exercise_id,
                name: el.name,
                category: el.category,
                equipment: el.equipment,
              },
              sets,
            };
          })
        );

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            ...workoutLog,
            exercises: exercisesWithSets,
          }),
        };
      }

      // List workout logs
      const limit = parseInt(event.queryStringParameters?.limit || '20');
      const offset = parseInt(event.queryStringParameters?.offset || '0');

      const workoutLogs = await sql`
        SELECT wl.*, wt.name as workout_name
        FROM workout_logs wl
        LEFT JOIN workout_templates wt ON wl.workout_template_id = wt.id
        WHERE wl.user_id = ${userId}
        ORDER BY wl.workout_date DESC, wl.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(workoutLogs),
      };
    }

    // POST - Create workout log
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { user_program_id, workout_template_id, workout_date, notes } = body;

      const [workoutLog] = await sql`
        INSERT INTO workout_logs (user_id, user_program_id, workout_template_id, workout_date, started_at, notes)
        VALUES (${userId}, ${user_program_id || null}, ${workout_template_id || null}, ${workout_date || new Date().toISOString().split('T')[0]}, NOW(), ${notes || null})
        RETURNING *
      `;

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(workoutLog),
      };
    }

    // PUT - Update workout log
    if (event.httpMethod === 'PUT' && workoutLogId) {
      const body = JSON.parse(event.body || '{}');
      const { completed_at, notes } = body;

      const [workoutLog] = await sql`
        UPDATE workout_logs
        SET
          completed_at = COALESCE(${completed_at || null}, completed_at),
          notes = COALESCE(${notes}, notes)
        WHERE id = ${workoutLogId} AND user_id = ${userId}
        RETURNING *
      `;

      if (!workoutLog) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Workout log not found' }),
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(workoutLog),
      };
    }

    // DELETE - Delete workout log
    if (event.httpMethod === 'DELETE' && workoutLogId) {
      await sql`DELETE FROM workout_logs WHERE id = ${workoutLogId} AND user_id = ${userId}`;
      return { statusCode: 204, headers, body: '' };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error) {
    console.error('Workout logs API error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

export { handler };
